# /make_worktree_name

Generate a valid git worktree name from a task description.

## Inputs
- `$1` (task_description): The task description or title to convert into a worktree name
- `$2` (prefix): Optional prefix for the worktree name (e.g., "feat", "bug", "chore"). Defaults to "feat".

## Instructions

1. Analyze the task description and extract the key concepts
2. Apply the following transformation rules:
   - Convert to lowercase
   - Replace spaces with hyphens
   - Remove all characters except alphanumeric and hyphens
   - Collapse multiple consecutive hyphens into a single hyphen
   - Trim leading and trailing hyphens
   - Limit to 50 characters total (including prefix)
   - Ensure the name is a valid git branch name
3. Prepend the prefix (if provided) followed by a hyphen
4. Return ONLY the worktree name, nothing else

## Examples

Input: "Add rate limiting for API endpoints", prefix: "feat"
Output: feat-add-rate-limiting-for-api-endpoints

Input: "Fix: authentication bug in login flow!", prefix: "bug"
Output: bug-fix-authentication-bug-in-login-flow

Input: "Update documentation for home server integration", prefix: "chore"
Output: chore-update-docs-home-server-integration

Input: "Implement tier-based rate limiting with caching & Redis", prefix: ""
Output: implement-tier-based-rate-limiting-caching

## Rules
- Must be valid git branch name (alphanumeric + hyphens only)
- Kebab-case format (lowercase with hyphens)
- Maximum 50 characters
- No special characters except hyphens
- No leading or trailing hyphens
- No consecutive hyphens

## Expected Output

Return a single line containing only the worktree name:
```
feat-add-rate-limiting
```

Do NOT include any explanatory text, markdown formatting, or additional output.
