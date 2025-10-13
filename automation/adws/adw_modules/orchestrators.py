"""Helpers for running composite ADW workflows."""

from __future__ import annotations

import os
import subprocess
from typing import Sequence


class PhaseExecutionError(RuntimeError):
    """Raised when a workflow phase exits with a non-zero status."""

    def __init__(self, script: str, returncode: int) -> None:
        super().__init__(f"{script} failed with exit code {returncode}")
        self.script = script
        self.returncode = returncode


def run_phase(script: str, issue_number: str, adw_id: str, env: dict[str, str] | None = None) -> None:
    """Run a single workflow phase script via uv."""

    cmd = ["uv", "run", f"adws/{script}", issue_number, adw_id]
    result = subprocess.run(cmd, env=env or os.environ.copy())
    if result.returncode != 0:
        raise PhaseExecutionError(script, result.returncode)


def run_sequence(
    scripts: Sequence[str],
    issue_number: str,
    adw_id: str,
    logger,
    env: dict[str, str] | None = None,
) -> None:
    """Run each script in order, stopping on the first failure."""

    for script in scripts:
        logger.info(f"Running {script}")
        run_phase(script, issue_number, adw_id, env=env)


__all__ = ["PhaseExecutionError", "run_phase", "run_sequence"]
