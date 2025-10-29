"""
Playwright authentication helpers for ADW workflows.

This module provides utilities to authenticate Playwright browser sessions
against the KotaDB web application for testing and automation workflows.

Main exports:
- PlaywrightAuthHelper: Class for managing test session authentication
- authenticate_playwright_session: Convenience function for one-line auth
"""

from .auth import PlaywrightAuthHelper, authenticate_playwright_session

__all__ = ["PlaywrightAuthHelper", "authenticate_playwright_session"]
