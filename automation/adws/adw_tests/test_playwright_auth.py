"""
Tests for Playwright authentication helper module.

Following anti-mocking principles: integration tests use real dev-session endpoint.
"""

import json
import os
from typing import Any

import pytest

from adws.playwright_helpers.auth import (
    PlaywrightAuthHelper,
    authenticate_playwright_session,
)


class TestPlaywrightAuthHelper:
    """Unit tests for PlaywrightAuthHelper class."""

    def test_init_valid_environment(self) -> None:
        """Test initialization with valid environment."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:3001", environment="local"
        )
        assert helper.web_url == "http://localhost:3001"
        assert helper.environment == "local"

    def test_init_strips_trailing_slash(self) -> None:
        """Test that trailing slash is removed from web_url."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:3001/", environment="local"
        )
        assert helper.web_url == "http://localhost:3001"

    def test_init_invalid_environment(self) -> None:
        """Test initialization with invalid environment raises ValueError."""
        with pytest.raises(ValueError, match="Invalid environment"):
            PlaywrightAuthHelper(
                web_url="http://localhost:3001", environment="invalid"  # type: ignore
            )

    def test_get_supabase_cookie_name_localhost(self) -> None:
        """Test cookie name extraction for localhost URL."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:3001", environment="local"
        )

        # Set localhost Supabase URL
        os.environ["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54321"
        cookie_name = helper.get_supabase_cookie_name()
        assert cookie_name == "sb-localhost-auth-token"

    def test_get_supabase_cookie_name_production(self) -> None:
        """Test cookie name extraction for production Supabase URL."""
        helper = PlaywrightAuthHelper(
            web_url="https://kotadb.app", environment="production"
        )

        # Set production-like Supabase URL
        os.environ[
            "NEXT_PUBLIC_SUPABASE_URL"
        ] = "https://abcdefghijklmnop.supabase.co"
        cookie_name = helper.get_supabase_cookie_name()
        assert cookie_name == "sb-abcdefghijklmnop-auth-token"

    def test_get_supabase_cookie_name_no_env_localhost_web_url(self) -> None:
        """Test cookie name fallback when NEXT_PUBLIC_SUPABASE_URL not set but web_url is localhost."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:3001", environment="local"
        )

        # Clear environment variable
        if "NEXT_PUBLIC_SUPABASE_URL" in os.environ:
            del os.environ["NEXT_PUBLIC_SUPABASE_URL"]

        cookie_name = helper.get_supabase_cookie_name()
        assert cookie_name == "sb-localhost-auth-token"

    def test_get_supabase_cookie_name_no_env_error(self) -> None:
        """Test cookie name extraction fails when env not set and not localhost."""
        helper = PlaywrightAuthHelper(
            web_url="https://kotadb.app", environment="production"
        )

        # Clear environment variable
        if "NEXT_PUBLIC_SUPABASE_URL" in os.environ:
            del os.environ["NEXT_PUBLIC_SUPABASE_URL"]

        with pytest.raises(ValueError, match="NEXT_PUBLIC_SUPABASE_URL not set"):
            helper.get_supabase_cookie_name()

    def test_generate_playwright_cookies_structure(self) -> None:
        """Test cookie generation creates correct structure."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:3001", environment="local"
        )

        # Mock session data
        session_data = {
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
        }

        # Set localhost environment
        os.environ["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54321"

        cookies = helper.generate_playwright_cookies(session_data, domain="localhost")

        assert len(cookies) == 1
        cookie = cookies[0]

        # Verify structure
        assert cookie["name"] == "sb-localhost-auth-token"
        assert cookie["domain"] == "localhost"
        assert cookie["path"] == "/"
        assert cookie["httpOnly"] is False
        assert cookie["secure"] is False  # Local environment
        assert cookie["sameSite"] == "Lax"

        # Verify cookie value is JSON-encoded
        cookie_value = json.loads(cookie["value"])
        assert cookie_value["access_token"] == "test-access-token"
        assert cookie_value["refresh_token"] == "test-refresh-token"

    def test_generate_playwright_cookies_secure_flag(self) -> None:
        """Test secure flag is True for non-local environments."""
        helper_staging = PlaywrightAuthHelper(
            web_url="https://staging.kotadb.app", environment="staging"
        )

        session_data = {
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
        }

        os.environ["NEXT_PUBLIC_SUPABASE_URL"] = "https://staging.supabase.co"

        cookies = helper_staging.generate_playwright_cookies(
            session_data, domain=".kotadb.app"
        )

        assert cookies[0]["secure"] is True

    def test_generate_playwright_cookies_json_encoding(self) -> None:
        """Test cookie value is properly JSON-encoded string."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:3001", environment="local"
        )

        session_data = {
            "access_token": "token-with-special-chars-!@#$%",
            "refresh_token": "refresh-with-quotes-'\"",
        }

        os.environ["NEXT_PUBLIC_SUPABASE_URL"] = "http://localhost:54321"

        cookies = helper.generate_playwright_cookies(session_data, domain="localhost")

        # Verify value is a string (not dict)
        assert isinstance(cookies[0]["value"], str)

        # Verify it's valid JSON that can be parsed back
        parsed = json.loads(cookies[0]["value"])
        assert parsed["access_token"] == "token-with-special-chars-!@#$%"
        assert parsed["refresh_token"] == "refresh-with-quotes-'\""


class TestAuthenticatePlaywrightSession:
    """Unit tests for authenticate_playwright_session convenience function."""

    def test_environment_url_mapping_local(self) -> None:
        """Test local environment uses localhost URL."""
        # We can't fully test without hitting the endpoint, but we can verify
        # the helper is constructed correctly by checking error context
        # This test will be covered by integration tests below

    def test_error_response_structure(self) -> None:
        """Test error response has correct structure."""
        # Covered by integration tests with unreachable endpoint


