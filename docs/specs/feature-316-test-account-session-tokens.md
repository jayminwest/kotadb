# Feature Plan: Test Account Generation with Session Token Support

**Issue**: #316
**Title**: feat: enhance test account generation script with session token support
**Component**: backend, testing
**Priority**: high
**Effort**: small

## Overview

### Problem
The existing `app/scripts/generate-test-key.ts` script creates test users and generates API keys for backend testing, but lacks support for generating Supabase session tokens needed for frontend authentication testing (e.g., Playwright cookie injection, SSR auth flows).

### Desired Outcome
Enhance the test account generation script to support both backend API testing (via API keys) and frontend authentication testing (via session tokens). The script should output access/refresh tokens suitable for cookie-based authentication when requested via a `--session-token` flag.

### Non-Goals
- Implementing automated Playwright test infrastructure (this is foundation only)
- Modifying existing API key validation or authentication flows
- Creating persistent session management beyond standard Supabase token lifecycle
- Building a user management UI or dashboard

## Technical Approach

### Architecture Notes
- Leverage Supabase Auth Admin API's `generateLink()` method with `type: 'magiclink'` to obtain session tokens
- Maintain backward compatibility by keeping API key generation as default behavior
- Add optional `--session-token` flag to trigger frontend token generation path
- Rename script from `generate-test-key.ts` to `generate-test-account.ts` to reflect broader scope

### Key Modules to Touch
- `app/scripts/generate-test-key.ts` (rename to `generate-test-account.ts`)
- `app/src/auth/keys.ts` (reference only - no changes needed)
- `app/src/db/client.ts` (getServiceClient - already supports auth admin operations)

### Data/API Impacts
- User metadata enhancement: add `service_account: true` and `purpose: 'automation-testing'` fields
- No database schema changes required (uses existing `auth.users` table)
- Session tokens expire according to Supabase project settings (default: 1 hour access token, 7-day refresh token)

## Relevant Files

### Modified Files
- `app/scripts/generate-test-key.ts` → `app/scripts/generate-test-account.ts` — Enhanced to support session token generation with `--session-token` flag
- `app/package.json` (optional) — Update scripts section if adding convenience command

### New Files
- `app/tests/scripts/generate-test-account.test.ts` — Integration test verifying session token generation and format validation

## Task Breakdown

### Phase 1: Script Enhancement
- Add command-line argument parsing for `--session-token` flag using `process.argv`
- Extract session token generation logic into separate async function
- Call `supabase.auth.admin.generateLink()` when flag is present
- Parse response to extract `access_token`, `refresh_token`, and `hashed_token`
- Update user creation to include metadata: `user_metadata: { service_account: true, purpose: 'automation-testing' }`

### Phase 2: Output Formatting
- Refactor output to have distinct sections for backend vs frontend testing
- Add formatted output showing access token, refresh token, and cookie injection examples
- Include Playwright usage example for cookie-based authentication
- Update curl examples to show both API key and session token usage

### Phase 3: Testing & Validation
- Write integration test using real Supabase Local instance (per antimocking philosophy)
- Verify session token format (JWT structure, expiration claims)
- Test backward compatibility (existing usage without flag still works)
- Validate user metadata is correctly set
- Rename file and update any references in documentation

## Step by Step Tasks

### Script Refactoring
1. Rename `app/scripts/generate-test-key.ts` to `app/scripts/generate-test-account.ts`
2. Add CLI argument parser to detect `--session-token` flag from `process.argv`
3. Extract user creation logic into reusable function `createOrGetTestUser(email: string)`
4. Update user creation call to include metadata: `user_metadata: { service_account: true, purpose: 'automation-testing' }`

### Session Token Generation
5. Add function `generateSessionTokens(userId: string)` that calls `supabase.auth.admin.generateLink({ type: 'magiclink', email: user.email })`
6. Extract tokens from response: `properties.access_token`, `properties.refresh_token`, `properties.hashed_token`
7. Return structured object with token data and expiration info

### Output Enhancement
8. Refactor output formatting into conditional branches based on `--session-token` flag
9. Add formatted sections: "TEST ACCOUNT GENERATED", "Backend API Testing", "Frontend Testing Tokens"
10. Include usage examples for Playwright cookie injection with proper cookie format: `sb-{project-ref}-auth-token`
11. Add warning about token expiration and refresh token usage

### Testing
12. Create integration test file `app/tests/scripts/generate-test-account.test.ts`
13. Test case: verify script generates valid API key without flag (backward compatibility)
14. Test case: verify script generates session tokens with `--session-token` flag
15. Test case: validate JWT structure of access token (decode and check claims)
16. Test case: verify user metadata includes `service_account: true` flag
17. Test case: confirm session tokens work with Supabase client initialization

