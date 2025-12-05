# /patch

**Template Category**: Path Resolution

Create a focused patch plan to address review feedback without deviating from scope.

## Variables
- adw_id: $1 (ADW execution ID)
- review_change_request: $2 (description of required changes)
- spec_path: $3 (relative path to original spec file, may be empty)
- agent_name: $4 (patch agent name)

## Instructions
- Review the change request to understand what needs fixing
- If spec_path provided, read it to maintain alignment with original intent
- Inspect `git diff origin/develop...HEAD` to see current implementation state
- Create a targeted patch plan under `docs/specs/` named `patch-<adw_id[:8]>-<slug>.md`
- Build `<slug>` from the change request using 2-4 lowercase, hyphenated words
- Keep changes minimal: only touch what's needed to address the feedback
- DO NOT expand scope beyond the review issues being resolved
- Use relative paths for all file operations (worktree isolation)

## Patch Plan Format
```md
# Patch Plan: <concise name>

## Review Feedback
<Summary of what needs to be fixed>

## Changes Required
- <file path> — <specific change needed>

## Step by Step Tasks
### Fix 1: <issue description>
- <actionable steps>

### Validation
- Run appropriate validation level from `/validate-implementation`
- Confirm fixes resolve the review issues

## Affected Files
- <path> — <change type>
```

## CRITICAL: Output Format Requirements

After creating the patch plan file, return **ONLY** the relative path as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The patch plan is located at:", "I created:")
- Markdown formatting or code blocks (no ``` backticks)
- Quotes, asterisks, or other punctuation around the path
- Multiple lines or additional commentary
- Git status prefixes (no "?? ", "M ", "A ")

**Correct output:**
```
docs/specs/patch-abc12345-fix-auth-tests.md
```

**INCORRECT outputs (do NOT do this):**
```
Created patch plan at:

**docs/specs/patch-abc12345-fix-auth-tests.md**
```

```
The patch plan has been created at: docs/specs/patch-abc12345-fix-auth-tests.md

You can now run /implement to apply the fixes.
```

```
?? docs/specs/patch-abc12345-fix-auth-tests.md
```

## Report
Return only the relative path to the patch plan file, nothing else.
