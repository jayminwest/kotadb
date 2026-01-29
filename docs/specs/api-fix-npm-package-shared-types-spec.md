# Implementation Specification: Fix npm Package - Relocate shared/ and Include tsconfig.json

**Issue**: #39 - `bunx kotadb` fails due to missing tsconfig.json in npm package  
**Type**: Bug Fix (Package Distribution)  
**Priority**: High  
**Target Version**: 2.0.1  

## Problem Statement

The KotaDB npm package (v2.0.0) is non-functional when installed via `bunx kotadb` or `npx kotadb` because:

1. **Missing tsconfig.json**: The `files` array in `app/package.json` excludes `tsconfig.json`, preventing Bun from resolving TypeScript path aliases (`@api/*`, `@config/*`, etc.)
2. **External Shared Types**: The `@shared/*` path alias points to `../shared/*` - a sibling directory OUTSIDE the `app/` directory that won't be included in the npm package

**Error Message:**
```
error: Cannot find module '@api/routes' from '/private/var/folders/.../node_modules/kotadb/src/cli.ts'
Bun v1.3.6 (macOS arm64)
```

## Root Cause Analysis

### Current Package Structure

```
kotadb/
├── app/                    # Published to npm as "kotadb"
│   ├── src/
│   │   └── cli.ts         # Uses @api/*, @config/*, @shared/* aliases
│   ├── package.json       # files: ["src/**/*.ts", ...] - NO tsconfig.json
│   └── tsconfig.json      # paths: { "@shared/*": ["../shared/*"] }
├── shared/                 # OUTSIDE app/ - NOT included in npm package
│   ├── types/
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   ├── entities.ts
│   │   ├── index.ts
│   │   ├── mcp-tools.ts
│   │   └── validation.ts
│   ├── language-utils.ts
│   └── package.json
└── web/                    # Next.js frontend (not actively used)
```

### Issues

1. **tsconfig.json excluded**: Without it, Bun cannot resolve path aliases in the published package
2. **@shared/* external dependency**: Points to `../shared/*` which doesn't exist in published package
3. **17 import statements affected**: All files importing from `@shared/*` will break

### Decision: Relocate shared/ into app/

**Rationale:**
- The `web/` directory is a Next.js frontend that's not being used as an API access point
- The `shared/` types are only consumed by `app/` in practice
- Moving `shared/` into `app/` simplifies the package structure and eliminates external dependencies
- This aligns with the local-only, single-package distribution model

## Implementation Plan

### Phase 1: Relocate shared/ Directory

**Objective**: Move `shared/` from monorepo root into `app/shared/`

**Steps:**

1. **Move directory structure**
   ```bash
   mv /Users/jayminwest/Projects/kotadb/shared /Users/jayminwest/Projects/kotadb/app/shared
   ```

2. **Verify structure after move**
   ```
   app/
   ├── shared/
   │   ├── types/
   │   │   ├── api.ts
   │   │   ├── auth.ts
   │   │   ├── entities.ts
   │   │   ├── index.ts
   │   │   ├── mcp-tools.ts
   │   │   └── validation.ts
   │   ├── language-utils.ts
   │   ├── package.json
   │   └── tsconfig.json
   ├── src/
   └── tsconfig.json
   ```

**Files Affected:**
- `/shared/` → `/app/shared/`

### Phase 2: Update app/tsconfig.json

**Objective**: Change `@shared/*` path alias from `../shared/*` to `./shared/*`

**Current Configuration** (`app/tsconfig.json`):
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"],  // EXTERNAL - will break
      "@api/*": ["src/api/*"],
      "@auth/*": ["src/auth/*"],
      // ... other aliases
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

**Updated Configuration**:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./shared/*"],   // INTERNAL - within app/
      "@api/*": ["src/api/*"],
      "@auth/*": ["src/auth/*"],
      "@config/*": ["src/config/*"],
      "@db/*": ["src/db/*"],
      "@indexer/*": ["src/indexer/*"],
      "@mcp/*": ["src/mcp/*"],
      "@validation/*": ["src/validation/*"],
      "@app-types/*": ["src/types/*"],
      "@logging/*": ["src/logging/*"],
      "@sync/*": ["src/sync/*"]
    },
    "types": ["bun-types", "node"]
  },
  "include": [
    "src/**/*.ts", 
    "tests/**/*.ts",
    "shared/**/*.ts"     // Include shared types in compilation
  ]
}
```

**Changes:**
1. `"@shared/*": ["../shared/*"]` → `"@shared/*": ["./shared/*"]`
2. Add `"shared/**/*.ts"` to `include` array

**Files Modified:**
- `/Users/jayminwest/Projects/kotadb/app/tsconfig.json`

### Phase 3: Update app/package.json

**Objective**: Add `tsconfig.json` and `shared/**/*.ts` to the `files` array

**Current Configuration** (`app/package.json`):
```json
{
  "name": "kotadb",
  "version": "2.0.0",
  "files": [
    "src/**/*.ts",
    "src/**/*.js",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts"
  ]
}
```

**Updated Configuration**:
```json
{
  "name": "kotadb",
  "version": "2.0.1",
  "files": [
    "src/**/*.ts",
    "src/**/*.js",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
    "tsconfig.json",
    "shared/**/*.ts"
  ]
}
```

**Changes:**
1. Bump version: `"2.0.0"` → `"2.0.1"`
2. Add `"tsconfig.json"` to `files` array
3. Add `"shared/**/*.ts"` to `files` array

**Files Modified:**
- `/Users/jayminwest/Projects/kotadb/app/package.json`

### Phase 4: Update Monorepo Root package.json

**Objective**: Remove `shared` from workspaces since it's now part of `app`

**Current Configuration** (`package.json`):
```json
{
  "name": "kotadb-monorepo",
  "version": "2.0.0",
  "private": true,
  "workspaces": [
    "app",
    "shared",
    "web"
  ]
}
```

**Updated Configuration**:
```json
{
  "name": "kotadb-monorepo",
  "version": "2.0.0",
  "private": true,
  "workspaces": [
    "app",
    "web"
  ]
}
```

**Changes:**
1. Remove `"shared"` from workspaces array

**Files Modified:**
- `/Users/jayminwest/Projects/kotadb/package.json`

### Phase 5: Update CI Workflow

**Objective**: Remove `shared` type-checking step from npm-publish workflow

**Current Configuration** (`.github/workflows/npm-publish.yml`):
```yaml
- name: Type check shared types
  working-directory: ../shared
  run: bunx tsc --noEmit

