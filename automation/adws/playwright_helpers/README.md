# Playwright Authentication Helpers

Authentication utilities for Playwright browser automation in ADW (AI Developer Workflow) agents. Provides session creation and cookie management for testing frontend user flows in KotaDB web application.

## Quickstart

```python
from playwright_helpers.auth import authenticate_playwright_session
import asyncio

async def main():
    # Create authenticated session for test user
    session = await authenticate_playwright_session(
        email="test-agent@kotadb.internal",
        tier="free",
        environment="local"
    )

    if not session["success"]:
        print(f"Authentication failed: {session['error']}")
        return

    # Use cookies with Playwright MCP tools
    cookies = session["cookies"]
    api_key = session["apiKey"]

    # Example: Navigate to dashboard (pseudocode for MCP integration)
    # await mcp.call("playwright__browser_navigate", {"url": "http://localhost:3001/dashboard"})
    # for cookie in cookies:
    #     await mcp.call("playwright__browser_set_cookie", cookie)

asyncio.run(main())
```

## Authentication Patterns

This module supports three progressively complex authentication patterns demonstrated in example scripts:

### 1. Dashboard Access (Basic Authentication)

**Example**: `adw_phases/test_frontend_dashboard.py`

Demonstrates foundational pattern for authenticated page access:
- Create session via dev-session endpoint
- Inject cookies into Playwright browser context
- Verify dashboard content loads without redirect to login
- Extract API key for backend calls

**Use Case**: Basic authenticated page access, user profile verification, settings pages

### 2. Search Flow (Form Interaction)

**Example**: `adw_phases/test_frontend_search.py`

Shows form field interaction and result verification:
- Authenticate and navigate to search page
- Type query into search input field
- Submit form and wait for results
- Verify result format and content

**Use Case**: Testing search functionality, filter forms, any user input workflows

### 3. Indexing Flow (Async Operations)

**Example**: `adw_phases/test_frontend_indexing.py`

Demonstrates async operation monitoring with higher tier:
- Authenticate with solo tier for indexing permissions
- Submit repository URL for indexing
- Poll for operation completion
- Verify indexed file count

**Use Case**: Repository indexing, long-running operations, status polling

## Environment Configuration

The authentication helper supports three environments with automatic URL mapping:

| Environment | Web URL | Cookie Domain | Use Case |
|-------------|---------|---------------|----------|
| `local` | `http://localhost:3001` | `localhost` | Local development testing |
| `staging` | `https://staging.kotadb.app` | `.kotadb.app` | Pre-production validation |
| `production` | `https://kotadb.app` | `.kotadb.app` | Production testing (disabled in prod) |

**Environment Selection**:
```python
# Local development (default)
session = await authenticate_playwright_session(email="test@example.com", environment="local")

# Staging environment
session = await authenticate_playwright_session(email="test@example.com", environment="staging")
```

**Important**: The dev-session endpoint is disabled in production environments for security. All examples require `NODE_ENV !== 'production'` and `VERCEL_ENV !== 'production'`.

## Common Patterns

### Cookie Injection

Cookies returned from `authenticate_playwright_session` are formatted for Playwright MCP tools:

```python
session = await authenticate_playwright_session("test@example.com")
cookies = session["cookies"]

# Cookie structure:
# {
#     "name": "sb-localhost-auth-token",
#     "value": '{"access_token":"...","refresh_token":"..."}',
#     "domain": "localhost",
#     "path": "/",
#     "httpOnly": False,
#     "secure": False,
#     "sameSite": "Lax"
# }

# Future MCP integration:
# for cookie in cookies:
#     await mcp.call("playwright__browser_set_cookie", cookie)
```

### API Key Usage

The `apiKey` field contains the test user's API key for backend calls:

```python
session = await authenticate_playwright_session("test@example.com")
api_key = session["apiKey"]

# Use for direct API calls during testing
# headers = {"Authorization": f"Bearer {api_key}"}
# response = await client.get("/api/repositories", headers=headers)
```

### Error Handling

All examples include comprehensive error handling:

```python
session = await authenticate_playwright_session("test@example.com")

if not session["success"]:
    sys.stderr.write(f"Authentication failed: {session['error']}\n")
    sys.stderr.write(f"Error type: {session['error_type']}\n")
    if "context" in session:
        sys.stderr.write(f"Context: {session['context']}\n")
    return False
```

## Troubleshooting

