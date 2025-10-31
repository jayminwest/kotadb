"""Persistent state helpers for ADW workflows."""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from .utils import make_adw_id, project_root

logger = logging.getLogger(__name__)

STATE_FILENAME = "adw_state.json"


def agents_root() -> Path:
    """Base directory for per-agent state and logs."""

    return project_root() / "automation" / "agents"


def state_path(adw_id: str) -> Path:
    """Path to the JSON state file for a given ADW id."""

    return agents_root() / adw_id / STATE_FILENAME


class StateNotFoundError(FileNotFoundError):
    """Raised when state is requested for an ADW id that has not been initialised."""


@dataclass
class ADWState:
    """Simple JSON-backed state container for ADW workflows.

    Resolution tracking fields (stored in extra):
        - last_resolution_attempts: JSON string of resolution history for debugging
        - validation_retry_count: Number of validation retry attempts performed
        - beads_issue_id: Beads issue ID for tracking (e.g., kota-db-ts-303)
        - beads_sync: Sync metadata (last_sync, source, beads_available)
        - auto_merge_enabled: Auto-merge enabled for PR (default: False)
        - merge_status: Merge status (pending, success, failed, conflict)
        - merge_timestamp: Timestamp when merge status was updated
    """

    adw_id: str
    issue_number: Optional[str] = None
    branch_name: Optional[str] = None
    plan_file: Optional[str] = None
    issue_class: Optional[str] = None
    worktree_name: Optional[str] = None
    worktree_path: Optional[str] = None
    worktree_created_at: Optional[str] = None
    test_project_name: Optional[str] = None
    pr_created: Optional[bool] = None
    beads_issue_id: Optional[str] = None
    beads_sync: Optional[Dict[str, Any]] = None
    auto_merge_enabled: Optional[bool] = None
    merge_status: Optional[str] = None
    merge_timestamp: Optional[float] = None
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def base_dir(self) -> Path:
        return agents_root() / self.adw_id

    @property
    def json_path(self) -> Path:
        return self.base_dir / STATE_FILENAME

    def to_dict(self) -> Dict[str, Any]:
        payload = {
            "adw_id": self.adw_id,
            "issue_number": self.issue_number,
            "branch_name": self.branch_name,
            "plan_file": self.plan_file,
            "issue_class": self.issue_class,
            "worktree_name": self.worktree_name,
            "worktree_path": self.worktree_path,
            "worktree_created_at": self.worktree_created_at,
            "test_project_name": self.test_project_name,
            "pr_created": self.pr_created,
            "beads_issue_id": self.beads_issue_id,
            "beads_sync": self.beads_sync,
            "auto_merge_enabled": self.auto_merge_enabled,
            "merge_status": self.merge_status,
            "merge_timestamp": self.merge_timestamp,
        }
        payload.update(self.extra)
        return {key: value for key, value in payload.items() if value is not None}

    def save(self, *_: Any) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)
        with open(self.json_path, "w", encoding="utf-8") as handle:
            json.dump(self.to_dict(), handle, indent=2, sort_keys=True)

    @classmethod
    def load(cls, adw_id: str, create: bool = False) -> "ADWState":
        path = state_path(adw_id)
        if not path.exists():
            if create:
                state = cls(adw_id=adw_id)
                state.save()
                return state
            raise StateNotFoundError(f"No state found for ADW id '{adw_id}' at {path}")

        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)

        extra = {key: value for key, value in data.items() if key not in {"adw_id", "issue_number", "branch_name", "plan_file", "issue_class", "worktree_name", "worktree_path", "worktree_created_at", "test_project_name", "pr_created", "beads_issue_id", "beads_sync", "auto_merge_enabled", "merge_status", "merge_timestamp"}}

        return cls(
            adw_id=data.get("adw_id", adw_id),
            issue_number=data.get("issue_number"),
            branch_name=data.get("branch_name"),
            plan_file=data.get("plan_file"),
            issue_class=data.get("issue_class"),
            worktree_name=data.get("worktree_name"),
            worktree_path=data.get("worktree_path"),
            worktree_created_at=data.get("worktree_created_at"),
            test_project_name=data.get("test_project_name"),
            pr_created=data.get("pr_created"),
            beads_issue_id=data.get("beads_issue_id"),
            beads_sync=data.get("beads_sync"),
            auto_merge_enabled=data.get("auto_merge_enabled"),
            merge_status=data.get("merge_status"),
            merge_timestamp=data.get("merge_timestamp"),
            extra=extra,
        )

    def update(self, persist: bool = True, **kwargs: Any) -> None:
        for key, value in kwargs.items():
            if key in {"adw_id"}:
                continue
            if hasattr(self, key):
                setattr(self, key, value)
            else:
                self.extra[key] = value
        if persist:
            self.save()

    def get(self, key: str, default: Any = None) -> Any:
        if hasattr(self, key):
            return getattr(self, key)
        return self.extra.get(key, default)

    def as_dict(self) -> Dict[str, Any]:
        return self.to_dict()

    def setdefault(self, key: str, default: Any) -> Any:
        current = self.get(key)
        if current is None:
            self.update(**{key: default})
            return default
        return current

    @property
    def data(self) -> Dict[str, Any]:
        return self.to_dict()

    def get_phase_metrics(self, phase_name: str) -> Optional[Any]:
        """Retrieve metrics for a specific phase.

        Args:
            phase_name: Phase identifier (e.g., "adw_plan", "adw_build")

        Returns:
            PhaseMetrics dict if found, None otherwise
        """
        metrics = self.extra.get("metrics", {})
        phases = metrics.get("phases", [])
        for phase in phases:
            if phase.get("phase_name") == phase_name:
                return phase
        return None

    def set_phase_metrics(self, phase_name: str, metrics: Any) -> None:
        """Store metrics for a specific phase.

        Args:
            phase_name: Phase identifier (e.g., "adw_plan", "adw_build")
            metrics: PhaseMetrics object or dict to store
        """
        # Convert Pydantic model to dict if needed
        metrics_dict = metrics.model_dump(mode="json") if hasattr(metrics, "model_dump") else metrics

        # Get or create metrics structure
        all_metrics = self.extra.get("metrics", {})
        phases = all_metrics.get("phases", [])

        # Remove existing metrics for this phase
        phases = [p for p in phases if p.get("phase_name") != phase_name]

        # Add new metrics
        phases.append(metrics_dict)

        # Update extra dict
        all_metrics["phases"] = phases
        self.extra["metrics"] = all_metrics
        self.save()

    def get_workflow_metrics(self) -> Optional[Dict[str, Any]]:
        """Retrieve workflow-level metrics.

        Returns:
            WorkflowMetrics dict if present, None otherwise
        """
        return self.extra.get("metrics")

    def set_workflow_metrics(self, metrics: Any) -> None:
        """Store workflow-level metrics.

        Args:
            metrics: WorkflowMetrics object or dict to store
        """
        # Convert Pydantic model to dict if needed
        metrics_dict = metrics.model_dump(mode="json") if hasattr(metrics, "model_dump") else metrics
        self.extra["metrics"] = metrics_dict
        self.save()

    def update_merge_status(self, status: str) -> None:
        """Update merge status and timestamp.

        Args:
            status: Merge status (pending, success, failed, conflict)
        """
        self.update(merge_status=status, merge_timestamp=time.time())

    def is_auto_merge_enabled(self) -> bool:
        """Check if auto-merge is enabled for this workflow.

        Returns:
            True if auto-merge is enabled, False otherwise
        """
        return self.auto_merge_enabled is True


