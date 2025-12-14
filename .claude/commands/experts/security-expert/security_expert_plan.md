---
description: Provide security analysis for planning
argument-hint: <issue-context>
---

# Security Expert - Plan

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### Row Level Security (RLS) Patterns

**RLS Policy Types:**
- User-scoped: Restrict access based on authenticated user
- Organization-scoped: Restrict access based on org membership
- Tier-scoped: Restrict features based on subscription tier

**RLS Implementation Rules:**
- All tables with user data MUST have RLS enabled
- Service role client bypasses RLS (use only for admin operations)
- Anon client enforces RLS automatically
- New tables require explicit policy creation

**Common RLS Patterns:**
```sql
-- User-scoped read policy
CREATE POLICY "Users can read own data"
ON table_name FOR SELECT
USING (auth.uid() = user_id);

-- Organization-scoped policy
CREATE POLICY "Org members can read org data"
ON table_name FOR SELECT
USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()));

-- Job update policy (added after #271 - missing UPDATE caused access denied errors)
CREATE POLICY "Users can update own jobs"
ON index_jobs FOR UPDATE
USING (user_id = auth.uid());

-- Multi-table workspace pattern (added after #431 - project/repository associations)
CREATE POLICY "projects_select" ON projects
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "project_repositories_select" ON project_repositories
FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);
```

### Authentication Flow

**API Key Validation:**
1. Extract Bearer token from Authorization header
2. Parse key format: `kota_<tier>_<key_id>_<secret>`
3. Lookup key_id in `api_keys` table
4. Check revoked_at IS NULL (added after #385 - soft delete support)
5. bcrypt compare secret against stored hash
6. Extract tier and rate limit from key record
7. Return auth context with user, tier, org info

**JWT Token Validation (added after commit 3c09d9b):**
1. Check token format (non-kota_* prefix indicates JWT)
2. Verify JWT signature via Supabase Auth getUser()
3. Fetch user tier from subscriptions table
4. Return auth context with user session data
5. Note: OAuth users can now use session tokens for API access

**Auth Context Structure:**
```typescript
{
  user: { id, email, org_id },
  tier: 'free' | 'solo' | 'team',
  organization: { id, name },
  rateLimitResult: { allowed, remaining, resetAt }
}
```

### Rate Limiting Security

**Tier Limits (updated after #423):**
- Free: 1,000 requests/hour, 5,000 requests/day
- Solo: 5,000 requests/hour, 25,000 requests/day
- Team: 25,000 requests/hour, 100,000 requests/day

**Rate Limit Headers:**
- `X-RateLimit-Limit`: Maximum requests in window
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Unix timestamp of window reset

**Rate Limit Bypass Prevention:**
- Counter stored in database (not in-memory)
- Dual-limit enforcement: both hourly and daily limits checked (#423)
- Separate rate_limit_counters_daily table for daily quotas
- Key validation happens before rate limit check
- Revoked keys rejected before rate limit consumption (#385)
- Invalid keys return 401 before consuming quota

**Centralized Configuration (added after commit bf76afb):**
- Rate limit constants centralized in @config/constants.ts
- Prevents hardcoded magic numbers across codebase
- Single source of truth for security thresholds (RATE_LIMITS, RETRY_CONFIG, THRESHOLDS)
- Bcrypt rounds centralized: RETRY_CONFIG.BCRYPT_ROUNDS = 10
- All security-critical values defined as constants for easy auditing

### Input Validation Patterns

**Required Validations:**
- API key format validation before database lookup
- Request body schema validation (Zod)
- Path parameter sanitization
- Query parameter type coercion

**SQL Injection Prevention:**
- Always use parameterized queries
- Never interpolate user input into SQL
- Supabase client handles escaping automatically
- Use ON CONFLICT for idempotent migrations (added after commit c499925)
- Quote reserved keywords in SQL (e.g., 'references' - commit b1f0074)

### Observability & Audit Logging

**Structured Logging (added after commit ed4c4f9):**
- JSON format with correlation IDs for request tracing
- Error tracking via Sentry integration
- Sensitive data redaction in logs (no secrets, API keys, tokens)
- Context propagation across async operations

**Security Event Logging:**
- Failed authentication attempts
- Rate limit violations
- API key revocation events (#385)
- RLS policy denials
- Note: Use process.stdout.write for structured logs (not console.*)

### OWASP Top 10 Considerations

**Relevant to KotaDB:**
1. **Broken Access Control**: RLS policies, auth middleware
2. **Cryptographic Failures**: bcrypt for key hashing, HTTPS only
3. **Injection**: Parameterized queries, input validation
4. **Insecure Design**: Auth context isolation, rate limiting
5. **Security Misconfiguration**: Environment variable management, centralized config (bf76afb)
6. **Identification Failures**: Strong API key format, secure generation
7. **Security Logging Failures**: Sentry integration, structured logging (commit ed4c4f9)

## Workflow

1. **Parse Context**: Understand feature/change from USER_PROMPT
2. **Identify Attack Vectors**: Map potential security risks
3. **Check RLS Impact**: Determine if new RLS policies needed
4. **Review Auth Flow**: Verify authentication requirements
5. **Assess Input Points**: Identify user input handling
6. **Rate Limit Analysis**: Check for bypass opportunities

## Report Format

### Security Perspective

**Attack Surface Analysis:**
- [New attack vectors introduced by this change]

**RLS Requirements:**
- [New policies needed, or confirmation existing policies sufficient]

**Authentication Impact:**
- [Changes to auth flow or requirements]

**Input Validation:**
- [User input points and validation requirements]

**Recommendations:**
1. [Security recommendation with rationale]

**Risks:**
- [Security risk with severity: CRITICAL/HIGH/MEDIUM/LOW]

**Compliance:**
- [OWASP alignment assessment]
