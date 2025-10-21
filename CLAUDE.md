# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KotaDB is a lightweight HTTP API service for indexing and searching code repositories. It's built with Bun + TypeScript and uses Supabase (PostgreSQL) for storage with Row Level Security (RLS) for multi-tenant data isolation. The project is designed to power AI developer workflows through automated code intelligence.

## Development Commands

All commands should be run from the `app/` directory.

### Quick Start (Recommended)
```bash
cd app && ./scripts/dev-start.sh            # Start Supabase + API server
cd app && ./scripts/dev-start.sh --web      # Start Supabase + API + web app
cd app && ./scripts/dev-start.sh --mcp-start --adws-mcp-start  # Include MCP servers
```

The `dev-start.sh` script automates:
- Supabase container lifecycle (stop existing, start fresh)
- `.env` file generation with correct Supabase credentials
- Dependency installation (if `node_modules/` missing)
- API server startup with health check validation
- Optional web app startup (`--web` flag)
- Optional MCP server startup (`--mcp-start` flag)
- Optional ADW MCP server startup (`--adws-mcp-start` flag)
- Graceful cleanup on Ctrl+C (kills all background processes)

Press Ctrl+C to stop all services.

### Manual Server Startup
```bash
cd app && bun run src/index.ts              # Start server (default port 3000)
cd app && PORT=4000 bun run src/index.ts    # Start with custom port
cd app && bun --watch src/index.ts          # Watch mode for development
```

### Testing and type-checking
```bash
cd app && bun test                          # Run test suite
DEBUG=1 cd app && bun test                  # Verbose test output (auth logs, setup details)
cd app && bunx tsc --noEmit                # Type-check without emitting files
cd app && bun run test:validate-migrations # Validate migration sync (see below)
cd app && bun run test:validate-env        # Detect hardcoded environment URLs in tests
```

