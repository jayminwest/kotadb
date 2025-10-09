# GitHub Issue Creation

Create a rigorously labeled GitHub issue capturing the upcoming work. Follow this sequence so downstream commands (plan, implement) have complete context.

## Steps

1. **Sync repo state**
   - `git fetch --all --prune`
   - `git status --short` (ensure clean working tree before opening an issue)
2. **Avoid duplicates**
   - `gh issue list --search "<keywords>" --state all`
   - If a related issue exists, link and update instead of creating a duplicate.
3. **Confirm label taxonomy (MANDATORY)**
   - `gh label list --limit 100`
   - Ensure you have one label from each required category: component, priority, effort, status. Add optional methodology/risk labels if useful.
4. **Collect context**
   - Review `.claude/commands/conditional_docs.md` and open only the docs whose conditions match the work (e.g., `README.md`, `CLAUDE.md`, `docs/specs/**`).
   - Capture reproduction steps or business justification as needed.
5. **Draft issue content**
   - Include sections for Description, Acceptance Criteria, Technical Approach (if known), Validation, and References.
   - Keep titles Conventional Commit compatible (e.g., `feat: describe capability`).
6. **Create the issue**
   - `gh issue create --title "<title>" --body-file <temp-body.md> --label "component:...,priority:...,effort:...,status:..."`
   - Record the returned issue number for downstream commands. Store it in your notes.
7. **Verify issuance**
   - `gh issue view <number>` to confirm labels, body, assignee, and milestone.

## Reporting

- Provide the new issue number, link, and key metadata (title, labels).
- Note any follow-up tasks (e.g., attach logs/screenshots, notify stakeholders).
