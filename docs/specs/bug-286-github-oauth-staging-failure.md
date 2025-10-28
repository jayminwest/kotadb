# Bug Plan: GitHub OAuth Staging Environment Configuration Failure

## Bug Summary

**Observed Behavior:**
Users attempting to authenticate via GitHub OAuth on the staging environment (https://develop.kotadb.io) encounter a Supabase error after completing the GitHub authorization flow. The error `Error getting user profile from external provider` appears in the URL parameters, and users are redirected to the homepage with no visual feedback about the authentication failure.

**Expected Behavior:**
After completing GitHub OAuth authorization, Supabase should successfully retrieve the user profile from GitHub, create/resume a session, and redirect the user to `/dashboard` with an active authenticated session.

**Suspected Scope:**
This is a configuration issue isolated to the staging/preview environment. The problem likely exists in one of three places:
1. Supabase preview branch missing GitHub OAuth provider configuration
2. GitHub OAuth app credentials not configured or incorrect in Supabase Auth settings
3. GitHub OAuth app callback URL mismatch with Supabase's expected redirect URI format

## Root Cause Hypothesis

**Leading Theory:**
The Supabase preview branch (`szuaoiiwrwpuhdbruydr.supabase.co`) does not have the GitHub authentication provider enabled or properly configured with valid OAuth app credentials. When Supabase attempts to exchange the OAuth code for user profile data, it lacks the necessary GitHub App Client ID and Secret to make authenticated requests to GitHub's API.

**Supporting Evidence:**
1. Error message `Error getting user profile from external provider` is Supabase's standard error when OAuth provider credentials are missing or invalid
2. Environment variable file `web/.env.vercel.preview` contains valid Supabase URL and anon key, indicating Supabase project exists
3. Login page implementation (`web/app/login/page.tsx:25-30`) correctly initiates OAuth flow with `redirectTo` parameter
4. Callback handler (`web/app/auth/callback/route.ts:4-16`) properly handles code exchange logic
5. No GitHub OAuth App is mentioned in deployment documentation as existing for preview environment
6. Spec file `docs/specs/plan-env-setup-preview-production.md` identifies missing GitHub OAuth App configuration as a known gap

**Alternative Hypotheses (less likely):**
- **Callback URL Mismatch**: GitHub OAuth app has incorrect callback URL configured (should be `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`)
- **Missing Permissions**: GitHub OAuth app lacks `read:user` and `user:email` scopes
- **Rate Limiting**: GitHub API rate limiting OAuth requests (unlikely given single user testing)

## Fix Strategy

**Code Changes:**
No application code changes required. The bug is purely a configuration issue in external services (Supabase Dashboard and GitHub Settings).

**Configuration Updates:**
1. **Create GitHub OAuth App for staging** (if it doesn't exist):
   - Navigate to GitHub Settings → Developer Settings → OAuth Apps
   - Create new app: "KotaDB Preview/Staging"
   - Set Authorization callback URL: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
   - Enable scopes: `read:user`, `user:email`
   - Generate Client ID and Client Secret

2. **Configure Supabase preview branch**:
   - Access Supabase Dashboard for preview project (`szuaoiiwrwpuhdbruydr`)
   - Navigate to Authentication → Providers → GitHub
   - Enable GitHub provider
   - Paste GitHub OAuth App Client ID and Client Secret
   - Save configuration

3. **Add user-facing error handling** (optional enhancement):
   - Update `web/app/login/page.tsx` to detect error query parameters
   - Display toast notification or inline error message for authentication failures
   - Provide actionable guidance (e.g., "Contact support if issue persists")

**Guardrails:**
- Test OAuth flow immediately after configuration to verify success
- Document GitHub OAuth App credentials in team password manager (1Password, Bitwarden, etc.)
- Add monitoring for authentication error rates (future enhancement)
- Create checklist in deployment docs to prevent recurrence in production environment

## Relevant Files

### Existing Files (Investigation Only)
- `web/app/login/page.tsx` — GitHub OAuth login UI (no changes needed, implementation correct)
- `web/app/auth/callback/route.ts` — OAuth callback handler (no changes needed, logic correct)
- `web/lib/supabase.ts` — Supabase browser client factory (no changes needed)
- `web/lib/supabase-server.ts` — Supabase server client (no changes needed)
- `web/.env.vercel.preview` — Vercel environment variables for staging (reference for Supabase URL)
- `docs/specs/plan-env-setup-preview-production.md` — Environment setup documentation (reference for GitHub App setup steps)
- `docs/specs/feature-271-github-oauth-web-auth.md` — OAuth implementation spec (reference for expected flow)

### Optional Enhancement Files (Not Required for Fix)
- `web/app/login/page.tsx` — Add error message display for authentication failures
- `docs/deployment-setup-guide.md` — Document GitHub OAuth App creation steps (may not exist yet)

### New Files
None required for core fix. Configuration only.

## Task Breakdown

### Verification
**Steps to reproduce current failure:**
1. Clear browser cookies and localStorage for `https://develop.kotadb.io`
2. Navigate to `https://develop.kotadb.io/login`
3. Click "Sign in with GitHub" button
4. Complete GitHub authorization flow (approve application)
5. Observe redirect to homepage with error parameters: `?error=server_error&error_code=unexpected_failure&error_description=Error+getting+user+profile+from+external+provider`
6. Open browser DevTools Console and check for Supabase Auth errors

**Logs/Metrics to Capture:**
- Browser DevTools Console output during OAuth flow (capture any Supabase client errors)
- Browser DevTools Network tab: inspect redirect chain from GitHub → Supabase → Web app
- Supabase Dashboard Logs (if accessible): check Auth logs for detailed error messages
- Verify current GitHub OAuth Apps under GitHub Settings → Developer Settings → OAuth Apps

### Implementation
**Ordered steps to deliver the fix:**

1. **Audit existing GitHub OAuth Apps**
   - Navigate to https://github.com/settings/developers
   - Check if "KotaDB Preview" or "KotaDB Staging" OAuth app exists
   - If exists: verify callback URL matches `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
   - If exists but misconfigured: update callback URL and regenerate credentials
   - If not exists: proceed to next step

2. **Create GitHub OAuth App for staging** (if needed)
   - Click "New OAuth App" button
   - Fill in form:
     - Application name: `KotaDB Preview`
     - Homepage URL: `https://develop.kotadb.io`
     - Authorization callback URL: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
     - Enable default scopes (read:user, user:email are automatic)
   - Click "Register application"
   - Copy Client ID (visible immediately)
   - Click "Generate a new client secret" button
   - Copy Client Secret (shown only once - store securely)

3. **Configure Supabase preview branch GitHub provider**
   - Access Supabase Dashboard at https://supabase.com/dashboard
   - Navigate to preview project (`szuaoiiwrwpuhdbruydr`)
   - Go to Authentication (left sidebar) → Providers (tab)
   - Scroll to GitHub provider section
   - Toggle "Enable GitHub" to ON
   - Paste GitHub OAuth App Client ID into "Client ID" field
   - Paste GitHub OAuth App Client Secret into "Client Secret" field
   - Click "Save" button at bottom of page
   - Wait for confirmation message (may take 5-10 seconds)

4. **Verify configuration applied successfully**
   - Refresh Supabase Dashboard page
   - Confirm GitHub provider shows "Enabled" status
   - Note the Redirect URL shown in provider settings (should be `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`)

### Validation
**Tests to add/update:**
No automated tests required for this configuration fix. All validation is manual.

**Manual checks to run:**

1. **Test OAuth flow end-to-end**
   - Clear browser cookies and localStorage for `https://develop.kotadb.io`
   - Navigate to `https://develop.kotadb.io/login`
   - Click "Sign in with GitHub" button
   - Verify redirect to GitHub authorization page (should show "KotaDB Preview" app name)
   - Click "Authorize" button on GitHub
   - **Expected success**: Redirect to `https://develop.kotadb.io/dashboard` (or `/auth/callback` first, then dashboard)
   - **Expected success**: No error query parameters in URL
   - **Expected success**: User session active (check browser DevTools → Application → Cookies for `sb-*` cookies)

2. **Verify session persistence**
   - After successful login, refresh `https://develop.kotadb.io/dashboard` page
   - **Expected success**: User remains logged in (no redirect to `/login`)
   - Check browser localStorage for `supabase.auth.token` key

3. **Test API key generation** (if implemented)
   - After successful login, check dashboard for API key display
   - If auto-generation is implemented, verify key appears immediately
   - If manual generation button exists, click and verify key creation

4. **Record test data for future regression testing**
   - Document test user GitHub account used for OAuth testing
   - Record timestamp of successful authentication
   - Save screenshot of successful dashboard view
   - Note any console warnings or errors (even if authentication succeeds)

## Step by Step Tasks

### Pre-Implementation Audit
- Access GitHub Settings → Developer Settings → OAuth Apps to check for existing "KotaDB Preview" app
- Access Supabase Dashboard for project `szuaoiiwrwpuhdbruydr` to check current GitHub provider status
- Document current state (enabled/disabled, credentials present/absent) for rollback reference

### GitHub OAuth App Setup
- Create new OAuth App at https://github.com/settings/developers (or update existing if misconfigured)
- Set Authorization callback URL to `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
- Generate and securely store Client ID and Client Secret

### Supabase Configuration
- Enable GitHub provider in Supabase Dashboard → Authentication → Providers
- Paste GitHub OAuth App Client ID into Supabase provider settings
- Paste GitHub OAuth App Client Secret into Supabase provider settings
- Save configuration and verify "Enabled" status

### Testing and Validation
- Clear browser cookies and localStorage for staging domain
- Navigate to `https://develop.kotadb.io/login` and initiate OAuth flow
- Complete GitHub authorization and verify successful redirect to dashboard
- Verify session persistence across page refreshes
- Check browser DevTools for any console errors or warnings
- Test protected routes (e.g., `/dashboard`, `/files`) to confirm authentication works

### Documentation (Optional)
- Update `docs/deployment-setup-guide.md` with GitHub OAuth App creation steps (if file exists)
- Add troubleshooting section for common OAuth errors to web app README
- Document GitHub OAuth App credentials in team password manager

### Final Verification and Closure
- Re-run manual OAuth flow test to confirm reproducible success
- Verify no error query parameters appear in URL after authentication
- Confirm issue #286 acceptance criteria are met
- Close GitHub issue with summary of configuration changes applied

## Regression Risks

**Adjacent Features to Watch:**
1. **API Key Auto-Generation**: The callback route attempts to call `/api/keys/generate` endpoint after successful authentication. If this endpoint doesn't exist or fails, users will see `?key_error=true` in the dashboard URL. This is a separate issue from OAuth configuration but may surface after fixing authentication.

2. **Session Refresh Logic**: Supabase session tokens expire after a configurable duration (default 1 hour). If session refresh middleware is not properly configured, users may be logged out unexpectedly after token expiration.

3. **Protected Route Middleware**: The `web/middleware.ts` file redirects unauthenticated users to `/login`. If OAuth succeeds but session cookies are not properly set, users may experience redirect loops.

4. **Cross-Origin Cookie Issues**: If Vercel preview deployment domain differs from Supabase callback domain, session cookies may be blocked by browser SameSite policies. This is unlikely given the current setup but should be monitored.

**Follow-Up Work if Risks Materialize:**

- **If API key generation fails after OAuth succeeds**:
  - Create new issue to implement `/api/keys/generate` backend endpoint (may already exist per feature #271)
  - Verify `NEXT_PUBLIC_API_URL` environment variable points to correct backend API URL
  - Add error handling in callback route to display user-friendly message for key generation failures

- **If session refresh fails**:
  - Verify `web/middleware.ts` includes session refresh logic via `supabase.auth.getSession()`
  - Check Supabase Dashboard → Authentication → Settings for session timeout configuration
  - Add client-side session refresh logic in `web/context/AuthContext.tsx` if missing

- **If protected routes experience redirect loops**:
  - Debug session cookie persistence by inspecting `sb-*` cookies in browser DevTools
  - Verify `createServerClient` cookie handling in `web/lib/supabase-server.ts` correctly sets cookies
  - Check for conflicting middleware rules in `web/middleware.ts`

- **If cross-origin issues occur**:
  - Verify Vercel deployment domain matches `redirectTo` parameter in login page
  - Check browser console for CORS or SameSite cookie warnings
  - Consider using Supabase custom domain feature to align callback URL with app domain

## Validation Commands

Since this is a configuration-only fix with no code changes, automated validation is limited. The following commands verify the application layer remains unchanged and functional:

**Level 1: Basic validation (no code changes expected)**
```bash
# Verify no uncommitted changes in web app
cd web && git status

# Verify web app builds successfully (no TypeScript errors)
cd web && bunx tsc --noEmit

# Verify no lint errors
cd web && bun run lint

# Verify web app builds for production
cd web && bun run build
```

**Level 2: Manual OAuth flow testing (required)**
```bash
# Start local web app (optional, for reference comparison)
cd web && bun run dev

# Manual steps (cannot be automated):
# 1. Navigate to https://develop.kotadb.io/login in browser
# 2. Click "Sign in with GitHub"
# 3. Authorize application on GitHub
# 4. Verify redirect to https://develop.kotadb.io/dashboard
# 5. Verify no error query parameters in URL
# 6. Check browser DevTools → Application → Cookies for sb-* cookies
# 7. Refresh page and verify session persists
```

**Level 3: Integration testing (backend dependency)**
```bash
# Verify backend API is reachable from staging environment
curl -I https://kotadb-staging.fly.dev/health

# Test API key generation endpoint (after OAuth succeeds)
# Replace <SESSION_TOKEN> with Supabase access token from successful login
curl -X POST https://kotadb-staging.fly.dev/api/keys/generate \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  -H "Content-Type: application/json"

# Expected response: {"apiKey": "kota_free_...", "keyId": "...", ...}
# If 404 error: API key generation endpoint not yet implemented (separate issue)
```

**Configuration Verification Checklist:**
- [ ] GitHub OAuth App exists with name "KotaDB Preview"
- [ ] Callback URL set to `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
- [ ] Client ID and Client Secret copied and stored securely
- [ ] Supabase GitHub provider shows "Enabled" status in dashboard
- [ ] Client ID and Secret pasted into Supabase provider settings
- [ ] Configuration saved successfully (confirmation message displayed)
- [ ] OAuth flow tested end-to-end with successful dashboard redirect
- [ ] Session cookies present in browser after authentication
- [ ] Session persists across page refreshes
- [ ] No error query parameters in URL after authentication

## Commit Message Validation

Since this fix requires no code changes (configuration only), no commits are expected. If optional enhancements are implemented (e.g., error message display in login page), commits must follow Conventional Commits format.

**Example valid commit messages for optional enhancements:**
```
feat(web): add error message display for OAuth failures

chore(docs): document GitHub OAuth App setup for staging

fix(web): improve OAuth error handling in login page
```

**Invalid commit messages to avoid:**
```
Looking at the changes, this commit adds error handling
Based on the issue description, I can see we need to display errors
Here is the implementation of OAuth error messages
```

**Validation criteria:**
- Type must be one of: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `style`
- Scope should reference affected component: `web`, `docs`, `api`, `auth`
- Subject must be imperative mood: "add", "fix", "update" (not "adds", "added", "adding")
- Subject must be lowercase and under 72 characters
- No meta-commentary or narrative voice (direct technical statements only)
