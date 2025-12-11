"""Persistent state helpers for ADW workflows."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
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

        extra = {key: value for key, value in data.items() if key not in {"adw_id", "issue_number", "branch_name", "plan_file", "issue_class", "worktree_name", "worktree_path", "worktree_created_at", "test_project_name", "pr_created", "auto_merge_enabled", "merge_status", "merge_timestamp"}}

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

    @classmethod
    def find_by_issue(cls, issue_number: str) -> Optional["ADWState"]:
        """Find latest ADW state for given issue number.

        Args:
            issue_number: GitHub issue number to search for

        Returns:
            Most recent ADWState matching the issue number, or None if not found

        Note:
            Returns the most recently modified state file when multiple matches exist.
        """
        agents_dir = agents_root()
        matching_states: list[tuple[ADWState, float]] = []

        for state_file in agents_dir.glob("*/adw_state.json"):
            try:
                adw_id = state_file.parent.name
                state = cls.load(adw_id)
                if state.issue_number == issue_number:
                    mtime = state_file.stat().st_mtime
                    matching_states.append((state, mtime))
            except (StateNotFoundError, json.JSONDecodeError, OSError) as exc:
                logger.debug(f"Skipping invalid state file {state_file}: {exc}")
                continue

        if not matching_states:
            return None

        # Return most recent state
        return max(matching_states, key=lambda x: x[1])[0]


def ensure_adw_id(existing: str | None = None) -> str:
    """Return an existing ADW id or generate a new one."""

    if existing:
        return existing
    return make_adw_id()


__all__ = [
    "ADWState",
    "STATE_FILENAME",
    "StateNotFoundError",
    "agents_root",
    "ensure_adw_id",
    "state_path",
]
