"""
ADW workflow example: Test code search functionality.

Demonstrates form interaction pattern for Playwright agents. Includes
authentication, navigation, form field population, submission, and
result verification using Playwright MCP tools.

This example shows how to test user workflows that involve form input.
"""

import asyncio
import sys

from adws.playwright_helpers.auth import authenticate_playwright_session


async def test_search_flow() -> bool:
    """
    Test authenticated search functionality workflow.

    Returns:
        True if authentication and instruction output succeed, False otherwise.
    """
    # Step 1: Authenticate session
    sys.stdout.write("[Test] Authenticating test user for search flow...\n")

    session = await authenticate_playwright_session(
        email="test-agent-search@kotadb.internal",
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
        f"[Test] Authenticated as {session.get('email', 'test-agent-search@kotadb.internal')}\n"
    )

    # Step 2: Document search workflow with Playwright MCP
    sys.stdout.write("\n[Test] Search Flow Instructions:\n")
    sys.stdout.write("1. Navigate to search page\n")
    sys.stdout.write("2. Inject authentication cookies\n")
    sys.stdout.write("3. Capture initial page snapshot\n")
    sys.stdout.write("4. Type search query into search input field\n")
    sys.stdout.write('   - Example query: "function authenticate"\n')
    sys.stdout.write("5. Click search button to submit\n")
    sys.stdout.write("6. Wait for results to appear on page\n")
    sys.stdout.write("7. Verify search results contain expected matches\n")

    # Future MCP integration pattern (commented for reference):
    # await mcp.call("playwright__browser_navigate", {
    #     "url": "http://localhost:3001/search"
    # })
    #
    # # Inject authentication cookies
    # for cookie in session["cookies"]:
    #     await mcp.call("playwright__browser_set_cookie", cookie)
    #
    # # Get page snapshot to find search elements
    # snapshot = await mcp.call("playwright__browser_snapshot")
    #
    # # Type search query
    # await mcp.call("playwright__browser_type", {
    #     "element": "search input field",
    #     "ref": "[ref from snapshot]",
    #     "text": "function authenticate"
    # })
    #
    # # Submit search
    # await mcp.call("playwright__browser_click", {
    #     "element": "search button",
    #     "ref": "[ref from snapshot]"
    # })
    #
    # # Wait for results
    # await mcp.call("playwright__browser_wait_for", {
    #     "text": "Search Results"
    # })
    #
    # # Verify results
    # results_snapshot = await mcp.call("playwright__browser_snapshot")
    # if "authenticate" not in results_snapshot.lower():
    #     raise AssertionError("Search results do not contain query term")

    sys.stdout.write("\n[Test] Result Verification Pattern:\n")
    sys.stdout.write("- Check result count is greater than 0\n")
    sys.stdout.write("- Verify each result contains query term\n")
    sys.stdout.write(
        "- Validate result format (file path, line number, code snippet)\n"
    )
    sys.stdout.write("- Ensure no error messages appear in results\n")

    sys.stdout.write("\n[Test] Search flow example completed\n")
    sys.stdout.write("[Test] API Key available for backend search: ")
    sys.stdout.write(f"{session['apiKey'][:8]}...\n")

    return True


if __name__ == "__main__":
    success = asyncio.run(test_search_flow())
    sys.exit(0 if success else 1)
