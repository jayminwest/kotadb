# Feature Plan: ADW Integration Examples for Agent Authentication

**Issue**: #319
**Title**: feat: add ADW integration examples demonstrating agent authentication patterns
**Component**: testing, automation
**Priority**: medium
**Effort**: small

## Overview

### Problem
AI agents in ADW workflows need practical examples demonstrating how to use the Playwright authentication system to test frontend user flows. While the authentication helper module (#318) provides the building blocks, there is no reference implementation showing how agents actually use this infrastructure in real workflows. This creates adoption friction and leaves the authentication stack unvalidated end-to-end.

### Desired Outcome
Create three example ADW workflow scripts that demonstrate progressively complex authentication patterns:
1. Basic dashboard authentication and access verification
2. Form interaction (search functionality)
3. Async operation monitoring (repository indexing)

Each example serves as a template for future automation and provides living documentation of authentication patterns. Examples output step-by-step instructions for Playwright MCP integration without implementing actual browser automation (deferred to separate work).

### Non-Goals
- Implementing actual Playwright MCP integration (real browser automation deferred)
- Creating full E2E test suite (this is documentation/examples)
- Replacing existing ADW phase scripts (examples are standalone)
- Supporting production environment testing (inherits dev-session guards)

## Technical Approach

### Architecture Notes
- Examples live in `automation/adws/adw_phases/` alongside existing phase scripts
- Each example uses `authenticate_playwright_session()` from #318
- Scripts are runnable standalone via `python -m adw_phases.test_frontend_*`
- Output format matches ADW phase conventions (sys.stdout.write, exit codes)
- MCP call sequences documented as comments for future implementation
- README.md in `playwright_helpers/` provides authentication pattern guide

### Key Modules to Touch
- `automation/adws/adw_phases/test_frontend_dashboard.py` (NEW) — Basic auth example
- `automation/adws/adw_phases/test_frontend_search.py` (NEW) — Form interaction example
- `automation/adws/adw_phases/test_frontend_indexing.py` (NEW) — Async operation example
- `automation/adws/playwright_helpers/README.md` (NEW) — Pattern documentation
- `automation/adws/README.md` — Reference new examples in architecture section

### Data/API Impacts
- No database changes (uses existing dev-session endpoint)
- No API changes (consumes authentication helper)
- Examples generate test users via dev-session endpoint
- Test users automatically cleaned up (ephemeral by design)

## Relevant Files

### Existing Files (Context)
- `automation/adws/playwright_helpers/auth.py` — Authentication helper from #318
- `automation/adws/adw_phases/adw_test.py` — Existing test phase for reference patterns
- `.claude/commands/testing/logging-standards.md` — Output conventions (sys.stdout.write)
- `docs/specs/feature-318-playwright-auth-helper.md` — Auth helper spec

### New Files
- `automation/adws/adw_phases/test_frontend_dashboard.py` — Dashboard access test
- `automation/adws/adw_phases/test_frontend_search.py` — Search flow test
- `automation/adws/adw_phases/test_frontend_indexing.py` — Indexing flow test
- `automation/adws/playwright_helpers/README.md` — Authentication patterns guide
- `automation/scripts/test-frontend-examples.sh` — Script to run all examples

### Modified Files
- `automation/adws/README.md` — Document playwright_helpers and examples

## Task Breakdown

### Phase 1: Dashboard Authentication Example
- Create `test_frontend_dashboard.py` with module docstring
- Import `authenticate_playwright_session` from playwright_helpers
- Implement async `test_dashboard_access()` function
- Add authentication step with error handling
- Output Playwright MCP instruction sequence (comments only)
- Add exit code handling (0=success, 1=failure)

### Phase 2: Search Flow Example
- Create `test_frontend_search.py` with module docstring
- Implement async `test_search_flow()` function
- Document search form interaction steps
- Show result verification pattern
- Include MCP call sequence as comments

### Phase 3: Indexing Flow Example
- Create `test_frontend_indexing.py` with module docstring
- Implement async `test_indexing_flow()` function
- Demonstrate higher tier authentication (solo vs free)
- Document async operation monitoring pattern
- Show navigation and state verification flow

### Phase 4: Documentation
- Create `playwright_helpers/README.md` with quickstart guide
- Document three authentication patterns with links to examples
- Add environment configuration section
- Include troubleshooting guide for common issues
- Add usage examples with code snippets

### Phase 5: Integration Script
- Create shell script `automation/scripts/test-frontend-examples.sh`
- Run all three examples sequentially
- Validate exit codes
- Aggregate output for CI integration

### Phase 6: Validation & Cleanup
- Test each example script manually
- Verify output matches ADW conventions
- Update automation README with references
- Run linting validation
- Push branch with conventional commit

## Step by Step Tasks

### Dashboard Example Implementation
1. Create file `automation/adws/adw_phases/test_frontend_dashboard.py`
2. Add module docstring explaining purpose: "ADW workflow example: Authenticate and access dashboard"
3. Import required modules: `authenticate_playwright_session`, `sys`, `asyncio`
4. Define async function `test_dashboard_access()` with docstring
5. Add authentication step: `session = await authenticate_playwright_session(email, tier, environment)`
6. Add error handling: check `session["success"]`, write error to stderr, return False
7. Write success message to stdout: "Authenticated as {email}"
8. Output Playwright MCP instruction sequence (7 steps as documented in issue)
9. Add comment explaining MCP tools (browser_navigate, browser_snapshot, etc.)
10. Return True on success
11. Add `if __name__ == "__main__"` block
12. Use `asyncio.run()` to execute test function
13. Exit with code 0 on success, 1 on failure

### Search Flow Example Implementation
14. Create file `automation/adws/adw_phases/test_frontend_search.py`
15. Add module docstring: "ADW workflow example: Test code search functionality"
16. Import required modules
17. Define async function `test_search_flow()` with docstring
18. Authenticate session with different email: "test-agent-search@kotadb.internal"
19. Add error handling
20. Output search flow steps (7 steps from issue description)
21. Document MCP call sequence: browser_navigate, browser_snapshot, browser_type, browser_click, browser_wait_for
22. Add comment explaining result verification pattern
23. Return success/failure
24. Add main block with asyncio runner and exit code

### Indexing Flow Example Implementation
25. Create file `automation/adws/adw_phases/test_frontend_indexing.py`
26. Add module docstring: "ADW workflow example: Test repository indexing flow"
27. Import required modules
28. Define async function `test_indexing_flow()` with docstring
29. Authenticate with higher tier: `tier="solo"` (comment explaining why)
30. Add error handling
31. Output indexing flow steps (6 steps from issue)
32. Document form filling pattern (repository field, button click)
33. Show async operation monitoring (wait for message, verify results)
34. Add MCP call sequence comments
35. Return success/failure
36. Add main block with asyncio runner

### README Documentation
37. Create file `automation/adws/playwright_helpers/README.md`
38. Add title: "Playwright Authentication Helpers"
39. Write quickstart section with basic usage example
40. Document authentication patterns section with three subsections (dashboard, search, indexing)
41. Add environment configuration section (local, staging, production URLs)
42. Document common patterns: cookie injection, API key usage
43. Add troubleshooting section with common issues and fixes (403 errors, cookie persistence, redirects)
44. Include links to example files
45. Add references to related issues (#315, #317, #318)

### Integration Script
46. Create file `automation/scripts/test-frontend-examples.sh`
47. Add shebang: `#!/usr/bin/env bash`
48. Add script description comment
49. Set error handling: `set -e`
50. Change to automation directory
51. Run dashboard test: `python -m adws.adw_phases.test_frontend_dashboard`
52. Capture exit code and output message
53. Run search test: `python -m adws.adw_phases.test_frontend_search`
54. Capture exit code
55. Run indexing test: `python -m adws.adw_phases.test_frontend_indexing`
56. Capture exit code
57. Output summary message
58. Exit with aggregated status (all pass = 0, any fail = 1)

### Update Automation README
59. Open `automation/adws/README.md`
60. Locate playwright_helpers section (around line 28)
61. Add reference to example scripts in adw_phases directory
62. Document example script purpose and usage
63. Add links to README.md in playwright_helpers directory

### Manual Validation
64. Start dev server: `cd web && bun run dev`
65. Run dashboard example: `cd automation && python -m adws.adw_phases.test_frontend_dashboard`
66. Verify output includes authentication success and MCP instructions
67. Verify exit code is 0
68. Run search example: `python -m adws.adw_phases.test_frontend_search`
69. Verify search flow steps output correctly
70. Run indexing example: `python -m adws.adw_phases.test_frontend_indexing`
71. Verify indexing flow with solo tier authentication
72. Run integration script: `./scripts/test-frontend-examples.sh`
73. Verify all three tests pass and summary is correct
74. Stop dev server: `pkill -f "bun run dev"`

### Linting and Type Checking
75. Run Ruff linting: `cd automation && ruff check adws/adw_phases/test_frontend_*.py`
76. Fix any linting errors (sys.stdout.write violations)
77. Run Ruff format: `cd automation && ruff format adws/adw_phases/test_frontend_*.py`
78. Verify no print() statements (logging standards)
79. Check import ordering and unused imports

### Final Validation
80. Re-run all example scripts to verify no regressions
81. Verify README.md renders correctly (markdown preview)
82. Test shell script on clean environment
83. Verify exit codes are correct (0 for success, 1 for failure)
84. Confirm MCP instruction comments are clear and accurate

### Git Operations
85. Stage new files: `git add automation/adws/adw_phases/test_frontend_*.py`
86. Stage README: `git add automation/adws/playwright_helpers/README.md`
87. Stage shell script: `git add automation/scripts/test-frontend-examples.sh`
88. Stage updated automation README: `git add automation/adws/README.md`
89. Create commit with conventional message: `feat: add ADW integration examples for agent authentication (#319)`
90. Add commit body explaining three examples and documentation
91. Push branch: `git push -u origin feat/319-adw-integration-examples`

## Risks & Mitigations

### Risk: Examples Become Outdated as MCP APIs Change
**Mitigation**: Examples document MCP call sequences as comments, not actual implementation, reducing coupling to MCP API details. README.md includes links to MCP usage guidance documentation. When MCP integration is implemented (separate work), examples can be updated incrementally. Documentation emphasizes these are templates, not production code.

### Risk: Authentication Helper Issues Block Example Execution
**Mitigation**: Examples depend on authentication helper from #318, which is already implemented and tested. Examples include comprehensive error handling that propagates authentication failures with clear messages. If helper has issues, examples will fail fast with actionable error context (endpoint unreachable, invalid credentials, etc.).

### Risk: Dev Server Availability During Testing
**Mitigation**: Examples require dev server running (`bun run dev`) but document this prerequisite clearly in README and script comments. Integration script can optionally start/stop dev server automatically. Examples return clear error messages when dev server is unreachable (network error context). Manual validation section documents server startup explicitly.

### Risk: Example Complexity Obscures Authentication Patterns
**Mitigation**: Examples use progressive complexity (dashboard → search → indexing) to introduce patterns incrementally. Each example is standalone (50-80 lines) with clear docstrings. README.md provides high-level pattern explanation before linking to code. Comments in examples explain "why" behind each step, not just "what".

### Risk: Logging Standard Violations
**Mitigation**: All examples use `sys.stdout.write()` and `sys.stderr.write()` per logging standards from `.claude/commands/testing/logging-standards.md`. Ruff linting enforces T201 rule (no print statements). Pre-commit hooks catch violations before commit. CI validation runs linting checks automatically.

## Validation Strategy

### Automated Tests
This feature focuses on example documentation rather than test coverage, but validation includes:
- **Linting**: Ruff checks for logging standard violations (T201 rule)
- **Format**: Ruff format enforces consistent code style
- **Import**: Verify all imports resolve correctly
- **Syntax**: Python syntax validation via pytest collection
- **Exit Codes**: Shell script validates example exit codes

### Manual Checks
- **Data Seeded**: Test users created via dev-session endpoint (dashboard, search, indexing)
- **Failure Scenarios**:
  - Dev server not running → expect network error with clear message
  - Authentication helper returns error → expect propagated error with context
  - Invalid email format → expect 400 error from endpoint
  - Wrong tier for operation → expect clear error about permissions
- **Success Path**:
  - Run dashboard example → output includes "Authenticated as..." and MCP instructions
  - Run search example → output includes search flow steps and verification notes
  - Run indexing example → output includes indexing steps with solo tier note
  - All examples exit with code 0
  - Integration script aggregates results correctly

### Release Guardrails
- **Monitoring**: Examples output structured messages parseable by ADW orchestrator
- **Documentation**: README.md provides troubleshooting guide for common failures
- **Rollback**: Examples are additive (no changes to existing ADW phase scripts)
- **Dependencies**: Depends on #318 (authentication helper) being merged first

## Validation Commands

```bash
# Linting
cd automation && ruff check adws/adw_phases/test_frontend_*.py

# Format
cd automation && ruff format adws/adw_phases/test_frontend_*.py

# Manual execution (requires dev server running)
cd web && bun run dev &

# Dashboard example
cd automation && python -m adws.adw_phases.test_frontend_dashboard
# Expected output: Authentication success + 7 MCP instruction steps

# Search example
cd automation && python -m adws.adw_phases.test_frontend_search
# Expected output: Search flow steps + MCP call sequence

# Indexing example
cd automation && python -m adws.adw_phases.test_frontend_indexing
# Expected output: Indexing steps with solo tier authentication

# Integration script
cd automation && ./scripts/test-frontend-examples.sh
# Expected output: All tests pass, exit code 0

# Stop dev server
pkill -f "bun run dev"
```

## Issue Relationships

- **Child Of**: #315 (Test account authentication epic) - Phase 4: ADW integration
- **Depends On**: #318 (Playwright helper module) - Uses helper for authentication
- **Blocks**: #190 (Playwright E2E test infrastructure) - Provides working examples
- **Related To**: #173 (Template-code alignment) - Example templates for validation
- **Related To**: #317 (Dev session endpoint) - Indirect dependency via #318

## Implementation Notes

### Example Script Structure Pattern
```python
"""
ADW workflow example: [Purpose]
Demonstrates [pattern description].
"""

from playwright_helpers.auth import authenticate_playwright_session
import sys

async def test_[workflow_name]():
    """Test [specific functionality]."""

    # Step 1: Authenticate session
    sys.stdout.write("[Test] Authenticating test user...\n")
    session = await authenticate_playwright_session(
        email="test-agent-[name]@kotadb.internal",
        tier="free",  # or "solo" for higher tier
        environment="local"
    )

    if not session["success"]:
        sys.stderr.write(f"[Test] Auth failed: {session['error']}\n")
        return False

    sys.stdout.write(f"[Test] Authenticated as {session['email']}\n")

    # Step 2: Document Playwright MCP usage
    sys.stdout.write("\n[Test] Playwright MCP Instructions:\n")
    sys.stdout.write("1. Navigate to: [URL]\n")
    sys.stdout.write(f"2. Inject cookies: {session['cookies']}\n")
    # ... additional steps

    # Future MCP integration:
    # await mcp.call("playwright__browser_navigate", {"url": "..."})
    # await mcp.call("playwright__browser_snapshot")

    sys.stdout.write("\n[Test] [Name] test completed\n")
    return True

if __name__ == "__main__":
    import asyncio
    success = asyncio.run(test_[workflow_name]())
    sys.exit(0 if success else 1)
```

### Test User Email Conventions
- Dashboard: `test-agent-dashboard@kotadb.internal`
- Search: `test-agent-search@kotadb.internal`
- Indexing: `test-agent-indexing@kotadb.internal`

Pattern: `test-agent-{workflow}@kotadb.internal`

### Tier Selection Guidance
- **free**: Basic authentication, dashboard access, search functionality
- **solo**: Repository indexing, higher rate limits, more features
- **team**: Team features (not used in examples)

### MCP Tool Reference
Examples document these Playwright MCP tools (as comments):
- `browser_navigate`: Navigate to URL
- `browser_snapshot`: Capture page accessibility tree
- `browser_type`: Enter text in form fields
- `browser_click`: Click buttons/links
- `browser_wait_for`: Wait for text to appear
- `browser_take_screenshot`: Capture visual state

### Shell Script Exit Code Strategy
```bash
#!/usr/bin/env bash
set -e  # Exit on first failure

exit_code=0

python -m adws.adw_phases.test_frontend_dashboard || exit_code=1
python -m adws.adw_phases.test_frontend_search || exit_code=1
python -m adws.adw_phases.test_frontend_indexing || exit_code=1

if [ $exit_code -eq 0 ]; then
    echo "All frontend examples passed"
else
    echo "One or more examples failed"
fi

exit $exit_code
```

### README.md Troubleshooting Section Template
```markdown
## Troubleshooting

**Issue**: 403 Forbidden from dev session endpoint
**Fix**: Verify environment is not production (endpoint disabled in production)

**Issue**: Cookies not persisting in browser
**Fix**: Ensure cookie domain matches page domain (localhost for local, .kotadb.app for production)

**Issue**: Middleware redirects to /login despite cookies
**Fix**: Verify cookie format matches Supabase SSR expectations (JSON-encoded with correct name)

**Issue**: Network error when calling authentication helper
**Fix**: Ensure dev server is running (`bun run dev`) and accessible at configured URL
```

## Success Criteria

The feature is complete when:
- Three example scripts (dashboard, search, indexing) run successfully
- Each example authenticates and outputs clear MCP instruction sequence
- README.md provides comprehensive pattern documentation
- Integration script validates all examples pass
- Examples follow ADW logging standards (no console.log or print)
- Documentation links to related issues and authentication helper
- Manual execution produces expected output with correct exit codes
- Examples serve as templates for future ADW frontend workflows
