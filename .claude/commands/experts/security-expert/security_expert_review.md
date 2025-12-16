---
description: Review code changes from security perspective
argument-hint: <pr-number-or-diff-context>
---

# Security Expert - Review

**Template Category**: Structured Data
**Prompt Level**: 5 (Higher Order)

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues (automatic CHANGES_REQUESTED):**
- New tables without RLS policies
- Missing UPDATE/DELETE policies on existing tables (found in #271)
- SQL string interpolation (injection risk)
- Hardcoded secrets or API keys
- Auth middleware bypass for authenticated endpoints
- Service role client used where anon should be used
- Missing rate limit enforcement on new endpoints
- bcrypt work factor below 10
- Sensitive data in error responses
- Missing revoked_at check in key validation (found in #385)
- Hardcoded magic numbers in security-critical code (should use @config constants - bf76afb)
- Local mode bypass enabled in production or non-dev environments
- getServiceClient() called in local mode code path (must guard or use getClient() instead)
- Missing environment validation for cloud mode credentials at startup

**Important Concerns (COMMENT level):**
- Missing input validation on user-supplied data
- Overly permissive RLS policies
- Error messages that leak implementation details
- Missing audit logging for sensitive operations
- Insecure default configurations
- Inadequate testing of local mode boundary conditions

### Security Checklist

**Authentication:**
- [ ] All authenticated endpoints use auth middleware
- [ ] API key validation before any database access
- [ ] JWT token validation for OAuth users (commit 3c09d9b)
- [ ] Token format routing (kota_* vs JWT) implemented correctly
- [ ] Rate limit headers set on all responses
- [ ] Auth context properly isolated per request
- [ ] Revoked keys rejected via revoked_at check (#385)
- [ ] Local mode environment variable check in isLocalMode() (only when KOTA_LOCAL_MODE=true)

**Authorization:**
- [ ] RLS policies cover all CRUD operations (SELECT, INSERT, UPDATE, DELETE)
- [ ] UPDATE policies present on job/status tables (#271)
- [ ] Multi-table RLS for workspace associations (#431)
- [ ] Service role usage justified and documented
- [ ] Organization-scoped data properly isolated
- [ ] Tier-based feature access enforced
- [ ] Local mode context isolation (placeholder user, no cross-user access)

**Data Protection:**
- [ ] No secrets in code or logs
- [ ] Sensitive data not exposed in errors
- [ ] Sensitive data redacted from Sentry reports (commit ed4c4f9)
- [ ] bcrypt used for password/key hashing
- [ ] HTTPS enforced in production
- [ ] Structured logging with correlation IDs (commit ed4c4f9)
- [ ] Local mode credentials (Supabase keys) not required or accessed

**Input Handling:**
- [ ] All user input validated
- [ ] Parameterized queries used
- [ ] File paths sanitized
- [ ] JSON schema validation on request bodies
- [ ] SQL reserved keywords quoted (commit b1f0074)
- [ ] ON CONFLICT for idempotent operations (commit c499925)

**Configuration Management (added after bf76afb):**
- [ ] Security constants use @config module (RATE_LIMITS, RETRY_CONFIG, THRESHOLDS)
- [ ] No hardcoded magic numbers in security-critical code
- [ ] Bcrypt rounds sourced from RETRY_CONFIG.BCRYPT_ROUNDS
- [ ] Rate limits sourced from RATE_LIMITS constant
- [ ] All security thresholds centralized and auditable

**Environment & Mode Detection (added after #540):**
- [ ] getEnvironmentConfig() returns cached config appropriately
- [ ] KOTA_LOCAL_MODE environment variable checked correctly
- [ ] Cloud mode validates required Supabase credentials upfront
- [ ] Local mode does not attempt Supabase credential validation
- [ ] getServiceClient() throws error if called in local mode
- [ ] getClient() returns appropriate client based on mode
- [ ] isLocalMode() helper used consistently for mode checks
- [ ] LOCAL_AUTH_CONTEXT has team tier (highest for local testing)
- [ ] Local auth bypass is isolated to development contexts

**Dependency Vulnerability Management (added after #164):**
- [ ] Dependabot configuration present for npm, pip, github-actions
- [ ] npm audit runs in CI and fails on high/critical vulnerabilities
- [ ] pip-audit>=2.7.0 in automation dev dependencies
- [ ] Security scan job enabled in CI pipelines
- [ ] Audit results uploaded as artifacts (30-day retention)
- [ ] GitHub Step Summary reports vulnerability counts

### Vulnerability Patterns Discovered

**Missing RLS UPDATE Policy (discovered in #271):**
- Attack vector: Authenticated users could read but not update job status
- Impact: "Job not found or access denied" errors, broken functionality
- Remediation: Add explicit UPDATE policy for user_id scoped access
- Prevention: Always create policies for ALL CRUD operations (SELECT, INSERT, UPDATE, DELETE)

**API Key Revocation Bypass (discovered in #385):**
- Attack vector: Revoked keys could still authenticate if revoked_at not checked
- Impact: Compromised keys remain valid after revocation attempt
- Remediation: Check `revoked_at IS NULL` in validator before bcrypt comparison
- Prevention: Soft delete columns must be checked in all access paths

**Duplicate Key Constraint Violations (discovered in #271):**
- Attack vector: Inconsistent JSON stringification in deduplication logic
- Impact: Constraint violations during batch processing
- Remediation: Use ON CONFLICT in SQL for idempotent inserts
- Prevention: Always use ON CONFLICT for batch operations (commit c499925)

**Reserved Keyword SQL Errors (discovered in commit b1f0074):**
- Attack vector: Unquoted 'references' keyword in function definitions
- Impact: Migration failures, production deployment blocked
- Remediation: Quote all reserved keywords in SQL
- Prevention: Review SQL against PostgreSQL reserved keyword list

**Hardcoded Security Constants (mitigated in bf76afb):**
- Attack vector: Scattered magic numbers for rate limits, bcrypt rounds, retry counts
- Impact: Difficult to audit security configuration, inconsistency across codebase
- Remediation: Centralize all security constants in @config/constants.ts
- Prevention: Use @config module for all security-critical values (RATE_LIMITS, RETRY_CONFIG, THRESHOLDS)

**Local Mode Boundary Violation (discovered after #540):**
- Attack vector: getServiceClient() called in code path reachable from local mode
- Impact: Runtime error in local mode or Supabase credential requirement when not needed
- Remediation: Use getClient() abstraction or guard calls with `if (!isLocalMode())`
- Prevention: Always use getClient() for database access; getServiceClient() only for explicitly admin-only operations

**Missing Environment Validation (discovered after #540):**
- Attack vector: Cloud mode starts without verifying required Supabase credentials
- Impact: Credentials missing at runtime cause runtime errors instead of startup failures
- Remediation: Call getEnvironmentConfig() at startup to validate early
- Prevention: Validate environment configuration during initialization, fail fast for missing credentials

**Local Mode in Production (discovered after #540):**
- Attack vector: KOTA_LOCAL_MODE=true accidentally set in production
- Impact: No authentication, unlimited rate limits, single placeholder user for all requests
- Remediation: Never set KOTA_LOCAL_MODE=true in production; document that this is development-only
- Prevention: Verify via environment validation that local mode is only enabled in dev/test environments

### Severity Ratings

**CRITICAL (immediate fix required):**
- Authentication bypass
- SQL injection vulnerability
- Exposed secrets
- RLS disabled on sensitive table
- getServiceClient() called in local mode path
- Local mode enabled in production

**HIGH (fix before merge):**
- Missing RLS policy (any CRUD operation)
- Incomplete RLS coverage (missing UPDATE/DELETE - see #271)
- Weak input validation
- Service role misuse
- Rate limit bypass (check both hourly and daily limits - #423)
- Hardcoded security constants (should use @config - bf76afb)
- Unguarded environment configuration transitions
- Missing Supabase credential validation in cloud mode startup

**MEDIUM (fix in follow-up):**
- Overly verbose error messages
- Missing audit logging
- Suboptimal bcrypt rounds
- Inadequate local mode testing

**LOW (nice to have):**
- Security header improvements
- Additional input sanitization
- Enhanced logging
- Dependency vulnerability documentation

## Workflow

1. **Parse Diff**: Identify security-relevant changes in REVIEW_CONTEXT
2. **Check Critical**: Scan for automatic CHANGES_REQUESTED triggers
3. **Run Checklist**: Apply security checklist to changes
4. **Assess Severity**: Rate identified issues
5. **Environment Check**: Verify mode detection and environment config handling
6. **Synthesize**: Produce security assessment

## Output

### Security Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [CRITICAL severity items requiring immediate fix]

**High Priority Issues:**
- [HIGH severity items to fix before merge]

**Medium/Low Issues:**
- [Items for follow-up or nice-to-have]

**Checklist Results:**
- [Pass/fail on security checklist items]

**Attack Vector Analysis:**
- [Potential attack vectors introduced]

**Environment & Mode Handling:**
- [Verification of environment config and local mode boundaries]

**Dependency Security:**
- [Audit results and vulnerability findings]

**Recommendations:**
- [Security hardening suggestions]

**Compliant Patterns:**
- [Good security practices observed]

