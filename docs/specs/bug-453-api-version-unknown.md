# Bug Plan: API Health Check Displays '(vunknown)' Instead of Actual Version

## Bug Summary

The API health check endpoint displays `(vunknown)` on the landing page instead of showing the actual semantic version. The backend `/health` endpoint (app/src/api/routes.ts:67-109) returns queue metrics but does not include a `version` field. The frontend component (web/components/LandingHero.tsx:21) expects a `version` field and displays "vunknown" when it's missing, making it difficult to verify deployed versions across environments.

**Observed Behavior:**
- Frontend health badge shows: `API: Healthy (vunknown)`
- Backend `/health` response: `{ "status": "ok", "timestamp": "...", "queue": {...} }` (no version field)

**Expected Behavior:**
- Frontend health badge shows: `API: Healthy (v0.1.0)` or appropriate semantic version
- Backend `/health` response includes: `{ "status": "ok", "version": "0.1.0", "timestamp": "...", "queue": {...} }`

**Suspected Scope:**
- Backend: Add version field to `/health` endpoint response
- No frontend changes needed (already handles version display)
- Source version from `app/package.json` (currently `"version": "0.1.0"`)

## Root Cause Hypothesis

The `/health` endpoint was implemented without version tracking when queue metrics were added (app/src/api/routes.ts:67-109). The frontend component was built with version display capability (web/components/LandingHero.tsx:10-11, 21, 82), but the backend never provided the field.

**Supporting Evidence:**
1. Frontend code at LandingHero.tsx:21 reads `data.version || 'unknown'`
2. Backend health endpoint at routes.ts:91-100 returns only `status`, `timestamp`, and `queue` fields
3. Package.json contains semantic version `"version": "0.1.0"` at line 3
4. No environment variable or build-time injection of version currently exists

## Fix Strategy

### Code Changes

**Backend (app/src/api/routes.ts)**:
1. Add version extraction helper to read from package.json
2. Include `version` field in health endpoint response (lines 91-100)
3. Format version without "v" prefix for consistency (frontend adds "v" prefix)

**Implementation Approach:**
- Use dynamic import to read package.json version at runtime
- Cache version in module scope to avoid repeated file reads
- Fallback to "unknown" if package.json cannot be read (defensive programming)

### Data/Config Updates

No environment variables or deployment configuration changes needed:
- Version source: `app/package.json` (already tracked in git)
- No Fly.io build-time injection required
- No Dockerfile modifications needed
- Version updates will happen via normal package.json version bumps

### Guardrails

1. **Test Coverage**: Update health endpoint tests to verify version field presence
2. **Type Safety**: Ensure health response type includes version field
3. **Backward Compatibility**: Frontend already handles missing version gracefully
4. **Performance**: Cache version in module scope to avoid repeated file I/O

## Relevant Files

- `app/src/api/routes.ts` — Add version field to health endpoint response (lines 67-109)
- `app/package.json` — Source of truth for API version (line 3: "version": "0.1.0")
- `app/tests/api/health.test.ts` — Update tests to verify version field in response
- `web/components/LandingHero.tsx` — Already handles version display (no changes needed)

### New Files

None required (all changes to existing files)

## Task Breakdown

### Verification

**Steps to Reproduce Current Failure:**
1. Start local backend: `cd app && bun run dev`
2. Query health endpoint: `curl http://localhost:3000/health`
3. Observe response: No `version` field present
4. Visit frontend: Open browser to staging URL (develop.kotadb.io)
5. Observe landing page health badge: Shows "(vunknown)"

**Logs/Metrics to Capture:**
- Health endpoint response before fix: `{"status":"ok","timestamp":"...","queue":{...}}`
- Health endpoint response after fix: `{"status":"ok","version":"0.1.0","timestamp":"...","queue":{...}}`
- Frontend console: Network tab showing GET /health response with version field

### Implementation

