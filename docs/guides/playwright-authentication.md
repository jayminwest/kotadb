# Playwright Authentication Guide for ADW Workflows

## Overview

This guide explains how to authenticate Playwright browser sessions for ADW (AI Developer Workflow) agents that need to test frontend user flows in the KotaDB web application.

## Quick Start

```python
from adws.playwright_helpers.auth import authenticate_playwright_session

async def test_dashboard_flow():
    # Authenticate session
    result = await authenticate_playwright_session(
        email="test-agent@kotadb.test",
        tier="free",
        environment="local"
    )

    if not result["success"]:
        raise Exception(f"Authentication failed: {result['error']}")

    cookies = result["cookies"]
    api_key = result["apiKey"]

    # Use cookies with Playwright MCP tools (see #319)
    # await page.context().addCookies(cookies)
    # await page.goto("http://localhost:3001/dashboard")

    return result
```

## Architecture

The authentication helper bridges three components:

1. **Dev-Session Endpoint** (#317): HTTP API that creates authenticated test sessions
2. **Playwright Helper Module** (#318): Python utilities to format Supabase SSR cookies
3. **Playwright MCP Integration** (#319): Browser automation with authenticated sessions

### Authentication Flow

```
ADW Agent
  ↓
authenticate_playwright_session()
  ↓
HTTP POST /auth/dev-session
  ↓
Supabase createClient() + test_account flag
  ↓
Session tokens (access_token, refresh_token, apiKey)
  ↓
Format as Playwright cookie objects
  ↓
Inject into Playwright browser context
  ↓
Navigate to protected routes
```

## Environment Setup

### Required Environment Variables

For **local development** (default):
```bash
# Optional: defaults to http://localhost:54321
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
```

For **staging**:
```bash
STAGING_WEB_URL=https://staging.kotadb.app
NEXT_PUBLIC_SUPABASE_URL=https://your-staging-project.supabase.co
```

For **production** (restricted):
```bash
PRODUCTION_WEB_URL=https://kotadb.app
NEXT_PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co
```

### Starting Dev Server

Integration tests require the Next.js development server:

```bash
# Terminal 1: Start web application
cd web && bun run dev

# Terminal 2: Run integration tests
cd automation && pytest adws/adw_tests/test_playwright_auth.py -v -m integration
```

## API Reference

### `authenticate_playwright_session()`

Convenience function for one-line authentication.

**Signature:**
```python
async def authenticate_playwright_session(
    email: str,
    tier: str = "free",
    environment: Literal["local", "staging", "production"] = "local"
) -> dict[str, Any]
```

**Arguments:**
- `email`: Email address for test user (will be created if not exists)
- `tier`: Subscription tier (`"free"`, `"pro"`, `"enterprise"`)
- `environment`: Target environment (`"local"`, `"staging"`, `"production"`)

**Returns:**

Success response:
```python
{
    "success": True,
    "cookies": [
        {
            "name": "sb-localhost-auth-token",
            "value": '{"access_token":"eyJ...","refresh_token":"..."}',
            "domain": "localhost",
            "path": "/",
            "httpOnly": False,
            "secure": False,
            "sameSite": "Lax"
        }
    ],
    "apiKey": "kot_xxxxxxxxxxxxx",
    "instructions": {
        "playwright_mcp": "Use cookies with mcp__playwright__browser_click and related tools",
        "navigate_to": "http://localhost:3001/dashboard",
        "verify_auth": "Check that page does not redirect to /login"
    }
}
```

Error response:
```python
{
    "success": False,
    "error": "HTTP 403: Dev-session endpoint restricted to development environments",
    "error_type": "HTTPError",
    "context": {
        "endpoint": "http://localhost:3001/auth/dev-session",
        "email": "test@example.com",
        "environment": "local"
    }
}
```

### `PlaywrightAuthHelper` Class

For advanced use cases requiring custom configuration.

**Example:**
```python
from adws.playwright_helpers.auth import PlaywrightAuthHelper

helper = PlaywrightAuthHelper(
    web_url="http://localhost:3001",
    environment="local"
)

# Create session
session_data = await helper.create_test_session(
    email="test@example.com",
    tier="pro"
)

# Generate cookies
cookies = helper.generate_playwright_cookies(
    session_data,
    domain="localhost"
)
```

**Methods:**

- `create_test_session(email: str, tier: str = "free")`: Call dev-session endpoint
- `get_supabase_cookie_name()`: Derive cookie name from environment
- `generate_playwright_cookies(session_data: dict, domain: str)`: Format cookies

## Supabase SSR Cookie Format

The helper generates cookies matching Supabase SSR expectations:

### Cookie Name Pattern
- **Localhost**: `sb-localhost-auth-token`
- **Cloud**: `sb-{project-ref}-auth-token` (16-char ref from URL)

### Cookie Value Structure
Must be JSON-encoded string (not object):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "refresh-token-value"
}
```

### Cookie Attributes
```python
{
    "domain": "localhost",        # or ".kotadb.app" for production
    "path": "/",
    "httpOnly": False,            # MUST be False for SSR client access
    "secure": False,              # False for localhost, True otherwise
    "sameSite": "Lax"
}
```

## Integration with Playwright MCP

Once authenticated, use the cookies with Playwright MCP tools:

```python
from adws.playwright_helpers.auth import authenticate_playwright_session

async def test_user_flow():
    # Step 1: Authenticate
    auth_result = await authenticate_playwright_session(
        email="test-adw@kotadb.test",
        environment="local"
    )

    if not auth_result["success"]:
        raise Exception(f"Auth failed: {auth_result['error']}")

    cookies = auth_result["cookies"]

    # Step 2: Navigate with MCP (see #319 for implementation)
    # mcp_result = await mcp.call("mcp__playwright__browser_navigate", {
    #     "url": "http://localhost:3001/dashboard"
    # })

    # Step 3: Inject cookies before navigation
    # await mcp.call("mcp__playwright__browser_evaluate", {
    #     "function": f"() => {{ document.cookie = '{cookies[0]['name']}={cookies[0]['value']}' }}"
    # })

    # Step 4: Interact with authenticated page
    # await mcp.call("mcp__playwright__browser_click", {
    #     "element": "Repositories tab",
    #     "ref": "tab-repositories"
    # })

    return auth_result
```

## Troubleshooting

### Error: "NEXT_PUBLIC_SUPABASE_URL not set"

**Cause**: Cookie name derivation requires Supabase URL.

**Fix**: Set environment variable:
```bash
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
```

Or use localhost web URL (auto-infers):
```python
helper = PlaywrightAuthHelper(
    web_url="http://localhost:3001",  # Will use sb-localhost-auth-token
    environment="local"
)
```

### Error: "Network error: Connection refused"

**Cause**: Dev server not running.

**Fix**: Start Next.js development server:
```bash
cd web && bun run dev
```

Verify endpoint is reachable:
```bash
curl -X POST http://localhost:3001/auth/dev-session \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","tier":"free"}'
```

### Error: "HTTP 403: Dev-session endpoint restricted"

**Cause**: Endpoint only works in development environments.

**Fix**: Ensure environment guards are satisfied:
- `NODE_ENV !== 'production'`
- `VERCEL_ENV !== 'production'`

For local testing:
```bash
export NODE_ENV=development
```

### Error: "Invalid environment"

**Cause**: Environment parameter must be `"local"`, `"staging"`, or `"production"`.

**Fix**: Use valid environment:
```python
result = await authenticate_playwright_session(
    email="test@example.com",
    environment="local"  # Not "dev" or "development"
)
```

### Cookies not persisting in Playwright

**Cause**: Cookie domain mismatch or httpOnly flag incorrect.

**Verification**:
1. Check cookie domain matches page domain
2. Verify `httpOnly: False` (required for SSR)
3. Confirm cookie value is JSON string (not object)

```python
cookie = result["cookies"][0]
assert cookie["httpOnly"] is False
assert isinstance(cookie["value"], str)
assert cookie["domain"] == "localhost"
```

## Security Notes

### Development-Only Feature

The dev-session endpoint has strict production guards:
- Requires `NODE_ENV !== 'production'`
- Requires `VERCEL_ENV !== 'production'`
- Intended for testing and development ONLY

### Test Account Flagging

All sessions created via dev-session are marked with `test_account: true` in metadata:
- Allows cleanup of test data
- Excludes from analytics and billing
- Identifies automation-generated users

### API Key Exposure

The helper returns API keys in plain text for testing. In production workflows:
- Store API keys in secure environment variables
- Use secret management services (not dev-session)
- Rotate keys regularly

## Related Documentation

- **Dev-Session Endpoint**: `docs/specs/feature-317-dev-session-endpoint.md`
- **Playwright MCP Integration**: Issue #319 (implementation guide)
- **Anti-Mocking Testing**: `.claude/commands/docs/anti-mock.md`
- **ADW Architecture**: `automation/adws/README.md`

## Examples

### Basic Authentication Test
```python
import pytest
from adws.playwright_helpers.auth import authenticate_playwright_session

@pytest.mark.asyncio
async def test_basic_auth():
    result = await authenticate_playwright_session("test@example.com")
    assert result["success"]
    assert len(result["cookies"]) == 1
    assert result["apiKey"].startswith("kot_")
```

### Custom Tier and Environment
```python
result = await authenticate_playwright_session(
    email="pro-user@kotadb.test",
    tier="pro",
    environment="staging"
)
```

### Error Handling
```python
result = await authenticate_playwright_session("test@example.com")

if not result["success"]:
    error_type = result["error_type"]
    error_msg = result["error"]

    if error_type == "NetworkError":
        # Dev server not running
        raise Exception("Start dev server: cd web && bun run dev")
    elif error_type == "HTTPError":
        # Endpoint returned error
        raise Exception(f"Endpoint error: {error_msg}")
    else:
        raise Exception(f"Unexpected error: {error_msg}")
```

### Multi-Tier Testing
```python
async def test_all_tiers():
    tiers = ["free", "pro", "enterprise"]

    for tier in tiers:
        result = await authenticate_playwright_session(
            email=f"test-{tier}@kotadb.test",
            tier=tier
        )

        assert result["success"]
        # Verify tier-specific features...
```
