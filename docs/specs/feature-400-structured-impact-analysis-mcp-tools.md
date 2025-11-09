# Feature Plan: Structured Impact Analysis and Spec Validation MCP Tools

## Overview

### Issue Metadata
- **Issue Number**: #400
- **Title**: feat: add structured impact analysis and spec validation MCP tools for agent planning
- **Labels**: component:backend, component:api, priority:high, effort:large, status:needs-investigation
- **Related Issues**:
  - **Related To**: #116 (search_dependencies MCP tool) - Uses dependency graph data
  - **Related To**: #369 (dependency extraction) - Leverages indexed dependency data
  - **Related To**: #217 (ADW agents as MCP tools) - Part of broader MCP ecosystem expansion
  - **Related To**: #355 (production MVP launch) - Enhances agent capabilities for production usage

### Problem
Currently, AI agents using KotaDB operate in a passive, query-response mode. They search for code, query dependencies, and read markdown specs, but have no structured way to submit implementation plans and receive validated impact analysis. This leads to:
- Agents making uninformed implementation decisions
- Failed ADW runs due to file conflicts and architectural issues
- No proactive detection of overlapping work or breaking changes
- Manual markdown parsing and hope-for-the-best implementation

### Desired Outcome
Transform KotaDB into an active planning partner by adding two structured MCP tools:

1. **`analyze_change_impact`**: Accepts structured JSON describing proposed changes and returns comprehensive impact analysis including:
   - Affected files with change requirements
   - Test scope recommendations
   - Architectural warnings
   - Conflict detection with open PRs/branches
   - Production deployment impact estimates

2. **`validate_implementation_spec`**: Validates implementation specs against KotaDB conventions and repository state:
   - File conflict detection (files exist in other branches)
   - Naming convention validation (migrations, path aliases)
   - Dependency compatibility checks
   - Test coverage impact estimates
   - Final recommendations and approval conditions

### Non-Goals
- Storing spec versions in database (Phase 2)
- Real-time collaboration conflict detection (Phase 2)
- Multi-repository impact analysis (Phase 3)
- Automated spec revision based on feedback (Phase 3)
- Visual dependency graph rendering (separate issue)

## Technical Approach

