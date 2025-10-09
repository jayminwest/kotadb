# Supabase Setup Guide

This guide walks you through setting up a Supabase project for KotaDB development and production environments.

## Prerequisites

- Supabase account (sign up at https://supabase.com)
- Bun runtime installed (https://bun.sh)
- Git repository cloned locally

## Step 1: Create Supabase Project

1. Navigate to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in project details:
   - **Organization**: Select or create organization
   - **Project Name**: `kotadb-dev` (or `kotadb-staging`, `kotadb-prod`)
   - **Database Password**: Generate strong password (save securely)
   - **Region**: Choose closest to your deployment region
   - **Pricing Plan**: Free tier for dev, Pro for production
4. Click "Create new project"
5. Wait 2-3 minutes for provisioning

## Step 2: Configure Environment Variables

1. In Supabase dashboard, navigate to **Settings** → **API**
2. Copy the following values:

   - **Project URL** (e.g., `https://abcdefghij.supabase.co`)
   - **anon public** key (for RLS-enforced queries)
   - **service_role** key (for admin operations, **keep secret**)

3. Create `.env` file in project root:

```bash
# Copy from .env.sample
cp .env.sample .env
```

4. Add Supabase credentials to `.env`:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server Configuration
PORT=3000
```

**⚠️ Security Warning**: Never commit `.env` to version control. The `service_role` key bypasses Row Level Security and should only be used server-side.

## Step 3: Install Dependencies

```bash
# Install Supabase client and dependencies
bun install

# Install Supabase CLI (optional, for type generation)
bun add -d supabase
# OR globally:
# npm install -g supabase
```

## Step 4: Run Initial Migration

### Option A: Via Supabase Studio (Manual)

1. Open Supabase Studio: **Database** → **SQL Editor**
2. Copy contents of `src/db/migrations/001_initial_schema.sql`
3. Paste into SQL Editor
4. Click "Run" button
5. Verify success (should see "Success. No rows returned")
6. Navigate to **Database** → **Tables** to verify all tables created

### Option B: Via Migration Runner (Automated)

```bash
# Run migration system (creates tables + tracks migration)
bun run src/db/migrate.ts
```

Expected output:
```
Applying migration: 001_initial_schema.sql
Migration applied successfully (2.3s)
Migrations completed: 1 applied, 0 skipped
```

## Step 5: Verify Schema

1. In Supabase Studio, navigate to **Database** → **Tables**
2. Verify the following tables exist:
   - `api_keys`
   - `organizations`
   - `user_organizations`
   - `rate_limit_counters`
   - `repositories`
   - `index_jobs`
   - `indexed_files`
   - `symbols`
   - `references`
   - `dependencies`
   - `migrations`

3. Check **Database** → **Functions**:
   - `increment_rate_limit(text, integer)` should be listed

## Step 6: Test Row Level Security (RLS)

1. In Supabase Studio, open **SQL Editor**
2. Create a test user (if not using Supabase Auth yet):

```sql
-- Insert test user into auth.users (requires admin privileges)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'test@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now()
);
```

3. Test RLS context:

```sql
-- Set user context
SET LOCAL app.user_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

-- Try to query repositories (should return empty set)
SELECT * FROM repositories;

-- Insert a test repository
INSERT INTO repositories (id, user_id, full_name, git_url, default_branch)
VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'test/repo',
  'https://github.com/test/repo.git',
  'main'
);

-- Query again (should now return the inserted repo)
SELECT * FROM repositories;
```

4. Test isolation (change user context):

```sql
-- Switch to different user
SET LOCAL app.user_id = '00000000-0000-0000-0000-000000000000';

-- Query repositories (should return empty - RLS enforces isolation)
SELECT * FROM repositories;
```

If RLS is working correctly, the second query returns no rows because the user doesn't own any repositories.

## Step 7: Generate TypeScript Types

Generate TypeScript types from the Supabase schema for compile-time safety:

```bash
# Using Supabase CLI
supabase gen types typescript --project-id your-project-id > src/db/types.ts

