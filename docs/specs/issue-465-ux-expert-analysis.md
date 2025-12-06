# UX Expert Analysis - Issue #465: MCP endpoint returns 406 for Claude Code clients

**Template Category**: Structured Analysis
**Expert Perspective**: UX Impact Assessment
**Issue Context**: HTTP 406 "Not Acceptable" errors preventing Claude Code users from accessing MCP tools

---

## Executive Summary

This issue impacts the user experience of Claude Code CLI users attempting to use KotaDB's MCP tools. The root cause is a missing Accept header requirement, but the current error message provides no actionable guidance. Users encounter a cryptic HTTP 406 response without understanding what to fix or where to configure it.

**Severity**: HIGH (blocking users, poor error feedback)
**Affected Users**: All Claude Code CLI users attempting MCP integration
**Primary Pain Point**: No clear path to resolution; documentation unclear; configuration examples incomplete

---

## UX Perspective

### User Touchpoints

1. **Initial Setup/Configuration**
   - User reads README or integration guide
   - User attempts `claude mcp add` command
   - User updates `.mcp.json` configuration manually

2. **First Connection Attempt**
   - User makes first MCP tool call (e.g., `search_code`)
   - Request fails with HTTP 406
   - No explanation of what went wrong or how to fix it

3. **Debugging/Resolution**
   - User searches error message ("Not Acceptable")
   - User reviews `.mcp.json` configuration
   - User lacks clear guidance on Accept header format
   - User may miss `text/event-stream` requirement

4. **Documentation Access**
   - User consults integration guide
   - Current guide has correct headers example (line 58 in `docs/guides/mcp-claude-code-integration.md`)
   - BUT: User must know to look there; error message doesn't point to it

5. **Migration from Old Config**
   - Existing users with old `.mcp.json` files fail unexpectedly
   - No CHANGELOG guidance on breaking change
   - No automated migration or validation tools
   - No clear "before and after" examples

### Output Format Impact

**Current Error Response** (from MCP SDK):
```
HTTP/1.1 406 Not Acceptable
Content-Type: application/json

{
  "error": "Not Acceptable: Client must accept both application/json and text/event-stream"
}
```

**Problems with current output:**
- Error appears in HTTP response, not client console (user must check network logs)
- Message is technical and unhelpful: "must accept both" is jargon
- No "next steps" guidance
- No link to documentation
- No indication this is a configuration issue (not a server bug)
- Silent failure on Claude Code side (user sees tool unavailable, not the actual error)

**Root Cause in Code**:
The MCP SDK's `StreamableHTTPServerTransport` validates Accept headers internally before reaching KotaDB handlers. Current implementation at `/mcp` endpoint (line 659-697 in `app/src/api/routes.ts`) cannot intercept or customize this error.

### Recommendations

#### 1. **Improve Error Message Clarity** (PRIORITY: HIGH)
**Rationale**: Users need immediate, actionable feedback
**Implementation**:
- Customize MCP SDK transport to intercept 406 errors
- Return user-friendly error response with:
  - Plain-English explanation: "Your MCP client is not configured to accept streaming responses"
  - Specific fix: "Update Accept header in .mcp.json to: 'application/json, text/event-stream'"
  - Direct link to documentation: "See docs/guides/mcp-claude-code-integration.md#required-headers"
  - Example configuration block

**Code Location**: `app/src/mcp/server.ts` (create transport error handler)

**Example Response**:
```json
{
  "error": {
    "code": "MCP_ACCEPT_HEADER_MISSING",
    "message": "MCP configuration incomplete",
    "details": "Your MCP client must accept both JSON and streaming responses",
    "fix": {
      "header": "Accept",
      "required_value": "application/json, text/event-stream",
      "where": "Add to 'headers' section in .mcp.json under 'mcpServers' configuration",
      "example": {
        "headers": {
          "Accept": "application/json, text/event-stream",
          "Authorization": "Bearer YOUR_API_KEY"
        }
      }
    },
    "documentation_url": "https://github.com/anthropic-labs/kota-db-ts/blob/develop/docs/guides/mcp-claude-code-integration.md#required-headers"
  }
}
```

**Accessibility Considerations**:
- Message uses plain language (no acronyms without explanation)
- Structured error format (code, message, fix, docs) works for both human and machine parsing
- No colors or formatting assumptions (works in minimal terminals)

---

#### 2. **Update Documentation Structure** (PRIORITY: HIGH)
**Rationale**: Users should find solutions without trial-and-error
**Implementation**:

**A. Enhance Integration Guide** (`docs/guides/mcp-claude-code-integration.md`):
- Add "Common Issues" section at top with troubleshooting
- Current structure hides critical headers info (line 75-89)
- Recommendation:
  ```markdown
  ### Quick Troubleshooting

  **Getting HTTP 406 errors?**
  1. Open `.mcp.json` in your project
  2. Find the kotadb server entry
  3. Check `headers.Accept` value
  4. It MUST be: `"application/json, text/event-stream"`
  5. Save and restart Claude Code
  ```

