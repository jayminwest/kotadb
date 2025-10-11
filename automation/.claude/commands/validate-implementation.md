# /validate-implementation

Run repository validation gates after implementation. Choose the correct level based on scope, mirroring GEOsync’s structure but using KotaDB’s Bun tooling.

## Quick Reference

```bash
# Level 1 – Quick Gate (≤ 1 minute)
bun run lint
bun run typecheck

# Level 2 – Integration Gate (3-4 minutes)
bun run lint
bun run typecheck
bun test --filter integration

# Level 3 – Release Gate (5-7 minutes)
bun run lint
bun run typecheck
bun test --filter integration
bun test
bun run build
```

## Level Selection Guide

| Change Type                          | Level | Commands to Run                                          |
| ------------------------------------ | ----- | -------------------------------------------------------- |
| Docs-only, configuration comments    | 1     | `bun run lint && bun run typecheck`                      |
| Core logic, new endpoints, bug fixes | 2     | `bun run lint && bun run typecheck && bun test --filter integration` |
| Release prep, migrations, auth flows | 3     | `bun run lint && bun run typecheck && bun test --filter integration && bun test && bun run build` |

## Environment Prerequisites

| Variable / Service        | Why It Matters                                        | Notes |
| ------------------------- | ----------------------------------------------------- | ----- |
| `SUPABASE_URL`            | Points tests at the shared Supabase project           | Load from `.env.develop`; do **not** swap in local mocks |
| `SUPABASE_SERVICE_KEY`    | Authenticates integration queries and failure cases   | Rotate via platform team when compromised |
| Background job processor  | Ensures async flows run during integration suites     | Start any required workers before Level 2+ |
| Observability (logs, etc) | Capture evidence that real services ran during tests | Attach snippets in PR report |

## Level Details

### Level 1 – Quick Gate
- Use when touching documentation or configuration comments only.
- Confirms lint + types stay clean; no automated tests beyond type safety.
- Expected duration: under one minute.

### Level 2 – Integration Gate
- Default for feature and bug work; mandates `/anti-mock` compliance.
- Runs integration-focused specs with `bun test --filter integration`, exercising Supabase via real credentials.
- Capture Supabase query logs or other proof that remote services were hit.

### Level 3 – Release Gate
- Required for schema, authentication, billing, or other high-risk paths.
- Executes Level 2 plus the full test suite and a build to surface regressions.
- Ensure background workers and webhooks are active so flows are validated end-to-end.

## How to Use

1. Resolve plan tasks, add/update tests, and ensure fixtures are committed with real-service coverage (see `/anti-mock`).
2. Select the appropriate level from the table above (features/bugs default to Level 2; infra-critical tasks require Level 3).
3. Run commands in order. Stop immediately to fix failures before proceeding.
4. Capture command summaries for handoff (`bun test --filter integration` counts, Supabase evidence, notable warnings).
5. Document the level executed and outcomes in your report or PR body, explicitly noting which real-service suites ran.

## Troubleshooting

- **Lint errors**: `bun run lint --apply` for autofix-able issues; manually address remaining failures.
- **Type errors**: inspect the reported file and re-run `bun run typecheck` after fixes.
- **Tests**: scope with `bun test <pattern>` while debugging, then re-run the full suite.
- **Build**: fix type or runtime import errors surfaced during `bun run build`.

## Git Flow Alignment

- Branches follow `feat/|bug/|chore/` → `develop` → `main`.
- Run validation before committing, before pushing, and again ahead of PR creation (Level 2 minimum).
- Include validation evidence in `/pull_request` and `/pr-review` outputs for traceability.
