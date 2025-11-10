# Deployment Checklist

This checklist ensures all critical steps are completed when deploying KotaDB to staging or production environments.

## Pre-Deployment

### Code Preparation

- [ ] All feature branches merged into `develop` (for staging) or `main` (for production)
- [ ] All tests passing locally: `cd app && bun test`
- [ ] Type checking passes: `cd app && bunx tsc --noEmit`
- [ ] Linting passes: `cd app && bun run lint`
- [ ] Migration sync validated: `cd app && bun run test:validate-migrations`

### Migration Validation

- [ ] Identify new migrations since last deployment:
  ```bash
  cd app/src/db/migrations && ls -lt | head -10
  ```
- [ ] Review migration SQL for potential issues (table locks, data loss)
- [ ] Test migrations on local Supabase: `cd app && supabase db reset`
- [ ] Verify RLS policies are included for new tables
- [ ] Document any breaking schema changes in deployment notes

### Environment Configuration

- [ ] Supabase project exists for target environment (staging/production)
- [ ] GitHub OAuth app configured (for web app authentication)
- [ ] Fly.io app created: `flyctl apps list | grep kota-db-{env}`
- [ ] Environment secrets documented (do not commit to git)

## Deployment

### Backend API Deployment

- [ ] Apply database migrations to target Supabase project:
  ```bash
  export SUPABASE_URL="https://your-project.supabase.co"
  export SUPABASE_SERVICE_KEY="your-service-role-key"
  cd app && bun run scripts/apply-migrations.ts
  ```
- [ ] Verify migration application:
  ```sql
  SELECT name, applied_at FROM migrations ORDER BY applied_at DESC LIMIT 5;
  ```
- [ ] Set Fly.io secrets:
  ```bash
  flyctl secrets set SUPABASE_URL="..." SUPABASE_SERVICE_KEY="..." SUPABASE_ANON_KEY="..." --app kota-db-{env}
  ```
- [ ] Deploy backend to Fly.io:
  ```bash
  cd app && flyctl deploy --app kota-db-{env}
  ```
- [ ] Monitor deployment logs:
  ```bash
  flyctl logs --app kota-db-{env}
  ```

### Web Application Deployment (if applicable)

- [ ] Set web app environment variables on Vercel/Fly.io
- [ ] Deploy web app: `cd web && vercel --prod` or `flyctl deploy --app kotadb-web-{env}`
- [ ] Update backend CORS allowed origins:
  ```bash
  flyctl secrets set KOTA_ALLOWED_ORIGINS="https://your-web-app.vercel.app" --app kota-db-{env}
  ```

## Post-Deployment Validation

### Schema Validation

- [ ] Verify critical schema elements exist in target database:
  ```sql
  -- Check api_keys table columns
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'api_keys'
  ORDER BY ordinal_position;

  -- Expected: id, user_id, key_id, secret_hash, tier, rate_limit_per_hour,
  --           enabled, created_at, last_used_at, metadata, revoked_at

  -- Check critical indexes
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'api_keys'
  AND indexname IN ('idx_api_keys_key_id', 'idx_api_keys_revoked_at');
  ```
- [ ] Compare schema with local development database to identify drift
- [ ] Verify RLS policies are active:
  ```sql
  SELECT tablename, policyname, permissive, roles, cmd
  FROM pg_policies
  WHERE tablename IN ('api_keys', 'repositories', 'indexed_files')
  ORDER BY tablename, policyname;
  ```

### Health Checks

- [ ] Backend health endpoint responds:
  ```bash
  curl https://kota-db-{env}.fly.dev/health
  # Expected: {"status":"ok","timestamp":"..."}
  ```
- [ ] Database connectivity verified (check health endpoint logs)
- [ ] Web app loads successfully (if applicable):
  ```bash
  curl -I https://your-web-app.vercel.app
  # Expected: HTTP/2 200 OK
  ```

### Smoke Tests

- [ ] Generate test API key via web app or SQL:
  ```bash
  # Via web app: Sign in with GitHub OAuth, navigate to dashboard
  # Via SQL: INSERT INTO api_keys (user_id, tier, ...) VALUES (...);
  ```
- [ ] Test API key authentication:
  ```bash
  curl -X POST https://kota-db-{env}.fly.dev/index \
    -H "Authorization: Bearer kota_free_..." \
    -H "Content-Type: application/json" \
    -d '{"repository":"vercel/ms"}'
  # Expected: 202 Accepted
  ```
- [ ] Test code search endpoint:
  ```bash
  curl -X POST https://kota-db-{env}.fly.dev/search \
    -H "Authorization: Bearer kota_free_..." \
    -H "Content-Type: application/json" \
    -d '{"term":"Router","limit":5}'
  # Expected: JSON response with search results
  ```
