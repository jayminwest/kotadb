"""
ADW workflow example: Test repository indexing flow.

Demonstrates async operation monitoring pattern for Playwright agents.
Uses higher tier (solo) authentication for indexing features, shows
form submission, and documents polling pattern for long-running operations.

This example shows how to test workflows with asynchronous processing.
"""

import asyncio
import sys

from playwright_helpers.auth import authenticate_playwright_session


async def test_indexing_flow() -> bool:
    """
    Test repository indexing workflow with async operation monitoring.

    Returns:
        True if authentication and instruction output succeed, False otherwise.
    """
    # Step 1: Authenticate with higher tier for indexing access
    # Note: solo tier required for repository indexing feature
    sys.stdout.write("[Test] Authenticating test user for indexing flow...\n")
    sys.stdout.write("[Test] Using 'solo' tier for indexing permissions\n")

    session = await authenticate_playwright_session(
        email="test-agent-indexing@kotadb.internal",
        tier="solo",  # Higher tier required for indexing
        environment="local",
    )

    if not session["success"]:
        sys.stderr.write(f"[Test] Authentication failed: {session['error']}\n")
        sys.stderr.write(f"[Test] Error type: {session['error_type']}\n")
        if "context" in session:
            sys.stderr.write(f"[Test] Context: {session['context']}\n")
        return False

    sys.stdout.write(
        f"[Test] Authenticated as {session.get('email', 'test-agent-indexing@kotadb.internal')}\n"
    )

    # Step 2: Document indexing workflow with async operation pattern
    sys.stdout.write("\n[Test] Indexing Flow Instructions:\n")
    sys.stdout.write("1. Navigate to repositories/new page\n")
    sys.stdout.write("2. Inject authentication cookies\n")
    sys.stdout.write("3. Capture page snapshot to find form fields\n")
    sys.stdout.write("4. Fill repository URL field\n")
    sys.stdout.write('   - Example: "https://github.com/example/repo"\n')
    sys.stdout.write("5. Click index button to start async operation\n")
    sys.stdout.write("6. Wait for success message or progress indicator\n")

    # Future MCP integration pattern (commented for reference):
    # await mcp.call("playwright__browser_navigate", {
    #     "url": "http://localhost:3001/repositories/new"
    # })
    #
    # # Inject authentication cookies
    # for cookie in session["cookies"]:
    #     await mcp.call("playwright__browser_set_cookie", cookie)
    #
    # # Get form snapshot
    # snapshot = await mcp.call("playwright__browser_snapshot")
    #
    # # Fill repository URL
    # await mcp.call("playwright__browser_type", {
    #     "element": "repository URL input",
    #     "ref": "[ref from snapshot]",
    #     "text": "https://github.com/example/test-repo"
    # })
    #
    # # Submit indexing request
    # await mcp.call("playwright__browser_click", {
    #     "element": "index repository button",
    #     "ref": "[ref from snapshot]"
    # })
    #
    # # Wait for async operation confirmation
    # await mcp.call("playwright__browser_wait_for", {
    #     "text": "Indexing started"
    # })
    #
    # # Navigate to status page
    # await mcp.call("playwright__browser_navigate", {
    #     "url": "http://localhost:3001/repositories"
    # })
    #
    # # Poll for completion (example pattern)
    # for attempt in range(30):  # 30 second timeout
    #     status_snapshot = await mcp.call("playwright__browser_snapshot")
    #     if "Indexed" in status_snapshot:
    #         break
    #     await asyncio.sleep(1)
    #     await mcp.call("playwright__browser_click", {
    #         "element": "refresh button",
    #         "ref": "[ref from snapshot]"
    #     })

    sys.stdout.write("\n[Test] Async Operation Monitoring Pattern:\n")
    sys.stdout.write("- Navigate to repositories list page after submission\n")
    sys.stdout.write("- Poll page snapshot every 1-2 seconds\n")
    sys.stdout.write("- Look for status change from 'Indexing' to 'Indexed'\n")
    sys.stdout.write("- Set reasonable timeout (30-60 seconds)\n")
    sys.stdout.write("- Verify indexed file count is greater than 0\n")

    sys.stdout.write("\n[Test] Indexing flow example completed\n")
    sys.stdout.write("[Test] API Key available for backend status checks: ")
    sys.stdout.write(f"{session['apiKey'][:8]}...\n")

    return True


if __name__ == "__main__":
    success = asyncio.run(test_indexing_flow())
    sys.exit(0 if success else 1)
