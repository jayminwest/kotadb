# Troubleshooting: Git Clone Authentication Failures

This guide helps diagnose and resolve git clone authentication failures during repository indexing. These failures typically manifest as exit code 128 with error message: `fatal: could not read Username for 'https://github.com': No such device or address`.

## Quick Diagnosis

Run through this checklist to identify the root cause:

1. **GitHub App Credentials Missing**
   - Run validation script: `cd app && bun run scripts/validate-github-app-config.ts`
   - Check for `FAIL` status on `GITHUB_APP_ID` or `GITHUB_APP_PRIVATE_KEY`

2. **GitHub App Not Installed**
   - Visit: https://github.com/settings/installations
   - Verify KotaDB GitHub App is installed on your account
   - Verify app has access to the failing repository

3. **Installation ID Not Populated**
   - Query database: `SELECT id, full_name, installation_id FROM repositories WHERE full_name = 'owner/repo'`
   - If `installation_id` is `NULL`, lookup failed or GitHub App is not installed

4. **Failed Lookup Cached**
   - Check logs for: `Skipping cached failed lookup for owner/repo`
   - Wait 1 hour for automatic cache expiration or restart API server

## Common Failure Modes

### Mode 1: Missing Environment Variables

**Symptoms:**
- No `[Installation Lookup]` log messages in API server logs
- Git clone fails immediately with exit code 128
- Database shows `installation_id` is `NULL` for all repositories

**Diagnosis:**
```bash
# Check environment variables are set (production)
fly secrets list --app kotadb-production

# Check environment variables are set (local development)
cd app && bun run -e 'console.log({
  appId: process.env.GITHUB_APP_ID,
  hasPrivateKey: !!process.env.GITHUB_APP_PRIVATE_KEY
})'
```

**Resolution:**
1. Create GitHub App following `docs/github-app-setup.md` if not already created
2. Set environment variables:
   ```bash
   # Production (Fly.io)
   fly secrets set GITHUB_APP_ID=<id> GITHUB_APP_PRIVATE_KEY="$(cat app.pem)" --app kotadb-production

   # Local development
   echo "GITHUB_APP_ID=<id>" >> app/.env
   echo "GITHUB_APP_PRIVATE_KEY=\"$(cat app.pem)\"" >> app/.env
   ```
3. Restart API server to load new environment variables
4. Test with validation script: `cd app && bun run scripts/validate-github-app-config.ts`

**Expected outcome:** Validation script shows `[PASS] ✓ GITHUB_APP_ID` and `[PASS] ✓ GITHUB_APP_PRIVATE_KEY`

### Mode 2: GitHub App Not Installed

**Symptoms:**
- Logs show: `[Installation Lookup] Found 0 installation(s)`
- Or: `[Installation Lookup] No installation found for owner/repo`
- Validation script shows `Found 0 installation(s)`

**Diagnosis:**
```bash
# Run validation script to check installations
cd app && bun run scripts/validate-github-app-config.ts

# Check GitHub installations via web UI
# Visit: https://github.com/settings/installations
```

**Resolution:**
1. Navigate to GitHub App settings: https://github.com/settings/apps/YOUR_APP_NAME
2. Click "Install App" in left sidebar
3. Select account/organization to install on
4. Choose repository access:
   - "All repositories" (convenient but broad)
   - "Only select repositories" (recommended, choose specific repos)
5. Click "Install"
6. Note installation ID from URL: `https://github.com/settings/installations/{installation_id}`
7. Trigger re-indexing for affected repository

**Expected outcome:** Validation script shows `Found 1+ installation(s)` with account details

### Mode 3: Invalid Private Key Format

**Symptoms:**
- Logs show: `[Installation Lookup] GitHub App authentication failed`
- Validation script shows: `[FAIL] ✗ GITHUB_APP_PRIVATE_KEY: Invalid format`
- API error: "Bad credentials" or "expecting: ANY PRIVATE KEY"

**Diagnosis:**
```bash
# Test private key format
echo "$GITHUB_APP_PRIVATE_KEY" | openssl rsa -check -noout
```

**Resolution:**
1. Download new private key from GitHub App settings
2. Verify key includes header and footer:
   ```
   -----BEGIN RSA PRIVATE KEY-----
   (key contents)
   -----END RSA PRIVATE KEY-----
   ```
