# OpenAPI 3.1 Spec for SDK Type Generation

**Issue**: #568
**Type**: feature
**Created**: 2025-12-16

## Summary

Implement minimal OpenAPI 3.1 specification generation using `zod-openapi` package to enable SDK type generation for KotaDB API consumers. This will provide a machine-readable API contract at `GET /openapi.json` that can be consumed by tools like `openapi-generator-cli` to generate type-safe client SDKs in multiple languages.

## Expert Analysis Summary

### Architecture
- **File Structure**: Centralized OpenAPI implementation in `app/src/api/openapi/` directory
- **Schema Approach**: Single source of truth - extend existing Zod schemas with OpenAPI metadata using `zod-openapi`
- **Build-Time Generation**: Pre-compute spec at startup, serve cached JSON at runtime
- **Path Aliases**: Use `@api/*`, `@shared/*`, `@logging/*` for all imports
- **Module Boundaries**: Clear separation between schema definitions, spec builder, and endpoint handler

### Testing Strategy
- **Validation Level**: 3 (Full OpenAPI 3.1 compliance)
- **Antimocking Approach**: Use real `@apidevtools/swagger-parser` for validation
- **Real API Testing**: Compare generated spec schemas against actual HTTP responses
- **SDK Generation Test**: Validate spec by generating TypeScript SDK and compiling it
- **Test Files**: 
  - `app/tests/api/openapi-generation.test.ts` (spec generation)
  - `app/tests/api/openapi-endpoint.test.ts` (GET /openapi.json endpoint)
  - `app/tests/validation/openapi-validator.test.ts` (OpenAPI 3.1 compliance)

### Security Considerations
- **Security Schemes**: Dual authentication (Bearer API keys: `kota_*` format, JWT tokens)
- **Public Endpoint**: `/openapi.json` must be PUBLIC (no authentication required)
- **Credential Exposure**: Never include real secrets in examples - use placeholder format
- **Rate Limiting**: Document dual-limit model (hourly + daily) with response headers
- **CORS Policy**: Keep `origin: true` for SDK clients, add Cache-Control headers
- **Excluded Endpoints**: DO NOT include `/admin/*` (service-role only) or `/webhooks/*` (HMAC-verified)

### Integration Impact
- **External Systems**: `openapi-generator-cli`, `swagger-codegen`, Swagger UI, ReDoc
- **Breaking Changes**: None - new endpoint only, existing API unchanged
- **Versioning Strategy**: Align `info.version` with package.json version
- **Migration Path**: Phase 1 (spec endpoint) → Phase 2 (official SDK) → Phase 3 (maintenance mode for direct HTTP)
- **SDK Tooling**: Validate generated SDK compiles and works against live API in CI

### UX/DX Impact
- **API Descriptions**: Clear summaries and descriptions for all operations
- **Parameter Documentation**: Required fields, constraints, examples for all parameters
- **Error Responses**: Document all error codes (400, 401, 404, 429, 500)
- **Rate Limit Headers**: Full documentation of `X-RateLimit-*` headers
- **Authentication Flow**: Clear examples for both API key and JWT auth

### Pre-Commit Hooks
- **NO NEW HOOKS REQUIRED**: Existing `auto_linter` hook covers new TypeScript files
- **Logging Standards**: Use `createLogger` from `@logging/logger.js` (NEVER `console.*`)
- **TypeScript Strict Mode**: All code must compile with strict mode enabled
- **Performance Impact**: Negligible (~1-2s per OpenAPI file modification)

### Claude Code Workflow
- **File Creation**: Standard Write tool for new schema files and spec builder
- **Build Integration**: No special build step - spec generated at app startup
- **Validation**: Integration tests verify spec validity and SDK generation
- **Documentation**: Update API docs to reference `/openapi.json` endpoint

## Requirements

- [ ] Install `zod-openapi` package for OpenAPI 3.1 generation from Zod schemas
- [ ] Create OpenAPI spec builder that generates spec at app startup
- [ ] Implement `GET /openapi.json` endpoint (public, cached, no auth)
- [ ] Document core endpoints: indexing, search, jobs, projects, subscriptions, API keys
- [ ] Define security schemes: apiKey (Bearer kota_*) and bearerAuth (JWT)
- [ ] Include rate limit response headers and 429 error responses
- [ ] Add OpenAPI 3.1 compliance validation tests with real validator
- [ ] Test SDK generation with `openapi-generator-cli`
- [ ] Exclude admin and webhook endpoints from public spec
- [ ] Document all error responses (400, 401, 404, 429, 500)

## Implementation Steps

### Step 1: Install Dependencies
**Files**: `app/package.json`
**Changes**:
- Add `zod-openapi` package (version ^2.0.0 or latest compatible)
- Add `@apidevtools/swagger-parser` as dev dependency for testing

