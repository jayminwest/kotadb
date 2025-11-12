# Bug Plan: Dashboard API Keys Section Shows Conflicting Messages on Mobile

## Bug Summary

**Observed Behaviour:**
On Safari mobile, the dashboard's API Keys section displays **conflicting messages** simultaneously:
1. Red error message: "You already have an API key. Please contact support if you need a new one."
2. Below that: "No API key configured" with a blue "Generate API Key" button

This creates a confusing UX where users cannot determine their actual API key status.

**Expected Behaviour:**
The UI should show exactly ONE of these states, never both:
1. **Has API Key**: Display key metadata card + key display + Reset/Revoke buttons
2. **No API Key**: Display "No API key configured" + Generate button
3. **Error State**: Display error message but **still fetch and display** existing key if backend says it already exists

Behaviour must be consistent across all browsers (Chrome, Safari, Firefox, Edge) on both desktop and mobile.

**Suspected Scope:**
- Frontend state management race condition in `web/app/dashboard/page.tsx`
- Safari-specific timing differences in localStorage reads or React state synchronization
- Conditional rendering logic doesn't account for "already exists" error case

## Root Cause Hypothesis

**Leading Theory:**
The `keyGenError` state is displayed unconditionally (lines 400-406), while the API key display/generate UI is conditionally rendered based on `apiKey` state (lines 465-512). When the backend returns "already exists" error:

1. `keyGenError` is set to the error message (line 107)
2. **BUT** `apiKey` state remains falsy/null (not updated)
3. Both error message AND "No API key configured" sections render simultaneously

**Why Safari Is Affected More:**
Safari's JavaScript engine (JavaScriptCore) and stricter privacy controls may cause:
- Delayed localStorage reads (`kotadb_api_key`)
- Different React state batching behavior vs Chrome's V8
- Async/await promise timing differences
- ITP (Intelligent Tracking Prevention) affecting Supabase session cookies

**Supporting Evidence:**
- Backend endpoint (`app/src/api/routes.ts:837-845`) returns HTTP 200 with `message: "API key already exists"` when key exists
- Frontend only sets `keyGenError` but doesn't fetch the existing key metadata (lines 106-108)
- Chrome desktop works correctly, suggesting AuthContext properly loads `apiKey` from localStorage in Chrome but not reliably in Safari
- Conditional rendering checks `apiKey` truthiness (line 465) but `keyGenError` displays independently (line 400)

## Fix Strategy

**Code Changes:**

1. **Auto-fetch on "Already Exists" Error (Primary Fix)**
   - Location: `web/app/dashboard/page.tsx:106-108`
   - When backend returns "already exists", immediately call `fetchKeyMetadata()` to populate `keyMetadata` state
   - Clear `keyGenError` after successful fetch
   - Set `keyGenSuccess` to inform user

2. **Defensive Conditional Rendering (Secondary Fix)**
   - Location: `web/app/dashboard/page.tsx:400-406`
   - Only display `keyGenError` if `keyMetadata` is null AND `apiKey` is null
   - Prevents error from showing when key metadata exists

3. **Safari-Specific Testing**
   - Investigate AuthContext localStorage timing (lines 83-95)
   - Verify `apiKey` loads from localStorage on Safari mobile
   - Check for React hydration mismatches in Safari console

**Data/Config Updates:**
None required. This is purely a frontend state management fix.

**Guardrails:**
- Backend API is correct (returns proper HTTP 200 + metadata)
- No backend changes needed
- Defensive rendering prevents edge cases from showing conflicting messages
- Graceful error handling with clear user feedback

## Relevant Files

- `web/app/dashboard/page.tsx` — Contains `handleGenerateApiKey` and conditional rendering logic for API Keys section
- `web/context/AuthContext.tsx` — Global auth state management, localStorage API key loading
- `app/src/api/routes.ts` — Backend `/api/keys/generate` and `/api/keys/current` endpoints (no changes needed)

