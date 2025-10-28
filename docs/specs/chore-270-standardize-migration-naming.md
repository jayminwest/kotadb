# Chore Plan: Standardize Migration File Naming Conventions

## Context
The migration validation script (`bun run test:validate-migrations`) fails because the two migration directories use incompatible naming conventions:
- **Source directory** (`app/src/db/migrations/`): numbered format (`001_`, `002_`, ...)
- **Supabase directory** (`app/supabase/migrations/`): timestamped format (`20241001000001_`, ...)

The validation script uses `diff -r` which requires exact filename matches. This inconsistency blocks reliable drift detection and creates confusion about which convention to follow for new migrations.

**Why this matters now:**
- Migration sync validation is documented as a critical requirement in CLAUDE.md
- CI pipeline depends on this validation passing
- Developers need clear guidance on naming conventions for new migrations
- Drift detection is unreliable when filenames don't match

**Constraints:**
- Must preserve migration order and content integrity
- Must not break Supabase CLI tracking of applied migrations
- Must maintain compatibility with both local execution and remote deployment workflows

## Relevant Files
- `app/src/db/migrations/*.sql` — Source migration directory (12 files with numbered prefixes)
- `app/supabase/migrations/*.sql` — Supabase CLI copy (12 files with timestamped prefixes)
- `app/package.json` — Contains `test:validate-migrations` script definition (line 20)
- `CLAUDE.md` — Documents migration sync requirement and dual-directory architecture
- `docs/testing-setup.md` — Testing documentation that references migration validation

### New Files
None (this is purely a renaming and documentation update)

## Work Items

### Preparation
1. **Verify migration count consistency**: Confirm both directories have exactly 12 migration files
2. **Backup current state**: Create tarball of both migration directories before renaming
3. **Check for hardcoded filename references**: Search codebase for any references to numbered migration filenames
4. **Verify git branch**: Ensure working from correct branch (`chore/270-standardize-migration-naming` from `develop`)

### Execution
1. **Rename migrations in source directory** (`app/src/db/migrations/`):
   - `001_initial_schema.sql` → `20241001000001_initial_schema.sql`
   - `002_fulltext_search_index.sql` → `20241011000000_fulltext_search_index.sql`
   - `003_symbols_unique_constraint.sql` → `20241014000000_symbols_unique_constraint.sql`
   - `004_references_unique_constraint.sql` → `20241020000000_references_unique_constraint.sql`
   - `005_add_dependency_graph_table.sql` → `20241021000000_add_dependency_graph_table.sql`
   - `006_add_job_tracking_columns.sql` → `20241021000001_add_job_tracking_columns.sql`
   - `007_add_rls_context_functions.sql` → `20241021000002_add_rls_context_functions.sql`
   - `008_store_indexed_data_function.sql` → `20241021000003_store_indexed_data_function.sql`
   - `009_add_enum_to_symbol_kinds.sql` → `20241021000004_add_enum_to_symbol_kinds.sql`
   - `010_add_installation_id_to_repositories.sql` → `20241022000000_add_installation_id_to_repositories.sql`
   - `011_add_last_push_at_to_repositories.sql` → `20241023000000_add_last_push_at_to_repositories.sql`
   - `012_subscriptions.sql` → `20241023000001_subscriptions.sql`

2. **Update CLAUDE.md documentation**:
   - Add guidance on migration naming convention (timestamped format: `YYYYMMDDHHMMSS_description.sql`)
   - Document rationale: alignment with Supabase CLI expectations and concurrent development workflows
   - Add example for creating new migrations with timestamp prefix

3. **Update testing documentation** (`docs/testing-setup.md`):
   - Document migration naming convention requirement
   - Add note about timestamp format preventing merge conflicts in concurrent development

### Follow-up
1. **Run validation suite**: Execute all validation commands to confirm no breakage
2. **Verify Supabase CLI compatibility**: Test migration application with Supabase Local
3. **Test migration sync validation**: Run `bun run test:validate-migrations` to confirm it passes
4. **Document for future developers**: Ensure naming convention is clear in onboarding docs

## Step by Step Tasks

### Pre-flight Checks
- Create branch `chore/270-standardize-migration-naming` from `develop`
- Verify current directory has exactly 12 migrations in both directories
- Create backup tarball: `tar -czf migrations-backup-$(date +%Y%m%d-%H%M%S).tar.gz app/src/db/migrations app/supabase/migrations`
- Search for hardcoded filename references: `grep -r "001_\|002_\|003_" app/src app/tests --exclude-dir=migrations`

