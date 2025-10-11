"""Backward-compatible shim for the relocated utils module."""

from adws.adw_modules import utils as _utils
from adws.adw_modules.utils import *  # noqa: F401,F403

__all__ = _utils.__all__