### Step 2: Create OpenAPI Schema Extensions
**Files**: `app/src/api/openapi/schemas.ts` (NEW)
**Changes**:
- Import existing Zod schemas from `@shared/types/api.ts` and `@shared/types/projects.ts`
- Extend Zod schemas with OpenAPI metadata using `extendZodWithOpenApi`
- Add descriptions, examples, and deprecated flags
- Define reusable component schemas for request/response types

### Step 3: Create OpenAPI Spec Builder
**Files**: `app/src/api/openapi/builder.ts` (NEW)
**Changes**:
- Implement `buildOpenAPISpec()` function that generates full OpenAPI 3.1 document
- Define info section (title, version from package.json, description)
- Define servers array (production, staging, local environments)
- Define security schemes (apiKey, bearerAuth)
- Build paths object by introspecting route definitions
- Include rate limit headers in all authenticated endpoint responses
- Add 429 error response schema with `X-RateLimit-*` headers
- Cache generated spec in memory for performance

### Step 4: Define Path Operations
**Files**: `app/src/api/openapi/paths.ts` (NEW)
**Changes**:
- Document core endpoints with operations:
  - `GET /health` - Health check (public)
  - `POST /index` - Repository indexing (authenticated)
  - `GET /jobs/:jobId` - Job status (authenticated)
  - `GET /search` - Code search (authenticated)
  - `GET /files/recent` - Recent files (authenticated)
  - `POST /api/projects` - Create project (authenticated)
  - `GET /api/projects` - List projects (authenticated)
  - `GET /api/projects/:id` - Get project (authenticated)
  - `PATCH /api/projects/:id` - Update project (authenticated)
  - `DELETE /api/projects/:id` - Delete project (authenticated)
  - `POST /api/projects/:id/repositories/:repoId` - Add repository (authenticated)
  - `POST /api/keys/generate` - Generate API key (JWT only)
  - `GET /api/keys/current` - Get current API key (authenticated)
  - `POST /api/keys/reset` - Reset API key (JWT only)
  - `POST /api/subscriptions/create-checkout-session` - Stripe checkout (authenticated)
  - `POST /api/subscriptions/create-portal-session` - Stripe portal (authenticated)
  - `GET /api/subscriptions/current` - Current subscription (authenticated)
- Add parameter definitions (path, query, body)
- Add response schemas (200, 400, 401, 404, 429, 500)
- Mark security requirements per endpoint

### Step 5: Add OpenAPI Endpoint to Routes
**Files**: `app/src/api/routes.ts`
**Changes**:
- Import OpenAPI spec builder
- Add `GET /openapi.json` endpoint around line 1370 (after existing routes)
- Serve pre-computed spec with Cache-Control headers (`public, max-age=3600`)
- Do NOT apply auth middleware to this endpoint (must be public)
- Add error handling for spec generation failures
- Log spec generation time and endpoint count using `createLogger`

### Step 6: Create Test Fixtures
**Files**: `app/tests/helpers/openapi-fixtures.ts` (NEW)
**Changes**:
- Create minimal valid OpenAPI 3.1 spec as reference
- Create Zod schema test samples (primitives, arrays, objects, unions)
- Define expected security schemes for validation

### Step 7: Add Spec Generation Tests
**Files**: `app/tests/api/openapi-generation.test.ts` (NEW)
**Changes**:
- Test spec generates without errors
- Validate OpenAPI 3.1 structure (openapi: "3.1.0", info, paths, components)
- Verify all core endpoints are documented
- Check security schemes defined correctly
- Validate rate limit headers in response schemas
- Ensure no circular references in schemas
- Verify version matches package.json

### Step 8: Add Spec Validation Tests
**Files**: `app/tests/validation/openapi-validator.test.ts` (NEW)
**Changes**:
- Use `@apidevtools/swagger-parser` to validate spec (antimocking)
- Parse spec without errors (OpenAPI 3.1 compliance)
- Validate all paths are documented
- Check security properly applied per endpoint
- Verify response schemas match actual API responses
- Ensure no unused component schemas

### Step 9: Add Endpoint Integration Tests
**Files**: `app/tests/api/openapi-endpoint.test.ts` (NEW)
**Changes**:
- Test `GET /openapi.json` returns 200 without auth
- Verify Content-Type is `application/json`
- Check Cache-Control headers present
- Validate returned spec is valid JSON
- Ensure spec content matches generated spec
- Test CORS headers present

### Step 10: Add SDK Generation Test
**Files**: `app/tests/api/openapi-generation.test.ts` (update)
**Changes**:
- Generate TypeScript SDK using `openapi-generator-cli`
- Compile generated SDK with `tsc --noEmit`
- Verify SDK includes all public operations
- Spot-check 5 critical types match runtime types

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `app/package.json` | modify | Add zod-openapi and @apidevtools/swagger-parser dependencies |
| `app/src/api/routes.ts` | modify | Add GET /openapi.json endpoint handler |

## Files to Create

