---
description: Analyze changes and update integration expert knowledge
---

# Integration Expert - Improve

**Template Category**: Action
**Prompt Level**: 6 (Self-Modifying)

## Workflow

### 1. Analyze Recent Integration Changes

```bash
git log --oneline -30 --all -- "app/src/mcp/**" "app/src/api/**"
```

Review recent commits affecting MCP tools, API endpoints, and integrations.

### 2. Extract Learnings

**Identify Successful Patterns:**
- New MCP tool implementations that worked well
- Error handling patterns that caught issues
- Response format improvements
- Retry/timeout configurations that proved effective

**Track Integration Issues:**
- Boundary errors caught in production
- Timeout-related failures
- Format compatibility issues
- External API changes that required adaptation

**Document New Tools/Endpoints:**
- New MCP tools added
- New REST endpoints
- New queue job types
- External service integrations

### 3. Update Expertise Sections

Edit the following files to incorporate learnings:
- `integration_expert_plan.md` → Update "MCP Server Patterns" and "Error Handling at Boundaries"
- `integration_expert_review.md` → Update "MCP Tool Compliance" checklist
- `.claude/agents/leaf/expert-integration.md` → Update leaf agent knowledge base

**Rules for Updates:**
- **PRESERVE** existing integration patterns that work
- **APPEND** new patterns with evidence from commits
- **DATE** entries with commit reference
- **REMOVE** patterns superseded by better approaches

**Synchronization Requirements:**
- Any improvements to integration knowledge MUST be reflected in BOTH:
  1. The original expertise files (`integration_expert_plan.md` and `integration_expert_review.md`)
  2. The leaf agent knowledge base (`.claude/agents/leaf/expert-integration.md`)
- The leaf agent file is used when experts are spawned via MCP, so it must contain the most current knowledge

### 4. Document Edge Cases

**Sources for Edge Cases:**
- Production error logs
- Integration test failures
- External API changelog impacts
- Timeout/retry policy adjustments

**Format for New Edge Cases:**
```
- [Edge case description] (discovered in #PR_NUMBER)
  - Trigger: [what caused it]
  - Impact: [system behavior]
  - Resolution: [how to handle]
  - Prevention: [how to avoid]
```

### 5. Update Tool Registry

Maintain list of available MCP tools:
```bash
# Find all tool registrations
grep -r "setRequestHandler" app/src/mcp/
```

Update expertise with:
- New tools added
- Tool parameter changes
- Tool deprecations

### 6. Review External Dependencies

Periodically check:
- MCP SDK version compatibility
- Supabase client updates
- pg-boss version changes
- External API changes

Document breaking changes and migration patterns.

## Output

Return summary of changes made to Expertise sections:

**Patterns Added:**
- [New integration pattern with source reference]

**Edge Cases Documented:**
- [Edge case with resolution]

**Tools Updated:**
- [New or modified MCP tools]

**Error Handling:**
- [New error handling patterns]

**External API Changes:**
- [Adaptations for external service changes]

**Leaf Agent Sync:**
- [Confirmation that `.claude/agents/leaf/expert-integration.md` was updated]
