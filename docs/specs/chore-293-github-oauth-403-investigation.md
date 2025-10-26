# Chore Plan: GitHub OAuth 403 Error Investigation and Resolution

## Context

PR #292 added `scopes: 'user:email'` parameter to the GitHub OAuth flow in `web/app/login/page.tsx`, but authentication is still failing in staging with a 403 error from GitHub API: "Resource not accessible by integration". The error occurs during Supabase's profile fetch callback, indicating that even though the scope is now requested, GitHub is denying access to the `/user/emails` endpoint.

This chore must investigate the root cause and implement a fix to resolve the persistent OAuth failure. The issue affects all users attempting to authenticate on the staging environment (https://develop.kotadb.io).

**Key Constraints:**
- Staging environment is actively used for testing and demos
- Fix must not disrupt existing GitHub OAuth Apps for production (if any)
- Must maintain backward compatibility with users who have existing sessions
- Configuration changes must be documented for future environment deployments

## Relevant Files

### Investigation Files
- `web/app/login/page.tsx` — OAuth flow initiation with scope parameter (verify scope transmission)
- `web/app/auth/callback/route.ts` — Callback handler (inspect error details)
- `web/.env.vercel.preview` — Staging environment variables (verify API URL configuration)
- `docs/github-oauth-staging-config-guide.md` — Configuration guide from PR #292 (validate steps were followed)
- `docs/specs/bug-286-github-oauth-staging-failure.md` — Original bug plan (reference for context)

### Configuration Assets (External)
- GitHub Settings → Developer Settings → OAuth Apps (verify "KotaDB Preview" app configuration)
- Supabase Dashboard → Authentication → Providers → GitHub (verify provider credentials and status)
- GitHub OAuth App permissions and callback URL settings
- Supabase Auth logs for error event ID `622598bc-4b78-4e3d-ab71-452bce8abcc0`

### New Files
- `docs/specs/chore-293-github-oauth-403-investigation.md` — This plan

## Work Items

### Preparation
- Access GitHub Settings → Developer Settings → OAuth Apps to inspect "KotaDB Preview" app
- Access Supabase Dashboard for project `szuaoiiwrwpuhdbruydr` to check GitHub provider status
- Collect Supabase Auth logs for error timestamp `2025-10-25T19:22:41Z`
- Review GitHub OAuth App vs GitHub App permission models to identify configuration mismatch
- Verify scope parameter is transmitted in OAuth authorization URL (browser Network tab inspection)

### Execution
- **Phase 1: Scope Transmission Verification**
  - Initiate OAuth flow from staging and capture authorization URL
  - Confirm `scope=user:email` parameter present in GitHub authorization redirect
  - Check browser Network tab for full OAuth redirect chain
  - Document whether scope parameter reaches GitHub authorization page

- **Phase 2: GitHub OAuth App Type and Permission Audit**
  - Identify whether "KotaDB Preview" is configured as OAuth App or GitHub App
  - Review OAuth App permissions (check if app-level email access is enabled)
  - Compare callback URL in GitHub settings vs Supabase redirect URL
  - Check if OAuth App requires explicit email permissions beyond scope parameter

- **Phase 3: GitHub App Migration (if required)**
  - If OAuth App type is the blocker, create new GitHub App with email read permissions
  - Configure GitHub App OAuth credentials in Supabase (replace OAuth App credentials)
  - Update Supabase provider settings to use GitHub App Client ID and Secret
  - Test authentication flow with GitHub App credentials

- **Phase 4: Supabase Provider Configuration Validation**
  - Verify Client ID and Secret are correctly pasted in Supabase Dashboard
  - Check if Supabase has additional scope configuration options beyond client-side `scopes` parameter
  - Review Supabase Auth provider settings for any missing toggles or permissions
  - Confirm Supabase GitHub provider is enabled and saved successfully

- **Phase 5: Alternative OAuth Scope Formats**
  - Test alternative scope formats: `user:email`, `read:user user:email`, `read:user,user:email`
  - Verify Supabase SDK documentation for correct scope syntax
  - Check if scopes parameter should be array vs string: `scopes: ['user:email']`
  - Consult Supabase community discussions for scope configuration edge cases

### Follow-up
- Document final root cause and resolution steps in this spec file
- Update `docs/github-oauth-staging-config-guide.md` with any new steps discovered
- Add monitoring for OAuth error rates in staging environment (if tooling available)
- Test OAuth flow with multiple test users to confirm reproducibility
- Close issue #293 with summary of configuration changes and validation results

## Step by Step Tasks

### Pre-Implementation Investigation
- Access GitHub Settings → Developer Settings → OAuth Apps and locate "KotaDB Preview" app
- Verify app type (OAuth App vs GitHub App) and record current configuration
- Check callback URL matches `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
- Review OAuth App permissions and scopes configuration
- Access Supabase Dashboard for project `szuaoiiwrwpuhdbruydr` and verify GitHub provider is enabled
- Confirm Client ID and Secret are configured in Supabase provider settings
- Collect Supabase Auth logs for error event ID `622598bc-4b78-4e3d-ab71-452bce8abcc0` to identify precise failure point

### Scope Transmission Testing
- Navigate to `https://develop.kotadb.io/login` in browser with DevTools open
- Click "Sign in with GitHub" and capture redirect URL in Network tab
- Verify `scope=user:email` or `scope=read:user%20user:email` parameter present in authorization URL
- Complete GitHub authorization flow and inspect callback parameters
- If scope parameter missing, investigate Supabase SDK scope parameter handling

### GitHub OAuth App Configuration Fix
- If scope parameter is transmitted correctly but GitHub still returns 403:
  - Check if OAuth App has email permissions at application level (GitHub Settings → OAuth Apps → Permissions)
  - Verify OAuth App is not configured with restricted permissions that override scopes
  - Consider regenerating OAuth App credentials (Client ID and Secret)
  - Test with newly generated credentials in Supabase

### GitHub App Migration (if OAuth App type is blocker)
- Create new GitHub App at https://github.com/settings/apps
- Configure GitHub App:
  - **Name**: `KotaDB Preview App`
  - **Homepage URL**: `https://develop.kotadb.io`
  - **Callback URL**: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
  - **Permissions**: Email addresses (Read-only)
  - **User permissions**: Email addresses
- Generate GitHub App Client ID and Client Secret
- Update Supabase GitHub provider with GitHub App credentials
- Save configuration and test OAuth flow
- If successful, document migration steps and update configuration guide

### Alternative Scope Format Testing
- Test scope as array: `scopes: ['user:email']` in `web/app/login/page.tsx`
- Test multiple scopes: `scopes: 'read:user user:email'`
- Test comma-separated scopes: `scopes: 'read:user,user:email'`
- Review Supabase SDK source code for scope parameter handling
- Check Supabase community discussions for reported scope parameter issues

### Final Validation
- Clear browser cookies and localStorage for staging domain
- Navigate to `https://develop.kotadb.io/login` and initiate OAuth flow
- Complete GitHub authorization and verify successful redirect to dashboard
- Verify no error query parameters in URL (`?error=auth_failed`)
- Check browser DevTools → Application → Cookies for `sb-*` session cookies
- Refresh page and verify session persists
- Test with multiple GitHub accounts (with and without private email setting)
- Confirm API key auto-generation succeeds (or gracefully fails with expected error)

### Documentation Updates
- Update `docs/github-oauth-staging-config-guide.md` with final root cause and resolution steps
- Add troubleshooting section for 403 "Resource not accessible by integration" error
- Document whether GitHub App migration was required vs OAuth App permission fix
- Update validation checklist with new verification steps discovered during investigation
- Add screenshots or console output examples for future debugging reference

### Branch Management and Closure
- Stage all documentation changes: `git add docs/specs/chore-293-*.md docs/github-oauth-staging-config-guide.md`
- Commit changes with conventional commit message (see "Commit Message Validation" section)
- Push branch: `git push -u origin chore/293-github-oauth-403-investigation`
- Verify CI passes (if applicable for documentation-only changes)
- Create GitHub issue comment summarizing findings and resolution
- Close issue #293 with reference to PR number

## Risks

**Risk: GitHub OAuth App vs GitHub App Incompatibility**
- **Mitigation**: If OAuth App cannot support `user:email` scope at application level, migrate to GitHub App with explicit email permissions. GitHub Apps have more granular permission models designed for API integrations.

**Risk: Supabase SDK Scope Parameter Not Transmitted to GitHub**
- **Mitigation**: Inspect browser Network tab to verify scope parameter reaches GitHub authorization URL. If Supabase SDK bug, report to Supabase and implement workaround via custom OAuth flow.

**Risk: GitHub API Rate Limiting During Testing**
- **Mitigation**: Use multiple test GitHub accounts and implement delays between test attempts. Monitor GitHub API rate limit headers in browser DevTools.

**Risk: Callback URL Mismatch Between GitHub and Supabase**
- **Mitigation**: Triple-check callback URL format matches exactly between GitHub OAuth App settings and Supabase redirect URL. Even minor differences (trailing slash, protocol) can cause failures.

**Risk: Breaking Existing User Sessions**
- **Mitigation**: OAuth configuration changes (Client ID/Secret rotation) may invalidate existing sessions. Notify staging users to re-authenticate after configuration updates.

**Risk: Production OAuth App Misconfiguration**
- **Mitigation**: Ensure staging OAuth App ("KotaDB Preview") is entirely separate from production OAuth App. Never test configuration changes on production credentials.

## Validation Commands

Since this is primarily a configuration investigation chore, validation focuses on manual testing and documentation verification rather than automated tests.

### Level 1: Code Integrity (no code changes expected)
```bash
# Verify no uncommitted code changes
git status

# Verify web app type-checks successfully
cd web && bunx tsc --noEmit

# Verify no lint errors
cd web && bun run lint
```

### Level 2: Manual OAuth Flow Testing (required)
```bash
# Manual steps (cannot be automated):
# 1. Navigate to https://develop.kotadb.io/login in browser with DevTools open
# 2. Open Network tab and filter for "github.com" requests
# 3. Click "Sign in with GitHub"
# 4. Inspect redirect URL and verify scope=user:email parameter present
# 5. Complete GitHub authorization
# 6. Verify redirect to https://develop.kotadb.io/dashboard with no error parameters
# 7. Check browser DevTools → Application → Cookies for sb-* cookies
# 8. Refresh page and verify session persists
```

### Level 3: Supabase Configuration Audit (required)
```bash
# Manual steps (cannot be automated):
# 1. Access Supabase Dashboard at https://supabase.com/dashboard
# 2. Navigate to project szuaoiiwrwpuhdbruydr
# 3. Go to Authentication → Providers → GitHub
# 4. Verify "Enabled" status is ON
# 5. Verify Client ID is populated
# 6. Verify Client Secret is populated (masked)
# 7. Verify Redirect URL shows https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback
```

### Level 4: GitHub OAuth App Verification (required)
```bash
# Manual steps (cannot be automated):
# 1. Navigate to https://github.com/settings/developers
# 2. Locate "KotaDB Preview" OAuth App
# 3. Verify Authorization callback URL: https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback
# 4. Verify app type (OAuth App vs GitHub App)
# 5. Check Permissions tab for email access configuration
# 6. Verify Client ID matches Supabase configuration
```

### Level 5: Integration Test with API Key Generation
```bash
# Test API key generation endpoint after successful OAuth
# Replace <SESSION_TOKEN> with Supabase access token from browser DevTools after successful login

curl -X POST https://kotadb-staging.fly.dev/api/keys/generate \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  -H "Content-Type: application/json"

# Expected response: {"apiKey": "kota_free_...", "keyId": "...", ...}
# If 404 error: API key generation endpoint not yet implemented (separate issue)
```

### Validation Checklist
- [ ] GitHub OAuth App "KotaDB Preview" exists and is accessible
- [ ] Callback URL in GitHub matches Supabase redirect URL exactly
- [ ] OAuth App type identified (OAuth App vs GitHub App)
- [ ] OAuth App permissions reviewed for email access configuration
- [ ] Supabase GitHub provider shows "Enabled" status
- [ ] Client ID and Secret configured in Supabase provider settings
- [ ] Scope parameter `user:email` transmitted to GitHub authorization URL (verified in Network tab)
- [ ] OAuth flow tested end-to-end with successful dashboard redirect
- [ ] No error query parameters in URL after authentication (`?error=auth_failed`)
- [ ] Session cookies present in browser after authentication
- [ ] Session persists across page refreshes
- [ ] Documentation updated with findings and resolution steps
- [ ] Branch pushed to remote with conventional commit message
- [ ] Issue #293 closed with summary comment

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- Use direct statements without meta-commentary

**Example valid commit messages:**
```
chore(docs): investigate github oauth 403 error root cause

docs(auth): update oauth config guide with github app migration steps

fix(web): update oauth scope format for github api compatibility
```

**Invalid commit messages to avoid:**
```
Based on the issue, this commit investigates the OAuth error
Looking at the logs, I can see the problem is with scope transmission
Here is the documentation update for the OAuth configuration
```

## Investigation Findings

### Phase 1: Scope Transmission Verification
**Status**: COMPLETED
**Test Date**: 2025-10-26
**Tester**: User verification

**Browser Network Tab Inspection**:
- [x] OAuth authorization URL captured: `https://github.com/login/oauth/authorize?client_id=Iv23liMbkQjqRF4CppQr&...`
- [x] Scope parameter present: Yes
- [x] Scope value transmitted: `scope=user%3Aemail+user%3Aemail`
- [x] Full redirect chain documented: Yes

**Findings**:
Scope parameter is correctly transmitted to GitHub. URL-encoded as `user%3Aemail+user%3Aemail` (decoded: `user:email user:email`). Note duplicate scope value appears to be Supabase SDK behavior. Code implementation in `web/app/login/page.tsx:29` is correct - scope transmission is working as expected.

### Phase 2: GitHub OAuth App Configuration Audit
**Status**: COMPLETED - ROOT CAUSE IDENTIFIED
**Audit Date**: 2025-10-26

**GitHub OAuth App Details**:
- App Name: Does not exist
- App Type: N/A - Only GitHub App exists (not OAuth App)
- Callback URL: N/A
- Permissions Configured: N/A
- Client ID (last 4 chars): N/A

**Configuration Issues Identified**:
ROOT CAUSE: GitHub OAuth App does not exist for "KotaDB Preview" staging environment. Only a GitHub App is configured, but Supabase authentication provider requires a GitHub OAuth App for user authentication flows. GitHub Apps and OAuth Apps serve different purposes and are not interchangeable.

### Phase 3: Supabase Provider Configuration Audit
**Status**: PENDING MANUAL VERIFICATION
**Audit Date**: _________________

**Supabase Provider Status**:
- Provider Enabled: Yes / No
- Client ID Configured: Yes / No
- Client Secret Configured: Yes / No
- Redirect URL Shown: _________________

**Configuration Issues Identified**:
_________________

### Phase 4: Root Cause Determination
**Status**: COMPLETED

**Root Cause**: Supabase GitHub provider configured with GitHub App credentials instead of OAuth App credentials. Supabase requires GitHub OAuth App for user authentication, but only GitHub App exists.

**Evidence**:
1. Scope parameter transmission verified working correctly (`scope=user%3Aemail+user%3Aemail`)
2. GitHub Settings → Developer Settings → OAuth Apps shows no OAuth App for KotaDB
3. Only GitHub App exists, which cannot be used for Supabase user authentication flows
4. Application code is correct - issue is purely external configuration

**Resolution Required**:
Create new GitHub OAuth App and update Supabase provider with OAuth App Client ID and Secret. See docs/investigation-runbook-293.md "Action Plan: Create OAuth App" for step-by-step instructions.

### Phase 5: Post-Fix Validation
**Status**: COMPLETED (initial validation successful)
**Validation Date**: 2025-10-26

**Resolution Applied**:
Created GitHub OAuth App "KotaDB Preview" and updated Supabase GitHub provider with OAuth App Client ID and Secret (replacing GitHub App credentials).

**Validation Test Results**:
- [x] OAuth flow completes successfully
- [x] No error query parameters in URL
- [x] Session cookies present after auth
- [ ] Session persists across refreshes (pending verification)
- [ ] Multiple test users validated: 1 / 3 (pending additional test accounts)

**Test Evidence**: User successfully authenticated via staging environment (https://develop.kotadb.io) and was redirected to dashboard without 403 error. OAuth App configuration resolves the "Resource not accessible by integration" error.

## Deliverables

### Configuration Changes
- GitHub OAuth App or GitHub App properly configured with email access permissions
- Supabase GitHub provider credentials updated with correct Client ID and Secret
- OAuth callback URL verified and corrected if mismatched

### Documentation Updates
- `docs/specs/chore-293-github-oauth-403-investigation.md` — Investigation findings and resolution steps
- `docs/github-oauth-staging-config-guide.md` — Updated with troubleshooting section and final configuration steps

### Code Changes (if required)
- `web/app/login/page.tsx` — Update scope parameter format if syntax issue discovered (e.g., array vs string)

### Validation Results
- Manual OAuth flow test report with screenshots or console output
- Browser Network tab inspection results showing scope parameter transmission
- Supabase Auth logs analysis for error event ID `622598bc-4b78-4e3d-ab71-452bce8abcc0`
