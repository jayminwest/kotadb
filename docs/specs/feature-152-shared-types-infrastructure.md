# Feature Plan: Shared TypeScript Types Infrastructure for Monorepo

**Issue**: #152 - feat: create shared TypeScript types infrastructure for monorepo
**Status**: needs-investigation
**Priority**: high
**Effort**: medium (1-3 days)
**Component**: backend, api

## Overview

**Problem**
Type definitions currently live exclusively in `app/src/types/`. When adding frontend applications (Next.js in #150) or other consumers, we face:
- Type duplication → maintenance burden and drift
- No types in frontend → runtime errors, no IDE support
- Manual synchronization → brittle and error-prone

**Desired Outcome**
Create a centralized `shared/` directory at repository root that both `app/` and future projects (`web/`, CLI tools, mobile apps) can import via TypeScript path aliases. This establishes a single source of truth for API contracts enforced at compile time.

**Benefits**
- Type safety across boundaries (backend ↔ frontend)
- Refactoring confidence (change once, TypeScript guides all updates)
- Better DX (full autocomplete and type checking in all layers)
- Eliminates API contract drift (caught at build time, not runtime)
- Foundation for scaling to multiple consumers

**Non-Goals**
- Changing runtime behavior (types are compile-time only)
- Altering API contracts (types describe existing endpoints)
- Modifying database schema (types match existing tables)
- Adding new features (pure refactoring for infrastructure)

## Technical Approach

**Architecture Notes**
- Extract shared types from `app/src/types/` to new `shared/types/` directory at repository root
- Configure TypeScript path alias `@shared/*` in all consuming projects
- Organize types by domain: `api.ts` (request/response), `entities.ts` (database models), `auth.ts` (authentication), `rate-limit.ts` (rate limiting)
- Use re-export pattern in `shared/types/index.ts` for convenient imports
- Zero runtime impact (types erase during compilation)

**Key Modules to Touch**
- `app/tsconfig.json`: Add `@shared/*` path alias pointing to `../shared/*`
- `app/src/api/routes.ts`: Import API types from `@shared/types/api`
- `app/src/api/queries.ts`: Import entity types from `@shared/types/entities`
- `app/src/auth/middleware.ts`: Import auth types from `@shared/types/auth`
- `app/src/auth/rate-limit.ts`: Import rate limit types from `@shared/types/rate-limit`
- `app/src/mcp/tools.ts`: Import API types from `@shared/types/api`
- `app/src/validation/types.ts`: Move to `shared/types/validation.ts`
- `CLAUDE.md`: Document shared types strategy and import guidelines

**Data/API Impacts**
- No database schema changes
- No API contract changes
- No request/response format changes
- Only internal import path changes (compile-time only)

## Relevant Files

### Existing Files to Modify
- `app/tsconfig.json` — Add `@shared/*` path alias for cross-project imports
- `app/src/types/index.ts` — Extract shared types, keep only app-specific types
- `app/src/api/routes.ts` — Update imports to use `@shared/types/api`
- `app/src/api/queries.ts` — Update imports to use `@shared/types/entities`
- `app/src/auth/context.ts` — Move to `shared/types/auth.ts`
- `app/src/auth/rate-limit.ts` — Update imports to use `@shared/types/rate-limit`
- `app/src/auth/middleware.ts` — Update imports to use `@shared/types/auth`
- `app/src/mcp/tools.ts` — Update imports to use `@shared/types/api`
- `app/src/validation/types.ts` — Move to `shared/types/validation.ts`
- `CLAUDE.md` — Document shared types strategy and usage guidelines
- `.github/workflows/app-ci.yml` — Add type-check step for `shared/` directory

### New Files
- `shared/package.json` — Package metadata for `@kotadb/shared`
- `shared/tsconfig.json` — TypeScript config with strict mode and declaration output
- `shared/types/api.ts` — API request/response types (IndexRequest, SearchRequest, etc.)
- `shared/types/entities.ts` — Database entity types (Repository, IndexedFile, IndexJob, etc.)
- `shared/types/auth.ts` — Authentication types (AuthContext, Tier, ApiKey, etc.)
- `shared/types/rate-limit.ts` — Rate limiting types (RateLimitResult, RateLimitConfig, etc.)
- `shared/types/validation.ts` — Validation API types (ValidationRequest, ValidationResponse, etc.)
- `shared/types/index.ts` — Re-export all types for convenient imports
- `shared/README.md` — Usage documentation with import examples

## Task Breakdown

### Phase 1: Create Shared Types Infrastructure
- Create `shared/` directory at repository root
- Create `shared/types/` subdirectory for type definitions
- Add `shared/package.json` with metadata (`@kotadb/shared`, version 0.1.0, type: module)
- Add `shared/tsconfig.json` with strict compiler options (target ES2022, module ESNext, strict mode)
- Create `shared/README.md` with usage examples and import patterns

### Phase 2: Extract and Organize Core Types
- Extract API types to `shared/types/api.ts`:
  - `IndexRequest` (repository, ref, localPath)
  - `IndexResponse` (success, message, jobId)
  - `SearchRequest` (term, project, limit)
  - `SearchResponse` (results, total)
  - `SearchResult` (path, content, matches, repository)
  - `RecentFilesResponse` (files, count)
  - `HealthResponse` (status, timestamp)
- Extract database entity types to `shared/types/entities.ts`:
  - `Repository` (id, project_root, name, description, default_ref, timestamps)
  - `IndexedFile` (id, repository_id, path, content, language, timestamps)
  - `IndexJob` (id, repository_id, status, started_at, completed_at, error_message)
  - `Symbol` (id, file_id, name, kind, line, column)
  - `Reference` (id, symbol_id, file_id, line, column)
  - `Dependency` (id, file_id, package_name, version, import_path)
- Move authentication types from `app/src/auth/context.ts` to `shared/types/auth.ts`:
  - `Tier` (enum: 'free' | 'solo' | 'team')
  - `AuthContext` (userId, tier, orgId, keyId, rateLimitPerHour, rateLimit)
  - `AuthenticatedRequest` (extends Request with auth property)
  - `ApiKey` (id, key_hash, tier, user_id, organization_id, timestamps)
- Extract rate limiting types to `shared/types/rate-limit.ts`:
  - `RateLimitResult` (allowed, remaining, retryAfter, resetAt, limit)
  - `RateLimitHeaders` (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After)
  - `RateLimitConfig` (tier, requestsPerHour)
- Move validation types from `app/src/validation/types.ts` to `shared/types/validation.ts`:
  - `ValidationRequest` (schema, output)
  - `ValidationResponse` (valid, errors)
  - `ValidationError` (path, message)
- Create `shared/types/index.ts` with re-exports for all type modules

### Phase 3: Configure Path Aliases and Update Imports
- Update `app/tsconfig.json` to add `@shared/*` alias pointing to `../shared/*`
- Verify TypeScript resolves `@shared/*` imports in `app/` (run `cd app && bunx tsc --noEmit`)
- Update `app/src/api/routes.ts` to import from `@shared/types/api`
- Update `app/src/api/queries.ts` to import from `@shared/types/entities`
- Update `app/src/auth/middleware.ts` to import from `@shared/types/auth`
- Update `app/src/auth/rate-limit.ts` to import from `@shared/types/rate-limit`
- Update `app/src/mcp/tools.ts` to import from `@shared/types/api`
- Remove `app/src/auth/context.ts` (moved to shared types)
- Remove `app/src/validation/types.ts` (moved to shared types)
- Update `app/src/types/index.ts` to remove duplicated types (keep only app-specific types like `ApiContext`)

### Phase 4: Documentation and CI Integration
- Document shared types strategy in `CLAUDE.md`:
  - Add `@shared/*` to path aliases section (lines 14-24)
  - Explain when to add types to `shared/` vs app-specific types
  - Document import patterns and usage examples
  - Add breaking change detection guidelines (semantic versioning for shared types)
- Create `shared/README.md` with usage examples showing imports in `app/` and future `web/` projects
- Update `.github/workflows/app-ci.yml` to type-check `shared/`:
  - Add step before app type-check: `cd shared && bunx tsc --noEmit`
  - Add path trigger for `shared/**` changes to run app CI
- Add entry to `.claude/commands/docs/conditional_docs.md` for `shared/README.md`:
  - Conditions: When adding shared types, when working on cross-project type definitions, when setting up new consuming projects

### Phase 5: Validation and Testing
- Run `cd app && bunx tsc --noEmit` to verify no type errors
- Run `cd shared && bunx tsc --noEmit` to verify shared types compile
- Run `cd app && bun test` to ensure no test breakage from refactoring
- Run `cd app && bun run build` to verify production build succeeds
- Manual verification in VS Code:
  - Open `app/src/api/routes.ts` and hover over imported types
  - Confirm IDE shows definitions from `@shared/types/*`
  - Change a field in `shared/types/api.ts` (e.g., rename `term` to `query`)
  - Verify TypeScript errors appear in all consuming files
  - Revert change to confirm errors disappear
- Verify zero type duplication: grep for duplicate type names across `shared/` and `app/src/types/`
- Verify 100% coverage: all API endpoints use shared types for requests/responses

## Step by Step Tasks

### Setup Shared Types Directory
1. Create `shared/` directory at repository root (sibling to `app/`, `automation/`)
2. Create `shared/types/` subdirectory for type definitions
3. Create `shared/package.json` with metadata for `@kotadb/shared` package
4. Create `shared/tsconfig.json` with strict compiler options (target ES2022, module ESNext, strict mode, declaration output)
5. Create `shared/README.md` with usage documentation and import examples

### Extract Core Type Definitions
6. Create `shared/types/api.ts` and extract API request/response types from `app/src/types/index.ts`
7. Create `shared/types/entities.ts` and define database entity types (Repository, IndexedFile, IndexJob, Symbol, Reference, Dependency)
8. Move authentication types from `app/src/auth/context.ts` to `shared/types/auth.ts` (Tier, AuthContext, AuthenticatedRequest, ApiKey)
9. Create `shared/types/rate-limit.ts` and extract rate limiting types from `app/src/auth/rate-limit.ts` (RateLimitResult, RateLimitHeaders, RateLimitConfig)
10. Move validation types from `app/src/validation/types.ts` to `shared/types/validation.ts` (ValidationRequest, ValidationResponse, ValidationError)
11. Create `shared/types/index.ts` with re-exports for all type modules

### Configure Path Aliases and Refactor Imports
12. Update `app/tsconfig.json` to add `@shared/*` path alias pointing to `../shared/*`
13. Update `app/src/api/routes.ts` to import types from `@shared/types/api` and `@shared/types/auth`
14. Update `app/src/api/queries.ts` to import types from `@shared/types/entities` and `@shared/types/api`
15. Update `app/src/auth/middleware.ts` to import types from `@shared/types/auth`
16. Update `app/src/auth/rate-limit.ts` to import types from `@shared/types/rate-limit`
17. Update `app/src/mcp/tools.ts` to import types from `@shared/types/api`
18. Remove `app/src/auth/context.ts` (moved to `shared/types/auth.ts`)
19. Remove `app/src/validation/types.ts` (moved to `shared/types/validation.ts`)
20. Update `app/src/types/index.ts` to remove duplicated types and keep only app-specific types (ApiContext)

### Documentation and CI Integration
21. Update `CLAUDE.md` path aliases section to document `@shared/*` alias
22. Add shared types strategy section to `CLAUDE.md` explaining when to use `shared/` vs app-specific types
23. Document import patterns in `CLAUDE.md` with usage examples
24. Create comprehensive usage examples in `shared/README.md` showing imports in `app/` and future `web/` projects
25. Update `.github/workflows/app-ci.yml` to add type-check step for `shared/` directory before app type-check
26. Add path trigger for `shared/**` changes to `.github/workflows/app-ci.yml`
27. Add entry to `.claude/commands/docs/conditional_docs.md` for `shared/README.md` with conditions for usage

### Validation and Testing
28. Run `cd shared && bunx tsc --noEmit` to verify shared types compile without errors
29. Run `cd app && bunx tsc --noEmit` to verify app compiles with new imports
30. Run `cd app && bun test` to ensure all tests pass after refactoring
31. Run `cd app && bun run build` to verify production build succeeds
32. Perform manual IDE verification (hover types, change detection) in VS Code
33. Verify zero type duplication between `shared/` and `app/src/types/` using grep
34. Verify all API endpoints use shared types for requests/responses

### Finalization
35. Run `cd app && bun run lint` to check code style compliance
36. Stage all changes for commit (shared types, updated imports, documentation, CI config)
37. Create commit with message following Conventional Commits format
38. Push feature branch to remote repository with `git push -u origin feat/152-shared-types-infrastructure`

## Risks & Mitigations

**Risk: Import path resolution failures in CI**
Mitigation: Add type-check step for `shared/` directory in CI workflow before app type-check to catch resolution errors early. Test both `cd shared && bunx tsc --noEmit` and `cd app && bunx tsc --noEmit` locally before pushing.

**Risk: Type duplication between shared/ and app/src/types/**
Mitigation: After extraction, audit all remaining types in `app/src/types/` and verify they are truly app-specific (not used in API contracts). Use grep to search for duplicate type names across both directories.

**Risk: Breaking changes when shared types evolve**
Mitigation: Document semantic versioning expectations in `shared/README.md` and `CLAUDE.md`. When changing shared types, use TypeScript's compiler errors to identify all affected consumers and update them in the same PR.

**Risk: IDE autocomplete breaks for @shared/* imports**
Mitigation: Verify VS Code recognizes path alias by opening `app/src/api/routes.ts` and hovering over imported types. If autocomplete fails, check `app/tsconfig.json` baseUrl and paths configuration matches project structure.

**Risk: CI failures due to missing path triggers**
Mitigation: Add path filter `shared/**` to `.github/workflows/app-ci.yml` so CI runs when shared types change. Test by making a trivial change to `shared/types/api.ts` and confirming CI triggers.

**Risk: Test failures from import refactoring**
Mitigation: Run full test suite (`cd app && bun test`) after each major import update. If tests fail, verify test files also import from `@shared/*` (not relative paths to old locations).

## Validation Strategy

**Automated Tests**
- Run `cd shared && bunx tsc --noEmit` to verify shared types compile without errors (CI enforced)
- Run `cd app && bunx tsc --noEmit` to verify app compiles with new imports (CI enforced)
- Run `cd app && bun test` to ensure all 133 tests pass after refactoring (CI enforced)
- Run `cd app && bun run build` to verify production build succeeds (CI enforced)
- CI workflow automatically runs shared type-check before app type-check

**Manual Checks**
- Open `app/src/api/routes.ts` in VS Code and hover over `IndexRequest` type → confirm definition shows from `@shared/types/api` (not local file)
- Change a field in `shared/types/api.ts` (e.g., rename `term` to `query` in SearchRequest) → verify TypeScript errors appear in `app/src/api/routes.ts` and `app/src/mcp/tools.ts`
- Revert change → confirm all TypeScript errors disappear
- Search for duplicate type names: `grep -r "export.*interface IndexRequest" shared/ app/src/types/` → expect only one match in `shared/types/api.ts`
- Verify all API endpoint handlers use shared request/response types (audit `app/src/api/routes.ts` imports)

**Release Guardrails**
- CI must pass for all commits (shared type-check, app type-check, full test suite, build)
- No type duplication between `shared/` and `app/src/types/` (verified via grep in manual checks)
- Zero test failures or type errors (verified via CI before merge)
- All API endpoints use shared types (verified via manual audit before PR creation)

**Real-Service Evidence**
- Full test suite runs against real Supabase instance (no mocks per /anti-mock guidance)
- Type refactoring does not break database queries or API responses (verified by integration tests)
- Rate limiting, authentication, and validation workflows continue working (verified by e2e tests)

## Validation Commands

**Level 2 Validation (minimum required for features):**
- `cd app && bun run lint` — Check code style compliance
- `cd app && bunx tsc --noEmit` — Type-check app with new imports
- `cd shared && bunx tsc --noEmit` — Type-check shared types
- `cd app && bun test --filter integration` — Run integration tests against Supabase
- `cd app && bun test` — Run full test suite (133 tests)
- `cd app && bun run build` — Verify production build succeeds

**Domain-Specific Checks:**
- `grep -r "export.*interface.*Request" shared/ app/src/types/` — Verify no duplicate type definitions
- `grep -r "@shared/types" app/src/` — Verify all imports use new path alias
- `grep -r "from.*types/index" app/src/` — Catch any remaining relative imports to old location

**CI Workflow:**
- `.github/workflows/app-ci.yml` runs all validation commands automatically
- CI fails if shared types have errors or app fails to compile
- Path trigger `shared/**` ensures CI runs when shared types change

## Issue Relationships

**Blocks**:
- #150 — feat: add Next.js web application with shared TypeScript types to monorepo
  - Next.js app requires shared types infrastructure to import API contracts
  - Frontend cannot proceed past Phase 1 without `@shared/*` path alias and extracted types

**Related To**:
- #151 — chore: standardize GitHub issue management and relationship metadata
  - Both issues establish cross-project infrastructure (types for #152, issue relationships for #151)
  - Both set foundation for monorepo scaling (shared types, dependency management)

**Follow-Up**:
- Future work: Extract MCP types to `shared/types/mcp.ts` when frontend needs MCP integration
- Future work: Add validation types to `shared/types/schemas.ts` when multiple consumers need schema validation
- Future work: Document breaking change workflow for shared types (semantic versioning, migration guides)
