# Security Expert Review: Issue #465
## MCP Endpoint Returns 406 for Claude Code Clients

**Date**: 2025-12-05
**Issue**: #465
**Severity**: HIGH (Security implications for error handling and API key exposure)
**Status**: In Analysis

---

## Executive Summary

Issue #465 addresses the MCP SDK's requirement for both `application/json` AND `text/event-stream` in the Accept header. While this appears to be a minor protocol compliance issue, the security analysis reveals **multiple critical security concerns** that must be addressed during implementation:

1. **Error Message Information Leakage** - Current error responses may expose system details
2. **API Key Documentation Examples** - Examples in docs contain sensitive information
3. **Header Validation Security** - Missing validation on accept header could enable attacks
4. **Migration Path Security** - Backward compatibility concerns with auth changes
5. **Logging of Sensitive Data** - Risk of API keys/tokens in logs

---

## Attack Surface Analysis

### New Attack Vectors Introduced

#### 1. Accept Header Validation Bypass

**Vector**: Attackers could potentially bypass content negotiation by:
- Sending requests with missing or manipulated Accept headers
- Attempting to trigger verbose error messages that expose internal details
- Testing for inconsistent error handling across different header combinations

**Current Risk**:
- `StreamableHTTPServerTransport` may return different error codes (406, 400, 500) based on header validation
- These different responses could be used for reconnaissance to map endpoint behavior
- Error messages might leak information about server implementation or internal state

**Mitigation Strategy**:
```typescript
// Security requirements for Accept header handling:
// 1. Validate Accept header presence BEFORE routing to business logic
// 2. Return consistent, non-revealing error response for invalid Accept
// 3. Never expose internal HTTP negotiation details in error messages
```

#### 2. Authorization Header Injection via Documentation

**Vector**: Example API keys in documentation could be:
- Captured by log aggregation tools
- Indexed by search engines if docs are public
- Included in security scanners' findings
- Extracted from git history by threat actors

**Current Risk** (High):
- `/Users/jayminwest/Projects/kota-db-ts/docs/guides/mcp-claude-code-integration.md` contains:
  ```
  "Authorization": "Bearer kota_solo_YOUR_API_KEY_HERE"
  "Authorization": "Bearer ${KOTADB_PRODUCTION_API_KEY}"
  ```
- These examples, while partially obfuscated, establish a clear format attackers can target
- Real production keys could be accidentally pasted instead of placeholders

**Exploitation Scenario**:
1. Attacker finds documentation with API key format
2. Performs brute force/dictionary attacks on key_id and secret portions
3. If key_id format is predictable (sequential IDs), success rate increases dramatically
4. With valid key, attacker gains access to all repositories indexed for that user

#### 3. Rate Limit Bypass via Error Message Timing

**Vector**: Different error codes (406, 401, 429) returned at different stages could allow:
- Attackers to map which validations execute first
- Timing-based probing to determine if rate limiting is active
- Potential to craft requests that bypass rate limiting by triggering header validation errors first

**Current Implementation Risk**:
- `authenticateRequest()` runs AFTER route handlers receive the request
- If Accept header validation happens INSIDE `transport.handleRequest()`, auth/rate-limit checks might be bypassed
- No explicit documentation of validation order in `/mcp` endpoint

---

## RLS and Access Control Impact

### Authorization Requirements

**Current Flow** (from `app/src/api/routes.ts` lines 659-697):
```
HTTP Request (headers: Authorization, Accept)
  ↓
Express middleware: authenticateRequest()
  ↓
Validates Authorization header (Bearer token)
  ↓
Checks rate limits
  ↓
Creates AuthContext (userId, tier, keyId)
  ↓
Creates per-request MCP server
  ↓
transport.handleRequest() - Accept header validation happens HERE
```

**Security Issue**:
- If Accept header validation fails AFTER authentication, the request is already "counted" against rate limits
- No RLS isolation if transport rejects request after auth context is created
- Tool execution permissions are tied to AuthContext.userId, but failure might still log sensitive context

**RLS Implications**:
- MCP tools execute within authenticated user context (line 667-669)
- Each tool call validates `context.userId` before execution
- No new RLS policies needed IF Accept header validation happens BEFORE creating transport

