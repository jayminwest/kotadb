# Chore Plan: Audit and Implement Sentry/Structured Logging

## Context

Following the implementation of Sentry error tracking (#410) and structured logging (#436), we have comprehensive observability infrastructure but **97% of try-catch blocks** (57 out of 59) don't capture errors to Sentry. This means production errors are invisible in our monitoring dashboard despite having the tools to track them.

**Current Infrastructure:**
- ✅ Sentry SDK initialized (`app/src/instrument.ts`)
- ✅ Structured logger with JSON format, masking, correlation IDs (`app/src/logging/logger.ts`)
- ❌ Only 2 Sentry.captureException calls (both in `index.ts` global handlers)
- ❌ 59 try-catch blocks across codebase without Sentry integration
- ❌ Only 6 out of 50 files in `app/src/` import observability tools

**Why This Matters:**
- Production errors invisible in Sentry dashboard
- No stack traces or context for debugging failures
- Missing correlation between errors and logs
- Reduced visibility into GitHub integration failures, indexer errors, API issues

**Constraints:**
- Must not break existing test suite (antimocking philosophy requires real database connections)
- Pre-commit hooks enforce logging standards (no `console.*` usage)
- Some low-level modules may retain `process.stdout.write()` for performance

## Relevant Files

### Reference Implementations (Already Using Observability)
- `app/src/instrument.ts` — Sentry SDK initialization, environment-based sampling
- `app/src/logging/logger.ts` — Structured logger with masking, correlation IDs
- `app/src/index.ts:116,121` — Global error handlers with Sentry.captureException
- `app/src/auth/middleware.ts` — Auth middleware with logger instance
- `app/src/queue/client.ts` — Queue client with logger
- `app/src/queue/workers/index-repo.ts` — Index worker with logger
- `app/src/logging/middleware.ts` — HTTP request logging middleware

### High Priority - User-Facing & External Integrations (10 files)

**GitHub Integration** (6 files):
- `app/src/github/webhook-handler.ts` — Webhook signature verification (has try-catch)
- `app/src/github/webhook-processor.ts` — Processes push events for repo indexing
- `app/src/github/installation-lookup.ts` — Queries GitHub App installations
- `app/src/github/client.ts` — Octokit HTTP client wrapper
- `app/src/github/app-auth.ts` — Creates GitHub App auth clients
- `app/src/github/types.ts` — Type definitions only (skip)

**API Endpoints** (4 files):
- `app/src/api/stripe.ts` — Stripe API calls, subscription management
- `app/src/api/webhooks.ts` — Stripe webhook signature verification
- `app/src/api/queries.ts` — Database query helpers for indexing
- `app/src/api/routes.ts` — Main Express app (already has Sentry middleware, add logger to handlers)

### Medium Priority - Core Business Logic (18 files)

**Indexer** (11 files):
- `app/src/indexer/ast-parser.ts` — TypeScript/JavaScript AST parsing
- `app/src/indexer/parsers.ts` — File discovery and parser registry
- `app/src/indexer/dependency-extractor.ts` — Import/export analysis
- `app/src/indexer/symbol-extractor.ts` — Function/class/variable extraction
- `app/src/indexer/reference-extractor.ts` — Symbol reference tracking
- `app/src/indexer/import-resolver.ts` — Module path resolution
- `app/src/indexer/storage.ts` — Database persistence for indexed data
- `app/src/indexer/repos.ts` — Repository cloning and management
- `app/src/indexer/extractors.ts` — Content extraction by file type
- `app/src/indexer/circular-detector.ts` — Circular dependency detection
- `app/src/indexer/ast-types.ts` — Type definitions only (skip)

**Auth** (4 files):
- `app/src/auth/keys.ts` — API key generation with collision retry logic
- `app/src/auth/cache.ts` — API key caching layer
- `app/src/auth/rate-limit.ts` — Rate limit enforcement via RLS functions
- `app/src/auth/validator.ts` — API key validation with bcrypt

**Queue & Database** (2 files):
- `app/src/queue/job-tracker.ts` — Job state tracking for indexing runs
- `app/src/db/client.ts` — Supabase client initialization

### Low Priority - Infrastructure & Types (10 files)

**MCP Server** (9 files - internal tooling):
- `app/src/mcp/server.ts` — Model Context Protocol server for Claude Code
- `app/src/mcp/tools.ts` — Tool definitions (search, index, dependencies)
- `app/src/mcp/github-integration.ts` — GitHub API integration for MCP tools
- `app/src/mcp/spec-validation.ts` — Implementation spec validation
- `app/src/mcp/impact-analysis.ts` — Change impact analysis
- `app/src/mcp/lifecycle.ts` — Server lifecycle management
- `app/src/mcp/session.ts` — Session management
- `app/src/mcp/headers.ts` — Header utilities
- `app/src/mcp/jsonrpc.ts` — JSON-RPC protocol handling

**Validation & Configuration** (4 files):
- `app/src/validation/schemas.ts` — Zod schema validation
- `app/src/validation/common-schemas.ts` — Shared validation schemas
- `app/src/types/index.ts` — Shared type definitions
- `app/src/queue/config.ts` — Queue configuration

### New Files
None - this is a refactoring chore to integrate existing infrastructure

## Work Items

### Preparation
1. Verify current observability infrastructure is working
   - Check Sentry dashboard for test errors (should see global handler errors)
   - Review structured log output format in development
   - Confirm pre-commit hooks enforce logging standards
2. Create git branch: `chore/440-sentry-logging-audit`
3. Identify all try-catch blocks requiring integration (grep search validation)
4. Review reference implementations for consistent patterns

### Execution

**Phase 1: High Priority Files (User-Facing & External Integrations)**
1. GitHub Integration (6 files)
   - Add imports: `import { Sentry } from "@/instrument.js"` and `import { createLogger } from "@/logging/logger.js"`
   - Create module-level logger with context: `const logger = createLogger({ module: "github-webhook-handler" })`
   - Wrap or enhance existing try-catch blocks with `Sentry.captureException(error)` and structured logging
   - Add contextual info to errors (repo names, installation IDs, webhook event types)
2. API Endpoints (4 files)
   - Same pattern: imports, logger creation, error capture in try-catch blocks
   - Ensure sensitive data (Stripe secrets, API keys) is masked via logger's built-in masking
   - Add request_id correlation to Sentry tags where available

**Phase 2: Medium Priority Files (Core Business Logic)**
3. Indexer (11 files)
   - Focus on error-prone operations: file I/O, AST parsing, database writes
   - Add structured logging for important events (parse start/end, dependency graph size)
   - Capture exceptions during file discovery, parsing failures, storage errors
4. Auth (4 files)
   - Critical for security: capture key generation failures, validation errors
   - Log rate limit hits (info level), log validation failures (warn level)
   - Capture bcrypt errors, cache connection issues
5. Queue & Database (2 files)
   - Job state transitions should be logged
   - Database connection errors should be captured to Sentry
   - Add context: job IDs, repository IDs, queue names

**Phase 3: Low Priority Files (Infrastructure & Internal Tooling)**
6. MCP Server (9 files)
   - Internal tooling for Claude Code integration
   - Lower frequency of errors, less critical for production
   - Apply same pattern but defer if time-constrained
7. Validation & Configuration (4 files)
   - Add error capture for schema validation failures
   - Configuration errors should be visible in Sentry

### Follow-up
1. Run full validation suite (see Validation Commands section)
2. Review Sentry dashboard for new error captures with proper context
3. Check structured logs for proper JSON formatting and correlation IDs
4. Verify sensitive data is masked in both logs and Sentry
5. Update `.claude/commands/docs/conditional_docs/app.md` to reference this spec when observability questions arise
6. Push branch for PR creation: `git push -u origin chore/440-sentry-logging-audit`

## Step by Step Tasks

### Preparation
- Create branch `chore/440-sentry-logging-audit` from `develop`
- Verify Sentry SDK and logger infrastructure is operational
- Run `grep -r "try {" app/src --include="*.ts" -c` to count try-catch blocks requiring audit

### Phase 1: High Priority Files
- Integrate Sentry and logger into `app/src/github/webhook-handler.ts`
- Integrate Sentry and logger into `app/src/github/webhook-processor.ts`
- Integrate Sentry and logger into `app/src/github/installation-lookup.ts`
- Integrate Sentry and logger into `app/src/github/client.ts`
- Integrate Sentry and logger into `app/src/github/app-auth.ts`
- Integrate Sentry and logger into `app/src/api/stripe.ts`
- Integrate Sentry and logger into `app/src/api/webhooks.ts`
- Integrate Sentry and logger into `app/src/api/queries.ts`
- Integrate Sentry and logger into `app/src/api/routes.ts`
- Run tests for GitHub and API modules: `cd app && bun test tests/github tests/api`

### Phase 2: Medium Priority Files
- Integrate Sentry and logger into all 11 indexer files (`app/src/indexer/*.ts`)
- Run indexer tests: `cd app && bun test tests/indexer`
- Integrate Sentry and logger into all 4 auth files (`app/src/auth/*.ts`)
- Run auth tests: `cd app && bun test tests/auth`
- Integrate Sentry and logger into `app/src/queue/job-tracker.ts`
- Integrate Sentry and logger into `app/src/db/client.ts`
- Run queue tests: `cd app && bun test tests/queue`

### Phase 3: Low Priority Files
- Integrate Sentry and logger into all 9 MCP server files (`app/src/mcp/*.ts`)
- Run MCP tests: `cd app && bun test tests/mcp`
- Integrate Sentry and logger into validation files (`app/src/validation/*.ts`)

### Final Validation
- Run full test suite: `cd app && bun test`
- Run typecheck: `cd app && bunx tsc --noEmit`
- Run linter: `cd app && bun run lint`
- Verify pre-commit hooks pass: `cd app && pre-commit run --all-files`
- Manually review Sentry dashboard for test errors with proper context
- Review log output for proper JSON formatting
- Push branch: `git push -u origin chore/440-sentry-logging-audit`

## Risks

| Risk | Mitigation |
|------|------------|
| Breaking existing tests | Run test suite after each phase; tests use antimocking so real errors will surface |
| Over-logging sensitive data | Logger has built-in masking for API keys, tokens, passwords; Sentry beforeSend hook redacts auth headers |
| Performance impact from logging | Structured logger is lightweight; Sentry sampling at 10% in production (100% in dev) |
| Inconsistent patterns across files | Use reference implementations (`index.ts:116,121`, `auth/middleware.ts`) as templates |
| Missing some try-catch blocks | Use grep to validate coverage: `grep -r "try {" app/src --include="*.ts"` and cross-reference with `grep -r "Sentry.captureException" app/src --include="*.ts"` |

## Validation Commands

```bash
# Core validation (always run)
cd app && bun test
cd app && bunx tsc --noEmit
cd app && bun run lint
cd app && pre-commit run --all-files

# Verify no prohibited logging patterns
cd app && grep -r "console\." src --include="*.ts" && echo "FAIL: console.* found" || echo "PASS: No console.* usage"

# Count Sentry integration coverage
cd app && echo "Sentry.captureException calls:" && grep -r "Sentry\.captureException" src --include="*.ts" -c | awk -F: '{sum+=$2} END {print sum " calls"}'

# Count structured logger usage
cd app && echo "Files with createLogger:" && grep -r "createLogger" src --include="*.ts" | wc -l

# Validate migration sync (if database schema touched)
cd app && bun run test:validate-migrations

# Build check
cd app && bun run build
```

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(observability): integrate Sentry into GitHub webhook handlers` not `Based on the plan, the commit should integrate Sentry`

## Deliverables

### Code Changes
- 44 TypeScript files updated with Sentry and structured logger integration
- All try-catch blocks capture errors to Sentry with context
- Error-prone modules log important events with correlation IDs
- Sensitive data masked in both logs and Sentry

### Validation Proof
- Full test suite passing (all existing tests green)
- No regressions in functionality
- Pre-commit hooks passing (enforces no `console.*` usage)
- Sentry dashboard showing errors with proper context and tags
- Structured logs showing JSON format with correlation IDs

### Documentation Updates
- Update `.claude/commands/docs/conditional_docs/app.md` with condition:
  ```markdown
  ## Observability Integration
  When implementing error handling or debugging production issues, read:
  - `docs/specs/chore-440-sentry-logging-audit.md` - Sentry and structured logging patterns across codebase
  ```
