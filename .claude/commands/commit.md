# /commit

Create a git commit for the staged work.

## Variables
- agent_name: $1 (planner or implementor)
- issue_type: $2 (feature, bug, chore)
- issue_json: $3 (GitHub issue payload)

## Instructions
- Commit message format: `<issue_type>: ${issue_number} - <short description>`.
- Description must be ≤ 60 characters, present tense, no trailing period.
- Preface the body (if needed) with `Generated with ADW ID: <adw_id>` is handled elsewhere—only craft the subject.
- Review `git diff HEAD` to understand staged changes before committing.

## Run
1. `git diff HEAD`
2. `git add -A`
3. `git commit -m "<generated_subject>"`

## Report
Return only the commit subject line.
