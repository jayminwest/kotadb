# /issue

Draft and file a GitHub issue for upcoming work. Pass desired metadata via `$ARGUMENTS` (e.g., title, labels, assignees).

## Steps
1. **Git hygiene**: `git fetch --all --prune`, `git pull --rebase`, note the current branch, and ensure `git status --short` is clean before drafting.
2. **Deduplicate**: search existing issues/PRs (`gh issue list`, `gh pr list`, repository labels) to avoid duplicates; document findings.
3. **Gather context**: review recent commits, logs, or conversations; capture reproduction details or business motivations.
4. **Define taxonomy**: align labels/milestones with team conventions, referencing `$ARGUMENTS` metadata where provided.
5. **Draft issue**: compose markdown covering problem statement, expected outcome, environment details, and validation ideas.
6. **Create issue**: use `gh issue create` (or GitHub UI) with the curated metadata; double-check rendered formatting.
7. **Verify + broadcast**: confirm the issue exists (`gh issue view <number>`), update relevant trackers, and ensure git status remains clean.

## Reporting
- Link to the created issue with assigned metadata.
- Summary of context/reproduction and any related issues discovered.
- Follow-up actions or dependencies noted during filing.
