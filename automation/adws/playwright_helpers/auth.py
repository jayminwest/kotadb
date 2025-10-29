"""
Authentication helper for Playwright sessions in ADW workflows.

This module provides functionality to authenticate Playwright browser sessions
using the dev-session endpoint, formatting cookies for Supabase SSR authentication.
"""

import json
import os
from typing import Any, Literal
from urllib.parse import urlparse

import httpx

EnvironmentType = Literal["local", "staging", "production"]


class PlaywrightAuthHelper:
    """
    Helper class for authenticating Playwright sessions via dev-session endpoint.

    Handles session creation, cookie name derivation, and Playwright cookie formatting
    for Supabase SSR authentication in test/development environments.

    Example:
        helper = PlaywrightAuthHelper(web_url="http://localhost:3001", environment="local")
        session = await helper.create_test_session("test@example.com", tier="free")
        cookies = helper.generate_playwright_cookies(session, domain="localhost")
    """

    def __init__(self, web_url: str, environment: EnvironmentType = "local") -> None:
        """
        Initialize authentication helper.

        Args:
            web_url: Base URL of the web application (e.g., http://localhost:3001)
            environment: Environment identifier (local, staging, or production)

        Raises:
            ValueError: If environment is not one of the allowed values
        """
        allowed_envs: tuple[EnvironmentType, ...] = ("local", "staging", "production")
        if environment not in allowed_envs:
            raise ValueError(
                f"Invalid environment '{environment}'. Must be one of {allowed_envs}"
            )

        self.web_url = web_url.rstrip("/")
        self.environment = environment

    async def create_test_session(
        self, email: str, tier: str = "free"
    ) -> dict[str, Any]:
        """
        Create authenticated test session via dev-session endpoint.

        Args:
            email: Email address for test user
            tier: Subscription tier (free, pro, enterprise)

        Returns:
            Session data dict with access_token, refresh_token, and apiKey fields,
            or error dict with error and error_type fields on failure
        """
        url = f"{self.web_url}/auth/dev-session"

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.post(
                    url,
                    json={"email": email, "tier": tier},
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                return {
                    "error": f"HTTP {e.response.status_code}: {e.response.text}",
                    "error_type": "HTTPError",
                }
            except httpx.RequestError as e:
                return {
                    "error": f"Network error: {str(e)}",
                    "error_type": "NetworkError",
                }

    def get_supabase_cookie_name(self) -> str:
        """
        Derive Supabase auth cookie name from environment.

        Returns:
            Cookie name in format sb-{project-ref}-auth-token
            For localhost: sb-localhost-auth-token
            For production: sb-{16-char-ref}-auth-token

        Raises:
            ValueError: If project ref cannot be extracted from Supabase URL
        """
        # Read Supabase URL from environment, default to deriving from web_url
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")

        # If not set, try to infer from web_url for local development
        if not supabase_url and "localhost" in self.web_url:
            return "sb-localhost-auth-token"

        if not supabase_url:
            raise ValueError(
                "NEXT_PUBLIC_SUPABASE_URL not set and cannot infer cookie name"
            )

        # Handle localhost case
        if "localhost" in supabase_url or "127.0.0.1" in supabase_url:
            return "sb-localhost-auth-token"

        # Parse project ref from cloud URL (e.g., https://abcdef.supabase.co)
        parsed = urlparse(supabase_url)
        hostname = parsed.hostname or ""

        if "." in hostname:
            project_ref = hostname.split(".")[0]
            return f"sb-{project_ref}-auth-token"

        raise ValueError(
            f"Cannot extract project ref from Supabase URL: {supabase_url}"
        )

    def generate_playwright_cookies(
        self, session_data: dict[str, Any], domain: str
    ) -> list[dict[str, Any]]:
        """
        Generate Playwright-compatible cookies from session data.

        Args:
            session_data: Session response from dev-session endpoint containing
                         access_token and refresh_token
            domain: Cookie domain (e.g., "localhost" or ".kotadb.app")

        Returns:
            List containing single cookie object with Supabase SSR format

        Example cookie structure:
            {
                "name": "sb-localhost-auth-token",
                "value": '{"access_token":"...","refresh_token":"..."}',
                "domain": "localhost",
                "path": "/",
                "httpOnly": False,
                "secure": False,  # True for non-local environments
                "sameSite": "Lax"
            }
        """
        # Extract tokens from session data
        access_token = session_data.get("access_token", "")
        refresh_token = session_data.get("refresh_token", "")

        # Create cookie value dict and JSON-encode it
        cookie_value_dict = {
            "access_token": access_token,
            "refresh_token": refresh_token,
        }
        cookie_value = json.dumps(cookie_value_dict)

        # Determine security settings based on environment
        is_secure = self.environment != "local"

        # Build Playwright cookie object
        cookie_name = self.get_supabase_cookie_name()
        cookie = {
            "name": cookie_name,
            "value": cookie_value,
            "domain": domain,
            "path": "/",
            "httpOnly": False,  # Must be False for SSR client access
            "secure": is_secure,
            "sameSite": "Lax",
        }

        return [cookie]


async def authenticate_playwright_session(
    email: str,
    tier: str = "free",
    environment: EnvironmentType = "local",
) -> dict[str, Any]:
    """
    Convenience function to authenticate Playwright session in one call.

    Args:
        email: Email address for test user
        tier: Subscription tier (free, pro, enterprise)
        environment: Target environment (local, staging, production)

    Returns:
        Success response with cookies, apiKey, and instructions, or
        error response with success=False and error details

    Example:
        result = await authenticate_playwright_session("test@example.com")
        if result["success"]:
            cookies = result["cookies"]
            api_key = result["apiKey"]
            # Use cookies with Playwright MCP tools
    """
    # Environment URL mapping
    web_urls = {
        "local": "http://localhost:3001",
        "staging": os.getenv("STAGING_WEB_URL", "https://staging.kotadb.app"),
        "production": os.getenv("PRODUCTION_WEB_URL", "https://kotadb.app"),
    }

    web_url = web_urls.get(environment, web_urls["local"])

    try:
        # Create helper and request session
        helper = PlaywrightAuthHelper(web_url=web_url, environment=environment)
        session_data = await helper.create_test_session(email, tier)

        # Check for errors from session creation
        if "error" in session_data:
            return {
                "success": False,
                "error": session_data["error"],
                "error_type": session_data.get("error_type", "Unknown"),
                "context": {
                    "endpoint": f"{web_url}/auth/dev-session",
                    "email": email,
                    "environment": environment,
                },
            }

        # Derive domain from environment
        domain = "localhost" if environment == "local" else ".kotadb.app"

        # Generate cookies
        cookies = helper.generate_playwright_cookies(session_data, domain)

        # Build success response
        return {
            "success": True,
            "cookies": cookies,
            "apiKey": session_data.get("apiKey", ""),
            "instructions": {
                "playwright_mcp": "Use cookies with mcp__playwright__browser_click and related tools",
                "navigate_to": f"{web_url}/dashboard",
                "verify_auth": "Check that page does not redirect to /login",
            },
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": "UnexpectedError",
            "context": {
                "endpoint": f"{web_url}/auth/dev-session",
                "email": email,
                "environment": environment,
            },
        }
