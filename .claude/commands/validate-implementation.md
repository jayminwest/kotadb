# /validate-implementation

Run repository validation gates after implementation. Choose the correct level based on scope, mirroring GEOsync’s structure but using KotaDB’s Bun tooling.

## Quick Reference

```bash
# Level 1 – Quick Gate (≤ 1 minute)
bun run lint
bun run typecheck

# Level 2 – Full Gate (2-3 minutes)
bun run lint
bun run typecheck
bun test

# Level 3 – Release Gate (4-6 minutes)
bun run lint
bun run typecheck
bun test
bun run build
```

## Level Selection Guide

| Change Type                          | Level | Commands to Run                                          |
| ------------------------------------ | ----- | -------------------------------------------------------- |
| Docs-only, configuration comments    | 1     | `bun run lint && bun run typecheck`                      |
| Core logic, new endpoints, bug fixes | 2     | `bun run lint && bun run typecheck && bun test`          |
| Release prep, migrations, auth flows | 3     | `bun run lint && bun run typecheck && bun test && bun run build` |

## How to Use

1. Resolve plan tasks, add/update tests, and ensure fixtures are committed.
2. Select the appropriate level from the table above (features/bugs default to Level 2; infra-critical tasks require Level 3).
3. Run commands in order. Stop immediately to fix failures before proceeding.
4. Capture command summaries for handoff (`bun test` counts, notable warnings).
5. Document the level executed and outcomes in your report or PR body.

## Troubleshooting

- **Lint errors**: `bun run lint --apply` for autofix-able issues; manually address remaining failures.
- **Type errors**: inspect the reported file and re-run `bun run typecheck` after fixes.
- **Tests**: scope with `bun test <pattern>` while debugging, then re-run the full suite.
- **Build**: fix type or runtime import errors surfaced during `bun run build`.

## Git Flow Alignment

- Branches follow `feat/|bug/|chore/` → `develop` → `main`.
- Run validation before committing, before pushing, and again ahead of PR creation (Level 2 minimum).
- Include validation evidence in `/pull_request` and `/pr-review` outputs for traceability.