**Task 1: Add version extraction to health endpoint**
1. Read current health endpoint implementation (app/src/api/routes.ts:67-109)
2. Add module-scoped version cache variable at top of file
3. Create helper to extract version from package.json using dynamic import
4. Call helper on module load to populate cache
5. Add `version` field to health response object (after `status`, before `timestamp`)

**Task 2: Update health endpoint tests**
1. Read current health test (app/tests/api/health.test.ts)
2. Update response type to expect `version` field
3. Add assertion: `expect(data.version).toBeDefined()`
4. Add assertion: `expect(data.version).toMatch(/^\d+\.\d+\.\d+$/)`  (semantic version format)
5. Verify test passes: `cd app && bun test health.test.ts`

**Task 3: Type-check and validate**
1. Run type-check: `cd app && bunx tsc --noEmit`
2. Run all tests: `cd app && bun test`
3. Run linter: `cd app && bun run lint`
4. Start dev server and manually verify: `curl http://localhost:3000/health | jq .version`

**Task 4: Manual verification**
1. Start local stack: Backend (app) + Frontend (web)
2. Navigate to http://localhost:3001 (frontend)
3. Observe health badge shows: `API: Healthy (v0.1.0)`
4. Check browser console Network tab: Verify /health response includes version
5. Test staging after deployment: `curl https://kotadb-staging.fly.dev/health | jq .version`

### Validation

**Tests to Add/Update:**
- **Integration Test (app/tests/api/health.test.ts)**:
  - Update test: "returns queue metrics when queue is running" to assert version field present
  - Add assertion: `expect(data.version).toBe("0.1.0")` or `expect(data.version).toMatch(/^\d+\.\d+\.\d+$/)`
  - Verify version format matches semantic versioning (MAJOR.MINOR.PATCH)

**Manual Checks:**
- **Local Development**:
  - Start backend: `cd app && bun run dev`
  - Query health: `curl http://localhost:3000/health`
  - Expected: `{"status":"ok","version":"0.1.0",...}`
  - Start frontend: `cd web && bun run dev`
  - Navigate: http://localhost:3001
  - Expected: Health badge shows `API: Healthy (v0.1.0)`

- **Staging Environment** (after deployment):
  - Query health: `curl https://kotadb-staging.fly.dev/health`
  - Expected: `{"status":"ok","version":"0.1.0",...}`
  - Navigate: https://develop.kotadb.io
  - Expected: Health badge shows `API: Healthy (v0.1.0)` instead of `(vunknown)`

- **Version Update Test** (future proofing):
  - Update `app/package.json` version to "0.2.0"
  - Restart backend
  - Query health: Verify shows "0.2.0"
  - Confirms version reads dynamically from package.json

## Step by Step Tasks

### Phase 1: Implementation

1. **Add version extraction helper to routes.ts**
   - Add module-scoped variable: `let apiVersion: string | null = null`
   - Create async function to read package.json version
   - Use dynamic import: `await import('../package.json', { assert: { type: 'json' } })`
   - Cache result in `apiVersion` variable
   - Handle errors gracefully (fallback to "unknown")

2. **Update health endpoint to include version**
   - Modify health response object at lines 91-100
   - Add `version` field after `status`: `version: apiVersion || "unknown"`
   - Ensure version is populated before first request (call helper at module load)

3. **Update health endpoint tests**
   - Modify app/tests/api/health.test.ts
   - Update response type definition to include `version: string`
   - Add version assertions to both test cases
   - Verify version matches semantic versioning pattern

### Phase 2: Validation

4. **Run local validation**
   - Execute: `cd app && bun run lint`
   - Execute: `cd app && bunx tsc --noEmit`
   - Execute: `cd app && bun test health.test.ts`
   - Execute: `cd app && bun test` (full test suite)
   - Expected: All checks pass

5. **Manual testing (local)**
   - Start backend: `cd app && bun run dev`
   - Test health endpoint: `curl http://localhost:3000/health | jq`
   - Verify response includes: `"version": "0.1.0"`
   - Start frontend: `cd web && bun run dev`
   - Navigate to: http://localhost:3001
   - Verify health badge shows: `API: Healthy (v0.1.0)` (not vunknown)