def ensure_adw_id(existing: str | None = None) -> str:
    """Return an existing ADW id or generate a new one."""

    if existing:
        return existing
    return make_adw_id()


class BeadsStateManager:
    """Database-backed state manager for ADW workflows.

    Replaces JSON file persistence with SQLite database writes for improved
    observability and SQL-based analytics. Integrates with beads database
    for unified issue + execution tracking.

    Features:
        - Transactional writes for atomicity
        - Retry logic for database lock errors (exponential backoff)
        - Foreign key relationships to beads issues
        - Checkpoint persistence for workflow recovery

    Usage:
        manager = BeadsStateManager()
        manager.create_execution(
            adw_id="abc-123",
            issue_id="kota-303",
            phase="plan"
        )
        manager.update_execution_status("abc-123", "completed")
        manager.save_checkpoint("abc-123", "plan", "pre_validation", {"key": "value"})
    """

    def __init__(self, db_path: Optional[Path] = None):
        """Initialize BeadsStateManager.

        Args:
            db_path: Custom database path (default: .beads/beads.db)
        """
        if db_path:
            self.db_path = Path(db_path)
        else:
            self.db_path = project_root() / ".beads" / "beads.db"

        if not self.db_path.exists():
            raise FileNotFoundError(
                f"Beads database not found at {self.db_path}. "
                "Initialize beads first or check database path."
            )

    def _get_connection(self) -> sqlite3.Connection:
        """Get database connection with row factory.

        Returns:
            SQLite connection with row_factory set
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        # Enable foreign key constraints (not enabled by default in SQLite)
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _execute_with_retry(
        self, operation: str, func: callable, max_retries: int = 3
    ) -> Any:
        """Execute database operation with exponential backoff retry.

        Args:
            operation: Operation description for logging
            func: Callable that performs database operation
            max_retries: Maximum number of retry attempts

        Returns:
            Result from func

        Raises:
            sqlite3.Error: If operation fails after all retries
        """
        delays = [1, 3, 5]  # Exponential backoff delays in seconds

        for attempt in range(max_retries):
            try:
                return func()
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e).lower():
                    if attempt < max_retries - 1:
                        delay = delays[attempt]
                        logger.warning(
                            f"{operation} failed (database locked), "
                            f"retrying in {delay}s (attempt {attempt + 1}/{max_retries})"
                        )
                        time.sleep(delay)
                        continue
                raise

        # Should not reach here, but for type safety
        raise sqlite3.OperationalError(f"{operation} failed after {max_retries} retries")

    def create_execution(
        self,
        adw_id: str,
        phase: str,
        issue_id: Optional[str] = None,
        status: str = "pending",
        worktree_name: Optional[str] = None,
        worktree_path: Optional[str] = None,
        branch_name: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create new ADW execution record.

        Args:
            adw_id: Unique ADW identifier
            phase: Workflow phase (plan, build, review)
            issue_id: Beads issue ID (optional foreign key)
            status: Initial status (default: pending)
            worktree_name: Worktree name for isolated execution
            worktree_path: Worktree absolute path
            branch_name: Git branch name
            extra_data: Additional metadata as dict

        Raises:
            sqlite3.IntegrityError: If execution already exists or invalid foreign key
        """

        def _insert():
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO adw_executions (
                        id, issue_id, phase, status, worktree_name,
                        worktree_path, branch_name, extra_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        adw_id,
                        issue_id,
                        phase,
                        status,
                        worktree_name,
                        worktree_path,
                        branch_name,
                        json.dumps(extra_data) if extra_data else None,
                    ),
                )
                conn.commit()
                logger.info(f"Created execution record for {adw_id} (phase={phase})")
            finally:
                conn.close()

        self._execute_with_retry(f"create_execution({adw_id})", _insert)

    def update_execution_status(
        self,
        adw_id: str,
        status: str,
        error_message: Optional[str] = None,
        phase: Optional[str] = None,
        pr_created: Optional[bool] = None,
    ) -> None:
        """Update execution status and completion timestamp.

        Args:
            adw_id: ADW identifier
            status: New status (pending, in_progress, completed, failed)
            error_message: Error details for failed executions
            phase: Update phase if provided
            pr_created: Update PR creation flag if provided

        Raises:
            ValueError: If execution not found
        """

        def _update():
            conn = self._get_connection()
            try:
                cursor = conn.cursor()

                # Build dynamic update query
                updates = ["status = ?"]
                params: list = [status]

                if status in ("completed", "failed"):
                    updates.append("completed_at = ?")
                    params.append(datetime.now().isoformat())

                if error_message is not None:
                    updates.append("error_message = ?")
                    params.append(error_message)

                if phase is not None:
                    updates.append("phase = ?")
                    params.append(phase)

                if pr_created is not None:
                    updates.append("pr_created = ?")
                    params.append(1 if pr_created else 0)

                params.append(adw_id)

                query = f"UPDATE adw_executions SET {', '.join(updates)} WHERE id = ?"
                cursor.execute(query, params)

                if cursor.rowcount == 0:
                    raise ValueError(f"Execution {adw_id} not found")

                conn.commit()
                logger.info(f"Updated execution {adw_id} status to {status}")
            finally:
                conn.close()

        self._execute_with_retry(f"update_execution_status({adw_id})", _update)

    def save_checkpoint(
        self, adw_id: str, phase: str, checkpoint_name: str, checkpoint_data: Dict[str, Any]
    ) -> None:
        """Save checkpoint for workflow recovery.

        Args:
            adw_id: ADW identifier
            phase: Workflow phase when checkpoint created
            checkpoint_name: Checkpoint identifier
            checkpoint_data: Checkpoint state as dict

        Raises:
            sqlite3.IntegrityError: If execution not found (foreign key violation)
        """

        def _insert():
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO adw_checkpoints (
                        execution_id, phase, checkpoint_name, checkpoint_data
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (adw_id, phase, checkpoint_name, json.dumps(checkpoint_data)),
                )
                conn.commit()
                logger.info(
                    f"Saved checkpoint '{checkpoint_name}' for {adw_id} (phase={phase})"
                )
            finally:
                conn.close()

        self._execute_with_retry(f"save_checkpoint({adw_id})", _insert)

    def load_checkpoint(
        self, adw_id: str, checkpoint_name: str
    ) -> Optional[Dict[str, Any]]:
        """Load checkpoint data for recovery.

        Args:
            adw_id: ADW identifier
            checkpoint_name: Checkpoint identifier

        Returns:
            Checkpoint data dict if found, None otherwise
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT checkpoint_data FROM adw_checkpoints
                WHERE execution_id = ? AND checkpoint_name = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (adw_id, checkpoint_name),
            )
            row = cursor.fetchone()

            if not row:
                return None

            data = json.loads(row["checkpoint_data"])
            logger.info(f"Loaded checkpoint '{checkpoint_name}' for {adw_id}")
            return data
        finally:
            conn.close()

    def get_execution(self, adw_id: str) -> Optional[Dict[str, Any]]:
        """Get execution record.

        Args:
            adw_id: ADW identifier

        Returns:
            Execution record as dict if found, None otherwise
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM adw_executions WHERE id = ?",
                (adw_id,),
            )
            row = cursor.fetchone()

            if not row:
                return None

            result = dict(row)
            # Parse JSON extra_data if present
            if result.get("extra_data"):
                result["extra_data"] = json.loads(result["extra_data"])
            return result
        finally:
            conn.close()

    def check_health(self) -> bool:
        """Check database connection health.

        Returns:
            True if database accessible, False otherwise
        """
        try:
            conn = self._get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT 1")
                cursor.fetchone()
                return True
            finally:
                conn.close()
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False


__all__ = [
    "ADWState",
    "BeadsStateManager",
    "STATE_FILENAME",
    "StateNotFoundError",
    "agents_root",
    "ensure_adw_id",
    "state_path",
]