### Documentation & Validation
18. Update any references to old script name in README.md or CLAUDE.md
19. Run linting: `cd app && bun run lint`
20. Run type-checking: `cd app && bunx tsc --noEmit`
21. Run integration tests: `cd app && bun test --filter integration`
22. Run full test suite: `cd app && bun test`
23. Validate migrations sync: `cd app && bun run test:validate-migrations`
24. Push branch: `git push -u origin interactive-316-test-account-session-tokens`

## Risks & Mitigations

### Risk: Session Token Expiration in Long-Running Tests
**Mitigation**: Document token expiration defaults (1 hour access, 7-day refresh) in output. Include refresh token in output so tests can implement token refresh logic if needed.

### Risk: Cookie Format Mismatch Across Environments
**Mitigation**: Cookie name format varies by Supabase project ref (`sb-{project-ref}-auth-token`). Include project ref detection in script output or provide template format for users to adapt.

### Risk: Breaking Existing Usage
**Mitigation**: Maintain full backward compatibility by making `--session-token` optional. Default behavior (API key only) remains unchanged.

### Risk: Session Tokens Not Working with RLS Policies
**Mitigation**: Ensure test accounts have proper UUID format user IDs that match RLS policy expectations. Use `supabase.auth.admin.createUser()` which automatically handles this.

## Validation Strategy

### Automated Tests
- **Unit Test**: Argument parsing logic correctly detects `--session-token` flag
- **Integration Test**: Session token generation via real Supabase Local instance
- **Integration Test**: JWT structure validation (decode access token, verify claims: `sub`, `exp`, `iat`, `role`)
- **Integration Test**: User metadata persistence check (query `auth.users` table for `service_account` field)
- **Regression Test**: Existing API key generation still works without flag

### Manual Checks
- **Data Seeded**: Test user created with email `test@kotadb.dev` or custom email from CLI args
- **Failure Scenarios**:
  - Run script without Supabase running → expect clear error message
  - Run script with invalid tier argument → expect validation error
  - Use expired access token → verify 401 response from authenticated endpoints
- **Success Path**: Generated session tokens successfully authenticate against Supabase auth endpoints

### Release Guardrails
- Monitor test suite pass rate (133 existing tests must continue passing)
- Verify no console.log violations in pre-commit hooks
- Confirm script runs successfully in CI environment (where Supabase Local is available)
- Document session token expiration in script output for user awareness

## Validation Commands

```bash
# Linting
cd app && bun run lint

# Type-checking
cd app && bunx tsc --noEmit

# Integration tests (requires Supabase Local)
cd app && bun test:setup  # Start Supabase containers
cd app && bun test --filter integration

# Full test suite
cd app && bun test

# Migration sync validation
cd app && bun run test:validate-migrations

# Build verification
cd app && bun run build

# Manual script testing
cd app && bun run scripts/generate-test-account.ts test@local.dev free --session-token
```

## Issue Relationships

- **Child Of**: #315 (Test account authentication epic) - Phase 1: Backend infrastructure for test account management
- **Related To**: #291 (API keys RLS) - Leverages existing API key generation infrastructure
- **Blocks**: #317 (Dev session endpoint) - Foundation required for frontend testing workflows

## Implementation Notes

### Supabase Auth Admin API Reference
- `auth.admin.createUser()`: Creates user with confirmed email, returns user object
- `auth.admin.generateLink({ type: 'magiclink', email })`: Generates authentication tokens without sending email
- Response structure:
  ```typescript
  {
    properties: {
      action_link: string,      // Magic link URL (not needed)
      access_token: string,     // JWT for API authentication
      refresh_token: string,    // Token for refreshing expired access tokens
      hashed_token: string,     // Server-side token hash
      email_otp: string,        // OTP code (not needed)
      redirect_to: string       // Redirect URL (not needed)
    },
    user: { id: string, email: string, ... }
  }
  ```

### JWT Token Structure
Access tokens are standard JWTs with claims:
- `sub`: User ID (UUID)
- `email`: User email address
- `role`: User role (typically `authenticated`)
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp
- `aud`: Audience (project-specific)

### Cookie Format for Supabase SSR
Cookie name format: `sb-{project-ref}-auth-token`
For Supabase Local: `sb-localhost-auth-token`

Example Playwright injection:
```typescript
await page.context().addCookies([{
  name: 'sb-localhost-auth-token',
  value: JSON.stringify({
    access_token: '<access_token>',
    refresh_token: '<refresh_token>',
    expires_in: 3600,
    token_type: 'bearer'
  }),
  domain: 'localhost',
  path: '/',
  httpOnly: false,
  secure: false,
  sameSite: 'Lax'
}]);
```

### Backward Compatibility Requirements
- Script must work without any flags (current behavior)
- Default email remains `test@kotadb.dev`
- Default tier remains `team` (matches existing script)
- Existing output format preserved when `--session-token` not used
- No breaking changes to `generateApiKey()` function signature
