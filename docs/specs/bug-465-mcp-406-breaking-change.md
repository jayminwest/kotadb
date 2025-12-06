# Bug: MCP endpoint returns 406 for Claude Code clients (Issue #465)

## User Story / Problem Statement

**CRITICAL BUG**: The MCP endpoint (`POST /mcp`) rejects requests from Claude Code clients with HTTP 406 "Not Acceptable" error when the Accept header doesn't include both `application/json` AND `text/event-stream`. This was introduced in v0.1.1 when the `@modelcontextprotocol/sdk` was first released to production.

### Impact
- All Claude Code MCP integrations fail to connect
- 13 MCP tools unavailable: `search_code`, `index_repository`, `list_recent_files`, `search_dependencies`, `analyze_change_impact`, `validate_implementation_spec`, `create_project`, `list_projects`, `get_project`, `update_project`, `delete_project`, `add_repository_to_project`, `remove_repository_from_project`
- Affects all users who configured MCP integration before v0.1.1

### Root Cause
The MCP SDK's `StreamableHTTPServerTransport` requires both `application/json` AND `text/event-stream` in the Accept header, but:
1. Claude Code's `.mcp.json` format was not documented to require this
2. No migration guide provided for v0.1.1 upgrade
3. The requirement is enforced even in JSON-only mode (`enableJsonResponse: true`)

## Expert Analysis Summary

### Architecture Perspective
- **Header Validation Location**: Add explicit Accept header validation in `/mcp` POST handler (line 659 of `app/src/api/routes.ts`) BEFORE transport creation
- **Error Response Structure**: Return 406 JSON with `{ error: "...", details: { required: [...], received: "..." } }` matching existing error patterns
- **Logging Pattern**: Use `logger.warn()` for validation failures with request_id and user_id correlation
- **Early Exit**: Validate headers before MCP server initialization to reduce resource allocation on invalid requests

### Testing Strategy
- **Test Scope**: Integration tests for Accept header validation using real HTTP transport
- **Anti-mock Compliance**: All tests use real Supabase Local connections, no mocking
- **Test Cases**: Valid headers (200), missing headers (406), partial headers (406), case variations, wildcard handling
- **Regression Prevention**: Pin `@modelcontextprotocol/sdk` version, test with actual Claude Code client patterns

### Security Considerations
- **Error Message Safety**: Return actionable error without leaking internal details
- **API Key Examples**: Documentation examples use placeholders, add security best practices section
- **Logging Security**: Do not log full API keys, only mask key_id if needed
- **Header Validation Order**: Validate Accept header after authentication to prevent quota consumption on invalid requests

### Integration Requirements
- **Client-Server Contract**: Accept header must include both `application/json` AND `text/event-stream`
- **MCP Protocol Version**: Server implements v2025-06-18
- **Backwards Compatibility**: Breaking change - existing clients with old config will fail
- **Error Recovery**: Return actionable 406 with documentation link

### UX Considerations
- **Error Message Clarity**: Include "what to fix" and "where to fix it" (`.mcp.json`)
- **Documentation Structure**: Add prominent troubleshooting section at top of integration guide
- **Migration Guide**: Create dedicated migration document with before/after examples
- **CHANGELOG Clarity**: Prominent breaking change notice with remediation steps

### Hook & Automation Considerations
- **Logging Standards**: All new code must use `process.stdout.write()` / `process.stderr.write()`, never `console.*`
- **Pre-commit Compliance**: Documentation updates will pass through existing linting hooks
- **Hook Configuration**: No new hooks required for this fix

### Claude Configuration
- **CLAUDE.md Updates**: Add MCP troubleshooting to "When Things Go Wrong" section
- **Navigation**: Ensure cross-links between integration guide and troubleshooting
- **Settings**: No settings.json changes required

## Synthesized Recommendations

