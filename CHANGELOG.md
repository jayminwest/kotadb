# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
