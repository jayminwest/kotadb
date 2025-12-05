# /ci:investigate

**Template Category**: Action
**Prompt Level**: 2 (Parameterized)

Investigate CI failures for a specific pull request and report findings with a remediation plan. Provide the PR number via `$ARGUMENTS`.

## Pre-investigation Setup
- `git fetch --all --prune`, `git pull --rebase`, ensure local `develop` is up to date, and start from a clean tree (`git status --short`).
- DO NOT checkout the PR branch or make any code changes during investigation.
- This command is diagnostic only - use `/ci-update` for implementing fixes.

## PR Context Gathering
- Fetch PR metadata: `gh pr view $ARGUMENTS --json number,title,headRefName,baseRefName,state,isDraft,author,labels,createdAt`
- Fetch linked issues from PR description to understand context and expected behavior
- Review PR diff to understand scope of changes: `gh pr diff $ARGUMENTS --stat`
- Identify which workflows are expected to run based on:
  - Path filters in `.github/workflows/` (e.g., `app/**` triggers `app-ci.yml`)
  - Branch patterns (feat/*, bug/*, chore/*, etc.)
  - Event triggers (push, pull_request)

## CI Failure Analysis
- List all workflow runs for the PR: `gh run list --branch <head-ref> --limit 10`
- For each failed workflow:
  - Get run details: `gh run view <run-id>`
  - Download failure logs: `gh run view <run-id> --log-failed`
  - Identify failed jobs and steps within the workflow
  - Extract error messages, stack traces, and exit codes
- Categorize failure types:
  - **Test failures**: Unit, integration, or e2e test failures with specific test names
  - **Lint/typecheck failures**: ESLint errors, TypeScript compilation errors
  - **Build failures**: Docker build errors, dependency resolution failures
  - **Infrastructure failures**: Container startup failures, network timeouts, service health checks
  - **Flaky tests**: Intermittent failures across multiple runs (check run history)

## Root Cause Analysis
- **For test failures**:
  - Identify failing test file and line number from stack trace
  - Review test code and related implementation changes in PR diff
  - Check if test relies on external services (Supabase, Docker) and validate infrastructure setup
  - Look for timing issues, race conditions, or environment-specific behavior
- **For lint/typecheck failures**:
  - Extract exact error locations (file, line, column) from compiler output
  - Review related code changes in PR diff
  - Check for missing type definitions, unused imports, or style violations
- **For build failures**:
  - Identify failing build step (dependency install, Docker build, etc.)
  - Review `package.json`, `Dockerfile`, or `docker-compose.yml` changes in PR diff
  - Check for missing dependencies, version conflicts, or syntax errors
- **For infrastructure failures**:
  - Review CI workflow file (`.github/workflows/`) for configuration issues
  - Check Docker Compose logs for container startup errors
  - Verify environment variable setup (e.g., `.env.test` generation in CI)
  - Validate service health checks and port mapping

## Cross-reference with Recent Changes
- Check if similar failures exist in other PRs or recent main/develop commits: `gh run list --workflow <workflow-name> --limit 20`
- Review recent changes to CI configuration: `git log --oneline --no-merges -- .github/workflows/ | head -20`
- Identify if failure is PR-specific or systemic (affects multiple branches)

## Evidence Collection
- Capture key log snippets showing error messages (max 50 lines per failure)
- Document affected workflow files, jobs, and steps
- List related files changed in PR that may have caused failures
- Note any recent CI configuration changes that may have introduced regressions

## Remediation Plan
Provide a prioritized plan with:
1. **Immediate fixes** (quick wins that unblock the PR):
   - Specific code changes needed (file paths and line numbers)
   - Configuration adjustments (env vars, workflow settings)
   - Dependency updates or rollbacks
2. **Validation steps** (how to verify fixes):
   - Local reproduction commands (e.g., `cd app && bun test`)
   - CI validation approach (push to branch, re-run workflows)
3. **Follow-up actions** (longer-term improvements):
   - Flake detection and retry policies
   - Test infrastructure hardening
   - CI workflow optimizations
   - Documentation updates

## Reporting Format
Provide a structured report with the following sections:

### Summary
- PR number, title, author, and branch name
- Number of failed workflows and total failure count
- Failure category (test, lint, build, infrastructure, flaky)
- Impact assessment (blocking vs. non-blocking)

### Failed Workflows
For each failed workflow:
- Workflow name and run ID
- Failed job names and step names
- Error messages (key snippets)
- Links to workflow run: `https://github.com/user/repo/actions/runs/<run-id>`

### Root Cause
- Primary cause of failure (code issue, config issue, infrastructure issue, etc.)
- Files changed in PR that contributed to failure
- Recent CI changes that may have introduced regression
- Evidence supporting diagnosis (log excerpts, error codes)

### Remediation Plan
1. **Immediate Fixes**:
   - Action 1: [description] (file:line)
   - Action 2: [description] (file:line)
2. **Validation Steps**:
   - Local: [command]
   - CI: [approach]
3. **Follow-Up Actions**:
   - Item 1: [description] (optional issue/PR reference)
   - Item 2: [description] (optional issue/PR reference)

### Next Steps
- Recommended owner for fix (PR author, maintainer, etc.)
- Estimated effort (small, medium, large)
- Related commands to execute (e.g., `/ci-update`, `/pr-review`)

## Important Notes
- This command is **read-only** - no code edits, commits, or GitHub changes should be made
- Do not run local tests or start services during investigation (analysis only)
- If root cause is unclear, document ambiguity and suggest additional diagnostic steps
- For flaky tests, recommend retry policy adjustments or test infrastructure improvements
- Always provide actionable recommendations with specific file paths and commands