3. Set environment variable with proper escaping:
   ```bash
   # Production (Fly.io) - reads directly from file
   fly secrets set GITHUB_APP_PRIVATE_KEY="$(cat kotadb.pem)" --app kotadb-production

   # Local development - include literal newlines
   # Copy entire key including headers into .env file
   ```
4. Restart API server
5. Test with: `echo "$GITHUB_APP_PRIVATE_KEY" | openssl rsa -check`

**Expected outcome:** `RSA key ok` from openssl validation

### Mode 4: Failed Lookup Cached

**Symptoms:**
- Logs show: `Skipping cached failed lookup for owner/repo (cached Xm ago, TTL=60m)`
- Previous attempts failed, now cached for 1 hour
- Credentials are now fixed but repository still fails

**Diagnosis:**
```bash
# Check production logs for cache messages
fly logs --app kotadb-production | grep "cached failed lookup"
```

**Resolution:**
Option A (automatic): Wait 1 hour for cache to expire

Option B (manual): Restart API server to clear in-memory cache
```bash
# Production
fly restart --app kotadb-production

# Local development
# Stop and restart dev server (Ctrl+C, then ./scripts/dev-start.sh)
```

Option C (immediate): Delete and recreate repository record
```sql
-- CAUTION: This deletes all index jobs and files for the repository
DELETE FROM repositories WHERE full_name = 'owner/repo' AND user_id = '<user-id>';
```

**Expected outcome:** Next indexing attempt queries GitHub API (no cache skip message)

### Mode 5: GitHub API Rate Limit

**Symptoms:**
- Logs show: `GitHub API rate limit exceeded for owner/repo`
- Status code 403 in API errors
- Validation script fails with rate limit error

**Diagnosis:**
```bash
# Check rate limit status via GitHub CLI
gh api rate_limit

# Or via curl with GitHub token
curl -H "Authorization: Bearer <token>" https://api.github.com/rate_limit
```

**Resolution:**
1. Wait for rate limit window to reset (shown in rate_limit response)
2. For production, consider using GitHub App installation tokens (higher rate limits)
3. Reduce indexing frequency if hitting limits regularly

**Expected outcome:** Rate limit resets, subsequent API calls succeed

### Mode 6: Private Repository Without Installation Token

**Symptoms:**
- Git clone fails with: `Repository not found` or `authentication required`
- Repository is private
- `installation_id` is `NULL` in database

**Diagnosis:**
```sql
-- Check repository visibility and installation_id
SELECT id, full_name, installation_id, created_at
FROM repositories
WHERE full_name = 'owner/repo'
ORDER BY created_at DESC
LIMIT 1;
```

**Resolution:**
1. Ensure GitHub App is installed on the repository (see Mode 2)
2. Verify `installation_id` is populated after installation
3. If still NULL, trigger manual re-population:
   ```bash
   # Submit new indexing job (will populate installation_id)
   curl -X POST https://kotadb.io/api/index \
     -H "Authorization: Bearer <api-key>" \
     -H "Content-Type: application/json" \
     -d '{"repository": "owner/repo"}'
   ```

**Expected outcome:** Database shows non-NULL `installation_id`, git clone succeeds

## Diagnostic Commands

### Production Environment (Fly.io)

```bash
# Check environment secrets are set
fly secrets list --app kotadb-production

# Check deployed git SHA
fly ssh console --app kotadb-production -C "git rev-parse HEAD"

# Monitor real-time logs
fly logs --app kotadb-production --timestamps

# Search logs for installation lookup messages
fly logs --app kotadb-production | grep "Installation Lookup"

# Search logs for git clone errors
fly logs --app kotadb-production | grep "git clone"

# Restart service (clears in-memory cache)
fly restart --app kotadb-production
```

### Database Queries

```sql
-- Check repository installation_id
SELECT id, full_name, installation_id, created_at
FROM repositories
WHERE full_name = 'owner/repo'
ORDER BY created_at DESC
LIMIT 1;

-- Check failed indexing jobs
SELECT id, status, error_message, stats, created_at
FROM index_jobs
WHERE repository_id IN (
  SELECT id FROM repositories WHERE full_name = 'owner/repo'
)
ORDER BY created_at DESC
LIMIT 10;

-- Find all repositories with NULL installation_id
SELECT id, full_name, created_at
FROM repositories
WHERE installation_id IS NULL
ORDER BY created_at DESC
LIMIT 20;

-- Check job failure distribution
SELECT status, COUNT(*) as count
FROM index_jobs
GROUP BY status;
```