### Phase 3: Git Operations

6. **Commit changes**
   - Stage files: `git add app/src/api/routes.ts app/tests/api/health.test.ts`
   - Commit: `git commit -m "fix: include API version in health endpoint (#453)"`
   - Pre-commit hooks will validate logging standards and run linters

7. **Push branch and verify CI**
   - Push: `git push -u origin bug-453-360c18a5`
   - Wait for GitHub Actions CI to complete
   - Verify "Application CI" workflow passes (lint, typecheck, test, build)
   - Verify no migration sync issues

8. **Post-deployment verification (staging)**
   - After Fly.io deploys to staging (kotadb-staging.fly.dev)
   - Test staging health: `curl https://kotadb-staging.fly.dev/health | jq .version`
   - Expected: `"0.1.0"`
   - Navigate to: https://develop.kotadb.io
   - Expected: Health badge shows `API: Healthy (v0.1.0)`
   - Screenshot or record for PR evidence

## Regression Risks

### Adjacent Features to Watch

1. **Health Check Monitoring**
   - Risk: External monitoring tools may not expect new version field
   - Likelihood: Low (adding fields is backward compatible)
   - Mitigation: Version field is additive, existing monitors ignore unknown fields

2. **Queue Metrics Display**
   - Risk: Frontend health badge parsing could break if response structure changes unexpectedly
   - Likelihood: Very Low (no queue structure changes, only adding version field)
   - Mitigation: Frontend already handles optional version field gracefully

3. **MCP Health Endpoint** (/mcp GET)
   - Risk: Different health endpoint at routes.ts:648 also returns status
   - Likelihood: None (MCP endpoint has different purpose, returns protocol info not health)
   - Mitigation: Leave MCP endpoint unchanged (already includes version: "2024-11-05" for protocol)

### Follow-up Work

**If Regression Materializes:**
1. Add structured health response type definition to ensure consistency
2. Create shared health response schema if other endpoints need versioning
3. Document health endpoint response format in API documentation
4. Add contract tests to prevent unintended response shape changes

**Future Enhancements (Out of Scope):**
- Add git commit SHA to health response for precise deployment tracking
- Add build timestamp to distinguish same-version deployments
- Add environment indicator (staging/production) to health response
- Expose version via dedicated `/version` endpoint for automation tools

## Validation Commands

**Pre-Commit:**
```bash
cd app
bun run lint
bunx tsc --noEmit
bun test health.test.ts
bun test
bun run build
```

**Post-Implementation (Level 2 Validation):**
```bash
# Local validation
cd app && bun run dev &
sleep 2
curl http://localhost:3000/health | jq .version
# Expected: "0.1.0"

# Frontend integration
cd ../web && bun run dev &
# Navigate to http://localhost:3001
# Expected: Health badge shows "API: Healthy (v0.1.0)"

# Cleanup
killall bun
```

**Staging Validation (Post-Deployment):**
```bash
# Backend version check
curl https://kotadb-staging.fly.dev/health | jq .version
# Expected: "0.1.0"

# Frontend display check (manual)
# Navigate to: https://develop.kotadb.io
# Expected: Health badge shows "API: Healthy (v0.1.0)"
```

## Commit Message Validation

All commits for this bug fix will follow Conventional Commits format:

**Valid commit message:**
```
fix: include API version in health endpoint (#453)
```

**Invalid patterns to avoid:**
- ❌ "Based on the investigation, this commit adds version..."
- ❌ "The commit should fix the health endpoint..."
- ❌ "Here is a fix for the version display bug..."
- ❌ "Looking at the changes, I can see this adds version..."

**Valid patterns:**
- ✅ "fix: include API version in health endpoint (#453)"
- ✅ "test: verify health endpoint returns semantic version (#453)"
- ✅ "refactor: extract version from package.json for health check (#453)"
