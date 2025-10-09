"""Backward-compatible shim for the relocated agent module."""

from adws.adw_modules import agent as _agent
from adws.adw_modules.agent import *  # noqa: F401,F403

__all__ = _agent.__all__