**Recommendation**:
```
Add explicit Accept header validation BEFORE authenticateRequest():
1. Valid: "application/json, text/event-stream" or variants
2. Invalid: Return 406 with generic error
3. BEFORE: Increment rate limit counter
4. BEFORE: Create user context
```

---

## Authentication Flow Security Review

### Breaking Change: Authorization Header Handling

**Current Implementation** (from `app/src/auth/middleware.ts` lines 38-111):
1. Extract Authorization header
2. Validate Bearer format
3. Parse token (API key or JWT)
4. Route to appropriate validator
5. Create AuthContext
6. Enforce rate limiting

**Security Concerns for Issue #465**:

#### Concern 1: Error Messages Don't Leak Auth Method
- Status: ✓ GOOD
- `invalidCredentials` returns "Invalid API key" for both API keys and JWT failures
- Doesn't distinguish between missing auth vs. invalid auth (timing attack protection)
- Prevents attackers from probing which auth methods are supported

#### Concern 2: API Key Format in Error Messages
- Status: ✓ GOOD
- Error responses use generic messages, never include parsed key components
- Doesn't return "Invalid key_id" or "Secret mismatch"
- No exposure of key structure in error logs

#### Concern 3: Logging of Sensitive Data
- Status: ⚠️ NEEDS REVIEW
- Line 95-96: Logs "auth_method", "reason" - SAFE
- Line 129: Logs "key_id" - POTENTIAL RISK
  - key_id is NOT the secret, but still sensitive
  - Should be hashed or redacted in logs
  - Consider using `****` masking for key_id in logs

**Recommendation**:
```typescript
// Line 129 - Mask key_id in logs
logger.info("Authentication successful", {
  auth_method: authMethod,
  user_id: context.userId,
  key_id: `${context.keyId.slice(0, 4)}****`,  // Mask middle section
  tier: context.tier,
});
```

---

## Input Validation & Error Message Security

### Error Message Leakage Analysis

**Evaluated Endpoints**:
1. Missing Authorization header (line 44-56)
2. Invalid Bearer format (line 60-72)
3. Invalid credentials (line 92-111)
4. Rate limit exceeded (line 136-141)

**Security Assessment**: ✓ EXCELLENT

Each error returns:
- Specific, appropriate HTTP status codes (401, 429, etc.)
- Generic error messages with `code` field for client-side handling
- NO stack traces or internal details
- NO information about why validation failed (protection against enumeration)

**Example - Good Error Response**:
```json
{
  "error": "Invalid API key",
  "code": "AUTH_INVALID_KEY"
}
```

**Not Exposed**:
- Whether key_id was found or not (timing attack protection)
- Whether secret hash didn't match
- Whether key was revoked vs. not found
- Whether tier constraints failed

### Logging Error Messages

**File**: `app/src/auth/middleware.ts` line 94-96
```typescript
logger.warn("Authentication failed", {
  auth_method: authMethod,
  reason: "invalid_credentials",
});
```

**Assessment**: ✓ SECURE
- Does NOT log the token value
- Does NOT log parsed components
- Uses structured logging (not string interpolation)
- No sensitive data in error logs

---

## Accept Header Validation Security Implications

### Current Implementation

**File**: `app/src/mcp/headers.ts` lines 84-98
```typescript
export function parseAccept(accept: string | null): {
  json: boolean;
  sse: boolean;
} {
  if (!accept) {
    return { json: false, sse: false };
  }

  const acceptLower = accept.toLowerCase();
  return {
    json: acceptLower.includes("application/json") || acceptLower.includes("*/*"),
    sse: acceptLower.includes("text/event-stream"),
  };
}
```

**Security Issues**:

#### Issue 1: Missing Validation in Routes
- `parseAccept()` is defined but NOT called in `app/src/api/routes.ts`
- Accept header validation is delegated to `StreamableHTTPServerTransport`
- No validation happens BEFORE authentication/rate limiting

**Risk**: Unauthenticated clients can probe the endpoint by sending invalid Accept headers, potentially causing:
- 406 responses that leak nothing (good)
- But different response times for Accept validation vs. Auth validation (timing attack)
- Rate limiting applied even though request will fail header validation

#### Issue 2: No Validation in Error Response Path
- When `transport.handleRequest()` rejects with 406, the AuthContext is already created
- User's rate limit counter was already checked
- Tool name from request body might be partially logged

