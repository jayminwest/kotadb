# Prompt-Code Alignment Guide for ADW Templates

**Template Category**: Message-Only
**Prompt Level**: 4 (Contextual)
**Last Updated**: 2025-10-13
**Related Issues**: #84, #87

## Overview

ADW slash command templates (`.claude/commands/`) are **executable specifications** that define contracts between AI agents and Python automation code. Misalignment between template output expectations and Python parsing logic causes workflow failures that are difficult to detect and debug.

This guide establishes principles, mappings, and testing methodologies to ensure template-code contract compliance.

## Why Alignment Matters

**Templates are code.** When a template changes, it can break automation workflows just like a breaking API change. The symptoms are often subtle:

- Silent failures (workflow completes but produces incorrect results)
- Parse errors in downstream Python functions
- Incorrect state transitions in `adw_state.json`
- Git operations failing due to unexpected output formats

**Example from Issue #84:**
- `/commit` template executed git commands instead of returning message strings
- Python code expected string output, received shell command output
- Workflow failed with cryptic "Empty commit message returned" error
- Root cause: template instructions misaligned with `create_commit_message()` expectations

## Template Categories

### 1. Message-Only Templates

**Purpose**: Return a single string value for direct consumption
**Python Expectation**: `response.output.strip()` yields the complete result
**Output Format**: Plain text, no code blocks, no explanatory text

**Templates in this category**:
- `/commit` → Returns commit message string
- `/generate_branch_name` → Returns branch name string
- `/classify_issue` → Returns classification slash command (`/chore`, `/bug`, `/feature`)