### Rename Migration Files
- Rename `001_initial_schema.sql` → `20241001000001_initial_schema.sql` in `app/src/db/migrations/`
- Rename `002_fulltext_search_index.sql` → `20241011000000_fulltext_search_index.sql` in `app/src/db/migrations/`
- Rename `003_symbols_unique_constraint.sql` → `20241014000000_symbols_unique_constraint.sql` in `app/src/db/migrations/`
- Rename `004_references_unique_constraint.sql` → `20241020000000_references_unique_constraint.sql` in `app/src/db/migrations/`
- Rename `005_add_dependency_graph_table.sql` → `20241021000000_add_dependency_graph_table.sql` in `app/src/db/migrations/`
- Rename `006_add_job_tracking_columns.sql` → `20241021000001_add_job_tracking_columns.sql` in `app/src/db/migrations/`
- Rename `007_add_rls_context_functions.sql` → `20241021000002_add_rls_context_functions.sql` in `app/src/db/migrations/`
- Rename `008_store_indexed_data_function.sql` → `20241021000003_store_indexed_data_function.sql` in `app/src/db/migrations/`
- Rename `009_add_enum_to_symbol_kinds.sql` → `20241021000004_add_enum_to_symbol_kinds.sql` in `app/src/db/migrations/`
- Rename `010_add_installation_id_to_repositories.sql` → `20241022000000_add_installation_id_to_repositories.sql` in `app/src/db/migrations/`
- Rename `011_add_last_push_at_to_repositories.sql` → `20241023000000_add_last_push_at_to_repositories.sql` in `app/src/db/migrations/`
- Rename `012_subscriptions.sql` → `20241023000001_subscriptions.sql` in `app/src/db/migrations/`

### Update Documentation
- Update `CLAUDE.md` Migration Sync Requirement section with naming convention guidance
- Add migration naming example: `YYYYMMDDHHMMSS_description.sql` (e.g., `20241024143000_add_new_feature.sql`)
- Document rationale: prevents merge conflicts, aligns with Supabase CLI, industry standard
- Update `docs/testing-setup.md` with migration naming convention note

### Validation
- Run `cd app && bun run test:validate-migrations` (should pass with no warnings)
- Run `cd app && bunx tsc --noEmit` (type-check should pass)
- Run `cd app && bun test` (full test suite should pass)
- Verify migration file count: `ls -1 app/src/db/migrations | wc -l` (should be 12)
- Verify filename parity: `diff <(ls -1 app/src/db/migrations) <(ls -1 app/supabase/migrations)` (should be empty)

### Git Operations
- Stage all changes: `git add -A`
- Commit with conventional format: `chore(database): standardize migration naming to timestamped format (#270)`
- Push branch: `git push -u origin chore/270-standardize-migration-naming`

## Risks

**Risk: Supabase CLI may not recognize renamed migrations**
- **Mitigation**: The `app/supabase/migrations/` directory already uses timestamped format and Supabase CLI tracks migrations via `supabase_migrations` table, not filenames. Renaming source directory has no impact on Supabase CLI.

**Risk: Code references to migration filenames break**
- **Mitigation**: Pre-flight grep confirms no hardcoded references to numbered filenames exist. Migration loading happens dynamically via directory listing.

**Risk: Migration order changes after renaming**
- **Mitigation**: Timestamps preserve exact order from numbered sequence. Validation step includes diffing sorted filename lists to confirm order preservation.

**Risk: Backup tarball not created before renaming**
- **Mitigation**: Pre-flight tasks include explicit backup creation with timestamped filename. Verify tarball exists before proceeding with renames.

## Validation Commands

```bash
# Migration sync validation (primary goal)
cd app && bun run test:validate-migrations

# Type-check
cd app && bunx tsc --noEmit

# Test suite
cd app && bun test

# Lint
cd app && bun run lint

# Migration count verification
test $(ls -1 app/src/db/migrations | wc -l) -eq 12 && echo "Migration count correct" || echo "ERROR: Migration count mismatch"

# Filename parity check
diff <(ls -1 app/src/db/migrations) <(ls -1 app/supabase/migrations) && echo "Filenames match" || echo "ERROR: Filename mismatch"

# Verify no numbered prefixes remain
! ls app/src/db/migrations/0*.sql 2>/dev/null && echo "No numbered files found" || echo "ERROR: Numbered files still exist"
```

## Commit Message Validation
All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `chore(database): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(database): standardize migration naming to timestamped format (#270)`

## Deliverables
- **Code changes**: 12 migration files renamed in `app/src/db/migrations/` from numbered to timestamped format
- **Documentation updates**:
  - `CLAUDE.md`: Migration naming convention guidance added
  - `docs/testing-setup.md`: Migration naming requirement documented
- **Validation proof**: `bun run test:validate-migrations` passes without warnings
- **No config updates required**: Validation script already uses `diff -r` which now works correctly