**B. Add Configuration Validator**:
- Create CLI tool to validate `.mcp.json` before attempting connection
- Provide immediate feedback without network call
- Could be part of `claude mcp validate` enhancement (upstream request)

**C. Create "Setup Checklist"**:
- Downloadable/printable checklist with validation steps
- Visual confirmation (checkboxes) for each requirement
- Before/after `.mcp.json` examples

---

#### 3. **Migration Guide for Existing Users** (PRIORITY: MEDIUM)
**Rationale**: Breaking change affects current users; need clear upgrade path
**Implementation**:

**A. Create CHANGELOG Entry**:
```markdown
### Breaking Changes

#### MCP Accept Header Required (v0.2.0)
The MCP endpoint now requires clients to accept both JSON and event-stream responses.

**Impact**: If you use Claude Code with KotaDB, you must update your `.mcp.json` configuration.

**What Changed**:
- MCP SDK now validates Accept header: requires `application/json, text/event-stream`
- Older configurations with only `application/json` will fail with HTTP 406

**How to Fix**:
1. Open `.mcp.json` in your project
2. Find your KotaDB server configuration
3. Update the Accept header:
   ```json
   "Accept": "application/json, text/event-stream"
   ```
4. Save and restart Claude Code
5. Test with `claude mcp list`

**Timeline**: Automatic (no transition period)
**Support**: See docs/guides/mcp-claude-code-integration.md
```

**B. Migration Email Template** (for hosted KotaDB users):
- Subject: "Action Required: Update MCP Configuration for Claude Code"
- Include before/after `.mcp.json` snippets
- Direct link to detailed guide
- Estimated time to fix: ~2 minutes

---

#### 4. **Improve README Accessibility** (PRIORITY: MEDIUM)
**Rationale**: New users should understand requirements upfront
**Implementation**:

**A. Add Quick Start Section to README.md**:
```markdown
## MCP Quick Start

KotaDB integrates with Claude Code for AI-assisted development.

### Prerequisites for Claude Code Users
- Claude Code CLI installed
- KotaDB server running and API key obtained

### Configuration (2 steps)
1. Generate API key (see docs/guides/mcp-claude-code-integration.md#prerequisites)
2. Register with Claude Code:
   ```bash
   claude mcp add kotadb http://localhost:3000/mcp \
     -t http \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Accept: application/json, text/event-stream"
   ```

Note: The Accept header is required. See detailed configuration guide if using .mcp.json.
```

**B. Add FAQ Section**:
```markdown
### FAQ

**Q: Why do I get "HTTP 406 Not Acceptable"?**
A: Your MCP client configuration is missing the Accept header. See the configuration guide above.

**Q: What does the Accept header do?**
A: It tells the MCP server which response formats you can handle. KotaDB requires both JSON and streaming responses.

**Q: Can I use KotaDB with other MCP clients?**
A: Yes, as long as they support the Accept header requirement.
```

---

#### 5. **CHANGELOG Clarity for Breaking Changes** (PRIORITY: MEDIUM)
**Rationale**: Release notes must highlight breaking changes prominently
**Implementation**:

**A. Create `CHANGELOG.md` Structure** (if not exists):
```markdown
# Changelog

All notable changes are documented here.

## [0.2.0] - 2025-01-XX

### Breaking Changes
- **MCP Accept Header Required**: Clients must now explicitly accept both `application/json` and `text/event-stream` in Accept header. Update your `.mcp.json` configuration. See MIGRATION.md.

### Fixed
- HTTP 406 errors now include actionable guidance in error message
- MCP configuration validation improved

### Changed
- Improved error messages for MCP misconfiguration
- Documentation restructured for clarity
```

**B. Add `MIGRATION.md`**:
- Single source of truth for upgrade paths
- Version-specific migration steps
- Rollback guidance (if applicable)

---

#### 6. **README Accessibility for New Users** (PRIORITY: LOW)
**Rationale**: Prevent future users from same friction
**Implementation**:

**A. Add "MCP Users" Badge/Section**:
```markdown
## For Claude Code Users

Claude Code integrates with KotaDB via MCP. [Quick Setup →](docs/guides/mcp-claude-code-integration.md)
```

**B. Visual Configuration Example**:
Current guide (line 50-73 in integration guide) has JSON example but could use:
- Syntax highlighting with clear comments
- Side-by-side old/new examples for migration
- Highlighted "required fields" callout box

---

## Risk Assessment

