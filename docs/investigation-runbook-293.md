# Investigation Runbook: Issue #293 - GitHub OAuth 403 Error

**Issue**: GitHub OAuth returns 403 "Resource not accessible by integration" error
**Environment**: Staging (https://develop.kotadb.io)
**Supabase Project**: szuaoiiwrwpuhdbruydr
**Investigation Date**: __________________
**Investigator**: __________________

---

## Phase 1: Scope Transmission Verification

### Objective
Verify that the `scopes: 'user:email'` parameter added in PR #292 is actually being transmitted to GitHub's authorization endpoint.

### Steps

1. **Open Browser DevTools**:
   - Launch Chrome or Firefox
   - Open DevTools (F12 or Cmd+Option+I)
   - Navigate to Network tab
   - Filter by "All" or "Doc" requests

2. **Initiate OAuth Flow**:
   - Navigate to: https://develop.kotadb.io/login
   - Click "Sign in with GitHub" button
   - **DO NOT complete the authorization yet**

3. **Capture Authorization URL**:
   - In Network tab, find the redirect to `github.com/login/oauth/authorize`
   - Right-click the request → Copy → Copy URL
   - Paste URL into a text editor
   - **Record the full URL here**:
     ```
     https://github.com/login/oauth/authorize?client_id=Iv23liMbkQjqRF4CppQr&redirect_to=https%3A%2F%2Fdevelop.kotadb.io%2Fauth%2Fcallback&redirect_uri=https%3A%2F%2Fszuaoiiwrwpuhdbruydr.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=user%3Aemail+user%3Aemail&state=eyJhbGciOiJIUzI1NiIsImtpZCI6Ik9uaUd1bzNZZ21XTGFXSzciLCJ0eXAiOiJKV1QifQ.eyJleHAiOjE3NjE1MDM5MTYsInNpdGVfdXJsIjoiaHR0cHM6Ly9hcHAuZGV2ZWxvcC5rb3RhZGIuaW8iLCJpZCI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCIsImZ1bmN0aW9uX2hvb2tzIjpudWxsLCJwcm92aWRlciI6ImdpdGh1YiIsInJlZmVycmVyIjoiaHR0cHM6Ly9kZXZlbG9wLmtvdGFkYi5pby8iLCJmbG93X3N0YXRlX2lkIjoiMjQ2ZDNkM2EtNWQ5MC00YWMyLTg4NzEtMmFhYTU4YmM4MjNlIiwiZW1haWxfb3B0aW9uYWwiOnRydWV9.20uCF-NiDyYoG2nVVVixtZSAwdUUR2pbdQGgzyAspis
     
     ```

4. **Analyze Scope Parameter**:
   - Search the URL for `scope=` parameter
   - **Is scope parameter present?**: YES / NO
   - **Scope value**: scope=user%3Aemail+user%3Aemail&
   - **Expected**: `scope=user:email` or `scope=read:user%20user:email`

5. **Document Redirect Chain**:
   - Note all redirects in sequence:
     1. Supabase OAuth initiation: __________________
     2. GitHub authorization page: __________________
     3. GitHub callback to Supabase: __________________
     4. Supabase redirect to app: __________________

### Findings

**Scope Transmission Status**: PASS

**Notes**:
Scope parameter is correctly transmitted as `scope=user%3Aemail+user%3Aemail` (URL-encoded `user:email user:email`, note duplicate due to Supabase SDK behavior). The scope transmission is working correctly - the issue is not with the application code.

---

## Phase 2: GitHub OAuth App Configuration Audit

### Objective
Verify GitHub OAuth App exists and is configured correctly with email permissions.

### Steps

1. **Access GitHub OAuth Apps**:
   - Navigate to: https://github.com/settings/developers
   - Click "OAuth Apps" tab

2. **Locate KotaDB Preview App**:
   - **Does "KotaDB Preview" app exist?**: YES / NO
   - If NO, skip to Phase 3 (GitHub App Migration)

3. **Record App Details**:
   - **Application name**: __________________
   - **Homepage URL**: __________________
   - **Authorization callback URL**: __________________
   - **Expected callback**: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
   - **Callback URL matches?**: YES / NO

4. **Check Client Credentials**:
   - **Client ID (last 4 chars)**: __________________
   - **Client Secret last regenerated**: __________________

5. **Check Permissions Tab** (if available):
   - Click "Permissions" tab (if visible)
   - **Email addresses permission**: Enabled / Disabled / Not Available
   - **User data access permission**: Enabled / Disabled / Not Available

6. **Identify App Type**:
   - GitHub OAuth Apps do NOT have granular permission tabs (only scopes)
   - GitHub Apps HAVE detailed permission tabs with read/write controls
   - **App Type**: OAuth App / GitHub App

### Findings

**OAuth App Configuration Status**: FAIL - OAuth App does not exist

**Issues Identified**:
ROOT CAUSE: Only GitHub App exists, but Supabase GitHub authentication provider requires a GitHub OAuth App. GitHub Apps and OAuth Apps are different authentication mechanisms:
- GitHub App: For integrations acting on behalf of the app (CI/CD, bots, API access)
- OAuth App: For user authentication flows ("Sign in with GitHub")

Supabase cannot use GitHub App credentials for user authentication. Must create a separate OAuth App.

---

## Phase 3: Supabase Provider Configuration Audit

### Objective
Verify Supabase GitHub provider is enabled and configured with correct credentials.

### Steps

1. **Access Supabase Dashboard**:
   - Navigate to: https://supabase.com/dashboard
   - Select project: **szuaoiiwrwpuhdbruydr** (KotaDB Preview)

2. **Navigate to GitHub Provider**:
   - Click "Authentication" in left sidebar
   - Click "Providers" tab
   - Scroll to "GitHub" section

3. **Record Provider Status**:
   - **GitHub provider enabled**: YES / NO
   - **Redirect URL shown**: __________________
   - **Expected redirect**: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`

4. **Verify Credentials Configured**:
   - **Client ID field populated**: YES / NO
   - **Client ID (last 4 chars)**: __________________
   - **Client Secret field populated** (masked): YES / NO
   - **Credentials match GitHub OAuth App**: YES / NO / UNKNOWN

5. **Check Additional Settings**:
   - **Skip nonce check**: Enabled / Disabled
   - **Additional scopes configured**: __________________

### Findings

**Supabase Provider Status**: ___ PASS / ___ FAIL

**Configuration Mismatches**:
___________________________________________________________________________
___________________________________________________________________________

---

## Phase 4: Root Cause Hypothesis Testing

Based on Phases 1-3, select the most likely root cause and test the hypothesis.

### Hypothesis 1: Scope Not Transmitted to GitHub

**Test**: Modify `web/app/login/page.tsx` to use alternative scope syntax

**Options to try**:
```typescript
// Option A: Array syntax
scopes: ['user:email']

// Option B: Multiple scopes (space-separated)
scopes: 'read:user user:email'

// Option C: Multiple scopes (comma-separated)
scopes: 'read:user,user:email'
```

**Action**: Modify code, deploy to staging, test OAuth flow

**Result**: ___ PASS / ___ FAIL

---

### Hypothesis 2: GitHub OAuth App Type Incompatibility

**Observation**: GitHub OAuth Apps may not support `user:email` scope at application level

**Test**: Migrate to GitHub App with explicit email permissions

**Steps**:
1. Navigate to: https://github.com/settings/apps
2. Click "New GitHub App"
3. Configure:
   - **Name**: `KotaDB Preview App`
   - **Homepage URL**: `https://develop.kotadb.io`
   - **Callback URL**: `https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback`
   - **User permissions → Email addresses**: Read-only
4. Generate Client ID and Client Secret
5. Update Supabase GitHub provider with GitHub App credentials
6. Test OAuth flow

**Result**: ___ PASS / ___ FAIL

---

### Hypothesis 3: Stale or Corrupted OAuth Credentials

**Test**: Regenerate GitHub OAuth App credentials and update Supabase

**Steps**:
1. In GitHub OAuth App settings, click "Generate a new client secret"
2. Copy new Client Secret
3. Update Supabase GitHub provider with new Client Secret
4. Save configuration
5. Test OAuth flow immediately

**Result**: ___ PASS / ___ FAIL

---

## Phase 5: Post-Fix Validation

Once a fix is applied, complete end-to-end validation.

### Test 1: Successful OAuth Flow

1. Clear browser cookies and localStorage for `https://develop.kotadb.io`
2. Navigate to: `https://develop.kotadb.io/login`
3. Click "Sign in with GitHub"
4. Complete GitHub authorization
5. **Expected**: Redirect to `https://develop.kotadb.io/dashboard`
6. **Result**: ___ PASS / ___ FAIL

---

### Test 2: Session Persistence

1. After successful login, verify URL has no error parameters
2. Check browser DevTools → Application → Cookies
3. Verify `sb-*` cookies present with non-expired timestamps
4. Refresh page
5. **Expected**: User remains logged in (no redirect to `/login`)
6. **Result**: ___ PASS / ___ FAIL

---

### Test 3: Multiple User Validation

Test with different GitHub account configurations:

| GitHub Account | Private Email Setting | OAuth Success | Notes |
|----------------|----------------------|---------------|-------|
| Account 1      | Enabled              | ___ PASS / ___ FAIL | ________________ |
| Account 2      | Disabled             | ___ PASS / ___ FAIL | ________________ |
| Account 3      | Enabled              | ___ PASS / ___ FAIL | ________________ |

---

## Root Cause Summary

**Root Cause Identified**:
Supabase GitHub provider is configured with GitHub App credentials instead of OAuth App credentials. Supabase requires a GitHub OAuth App for user authentication flows, but only a GitHub App exists in the GitHub account.

**Evidence**:
1. Scope parameter correctly transmitted: `scope=user%3Aemail+user%3Aemail` (Phase 1 verification)
2. No OAuth App found in GitHub Settings → Developer Settings → OAuth Apps (Phase 2 audit)
3. Only GitHub App exists, which cannot be used for Supabase user authentication
4. Application code is correct - issue is purely configuration-based

**Resolution Required**:
Create new GitHub OAuth App and configure Supabase provider with OAuth App credentials.

---

## Action Plan: Create OAuth App

### Step 1: Create GitHub OAuth App

1. Navigate to: https://github.com/settings/developers
2. Click **"OAuth Apps"** tab (not "GitHub Apps")
3. Click **"New OAuth App"** button
4. Fill in the form:
   ```
   Application name: KotaDB Preview
   Homepage URL: https://develop.kotadb.io
   Application description: OAuth authentication for KotaDB staging environment
   Authorization callback URL: https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback
   ```
5. Click **"Register application"**
6. Copy the **Client ID** (visible immediately)
7. Click **"Generate a new client secret"**
8. Copy the **Client Secret** (shown only once - save it securely!)

### Step 2: Update Supabase GitHub Provider

1. Navigate to: https://supabase.com/dashboard
2. Select project: **szuaoiiwrwpuhdbruydr** (KotaDB Preview)
3. Go to: **Authentication** → **Providers** → **GitHub**
4. Verify provider is **Enabled** (toggle to ON if needed)
5. **Replace** the existing Client ID with the OAuth App Client ID (from Step 1.6)
6. **Replace** the existing Client Secret with the OAuth App Client Secret (from Step 1.8)
7. Click **"Save"** button at bottom of page
8. Wait for confirmation message (5-10 seconds)

### Step 3: Test OAuth Flow

1. Clear browser cookies and localStorage for `https://develop.kotadb.io`
2. Navigate to: https://develop.kotadb.io/login
3. Click **"Sign in with GitHub"**
4. Complete GitHub authorization
5. **Expected**: Redirect to `https://develop.kotadb.io/dashboard` with no error parameters
6. Verify session cookies present in browser DevTools

### Step 4: Validate with Multiple Users

Test with 2-3 different GitHub accounts:
- One with "Keep my email addresses private" **enabled**
- One with private email setting **disabled**

**Validation Results**:
- OAuth flow success rate: SUCCESS (initial test completed)
- Session persistence validated: PENDING (verify after test)
- Multiple users validated: PENDING (test with private email enabled accounts)

### Step 5: Document Credentials

Store OAuth App credentials in team password manager:
- Label: "KotaDB Preview - GitHub OAuth App"
- Client ID: ________________ (record in password manager)
- Client Secret: ________________ (masked - record in password manager)
- Callback URL: https://szuaoiiwrwpuhdbruydr.supabase.co/auth/v1/callback
- Created date: 2025-10-26
- Resolution verified: User successfully authenticated via OAuth App

---

## Follow-Up Actions

- [ ] Update `docs/specs/chore-293-github-oauth-403-investigation.md` with root cause and resolution
- [ ] Update `docs/github-oauth-staging-config-guide.md` with troubleshooting steps
- [ ] Document credentials in team password manager
- [ ] Test API key generation endpoint (if implemented)
- [ ] Close issue #293 with summary comment

---

## Supabase Auth Logs Reference

**Error Event ID**: `622598bc-4b78-4e3d-ab71-452bce8abcc0`
**Timestamp**: `2025-10-25T19:22:41Z`

**To access logs**:
1. Supabase Dashboard → Logs (left sidebar)
2. Filter by "Auth" logs
3. Search for error event ID or timestamp
4. Record detailed error message and stack trace

**Error Details** (from logs):
___________________________________________________________________________
___________________________________________________________________________