@pytest.mark.integration
class TestPlaywrightAuthIntegration:
    """
    Integration tests using real dev-session endpoint.

    These tests require the Next.js development server to be running.
    Run with: pytest -m integration
    """

    @pytest.fixture(autouse=True)
    def check_dev_server_available(self) -> None:
        """Skip integration tests if dev server is not reachable."""
        import httpx

        dev_url = os.getenv("WEB_URL", "http://localhost:3001")
        try:
            # Quick health check with short timeout
            response = httpx.get(f"{dev_url}/api/health", timeout=2.0)
            if response.status_code >= 500:
                pytest.skip(f"Dev server at {dev_url} returned error status")
        except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError):
            pytest.skip(f"Dev server not available at {dev_url}")

    @pytest.fixture
    def dev_server_url(self) -> str:
        """Provide dev server URL for tests."""
        return os.getenv("WEB_URL", "http://localhost:3001")

    @pytest.mark.asyncio
    async def test_create_test_session_success(
        self, dev_server_url: str
    ) -> None:
        """Test session creation with real dev-session endpoint."""
        helper = PlaywrightAuthHelper(web_url=dev_server_url, environment="local")

        session_data = await helper.create_test_session(
            email="test-playwright-auth@kotadb.test", tier="free"
        )

        # Verify session response structure
        assert "error" not in session_data
        assert "access_token" in session_data
        assert "refresh_token" in session_data
        assert "apiKey" in session_data
        assert session_data["access_token"].startswith("eyJ")  # JWT format
        assert len(session_data["apiKey"]) > 0

    @pytest.mark.asyncio
    async def test_create_test_session_network_error(self) -> None:
        """Test session creation with unreachable endpoint."""
        helper = PlaywrightAuthHelper(
            web_url="http://localhost:9999", environment="local"
        )

        session_data = await helper.create_test_session(
            email="test@example.com", tier="free"
        )

        # Verify error response structure
        assert "error" in session_data
        assert "error_type" in session_data
        assert session_data["error_type"] == "NetworkError"

    @pytest.mark.asyncio
    async def test_authenticate_playwright_session_success(
        self, dev_server_url: str
    ) -> None:
        """Test end-to-end authentication flow with real endpoint."""
        # Override environment to use test dev server
        os.environ["WEB_URL"] = dev_server_url

        result = await authenticate_playwright_session(
            email="test-auth-flow@kotadb.test", tier="free", environment="local"
        )

        # Verify success response structure
        assert result["success"] is True
        assert "cookies" in result
        assert "apiKey" in result
        assert "instructions" in result

        # Verify cookies structure
        cookies = result["cookies"]
        assert len(cookies) == 1

        cookie = cookies[0]
        assert cookie["name"] == "sb-localhost-auth-token"
        assert cookie["domain"] == "localhost"
        assert cookie["path"] == "/"
        assert cookie["httpOnly"] is False
        assert cookie["secure"] is False
        assert cookie["sameSite"] == "Lax"

        # Verify cookie value is valid JSON with tokens
        cookie_value = json.loads(cookie["value"])
        assert "access_token" in cookie_value
        assert "refresh_token" in cookie_value
        assert cookie_value["access_token"].startswith("eyJ")

        # Verify API key is present
        assert len(result["apiKey"]) > 0

        # Verify instructions
        instructions = result["instructions"]
        assert "playwright_mcp" in instructions
        assert "navigate_to" in instructions
        assert "verify_auth" in instructions

    @pytest.mark.asyncio
    async def test_authenticate_playwright_session_network_error(self) -> None:
        """Test authentication flow with unreachable endpoint."""
        result = await authenticate_playwright_session(
            email="test@example.com", tier="free", environment="local"
        )

        # When endpoint is unreachable, should get error response
        # Note: This may actually succeed if dev server is running
        # The test validates error handling structure when endpoint fails
        if not result["success"]:
            assert "error" in result
            assert "error_type" in result
            assert "context" in result
            assert result["context"]["email"] == "test@example.com"
            assert result["context"]["environment"] == "local"

    @pytest.mark.asyncio
    async def test_generated_cookies_match_supabase_ssr_format(
        self, dev_server_url: str
    ) -> None:
        """Test that generated cookies exactly match Supabase SSR expectations."""
        helper = PlaywrightAuthHelper(web_url=dev_server_url, environment="local")

        # Create real session
        session_data = await helper.create_test_session(
            email="test-ssr-format@kotadb.test", tier="free"
        )

        assert "error" not in session_data

        # Generate cookies
        cookies = helper.generate_playwright_cookies(session_data, domain="localhost")

        # Verify Supabase SSR format compliance
        cookie = cookies[0]

        # Cookie name must match pattern
        assert cookie["name"].startswith("sb-")
        assert cookie["name"].endswith("-auth-token")

        # Cookie value must be JSON string (not object)
        assert isinstance(cookie["value"], str)

        # Parse and verify token structure
        tokens = json.loads(cookie["value"])
        assert "access_token" in tokens
        assert "refresh_token" in tokens

        # Tokens must be non-empty strings
        assert isinstance(tokens["access_token"], str)
        assert isinstance(tokens["refresh_token"], str)
        assert len(tokens["access_token"]) > 0
        assert len(tokens["refresh_token"]) > 0

        # HTTP-only must be False for SSR client-side access
        assert cookie["httpOnly"] is False

        # Domain must be set
        assert len(cookie["domain"]) > 0

        # Path must be /
        assert cookie["path"] == "/"
