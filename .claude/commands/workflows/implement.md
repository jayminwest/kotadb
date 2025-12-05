# /implement

**Template Category**: Action

Follow the provided plan file (path passed via `$ARGUMENTS`) and implement each step without deviating from scope.

## Instructions
- Read the entire plan before making changes; clarify assumptions in inline notes if something is ambiguous.
- Consult `.claude/commands/docs/conditional_docs/app.md` (for backend/API changes) or `.claude/commands/docs/conditional_docs/automation.md` (for ADW/automation changes) for any documentation that matches the implementation scope.
- **Before modifying shared modules**: Use `mcp__kotadb-staging__search_dependencies` to check dependents and understand impact (see `.claude/commands/docs/kotadb-agent-usage.md` for patterns)
- Execute tasks in the documented order, touching only the files listed unless the plan explicitly allows otherwise.
- Keep commits incremental and logically grouped. Use Conventional Commit subjects referencing the issue.
  - **CRITICAL**: Avoid meta-commentary patterns in commit messages (e.g., "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me")
  - These patterns will fail validation. Use direct statements: `feat: add search filters` not `Based on the changes, the commit should add search filters`
  - Create commits after completing logical units of work (e.g., after implementing a module, after adding tests, after updating docs)
  - **For ADW agents**: Use the `git_commit` MCP tool for automated workflows:
    ```typescript
    // Query workflow state for context
    const state = await mcp.call("adw_get_state", { adw_id: "<adw_id>" });

    // Create incremental commit
    await mcp.call("git_commit", {
      adw_id: "<adw_id>",
      message: "feat: add rate limiter middleware",
      files: ["app/src/middleware/rate-limit.ts"]  // Optional: specific files
    });
    ```
  - **For manual development**: Use standard git commands: `git add <files> && git commit -m "message"`
- Stay on the correct work branch (`feat/`, `bug/`, `chore/`, etc.) that will merge into `develop` before promotion to `main`.
- When scoped tasks are complete, rerun the plan's validation level, ensure the tree is clean, and push the branch so a PR can be created with a title ending in the issue number (e.g. `feat: add search filters (#210)`).

## Anti-Mock Guardrails
- Read `/anti-mock` before touching tests; do not introduce new stub helpers (`createMock*`, fake clients, manual spies).
- Exercise real Supabase access paths and failure-injection utilities in new or updated tests; document any temporary skips with a follow-up issue.
- Capture evidence (command output, Supabase logs) that real-service suites ran when preparing the implementation report.

## Validation

Before creating the PR, select and execute the appropriate validation level:

1. Consult `/validate-implementation` to understand the 3 validation levels
2. Determine the correct level based on your changes:
   - **Level 1** (Quick): Docs-only, config comments (lint + typecheck)
   - **Level 2** (Integration): Features, bugs, endpoints (**DEFAULT**)
   - **Level 3** (Release): Schema, auth, migrations, high-risk changes
3. Run all commands for your selected level in order
4. Capture the output and status of each command
5. Stop immediately if any command fails; fix before proceeding

**Commands by Level**:
- Level 1: `cd app && bun run lint && cd app && bunx tsc --noEmit`
- Level 2: `cd app && bun run lint && cd app && bunx tsc --noEmit && cd app && bun test:setup && cd app && bun test --filter integration && cd app && bun test:teardown || true`
- Level 3: `cd app && bun run lint && cd app && bunx tsc --noEmit && cd app && bun test:setup && cd app && bun test --filter integration && cd app && bun test && cd app && bun test:teardown || true && cd app && bun run build`

**Evidence Required**:
- Document which level you selected and why
- Include pass/fail status for each command
- Provide Supabase logs or other proof that integration tests hit real services
- This evidence will be included in the PR body

## Final Steps
- After validation passes, confirm `git status --short` is clean apart from intended artifacts.
- **DO NOT push the branch or create a PR** - the build phase handles all git operations.
- The build phase will:
  1. Commit your implementation changes
  2. Push the branch to remote
  3. Create a PR with proper title and description

## Report
Provide a concise bullet list of the implementation work performed.

**DO NOT include:**
- Markdown formatting (no **bold**, no ` ``` blocks`, no # headers)
- Explanatory preambles (e.g., "Here is the implementation report:")
- Multiple paragraph descriptions

**Correct output:**
```
- Modified app/src/api/routes.ts: added rate limiting middleware (45 lines)
- Created app/tests/api/rate-limit.test.ts: 15 integration tests added
- Updated app/src/auth/middleware.ts: integrated rate limit checks
- Validation: Level 2 selected (feature with new endpoints)
- Commands executed: lint (pass), typecheck (pass), integration tests (pass, 133/133)
- Real-service evidence: Supabase query logs show rate limit increments in api_keys table
- git diff --stat: 4 files changed, 156 insertions(+), 12 deletions(-)
- Implementation complete, ready for build phase to commit/push/PR
```

**INCORRECT output (do NOT do this):**
```
# Implementation Report

I have successfully completed the implementation! Here's what I did:

**Files Modified:**
- Modified `app/src/api/routes.ts` to add the rate limiting middleware

**Validation:**
All tests passed successfully! The validation level was Level 2.

I pushed the branch and created a pull request at: https://github.com/user/repo/pull/123
```

**Why this is wrong:**
- Uses markdown formatting (# headers, **bold**)
- Includes explanatory preambles
- Agent should NOT push branch or create PR (build phase owns these operations)
- Violates single responsibility: implementation agents write code, build phase handles git operations

## Output Schema

This command's output is validated against the following structure for orchestrator consumption:

```json
{
  "type": "object",
  "properties": {
    "files_modified": {
      "type": "array",
      "description": "List of files created or modified with line count"
    },
    "validation_level": {
      "type": "integer",
      "enum": [1, 2, 3],
      "description": "Validation level selected (1=Quick, 2=Integration, 3=Release)"
    },
    "lint_status": {
      "type": "string",
      "enum": ["pass", "fail"],
      "description": "Result of bun run lint command"
    },
    "typecheck_status": {
      "type": "string",
      "enum": ["pass", "fail"],
      "description": "Result of bunx tsc --noEmit command"
    },
    "test_results": {
      "type": "string",
      "pattern": "^\\d+/\\d+$",
      "description": "Test pass count in format 'passed/total' (e.g., '133/133')"
    },
    "real_service_evidence": {
      "type": "string",
      "description": "Evidence that integration tests hit real services"
    }
  },
  "required": ["validation_level", "lint_status", "typecheck_status"]
}
```

The orchestrator parses the bullet list output to extract these fields using pattern matching. While the output is plain text (not JSON), the schema defines what information must be present and parseable from the output.