### Priority Actions
1. **[CRITICAL]** Create CHANGELOG.md with breaking change entry for v0.1.1
2. **[CRITICAL]** Update `docs/guides/mcp-claude-code-integration.md` with prominent header requirements warning
3. **[HIGH]** Update README.md MCP section with correct Accept header requirement
4. **[HIGH]** Create migration guide at `docs/migration/v0.1.0-to-v0.1.1.md`
5. **[MEDIUM]** Add server-side logging for missing Accept header in `app/src/api/routes.ts`

### Risk Assessment
- **High Risk**: Existing users with old `.mcp.json` fail silently until they read updated docs
  - **Mitigation**: Prominent CHANGELOG entry, update integration guide with warning banner
- **Medium Risk**: Documentation scattered across multiple files
  - **Mitigation**: Cross-link from CLAUDE.md, README, and integration guide
- **Low Risk**: SDK behavior may change in future versions
  - **Mitigation**: Pin SDK version in package.json

## Implementation Plan

### Phase 1: Documentation (Critical)

#### Task 1.1: Create CHANGELOG.md
- [ ] Create `/Users/jayminwest/Projects/kota-db-ts/CHANGELOG.md`
- [ ] Add v0.1.1 section with BREAKING CHANGE notice
- [ ] Document Accept header requirement
- [ ] Link to migration guide

#### Task 1.2: Update MCP Integration Guide
- [ ] Add breaking change warning banner at top
- [ ] Enhance troubleshooting section for 406 errors
- [ ] Add testing examples with curl
- [ ] Update "Last Verified" and version to 0.1.1

#### Task 1.3: Update README.md
- [ ] Update MCP Protocol Endpoint section (line 151-154)
- [ ] Fix Accept header from `application/json` to `application/json, text/event-stream`
- [ ] Add note about Claude Code client requirements

### Phase 2: Migration Guide

#### Task 2.1: Create Migration Guide
- [ ] Create `docs/migration/v0.1.0-to-v0.1.1.md`
- [ ] Document what changed
- [ ] Provide before/after `.mcp.json` examples
- [ ] Include troubleshooting steps

### Phase 3: Server-Side Improvements

#### Task 3.1: Add Accept Header Logging
- [ ] Modify `app/src/api/routes.ts` POST /mcp handler
- [ ] Add logging for Accept header validation failures (before SDK takes over)
- [ ] Use `logger.warn()` with request context
- [ ] Follow logging standards: `process.stdout.write()`

## Validation Requirements

- [ ] Core gates: `cd app && bun run lint`, `cd app && bunx tsc --noEmit`
- [ ] Tests: `cd app && bun test`
- [ ] Build: `cd app && bun run build`
- [ ] Manual test: Verify curl commands work with correct/incorrect headers

### Manual Verification Commands

```bash
# Valid request (should return 200)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# Invalid request - missing text/event-stream (should return 406)
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## Notes

### File References
- **MCP Server**: `app/src/mcp/server.ts` (lines 252-257) - Transport creation
- **MCP Headers**: `app/src/mcp/headers.ts` (lines 84-98) - `parseAccept()` function exists but not used in route
- **API Routes**: `app/src/api/routes.ts` (lines 658-697) - POST /mcp handler
- **Integration Guide**: `docs/guides/mcp-claude-code-integration.md` (already has 406 troubleshooting at lines 220-236)

### Existing Documentation State
The integration guide already documents the correct headers (lines 57-72, 77-86) and has a 406 troubleshooting section (lines 220-236). The main gaps are:
1. No CHANGELOG.md exists
2. README.md has incorrect Accept header (line 154: `Accept: application/json` should be `Accept: application/json, text/event-stream`)
3. No migration guide exists
4. No breaking change warning at top of integration guide

### SDK Behavior
The `StreamableHTTPServerTransport` validates Accept header internally regardless of `enableJsonResponse: true` setting. This is by design to ensure protocol compatibility.

---

**Spec Created**: 2025-12-05
**Issue**: #465
**Priority**: Critical
**Effort**: Small (< 1 day)
