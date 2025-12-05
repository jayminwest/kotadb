# Conditional Documentation Guide - Application Layer

**Template Category**: Message-Only
**Prompt Level**: 1 (Static)

Use this reference to decide which KotaDB application layer documentation sources to consult before you start working on backend/API features, database schema, testing, or CI infrastructure. Read only the docs whose conditions match your task so you stay efficient.

## Instructions
- Understand the request or issue scope first.
- Scan the Conditional Documentation list below; when a condition applies, open that doc and incorporate the guidance before proceeding.
- Prioritise the most specific documents (specs/vision) after you've covered the foundational repos docs.
- Skip docs that are clearly unrelated—avoid over-reading.

## Conditional Documentation

- .claude/commands/README.md
  - Conditions:
    - When adding new slash commands and determining subdirectory placement
    - When understanding Claude Code slash command discovery and organization
    - When onboarding developers to the command structure after #58 reorganization

- README.md
  - Conditions:
    - When you are new to the repository or need an overview of tooling and workflows
    - When you must run or debug the Bun API service locally
    - When verifying required environment variables or docker commands

- CLAUDE.md
  - Conditions:
    - When needing high-level project overview and navigation to detailed documentation
    - When looking for quick reference commands (dev-start, test, type-check)
    - When verifying critical conventions (path aliases, migration sync, logging standards)
    - When discovering available documentation organized by category
    - When understanding MCP server availability and usage guidance reference

- .claude/commands/app/dev-commands.md
  - Conditions:
    - When starting development environment or troubleshooting dev-start.sh issues
    - When needing manual server startup commands or Docker usage
    - When running tests or type-checking commands
    - When managing test database (setup, reset)

- .claude/commands/app/environment.md
  - Conditions:
    - When configuring environment variables for Supabase or job queue
    - When troubleshooting port configuration or connection issues
    - When understanding auto-generated .env files and their usage
    - When setting up local vs production environment variables

- .claude/commands/app/pre-commit-hooks.md
  - Conditions:
    - When troubleshooting pre-commit hook failures or installation issues
    - When needing to bypass hooks in emergency situations
    - When understanding what hooks validate (logging standards, type safety, lint rules)
    - When hooks fail with "command not found" or take too long