- [ ] Test API key revocation (if applicable):
  ```bash
  curl -X DELETE https://kota-db-{env}.fly.dev/api/keys/current \
    -H "Authorization: Bearer {jwt_token}"
  # Expected: 200 OK with revocation confirmation
  ```
- [ ] Test API key reset (if applicable):
  ```bash
  curl -X POST https://kota-db-{env}.fly.dev/api/keys/reset \
    -H "Authorization: Bearer {jwt_token}"
  # Expected: 200 OK with new API key
  ```

### Monitoring Setup

- [ ] Backend logs accessible:
  ```bash
  flyctl logs --app kota-db-{env} -n 50
  ```
- [ ] No critical errors in recent logs:
  ```bash
  flyctl logs --app kota-db-{env} | grep -i "error\|exception\|fail"
  ```
- [ ] Verify rate limit headers in API responses:
  ```bash
  curl -I -H "Authorization: Bearer kota_free_..." \
    https://kota-db-{env}.fly.dev/health
  # Expected headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  ```
- [ ] Set up alerts for high error rates (Fly.io dashboard or external monitoring)

### Security Validation

- [ ] Secrets not exposed in logs or responses
- [ ] CORS configured correctly (only allowed origins can make requests)
- [ ] RLS policies enforced (test with unauthorized access attempts)
- [ ] API keys use bcrypt hashing (verify `secret_hash` column is not plaintext)
- [ ] HTTPS enforced (HTTP requests redirect to HTTPS)

## Rollback Plan

### If deployment fails or critical issues discovered:

- [ ] Document the issue (error messages, logs, affected endpoints)
- [ ] Roll back Fly.io deployment:
  ```bash
  flyctl releases --app kota-db-{env}
  flyctl releases rollback v{previous_version} --app kota-db-{env}
  ```
- [ ] Roll back database migrations (if applicable):
  ```sql
  -- Identify migration to revert
  SELECT name FROM migrations ORDER BY applied_at DESC LIMIT 1;

  -- Apply revert SQL (if migration has down script)
  -- Or restore database snapshot from before migration
  ```
- [ ] Verify rollback success with smoke tests
- [ ] Notify team of rollback and create incident report
- [ ] Schedule hotfix deployment after root cause analysis

## Post-Deployment Documentation

- [ ] Update deployment notes with migration details
- [ ] Document any configuration changes (environment variables, secrets)
- [ ] Update README or docs with new feature availability
- [ ] Close deployment tracking issue/PR
- [ ] Notify stakeholders of successful deployment

## Environment-Specific Notes

### Staging

- Lower resource allocation (512MB memory, 1 CPU)
- Auto-stop machines enabled for cost savings
- Test data can be cleared between deployments
- GitHub OAuth app uses staging callback URL

### Production

- Higher resource allocation (1GB+ memory, 2+ CPUs)
- Multiple machines for high availability (`min_machines_running = 2`)
- Auto-stop disabled (`auto_stop_machines = false`)
- Database backups configured in Supabase
- Monitoring and alerting configured
- GitHub OAuth app uses production callback URL
- Custom domain configured (if applicable)

## Common Issues and Resolutions

### Issue: Migration fails with "column already exists"

**Resolution:**
- Check if migration was partially applied
- Query `migrations` table to see which migrations succeeded
- Manually complete failed migration or revert and retry

### Issue: Health check fails with "Connection refused"

**Resolution:**
- Verify Supabase credentials are set correctly: `flyctl secrets list --app kota-db-{env}`
- Check Supabase project status (dashboard)
- Test connection from local machine with same credentials
- Check Fly.io logs for detailed error messages

### Issue: API key authentication fails with "Invalid API key"

**Resolution:**
- Verify `revoked_at` column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'revoked_at';`
- Apply missing migrations if column is absent
- Check API key format: `kota_{tier}_{keyId}_{secret}`
- Verify bcrypt hash in database matches API key secret

### Issue: CORS errors in browser console

**Resolution:**
- Verify `KOTA_ALLOWED_ORIGINS` includes frontend URL
- Check origin URL matches exactly (no trailing slash)
- Test preflight request manually
- Verify CORS middleware is registered before route handlers

### Issue: Rate limit exceeded unexpectedly

**Resolution:**
- Check rate limit state in database: `SELECT * FROM rate_limit_counters WHERE key_id = '...';`
- Verify correct tier rate limits are applied
- Reset rate limit if needed (for testing): `DELETE FROM rate_limit_counters WHERE key_id = '...';`
