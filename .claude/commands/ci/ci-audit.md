# /ci-audit

Evaluate CI health. Supply scope/context via `$ARGUMENTS` (e.g., timeframe, failing workflow).

## Pre-audit Git Prep
- `git fetch --all --prune`, confirm `develop` is up to date (`git pull --rebase`), and ensure a clean tree with `git status --short`.
- Capture current branch and relevant workflow files (`.github/workflows/**`).

## Workflow Inventory
- List active workflows, triggers, and environments (CI, CD, scheduled).
- Note ownership, secrets used, and recent modifications (`git log -- .github/workflows`).

## Data Collection
- Gather failure logs (`gh run list`, `gh run view <id>`), duration stats, and flake reports.
- Capture slowest jobs, retry patterns, and queued time.
- Identify secret usage, caching strategies, and external service dependencies.

## Analysis Checklist
- **Reliability**: flake rate, retry policies, alerting.
- **Performance**: runtime hotspots, parallelism, resource utilisation.
- **Coverage**: tests executed (unit, lint, e2e), gaps vs. expectations.
- **Security**: secret scoping, permissions, dependency scans.
- **Documentation**: clarity of README/CONTRIBUTING sections, runbooks.

## Output Requirements
- Prioritised list of issues with evidence (links to runs, logs).
- Proposed remediation items (short-term fixes and long-term improvements).
- Metrics snapshots (success rate, average runtime, queue time).

## Reporting
- Summary of audit findings grouped by severity.
- Recommended next actions with owners and timelines.
- Follow-up tickets or `/ci-update` commands to execute improvements.