**Security Improvement Needed**:
```typescript
// In app/src/api/routes.ts, BEFORE transport.handleRequest():

app.post("/mcp", async (req: AuthenticatedRequest, res: Response) => {
  const context = req.authContext!;

  // SECURITY: Validate Accept header BEFORE processing
  const accept = req.headers.get("accept");
  const acceptParsed = parseAccept(accept);

  if (!acceptParsed.json && !acceptParsed.sse) {
    // Return early, before creating server/transport
    return res.status(406).json({
      error: "Not Acceptable",
      code: "INVALID_ACCEPT_HEADER"
    });
  }

  // Continue with server creation
  // ... rest of handler
});
```

---

## Documentation Security Review

### Current Issues in `/docs/guides/mcp-claude-code-integration.md`

#### Issue 1: Hardcoded Example API Keys (Lines 57, 66)
```json
"Authorization": "Bearer kota_solo_YOUR_API_KEY_HERE",
"Authorization": "Bearer ${KOTADB_PRODUCTION_API_KEY}"
```

**Risk Assessment**: MEDIUM
- Placeholder examples are safer than real keys
- But the format is now public and unambiguous
- If ANY developer accidentally commits real keys in this format, they're easily identifiable by attackers

**Security Recommendation**:
```json
"Authorization": "Bearer <your-kota-api-key>",
```
- Use `<...>` angle brackets (more standard, less like actual format)
- Add security note about key handling
- Include example for environment variable usage with security warning

#### Issue 2: Missing Security Guidance
- No warning about treating API keys like passwords
- No guidance on key rotation
- No mention of where keys are visible (only in dashboard)
- Missing info: "Never commit API keys to git"

#### Issue 3: Environment Variable Example (Line 66)
```json
"Authorization": "Bearer ${KOTADB_PRODUCTION_API_KEY}"
```

**Risk**: Good practice shown, but should emphasize:
- How to set this environment variable securely
- Tools like `.env` files and their security implications
- Git ignore requirements

### Recommended Documentation Changes

**Add New Section: "Security Best Practices"**
```markdown
## Security Best Practices

### API Key Management

1. **Never commit API keys to version control**
   - Add API key files to `.gitignore`
   - Use `.env.local` or `.env.*.local` for local development
   - Example: `.mcp.local.json` in `.gitignore`

2. **Use environment variables in production**
   ```json
   {
     "Authorization": "Bearer ${KOTADB_API_KEY}"
   }
   ```
   Set the environment variable before starting Claude Code:
   ```bash
   export KOTADB_API_KEY="kota_solo_..."
   claude mcp start
   ```

3. **Rotate keys regularly**
   - Delete old keys from dashboard monthly
   - Create new keys for rotation
   - Test new keys before removing old ones

4. **Monitor API key usage**
   - Check usage metrics in KotaDB dashboard
   - Delete unused keys immediately
   - Set up alerts for suspicious activity

### Handling API Key Errors

If you receive `406 Not Acceptable`:
1. Verify Accept header includes `application/json` and `text/event-stream`
2. Check Authorization header format: `Bearer <key>`
3. Verify API key is active in dashboard
4. Check rate limit hasn't been exceeded
```

---

## Logging Security Analysis

### Current Logging Implementation

**Files Analyzed**:
- `app/src/auth/middleware.ts` - No sensitive data in logs ✓
- `app/src/mcp/server.ts` - Logs tool_name, user_id (no secrets) ✓
- `app/src/api/routes.ts` - Error logging with userId only ✓

**Good Practices Found**:
1. Line 98: Logs `user_id`, not full user object
2. Line 210: Logs `tool_name`, which is non-sensitive
3. Line 219-225: Structured logging in error handler
4. Error logs include context but never token/key values

### Identified Risk: Key_ID Logging

**File**: `app/src/auth/middleware.ts` line 129
```typescript
logger.info("Authentication successful", {
  auth_method: authMethod,
  user_id: context.userId,
  key_id: context.keyId,        // <-- SENSITIVE
  tier: context.tier,
});
```

