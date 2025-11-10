# Migration Drift Fix: API Key Revocation

## Issue

PR #427 (develop → main) failed on Supabase Preview deployment with error:

```
ERROR: column "revoked_at" of relation "api_keys" already exists (SQLSTATE 42701)
At statement: 0
-- Add revoked_at column to api_keys table for soft delete support
ALTER TABLE api_keys
ADD COLUMN revoked_at TIMESTAMPTZ
```

## Root Cause

**Migration Timestamp Mismatch Between Environments:**

- **Staging environment**: Has migration `20251105230821_add_api_key_revocation` (applied Nov 5, 2025 23:08:21 UTC)
- **Source code**: Has migration `20251105205054_add_api_key_revocation.sql` (timestamped Nov 5, 2025 20:50:54 UTC)

Both migrations added the same `revoked_at` column and index, but with different timestamps. This created a migration drift scenario where:

1. Staging had the column from the earlier `230821` migration
2. Source code attempted to apply the `205054` migration
3. The `ALTER TABLE ADD COLUMN` statement failed because the column already existed

## Timeline Analysis

```
20:50:54 UTC - Migration timestamp in source code
23:08:21 UTC - Migration timestamp in staging environment (2h 17m later)
```

This suggests the migration was initially created and deployed to staging, then later regenerated or renamed with an earlier timestamp in the source repository.

## Solution

Made the migration **idempotent** using PostgreSQL's `IF NOT EXISTS` clause:

### Before (Non-Idempotent)
```sql
ALTER TABLE api_keys
ADD COLUMN revoked_at TIMESTAMPTZ;

CREATE INDEX idx_api_keys_revoked_at ON api_keys(revoked_at)
WHERE revoked_at IS NOT NULL;
```

### After (Idempotent)
```sql
ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at ON api_keys(revoked_at)
WHERE revoked_at IS NOT NULL;
```

## Files Modified

- `app/src/db/migrations/20251105205054_add_api_key_revocation.sql`
- `app/supabase/migrations/20251105205054_add_api_key_revocation.sql`

Both migration directories updated to maintain sync requirement (see `CLAUDE.md` § Migration Sync Requirement).

## Validation

```bash
# Verify migration sync
cd app && bun run test:validate-migrations

# Test against local Supabase (applies migrations twice to verify idempotency)
cd app && ./scripts/setup-test-db.sh
```

## Prevention

**Best Practices for Future Migrations:**

1. **Use idempotent SQL where possible**:
   - `ADD COLUMN IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - `DROP TABLE IF EXISTS`

2. **Never rename migration files after deployment** - migration timestamps must remain stable once applied to any environment

3. **Document migration drift fixes** - add inline comments explaining why `IF NOT EXISTS` was added

4. **Test migrations in staging before merging** - catch timestamp conflicts early

## Related

- Issue: Migration drift between environments
- PR: #427 (develop → main release)
- Migration: `20251105205054_add_api_key_revocation.sql`
- Staging migration: `20251105230821_add_api_key_revocation`
