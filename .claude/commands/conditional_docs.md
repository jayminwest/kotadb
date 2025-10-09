# Conditional Documentation Guide

Use this reference to decide which KotaDB documentation sources to consult before you start working. Read only the docs whose conditions match your task so you stay efficient.

## Instructions
- Understand the request or issue scope first.
- Scan the Conditional Documentation list below; when a condition applies, open that doc and incorporate the guidance before proceeding.
- Prioritise the most specific documents (specs/vision) after you’ve covered the foundational repos docs.
- Skip docs that are clearly unrelated—avoid over-reading.

## Conditional Documentation

- README.md
  - Conditions:
    - When you are new to the repository or need an overview of tooling and workflows
    - When you must run or debug the Bun API service locally
    - When verifying required environment variables or docker commands

- CLAUDE.md
  - Conditions:
    - When editing files under `src/**` (API, indexer, database layers) and you need architecture context
    - When working with TypeScript path aliases or Bun-specific project structure
    - When clarifying validation commands or development workflows

- docs/supabase-setup.md
  - Conditions:
    - When integrating or troubleshooting Supabase services, keys, or environment variables
    - When running or authoring migrations that interact with Supabase
    - When preparing staging/production infrastructure that depends on Supabase

- docs/schema.md
  - Conditions:
    - When modifying database schema, migrations, or RLS policies
    - When debugging data flows between API routes and the database
    - When designing new tables, relationships, or rate-limiting behaviour

- docs/specs/chore-27-standardize-postgres-remove-sqlite.md
  - Conditions:
    - When removing SQLite implementation and migrating to Postgres/Supabase
    - When refactoring database query layer (src/api/queries.ts) or bootstrap logic (src/index.ts)
    - When working on issue #27 or related database standardization tasks
    - When updating type definitions from SQLite to Supabase schemas

- docs/migration-sqlite-to-supabase.md
  - Conditions:
    - When helping developers upgrade from pre-PR#29 SQLite-based code
    - When resolving merge conflicts related to database layer changes
    - When troubleshooting "module not found: @db/schema" or table name errors
    - When migrating existing test data from SQLite to Supabase

- adws/README.md
  - Conditions:
    - When implementing or modifying modules under `adws/adw_modules/**`
    - When updating ADW phase scripts (`adw_plan.py`, `adw_build.py`, etc.)
    - When debugging ADW orchestration, logging, or state persistence

- docs/vision/*.md
  - Conditions:
    - When working on roadmap initiatives tied to long-term product epics
    - When you need to confirm scope against strategic goals or sequencing
    - When preparing discovery or planning work that spans multiple domains

- .claude/commands/anti-mock.md
  - Conditions:
    - When planning or implementing changes that add or modify automated tests
    - When touching infrastructure, data access layers, or background jobs where mocks might be tempting
    - When validation requires Supabase or other third-party integrations

- docs/testing-setup.md
  - Conditions:
    - When setting up local testing environment with Supabase local instance
    - When troubleshooting test failures related to authentication or database connections
    - When writing new tests that require real Supabase integration
    - When debugging Docker-based test infrastructure or CI test pipeline
    - When onboarding new developers who need to run the test suite locally

- docs/specs/chore-31-replace-test-mocks-supabase-local.md
  - Conditions:
    - When working on issue #31 or related antimocking initiatives
    - When refactoring tests from mocked Supabase clients to real database integration
    - When removing `tests/helpers/supabase-mock.ts` or `tests/helpers/auth-mock.ts`
    - When implementing test database helpers or seed scripts
    - When troubleshooting authentication test failures in CI/CD pipeline

- docs/specs/chore-33-fix-failing-tests-antimocking.md
  - Conditions:
    - When working on issue #33 or fixing test failures after antimocking migration
    - When debugging port configuration issues (54322 vs 54326)
    - When fixing environment variable initialization order in tests
    - When tests fail with "401 Unauthorized" or "null API key validation"
    - When addressing cache timing test flakiness
    - When troubleshooting Supabase Local connectivity in tests

- docs/specs/feature-28-supabase-local-env-test.md
  - Conditions:
    - When working on issue #28 or enhancing test infrastructure automation
    - When implementing or modifying Supabase CLI integration (supabase start/stop/status)
    - When working with auto-generated .env.test workflow or scripts/generate-env-test.sh
    - When adding or updating package.json test scripts (test:setup, test:teardown, test:reset)
    - When troubleshooting Supabase CLI configuration or custom port setup
    - When onboarding new developers and explaining the test environment setup process