### Local Testing

```bash
# Run GitHub App validation script
cd app && bun run scripts/validate-github-app-config.ts

# Check environment variables loaded
cd app && bun run -e 'console.log({
  appId: process.env.GITHUB_APP_ID,
  hasPrivateKey: !!process.env.GITHUB_APP_PRIVATE_KEY,
  hasWebhookSecret: !!process.env.GITHUB_WEBHOOK_SECRET
})'

# Test private key format
echo "$GITHUB_APP_PRIVATE_KEY" | openssl rsa -check

# Submit test indexing job
curl -X POST http://localhost:3000/api/index \
  -H "Authorization: Bearer <local-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"repository": "owner/repo"}'

# Monitor local logs in real-time
tail -f app/server.log | grep "Installation Lookup"
```

## Verification After Fix

After resolving issues, verify the fix with these steps:

### 1. Validate Configuration

```bash
cd app && bun run scripts/validate-github-app-config.ts
```

Expected output:
```
[PASS] ✓ GITHUB_APP_ID: Set to 123456
[PASS] ✓ GITHUB_APP_PRIVATE_KEY: Set (1704 characters)
[PASS] ✓ GITHUB_WEBHOOK_SECRET: Set (32 characters)
[PASS] ✓ GitHub API Connectivity: Successfully authenticated. Found 1 installation(s).

Summary: 4 passed, 0 failed, 0 warnings

Validation PASSED. GitHub App is properly configured.
```

### 2. Submit Test Indexing Job

```bash
curl -X POST https://kotadb.io/api/index \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"repository": "owner/repo"}'
```

### 3. Monitor Logs for Success Messages

Look for these log patterns in order:

```
[Installation Lookup] GitHub App config check: GITHUB_APP_ID=present, GITHUB_APP_PRIVATE_KEY=present
[Installation Lookup] Starting installation_id lookup for owner/repo (repository_id=...)
[Installation Lookup] Querying installations for owner/repo
[Installation Lookup] Found 1 installation(s)
[Installation Lookup] Found installation 12345 for owner/repo
[Installation Lookup] Lookup result for owner/repo: installation_id=12345
[Installation Lookup] Updated repository owner/repo with installation_id 12345
```

### 4. Verify Database Population

```sql
SELECT id, full_name, installation_id
FROM repositories
WHERE full_name = 'owner/repo'
ORDER BY created_at DESC
LIMIT 1;
```

Expected: `installation_id` column shows numeric value (not NULL)

### 5. Check Job Success

```sql
SELECT id, status, error_message, stats
FROM index_jobs
WHERE repository_id = (
  SELECT id FROM repositories WHERE full_name = 'owner/repo' ORDER BY created_at DESC LIMIT 1
)
ORDER BY created_at DESC
LIMIT 1;
```

Expected: `status = 'completed'` with no `error_message`

### 6. Test Search Functionality

```bash
curl -X POST https://kotadb.io/api/search \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"query": "function", "repository": "owner/repo"}'
```

Expected: Search results returned with code snippets from indexed repository

## Related Documentation

- **GitHub App Setup**: `docs/github-app-setup.md` - Complete setup and configuration guide
- **Installation Lookup Implementation**: `app/src/github/installation-lookup.ts` - Source code and logic
- **Repository Population**: `app/src/api/queries.ts` (lines 399-503) - Population workflow
- **Indexing Worker**: `app/src/queue/workers/index-repo.ts` - Job processing and git clone logic

## Getting Help

If you've followed this guide and still experience issues:

1. Capture full diagnostic output:
   ```bash
   cd app && bun run scripts/validate-github-app-config.ts > validation.log 2>&1
   fly logs --app kotadb-production > production.log
   ```

2. Query database for affected repository:
   ```sql
   SELECT * FROM repositories WHERE full_name = 'owner/repo';
   SELECT * FROM index_jobs WHERE repository_id = '<repo-id>' ORDER BY created_at DESC LIMIT 5;
   ```

3. Open an issue at https://github.com/kotadb/kotadb/issues with:
   - Validation script output
   - Production logs (sanitized)
   - Database query results
   - Steps taken so far

Include the label `bug:authentication` for faster triage.