**Risk**:
- key_id is semi-sensitive (it's used to index key_secrets table)
- If logs are exposed, attacker learns which key was used
- Could enable targeted attacks on specific key_id patterns
- Might leak business intelligence (which keys are frequently used)

**Severity**: MEDIUM
- key_id alone is not enough to compromise security (secret is still needed)
- But combined with compromised logs, it enables focused attacks

**Recommendation**:
```typescript
// Mask key_id in all logs
const maskedKeyId = context.keyId ? `${context.keyId.slice(0, 4)}****` : "unknown";
logger.info("Authentication successful", {
  auth_method: authMethod,
  user_id: context.userId,
  key_id: maskedKeyId,  // Now masked
  tier: context.tier,
});
```

---

## Migration Path Security Considerations

### Breaking Change: Authorization Header Update

**Current State**:
- MCP endpoint supports Bearer tokens (API keys and JWT)
- Accept header now MUST include both `application/json` AND `text/event-stream`

**Migration Risks**:

#### Risk 1: Clients with Old Accept Headers Fail Silently
- Old clients sending only `application/json` get 406
- No helpful error message explaining the requirement
- Users might think their API key is invalid

**Mitigation**:
- Error message should be: `"Invalid Accept header. Must include 'application/json' and 'text/event-stream'"`
- Consider logging 406 errors for support debugging
- Add migration guide in documentation

#### Risk 2: Temporary API Key Validation Window
- During migration, support team might receive "401 Invalid API key" complaints
- Some are header issues, some are real auth issues
- Need clear troubleshooting guide

**Solution**:
```markdown
## Troubleshooting MCP Connection Issues

### 406 Not Acceptable
- **Cause**: Accept header is missing required media types
- **Fix**: Ensure header includes: `Accept: application/json, text/event-stream`

### 401 Unauthorized
- **Cause**: API key is missing, invalid, or revoked
- **Fix**:
  1. Verify key is active in dashboard
  2. Check Authorization header format
  3. Generate new key if needed
```

#### Risk 3: Rate Limiting on Failed Accept Header Validation
- If Accept validation happens AFTER rate limit check, invalid headers consume quota
- Bots could be blocked by sending invalid Accept headers

**Mitigation**:
- Move Accept validation BEFORE rate limit check
- Or count 406 responses separately from successful requests

---

## OWASP Top 10 Alignment

### 1. Broken Access Control
**Status**: PROTECTED
- AuthContext properly isolates users
- Per-request MCP server creation prevents cross-user data access
- RLS policies enforced at database level

### 2. Cryptographic Failures
**Status**: GOOD
- API keys use bcrypt hashing (industry standard)
- HTTPS enforced in production (assumed)
- No plain-text secrets in logs

### 3. Injection
**Status**: PROTECTED
- Error messages never include user input
- Tool names sanitized before use
- No SQL injection risk (parameterized queries via Supabase)

### 4. Insecure Design
**Status**: NEEDS IMPROVEMENT
- Accept header validation order not explicit
- No rate limiting on header validation failures
- Error message consistency not documented

### 5. Security Misconfiguration
**Status**: YELLOW
- API key format is public (via documentation)
- No warning in docs about key management
- Accept header requirements not in error messages

### 6. Vulnerable Components
**Status**: GOOD
- Uses `@modelcontextprotocol/sdk` (official library)
- Sentry integration for error tracking
- Dependencies should be regularly updated

### 7. Authentication Failures
**Status**: GOOD
- No timing attacks in auth validation
- Consistent error messages for all auth failures
- Rate limiting prevents brute force

### 8. Data Integrity
**Status**: GOOD
- Rate limit counters in database (atomic updates)
- API key revocation checked on every request
- No session state issues (stateless design)

### 9. Logging & Monitoring Failures
**Status**: NEEDS IMPROVEMENT
- key_id should be masked in logs
- Consider logging 406 errors for debugging
- Add Sentry tags for Accept header failures

### 10. Security Logging Failures
**Status**: GOOD
- Structured logging with correlation IDs
- Error tracking via Sentry
- No sensitive data in public logs

---

## Security Recommendations

### Priority 1: CRITICAL

1. **Add Explicit Accept Header Validation**
   - **What**: Validate Accept header BEFORE creating transport
   - **Where**: `app/src/api/routes.ts`, line 659 (POST /mcp handler)
   - **Why**: Prevent timing attacks, ensure consistent error handling
   - **Risk if not done**: Attackers can use header validation timing to probe endpoints

2. **Mask key_id in Logs**
   - **What**: Replace `key_id` with masked version in logging statements
   - **Where**: `app/src/auth/middleware.ts`, line 129
   - **Why**: Prevent business intelligence leakage if logs are exposed
   - **Risk if not done**: MEDIUM - compromised logs reveal key usage patterns

### Priority 2: HIGH

3. **Update Documentation Security Guidance**
   - **What**: Add "Security Best Practices" section to integration guide
   - **Where**: `docs/guides/mcp-claude-code-integration.md`
   - **Why**: Prevent accidental key exposure in user documentation
   - **Include**:
     - Never commit keys to git
     - Use environment variables in production
     - Key rotation procedures
     - Troubleshooting guide with security context

4. **Add Troubleshooting Section**
   - **What**: Document differences between 406, 401, and other errors
   - **Where**: Same documentation file
   - **Why**: Reduce support burden, enable self-service debugging
   - **Include**: Security implications of each error type

### Priority 3: MEDIUM

5. **Implement Accept Header Error Logging**
   - **What**: Log when Accept header validation fails (406 responses)
   - **Where**: New validation handler in route
   - **Why**: Monitor for attacks or misconfigured clients
   - **Include Sentry tags**: `{ component: "mcp", error_type: "invalid_accept" }`

6. **Add Rate Limit Headers to 406 Responses**
   - **What**: Include `X-RateLimit-*` headers even on 406 errors
   - **Where**: `app/src/api/routes.ts`, POST /mcp handler
   - **Why**: Inform clients about rate limiting despite header validation failure
   - **Note**: May help developers debug quota issues

---

## Implementation Checklist

- [ ] Add `parseAccept()` call in route handler (Priority 1)
- [ ] Return 406 BEFORE creating transport if Accept invalid (Priority 1)
- [ ] Mask key_id in all logging statements (Priority 1)
- [ ] Update `mcp-claude-code-integration.md` with security section (Priority 2)
- [ ] Add troubleshooting guide with error explanations (Priority 2)
- [ ] Test 406 responses don't expose internal details (Priority 3)
- [ ] Verify Accept validation doesn't consume rate limits (Priority 3)
- [ ] Update error codes in Sentry for Accept header failures (Priority 3)
- [ ] Review all other endpoints for similar header validation issues (Priority 3)

---

## Security Testing Recommendations

### Test Cases for Accept Header Validation

```bash
# Should succeed (both types present)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Accept: application/json, text/event-stream"

# Should return 406 (missing text/event-stream)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Accept: application/json"

# Should return 406 (missing application/json)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $KEY" \
  -H "Accept: text/event-stream"

# Should return 401 (missing auth, not 406)
curl -X POST http://localhost:3000/mcp \
  -H "Accept: application/json, text/event-stream"

# Should return 401 (invalid key, not 406)
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer invalid_key" \
  -H "Accept: application/json, text/event-stream"
```

### Vulnerability Scanning

1. **Information Leakage Tests**
   - Verify no stack traces in 406 responses
   - Verify error messages don't reveal backend details
   - Check logs don't contain sensitive data

2. **Timing Attack Tests**
   - Measure response times for 406 vs 401 errors
   - Verify times are within noise range (both <100ms)
   - Ensure no detectable timing differences

3. **Logging Exposure Tests**
   - Search logs for any occurrence of full API key
   - Verify key_id is masked (if implemented)
   - Check for token values in error messages

---

## References

- **MCP Protocol**: https://spec.modelcontextprotocol.io/
- **OWASP Authentication Cheat Sheet**: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- **OWASP Error Handling**: https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
- **API Security Best Practices**: https://owasp.org/www-project-api-security/

---

## Sign-Off

**Security Expert Recommendations**: APPROVED with conditions
- **Condition 1**: Implement Priority 1 changes before code review
- **Condition 2**: Add test cases for all error scenarios
- **Condition 3**: Update documentation before release
- **Condition 4**: Verify logging doesn't contain sensitive data

**Risk Assessment Post-Implementation**: LOW (if all Priority 1 items completed)

---

*Document prepared by Security Expert System*
*Last updated: 2025-12-05*
