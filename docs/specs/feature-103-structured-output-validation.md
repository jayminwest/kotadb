# Feature Plan: Structured Output Validation and Typechecking for Slash Commands

## Overview

**Issue**: #103 - feat: structured output validation and typechecking for slash commands
**Labels**: component:backend, component:api, priority:medium, effort:large, status:needs-investigation
**Related**: `.claude/commands/docs/prompt-code-alignment.md`

### Problem

Slash command templates in `.claude/commands/` currently specify output formats using natural language instructions ("Return ONLY the file path", "Expected Output: ```json```"). This creates several pain points:

1. No runtime enforcement - agents can violate output contracts without detection
2. Brittle parsing in automation layer - regex/string parsing is fragile and hard to maintain
3. Silent failures - template changes can break automation without compile-time warnings
4. No validation during development - developers can't test command outputs against schemas
5. Prompt-code alignment issues (see #84) - mismatches between template output and Python parser expectations

### Desired Outcome

Build a validation system in the `app/` layer that enables type-safe command execution:

1. Commands declare output schemas using Zod (TypeScript schema validation library)
2. API endpoint `POST /validate-output` validates command output against schemas
3. Automation layer validates outputs before parsing, surfacing errors early
4. Interactive Claude Code sessions can optionally enable validation warnings
5. Type-safe command evolution with clear schema versioning

### Non-Goals

- **Not replacing the agent execution layer** - this is validation only, not a new execution runtime
- **Not enforcing validation on all commands immediately** - opt-in initially, with gradual adoption
- **Not building IDE tooling for template authoring** - schema validation only, editor support is future work
- **Not handling authentication in templates** - API endpoint will require existing API key auth

## Technical Approach

### Architecture Notes

This feature extends the existing API layer with a new validation endpoint and introduces a schema type system for command outputs. The validation logic lives entirely in the `app/` layer, making it reusable across both automation workflows and interactive sessions.

**Key design decisions**:

1. **Zod for schema validation**: Mature TypeScript library with excellent error messages and type inference
2. **API endpoint over library import**: Automation layer can validate without TypeScript dependencies
3. **Schema embedding in templates**: Schemas live in command markdown files, not separate config
4. **Opt-in adoption**: Existing commands continue working, new commands can adopt schemas gradually

### Key Modules to Touch

**New modules**:
- `app/src/validation/schemas.ts` - Zod schema definitions and validation logic
- `app/src/validation/types.ts` - TypeScript types for validation requests/responses
- `app/src/validation/common-schemas.ts` - Reusable schema patterns (file paths, JSON blocks, markdown)

**Modified modules**:
- `app/src/api/routes.ts` - Add `POST /validate-output` endpoint
- `app/src/types/index.ts` - Export validation types
- `.claude/commands/workflows/plan.md` - Add example schema
- `.claude/commands/issues/issue.md` - Add example schema
- `.claude/commands/git/commit.md` - Add example schema

**Automation integration (future)**:
- `automation/adws/adw_modules/agent.py` - Extract schemas from templates, call validation endpoint
- `automation/adws/adw_modules/validation.py` - Schema validation helpers

### Data/API Impacts

**New API Endpoint**:
```
POST /validate-output
Authorization: Bearer <api_key>
Content-Type: application/json

Request:
{
  "schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "pattern": "^[^/].*\\.md$" }
    },
    "required": ["path"]
  },
  "output": "docs/specs/feature-123-plan.md"
}

Response (valid):
{
  "valid": true
}

Response (invalid):
{
  "valid": false,
  "errors": [
    {
      "path": "path",
      "message": "Expected string matching pattern '^[^/].*\\.md$', received '/absolute/path.md'"
    }
  ]
}
```

**Rate limiting**: Endpoint uses existing tier-based rate limiting (no special handling needed)

**Authentication**: Standard API key validation via existing middleware

## Relevant Files

### Existing Files
- `app/src/api/routes.ts` - API endpoint definitions and Express app factory
- `app/src/types/index.ts` - Shared TypeScript type definitions
- `app/package.json` - Dependency management (add Zod)
- `.claude/commands/README.md` - Command structure and organization documentation
- `.claude/commands/docs/prompt-code-alignment.md` - Template output contract documentation
- `automation/adws/adw_modules/agent.py` - Agent execution and template rendering
- `automation/adws/adw_modules/data_types.py` - Python data models for automation layer

### New Files
- `app/src/validation/schemas.ts` - Core validation logic using Zod
- `app/src/validation/types.ts` - TypeScript types for validation API
- `app/src/validation/common-schemas.ts` - Reusable schema helpers (file paths, JSON, markdown)
- `app/tests/validation/schemas.test.ts` - Unit tests for validation logic
- `app/tests/integration/validate-output.test.ts` - Integration tests for API endpoint

## Task Breakdown

### Phase 1: Validation Foundation (API Endpoint)
**Goal**: Build the core validation endpoint in the `app/` layer with Zod integration

1. Add Zod dependency to `app/package.json`
2. Create `app/src/validation/` directory structure
3. Implement `schemas.ts` with core validation logic
4. Define `types.ts` for request/response interfaces
5. Add `POST /validate-output` route to `app/src/api/routes.ts`
6. Wire up authentication middleware for new endpoint
7. Add rate limit headers to validation responses

### Phase 2: Schema Type System
**Goal**: Create reusable schema patterns for common command output types

1. Implement `common-schemas.ts` with helpers:
   - `FilePathOutput` - Validates relative paths (no leading `/`)
   - `JSONBlockOutput` - Validates JSON structure (with markdown code block support)
   - `MarkdownSectionOutput` - Validates markdown with specific sections
   - `PlainTextOutput` - Simple string validation with no formatting
2. Add TypeScript type exports to `app/src/types/index.ts`
3. Document schema patterns in `.claude/commands/README.md`

### Phase 3: Command Integration (Examples)
**Goal**: Add schemas to 3 representative commands as proof of concept

1. Add schema to `/workflows:plan` (Path Resolution template):
   - Schema: `FilePathOutput` with `.md` extension requirement
   - Location: `## Output Schema` section at end of template
2. Add schema to `/issues:issue` (Structured Data template):
   - Schema: JSON with fields `{number, title, summary, constraints}`
   - Validate against existing Python `GitHubIssue` model
3. Add schema to `/git:commit` (Message-Only template):
   - Schema: `PlainTextOutput` with max 72 chars first line
   - Validate Conventional Commits format: `<type>(<scope>): <subject>`

### Phase 4: Testing
**Goal**: Comprehensive test coverage for validation logic and API endpoint

1. Unit tests for `app/src/validation/schemas.ts`:
   - Valid schemas parse successfully
   - Invalid schemas return structured errors
   - Common schema helpers work correctly
2. Integration tests for `/validate-output` endpoint:
   - Authentication required (401 without API key)
   - Rate limiting enforced (429 when limit exceeded)
   - Valid outputs return `{valid: true}`
   - Invalid outputs return structured errors with paths
3. Test against real command outputs:
   - Load schemas from example command templates
   - Validate outputs from test fixtures
   - Ensure error messages are actionable

### Phase 5: Documentation
**Goal**: Complete documentation for feature adoption

1. API documentation for `/validate-output` endpoint:
   - Add to project README or API docs
   - Include request/response examples
   - Document authentication and rate limiting
2. Schema authoring guide in `.claude/commands/README.md`:
   - How to add schemas to command templates
   - Schema format specification (Zod-compatible JSON)
   - Examples for each template category
3. Migration guide for automation layer:
   - How to extract schemas from templates (Python)
   - Calling validation endpoint from `agent.py`
   - Handling validation errors in workflows
4. Update `.claude/commands/docs/prompt-code-alignment.md`:
   - Add section on schema-based validation
   - Reference validation endpoint for runtime checks

## Step by Step Tasks

### Foundational Setup
1. Add Zod to dependencies: `cd app && bun add zod`
2. Create validation module structure: `mkdir -p app/src/validation`
3. Create test structure: `mkdir -p app/tests/validation app/tests/integration`

### Core Validation Implementation
4. Implement `app/src/validation/types.ts` with interfaces:
   - `ValidationRequest` - `{schema: object, output: string}`
   - `ValidationResponse` - `{valid: boolean, errors?: ValidationError[]}`
   - `ValidationError` - `{path: string, message: string}`
5. Implement `app/src/validation/schemas.ts` with validation logic:
   - `validateOutput(schema: object, output: string): ValidationResponse`
   - Parse Zod schema from JSON object
   - Execute validation and format errors
6. Implement `app/src/validation/common-schemas.ts` with helpers:
   - `FilePathOutput` - Relative path schema (no leading `/`, common extensions)
   - `JSONBlockOutput` - JSON validation with markdown extraction
   - `MarkdownSectionOutput` - Markdown structure validation
   - `PlainTextOutput` - String validation with length/format constraints

### API Endpoint Integration
7. Add `POST /validate-output` route to `app/src/api/routes.ts`:
   - Apply authentication middleware
   - Parse request body as `ValidationRequest`
   - Call `validateOutput()` with schema and output
   - Return `ValidationResponse` with rate limit headers
   - Handle errors (400 for invalid schema, 500 for validation errors)
8. Export validation types from `app/src/types/index.ts`

### Command Schema Integration
9. Add schema to `/workflows:plan` (`.claude/commands/workflows/plan.md`):
   - Add `## Output Schema` section at end of template
   - Schema: `{"type": "string", "pattern": "^docs/specs/.*\\.md$"}`
   - Update output format section to reference schema
10. Add schema to `/issues:issue` (`.claude/commands/issues/issue.md`):
    - Schema: `{"type": "object", "properties": {"number": {"type": "number"}, "title": {"type": "string"}, "summary": {"type": "string"}, "constraints": {"type": "array", "items": {"type": "string"}}}, "required": ["number", "title", "summary"]}`
11. Add schema to `/git:commit` (`.claude/commands/git/commit.md`):
    - Schema: `{"type": "string", "pattern": "^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)\\([^)]+\\): .{1,50}"}`

### Testing
12. Write unit tests for validation logic (`app/tests/validation/schemas.test.ts`):
    - Test `validateOutput()` with valid schemas and outputs
    - Test error formatting for invalid outputs
    - Test common schema helpers (`FilePathOutput`, `JSONBlockOutput`, etc.)
13. Write integration tests for API endpoint (`app/tests/integration/validate-output.test.ts`):
    - Test authentication requirement (401 without API key)
    - Test rate limiting (429 when limit exceeded)
    - Test valid output validation (returns `{valid: true}`)
    - Test invalid output validation (returns structured errors)
    - Test against real command schemas from templates
14. Run validation: `cd app && bun test --filter validation`
15. Run full test suite: `cd app && bun test`

### Documentation
16. Add API documentation to `README.md` or `docs/api.md`:
    - Document `/validate-output` endpoint
    - Include request/response examples
    - Document authentication and rate limiting
17. Update `.claude/commands/README.md` with schema authoring guide:
    - Add section on "Adding Output Schemas to Commands"
    - Document schema format (Zod-compatible JSON)
    - Provide examples for each template category
18. Update `.claude/commands/docs/prompt-code-alignment.md`:
    - Add section on runtime validation with schemas
    - Reference `/validate-output` endpoint for automation integration
19. Create migration guide for automation layer (in plan, not implemented):
    - Document how to extract schemas from templates in Python
    - Show example of calling validation endpoint from `agent.py`
    - Provide error handling patterns for validation failures

### Final Validation and PR Creation
20. Run complete validation suite:
    - `cd app && bun run lint`
    - `cd app && bun run typecheck`
    - `cd app && bun test`
    - `cd app && bun run build`
21. Verify schema examples work with validation endpoint (manual test)
22. Push branch to remote: `git push -u origin feature-103-structured-output-validation`
23. Create pull request using `/pull_request` command

## Risks & Mitigations

### Risk: Schema format complexity
**Impact**: Developers find Zod JSON schema format difficult to author
**Mitigation**: Provide extensive examples in documentation, create common-schemas.ts with helpers for frequent patterns, document schema format clearly in README

### Risk: Breaking changes to existing commands
**Impact**: Adding schemas to templates breaks automation workflows
**Mitigation**: Make schemas opt-in, do not enforce validation unless schema is present, test against existing command outputs before adding schemas

### Risk: Validation endpoint latency
**Impact**: Validation adds overhead to automation workflows
**Mitigation**: Keep validation logic synchronous and fast, schema validation is typically <1ms, consider caching parsed schemas if needed

### Risk: Schema versioning challenges
**Impact**: Evolving command schemas breaks older automation code
**Mitigation**: Document schema versioning strategy (start with v1, add version field to schema if needed), consider maintaining backward compatibility for 2-3 versions

### Risk: Zod JSON schema limitations
**Impact**: Some validation patterns may not be expressible in Zod JSON format
**Mitigation**: Start with common patterns, extend schema helpers as needed, fall back to custom validation functions for complex cases

### Risk: Automation layer integration complexity
**Impact**: Python code struggles to extract schemas from markdown templates
**Mitigation**: Define clear schema embedding format (## Output Schema section with JSON code block), provide Python reference implementation in migration guide

## Validation Strategy

### Automated Tests

**Unit tests** (`app/tests/validation/schemas.test.ts`):
- Validate correct parsing of Zod schemas from JSON objects
- Test validation logic with various input types (strings, objects, arrays)
- Verify error message formatting and path resolution
- Test common schema helpers with valid and invalid inputs
- Coverage target: 100% for validation logic

**Integration tests** (`app/tests/integration/validate-output.test.ts`):
- Test `/validate-output` endpoint with real Supabase authentication
- Verify rate limiting enforcement using real database counters
- Test against real command schemas from templates
- Validate error responses for malformed requests
- Test authentication failures (401) and rate limit exceeded (429)
- Coverage target: All endpoint paths and error conditions

**Anti-mocking compliance**:
- Use real Supabase client for authentication (no auth mocks)
- Use real API key validation against test database
- Use real rate limit counters (test increment_rate_limit function)
- Seed test data: create test API keys with different tiers
- Failure injection: test rate limit exceeded by making 101+ requests

### Manual Tests

**Validation endpoint testing**:
1. Start server: `cd app && bun run src/index.ts`
2. Create test API key: `bun run scripts/create-api-key.ts` (if script exists, otherwise use Supabase dashboard)
3. Test valid output:
   ```bash
   curl -X POST http://localhost:3000/validate-output \
     -H "Authorization: Bearer <api_key>" \
     -H "Content-Type: application/json" \
     -d '{"schema": {"type": "string"}, "output": "docs/specs/plan.md"}'
   ```
4. Test invalid output:
   ```bash
   curl -X POST http://localhost:3000/validate-output \
     -H "Authorization: Bearer <api_key>" \
     -H "Content-Type: application/json" \
     -d '{"schema": {"type": "number"}, "output": "not a number"}'
   ```
5. Verify error messages are actionable (include path and expected type)

**Command schema testing**:
1. Add schema to `/workflows:plan` command
2. Run ADW workflow: `uv run automation/adws/adw_phases/adw_plan.py 103`
3. Extract plan output and validate against schema manually
4. Intentionally break schema format (e.g., use absolute path)
5. Verify validation endpoint catches the error

### Release Guardrails

**Monitoring**:
- Track validation endpoint usage via logs (success rate, error types)
- Monitor validation latency (should be <10ms p99)
- Track rate limit exhaustion on validation endpoint

**Alerting**:
- Alert if validation endpoint error rate exceeds 5%
- Alert if validation latency p99 exceeds 50ms
- Alert if rate limit exhaustion rate increases >20% week-over-week

**Rollback plan**:
1. Remove `/validate-output` route from `app/src/api/routes.ts`
2. Revert commit that added validation endpoint
3. Remove schemas from command templates (restore to natural language instructions)
4. Deploy previous version via `git revert <commit-hash>`
5. No data migration needed (feature is stateless)

## Validation Commands

Execute validation in sequence after implementation:

**Level 1 - Quick validation**:
```bash
cd app && bun run lint
cd app && bun run typecheck
```

**Level 2 - Integration validation**:
```bash
cd app && bun test --filter validation
cd app && bun test --filter integration
```

**Level 3 - Full validation** (required for this feature):
```bash
cd app && bun test
cd app && bun run build
```

**Domain-specific validation**:
```bash
# Validate migration sync (if any database changes)
cd app && bun run test:validate-migrations

# Validate no hardcoded environment variables in tests
cd app && bun run test:validate-env

# Manual validation endpoint testing (see manual tests above)
# Start server and run curl commands against /validate-output
```

## Open Questions

**Resolved during planning**:

1. **Should validation be opt-in or required for all commands?**
   - **Decision**: Opt-in initially. Commands without schemas continue working as-is. New commands can adopt schemas gradually.

2. **How to handle schema versioning when commands evolve?**
   - **Decision**: Start without versioning. If needed, add optional `schemaVersion` field to schema object. Support 2-3 versions concurrently during transitions.

3. **Should the API endpoint be public or require authentication?**
   - **Decision**: Require authentication. Use existing API key middleware. Validation consumes rate limit quota like other endpoints.

4. **Can we provide IDE support for schema validation during template authoring?**
   - **Decision**: Out of scope for this feature. Focus on runtime validation. IDE support is future work (could use JSON schema for VSCode).

**Questions for future work**:

1. Should we add schema validation to CI/CD pipeline to catch template changes that break schemas?
2. Should we build a schema extraction utility in Python for automation layer integration?
3. Should we support custom validation functions beyond Zod schemas (e.g., Conventional Commits validation)?
4. Should we add schema validation to MCP tools (`search_code`, `index_repository`, `list_recent_files`)?
