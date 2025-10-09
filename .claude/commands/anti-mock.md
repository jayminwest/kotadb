# /anti-mock

Baseline expectations for KotaDB’s anti-mock testing philosophy. Call this command (or link to it from other commands) whenever implementation or planning work might fall back to stubs or hand-rolled doubles.

## Core Principles
- Exercise real integrations (Supabase, background jobs, HTTP boundaries) in tests whenever possible.
- Prefer fixture data seeded into the shared Supabase test project via migration scripts or helper commands.
- Inject failure modes by toggling real configuration (timeouts, revoked keys) instead of simulating behaviour with bespoke mocks.
- Document any temporary exceptions and schedule follow-up work to restore real-service coverage.

## Required Tooling
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` for the shared test project (see `docs/environment.md`).
- Bun scripts: `bun test`, `bun test --filter integration`, `bun test --filter e2e` (shortcuts for real-service suites).
- Failure helpers under `src/testing/failure-injection/**` for orchestrating degraded scenarios.

## Implementation Checklist
1. Inspect existing tests touching the affected modules; remove or decline new stubs (`createMock*`, `fake*`, manual spies).
2. Seed or update fixture data required for the scenario in Supabase (use migrations or seed scripts); capture clean-up steps if the suite mutates state.
3. Cover success + failure paths using real clients. If Supabase is unreachable, mark the test `skip` with an inline `TODO` referencing the follow-up issue.
4. Record validation evidence that proves real integrations were exercised (command output, Supabase logs, etc.).

## Troubleshooting
- **Supabase downtime**: pause implementation and escalate. Do not introduce mocks as a workaround.
- **Slow suites**: scope with focused filters locally, but ensure full integration suites run before finishing the task.
- **Secrets rotation**: coordinate with platform team; update `.env.example` and note recovery steps in PR description.

## Reporting Expectations
- Call out which real-service suites ran in `/pull_request` and `/pr-review` outputs.
- Highlight any remaining mocks and the follow-up issue tracking their removal.

