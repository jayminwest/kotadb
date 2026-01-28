# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