### UX Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Users ignore error message**: 406 response not visible in Claude Code CLI | MEDIUM | Add client-side error handling; improve error message visibility |
| **Documentation scattered**: Guides in multiple locations | MEDIUM | Create single "MCP Setup" document; link from README |
| **Unclear which header is required**: Users copy examples without understanding | MEDIUM | Add inline comments in examples; link to HTTP header explanation |
| **Existing users miss migration**: No notification of breaking change | HIGH | Send email; add prominent release notes; create `MIGRATION.md` |
| **Configuration fatigue**: Multiple headers required; users may miss one | LOW | Provide CLI tool to validate `.mcp.json`; show all required headers in one place |

### Accessibility Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **Error message uses jargon** ("Not Acceptable") | MEDIUM | Plain-English error response explaining what to fix |
| **Documentation assumes HTTP knowledge** | LOW | Add glossary or link to HTTP header documentation |
| **JSON configuration requires manual editing** | LOW | Provide `claude mcp add` helper (upstream, Claude Code team) |

---

## Pattern Compliance

### KotaDB CLI Output Patterns

**Compliance Assessment**:

| Pattern | Status | Notes |
|---------|--------|-------|
| **Actionable Errors** | PARTIAL | Current SDK error not actionable; recommend customization |
| **Error Codes** | MISSING | Should implement MCP-specific error codes (e.g., `MCP_ACCEPT_HEADER_MISSING`) |
| **Progress Feedback** | N/A | MCP is stateless; no long-running operations |
| **Context Preservation** | GOOD | Error should include user context (which server, config file location) |
| **Documentation Links** | MISSING | Errors should link to relevant docs |
| **Alternative Formats** | GOOD | JSON response format already works for scripting |

### KotaDB Documentation Patterns

**Compliance Assessment**:

| Pattern | Status | Notes |
|---------|--------|-------|
| **Clear Prerequisites** | PARTIAL | Prerequisites listed in guide; not in quick start |
| **Step-by-step Instructions** | GOOD | Guide has numbered steps |
| **Troubleshooting Section** | MISSING | Recommend adding "Common Issues" section |
| **Real Examples** | GOOD | Integration guide has concrete `.mcp.json` examples |
| **Version-Specific Guidance** | MISSING | No note on minimum protocol version requirement |
| **Migration Guides** | MISSING | Breaking changes should have dedicated migration docs |

---

## Implementation Priority & Effort

### Phase 1 (Immediate - Fix Current User Pain)
1. **Improve Error Message** (2-4 hours)
   - Customize MCP transport error handler
   - Create structured error response
   - Add documentation link

2. **Update Integration Guide** (1 hour)
   - Add "Quick Troubleshooting" section at top
   - Highlight Accept header requirement
   - Add "Common Errors" FAQ

3. **Update CHANGELOG/Release Notes** (30 mins)
   - Document breaking change
   - Link to migration guide

**Effort**: ~4-5 hours
**Impact**: Immediate relief for stuck users; improved onboarding for new users

### Phase 2 (Short-term - Prevent Future Friction)
1. **Create MIGRATION.md** (1-2 hours)
   - Single source for upgrade guidance
   - Example configurations
   - Rollback steps

2. **Add to README** (1 hour)
   - MCP quick start section
   - FAQ
   - Link to detailed guide

3. **Configuration Validator Tool** (4-8 hours)
   - CLI tool to validate `.mcp.json`
   - Provide immediate feedback
   - Suggest fixes

**Effort**: ~6-11 hours
**Impact**: Self-service resolution; reduced support burden

### Phase 3 (Long-term - Upstream Requests)
1. **Request Claude Code Improvements**:
   - Better error visibility in MCP tab
   - `claude mcp validate` command
   - Auto-suggest missing headers

**Effort**: External dependency
**Impact**: Permanent reduction in UX friction

---

## Success Metrics

### Before (Current State)
- Users getting 406 errors with no clear resolution path
- Support burden: "Why doesn't my MCP setup work?"
- Documentation scattered across multiple files
- No clear migration path for existing users

### After (Desired State)
- Users receive structured, actionable error messages
- Troubleshooting guide visible in every error response
- Single source of truth for MCP configuration
- <5 minute resolution time for Accept header issues
- Clear migration guidance in release notes

### Measurement
- Monitor error logs for MCP 406 responses
- Track docs page views for integration guide
- Survey Claude Code users on setup difficulty
- Measure time from first error to successful connection

---

## Conclusion

This is primarily a **documentation and error messaging problem**, not a technical issue. The MCP SDK correctly rejects malformed requests; the problem is users don't understand why.

**Key Actions**:
1. Improve error message to be user-friendly and actionable
2. Restructure documentation for quick access
3. Create clear migration guidance for breaking changes
4. Add troubleshooting section to README

**Expected Outcome**: Users self-resolve Accept header issues within 5 minutes of first error, reducing support burden and improving perception of KotaDB reliability.