# Or using npx (if CLI not installed globally)
npx supabase gen types typescript --project-id your-project-id > src/db/types.ts
```

**Note**: Replace `your-project-id` with your actual project ID (found in Project Settings → General).

Commit the generated `src/db/types.ts` file to version control.

## Step 8: Create Test API Key

For local testing, create a test API key manually:

```sql
-- Generate test API key
INSERT INTO api_keys (
  id,
  user_id,
  key_id,
  secret_hash,
  tier,
  rate_limit_per_hour,
  enabled
) VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- Replace with your test user ID
  'test_key_abc123',
  -- Bcrypt hash of 'test_secret_xyz789' (replace with real hash in production)
  '$2a$10$abcdefghijklmnopqrstuv.WXYZ0123456789ABCDEFGHIJKLM',
  'free',
  100,
  true
);
```

**Note**: In production, API keys should be generated by the application with proper bcrypt hashing. The above is for testing only.

## Step 9: Test Application Locally

1. Start the development server:

```bash
bun run src/index.ts
```

Expected output:
```
Database health check: OK
Server running on port 3000
```

2. Test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok"}
```

3. Test authenticated endpoint (replace with your test key):

```bash
curl -X POST http://localhost:3000/index \
  -H "Authorization: Bearer kota_free_test_key_abc123_test_secret_xyz789" \
  -H "Content-Type: application/json" \
  -d '{"repository": "test/repo", "ref": "main"}'
```

## Step 10: Configure Supabase Auth (Optional)

For production, enable authentication providers:

1. Navigate to **Authentication** → **Providers**
2. Enable desired providers:
   - **Email** (password-based login)
   - **GitHub** (OAuth for repository access)
   - **Google** (OAuth for user convenience)
3. Configure OAuth credentials:
   - GitHub: Create OAuth app at https://github.com/settings/developers
   - Google: Create OAuth credentials at https://console.cloud.google.com
4. Set redirect URLs to your application domain

## Troubleshooting

### Error: "relation auth.users does not exist"

**Solution**: Supabase Auth schema is automatically created. If missing, contact Supabase support or recreate project.

### Error: "permission denied for table api_keys"

**Solution**: Check RLS policies are enabled and `app.user_id` is set. Service role key bypasses RLS.

### Error: "too many connections"

**Solution**: Supabase uses pgBouncer for connection pooling. If hitting limits on free tier, upgrade to Pro.

### Migration fails with "duplicate key value"

**Solution**: Migration was already applied. Check `migrations` table:

```sql
SELECT * FROM migrations ORDER BY applied_at DESC;
```

To rollback:

```bash
bun run src/db/rollback.ts
```

### RLS policies not working

**Solution**: Verify `app.user_id` is set before queries:

```typescript
// In application code (not shown in spec yet)
const { data, error } = await supabase.rpc('set_config', {
  parameter: 'app.user_id',
  value: userId
});
```

## Production Checklist

Before deploying to production:

- [ ] Use Supabase Pro tier (for guaranteed uptime and backups)
- [ ] Enable database backups (automatic with Pro tier)
- [ ] Configure connection pooling limits (Settings → Database)
- [ ] Set up monitoring alerts (Settings → Monitoring)
- [ ] Rotate `service_role` key if exposed (Settings → API)
- [ ] Enable database replication (Pro tier, for disaster recovery)
- [ ] Test RLS policies with multiple user scenarios
- [ ] Set up CI/CD pipeline to run migrations automatically
- [ ] Configure rate limiting thresholds based on tier
- [ ] Enable Supabase Realtime (optional, for live updates)
- [ ] Set up log drain for application monitoring (Settings → Integrations)

## Useful Commands

```bash
# Run migrations
bun run src/db/migrate.ts

# Rollback last migration
bun run src/db/rollback.ts

# Check pending migrations (dry-run)
bun run src/db/migrate.ts --dry-run

# Generate TypeScript types
supabase gen types typescript --project-id <project-id> > src/db/types.ts

# Type-check code
bunx tsc --noEmit

# Run tests
bun test

# Start server in watch mode
bun --watch src/index.ts
```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)
- [KotaDB Schema Documentation](./schema.md)

---

**Need help?** Open an issue at https://github.com/kotadb/kotadb/issues