**IMPORTANT: Migration Sync Requirement**
- Database migrations exist in **two locations**: `app/src/db/migrations/` (source) and `app/supabase/migrations/` (copy for Supabase CLI)
- When adding or modifying migrations in `app/src/db/migrations/`, you **must** also update `app/supabase/migrations/`
- Run `cd app && bun run test:validate-migrations` to check for drift between directories
- Keep both directories synchronized to prevent test environment divergence from production schema
./scripts/setup-test-db.sh       # Start Supabase Local test database
./scripts/reset-test-db.sh       # Reset test database to clean state
```

**Testing Philosophy:** KotaDB follows an **antimocking philosophy**. All tests use real Supabase Local database connections instead of mocks for production parity. See `docs/testing-setup.md` for detailed configuration.

### Pre-commit Hooks
Pre-commit hooks automatically run type-check and lint on staged files to prevent TypeScript errors and lint issues from reaching CI.

**Installation:**
```bash
cd app && bun install                   # Automatically installs hooks via prepare script
```

**Execution:**
- Hooks run automatically on `git commit` for changes in `app/` or `shared/` directories
- Type-check: Runs `bunx tsc --noEmit` in changed directories
- Lint: Runs `bun run lint` in `app/` if app files changed
- Skips checks if no relevant files changed (fast commits for docs, config, etc.)

**Bypass (emergency only):**
```bash
git commit --no-verify -m "emergency: bypass hooks"    # Skip all pre-commit checks
```

**Troubleshooting:**
- Hook fails with "command not found": Ensure `bun` is installed globally
- Hook takes too long: Consider using `lint-staged` for incremental checks (already configured in `app/.lintstagedrc.json`)
- Hook fails on valid code: Run `cd app && bunx tsc --noEmit` manually to debug
- Disable hooks temporarily: `git config core.hooksPath /dev/null` (restore with `git config core.hooksPath .husky`)

### Docker
```bash
docker compose up dev   # Run in development container (builds from app/ directory)
```

Note: The Docker build context for application services (`dev`, `home`) is set to the `app/` directory.

## Architecture

### Path Aliases
The project uses TypeScript path aliases defined in `app/tsconfig.json`:
- `@api/*` → `src/api/*`
- `@auth/*` → `src/auth/*`
- `@db/*` → `src/db/*`
- `@indexer/*` → `src/indexer/*`
- `@shared/*` → `../shared/*` (shared types for monorepo)
- `@mcp/*` → `src/mcp/*`
- `@validation/*` → `src/validation/*`
- `@queue/*` → `src/queue/*`

Always use these aliases for imports, not relative paths. All paths are relative to the `app/` directory.

### Shared Types Infrastructure
The `shared/` directory at repository root contains TypeScript types shared across all projects in the monorepo (backend, frontend, CLI tools). This provides a single source of truth for API contracts, database entities, and authentication types.

**When to use `@shared/types`:**
- API request/response types (e.g., `IndexRequest`, `SearchResponse`)
- Database entity types (e.g., `Repository`, `IndexedFile`, `Symbol`)
- Authentication types (e.g., `AuthContext`, `Tier`, `ApiKey`)
- Rate limiting types (e.g., `RateLimitResult`, `RateLimitHeaders`)
- Validation types (e.g., `ValidationRequest`, `ValidationResponse`)

**When to keep types in `app/src/types`:**
- Application-specific types (e.g., `ApiContext` with Supabase client)
- Internal implementation details not exposed via API
- Types that depend on app-specific runtime globals (e.g., Bun's `Request` type)

**Import examples:**
```typescript
// Import shared types for API contracts
import type { IndexRequest, SearchResponse } from "@shared/types";
import type { AuthContext, Tier } from "@shared/types/auth";
import type { Repository, IndexedFile } from "@shared/types/entities";

// Import app-specific types
import type { ApiContext } from "@shared/index";
```

**Breaking changes:**
When modifying shared types, use TypeScript compiler errors to identify all affected consumers and update them in the same PR. Shared types follow semantic versioning (breaking changes require major version bump in `shared/package.json`).

### Core Components

All application code is located in the `app/` directory.

**Entry Point (app/src/index.ts)**
- Bootstraps the HTTP server using Express (runs on Bun runtime)
- Initializes Supabase client and verifies database connection
- Creates Express app and starts listening on configured port
- Handles graceful shutdown via SIGTERM

**API Layer (app/src/api/)**
- `routes.ts`: Express app factory with middleware and route handlers
  - Body parser middleware for JSON requests
  - Authentication middleware (converts Express→Bun Request for existing auth logic)
  - REST endpoints: `/health`, `/index`, `/search`, `/files/recent`, `/validate-output`
  - MCP endpoint: `/mcp` (POST only, using SDK StreamableHTTPServerTransport)
- `queries.ts`: Database query functions for indexed files and search

**Authentication & Rate Limiting (app/src/auth/)**
- `middleware.ts`: Authentication middleware and rate limit enforcement
- `validator.ts`: API key validation and tier extraction
- `keys.ts`: API key generation with bcrypt hashing
- `rate-limit.ts`: Tier-based rate limiting logic (free=100/hr, solo=1000/hr, team=10000/hr)
- `context.ts`: Auth context passed to handlers (includes user, tier, rate limit status)
- `cache.ts`: In-memory caching for API key lookups (reduces database load)

**Database (app/src/db/)**
- `client.ts`: Supabase client initialization (service role and anon clients)
- Tables: 10 tables including `api_keys`, `organizations`, `repositories`, `index_jobs`, `indexed_files`, `symbols`, `references`, `dependencies`, etc.
- Connection: Configured via `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `SUPABASE_ANON_KEY` environment variables
- RLS enabled for multi-tenant data isolation with user-scoped and organization-scoped policies
- **Supabase Local Port Architecture** (for testing):
  - Port 5434: PostgreSQL (migrations, seed scripts, psql)
  - Port 54322: PostgREST API (raw HTTP access)
  - Port 54325: GoTrue auth service
  - Port 54326: Kong gateway (Supabase JS client - **use this for tests**)

**Indexer (app/src/indexer/)**
- `repos.ts`: Git repository management (clone, fetch, checkout)
  - Clones repositories to `data/workspace/` directory
  - Supports local paths or auto-cloning from GitHub (or custom git base via `KOTA_GIT_BASE_URL`)
  - Handles ref/branch resolution with fallback to default branch (main/master)
- `parsers.ts`: File discovery and parsing
  - Supported: `.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, `.json`
  - Ignores: `.git`, `node_modules`, `dist`, `build`, `out`, `coverage`
- `extractors.ts`: Dependency extraction and snippet generation

**MCP (Model Context Protocol) Integration (app/src/mcp/)**
- `server.ts`: MCP server factory using official `@modelcontextprotocol/sdk` (v1.20+)
  - Creates per-request Server instances for user isolation (stateless mode)
  - Registers four tools: `search_code`, `index_repository`, `list_recent_files`, `search_dependencies`
  - Uses `StreamableHTTPServerTransport` with `enableJsonResponse: true` for simple JSON-RPC over HTTP
  - No SSE streaming or session management (stateless design)
- `tools.ts`: Tool execution logic and parameter validation
  - Reused by SDK server handlers
  - Type guards for parameter validation
  - Returns JSON results wrapped in SDK content blocks
  - `search_dependencies` tool: Query dependency graph for impact analysis
    - Supports three search directions: dependents (reverse lookup), dependencies (forward lookup), both
    - Recursive traversal with configurable depth (1-5)
    - Detects circular dependencies during graph traversal
    - Optional test file filtering via `include_tests` parameter
- Integration with Express:
  - SDK requires Node.js HTTP primitives (`IncomingMessage`, `ServerResponse`)
  - Express provides Node-compatible interfaces running on Bun runtime
  - Per-request server creation ensures user context isolation
  - Rate limit headers set before SDK transport handles request

**MCP SDK Behavior Notes (app/src/mcp/):**
- **Content Block Response Format**: Tool results are wrapped in content blocks by the SDK
  - Server returns: `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
  - Tests must extract results from `response.result.content[0].text` and parse JSON
  - Use `extractToolResult()` helper from `app/tests/helpers/mcp.ts` for consistent extraction
- **Error Code Mapping**: SDK error handling differs from custom implementations
  - `-32700` (Parse Error): Invalid JSON or malformed JSON-RPC structure (returns HTTP 400)
  - `-32601` (Method Not Found): Unknown JSON-RPC method (returns HTTP 200)
  - `-32603` (Internal Error): Tool execution errors, validation failures, type errors (returns HTTP 200)
  - SDK uses `-32603` for all tool-level errors (missing params, invalid types, unknown tools)
  - SDK does NOT use `-32602` (Invalid Params) for tool validation (only for JSON-RPC structure)
- **HTTP Status Codes**: SDK returns 400 for parse/structural errors, 200 for method-level errors
- **Header Validation**: DNS rebinding protection disabled by default in `StreamableHTTPServerTransport`
  - SDK does NOT enforce `Origin` or `MCP-Protocol-Version` headers unless explicitly configured
  - Production deployments can enable via `allowedOrigins` transport option if needed
- **Test Writing Guidelines**: When writing MCP tests
  - Always use `extractToolResult(data)` helper to parse tool responses
  - Expect `-32603` for tool-level validation errors (not `-32602`)
  - Expect HTTP 400 for parse errors and invalid JSON-RPC (not HTTP 200)
  - Do not test header enforcement unless DNS rebinding protection is enabled
- **MCP Regression Testing** (issue #68, 9 test files, 100+ test cases):
  - Comprehensive test coverage: lifecycle, errors, authentication, tool validation, integration, concurrency
  - Test helpers: `sendMcpRequest()`, `extractToolResult()`, `assertToolResult()`, `assertJsonRpcError()`
  - Test fixtures: `app/tests/fixtures/mcp/sample-repository/` for integration testing
  - Claude Code integration guide: `docs/guides/mcp-claude-code-integration.md`
  - See `docs/testing-setup.md` "MCP Testing" section for complete testing guide

**Validation (app/src/validation/)**
- `schemas.ts`: Core validation logic using Zod for command output validation
  - Converts JSON schema objects to Zod schemas
  - Validates strings (with pattern/length constraints), numbers, booleans, arrays, objects
  - Returns structured validation errors with path and message
- `types.ts`: TypeScript types for validation API (ValidationRequest, ValidationResponse, ValidationError)
- `common-schemas.ts`: Reusable schema helpers for common patterns
  - `FilePathOutput(extension?)`: Validates relative file paths (no leading slash)
  - `JSONBlockOutput(schema)`: Validates JSON structure (with markdown extraction)
  - `MarkdownSectionOutput(sections)`: Validates markdown with required sections
  - `PlainTextOutput(options)`: Validates plain text with length/format constraints
- Integration with Express:
  - POST `/validate-output` endpoint validates command outputs against schemas
  - Requires authentication (API key via Bearer token)
  - Rate limiting applied (consumes user's hourly quota)
  - Returns `{valid: true}` or `{valid: false, errors: [{path, message}]}`

**Queue (app/src/queue/)**
- `client.ts`: pg-boss job queue lifecycle management
  - Singleton pattern for queue instance (`getQueue()` accessor)
  - `startQueue()`: Initializes pg-boss with Supabase Postgres connection
  - `stopQueue()`: Graceful shutdown with in-flight job draining
  - `checkQueueHealth()`: Database connectivity verification for monitoring
  - Automatic `pgboss` schema creation on first start (separate from `public` schema)
  - Password redaction in logs for security
- `config.ts`: Queue behavior configuration constants
  - Retry policy: 3 attempts with exponential backoff (60s, 120s, 180s)
  - Job expiration: 24 hours (automatic cleanup of stale jobs)
  - Archive completed jobs after 1 hour
  - Worker concurrency: 3 concurrent workers (for future worker implementation)
- `types.ts`: TypeScript job payload interfaces
  - `IndexRepoJobPayload`: Repository indexing job data (indexJobId, repositoryId, commitSha)
  - `JobResult`: Worker completion result (success, filesProcessed, symbolsExtracted, error)
- Integration with server bootstrap (`app/src/index.ts`):
  - Queue starts after successful database health check
  - SIGTERM handler calls `stopQueue()` before HTTP server shutdown
  - Ensures graceful shutdown drains in-flight jobs before process exit
- Testing philosophy:
  - All tests use real Supabase Local PostgreSQL (no mocks)
  - Tests validate `pgboss` schema creation via `psql` queries
  - Integration tests verify queue persistence across restart cycles

### Workflow

**Authentication & Rate Limiting Flow** (all authenticated endpoints):
1. Request arrives with `Authorization: Bearer <api_key>` header
2. `authenticateRequest()` middleware validates API key and extracts tier
3. `enforceRateLimit()` checks hourly request count via `increment_rate_limit()` DB function
4. If limit exceeded, return 429 with `Retry-After` header
5. If allowed, attach auth context (user, tier, rate limit status) to request
6. Handler executes with rate limit headers injected into response

**POST /index** triggers repository indexing:
- Ensures repository exists in `repositories` table (creates if new)
- Records index job in `index_jobs` table (status: pending → completed/failed/skipped)
- Queues asynchronous indexing via `queueMicrotask()`
- Repository preparation: clones if needed, checks out ref
- File discovery: walks project tree, filters by extension
- Parsing: extracts content and dependencies
- Storage: saves to `indexed_files` table with `UNIQUE (repository_id, path)` constraint

**GET /search** queries indexed files:
- Full-text search on content
- Optional filters: `project` (project_root), `limit`
- Returns results with context snippets

**POST /validate-output** validates command outputs against schemas:
- Accepts JSON payload: `{schema: object, output: string}`
- Schema format: JSON-compatible Zod schema (type, pattern, minLength, maxLength, etc.)
- Returns validation result: `{valid: boolean, errors?: [{path, message}]}`
- Use case: Automation layer validates slash command outputs before parsing
- Command templates include schemas in `## Output Schema` section

**Rate Limit Response Headers** (all authenticated endpoints):
- `X-RateLimit-Limit`: Total requests allowed per hour for the tier
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when the limit resets
- `Retry-After`: Seconds until retry (429 responses only)

### Environment Variables
- `PORT`: Server port (default: 3000)
- `SUPABASE_URL`: Supabase project URL (required)
- `SUPABASE_SERVICE_KEY`: Supabase service role key for admin operations (required)
- `SUPABASE_ANON_KEY`: Supabase anon key for RLS-enforced queries (required)
- `SUPABASE_DB_URL`: Native Postgres connection string for pg-boss job queue (required)
  - Local: `postgresql://postgres:postgres@localhost:5434/postgres`
  - Production: `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
  - Auto-generated by `dev-start.sh` from Docker Compose ports
- `KOTA_GIT_BASE_URL`: Git clone base URL (default: https://github.com)

### AI Developer Workflows (automation/adws/)
Python-based automation pipeline for autonomous GitHub issue workflows:
- **3-Phase Architecture** (as of #136): `adw_plan.py` → `adw_build.py` → `adw_review.py`
  - Plan phase: Issue classification and implementation planning
  - Build phase: Implementation and PR creation
  - Review phase: Automated code review and reporting
- `adw_modules/`: Shared utilities (Claude CLI wrapper, git ops with worktree isolation, GitHub integration, state management)
- `adw_tests/`: Pytest suite for workflow validation
- `trigger_webhook.py`, `trigger_cron.py`: Webhook and polling-based trigger systems

All workflows execute in isolated git worktrees (`trees/`) to prevent conflicts during concurrent agent execution and local development. Worktrees are automatically created before agent execution and cleaned up after successful PR creation (configurable via `ADW_CLEANUP_WORKTREES` environment variable).

**Interactive Worktree Development** (added in PR #157): Use `/spawn_interactive` slash command to create isolated Claude Code development environments for:
- Working on multiple features concurrently without branch switching
- Inspecting ADW-generated code without affecting main working directory
- Testing experimental changes in complete isolation
- See `.claude/commands/worktree/spawn_interactive.md` for detailed usage

**Orchestrator Slash Command** (feature #187): Use `/orchestrator` to automate the full end-to-end issue-to-PR workflow with a single command:
- Automates all 3 phases: plan → build (with PR creation) → review
- Validates issue metadata and dependencies before execution
- Creates isolated worktree with conventional branch naming
- Implements checkpoint-based recovery for failure scenarios
- Supports dry-run validation, cleanup control, and manual resume
- Complements Python ADW layer with manual/interactive execution mode
- See `.claude/commands/workflows/orchestrator.md` for detailed usage

The agentic layer operates on the application layer (in `app/`) to automate development workflows. See `automation/adws/README.md` for complete automation architecture and usage examples.

**Recent Simplification** (PR #136): The ADW system was simplified from a 5-phase to a 3-phase flow by removing broken test/document/patch phases (519 lines deleted). PR creation was moved from plan phase to build phase to ensure PRs only open after successful implementation. Target completion rate: >80%.

**Resilience Architecture** (PR #157, issue #148): Hybrid resilience system with automatic retry logic and checkpoint-based recovery:
- Automatic retry with exponential backoff (1s, 3s, 5s) for transient errors (network issues, API rate limits, timeouts)
- Checkpoint system saves progress at logical breakpoints for resume-after-failure capability
- Retry codes classify error types (CLAUDE_CODE_ERROR, TIMEOUT_ERROR, EXECUTION_ERROR) for targeted recovery
- Checkpoint storage in `agents/{adw_id}/{phase}/checkpoints.json` with atomic writes
- See `automation/adws/README.md` "Resilience & Recovery" section for usage examples

**ADW Observability**:
- `automation/adws/scripts/analyze_logs.py`: Automated log analysis for ADW success rates and failure patterns
  - Parses execution logs from `automation/logs/kota-db-ts/{env}/{adw_id}/adw_sdlc/execution.log`
  - Correlates with agent state from `automation/agents/{adw_id}/adw_state.json`
  - Outputs text, JSON, or markdown reports with success rates, phase funnels, and failure distributions
  - CI integration via `.github/workflows/adw-metrics.yml` (daily analysis with alerting)
  - Key metrics: success rate, phase progression, worktree staleness, failure patterns by phase
  - Usage: `uv run automation/adws/scripts/analyze_logs.py --format json --hours 24`
- **ADW Metrics Analysis Workflow** (`.github/workflows/adw-metrics.yml`):
  - **Schedule**: Runs daily at 00:00 UTC for automated metrics collection
  - **Manual Trigger**: Available via `gh workflow run "ADW Metrics Analysis" --ref main`
  - **Outputs**: JSON metrics artifact + markdown summary in GitHub Step Summary
  - **Alerting**: Creates/updates GitHub issue when success rate < 50%
  - **Critical Threshold**: Workflow fails if success rate < 20%
  - **Artifacts**: 90-day retention for historical tracking
  - **Target Success Rate**: >80% (per 3-phase architecture goals)
  - View runs: `gh run list --workflow="ADW Metrics Analysis" --limit 5`
  - Download metrics: `gh run download <run_id> -n adw-metrics-<run_number>`

### GitHub Issue Management and Relationship Standards

**Issue Prioritization Workflow**:
When working with GitHub issues, both human developers and AI agents follow relationship-aware prioritization standards to ensure efficient dependency management and context discovery.

**Relationship Types** (per issue #151):
- **Depends On**: Issues that MUST be completed before work can start on the current issue
  - Example: Feature #110 depends on #25 (API key generation) being merged first
  - Blocked issues should not be started until dependencies are resolved
- **Related To**: Issues providing context or sharing technical concerns (not strict blockers)
  - Example: Feature #26 (rate limiting) related to #25 (API keys) - both touch auth layer
  - Useful for understanding architectural patterns and design decisions
- **Blocks**: Issues waiting on current work to complete
  - Example: Epic #70 (AST parsing) blocks #74 (symbol extraction) and #116 (dependency search)
  - Helps identify downstream impact and prioritize high-leverage work
- **Supersedes**: Current issue replaces or deprecates previous work
  - Example: Chore #27 (Postgres) supersedes all SQLite-based implementations
  - Indicates architectural shifts or cleanup efforts
- **Child Of**: Current issue is part of larger epic or tracking issue
  - Example: Phase 1 (#110) is child of multi-agent framework epic
  - Connects granular tasks to strategic initiatives
- **Follow-Up**: Planned next steps after current work completes (not blockers)
  - Example: Feature #145 (ADW MCP) has follow-up #148 (hybrid resilience patterns)
  - Captures future work without creating false dependencies

**Documentation Standards**:
- **Spec Files** (`docs/specs/`): All spec files include `## Issue Relationships` section with explicit mappings
- **GitHub Issues**: Relationship metadata documented in issue description via templates
- **Pull Requests**: All PRs reference related issues and dependencies in description
- **Commit Messages**: Footer metadata for dependencies: `Depends-On: #XXX`, `Related-To: #YYY`

**Prioritization Strategy**:
1. **Fetch all open issues** via `gh issue list` with filters for labels, status, and assignee
2. **Parse relationship metadata** from issue bodies and linked spec files
3. **Build dependency graph** to identify:
   - Unblocked issues (no unresolved dependencies) eligible for immediate work
   - High-leverage issues (blocking multiple downstream tasks)
   - Isolated issues (no dependencies, safe for parallel execution)
4. **Select highest-priority unblocked issue** based on:
   - Labels: `priority:high` > `priority:medium` > `priority:low`
   - Effort: `effort:small` preferred for quick wins
   - Strategic alignment: Issues tied to active epics or OKRs
5. **Verify dependency resolution** before starting work (check if "Depends On" issues are closed/merged)

**AI Agent Context Discovery**:
- ADW workflows automatically fetch related issues before planning implementation
- Agents read spec files for relationship metadata to understand prerequisite work
- Log analysis correlates success rates with dependency chain complexity
- Agents update relationship metadata when discovering new dependencies during implementation

**Benefits**:
- **Reduced Wasted Effort**: Prevents starting work on blocked issues
- **Better Context**: Related issues provide architectural insights and design patterns
- **Improved Traceability**: Clear history of how features evolved across multiple issues
- **Faster Onboarding**: New contributors understand issue context from relationship graph
- **Smarter Automation**: AI agents discover dependencies automatically, reducing planning errors

**Issue Management Slash Commands** (added in PR #166):
- `/issues:prioritize`: Identify highest-priority unblocked work by building dependency graphs and analyzing relationship metadata
- `/issues:audit`: Clean up issue tracker by closing completed, obsolete, duplicate, or stale issues
- See `.claude/commands/docs/issue-relationships.md` for relationship type definitions and documentation standards

See issue #151 for complete documentation standards and implementation details.

### CI/CD Testing Infrastructure
**GitHub Actions Workflows**:
- **Application CI** (`.github/workflows/app-ci.yml`): Tests the TypeScript/Bun application layer
  - **Workflow Structure** (parallelized for ~15s runtime improvement):
    - `setup` job: Installs dependencies, validates migration sync, caches node_modules
    - `typecheck` job: Runs type-checking for shared types and application (depends on setup)
    - `lint` job: Runs ESLint validation (depends on setup)
    - `test` job: Runs full test suite (depends on typecheck and lint)
  - **Caching Strategy**: Uses `actions/cache@v4` with `bun-${{ hashFiles('app/bun.lockb') }}` key for node_modules reuse across parallel jobs
  - Uses Docker Compose with isolated project names for test environment
  - Runs `.github/scripts/setup-supabase-ci.sh` to start containerized Supabase stack
  - Auto-generates `app/.env.test` from Docker Compose container ports for dynamic credentials
  - Executes full test suite (133 tests) against real Supabase stack (PostgreSQL + PostgREST + Kong + Auth)
  - Ensures **exact parity** between local and CI testing environments (antimocking compliance)
  - **Project isolation**: unique project names prevent port conflicts across concurrent CI runs
  - Validates migration sync between `app/src/db/migrations/` and `app/supabase/migrations/` in setup job
  - Teardown via `app/scripts/cleanup-test-containers.sh` in cleanup step (always runs)
  - Migrations applied directly to containerized Postgres via `psql` (bypasses Supabase CLI)
  - **Parallel Execution**: typecheck and lint jobs run concurrently after setup completes, reducing total workflow runtime

- **Automation CI** (`.github/workflows/automation-ci.yml`): Tests the Python automation layer
  - Runs pytest suite (63 tests) for ADW workflow validation
  - Python syntax check on all modules (`adws/adw_modules/*.py`, `adws/adw_phases/*.py`)
  - Uses `uv` package manager with dependency caching for fast builds
  - Configures git identity for worktree isolation tests
  - Path filtering: only runs on changes to `automation/**`
  - Validates automation infrastructure without external service dependencies
  - Target runtime: < 2 minutes for full test suite execution

**Push Trigger Strategy for Feature Branches**:
All CI workflows trigger on both `push` and `pull_request` events to ensure validation regardless of PR creation timing. This prevents PRs from merging without CI validation when commits are pushed before PR creation (common in worktree workflows).

**Supported Branch Patterns** (issue #193):
- `main` - Production branch
- `develop` - Development integration branch
- `feat/**` - Feature branches
- `bug/**` - Bug fix branches
- `chore/**` - Chore branches
- `fix/**` - Alternative fix branch naming
- `refactor/**` - Refactoring branches
- `interactive-*` - Interactive worktree branches (created via `/spawn_interactive`)

**Trigger Behavior**:
- Push to any supported branch triggers CI workflows (filtered by path)
- Pull requests trigger CI workflows for code review validation
- Fork PRs rely on `pull_request` trigger (push triggers may be restricted by GitHub security)
- Path filters limit CI runs to relevant component changes

**Monitoring**:
- Track GitHub Actions minutes consumption via Settings → Billing
- Alert if consumption increases >10% from baseline
- Path filters mitigate unnecessary CI runs

**Test Environment Variable Loading Strategy**:
- **Problem**: CI uses dynamic Docker Compose ports, but tests were hardcoding `localhost:54322`
- **Solution**: Tests automatically load `.env.test` via preload script before running
- **Implementation**:
  - `app/tests/setup.ts`: Preload script that parses `.env.test` and loads into `process.env`
  - `app/package.json`: Test script uses `bun test --preload ./tests/setup.ts`
  - `app/tests/helpers/db.ts`: Reads `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from `process.env` with fallback to defaults
  - All test files removed hardcoded env var assignments (lines like `process.env.SUPABASE_URL = "http://localhost:54322"`)
  - CI workflow: Preload script automatically loads `app/.env.test` (no manual export needed)
  - Local development: Preload script loads `.env.test` automatically, falls back to standard ports if file missing
- **Validation**: Run `cd app && bun run test:validate-env` to detect hardcoded environment variable assignments in tests
- **Result**: Tests automatically respect dynamic ports from `app/.env.test` in both CI and local development
