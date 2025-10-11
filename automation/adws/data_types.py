"""Backward-compatible shim for the relocated data_types module."""

from adws.adw_modules import data_types as _data_types
from adws.adw_modules.data_types import *  # noqa: F401,F403

__all__ = _data_types.__all__
