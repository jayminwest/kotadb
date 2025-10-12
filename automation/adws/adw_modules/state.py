"""Persistent state helpers for ADW workflows."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from .utils import make_adw_id, project_root

STATE_FILENAME = "adw_state.json"


def agents_root() -> Path:
    """Base directory for per-agent state and logs."""

    return project_root() / "agents"


def state_path(adw_id: str) -> Path:
    """Path to the JSON state file for a given ADW id."""

    return agents_root() / adw_id / STATE_FILENAME


class StateNotFoundError(FileNotFoundError):
    """Raised when state is requested for an ADW id that has not been initialised."""


@dataclass
class ADWState:
    """Simple JSON-backed state container for ADW workflows."""

    adw_id: str
    issue_number: Optional[str] = None
    branch_name: Optional[str] = None
    plan_file: Optional[str] = None
    issue_class: Optional[str] = None
    worktree_name: Optional[str] = None
    worktree_path: Optional[str] = None
    worktree_created_at: Optional[str] = None
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

        extra = {key: value for key, value in data.items() if key not in {"adw_id", "issue_number", "branch_name", "plan_file", "issue_class", "worktree_name", "worktree_path", "worktree_created_at"}}

        return cls(
            adw_id=data.get("adw_id", adw_id),
            issue_number=data.get("issue_number"),
            branch_name=data.get("branch_name"),
            plan_file=data.get("plan_file"),
            issue_class=data.get("issue_class"),
            worktree_name=data.get("worktree_name"),
            worktree_path=data.get("worktree_path"),
            worktree_created_at=data.get("worktree_created_at"),
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
