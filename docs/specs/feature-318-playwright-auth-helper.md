# Feature Plan: Playwright Authentication Helper Module for ADW Workflows

**Issue**: #318
**Title**: feat: create Playwright authentication helper module for ADW workflows
**Component**: testing, automation
**Priority**: medium
**Effort**: medium

## Overview

### Problem
ADW agents need to authenticate Playwright browser sessions against the KotaDB web application for testing frontend user flows. Currently, there is no Python helper module that bridges the dev-session endpoint with Playwright MCP browser automation. Agents must manually construct HTTP requests and format Supabase SSR cookies, which is error-prone and duplicates logic across workflows.

### Desired Outcome
A reusable Python authentication helper module that enables ADW agents to authenticate Playwright sessions with a single function call. The module handles session creation, cookie formatting, and environment-aware configuration, returning Playwright-compatible cookie objects ready for MCP browser automation.

### Non-Goals
- Implementing actual Playwright MCP integration (that's #319)
- Replacing the dev-session endpoint (uses #317 as foundation)
- Supporting production authentication bypass (inherits dev-session guards)
- Managing cookie persistence or refresh workflows

## Technical Approach

### Architecture Notes
- Python module at `automation/adws/playwright_helpers/auth.py` provides programmatic access to dev-session endpoint
- `PlaywrightAuthHelper` class encapsulates session creation and cookie formatting logic
- Supabase SSR cookie format requires JSON-encoded token pairs with project-ref-based naming
- Environment awareness maps to dev-session endpoint URLs (local/staging/production)
- Convenience function `authenticate_playwright_session()` provides one-line authentication for simple use cases

### Key Modules to Touch
- `automation/adws/playwright_helpers/__init__.py` (NEW) — Package initialization with public exports
- `automation/adws/playwright_helpers/auth.py` (NEW) — Core authentication helper class and functions
- `automation/pyproject.toml` — Add httpx dependency for async HTTP client
- `automation/adws/README.md` (reference) — Document new helper module in ADW architecture

### Data/API Impacts
- Calls `POST /auth/dev-session` endpoint from #317
- No database changes (consumes existing API)
- Cookie format must match Supabase SSR expectations for Next.js middleware
- Environment URL mapping requires configuration via environment variables

## Relevant Files

### New Files
- `automation/adws/playwright_helpers/__init__.py` — Package exports for `PlaywrightAuthHelper` and `authenticate_playwright_session`
- `automation/adws/playwright_helpers/auth.py` — Core implementation with async session creation and cookie formatting
- `automation/adws/adw_tests/test_playwright_auth.py` — Unit and integration tests with real dev-session endpoint
- `docs/guides/playwright-authentication.md` — Usage guide for ADW agents with examples

### Modified Files
- `automation/pyproject.toml` — Add httpx>=0.27.0 dependency (already exists, verify version)
- `automation/adws/README.md` — Document playwright_helpers module in architecture section

## Task Breakdown

### Phase 1: Module Scaffolding
- Create directory `automation/adws/playwright_helpers/`
- Create `__init__.py` with public API exports
- Create `auth.py` with class and function stubs
- Add docstrings documenting API contracts

### Phase 2: Session Creation Logic
- Implement `PlaywrightAuthHelper.__init__()` with environment configuration
- Implement `create_test_session()` to call dev-session endpoint with httpx
- Add error handling for network failures and endpoint errors
- Parse session response and extract tokens

### Phase 3: Cookie Formatting
- Implement `get_supabase_cookie_name()` to derive project-ref from environment
- Implement `generate_playwright_cookies()` to format Supabase SSR cookies
- Handle JSON encoding of cookie values
- Configure domain, secure, sameSite attributes per environment

### Phase 4: Convenience Function
- Implement standalone `authenticate_playwright_session()` function
- Add environment URL mapping with defaults
- Structure response with success flag, cookies, API key, and usage instructions
- Include error details in response for debugging

### Phase 5: Testing & Documentation
- Write unit tests for cookie name extraction and formatting
- Write integration tests with real dev-session endpoint (requires Supabase Local)
- Add usage examples in docstrings
- Create guide document with ADW workflow examples
- Validate against anti-mocking standards (real endpoint, no mocks)

## Step by Step Tasks

### Directory Setup
1. Create directory `automation/adws/playwright_helpers/`
2. Create empty `__init__.py` file
3. Create `auth.py` file with module docstring
4. Add imports: `httpx`, `json`, `os`, `typing`, `urllib.parse`

### PlaywrightAuthHelper Class
5. Define `PlaywrightAuthHelper` class with docstring
6. Implement `__init__(web_url: str, environment: str = "local")` constructor
7. Add environment validation (local/staging/production)
8. Store web_url and environment as instance attributes

### Session Creation
9. Implement async `create_test_session(email: str, tier: str = "free")` method
10. Use `httpx.AsyncClient()` to POST to `/auth/dev-session` endpoint
11. Set headers: `Content-Type: application/json`
12. Send request body with email and tier
13. Handle HTTP errors with try/except and return structured error response
14. Parse JSON response and return session data

### Cookie Name Extraction
15. Implement `get_supabase_cookie_name()` method
16. Read `NEXT_PUBLIC_SUPABASE_URL` from environment (default from web_url)
17. Parse URL to extract project ref (handle localhost vs cloud URLs)
18. Return cookie name in format `sb-{project-ref}-auth-token`
19. Handle localhost special case: `sb-localhost-auth-token`

### Cookie Formatting
20. Implement `generate_playwright_cookies(session_data: dict, domain: str)` method
21. Extract access_token and refresh_token from session_data
22. Create cookie value dict with both tokens
23. JSON-encode the cookie value (important: must be string, not dict)
24. Create Playwright cookie object with name, value, domain, path, httpOnly, secure, sameSite
25. Set secure=True for non-local environments, secure=False for localhost
26. Return list containing single cookie object

### Convenience Function
27. Define standalone async function `authenticate_playwright_session(email, tier, environment)`
28. Create environment URL mapping dict (local: localhost:3001, staging: env var, production: env var)
29. Instantiate `PlaywrightAuthHelper` with appropriate URL
30. Call `create_test_session()` and await result
31. Extract domain from environment (localhost for local, domain from URL otherwise)
32. Call `generate_playwright_cookies()` with session data and domain
33. Structure response dict with success, cookies, apiKey, instructions fields
34. Add usage instructions for Playwright MCP tools
35. Handle errors and return error response with success=False

### Package Exports
36. Update `__init__.py` to export `PlaywrightAuthHelper` and `authenticate_playwright_session`
37. Add `__all__` list with public API
38. Add package-level docstring

### Unit Tests
39. Create test file `automation/adws/adw_tests/test_playwright_auth.py`
40. Test cookie name extraction for localhost URL
41. Test cookie name extraction for production Supabase URL
42. Test cookie formatting with mock session data
43. Test cookie attributes (secure, sameSite, httpOnly) per environment
44. Test JSON encoding of cookie value

### Integration Tests
45. Add pytest fixture for starting/stopping Next.js dev server (or assume running)
46. Test `create_test_session()` with real dev-session endpoint
47. Verify session response contains access_token and refresh_token
48. Test `authenticate_playwright_session()` convenience function end-to-end
49. Verify returned cookies have correct format and attributes
50. Test error handling when dev-session endpoint returns error
51. Test environment guard (production environment should fail)

### Documentation
52. Add module usage examples to auth.py docstrings
53. Create `docs/guides/playwright-authentication.md` guide document
54. Document environment setup requirements (NEXT_PUBLIC_SUPABASE_URL)
55. Add example ADW workflow showing authentication flow
56. Document Playwright MCP integration pattern (for #319)

### Dependency Management
57. Verify `httpx>=0.27.0` exists in `automation/pyproject.toml` dependencies
58. Add if missing (likely already present based on review)

### Validation
59. Run linting: `cd automation && ruff check adws/playwright_helpers/`
60. Run type checking: `cd automation && mypy adws/playwright_helpers/`
61. Run unit tests: `cd automation && pytest adws/adw_tests/test_playwright_auth.py -v`
62. Run integration tests requiring dev server: `cd automation && pytest adws/adw_tests/test_playwright_auth.py -v -m integration`
63. Manual validation: test helper in Python REPL with real endpoint
64. Update README.md with playwright_helpers module documentation
65. Push branch: `git push -u origin feat/318-playwright-auth-helper`

## Risks & Mitigations

### Risk: Supabase Cookie Format Changes
**Mitigation**: Cookie format is stable and documented in Supabase SSR documentation. Test against both Supabase Local and production project refs. Add integration tests that verify actual authentication works, not just cookie structure. If format changes, tests will catch regression immediately.

### Risk: Environment URL Configuration Complexity
**Mitigation**: Provide sensible defaults for local development (http://localhost:3001). Document required environment variables for staging/production. Add validation that fails fast with clear error messages if URLs are misconfigured. Include example .env file showing all required variables.

### Risk: Dev-Session Endpoint Dependency
**Mitigation**: Helper module inherits reliability of dev-session endpoint (#317). Add comprehensive error handling for HTTP failures, timeouts, and malformed responses. Return structured errors with debugging context. Tests verify graceful degradation when endpoint unavailable.

### Risk: Cookie Domain Misconfiguration
**Mitigation**: Automatically derive domain from environment (localhost for local, extract from URL for others). Add validation that domain matches expected pattern. Test domain attribute across all environments. Document domain requirements clearly in docstrings.

### Risk: JSON Encoding Errors in Cookie Value
**Mitigation**: Use standard library `json.dumps()` for encoding, which handles edge cases correctly. Add unit tests verifying JSON encoding produces valid strings. Include test cases with special characters in tokens to catch encoding issues.

## Validation Strategy

### Automated Tests
- **Unit Test**: Cookie name extraction handles localhost and production URLs correctly
- **Unit Test**: Cookie formatting produces valid Playwright cookie objects
- **Unit Test**: JSON encoding of cookie value works with sample tokens
- **Unit Test**: Cookie attributes (secure, sameSite) set correctly per environment
- **Unit Test**: Error handling returns structured error responses
- **Integration Test**: `create_test_session()` calls real dev-session endpoint successfully
- **Integration Test**: Returned session data contains required token fields
- **Integration Test**: `authenticate_playwright_session()` end-to-end flow completes
- **Integration Test**: Generated cookies match Supabase SSR format exactly
- **Integration Test**: Environment guard prevents production endpoint access

### Manual Checks
- **Data Seeded**: Test user created via dev-session endpoint with test_account flag
- **Failure Scenarios**:
  - Dev-session endpoint unreachable → expect error response with network details
  - Invalid email format sent to endpoint → expect 400 error propagated
  - Production environment configured → expect 403 from endpoint
  - Malformed session response → expect parsing error with context
- **Success Path**:
  - Call `authenticate_playwright_session()` → returns success=True
  - Inspect cookies array → contains single cookie object
  - Verify cookie name matches `sb-{project-ref}-auth-token` pattern
  - Parse cookie value JSON → contains access_token and refresh_token
  - Use cookies with Playwright MCP (#319) → authentication succeeds

### Release Guardrails
- **Monitoring**: Log all authentication helper calls with environment and error context
- **Testing**: Integration tests require dev-session endpoint running (dependency on #317)
- **Documentation**: Usage guide includes environment setup and troubleshooting
- **Rollback**: Helper module is additive (no breaking changes to existing code)

## Validation Commands

```bash
# Linting
cd automation && ruff check adws/playwright_helpers/

# Type checking (if mypy configured)
cd automation && mypy adws/playwright_helpers/ || echo "mypy not configured, skipping"

# Unit tests
cd automation && pytest adws/adw_tests/test_playwright_auth.py -v -k "not integration"

# Integration tests (requires dev server running)
cd web && bun run dev &  # Start Next.js dev server
cd automation && pytest adws/adw_tests/test_playwright_auth.py -v -m integration
pkill -f "bun run dev"  # Stop dev server

# Full test suite
cd automation && pytest adws/adw_tests/test_playwright_auth.py -v

# Manual REPL testing
cd automation && python3 -c "
import asyncio
from adws.playwright_helpers.auth import authenticate_playwright_session

async def test():
    result = await authenticate_playwright_session('test@example.com')
    print(result)

asyncio.run(test())
"
```

## Issue Relationships

- **Child Of**: #315 (Test account authentication epic) - Phase 3: Playwright integration
- **Depends On**: #317 (Dev session endpoint) - Calls endpoint for session creation
- **Blocks**: #319 (ADW integration examples) - Used by example workflows to authenticate
- **Related To**: #190 (Playwright E2E tests) - Shared authentication pattern for frontend testing
- **Related To**: #271 (GitHub OAuth) - Complements primary auth with dev-mode testing path

## Implementation Notes

### Environment URL Mapping
```python
WEB_URLS = {
    "local": "http://localhost:3001",
    "staging": os.getenv("STAGING_WEB_URL", "https://staging.kotadb.app"),
    "production": os.getenv("PRODUCTION_WEB_URL", "https://kotadb.app")
}
```

### Supabase Cookie Format Reference
Cookie name pattern: `sb-{project-ref}-auth-token`
- Localhost: `sb-localhost-auth-token`
- Production: `sb-abcdefghijklmnop-auth-token` (16-char project ref from URL)

Cookie value structure (must be JSON string):
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "refresh-token-here"
}
```

Cookie attributes for Playwright:
```python
{
    "name": "sb-localhost-auth-token",
    "value": '{"access_token":"...","refresh_token":"..."}',
    "domain": "localhost",  # or ".kotadb.app" for production
    "path": "/",
    "httpOnly": False,  # Required for SSR client access
    "secure": False,  # False for localhost, True for staging/production
    "sameSite": "Lax"
}
```

### Usage Example in ADW Workflow
```python
from adws.playwright_helpers.auth import authenticate_playwright_session

async def test_dashboard_flow():
    # Step 1: Authenticate
    result = await authenticate_playwright_session(
        email="test-agent-adw@kotadb.internal",
        tier="free",
        environment="local"
    )

    if not result["success"]:
        raise Exception(f"Authentication failed: {result['error']}")

    # Step 2: Extract cookies and API key
    cookies = result["cookies"]  # Ready for Playwright MCP
    api_key = result["apiKey"]   # For backend API calls

    # Step 3: Use with Playwright MCP (implementation in #319)
    # await page.context().addCookies(cookies)
    # await page.goto("http://localhost:3001/dashboard")

    return result
```

### Project Ref Extraction Logic
```python
def extract_project_ref(supabase_url: str) -> str:
    """Extract project ref from Supabase URL."""
    if "localhost" in supabase_url:
        return "localhost"

    # Parse URL like https://abcdefghijklmnop.supabase.co
    from urllib.parse import urlparse
    parsed = urlparse(supabase_url)

    # Extract subdomain (project ref)
    hostname = parsed.hostname or ""
    if "." in hostname:
        project_ref = hostname.split(".")[0]
        return project_ref

    raise ValueError(f"Cannot extract project ref from URL: {supabase_url}")
```

### Error Response Structure
```python
{
    "success": False,
    "error": "Detailed error message",
    "error_type": "NetworkError|ValidationError|AuthenticationError",
    "context": {
        "endpoint": "http://localhost:3001/auth/dev-session",
        "email": "test@example.com",
        "environment": "local"
    }
}
```

### Success Response Structure
```python
{
    "success": True,
    "cookies": [{
        "name": "sb-localhost-auth-token",
        "value": '{"access_token":"...","refresh_token":"..."}',
        "domain": "localhost",
        "path": "/",
        "httpOnly": False,
        "secure": False,
        "sameSite": "Lax"
    }],
    "apiKey": "kot_xxxxxxxxxxxxx",
    "instructions": {
        "playwright_mcp": "Use cookies with mcp__playwright__browser_click and related tools",
        "navigate_to": "http://localhost:3001/dashboard",
        "verify_auth": "Check that page does not redirect to /login"
    }
}
```

### Async HTTP Client Pattern
```python
import httpx

async def create_test_session(self, email: str, tier: str = "free") -> dict:
    """Create authenticated session via dev-session endpoint."""
    url = f"{self.web_url}/auth/dev-session"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                url,
                json={"email": email, "tier": tier},
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            return {
                "error": f"HTTP {e.response.status_code}: {e.response.text}",
                "error_type": "HTTPError"
            }
        except httpx.RequestError as e:
            return {
                "error": f"Network error: {str(e)}",
                "error_type": "NetworkError"
            }
```