**Contract Requirements**:
- Return ONLY the requested value on a single line or multiline string
- No markdown formatting (no `**bold**`, no `# headers`, no ` ``` blocks`)
- No explanatory text (e.g., ~~"The commit message is:"~~)
- No tool output (e.g., ~~"Running `git status`..."~~)
- Strip leading/trailing whitespace before returning

**Example - `/commit` template** (automation/commit.md):
```markdown
# /commit

Generate a commit message for the current changes.

## Instructions
- Inspect `git status` and `git diff --staged` to understand changes
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Return ONLY the commit message text
- Do NOT execute git commands
- Do NOT include explanatory text

## Output Format
Return the commit message as plain text:

<correct>
feat(api): add rate limiting middleware

Implements tier-based rate limiting with hourly windows.
Adds middleware to enforce limits before route handlers.
</correct>

<incorrect>
Here is the commit message:

**feat(api): add rate limiting middleware**

You can commit this with: `git commit -m "..."`
</incorrect>
```

**Python consumption** (workflow_ops.py:272-301):
```python
def create_commit_message(...) -> Tuple[Optional[str], Optional[str]]:
    request = AgentTemplateRequest(
        slash_command="/commit",
        args=[agent_name, issue_class, minimal_issue_payload(issue)],
        ...
    )
    response = execute_template(request)

    if not response.success:
        return None, response.output

    message = response.output.strip()  # Expects plain text
    if not message:
        return None, "Empty commit message returned"
    return message, None
```

### 2. Path Resolution Templates

**Purpose**: Return a file path for subsequent operations
**Python Expectation**: `response.output.strip()` yields a valid relative path
**Output Format**: Relative path, may be wrapped in markdown code blocks

**Templates in this category**:
- `/find_plan_file` → Returns path to plan file created by planner
- `/patch` → Returns path to patch plan file

**Contract Requirements**:
- Return a valid relative path (e.g., `docs/specs/feature-123-plan.md`)
- May wrap path in markdown code blocks (Python strips these)
- Must NOT include git status prefixes (`?? `, `M `, `A `)
- Return `0` if no file found (special sentinel value)
- No absolute paths (breaks worktree isolation)

**Example - `/find_plan_file` template** (.claude/commands/automation/find_plan_file.md:1-46):
```markdown
# /find_plan_file

Determine the relative path to the plan file created in the previous step.

## Instructions
- Inspect git for newly created or modified files under `docs/specs/`
- You may use:
  - `git status --short docs/specs/`
  - `git diff --name-only origin/develop...HEAD docs/specs/`
  - `ls -t docs/specs/`

## CRITICAL: Output Format Requirements

Return **ONLY** the plan file path as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The plan file is located at:", "Based on the output:")
- Markdown formatting or code blocks (no ``` backticks)
- Quotes, asterisks, or other punctuation around the path
- Multiple lines or additional commentary

**Correct output:**
```
docs/specs/feature-1234-event-streaming.md
```

**INCORRECT outputs (do NOT do this):**
```
Based on the git status output, the plan file path is:

**docs/specs/feature-1234-event-streaming.md**
```

If no plan file can be found, respond with only:
```
0
```
```

**Python consumption** (workflow_ops.py:207-252):
```python
def locate_plan_file(...) -> Tuple[Optional[str], Optional[str]]:
    request = AgentTemplateRequest(
        slash_command="/find_plan_file",
        args=[plan_output],
        ...
    )
    response = execute_template(request)

    if not response.success:
        return None, response.output

    # Extract path from response, handling markdown code blocks
    plan_path = response.output.strip()

    # Try to extract from markdown code blocks - use the LAST one (most specific)
    # Agents often include git output in first block and the final path in last block
    code_blocks = re.findall(r'```\s*([^\n`]+)\s*```', plan_path)
    if code_blocks:
        plan_path = code_blocks[-1].strip()  # Use last code block

    # Strip git status prefixes like "?? ", "M ", "A ", etc.
    git_status_prefix = re.match(r'^[?MAD!]{1,2}\s+', plan_path)
    if git_status_prefix:
        plan_path = plan_path[git_status_prefix.end():].strip()

    if plan_path == "0":
        return None, "No plan file returned"
    if "/" not in plan_path:
        return None, f"Invalid plan path returned: {plan_path}"

    return plan_path, None
```

**Key lesson from #84**: The Python code has defensive parsing (strips git prefixes, handles code blocks), but templates should still aim for clean output to minimize parsing brittleness.

### 3. Action Templates

**Purpose**: Perform file modifications or complex operations
**Python Expectation**: Side effects (files created/modified), success indicated by `response.success`
**Output Format**: Human-readable summary of actions taken

**Templates in this category**:
- `/implement` → Reads plan file and modifies source code
- `/chore`, `/bug`, `/feature` → Creates plan file in `docs/specs/`
- `/pull_request` → Creates PR via `gh` CLI

**Contract Requirements**:
- Perform requested actions (file writes, git commands, API calls)
- Return human-readable summary of what was done
- Set `response.success = True` if actions completed successfully
- For planning templates (`/chore`, `/bug`, `/feature`), ensure plan file is tracked by git
- Use relative paths for all file operations to maintain worktree isolation

**Example - `/implement` template** (.claude/commands/automation/implement.md):
```markdown
# /implement

Follow the provided plan file and implement each step without deviating from scope.

## Instructions
- Read the entire plan before making changes
- Execute tasks in documented order
- Touch only files listed unless plan explicitly allows otherwise
- Use relative paths for all file operations
- Keep commits incremental and logically grouped

## Validation
Before completing, run the validation commands specified in the plan:
- Level 1 (Quick): `bun run lint && bun run typecheck`
- Level 2 (Integration): Level 1 + `bun test --filter integration`
- Level 3 (Release): Level 2 + `bun test && bun run build`

## Output
Provide a concise bullet list of implementation work performed:
- Files created/modified
- Validation level chosen and command results
- Output of `git diff --stat`
```

**Python consumption** (workflow_ops.py:255-269):
```python
def implement_plan(...) -> AgentPromptResponse:
    request = AgentTemplateRequest(
        slash_command="/implement",
        args=[plan_file],
        ...
    )
    response = execute_template(request)
    # Side effects: files created/modified, validation run
    # response.output contains human-readable summary
    # response.success indicates whether implementation succeeded
    return response
```

### 4. Structured Data Templates

**Purpose**: Return structured data (JSON) for complex results
**Python Expectation**: `parse_json(response.output, ResultModel)` succeeds
**Output Format**: Valid JSON matching Pydantic model schema

**Templates in this category**:
- `/review` → Returns `ReviewResult` JSON with findings
- `/document` → Returns `DocumentationResult` JSON with file changes

**Contract Requirements**:
- Return valid JSON that can be parsed into the expected Pydantic model
- Include all required fields defined in the model schema
- Use correct types (strings, booleans, arrays) for each field
- May include markdown formatting around JSON, but JSON block must be valid
- No trailing commas, no comments in JSON

**Example - `/review` template** (.claude/commands/workflows/review.md):
```markdown
# /review

Review the implementation against the specification and validation results.

## Output Format
Return a JSON object matching this schema:

{
  "success": boolean,           // true if no blockers
  "review_summary": string,     // Overall assessment
  "review_issues": [            // Array of issues found (empty if none)
    {
      "review_issue_number": number,
      "issue_severity": "blocker" | "tech_debt" | "skippable",
      "issue_description": string,
      "issue_resolution": string,
      "screenshot_path": string | null,
      "screenshot_url": string | null
    }
  ]
}

**Correct output:**
```json
{
  "success": true,
  "review_summary": "Implementation aligns with specification. All validation commands passed.",
  "review_issues": []
}
```

**Incorrect output (missing required fields):**
```json
{
  "success": true
}
```
```

**Python consumption** (workflow_ops.py:393-415):
```python
def run_review(...) -> Tuple[Optional[ReviewResult], Optional[str]]:
    request = AgentTemplateRequest(
        slash_command="/review",
        args=[adw_id, spec_file, AGENT_REVIEWER],
        ...
    )
    response = execute_template(request)

    if not response.success:
        return None, response.output

    try:
        result = parse_json(response.output, ReviewResult)  # Pydantic parsing
    except ValueError as exc:
        return None, f"Failed to parse review result: {exc}"
    return result, None
```

**Pydantic model schema** (adw_modules/data_types.py:193-210):
```python
class ReviewIssue(BaseModel):
    review_issue_number: int
    issue_severity: Literal["blocker", "tech_debt", "skippable"]
    issue_description: str
    issue_resolution: str
    screenshot_path: Optional[str] = None
    screenshot_url: Optional[str] = None

class ReviewResult(BaseModel):
    success: bool
    review_summary: str
    review_issues: List[ReviewIssue] = []
```

## Template-to-Function Mapping

Complete reference of slash command templates and their consuming Python functions:

| Slash Command | Category | Python Function | Expected Output | Location |
|---------------|----------|-----------------|-----------------|----------|
| `/commit` | Message-Only | `create_commit_message()` | Commit message string | workflow_ops.py:272 |
| `/generate_branch_name` | Message-Only | `generate_branch_name()` | Branch name string | workflow_ops.py:138 |
| `/classify_issue` | Message-Only | `classify_issue()` | `/chore` or `/bug` or `/feature` | workflow_ops.py:115 |
| `/find_plan_file` | Path Resolution | `locate_plan_file()` | Relative path to plan file | workflow_ops.py:207 |
| `/patch` | Path Resolution | `create_and_implement_patch()` | Relative path to patch plan | workflow_ops.py:432 |
| `/implement` | Action | `implement_plan()` | Human-readable summary | workflow_ops.py:255 |
| `/chore`, `/bug`, `/feature` | Action | `build_plan()` | Human-readable summary | workflow_ops.py:189 |
| `/pull_request` | Action | `create_pull_request()` | PR URL string | workflow_ops.py:304 |
| `/review` | Structured Data | `run_review()` | `ReviewResult` JSON | workflow_ops.py:393 |
| `/document` | Structured Data | `document_changes()` | `DocumentationResult` JSON | workflow_ops.py:470 |

## Common Misalignment Patterns

### Pattern 1: Executing Actions Instead of Returning Messages

**Symptom**: Template performs git commands when Python expects only a string result
**Example**: `/commit` template runs `git commit -m "..."` instead of returning commit message
**Root Cause**: Template instructions unclear about action vs. message boundary

**Fix**:
```markdown
# /commit

## Instructions
- Inspect `git status` and `git diff --staged` to understand changes
- Generate a commit message following Conventional Commits format
- Return ONLY the message text
- Do NOT execute git commands (Python will handle actual commit)
```

**Evidence**: Fixed in #84 via commit `f5b7f62`

### Pattern 2: Including Explanatory Text with Output

**Symptom**: Python receives "The branch name is: feat/rate-limiting" instead of "feat/rate-limiting"
**Example**: `/generate_branch_name` returns formatted text with labels
**Root Cause**: Template doesn't emphasize output-only requirement

**Fix**:
```markdown
# /generate_branch_name

## CRITICAL: Output Format Requirements

Return **ONLY** the branch name as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The branch name is:", "I generated:")
- Markdown formatting (no bold, no backticks)
- Multiple lines or additional commentary
```

### Pattern 3: Absolute Paths Breaking Worktree Isolation

**Symptom**: Files created but not tracked by git in worktree
**Example**: Template uses `/full/path/to/file.md` instead of `docs/file.md`
**Root Cause**: Agent defaults to absolute paths when not instructed otherwise

**Fix**:
```markdown
# /chore (or /bug, /feature)

## Instructions
- Create plan file under `docs/specs/` directory
- Use relative paths for ALL file operations (e.g., `docs/specs/chore-87-plan.md`)
- Never use absolute paths (breaks worktree isolation)
- Ensure file is tracked by git before finishing
```

**Evidence**: Fixed in #84 via worktree validation improvements

### Pattern 4: Incorrect JSON Structure

**Symptom**: `ValueError: Failed to parse review result: missing field 'review_issues'`
**Example**: `/review` returns `{"success": true}` without required fields
**Root Cause**: Template doesn't show complete schema with all required fields

**Fix**:
```markdown
# /review

## Output Format
Return a JSON object matching this schema (all fields required):

{
  "success": boolean,
  "review_summary": string,
  "review_issues": []  // Must be present even if empty
}

**Incorrect (missing required field):**
{
  "success": true
}

**Correct:**
{
  "success": true,
  "review_summary": "No issues found",
  "review_issues": []
}
```

### Pattern 5: Premature Cleanup in Multi-Phase Workflows

**Symptom**: Subsequent phases fail because worktree was removed prematurely
**Example**: Plan phase cleans up worktree before build phase can use it
**Root Cause**: Template instructions suggest cleanup when worktree should persist

**Fix**:
```markdown
# /chore (or /bug, /feature)

## Important Notes
- Do NOT remove worktrees after creating plan
- Worktree must persist for subsequent phases (build, test, review)
- Cleanup happens automatically after PR creation (configurable via ADW_CLEANUP_WORKTREES)
```

**Evidence**: Fixed in #84 by removing premature cleanup instructions

## Testing Methodology

### Manual Testing for New Templates

When creating or modifying a template, test the complete workflow:

1. **Unit test the template response**:
   ```bash
   # Execute template directly with mock arguments
   claude --template .claude/commands/automation/commit.md \
     --args '["test_agent", "feat", {"number": 123, "title": "Test", "body": ""}]'
   ```

2. **Verify Python parsing**:
   ```python
   # Test that Python function handles the output correctly
   from adw_modules.workflow_ops import create_commit_message
   from adw_modules.data_types import GitHubIssue

   issue = GitHubIssue(number=123, title="Test", body="Test body")
   message, error = create_commit_message(
       agent_name="test",
       issue=issue,
       issue_class="/feat",
       adw_id="test123",
       logger=logger
   )
   assert message is not None
   assert error is None
   assert "feat" in message.lower()
   ```

3. **Integration test with real workflow**:
   ```bash
   # Run through full workflow for a test issue
   uv run adws/adw_phases/adw_plan.py 123 --skip-cleanup
   # Inspect logs and state
   cat agents/<adw_id>/adw_state.json
   cat logs/kota-db-ts/local/<adw_id>/adw_planner/execution.log
   ```

4. **Check for common failure modes**:
   - Does output include unexpected formatting?
   - Are relative paths used consistently?
   - Does JSON parse successfully?
   - Are all required fields present?
   - Does template avoid premature side effects?

### Automated Testing (Future Work)

**Phase 2** (tracked separately): Create `automation/adws/scripts/validate-prompt-alignment.py`
- Parse template markdown to extract output contract
- Cross-reference with Python function expectations
- Report mismatches in CI pipeline
- Integrate with pre-commit hooks

**Phase 3** (tracked separately): Add integration tests in `automation/adws/adw_tests/test_prompt_responses.py`
- Mock agent responses for each template category
- Verify Python parsing handles expected formats
- Test edge cases (malformed output, missing fields)
- Ensure error messages are actionable

## Template Development Checklist

When creating or modifying a slash command template:

- [ ] Identify template category (Message-Only, Path Resolution, Action, Structured Data)
- [ ] Document expected output format in template with examples
- [ ] Show both correct and incorrect outputs
- [ ] Specify what NOT to include (explanatory text, formatting, etc.)
- [ ] Use relative paths consistently (never absolute paths)
- [ ] For Action templates, clarify action vs. message boundary
- [ ] For Structured Data templates, provide complete JSON schema
- [ ] Test output with consuming Python function
- [ ] Verify error handling for malformed responses
- [ ] Update this guide if introducing new patterns

## Related Documentation

- **ADW Architecture**: `automation/adws/README.md`
- **Issue #84 Fix**: Commit `f5b7f62` (commit template), `bb631a1` (plan template)
- **Worktree Isolation**: `docs/specs/feature-65-worktree-isolation-cleanup.md`
- **Agent Environment Setup**: `automation/adws/adw_modules/agent.py`
- **Data Type Schemas**: `automation/adws/adw_modules/data_types.py`

## Version History

- **2025-10-13**: Initial version (issue #87)
  - Documented four template categories
  - Added complete template-to-function mapping
  - Captured common misalignment patterns from #84
  - Established testing methodology
