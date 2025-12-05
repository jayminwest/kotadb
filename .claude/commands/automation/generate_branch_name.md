# /generate_branch_name

**Template Category**: Message-Only

Generate a Git branch name following KotaDB conventions. DO NOT execute any git commands.

## Variables
- issue_type: $1 (one of `feature`, `bug`, `chore`)
- adw_id: $2 (8 character run id)
- issue_json: $3 (GitHub issue payload)

## Instructions
- Branch format: `<git_prefix>/<issue_number>-<adw_id>-<concise-slug>`.
- Map `issue_type` to `git_prefix` using `feature → feat`, `bug → bug`, `chore → chore`.
- Derive `issue_number` from the JSON.
- Build `concise-slug` from the issue title (3–6 lowercase words, hyphen separated, alphanumeric only).
- Ensure the branch name is ≤ 80 characters and branches originate from `develop` (flow: `feat/|bug/|chore/` → `develop` → `main`).

## CRITICAL: Output Format Requirements

Return **ONLY** the branch name as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The branch name is:", "I generated:", "Here is:")
- Markdown formatting (no **bold**, no ` ``` blocks`, no # headers)
- Quotes, asterisks, or other punctuation around the branch name
- Multiple lines or additional commentary
- Git commands or command output

**Correct output:**
```
feat/123-abc12345-add-rate-limiting
```

**INCORRECT outputs (do NOT do this):**
```
The branch name is: feat/123-abc12345-add-rate-limiting
```

```
**feat/123-abc12345-add-rate-limiting**
```

```
I generated the following branch name:

feat/123-abc12345-add-rate-limiting

You can create this branch with: git checkout -b feat/123-abc12345-add-rate-limiting
```

## Output Schema

The output must match this pattern:
- Type: string
- Pattern: `^(feat|bug|chore)/[0-9]+-[a-f0-9]{8}-[a-z0-9-]+$`
- Max length: 80 characters
- No leading/trailing whitespace

## Important
- DO NOT run any git commands (git checkout, git fetch, git pull, etc.)
- Only generate and return the branch name
- The worktree-based workflow will create the actual branch