| File | Purpose |
|------|---------|
| `app/src/api/openapi/schemas.ts` | Extend Zod schemas with OpenAPI metadata |
| `app/src/api/openapi/builder.ts` | Build complete OpenAPI 3.1 spec document |
| `app/src/api/openapi/paths.ts` | Define path operations for all endpoints |
| `app/tests/helpers/openapi-fixtures.ts` | Test fixtures for OpenAPI validation |
| `app/tests/api/openapi-generation.test.ts` | Spec generation and SDK generation tests |
| `app/tests/validation/openapi-validator.test.ts` | OpenAPI 3.1 compliance tests |
| `app/tests/api/openapi-endpoint.test.ts` | GET /openapi.json endpoint tests |

## Testing Strategy

**Validation Level**: 3 (Full OpenAPI 3.1 Compliance)

**Justification**: 
- Generated spec will be used for real SDK generation tools
- Invalid specs fail downstream consumers immediately
- OpenAPI 3.1 is a standardized contract that customers rely on
- Breaking changes risk must be caught before shipping

### Test Cases

**Schema Generation**:
- Zod primitive types convert correctly to OpenAPI schemas
- Complex types (arrays, objects, unions) map correctly
- Optional vs required fields handled properly
- Constraints (minLength, pattern, min/max) preserved

**Spec Structure**:
- OpenAPI 3.1 root structure valid (openapi, info, paths)
- Security schemes defined (apiKey, bearerAuth)
- All core endpoints documented with correct HTTP methods
- Rate limit headers documented in responses
- Error responses (400, 401, 404, 429, 500) documented

**Endpoint Coverage**:
- All Express routes have OpenAPI entries
- Public endpoints marked with empty security array
- Authenticated endpoints reference security schemes
- Admin and webhook endpoints excluded

**Real Validation**:
- Use `@apidevtools/swagger-parser` (NOT mocked)
- Parse generated spec against OpenAPI 3.1 meta-schema
- Compare actual HTTP responses to documented schemas
- Generate SDK and verify compilation succeeds

## Convention Checklist

- [ ] Path aliases used for all imports (@api/*, @shared/*, @logging/*)
- [ ] Logging via createLogger (no console.*)
- [ ] TypeScript strict mode compliance
- [ ] Tests use real Supabase Local (antimocking)
- [ ] Pre-commit hooks pass (auto_linter)
- [ ] OpenAPI 3.1 spec validates with real validator
- [ ] SDK generation succeeds and compiles
- [ ] Cache-Control headers set for /openapi.json
- [ ] No authentication required for spec endpoint
- [ ] Rate limit headers documented in all authenticated endpoints

## Dependencies

**Existing Files**:
- `shared/types/api.ts` - IndexRequest, IndexResponse, SearchRequest, SearchResponse, etc.
- `shared/types/projects.ts` - CreateProjectRequest, UpdateProjectRequest, ProjectWithRepos
- `app/src/api/routes.ts` - Main router where endpoint will be added
- `app/src/logging/logger.ts` - createLogger for proper logging

**New Dependencies**:
- `zod-openapi` - Converts Zod schemas to OpenAPI 3.1
- `@apidevtools/swagger-parser` - Validates OpenAPI specs

## Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Spec-code divergence | HIGH | Unit tests verify every endpoint documented; CI validation |
| Zod feature incompleteness | MEDIUM | Document unmappable patterns; custom overrides for edge cases |
| SDK generation tooling bugs | MEDIUM | Validate generated SDK in CI; maintain tested generators whitelist |
| Breaking changes unnoticed | HIGH | Spec versioning; comparison tool in CI fails on breaking changes |
| Rate limit header mishandling | MEDIUM | Include code examples in spec; auto-generate retry logic |
| OpenAPI endpoint DoS | MEDIUM | CDN caching; aggressive rate limiting; spec size optimization |
| Credential exposure in examples | CRITICAL | Use placeholder format only; never include real secrets |
| Type safety loss in generated SDK | LOW | TypeScript strict mode enforced; publish @types package separately |

## Security Notes

- **Public Endpoint**: `/openapi.json` MUST be public (no auth) for SDK discovery
- **Dual Authentication**: Document both API key (kota_*) and JWT bearer token auth
- **Exclude Internals**: DO NOT include `/admin/*` or `/webhooks/*` endpoints
- **Placeholder Secrets**: Use `kota_free_key123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` format in examples
- **Rate Limit Documentation**: Full headers and 429 response schema required
- **CORS**: Keep `origin: true` for SDK clients; add Cache-Control for performance

## Performance Considerations

- **Spec Generation**: Pre-compute at startup (~500ms), cache in memory
- **Endpoint Response**: <100ms (serving cached JSON)
- **Cache Headers**: `public, max-age=3600` (spec changes only on deployment)
- **Spec Size Target**: <1MB (minified JSON, remove verbose examples if needed)
