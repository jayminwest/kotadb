# /document

Create or update documentation to reflect implementation changes.

## Variables
- issue_json: $1 (GitHub issue payload)
- adw_id: $2 (ADW execution ID)

## Instructions
- Parse issue JSON to understand the scope of changes
- Review `git diff origin/develop...HEAD` to see what was implemented
- Consult `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` to identify relevant docs
- Determine if documentation updates are needed based on change type:
  - **Feature**: Update README, CLAUDE.md, create spec file if not exists
  - **Bug**: Update spec file with resolution notes, may need README updates
  - **Chore**: Update CLAUDE.md if architecture/workflow changes, README if tooling changes
- If documentation is needed:
  - Create or update files under `docs/` or top-level markdown files
  - Use relative paths for all file operations (worktree isolation)
  - Ensure examples, commands, and architecture diagrams stay accurate
  - Update `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` if introducing new docs
  - Commit changes with descriptive message
- If no documentation needed (trivial changes, internal refactors):
  - Set `documentation_created: false` and explain why in summary

## Anti-Mock Compliance
- If implementation added real-service tests, document the testing approach
- Note any Supabase integration patterns for future reference
- Capture failure injection techniques used

## CRITICAL: Output Format Requirements

Return a JSON object matching this exact schema (all fields required):

```json
{
  "success": boolean,
  "documentation_created": boolean,
  "documentation_path": string | null,
  "summary": string | null,
  "error_message": string | null
}
```

**Field Requirements:**
- `success`: `true` if task completed successfully, `false` if errors occurred
- `documentation_created`: `true` if docs were created/updated, `false` if not needed
- `documentation_path`: Relative path to main doc file if created (e.g., `docs/specs/feature-123.md`), `null` if none
- `summary`: 2-4 sentence description of what was documented or why not needed, `null` if error
- `error_message`: Error description if `success: false`, `null` otherwise

**DO NOT include:**
- Markdown formatting around JSON (no ``` backticks in output)
- Explanatory text (e.g., "Here is the documentation result:")
- Comments within JSON
- Trailing commas

## Examples

**Correct output (documentation created):**
```json
{
  "success": true,
  "documentation_created": true,
  "documentation_path": "docs/specs/feature-26-tier-based-rate-limiting.md",
  "summary": "Created comprehensive spec document covering rate limit implementation, tier configuration, and testing strategy. Updated CLAUDE.md to reference rate limiting middleware and header behavior.",
  "error_message": null
}
```

**Correct output (no documentation needed):**
```json
{
  "success": true,
  "documentation_created": false,
  "documentation_path": null,
  "summary": "No documentation updates required. Changes are internal refactoring of test helpers with no user-facing impact. Existing test documentation remains accurate.",
  "error_message": null
}
```

**Correct output (error occurred):**
```json
{
  "success": false,
  "documentation_created": false,
  "documentation_path": null,
  "summary": null,
  "error_message": "Failed to parse issue JSON: invalid format"
}
```

**INCORRECT output (missing required fields):**
```json
{
  "success": true,
  "documentation_created": true
}
```

**INCORRECT output (wrong types):**
```json
{
  "success": "yes",
  "documentation_created": true,
  "documentation_path": "docs/specs/feature-26.md",
  "summary": "",
  "error_message": ""
}
```

## Report
Return only the JSON object with no additional text.
