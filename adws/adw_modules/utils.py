"""Shared utilities for AI developer workflows."""

from __future__ import annotations

import logging
import os
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv

PROJECT_NAME = "kota-db-ts"
DEFAULT_ENV = (os.environ.get("ADW_ENV", "local") or "local").strip()

DEFAULT_ADW_ENV_FILENAMES = (
    "adws/.env",
    "adws/.env.local",
    ".env.adws",
    ".env.adws.local",
)

# Environments that may be used by sandboxed agents; higher environments should be gated.
SANDBOX_ENVIRONMENTS = {"local", "staging"}
RESTRICTED_ENVIRONMENTS = {"production"}


def project_root() -> Path:
    """Return the repository root based on this file's location."""

    return Path(__file__).resolve().parents[2]


def _resolve_env_path(path: Path) -> Path:
    """Resolve environment file paths relative to the project root."""

    if path.is_absolute():
        return path
    return project_root() / path


def load_adw_env() -> None:
    """Load shared and ADW-specific dotenv files with ADW values taking precedence."""

    root_env = project_root() / ".env"
    load_dotenv(root_env, override=False)

    override = os.getenv("ADW_ENV_FILE", "").strip()
    if override:
        candidates = [
            _resolve_env_path(Path(entry.strip()).expanduser())
            for entry in override.split(os.pathsep)
            if entry.strip()
        ]
    else:
        candidates = [_resolve_env_path(Path(name)) for name in DEFAULT_ADW_ENV_FILENAMES]

    for env_path in candidates:
        if env_path.is_file():
            load_dotenv(env_path, override=True)


def logs_root() -> Path:
    """Root directory where automation log files are written."""

    override = os.environ.get("ADW_LOG_ROOT")
    base = Path(override) if override else project_root() / "logs"
    return base / PROJECT_NAME


def run_logs_dir(run_id: str, env: str | None = None) -> Path:
    """Return the base directory for logs tied to a specific automation run."""

    env_name = ((env or DEFAULT_ENV) or "local").lower()
    return logs_root() / env_name / run_id


def credential_scope(env: str | None = None) -> str:
    """Map an environment name to the suffix used for scoped credentials."""

    env_name = (env or DEFAULT_ENV).strip().upper()
    return env_name or "LOCAL"


def make_adw_id() -> str:
    """Generate an 8-character run identifier."""

    return str(uuid.uuid4())[:8]


def setup_logger(adw_id: str, trigger_type: str = "adw_plan_build", env: str | None = None) -> logging.Logger:
    """Configure a logger that writes to both stdout and the run log directory."""

    log_dir = run_logs_dir(adw_id, env) / trigger_type
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "execution.log"

    logger = logging.getLogger(f"adw_{adw_id}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    file_handler = logging.FileHandler(log_file, mode="a", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter("%(message)s"))

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    logger.info(f"ADW Logger initialized - ID: {adw_id}")
    logger.debug(f"Log file: {log_file}")

    return logger


def get_logger(adw_id: str) -> logging.Logger:
    """Return an existing run logger."""

    return logging.getLogger(f"adw_{adw_id}")


__all__ = [
    "DEFAULT_ADW_ENV_FILENAMES",
    "DEFAULT_ENV",
    "PROJECT_NAME",
    "RESTRICTED_ENVIRONMENTS",
    "SANDBOX_ENVIRONMENTS",
    "credential_scope",
    "get_logger",
    "load_adw_env",
    "logs_root",
    "make_adw_id",
    "project_root",
    "run_logs_dir",
    "setup_logger",
]