### Issue: 403 Forbidden from dev-session endpoint

**Cause**: Environment is set to production (endpoint disabled for security)

**Fix**: Verify `NODE_ENV` and `VERCEL_ENV` are not set to `production`:
```bash
echo $NODE_ENV
echo $VERCEL_ENV
```

### Issue: Network error when calling authentication helper

**Cause**: Dev server not running or wrong URL

**Fix**: Ensure dev server is running and accessible:
```bash
# Start dev server
cd web && bun run dev

# Verify server responds
curl http://localhost:3001/health
```

### Issue: Cookies not persisting in browser

**Cause**: Cookie domain mismatch with page domain

**Fix**: Verify cookie domain matches page domain:
- Local: cookie domain must be `localhost`, page must be `http://localhost:*`
- Production: cookie domain must be `.kotadb.app`, page must be `https://*.kotadb.app`

### Issue: Middleware redirects to /login despite cookies

**Cause**: Cookie format doesn't match Supabase SSR expectations

**Fix**: Verify cookie structure includes both tokens in JSON format:
```python
# Correct format:
cookie_value = '{"access_token":"...","refresh_token":"..."}'

# Cookie name must match Supabase project ref:
# - Local: "sb-localhost-auth-token"
# - Cloud: "sb-{project-ref}-auth-token"
```

### Issue: Higher tier features not accessible

**Cause**: Test user created with wrong tier

**Fix**: Specify correct tier in authentication call:
```python
# For indexing and advanced features
session = await authenticate_playwright_session(
    email="test@example.com",
    tier="solo"  # or "team" for team features
)
```

## Related Issues

- [#315](https://github.com/kotadb/kotadb/issues/315) - Test account authentication epic (parent)
- [#317](https://github.com/kotadb/kotadb/issues/317) - Dev session endpoint (dependency)
- [#318](https://github.com/kotadb/kotadb/issues/318) - Playwright helper module (this implementation)
- [#319](https://github.com/kotadb/kotadb/issues/319) - ADW integration examples (this documentation)
- [#190](https://github.com/kotadb/kotadb/issues/190) - Playwright E2E test infrastructure (blocked by this)

## Architecture Notes

### Module Structure

```
automation/adws/
├── playwright_helpers/
│   ├── __init__.py
│   ├── auth.py           # Authentication helper implementation
│   └── README.md         # This file
└── adw_phases/
    ├── test_frontend_dashboard.py   # Dashboard access example
    ├── test_frontend_search.py      # Search flow example
    └── test_frontend_indexing.py    # Indexing flow example
```

### Dev Session Endpoint

Location: `web/app/auth/dev-session/route.ts`

Security guards:
- Requires `NODE_ENV !== 'production'` AND `VERCEL_ENV !== 'production'`
- Requires `SUPABASE_SERVICE_ROLE_KEY` environment variable
- Exempted from auth middleware via matcher

Request format:
```json
{
  "email": "test@example.com",
  "tier": "free"
}
```

Response format:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "apiKey": "..."
}
```

### Test User Email Conventions

Examples use consistent email format for test users:

- Dashboard: `test-agent-dashboard@kotadb.internal`
- Search: `test-agent-search@kotadb.internal`
- Indexing: `test-agent-indexing@kotadb.internal`

Pattern: `test-agent-{workflow}@kotadb.internal`

Using `.internal` TLD avoids conflicts with real email domains.

## Running Examples

### Manual Execution

```bash
# Start dev server first
cd web && bun run dev

# Run individual examples
cd automation

python -m adws.adw_phases.test_frontend_dashboard
python -m adws.adw_phases.test_frontend_search
python -m adws.adw_phases.test_frontend_indexing
```

### Integration Script

Run all examples sequentially:

```bash
cd automation
./scripts/test-frontend-examples.sh
```

Expected output:
```
[Test] Authenticating test user for dashboard access...
[Test] Authenticated as test-agent-dashboard@kotadb.internal
...
All frontend examples passed
```

## Future Work

These examples document MCP call sequences as comments for future implementation. When Playwright MCP integration is implemented:

1. Replace comment blocks with actual MCP tool calls
2. Add real browser automation and verification
3. Integrate into CI pipeline for E2E testing
4. Extend examples for additional workflows (admin, team features)

See [#190](https://github.com/kotadb/kotadb/issues/190) for Playwright E2E test infrastructure roadmap.