### Architecture Notes
This feature extends the existing MCP server architecture (`app/src/mcp/`) by adding two new tools that leverage:
- Existing `search_dependencies` infrastructure (issue #116, #369) for dependency graph traversal
- Indexed repository metadata (symbols, dependencies, files) in PostgreSQL
- GitHub API integration for branch/PR conflict detection
- Real-time architectural pattern matching via code search

The tools follow KotaDB's self-describing API pattern: MCP tool schemas become the specification format itself, enabling any MCP-compatible LLM to read the schema and structure plans correctly.

### Key Modules to Touch
- `app/src/mcp/tools.ts` - Add new tool definitions and execution functions
- `app/src/mcp/server.ts` - Register new tools in ListToolsRequestSchema handler
- `app/src/api/queries.ts` - Add impact analysis query functions (may need new helpers)
- `app/tests/mcp/` - Integration tests for new MCP tools

### Data/API Impacts
- **No new database tables required for MVP** - uses existing indexed data
- New query patterns for:
  - Aggregating dependency graph data for impact metrics
  - Querying git history for recent changes (via indexed metadata)
  - Branch/file conflict detection (via GitHub API calls)
- GitHub API integration requirement:
  - Query open PRs for file overlap detection
  - Check branch existence and modification timestamps
  - Requires `GITHUB_TOKEN` environment variable (optional, graceful degradation)

## Relevant Files

### Existing Files to Modify
- `app/src/mcp/tools.ts` - Add `ANALYZE_CHANGE_IMPACT_TOOL`, `VALIDATE_IMPLEMENTATION_SPEC_TOOL`, `executeAnalyzeChangeImpact()`, `executeValidateImplementationSpec()`, update `getToolDefinitions()` and `handleToolCall()`
- `app/src/mcp/server.ts` - Register new tools in `ListToolsRequestSchema` and `CallToolRequestSchema` handlers
- `app/src/api/queries.ts` - Add helper functions for impact analysis (dependency aggregation, file conflict detection)
- `README.md` - Document new MCP tools with usage examples
- `.claude/commands/docs/mcp-integration.md` - Update with new tool descriptions and schemas

### New Files to Create
- `app/src/mcp/impact-analysis.ts` - Core impact analysis logic (dependency aggregation, risk scoring, test scope calculation)
- `app/src/mcp/spec-validation.ts` - Spec validation logic (naming conventions, file conflicts, approval conditions)
- `app/src/mcp/github-integration.ts` - GitHub API client for PR/branch queries (with graceful degradation)
- `app/tests/mcp/impact-analysis.test.ts` - Integration tests for `analyze_change_impact` tool
- `app/tests/mcp/spec-validation.test.ts` - Integration tests for `validate_implementation_spec` tool
- `app/tests/fixtures/mcp/impact-analysis-repo/` - Test fixtures for impact analysis scenarios

## Task Breakdown

### Phase 1: Core Impact Analysis Tool (analyze_change_impact)

#### Investigation & Design
- Research existing dependency graph query patterns in `app/src/api/queries.ts` (queryDependents, queryDependencies)
- Design impact analysis algorithm:
  - Direct dependents: files that import target files (depth=1)
  - Indirect dependents: transitive dependencies (depth=2-5)
  - Test scope: identify test files related to affected files
  - Risk level scoring: based on dependency breadth and recent changes
- Define JSON schema for structured input (TypeScript interfaces in `@shared/types`)
- Define JSON response schema for impact analysis results

#### Implementation
- Create `app/src/mcp/impact-analysis.ts`:
  - `analyzeChangeImpact()`: main orchestration function
  - `aggregateDependencyGraph()`: query and aggregate dependencies
  - `calculateTestScope()`: identify required test files
  - `calculateRiskLevel()`: score based on impact breadth
  - `detectArchitecturalPatterns()`: search for similar code patterns
- Create `app/src/mcp/github-integration.ts`:
  - `GitHubClient` class with graceful degradation (no token = skip checks)
  - `queryOpenPRs()`: find PRs with overlapping file changes
  - `checkBranchConflicts()`: detect files modified in open branches
  - `getRecentFileChanges()`: query git history for recent modifications
- Add tool definition to `app/src/mcp/tools.ts`:
  - `ANALYZE_CHANGE_IMPACT_TOOL` constant with schema
  - `executeAnalyzeChangeImpact()` function
- Update `app/src/mcp/server.ts` to register new tool

#### Testing
- Create `app/tests/fixtures/mcp/impact-analysis-repo/`:
  - Sample repository with dependency chains
  - Test files with known dependency relationships
  - Circular dependency scenarios
- Create `app/tests/mcp/impact-analysis.test.ts`:
  - Test with single file modification (simple case)
  - Test with multiple file modifications (complex case)
  - Test with breaking changes flag enabled
  - Test with database migration scenario
  - Test circular dependency detection
  - Test GitHub API integration (mocked, graceful degradation)
  - Validate JSON schema compliance using Zod

### Phase 2: Spec Validation Tool (validate_implementation_spec)

#### Investigation & Design
- Document KotaDB conventions to validate:
  - Migration naming: `YYYYMMDDHHMMSS_description.sql`
  - Path alias usage: `@api/*`, `@auth/*`, `@db/*`, etc.
  - Test file naming: `*.test.ts` or `*.spec.ts`
  - File location patterns (src vs tests directories)
- Design validation algorithm:
  - File existence checks in current repository state
  - Naming convention regex patterns
  - Dependency compatibility rules
  - Test coverage impact estimation
- Define JSON schema for spec input (matches ADW spec structure)
- Define JSON response schema for validation results

#### Implementation
- Create `app/src/mcp/spec-validation.ts`:
  - `validateImplementationSpec()`: main orchestration function
  - `checkFileConflicts()`: verify files don't exist or aren't in other branches
  - `validateNamingConventions()`: regex validation for migrations, paths, tests
  - `validatePathAliases()`: check imports use `@api/*` patterns, not relative paths
  - `estimateTestCoverageImpact()`: analyze test file changes vs implementation changes
  - `generateApprovalConditions()`: create checklist for implementation approval
- Add shared types to `shared/types/`:
  - `ImplementationSpec` interface (feature_name, files_to_create, files_to_modify, migrations, dependencies_to_add, breaking_changes)
  - `ValidationResult` interface (valid, errors, warnings, approval_conditions)
- Add tool definition to `app/src/mcp/tools.ts`:
  - `VALIDATE_IMPLEMENTATION_SPEC_TOOL` constant with schema
  - `executeValidateImplementationSpec()` function
- Update `app/src/mcp/server.ts` to register new tool

#### Testing
- Create `app/tests/mcp/spec-validation.test.ts`:
  - Test with valid spec (all conventions followed)
  - Test with invalid migration naming (expect errors)
  - Test with file conflicts (files exist in other branches)
  - Test with path alias violations (relative paths instead of @api/*)
  - Test with missing test coverage (implementation without tests)
  - Test with breaking changes flag (expect warnings)
  - Validate JSON schema compliance using Zod

### Phase 3: Integration, Documentation & Validation

#### Integration
- Update `app/src/mcp/tools.ts` to export new tools in `getToolDefinitions()`
- Update `app/src/mcp/tools.ts` to handle new tools in `handleToolCall()` dispatcher
- Ensure both tools return results in SDK content block format (text with JSON.stringify)
- Add error handling for GitHub API failures (graceful degradation)
- Add logging for impact analysis metrics (dependency counts, test scope, risk level)

#### Documentation
- Update `README.md`:
  - Add sections for new MCP tools with descriptions
  - Provide TypeScript and Python usage examples
  - Document JSON schemas with example inputs/outputs
  - Explain GitHub API integration and graceful degradation
- Update `.claude/commands/docs/mcp-integration.md`:
  - Add tool descriptions to "Available MCP Tools" section
  - Document JSON schema formats
  - Add test writing guidelines for new tools
  - Update tool count in "MCP Regression Testing" section
- Create usage examples in `docs/examples/`:
  - `impact-analysis-example.md`: Full example scenario (auth refactor)
  - `spec-validation-example.md`: Full example scenario (migration validation)

#### Validation
- Run full test suite: `cd app && bun test`
- Run MCP integration tests: `cd app && bun test mcp`
- Run type-check: `cd app && bunx tsc --noEmit`
- Run lint: `cd app && bun run lint`
- Manual testing with real indexed repository (dogfood KotaDB on itself):
  - Index KotaDB repository
  - Call `analyze_change_impact` for planned feature
  - Call `validate_implementation_spec` with test spec
  - Verify response formats and data quality

#### Cleanup & Preparation for PR
- Ensure all tests pass with real Supabase Local (antimocking compliance)
- Verify migration sync: `cd app && bun run test:validate-migrations`
- Check logging standards (no console.* usage): `cd app && bun run lint`
- Update conditional documentation if needed (`.claude/commands/docs/conditional_docs/app.md`)
- Validate commit message format (feat: add structured impact analysis MCP tools (#400))
- Push branch: `git push -u origin feat/400-structured-impact-analysis-mcp-tools`

## Step by Step Tasks

### Research & Planning
- Read and understand existing MCP tool patterns in `app/src/mcp/tools.ts`
- Review dependency graph query functions in `app/src/api/queries.ts`
- Study GitHub API documentation for PR/branch queries
- Design impact analysis algorithm with risk scoring
- Design spec validation algorithm with naming conventions
- Define TypeScript interfaces for tool inputs/outputs in `shared/types/`
- Document JSON schemas for both tools

### Core Impact Analysis Implementation
- Create `app/src/mcp/impact-analysis.ts` with core analysis logic
- Create `app/src/mcp/github-integration.ts` with GitHub API client
- Add `ANALYZE_CHANGE_IMPACT_TOOL` definition to `app/src/mcp/tools.ts`
- Implement `executeAnalyzeChangeImpact()` in `app/src/mcp/tools.ts`
- Register tool in `app/src/mcp/server.ts`
- Create test fixtures in `app/tests/fixtures/mcp/impact-analysis-repo/`
- Write integration tests in `app/tests/mcp/impact-analysis.test.ts`
- Run tests and verify real Supabase integration: `cd app && bun test mcp/impact-analysis`

### Spec Validation Implementation
- Create `app/src/mcp/spec-validation.ts` with validation logic
- Add shared types to `shared/types/` for spec and validation result
- Add `VALIDATE_IMPLEMENTATION_SPEC_TOOL` definition to `app/src/mcp/tools.ts`
- Implement `executeValidateImplementationSpec()` in `app/src/mcp/tools.ts`
- Register tool in `app/src/mcp/server.ts`
- Write integration tests in `app/tests/mcp/spec-validation.test.ts`
- Run tests and verify real Supabase integration: `cd app && bun test mcp/spec-validation`

### Integration & Testing
- Update `getToolDefinitions()` in `app/src/mcp/tools.ts` to export new tools
- Update `handleToolCall()` dispatcher in `app/src/mcp/tools.ts`
- Ensure SDK content block response format for both tools
- Add error handling and graceful degradation for GitHub API
- Add logging for analysis metrics (use process.stdout.write)
- Run full MCP test suite: `cd app && bun test mcp`
- Run full test suite: `cd app && bun test`
- Manual dogfooding: index KotaDB and test tools on real feature plan

### Documentation Updates
- Update `README.md` with new tool descriptions and examples
- Update `.claude/commands/docs/mcp-integration.md` with tool documentation
- Create `docs/examples/impact-analysis-example.md` with full scenario
- Create `docs/examples/spec-validation-example.md` with full scenario
- Update `.claude/commands/docs/conditional_docs/app.md` if needed (add new docs)

### Validation & Cleanup
- Run validation commands (Level 2 as minimum):
  - `cd app && bun run lint`
  - `cd app && bunx tsc --noEmit`
  - `cd app && bun test --filter integration`
  - `cd app && bun test`
  - `cd app && bun run build` (if build script exists)
- Verify migration sync: `cd app && bun run test:validate-migrations`
- Check logging standards (no console.*, use process.stdout.write/process.stderr.write)
- Verify antimocking compliance (all tests use real Supabase Local)
- Review all commits for conventional format: `feat(mcp): add analyze_change_impact tool`
- Ensure all files use TypeScript path aliases (@api/*, @mcp/*, etc.)

### Final Push & PR Preparation
- Ensure working directory is clean: `git status`
- Push branch with tracking: `git push -u origin feat/400-structured-impact-analysis-mcp-tools`
- Verify remote branch exists: `git branch -r | grep 400`
- Prepare PR description with:
  - Summary of both tools and their purpose
  - JSON schema examples for inputs/outputs
  - Usage examples (TypeScript and Python)
  - Testing evidence (real Supabase integration, fixture scenarios)
  - Relationship documentation (issue #116, #369, #217, #355)

## Risks & Mitigations

### Risk: GitHub API rate limiting
**Mitigation**:
- Implement graceful degradation (skip conflict detection if no token)
- Add caching for PR/branch queries (in-memory, 5-minute TTL)
- Document rate limit implications in tool descriptions
- Provide fallback behavior when API unavailable

### Risk: Performance with large repositories (>10k files)
**Mitigation**:
- Add depth limits for dependency traversal (max depth=5)
- Implement early termination for dependency queries (max 1000 files)
- Add response time logging and monitoring
- Document performance characteristics in tool descriptions
- Add timeout configuration (default 30s per tool call)

### Risk: Stale indexed data (repository changed since last index)
**Mitigation**:
- Return last_indexed_at timestamp in responses
- Add warning when data is >24h old
- Document recommendation to re-index before analysis
- Provide index age in impact analysis summary

### Risk: Schema drift between tools and consumers
**Mitigation**:
- Use Zod schemas for input validation (runtime type checking)
- Version tool schemas explicitly (include in tool metadata)
- Document breaking change policy (new tools for breaking changes)
- Add schema validation tests with multiple example inputs

### Risk: Complexity of architectural pattern detection
**Mitigation**:
- Start with simple pattern matching (search for similar imports)
- Document pattern detection limitations in tool descriptions
- Plan for enhancement in Phase 2 (AST-based analysis)
- Provide confidence scores for pattern matches

## Validation Strategy

### Automated Tests (Integration/E2E hitting Supabase per /anti-mock)

#### Impact Analysis Tests
- **Single file modification**: Modify one file, verify direct dependents found
- **Multiple file modifications**: Modify 3+ files, verify aggregated impact
- **Breaking changes scenario**: Set breaking_changes flag, verify warnings
- **Database migration scenario**: Include migration, verify architectural warnings
- **Circular dependency detection**: Use fixture with circular deps, verify cycles reported
- **GitHub API integration**: Mock API responses, verify conflict detection
- **Graceful degradation**: Remove GitHub token, verify tool still works (skip conflicts)
- **Test scope calculation**: Verify test files identified for modified source files
- **Risk level scoring**: Verify risk levels (low/medium/high) based on impact breadth

#### Spec Validation Tests
- **Valid spec**: All conventions followed, expect valid=true
- **Invalid migration naming**: Use wrong format, expect naming error
- **File conflicts**: Files exist in other branches, expect conflict error
- **Path alias violations**: Use relative paths, expect path alias error
- **Missing test coverage**: Implementation without tests, expect coverage warning
- **Breaking changes**: Set flag, expect architectural warnings
- **Dependency compatibility**: Invalid dependencies, expect compatibility error
- **Approval conditions**: Verify checklist generated correctly

#### MCP SDK Compliance Tests
- **Content block format**: Verify responses wrapped in SDK content blocks
- **Error handling**: Verify error codes (-32603 for tool errors)
- **JSON schema validation**: Use Zod to validate inputs/outputs
- **Parameter validation**: Missing required params, invalid types, etc.

### Manual Checks (Document data seeded and failure scenarios exercised)

#### Dogfooding on KotaDB Repository
1. Index KotaDB repository itself (local path or clone)
2. Plan a real feature (e.g., "Add OAuth provider support")
3. Call `analyze_change_impact` with structured spec:
   - files_to_modify: ["app/src/auth/middleware.ts"]
   - files_to_create: ["app/src/auth/providers/google.ts"]
   - change_type: "refactor"
   - description: "Add Google OAuth provider"
4. Verify response includes:
   - Direct dependents (files importing middleware.ts)
   - Indirect dependents (transitive dependencies)
   - Test scope (test files for auth module)
   - Architectural warnings (migration needed for oauth_providers table)
   - Conflict detection (check against open PRs)
   - Risk level (medium/high based on impact)
5. Call `validate_implementation_spec` with test spec:
   - feature_name: "Google OAuth Provider"
   - files_to_create: ["app/src/auth/providers/google.ts"]
   - migrations: ["20251108120000_add_oauth_provider_types.sql"]
   - dependencies_to_add: ["@auth/google"]
6. Verify validation results:
   - File conflict checks pass (files don't exist)
   - Migration naming validation passes (correct format)
   - Path alias validation passes (uses @auth/*)
   - Test coverage warnings (need test file)
   - Approval conditions generated (checklist)

#### Failure Scenarios
- **Stale data**: Index old commit, plan change, verify staleness warning
- **No GitHub token**: Remove token, verify graceful degradation
- **Invalid spec**: Submit malformed JSON, verify error handling
- **Large repository**: Index repo with >5k files, verify performance <2s
- **API timeout**: Simulate GitHub API timeout, verify fallback

### Release Guardrails (Monitoring, alerting, rollback) with real-service evidence

#### Monitoring
- Log impact analysis metrics to stdout:
  - Dependency counts (direct/indirect)
  - Test scope size
  - Risk level calculated
  - GitHub API call latency
  - Total tool execution time
- Add performance logging for slow queries (>1s warning threshold)
- Track tool call frequency and error rates

#### Alerting
- GitHub API rate limit approaching (warn at 80% of limit)
- Tool execution timeout (>30s)
- High error rate (>5% of calls fail)
- Supabase query performance degradation (>2s average)

#### Rollback Plan
- Feature flag approach: add `ENABLE_IMPACT_ANALYSIS_TOOLS` env var
- Default to disabled in production until validated
- Document rollback procedure in PR description:
  - Disable tools via feature flag
  - Remove tool registrations from server.ts
  - Revert database queries if needed (though no schema changes)

#### Production Deployment Checklist
- [ ] Verify GitHub token configured (or graceful degradation enabled)
- [ ] Test with production-sized repository (>10k files)
- [ ] Validate response times <2s for typical repositories
- [ ] Monitor error rates for first 24h after deployment
- [ ] Document known limitations and edge cases
- [ ] Prepare rollback plan and communicate to team

## Validation Commands

Level 2 validation (minimum required):
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
cd app && bun test --filter integration
cd app && bun test
cd app && bun run build
```

Domain-specific checks:
```bash
# Migration sync validation
cd app && bun run test:validate-migrations

# Logging standards validation
cd app && bun run lint  # Includes console.* detection

# MCP-specific tests
cd app && bun test mcp/impact-analysis
cd app && bun test mcp/spec-validation

# Manual dogfooding (requires local Supabase running)
cd app && ./scripts/dev-start.sh
# Then test tools via MCP client or curl
```

## Commit Message Validation

All commits must follow Conventional Commits format:
- Valid types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, `style`
- Scope recommended: `feat(mcp): add analyze_change_impact tool`
- Avoid meta-commentary: "based on", "this commit", "i can see", "looking at"
- Use direct statements: `feat(mcp): add impact analysis with dependency aggregation`

Examples:
- ✅ `feat(mcp): add analyze_change_impact tool for structured planning`
- ✅ `feat(mcp): add validate_implementation_spec tool with naming validation`
- ✅ `test(mcp): add integration tests for impact analysis scenarios`
- ✅ `docs: update MCP integration guide with new tools`
- ❌ `Based on the plan, this commit adds impact analysis tool`
- ❌ `Looking at the code, I can see we need to add validation`

## Report

This plan provides a comprehensive roadmap for implementing two new MCP tools that transform KotaDB from a passive code index into an active planning partner for AI agents. The tools leverage existing infrastructure (dependency graphs, indexed metadata) while adding new capabilities (GitHub integration, architectural pattern detection, spec validation).

Key success metrics:
- Both tools callable via MCP with structured JSON I/O
- Impact analysis returns actionable insights (test scope, risk level, conflicts)
- Spec validation catches naming violations and file conflicts before implementation
- All tests use real Supabase Local (antimocking compliance)
- Response times <2s for typical repositories (<10k files)
- Graceful degradation when GitHub API unavailable
- Documentation includes TypeScript and Python usage examples

This feature directly supports issue #355 (production MVP launch) by enhancing agent capabilities and reducing failed ADW runs through proactive planning and validation.