### New Files
None. This is a fix to existing code.

## Task Breakdown

### Verification
**Steps to Reproduce Current Failure:**
1. Open Safari on iOS device or simulator
2. Navigate to dashboard
3. Generate initial API key successfully
4. Refresh page (to simulate existing key scenario)
5. Click "Generate API Key" button again
6. **Observe**: Both red error message AND "No API key configured" button display simultaneously

**Logs/Metrics to Capture:**
- Browser console logs for React state updates
- Safari Web Inspector network tab to verify `/api/keys/generate` returns HTTP 200
- localStorage inspection to check `kotadb_api_key` value
- React DevTools to inspect `apiKey`, `keyGenError`, and `keyMetadata` states

### Implementation

**Task 1: Update `handleGenerateApiKey` to Auto-Fetch Existing Key**
- Modify `web/app/dashboard/page.tsx:106-108`
- When backend returns "already exists" message:
  - Set temporary loading message: "You already have an API key. Fetching details..."
  - Call `await fetchKeyMetadata()`
  - Clear `keyGenError` on successful fetch
  - Set `keyGenSuccess` to: "API key already exists and is active"
- Ensures `keyMetadata` state is populated even if `apiKey` isn't in localStorage

**Task 2: Add Defensive Conditional Rendering for Error Message**
- Modify `web/app/dashboard/page.tsx:400-406`
- Change condition from `{keyGenError && (` to `{keyGenError && !keyMetadata && !apiKey && (`
- Prevents error from displaying when key metadata exists
- Acts as safety net for edge cases

**Task 3: Safari-Specific Investigation (If Issues Persist)**
- Check `web/context/AuthContext.tsx:83-95` localStorage timing
- Consider using `useLayoutEffect` instead of `useEffect` for Safari
- Add logging to track when `apiKey` state updates vs when component renders
- Verify Supabase session cookies are set correctly in Safari

### Validation

**Tests to Add/Update:**
- **Integration Test**: `web/tests/dashboard/api-keys.test.ts` (new file)
  - Test scenario: Generate key when one already exists
  - Verify only ONE message displays (not both error + generate button)
  - Mock localStorage and verify state synchronization
  - Test with different timing delays to simulate Safari behavior

- **E2E Test**: `web/tests/e2e/dashboard-safari.spec.ts` (new file)
  - Run Playwright test in WebKit (Safari engine)
  - Test full user flow: login → generate → refresh → generate again
  - Assert conflicting messages never appear together
  - Verify key metadata card displays after "already exists" scenario

**Manual Checks to Run:**
1. **Safari Mobile (iOS)**: Full test checklist from issue description
2. **Safari Desktop (macOS)**: Verify consistent behavior
3. **Chrome Mobile (iOS)**: Test on WebKit (same engine as Safari)
4. **Chrome Mobile (Android)**: Test on Blink engine
5. **Chrome Desktop**: Regression test (should still work)
6. **Firefox Mobile/Desktop**: Cross-browser validation
7. **Edge Desktop**: Cross-browser validation

**Data to Seed:**
- Test user accounts with existing API keys
- Test users without API keys
- Test users with revoked API keys (edge case)

**Failure Cases to Test:**
- Network failure during `fetchKeyMetadata()` call
- Backend returns 500 error for `/api/keys/current`
- Backend returns 404 for `/api/keys/current` (no key exists despite "already exists" message)
- localStorage is cleared/corrupted between page loads

## Step by Step Tasks

### 1. Code Changes
- [ ] Modify `handleGenerateApiKey` in `web/app/dashboard/page.tsx` to auto-fetch metadata when backend returns "already exists"
- [ ] Add defensive conditional rendering to error message display block
- [ ] Add error handling for failed `fetchKeyMetadata()` call in auto-fetch scenario

