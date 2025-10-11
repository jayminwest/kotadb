#!/usr/bin/env -S uv run python3
"""Backward-compatible shim for the relocated ts_helpers module."""

from adws.adw_modules import ts_commands as _ts_commands
from adws.adw_modules.ts_commands import *  # noqa: F401,F403

__all__ = _ts_commands.__all__
