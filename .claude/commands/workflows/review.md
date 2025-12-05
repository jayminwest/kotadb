# /review

**Template Category**: Structured Data

Review the implementation against the specification and validation results.

## Variables
- adw_id: $1 (ADW execution ID)
- spec_file: $2 (relative path to plan file)
- agent_name: $3 (reviewer agent name)

## Instructions
- Read the specification file to understand the intended changes
- Review `git diff origin/develop...HEAD` to see all implementation changes
- Check validation evidence (test results, build output, linting)
- Verify alignment between spec and implementation
- **Validate issue relationships**: Ensure relationship metadata is documented if applicable
  - Check if spec file includes `## Issue Relationships` section (if relationships exist)
  - Verify "Depends On" issues are actually merged/closed
  - Confirm "Related To" issues are still relevant context
  - Validate relationship formatting follows `.claude/commands/docs/issue-relationships.md` standards
- Identify blockers (must fix), tech debt (should fix), or skippable issues (minor)
- Assess anti-mock compliance: no new mocks introduced, real-service coverage

## Review Criteria
- **Blocker**: Breaks functionality, fails validation, violates anti-mock, security issues
- **Tech Debt**: Works but needs refinement, missing tests, incomplete docs
- **Skippable**: Minor style issues, non-critical optimizations, optional enhancements

## CRITICAL: Output Format Requirements

Return a JSON object matching this exact schema (all fields required):

```json
{
  "success": boolean,
  "review_summary": string,
  "review_issues": [
    {
      "review_issue_number": number,
      "issue_description": string,
      "issue_resolution": string,
      "issue_severity": "blocker" | "tech_debt" | "skippable",
      "screenshot_path": string | null,
      "screenshot_url": string | null
    }
  ]
}
```

**Field Requirements:**
- `success`: `true` if no blockers found, `false` if any blockers exist
- `review_summary`: 2-4 sentence overall assessment
- `review_issues`: Array of issues (empty array `[]` if none found)
- `review_issue_number`: Sequential numbering starting at 1
- `issue_severity`: Must be exactly "blocker", "tech_debt", or "skippable"
- `screenshot_path`/`screenshot_url`: Use `null` if not applicable

**DO NOT include:**
- Markdown formatting around JSON (no ``` backticks in output)
- Explanatory text (e.g., "Here is the review result:")
- Comments within JSON
- Trailing commas

## Examples

**Correct output (no issues):**
```json
{
  "success": true,
  "review_summary": "Implementation aligns with specification. All validation commands passed. Anti-mock compliance verified with real Supabase integration tests.",
  "review_issues": []
}
```

**Correct output (with issues):**
```json
{
  "success": false,
  "review_summary": "Implementation covers core functionality but has validation failures and missing test coverage. Two blockers must be resolved before merge.",
  "review_issues": [
    {
      "review_issue_number": 1,
      "issue_description": "Integration tests failing with 401 Unauthorized errors",
      "issue_resolution": "Update test fixtures to use valid API keys from test database",
      "issue_severity": "blocker",
      "screenshot_path": null,
      "screenshot_url": null
    },
    {
      "review_issue_number": 2,
      "issue_description": "Missing tests for error handling paths in rate limiter",
      "issue_resolution": "Add tests for exceeded limit response and reset logic",
      "issue_severity": "tech_debt",
      "screenshot_path": null,
      "screenshot_url": null
    }
  ]
}
```

**INCORRECT output (missing required fields):**
```json
{
  "success": true
}
```

**INCORRECT output (wrong severity values):**
```json
{
  "success": false,
  "review_summary": "Issues found",
  "review_issues": [
    {
      "review_issue_number": 1,
      "issue_description": "Test failure",
      "issue_resolution": "Fix test",
      "issue_severity": "critical"
    }
  ]
}
```

## Report
Return only the JSON object with no additional text.