### 2. Safari-Specific Testing (Manual)
- [ ] Test on Safari Mobile (iOS) - reproduce original bug
- [ ] Verify fix resolves Safari mobile issue
- [ ] Test on Safari Desktop (macOS)
- [ ] Test on Chrome Mobile (iOS with WebKit)
- [ ] Test on Chrome Mobile (Android with Blink)
- [ ] Document any Safari-specific quirks discovered

### 3. Automated Test Coverage
- [ ] Add integration test for "already exists" scenario
- [ ] Add E2E test using Playwright's WebKit browser
- [ ] Verify tests pass on all platforms

### 4. Cross-Browser Validation
- [ ] Test on Chrome Desktop (regression check)
- [ ] Test on Firefox Desktop
- [ ] Test on Firefox Mobile
- [ ] Test on Edge Desktop

### 5. Code Quality Checks
- [ ] Run `cd web && bun run lint`
- [ ] Run `cd web && bun run typecheck`
- [ ] Verify no console errors in browser

### 6. Git Workflow
- [ ] Commit changes with message: `fix(web): resolve conflicting API key messages on Safari mobile (#441)`
- [ ] Push branch: `git push -u origin bug/441-dashboard-api-keys-conflicting-messages`
- [ ] Verify CI passes
- [ ] Verify no pre-commit hook failures

### 7. Final Validation
- [ ] Re-test Safari mobile to confirm fix
- [ ] Verify all acceptance criteria from issue are met
- [ ] Document any residual Safari quirks for future reference

## Regression Risks

**Adjacent Features to Watch:**
1. **API Key Reset Flow** (`web/app/dashboard/page.tsx:164-197`)
   - Verify reset still works correctly after auto-fetch changes
   - Ensure `keyMetadata` refreshes after reset

2. **API Key Revoke Flow** (`web/app/dashboard/page.tsx:199-230`)
   - Verify revoke clears all state properly
   - Ensure "No API key configured" shows after revoke (not error message)

3. **MCP Configuration Section** (`web/app/dashboard/page.tsx:357-384`)
   - Verify section still conditionally renders based on `apiKey` state
   - Safari timing issues might affect this section too

4. **AuthContext `apiKey` Loading** (`web/context/AuthContext.tsx:83-95`)
   - Verify localStorage validation still works
   - Ensure invalid keys are removed properly

**Follow-up Work If Risk Materializes:**
- If Safari localStorage timing issues persist, consider:
  - Using `useLayoutEffect` in AuthContext for synchronous reads
  - Adding explicit state synchronization between AuthContext and Dashboard
  - Implementing a "key status" enum instead of relying on multiple boolean states
  - Adding Safari-specific logging to diagnose timing issues in production

## Validation Commands

```bash
# Lint checks
cd web && bun run lint

# TypeScript type checking
cd web && bun run typecheck

# Run all tests
cd web && bun test

# Build check
cd web && bun run build

# Start dev server for manual testing
cd web && bun run dev

# Safari-specific testing
# Open http://localhost:3001/dashboard in Safari (mobile device or simulator)
# Follow manual test checklist in Task Breakdown > Validation section
```

## Additional Safari Debugging Commands

```bash
# Enable Safari Web Inspector on iOS device
# Settings > Safari > Advanced > Web Inspector (toggle on)

# Connect device to Mac and open Safari > Develop > [Device Name] > localhost

# Check localStorage in Safari console:
localStorage.getItem('kotadb_api_key')

# Monitor React state in Safari DevTools:
# Install React DevTools extension for Safari
# Inspect AuthContext and Dashboard component states
```

## Commit Message Validation

All commits for this bug fix will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `fix(web): resolve conflicting API key messages on Safari` not `Looking at the changes, this commit fixes the conflicting messages bug`

**Example Good Commit Message:**
```
fix(web): resolve conflicting API key messages on Safari mobile (#441)

Auto-fetch key metadata when backend returns "already exists" error.
Add defensive rendering to prevent error + generate button showing together.

Fixes Safari-specific state synchronization issue where keyGenError
displays but apiKey remains null, causing conflicting UI messages.
```
