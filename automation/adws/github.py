#!/usr/bin/env -S uv run
"""Backward-compatible shim for the relocated github module."""

from adws.adw_modules import github as _github
from adws.adw_modules.github import *  # noqa: F401,F403

__all__ = _github.__all__
