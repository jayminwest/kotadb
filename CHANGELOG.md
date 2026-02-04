# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2026-02-04

### Added

- **Unified MCP search tool**: Consolidates all search operations into a single powerful tool (#143)
- **CLI `--toolset` flag**: Filter MCP tools by category for focused workflows (#142)
- **Web expert domain**: New expert domain for web/marketing site development
- **Documentation expert domain**: Complete documentation domain with plan/build/improve/question agents (#150)
- **Automatic indexing with file watching**: Repositories auto-update when files change (#35)
- **Memory layer**: Persistent cross-session intelligence for improved agent context (#99)
- **Context seeding via hooks**: Dynamic expertise injection at session start (#98)
- **Dynamic expertise tools**: Runtime expertise validation and updates (#100)
- **TypeScript path alias resolution**: Full support for `@alias/*` imports (#56)
- **Re-export and dynamic import support**: Enhanced dependency tracking (#95)
- **Repository full_name support**: Use `owner/repo` in addition to UUIDs (#96)
- **Stdio MCP transport**: Reliable Claude Code integration
- **Isolated worktrees**: Agent runs in isolated git worktrees for automation

### Fixed

- Resolve `full_name` to UUID in `list_recent_files` (#137)
- Docs/blog rendering issues on website (#132)
- Indexer error recovery for malformed AST (#76)
- CLI logging redirected to stderr for clean JSON output (#118)
- Dependency cycle detection in queries
- SQL files included in npm package for bunx compatibility

### Changed

- Website redesigned with Liquid Glass design system
- Homepage updated to showcase MCP configuration (#149)
- QUICKSTART.md added for 5-minute onboarding (#123)
- AI architecture diagrams added (Excalidraw + SVG)

### Dependencies

- Updated cors ^2.8.5 → ^2.8.6
- Updated zod ^4.1.12 → ^4.3.6
- Updated bun-types
- Updated @types/node 22.19.7 → 25.2.0
- CI: Node 24, setup-bun v2, OIDC publishing

## [2.1.0] - 2026-01-30

### Added

- Initial expert domain agents (claude-config, agent-authoring, database, api, testing, indexer, github)
- Plan-build-improve workflow pattern for all expert domains
- `/do` universal entry point command
- Automation layer with Claude Agent SDK (#60)
- Comprehensive documentation updates

### Fixed

- Various indexer and automation fixes

## [2.0.0] - 2025-01-28

### Breaking Changes

- **Complete architecture pivot from cloud SaaS to local-only**: This release is NOT compatible with v1.x cloud deployments. There is no migration path from v1.x cloud instances.

### Removed

- **Supabase**: PostgreSQL database, authentication, and RLS policies
- **Stripe**: Billing, subscriptions, and payment processing
- **pg-boss**: PostgreSQL-based job queue for background processing
- **Fly.io**: Cloud deployment infrastructure
- **Docker Compose**: No longer required for development
- **Multi-tenancy**: Organizations, user management, and API key tiers
- **Rate limiting**: Per-key rate limit counters and tiers (free/solo/team)

### Added

- **SQLite database**: Local-only storage using SQLite with WAL mode
- **Project-local storage**: Database stored in `.kotadb/kota.db` within your project directory
- **Auto-gitignore**: `.kotadb/` directory automatically added to `.gitignore`
- **FTS5 full-text search**: Efficient code search using SQLite's FTS5 extension
- **Connection pooling**: Better-sqlite3 with optimized connection handling
- **Simplified schema**: Focused tables for code intelligence:
  - `repositories`: Git repository metadata
  - `indexed_files`: Source files with FTS5 search
  - `indexed_symbols`: Functions, classes, types
  - `indexed_references`: Import/call dependencies
  - `projects`: User-defined repository groupings
  - `project_repositories`: Project-repository associations
  - `dependency_graph`: File and symbol dependency tracking
  - `schema_migrations`: Schema version tracking

### Changed

- **Database types**: UUID stored as TEXT, timestamps as ISO 8601 TEXT, JSON as TEXT
- **Authorization**: Application-level access control replaces PostgreSQL RLS
- **Development setup**: Single command (`bun run src/index.ts`) starts everything
- **Testing**: Real SQLite databases replace Supabase Local for tests

### Migration Notes

v1.x cloud instances are incompatible with v2.0.0. This is a ground-up rewrite for local-only operation. If you were running a v1.x cloud instance:

1. Export any data you need from your PostgreSQL database
2. Start fresh with v2.0.0
3. Re-index your repositories locally

## [0.1.1] - 2025-11-23

### Breaking Changes

- **MCP Accept Header Requirement**: The MCP endpoint now enforces Accept header validation via the MCP SDK. Clients MUST include both `application/json` AND `text/event-stream` in the Accept header.
  - **Error**: HTTP 406 "Not Acceptable: Client must accept both application/json and text/event-stream"
  - **Fix**: Update your `.mcp.json` to include: `"Accept": "application/json, text/event-stream"`
  - **Migration Guide**: See [v0.1.0 to v0.1.1 Migration](docs/migration/v0.1.0-to-v0.1.1.md)
  - **Issue**: [#465](https://github.com/your-org/kota-db-ts/issues/465)

### Changed

- Integrated `@modelcontextprotocol/sdk` for standardized MCP communication
- MCP transport now uses `StreamableHTTPServerTransport` with JSON response mode

## [0.1.0] - 2025-11-09

### Added

- Initial release with MCP endpoint (`POST /mcp`)
- Code search tool (`search_code`)
- Repository indexing tool (`index_repository`)
- Recent files listing tool (`list_recent_files`)
- Dependency search tool (`search_dependencies`)
- Change impact analysis tool (`analyze_change_impact`)
- Implementation spec validation tool (`validate_implementation_spec`)
- Project CRUD tools (create, list, get, update, delete)
- Repository-to-project association tools
- Rate limiting per API key tier (free: 100/hr, solo: 1000/hr, team: 10000/hr)
- Support for TypeScript, JavaScript, Python, Go, and Rust codebases
