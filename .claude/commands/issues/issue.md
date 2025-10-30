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
<<<<<<< HEAD
   - Review `.claude/commands/docs/conditional_docs/app.md` or `.claude/commands/docs/conditional_docs/automation.md` and open only the docs whose conditions match the work (e.g., `README.md`, `CLAUDE.md`, `docs/specs/**`).
=======
   - Review `.claude/commands/docs/conditional_docs.md` and open only the docs whose conditions match the work (e.g., `README.md`, `CLAUDE.md`, `docs/specs/**`).
>>>>>>> origin/main
   - Capture reproduction steps or business justification as needed.
   - **Identify issue relationships**: Check for dependencies, related work, blockers using `.claude/commands/docs/issue-relationships.md`
     - `gh issue list --search "<keywords>"` to find related issues
     - Review recent spec files in `docs/specs/` for relationship patterns
     - Check git history or PRs for prerequisite work
5. **Draft issue content**
   - Include sections for Description, Acceptance Criteria, Technical Approach (if known), Validation, and References.
   - **Add Issue Relationships section** if any dependencies/relationships exist (see `.claude/commands/docs/issue-relationships.md`)
   - Keep titles Conventional Commit compatible (e.g., `feat: describe capability`).
6. **Create the issue**
   - `gh issue create --title "<title>" --body-file <temp-body.md> --label "component:...,priority:...,effort:...,status:..."`
   - **Label requirements**: MUST include at least one label from each category:
     - Component: backend, api, database, testing, ci-cd, documentation, observability
     - Priority: critical, high, medium, low
     - Effort: small, medium, large
     - Status: needs-investigation, blocked, in-progress, ready-review
   - Example: `--label "component:backend,priority:medium,effort:small,status:needs-investigation"`
   - Record the returned issue number for downstream commands. Store it in your notes.
7. **Verify issuance and labels**
   - `gh issue view <number>` to confirm labels, body, assignee, and milestone.
   - Verify all four label categories are present: component, priority, effort, status
   - If labels are missing, add them immediately: `gh issue edit <number> --add-label "missing:labels"`

## Reporting

- Provide the new issue number, link, and key metadata (title, labels).
- Note any follow-up tasks (e.g., attach logs/screenshots, notify stakeholders).

## Output Schema

This command's output is validated against the following schema:

```json
{
  "type": "object",
  "properties": {
    "number": {
      "type": "number"
    },
    "title": {
      "type": "string"
    },
    "summary": {
      "type": "string"
    },
    "constraints": {
      "type": "array",
      "items": {
        "type": "string"
      }
    }
  },
  "required": ["number", "title", "summary"]
}
```

The output should be a JSON object containing the issue number, title, summary, and optional constraints array.
