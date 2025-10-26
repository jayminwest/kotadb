# GitHub OAuth Configuration Guide for Staging Environment

**Issue**: #286
**Environment**: Staging (https://develop.kotadb.io)
**Supabase Project**: szuaoiiwrwpuhdbruydr

## Problem Summary

Users attempting to authenticate via GitHub OAuth on the staging environment encounter error: `Error getting user profile from external provider`

**Root Cause**: GitHub accounts with "Keep my email addresses private" enabled prevent Supabase from accessing email via the default `/user` API endpoint. Supabase requires explicit `user:email` scope to access the `/user/emails` endpoint for private email addresses.

**Fix**: Two-part solution:
1. Add `scopes: 'user:email'` to OAuth request in application code
2. Configure GitHub OAuth App and Supabase provider (as originally planned)

## Code Changes

### Application Code Fix (Completed)

The login page now explicitly requests the `user:email` scope to access private email addresses:

**File**: `web/app/login/page.tsx`
**Change**:
```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    scopes: 'user:email',  // Explicitly request email scope for private emails
  },
})
```

This ensures Supabase can access the `/user/emails` GitHub API endpoint even when users have "Keep my email addresses private" enabled in their GitHub account settings.

## Configuration Steps

### Step 1: Create GitHub OAuth App

1. Navigate to: https://github.com/settings/developers
2. Check if "KotaDB Preview" or "KotaDB Staging" OAuth app exists
3. If exists:
   - Verify callback URL: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
   - If incorrect, update and regenerate credentials
4. If not exists, click "New OAuth App" and configure:
   - **Application name**: `KotaDB Preview`
   - **Homepage URL**: `https://develop.kotadb.io`
   - **Authorization callback URL**: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
   - **Description**: OAuth app for KotaDB staging environment
5. Click "Register application"
6. Copy **Client ID** (visible immediately)
7. Click "Generate a new client secret"
8. Copy **Client Secret** (shown only once - store securely)

### Step 2: Configure Supabase GitHub Provider

1. Navigate to: https://supabase.com/dashboard
2. Select project: `szuaoiiwrwpuhdbruydr` (KotaDB Preview)
3. Go to: Authentication → Providers (left sidebar)
4. Scroll to **GitHub** provider section
5. Toggle "Enable GitHub" to **ON**
6. Paste GitHub OAuth App **Client ID** into "Client ID" field
7. Paste GitHub OAuth App **Client Secret** into "Client Secret" field
8. Click **Save** button at bottom of page
9. Wait for confirmation message (5-10 seconds)
10. Refresh page and verify GitHub provider shows "Enabled" status
11. Note the Redirect URL shown: should be `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`

### Step 3: Manual Validation Testing

1. Clear browser cookies and localStorage for `https://develop.kotadb.io`
2. Navigate to: `https://develop.kotadb.io/login`
3. Click "Sign in with GitHub" button
4. Verify redirect to GitHub authorization page showing "KotaDB Preview" app name
5. Click "Authorize" button on GitHub
6. **Expected success**: Redirect to `https://develop.kotadb.io/dashboard`
7. **Expected success**: No error query parameters in URL
8. **Expected success**: User session active (check browser DevTools → Application → Cookies for `sb-*` cookies)

### Step 4: Verify Session Persistence

1. After successful login, refresh `https://develop.kotadb.io/dashboard` page
2. **Expected success**: User remains logged in (no redirect to `/login`)
3. Check browser localStorage for `supabase.auth.token` key

### Step 5: Document Credentials

1. Store GitHub OAuth App Client ID and Client Secret in team password manager (1Password, Bitwarden, etc.)
2. Label credentials: "KotaDB Preview - GitHub OAuth App"
3. Note creation date and configured callback URL for reference

## Validation Checklist

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

## Known Follow-Up Issues

### API Key Auto-Generation

After successful OAuth, the callback route attempts to call `/api/keys/generate` endpoint. If this endpoint fails:
- Users will see `?key_error=true` in dashboard URL
- This is a separate issue from OAuth configuration (likely issue #271)
- Authentication still succeeds - only API key generation fails
- Verify `NEXT_PUBLIC_API_URL=https://kotadb-staging.fly.dev` environment variable is set correctly

### Test Credentials

Manual test command (replace `<SESSION_TOKEN>` with Supabase access token from successful login):

```bash
curl -X POST https://kotadb-staging.fly.dev/api/keys/generate \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  -H "Content-Type: application/json"
```

Expected response: `{"apiKey": "kota_free_...", "keyId": "...", ...}`

If 404 error: API key generation endpoint not yet implemented

## Troubleshooting

### 403 Error: "Resource not accessible by integration"

**Symptom**: GitHub OAuth flow redirects back to Supabase with error 403, message "Resource not accessible by integration"

**Root Cause Investigation Checklist**:

1. **Verify Scope Parameter Transmission**:
   - Open browser DevTools → Network tab
   - Navigate to `https://develop.kotadb.io/login`
   - Click "Sign in with GitHub"
   - Find the GitHub authorization redirect in Network tab
   - Check if `scope=user:email` or `scope=read:user%20user:email` parameter is present
   - If missing, the scope parameter is not being transmitted to GitHub

2. **Check GitHub OAuth App vs GitHub App Type**:
   - Navigate to https://github.com/settings/developers
   - Locate "KotaDB Preview" OAuth App
   - Verify app type: GitHub OAuth Apps have different permission models than GitHub Apps
   - GitHub OAuth Apps may require application-level email permissions beyond scope parameter
   - Consider migrating to GitHub App for more granular permission control

3. **Verify GitHub OAuth App Permissions**:
   - In GitHub OAuth App settings, check Permissions tab
   - Verify email access is enabled at application level (not just via scope)
   - Some OAuth Apps require explicit permission grants in app configuration

4. **Test Alternative Scope Formats**:
   - Try scope as array: `scopes: ['user:email']` in `web/app/login/page.tsx`
   - Try multiple scopes: `scopes: 'read:user user:email'`
   - Try comma-separated: `scopes: 'read:user,user:email'`
   - Consult Supabase SDK documentation for correct scope syntax

5. **Regenerate OAuth App Credentials**:
   - If Client ID/Secret are stale or corrupted, regenerate in GitHub OAuth App settings
   - Update Supabase GitHub provider with new credentials
   - Test OAuth flow immediately after credential rotation

6. **Migrate to GitHub App** (if OAuth App type is blocker):
   - Create new GitHub App at https://github.com/settings/apps
   - Configure with explicit email read permissions (User permissions → Email addresses → Read-only)
   - Replace OAuth App credentials in Supabase with GitHub App Client ID and Secret
   - GitHub Apps have more granular permission models designed for API integrations

**Resolution Steps** (documented 2025-10-26):
- Root cause identified: GitHub App credentials used instead of OAuth App credentials. Supabase GitHub authentication provider requires OAuth App (not GitHub App) for user sign-in flows.
- Fix applied: Created new GitHub OAuth App "KotaDB Preview" at https://github.com/settings/developers and updated Supabase provider credentials with OAuth App Client ID and Secret.
- Validation results: OAuth flow successful, user authenticated and redirected to dashboard without 403 error. GitHub OAuth App resolves the "Resource not accessible by integration" error.

### Redirect Loop

If users experience redirect loops after OAuth:
- Debug session cookie persistence in browser DevTools
- Verify `createServerClient` cookie handling in `web/lib/supabase-server.ts`
- Check `web/middleware.ts` for conflicting rules

### Session Refresh Issues

If sessions expire unexpectedly:
- Check Supabase Dashboard → Authentication → Settings for session timeout configuration
- Verify `web/middleware.ts` includes session refresh logic via `supabase.auth.getSession()`

### Cross-Origin Cookie Issues

If cookies are blocked by browser SameSite policies:
- Verify Vercel deployment domain matches `redirectTo` parameter in login page
- Check browser console for CORS or SameSite warnings
- Consider Supabase custom domain feature to align callback URL with app domain

## References

- Issue #286: GitHub OAuth staging failure
- Issue #271: GitHub OAuth web authentication (implementation spec)
- Plan: `docs/specs/bug-286-github-oauth-staging-failure.md`
- Login page: `web/app/login/page.tsx`
- Callback handler: `web/app/auth/callback/route.ts`
- Environment config: `web/.env.vercel.preview`