- .claude/commands/docs/architecture.md
  - Conditions:
    - When working with TypeScript path aliases (@api/*, @auth/*, @db/*, etc.)
    - When understanding shared types infrastructure (@shared/types)
    - When learning about core components (API layer, auth, indexer, validation, queue)
    - When needing architectural overview before implementing features

- .claude/commands/docs/database.md
  - Conditions:
    - When working with database schema, tables, or RLS policies
    - When understanding Supabase Local port architecture (5434, 54322, 54325, 54326)
    - When creating or modifying database migrations
    - When troubleshooting migration sync between app/src/db/migrations and app/supabase/migrations
    - When setting up test database or understanding Supabase client initialization

- .claude/commands/docs/mcp-integration.md
  - Conditions:
    - When working with MCP server architecture or tool implementations
    - When understanding MCP SDK behavior (content blocks, error codes, HTTP status codes)
    - When writing MCP tests or troubleshooting MCP tool execution
    - When implementing new MCP tools (search_code, index_repository, list_recent_files, search_dependencies, analyze_change_impact, validate_implementation_spec, create_project, list_projects, get_project, update_project, delete_project, add_repository_to_project, remove_repository_from_project)
    - When debugging SDK error handling or response format issues
    - When working with project management features via MCP (create, list, get, update, delete projects; add/remove repositories)

- .claude/commands/docs/mcp-usage-guidance.md
  - Conditions:
    - When deciding whether to use MCP tools or direct file operations
    - When performing code search, dependency analysis, or issue tracking
    - When understanding performance implications of MCP calls (rate limiting, authentication overhead)
    - When needing decision matrix for task type vs recommended approach
    - When working with kotadb-staging, kotadb-production, playwright, or sequential-thinking MCP servers

- .claude/commands/docs/kotadb-agent-usage.md
  - Conditions:
    - When performing code discovery, dependency analysis, or impact assessment in any workflow command
    - When planning features, bugs, chores, or refactors that require codebase exploration
    - When understanding best practices for using KotaDB MCP tools in agent contexts
    - When needing concrete examples for authentication, indexing, rate limiting, or validation searches
    - When performing pre-implementation dependency checks before modifying shared modules
    - When discovering test scope or analyzing refactor impact with dependency graphs
    - When validating feature specs or large changes using impact analysis tools

- .claude/commands/docs/workflow.md
  - Conditions:
    - When implementing or troubleshooting authentication and rate limiting flow
    - When working with /index endpoint (repository indexing workflow)
    - When working with /search endpoint (code search queries)
    - When working with /validate-output endpoint (schema validation)
    - When understanding rate limit headers and tier-based limits

- .claude/commands/testing/testing-guide.md
  - Conditions:
    - When writing tests and need to understand antimocking philosophy
    - When validating migration sync or dealing with migration drift
    - When understanding test commands and environment setup
    - When working with MCP tests or queue tests
    - When troubleshooting test environment variable loading

- .claude/commands/testing/logging-standards.md
  - Conditions:
    - When implementing logging in TypeScript (app/src/) or Python (automation/adws/)
    - When pre-commit hooks fail due to console.log or print() usage
    - When understanding approved logging methods (process.stdout.write, sys.stdout.write)
    - When configuring Biome or Ruff for logging validation

- .claude/commands/workflows/adw-architecture.md
  - Conditions:
    - When working on ADW (AI Developer Workflows) automation system
    - When understanding 3-phase architecture (plan, build, review)
    - When working with atomic agents or parallel execution infrastructure
    - When troubleshooting resilience patterns (retry logic, checkpoint recovery)
    - When using orchestrator slash command or worktree isolation

- .claude/commands/workflows/adw-observability.md
  - Conditions:
    - When analyzing ADW success rates or failure patterns
    - When running log analysis scripts (analyze_logs.py)
    - When interpreting ADW metrics workflow outputs
    - When troubleshooting ADW metrics alerts or false positives
    - When monitoring daily ADW metrics or downloading historical data

- .claude/commands/ci/ci-configuration.md
  - Conditions:
    - When working with GitHub Actions workflows (app-ci.yml, automation-ci.yml)
    - When troubleshooting CI parallelization, caching strategy, or test environment setup
    - When understanding push trigger strategy for feature branches
    - When debugging test environment variable loading in CI
    - When monitoring CI performance or consumption

- .claude/commands/docs/automated-deployments.md
  - Conditions:
    - When understanding how database migrations are automatically applied via Supabase GitHub App
    - When troubleshooting "Supabase Preview" check failures or migration conflicts
    - When understanding automatic API deployments to Fly.io staging/production
    - When debugging "Fly.io" check failures or deployment issues
    - When needing to override automated deployments for emergency hotfixes
    - When monitoring deployment history or status via GitHub checks
    - When understanding the difference between automated and manual deployment procedures
    - When working with PR preview branches and ephemeral database instances

- app/.dockerignore
  - Conditions:
    - When working on Docker builds, Fly.io deployments, or build optimization
    - When troubleshooting Docker build context size or performance issues
    - When adding new files/directories that should be excluded from production builds

- docs/specs/chore-440-sentry-logging-audit.md
  - Conditions:
    - When implementing error handling or debugging production issues
    - When understanding Sentry and structured logging patterns across codebase
    - When adding new try-catch blocks or error capture logic
    - When troubleshooting observability infrastructure (Sentry, structured logger)
    - When needing reference implementations for error context and correlation IDs

- docs/specs/chore-195-dev-start-script.md
  - Conditions:
    - When troubleshooting development environment setup issues
    - When user asks about starting Supabase, configuring .env, or local development workflow
    - When debugging port conflicts, container lifecycle, or API server health checks
    - When needing to understand automated dev environment script behavior
    - When explaining how to start web app or MCP servers alongside API server

- .claude/commands/workflows/dogfood-prime.md
  - Conditions:
    - When priming KotaDB development environment for local dogfooding and testing
    - When setting up complete workflow: Supabase → API server → test credentials → validation
    - When needing step-by-step guide for first-time environment configuration
    - When preparing testing session for manual API or MCP integration validation
    - When troubleshooting environment setup with detailed diagnostics and expected outputs
    - When generating test API keys and validating core functionality (REST, MCP, rate limiting)
    - When reproducing production-like environment locally for issue investigation
    - When onboarding new developers or agents to local development setup

- docs/supabase-setup.md
  - Conditions:
    - When integrating or troubleshooting Supabase services, keys, or environment variables
    - When running or authoring migrations that interact with Supabase
    - When preparing staging/production infrastructure that depends on Supabase

- docs/deployment/staging-environments.md
  - Conditions:
    - When configuring Vercel preview deployments or staging environment setup
    - When troubleshooting backend URL configuration (NEXT_PUBLIC_API_URL)
    - When understanding staging vs production environment architecture
    - When working with Vercel environment variables or deployment triggers
    - When debugging preview deployment issues or environment parity problems
    - When setting up staging backend (Fly.io) or preview database branches
    - When implementing feature flag or multi-environment testing strategies

- docs/github-app-setup.md
  - Conditions:
    - When working on GitHub App integration features (issues #257, #259, #260)
    - When implementing webhook receivers or GitHub App authentication
    - When configuring GitHub App credentials (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET)
    - When troubleshooting webhook delivery or signature verification issues
    - When setting up development vs production GitHub App environments
    - When implementing installation token generation for private repository access
    - When understanding GitHub App permissions and event subscriptions

- docs/schema.md
  - Conditions:
    - When modifying database schema, migrations, or RLS policies
    - When debugging data flows between API routes and the database
    - When designing new tables, relationships, or rate-limiting behaviour

- docs/specs/feature-26-tier-based-rate-limiting.md
  - Conditions:
    - When working on issue #26 or modifying rate limiting implementation
    - When debugging 429 responses or rate limit header behavior
    - When updating tier limits or rate limiting configuration
    - When troubleshooting rate limit counter accuracy or window reset logic
    - When adding new authenticated endpoints that require rate limiting

- docs/specs/chore-27-standardize-postgres-remove-sqlite.md
  - Conditions:
    - When removing SQLite implementation and migrating to Postgres/Supabase
    - When refactoring database query layer (app/src/api/queries.ts) or bootstrap logic (app/src/index.ts)
    - When working on issue #27 or related database standardization tasks
    - When updating type definitions from SQLite to Supabase schemas

- docs/specs/chore-270-standardize-migration-naming.md
  - Conditions:
    - When creating new database migrations and need to determine correct filename format
    - When working on issue #270 or migration naming standardization
    - When troubleshooting migration sync validation failures (`bun run test:validate-migrations`)
    - When onboarding developers who need to understand migration file naming conventions
    - When experiencing merge conflicts in migration directories during concurrent development
    - When Supabase CLI fails to recognize or apply migrations due to naming issues

- docs/specs/chore-471-open-source-core-fork.md
  - Conditions:
    - When working on billing features or Stripe integration in open source fork
    - When implementing or troubleshooting ENABLE_BILLING feature flag behavior
    - When understanding public vs private repository split and sync strategy
    - When configuring billing endpoints to return 501 when billing disabled
    - When setting up self-hosted deployments without billing features
    - When documenting Stripe integration as educational example code
    - When working with GitHub Actions sync workflow to public repository

- docs/specs/feature-317-dev-session-endpoint.md
  - Conditions:
    - When working on issue #317 or implementing dev-mode authentication for testing
    - When setting up Playwright tests that require authenticated sessions
    - When implementing test infrastructure that needs to bypass GitHub OAuth
    - When troubleshooting dev-session endpoint availability or environment guard logic
    - When creating test accounts programmatically for automated workflows
    - When working with `web/app/auth/dev-session/route.ts` or `web/lib/playwright-helpers.ts`
    - When understanding cookie injection patterns for Supabase SSR authentication
    - When implementing ADW workflows that require authenticated browser sessions

- docs/migration-sqlite-to-supabase.md
  - Conditions:
    - When helping developers upgrade from pre-PR#29 SQLite-based code
    - When resolving merge conflicts related to database layer changes
    - When troubleshooting "module not found: @db/schema" or table name errors
    - When migrating existing test data from SQLite to Supabase

- docs/vision/*.md
  - Conditions:
    - When working on roadmap initiatives tied to long-term product epics
    - When you need to confirm scope against strategic goals or sequencing
    - When preparing discovery or planning work that spans multiple domains

- .claude/commands/docs/vision-update.md
  - Conditions:
    - When synchronizing docs/vision/ directory with recently closed issues and merged PRs
    - When updating epic completion percentages in CURRENT_STATE.md or ROADMAP.md
    - When epic reaches major milestone (25%, 50%, 75%, 100% completion)
    - When MVP blocker is resolved and needs to be removed from documentation
    - When technical decisions deviate from original VISION.md during implementation
    - When conducting quarterly vision document reviews
    - When multiple issues in same epic close and require batch documentation update
    - When needing to maintain consistency across CURRENT_STATE.md, ROADMAP.md, and epic files

- .claude/commands/workflows/roadmap-update.md
  - Conditions:
    - When performing comprehensive ROADMAP.md synchronization (weekly/bi-weekly)
    - When preparing for release and need to validate progress claims
    - When onboarding new developers and roadmap is outdated
    - When multiple epics have significant progress not reflected in roadmap
    - When needing automated validation of epic completion across app/, automation/, web/
    - When investigation report with detailed findings is required
    - When coordinating multiple subagents to check different project areas
    - When updating epic status tables, immediate priorities, and success metrics

- .claude/commands/docs/anti-mock.md
  - Conditions:
    - When planning or implementing changes that add or modify automated tests
    - When touching infrastructure, data access layers, or background jobs where mocks might be tempting
    - When validation requires Supabase or other third-party integrations

- .claude/commands/docs/test-lifecycle.md
  - Conditions:
    - When writing or modifying slash commands that run tests (`bun test`, `bun test --filter integration`)
    - When troubleshooting test failures related to Supabase connection errors
    - When understanding Docker prerequisite checks for test environment setup
    - When implementing validation workflows that execute test suites
    - When debugging commands that hang (pipe operators with bun test)
    - When adding error handling for missing Docker or stopped containers

- docs/testing-setup.md
  - Conditions:
    - When setting up local testing environment with Supabase local instance
    - When troubleshooting test failures related to authentication or database connections
    - When writing new tests in `app/tests/**` that require real Supabase integration
    - When debugging Docker-based test infrastructure or CI test pipeline
    - When onboarding new developers who need to run the test suite locally

- docs/specs/chore-31-replace-test-mocks-supabase-local.md
  - Conditions:
    - When working on issue #31 or related antimocking initiatives
    - When refactoring tests from mocked Supabase clients to real database integration
    - When removing `app/tests/helpers/supabase-mock.ts` or `app/tests/helpers/auth-mock.ts`
    - When implementing test database helpers or seed scripts
    - When troubleshooting authentication test failures in CI/CD pipeline

- docs/specs/chore-33-fix-failing-tests-antimocking.md
  - Conditions:
    - When working on issue #33 or fixing test failures after antimocking migration
    - When debugging port configuration issues (54322 vs 54326)
    - When fixing environment variable initialization order in tests
    - When tests fail with "401 Unauthorized" or "null API key validation"
    - When addressing cache timing test flakiness
    - When troubleshooting Supabase Local connectivity in tests

- docs/specs/feature-25-api-key-generation.md
  - Conditions:
    - When working on issue #25 or modifying API key generation logic
    - When implementing key format changes or collision handling
    - When debugging bcrypt hashing or key validation issues
    - When updating key format patterns (kota_<tier>_<key_id>_<secret>)

- docs/specs/chore-40-migrate-ci-supabase-local.md
  - Conditions:
    - When working on issue #40 or modifying CI test infrastructure
    - When troubleshooting CI test failures related to Supabase services
    - When updating GitHub Actions workflows to use Supabase Local
    - When CI tests fail with authentication errors that pass locally
    - When aligning CI and local testing environments for parity

- docs/specs/chore-51-containerize-test-environment-docker-compose.md
  - Conditions:
    - When working on issue #51 or modifying test infrastructure containerization
    - When troubleshooting Docker Compose test stack issues
    - When experiencing port conflicts during local test runs
    - When setting up simultaneous test runs across multiple projects/branches
    - When updating test scripts in `app/scripts/` (setup-test-db.sh, reset-test-db.sh, etc.)
    - When investigating project isolation or cleanup issues

- docs/specs/chore-57-fix-ci-after-restructure.md
  - Conditions:
    - When working on CI failures after the #54 repository restructure
    - When troubleshooting Application CI or Automation CI workflow failures
    - When script path errors occur in `.github/scripts/setup-supabase-ci.sh`
    - When updating CI workflows that reference `app/scripts/` or `automation/` directories
    - When adding Python project structure to `automation/` directory
    - When debugging path assumptions in test setup or cleanup scripts

- docs/specs/chore-58-organize-commands-subdirectories.md
  - Conditions:
    - When working on issue #58 or organizing `.claude/commands/` directory structure
    - When adding new slash commands and determining subdirectory placement
    - When troubleshooting command discovery issues after subdirectory reorganization
    - When updating documentation that references command paths
    - When understanding the logical grouping pattern for commands (workflows, git, issues, homeserver, worktree, automation, app, docs, ci, tools)

- .github/workflows/automation-ci.yml
  - Conditions:
    - When working on automation layer CI infrastructure or testing pipeline
    - When troubleshooting pytest failures in GitHub Actions
    - When modifying Python test setup, syntax checking, or dependency installation
    - When adding new Python modules that need validation in CI
    - When debugging git identity configuration for worktree tests
    - When working on issue #79 or automation CI integration tasks
    - When CI badge status is incorrect or workflow needs updating

- .claude/commands/docs/issue-relationships.md
  - Conditions:
    - When creating or updating spec files with relationship metadata (`## Issue Relationships` section)
    - When creating GitHub issues and documenting dependencies or related work
    - When building dependency graphs for issue prioritization
    - When planning implementation and identifying prerequisite work
    - When writing commit messages with dependency metadata (Depends-On, Related-To)
    - When reviewing PRs and validating relationship documentation completeness
    - When enabling AI agents to discover issue context automatically
    - When understanding relationship types: Depends On, Related To, Blocks, Supersedes, Child Of, Follow-Up

- CLAUDE.md (GitHub Issue Management and Relationship Standards section)
  - Conditions:
    - When working on issue #151 or implementing issue relationship documentation standards
    - When understanding high-level workflow for relationship-aware issue prioritization
    - When implementing ADW workflow improvements for context discovery
    - When prioritizing open issues based on dependency resolution

- .claude/commands/issues/prioritize.md
  - Conditions:
    - When needing to identify highest-priority unblocked work across open issues
    - When building dependency graphs to find ready-to-start issues
    - When balancing quick wins (effort:small) with high-impact work (priority:critical/high)
    - When identifying high-leverage issues that unblock multiple downstream tasks
    - When validating that "Depends On" relationships are resolved before starting work
    - When generating prioritization reports for sprint planning or team allocation

- .claude/commands/issues/audit.md
  - Conditions:
    - When cleaning up issue tracker to close completed, obsolete, or duplicate issues
    - When identifying issues completed via merged PRs but not formally closed
    - When finding stale issues with no activity in 90+ days
    - When detecting duplicate issues with similar titles or acceptance criteria
    - When issues are superseded by architectural changes or refactors
    - When generating audit reports for maintainer review before bulk closures
    - When updating spec files or epic tracking after closing related issues

- .claude/commands/docs/prompt-code-alignment.md
  - Conditions:
    - When creating or modifying slash command templates in `.claude/commands/`
    - When debugging ADW workflow failures related to agent output parsing
    - When Python functions fail to parse template responses (parse errors, empty values, type mismatches)
    - When template changes break automation workflows
    - When implementing new workflow phases that require agent interaction
    - When reviewing PRs that modify slash command templates
    - When enhancing output format specifications or adding CRITICAL output sections
    - When agents add explanatory text despite templates specifying "Return only X"
    - When implementing defensive parsing patterns for agent responses

- .claude/commands/release/release.md
  - Conditions:
    - When creating a production release by merging develop → main
    - When performing version bumping (major/minor/patch)
    - When generating changelogs from commit history
    - When validating pre-release checks (CI, migration sync, schema parity, health checks)
    - When creating release PRs with comprehensive checklists
    - When tagging releases and creating GitHub releases
    - When syncing develop with main after release
    - When handling emergency hotfixes from main branch
    - When implementing rollback procedures for problematic releases
    - When understanding semantic versioning strategy for KotaDB

- .claude/commands/experts/ (Expert System)
  - Conditions:
    - When needing multi-perspective analysis for feature planning
    - When performing comprehensive code review across domains
    - When analyzing architecture, testing, security, or integration concerns
    - When using Planning Council for synthesized planning recommendations
    - When using Review Panel for consolidated code review decisions
    - When running expert self-improvement to update domain knowledge
  - Available Experts:
    - architecture-expert: Path aliases, component boundaries, data flow patterns
    - testing-expert: Antimocking philosophy, test patterns, coverage requirements
    - security-expert: RLS policies, authentication flow, input validation
    - integration-expert: MCP server patterns, Supabase integration, external APIs
  - Orchestrators:
    - planning_council: Multi-expert planning synthesis
    - review_panel: Multi-expert code review aggregation

- .claude/hooks/ (Automation Hooks)
  - Conditions:
    - When understanding automatic quality enforcement for TypeScript/JavaScript files
    - When troubleshooting PostToolUse or UserPromptSubmit hook behavior
    - When modifying or adding new automation hooks
    - When debugging hook timeout or execution errors
  - Components:
    - auto_linter.py: PostToolUse hook for auto-linting after Write/Edit on .ts/.js files
    - context_builder.py: UserPromptSubmit hook for contextual documentation suggestions
    - utils/hook_helpers.py: Shared utilities for JSON I/O, file detection, project root
  - Configuration:
    - .claude/settings.json: Hook configuration with matchers and timeouts
    - PostToolUse: Triggers on Write|Edit, runs Biome linter (45s timeout)
    - UserPromptSubmit: Triggers on all prompts, provides context hints (10s timeout)

- .claude/commands/docs/settings-configuration.md
  - Conditions:
    - When configuring Claude Code settings for KotaDB development
    - When setting up permission patterns for Bash or MCP tools
    - When creating or customizing settings.local.json for personal preferences
    - When troubleshooting status line display or permission issues
    - When understanding the difference between shared and local settings
    - When auditing or reviewing Claude Code permission security
  - Components:
    - settings.json: Shared project settings (statusLine, hooks)
    - settings.local.json: Personal settings (gitignored)
    - settings.local.json.template: Template for local settings setup
    - statusline.py: Status line script showing project and branch

- .claude/docs/prompt-levels.md
  - Conditions:
    - When understanding the 7-level prompt maturity model for slash commands
    - When classifying command complexity or composability
    - When designing new slash commands and determining appropriate level
    - When working with expert system commands (Level 5-7)
    - When implementing self-modifying commands that update their own content
    - When implementing meta-cognitive commands that improve other commands
    - When adding Expertise sections to commands
    - When understanding Template Category requirements by prompt level
