# /pr

Publish a pull request once implementation is complete.

## Preconditions
- Clean working tree (`git status --short` empty) and all commits pushed to origin.
- Validation completed at **Level 2** (or higher) per `/validate-implementation`, with results captured for the PR body.
- Plan document and issue references updated with final status.

## Steps
1. **Git/GitHub sanity checks**: confirm branch name aligns with the git flow (`feat/…`, `bug/…`, `chore/…` → `develop` → `main`), inspect `git log --oneline --decorate --graph -5`, and ensure remote tracking with `git status -sb`.
2. **Re-validate**: rerun the selected validation level (Level 2 minimum) and capture logs; address failures before proceeding.
3. **Draft metadata**: prepare PR title, description, linked issues, checklist of validation commands, screenshots/logs if applicable.
4. **Create PR**: use `gh pr create --fill` (or manual entry) to open against `develop`; verify reviewers, labels, and milestones.
5. **Post-creation duties**: share PR link, confirm CI status via `gh pr status`, and note follow-up actions (docs, reviewers pinged).

## Reporting
- PR URL with title/branch.
- Summary of validation reruns and outstanding tasks.
- Any blockers, requested reviewers, or follow-up actions.
