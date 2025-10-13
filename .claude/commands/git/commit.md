# /commit

Generate a git commit message for the staged work.

## Variables
- agent_name: $1 (planner or implementor)
- issue_type: $2 (feature, bug, chore)
- issue_json: $3 (GitHub issue payload)

## Instructions
- Commit message format: `<issue_type>: ${issue_number} - <short description>`.
- Description must be ≤ 60 characters, present tense, no trailing period.
- Preface the body (if needed) with `Generated with ADW ID: <adw_id>` is handled elsewhere—only craft the subject.
- Review `git diff HEAD` to understand staged changes before generating the message.
- **DO NOT execute git commands** (staging/committing is handled by the orchestration layer).

## CRITICAL: Commit Message Validation Rules

Your commit message will be validated by `automation/adws/adw_modules/validation.py`. It MUST pass these checks:

### Format Requirements
- **Conventional Commits format**: `<type>(<scope>): <subject>`
- **Valid types**: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **Subject length**: 1-72 characters (keep under 60 for best practices)
- **Optional scope**: You can add a scope in parentheses after the type (e.g., `feat(api):`)

### Meta-Commentary Patterns (FORBIDDEN in first line)

**DO NOT include these phrases anywhere in the commit message subject line:**
- ❌ `based on`
- ❌ `the commit should`
- ❌ `here is`
- ❌ `this commit`
- ❌ `i can see`
- ❌ `looking at`
- ❌ `the changes`
- ❌ `let me`

These patterns indicate agent reasoning leakage. The commit message should be a direct statement, not a description of your thought process.

## Examples

**✅ CORRECT (these will pass validation):**
```
chore: 98 - document test path resolution strategy
feat: 123 - add rate limiting middleware
fix: 456 - resolve API key validation bug
docs: 789 - update authentication guide
```

**❌ INCORRECT (these will FAIL validation):**
```
Based on the changes, I can see this is a documentation update
The commit should be: chore - update docs
Here is the commit message for the changes
This commit documents the test path resolution strategy
Looking at the diff, the changes add rate limiting
```

**Why the incorrect examples fail:**
- They contain meta-commentary patterns in the first line
- They explain what the commit is rather than stating what it does
- They sound like agent reasoning instead of a commit message

## Run
1. `git diff HEAD` (for context only, to understand the changes)

## Report
Return **ONLY** the commit subject line as plain text on a single line.

**DO NOT include:**
- Explanatory text (e.g., "The commit message is:", "I generated:")
- Markdown formatting (no **bold**, no ` ``` blocks`)
- Multiple lines or additional commentary
- Any of the forbidden meta-commentary patterns

**Correct output:**
```
chore: 98 - document test path resolution strategy
```

**INCORRECT output (do NOT do this):**
```
Based on the changes, the commit message should be:

**chore: 98 - document test path resolution strategy**

This commit documents the test path resolution strategy.
```
