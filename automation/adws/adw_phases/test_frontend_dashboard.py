"""
ADW workflow example: Authenticate and access dashboard.

Demonstrates basic authentication pattern for Playwright agents testing
frontend user flows. Creates test session via dev-session endpoint and
outputs cookie injection instructions for Playwright MCP integration.

This example shows the foundational pattern for authenticated frontend testing.
"""

import asyncio
import sys

from adws.playwright_helpers.auth import authenticate_playwright_session


async def test_dashboard_access() -> bool:
    """
    Test authenticated dashboard access flow.

    Returns:
        True if authentication and instruction output succeed, False otherwise.
    """
    # Step 1: Authenticate session
    sys.stdout.write("[Test] Authenticating test user for dashboard access...\n")

    session = await authenticate_playwright_session(
        email="test-agent-dashboard@kotadb.internal",
        tier="free",
        environment="local",
    )

    if not session["success"]:
        sys.stderr.write(f"[Test] Authentication failed: {session['error']}\n")
        sys.stderr.write(f"[Test] Error type: {session['error_type']}\n")
        if "context" in session:
            sys.stderr.write(f"[Test] Context: {session['context']}\n")
        return False

    sys.stdout.write(
        f"[Test] Authenticated as {session.get('email', 'test-agent-dashboard@kotadb.internal')}\n"
    )

    # Step 2: Document Playwright MCP usage
    sys.stdout.write("\n[Test] Playwright MCP Instructions:\n")
    sys.stdout.write("1. Navigate to dashboard page\n")
    sys.stdout.write("2. Inject authentication cookies from session\n")
    sys.stdout.write(f"   - Cookie name: {session['cookies'][0]['name']}\n")
    sys.stdout.write(f"   - Cookie domain: {session['cookies'][0]['domain']}\n")
    sys.stdout.write("3. Capture page snapshot to verify dashboard loaded\n")
    sys.stdout.write("4. Verify user email appears in page content\n")
    sys.stdout.write("5. Check for dashboard widgets (repositories, API keys)\n")
    sys.stdout.write("6. Verify no redirect to /login occurred\n")
    sys.stdout.write("7. Take screenshot for visual verification\n")

    # Future MCP integration pattern (commented for reference):
    # await mcp.call("playwright__browser_navigate", {
    #     "url": "http://localhost:3001/dashboard"
    # })
    #
    # # Inject cookies for authentication
    # for cookie in session["cookies"]:
    #     await mcp.call("playwright__browser_set_cookie", cookie)
    #
    # # Verify page loaded correctly
    # snapshot = await mcp.call("playwright__browser_snapshot")
    # if "Login" in snapshot:
    #     raise AssertionError("Redirected to login page despite cookies")
    #
    # # Check dashboard content
    # if "Dashboard" not in snapshot:
    #     raise AssertionError("Dashboard content not found")
    #
    # # Visual verification
    # await mcp.call("playwright__browser_take_screenshot", {
    #     "filename": "dashboard-authenticated.png"
    # })

    sys.stdout.write("\n[Test] Dashboard authentication example completed\n")
    sys.stdout.write("[Test] API Key available for backend calls: ")
    sys.stdout.write(f"{session['apiKey'][:8]}...\n")

    return True


if __name__ == "__main__":
    success = asyncio.run(test_dashboard_access())
    sys.exit(0 if success else 1)