- name: Type check application
  run: bunx tsc --noEmit
```

**Updated Configuration**:
```yaml
- name: Type check application
  run: bunx tsc --noEmit
```

**Changes:**
1. Remove "Type check shared types" step (now included in app type-checking)

**Files Modified:**
- `/Users/jayminwest/Projects/kotadb/.github/workflows/npm-publish.yml`

### Phase 6: Verify All Imports

**Objective**: Ensure all `@shared/*` imports still resolve correctly

**Verification Strategy:**

1. **Type-check the application**
   ```bash
   cd app && bunx tsc --noEmit
   ```

2. **Run linter**
   ```bash
   cd app && bun run lint
   ```

3. **Run all tests**
   ```bash
   cd app && bun test
   ```

4. **Verify runtime execution**
   ```bash
   cd app && bun run src/cli.ts --version
   ```

**Expected Results:**
- Zero TypeScript compilation errors
- Zero linting errors
- All tests pass
- CLI executes successfully

**Affected Files (17 imports):**
- `app/src/validation/schemas.ts`
- `app/src/types/rate-limit.ts`
- `app/src/api/__tests__/queries-sqlite.test.ts`
- `app/src/indexer/parsers.ts`
- `app/src/indexer/repos.ts`
- `app/src/api/auto-reindex.ts`
- `app/src/indexer/dependency-extractor.ts`
- `app/src/api/routes.ts` (2 imports)
- `app/src/auth/middleware.ts`
- `app/src/api/queries.ts` (2 imports)
- `app/src/indexer/import-resolver.ts`
- `app/tests/indexer/import-resolver.test.ts`
- `app/src/mcp/tools.ts`
- `app/src/mcp/github-integration.ts`
- `app/src/mcp/spec-validation.ts`

**Note**: All imports use the `@shared/*` path alias, so no code changes are required if tsconfig.json is updated correctly.

### Phase 7: Test the Fix Locally

**Objective**: Verify the package works when installed via bunx

**Steps:**

1. **Build the package**
   ```bash
   cd app && bun run build
   ```

2. **Pack the package locally**
   ```bash
   cd app && npm pack
   ```

3. **Install from tarball**
   ```bash
   bunx kotadb-2.0.1.tgz --version
   ```

4. **Verify MCP server starts**
   ```bash
   bunx kotadb-2.0.1.tgz &
   sleep 2
   curl http://localhost:3000/health
   ```

**Expected Results:**
- Package builds successfully
- `bunx kotadb-2.0.1.tgz --version` outputs `kotadb v2.0.1`
- MCP server starts without module resolution errors
- Health endpoint returns `{ "status": "healthy", ... }`

### Phase 8: Publish to npm

**Objective**: Release version 2.0.1 to npm registry

**Steps:**

1. **Create git commit**
   ```bash
   git add -A
   git commit -m "fix(#39): relocate shared/ into app/ and include tsconfig.json in npm package

   - Move shared/ from monorepo root to app/shared/
   - Update @shared/* path alias from ../shared/* to ./shared/*
   - Add tsconfig.json and shared/**/*.ts to package.json files array
   - Remove shared workspace from monorepo root
   - Update CI workflow to remove separate shared type-checking
   - Bump version to 2.0.1

   Fixes #39

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   ```

2. **Push to develop branch**
   ```bash
   git push origin develop
   ```

3. **Create version tag**
   ```bash
   git tag v2.0.1
   git push origin v2.0.1
   ```

4. **GitHub Actions will automatically**:
   - Run type-checking
   - Run linting
   - Run tests
   - Publish to npm with tag `v2.0.1`
   - Create GitHub release

**Verification:**
- Check GitHub Actions workflow: https://github.com/jayminwest/kotadb/actions
- Verify npm package: https://www.npmjs.com/package/kotadb/v/2.0.1
- Test installation: `bunx kotadb@2.0.1 --version`

## Risk Assessment

### Low Risk
- **Type-checking**: All imports use the `@shared/*` alias, so no code changes required
- **Backwards compatibility**: Internal change only, no API changes
- **Rollback**: Previous version (2.0.0) remains available on npm

### Medium Risk
- **CI workflow changes**: Removing shared type-checking step
  - Mitigation: Shared types now included in app type-checking via `include` array
- **Monorepo workspace changes**: Removing shared from workspaces
  - Mitigation: `shared` is now part of `app`, no separate workspace needed

### Testing Coverage
- Type-checking: Existing `bun run typecheck` covers all TypeScript files
- Runtime: Existing test suite (118 tests) covers all import paths
- Integration: Manual testing with `bunx` before publishing

## Success Criteria

1. **Build Success**: `cd app && bun run build` completes without errors
2. **Type-Check Success**: `cd app && bunx tsc --noEmit` shows zero errors
3. **Test Success**: `cd app && bun test` shows all tests passing
4. **Local Package Test**: `bunx kotadb-2.0.1.tgz --version` outputs correct version
5. **MCP Server Start**: `bunx kotadb` starts server without module resolution errors
6. **Published Package Test**: `bunx kotadb@2.0.1 --version` works after npm publish

## Rollback Plan

If issues are discovered after publishing:

1. **Immediate**: Deprecate 2.0.1 on npm
   ```bash
   npm deprecate kotadb@2.0.1 "Module resolution issue, use 2.0.0 or wait for 2.0.2"
   ```

2. **Fix Forward**: Apply corrections and publish 2.0.2

3. **Revert**: In extreme cases, unpublish within 72 hours
   ```bash
   npm unpublish kotadb@2.0.1
   ```

## Implementation Checklist

- [ ] Move `shared/` directory into `app/shared/`
- [ ] Update `app/tsconfig.json` - change `@shared/*` path alias
- [ ] Add `shared/**/*.ts` to `app/tsconfig.json` include array
- [ ] Update `app/package.json` - add `tsconfig.json` to files array
- [ ] Update `app/package.json` - add `shared/**/*.ts` to files array
- [ ] Update `app/package.json` - bump version to 2.0.1
- [ ] Update monorepo `package.json` - remove `shared` from workspaces
- [ ] Update `.github/workflows/npm-publish.yml` - remove shared type-checking
- [ ] Run type-check: `cd app && bunx tsc --noEmit`
- [ ] Run linter: `cd app && bun run lint`
- [ ] Run tests: `cd app && bun test`
- [ ] Test CLI: `cd app && bun run src/cli.ts --version`
- [ ] Pack locally: `cd app && npm pack`
- [ ] Test local package: `bunx kotadb-2.0.1.tgz --version`
- [ ] Test local MCP server: `bunx kotadb-2.0.1.tgz` (verify startup)
- [ ] Create git commit with issue reference
- [ ] Push to develop branch
- [ ] Create and push v2.0.1 tag
- [ ] Monitor GitHub Actions workflow
- [ ] Verify npm publication
- [ ] Test published package: `bunx kotadb@2.0.1 --version`
- [ ] Close issue #39

## Additional Notes

### Path Alias Resolution in Published Packages

**Why tsconfig.json is required:**

When Bun executes TypeScript files directly (not transpiled), it uses tsconfig.json to resolve path aliases. Without this file, imports like `@api/routes` fail because Bun doesn't know where to find them.

**Published package structure after fix:**

```
node_modules/kotadb/
├── src/
│   ├── cli.ts              # Uses @api/*, @shared/*, etc.
│   ├── api/
│   ├── mcp/
│   └── ...
├── shared/                  # NEW: Now included
│   ├── types/
│   │   ├── index.ts
│   │   └── ...
│   └── language-utils.ts
├── tsconfig.json            # NEW: Required for alias resolution
└── package.json
```

### Future Considerations

1. **Web Directory**: If `web/` is reactivated as a consumer of shared types, consider:
   - Publishing `@kotadb/types` as a separate npm package
   - Or using path aliases in `web/tsconfig.json` to reference `../app/shared/*`

2. **Type Distribution**: If types are needed by external consumers:
   - Generate `.d.ts` files during build
   - Include in `files` array
   - Point `types` field to declaration files

3. **Alternative Solution**: Transpile to JavaScript before publishing
   - Would eliminate need for tsconfig.json in package
   - Trade-off: Larger package size, build complexity
   - Current approach (direct TypeScript execution) aligns with Bun's philosophy

## Related Issues

- #19: Initial npm package publication
- #32: PR that introduced v2.0.0

## References

- [Bun TypeScript Support](https://bun.sh/docs/runtime/typescript)
- [npm package.json files field](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files)
- [TypeScript Path Mapping](https://www.typescriptlang.org/docs/handbook/module-resolution.html#path-mapping)
