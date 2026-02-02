# Claude Config Documentation Fixes Specification

**Issue:** #77  
**Domain:** claude-config  
**Type:** chore  
**Priority:** high  

## Overview

This specification addresses critical inconsistencies in the Claude Code configuration documentation that reference non-existent commands, directories, and files. These issues create confusion for users and break the reliability of the configuration system.

## Problem Analysis

Based on analysis of the current Claude configuration state, the following inconsistencies were identified:

### 1. Non-Existent Slash Commands in CLAUDE.md

**Current state:** CLAUDE.md references commands that don't exist:
- `/tools:bun_install` - No corresponding `.claude/commands/tools/bun_install.md`
- `/tools:pr-review` - No corresponding `.claude/commands/tools/pr-review.md` 
- `/tools:question` - No corresponding `.claude/commands/tools/question.md`
- `/validation:resolve_failed_validation` - No validation directory exists at all

**Available tools commands:** Only `/tools:install` and `/tools:tools` exist.

### 2. Incorrect .claude/settings.json Reference

**Current state:** `.claude/settings.json:21` references:
```json
"command": "python3 $CLAUDE_PROJECT_DIR/.claude/statusline.py"
```

**Issue:** `.claude/statusline.py` does not exist, breaking the status line configuration.

### 3. Outdated .claude/commands/README.md Directory References

**Current state:** README.md references 8 non-existent subdirectories:
- `workflows/` - Does not exist
- `homeserver/` - Does not exist
- `worktree/` - Does not exist
- `automation/` - Does not exist (at command level)
- `app/` - Does not exist
- `ci/` - Does not exist
- `experts/` - Does not exist (at command level)

**Available directories:** Only `git/`, `issues/`, `docs/`, `release/`, and `tools/` exist.

### 4. Incorrect README.md Automation Layer Description

**Current state:** Main README.md line 272 states:
```
automation/            # Agentic layer (Python AI developer workflows)
```

**Issue:** The automation layer is TypeScript-based (not Python), as evidenced by the ADW system structure.

### 5. Missing Expert Domain Documentation

**Current state:** CLAUDE.md lists only 7 expert domains but actual expert agents include 9 domains:

**Missing from documentation:**
- `automation` - Exists in `.claude/agents/experts/automation/`
- `documentation` - Exists in `.claude/agents/experts/documentation/`

**Documented but should be verified:**
- `claude-config` ✓ (exists)
- `agent-authoring` ✓ (exists)
- `database` ✓ (exists)
- `api` ✓ (exists)
- `testing` ✓ (exists)
- `indexer` ✓ (exists)
- `github` ✓ (exists)

## Proposed Solution

The solution involves systematic cleanup and correction of documentation inconsistencies across multiple files.

### Task 1: Fix CLAUDE.md Slash Command References

**Action:** Remove non-existent commands from the "Preserved Commands" table.

**Before:**
```markdown
| **Tools** | `/tools:install`, `/tools:bun_install`, `/tools:pr-review`, `/tools:question`, `/tools:tools` |
| **Validation** | `/validation:resolve_failed_validation` |
```

**After:**
```markdown
| **Tools** | `/tools:install`, `/tools:tools` |
```

**Justification:** Only reference commands that actually exist to prevent user confusion and broken command invocations.

### Task 2: Fix .claude/settings.json Status Line Reference

**Action:** Remove or correct the non-existent statusline.py reference.

**Option A - Remove status line (recommended):**
```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob", 
      "Grep",
      "WebFetch",
      "WebSearch",
      "Task",
      "TodoWrite",
      "AskUserQuestion",
      "Bash"
    ],
    "deny": [
      "Write",
      "Edit"
    ]
  }
}
```

**Option B - Create statusline.py:**
If status line functionality is needed, create a minimal Python script.

**Recommendation:** Option A - Remove the status line configuration since it references a non-existent file.

### Task 3: Update .claude/commands/README.md Directory Structure

**Action:** Replace the directory structure section to reflect actual directories.

**Before (lines 57-67):**
```markdown
- **workflows/** - SDLC phase commands (plan, build, test, review, document)
- **git/** - Version control operations (commit, branch management)
- **issues/** - GitHub issue template commands (chore, bug, feature)
- **homeserver/** - Trigger automation and webhook handlers
- **worktree/** - Git worktree management commands
- **automation/** - ADW workflow orchestration commands
- **app/** - Application layer commands (start server, database operations)
- **docs/** - Documentation helpers (anti-mock guidelines, conditional docs, prompt-code alignment)
- **ci/** - CI/CD workflow commands
- **tools/** - Utility commands (install, PR review)
- **experts/** - Domain expert system (architecture, testing, security, integration)
```

**After:**
```markdown
- **git/** - Version control operations (commit, pull request)
- **issues/** - GitHub issue template commands (feature, bug, chore, refactor, classify, audit, prioritize)
- **docs/** - Documentation helpers (load AI docs)
- **tools/** - Utility commands (install, tools)
- **release/** - Release management commands
```

### Task 4: Correct README.md Automation Layer Description

**Action:** Update the project layout description to accurately reflect the TypeScript-based automation layer.

**Before (line 272):**
```markdown
automation/            # Agentic layer (Python AI developer workflows)
```

**After:**
```markdown
automation/            # Agentic layer (TypeScript AI developer workflows)
```

### Task 5: Update Expert Domains Documentation

**Action:** Add missing expert domains to CLAUDE.md.

**Before (lines 41-51):**
Seven expert domains listed.

**After:**
Nine expert domains:

```markdown
Nine expert domains provide specialized knowledge with plan, build, improve, and question agents:

| Domain | Purpose | Location |
|--------|---------|----------|
| `claude-config` | .claude/ configuration (commands, hooks, settings) | `.claude/agents/experts/claude-config/` |
| `agent-authoring` | Agent creation (frontmatter, tools, registry) | `.claude/agents/experts/agent-authoring/` |
| `database` | SQLite schema, FTS5, migrations, queries | `.claude/agents/experts/database/` |
| `api` | HTTP endpoints, MCP tools, Express patterns | `.claude/agents/experts/api/` |
| `testing` | Antimocking, Bun tests, SQLite test patterns | `.claude/agents/experts/testing/` |
| `indexer` | AST parsing, symbol extraction, code analysis | `.claude/agents/experts/indexer/` |
| `github` | Issues, PRs, branches, GitHub CLI workflows | `.claude/agents/experts/github/` |
| `automation` | ADW workflows, agent orchestration, worktree isolation | `.claude/agents/experts/automation/` |
| `documentation` | Documentation management, content organization | `.claude/agents/experts/documentation/` |
```

## Implementation Plan

### Phase 1: CLAUDE.md Updates
1. Remove non-existent slash commands from Preserved Commands table
2. Update expert domains count from "Seven" to "Nine"
3. Add missing `automation` and `documentation` domains to table
4. Update usage examples to reflect available commands

### Phase 2: Settings Configuration Fix
1. Remove statusline.py reference from `.claude/settings.json`
2. Ensure JSON remains valid after removal

### Phase 3: Command Documentation Updates
1. Update `.claude/commands/README.md` directory structure
2. Remove references to non-existent subdirectories
3. Update command invocation examples to match available commands

### Phase 4: Project Layout Correction
1. Update main `README.md` automation layer description
2. Ensure consistency with actual implementation (TypeScript, not Python)

### Phase 5: Validation
1. Verify all referenced commands exist
2. Verify all referenced directories exist
3. Verify all referenced files exist
4. Test status line configuration (should work without errors)

## Acceptance Criteria

### ✅ Documentation Accuracy
- [ ] All slash commands referenced in CLAUDE.md exist as actual files
- [ ] All directories referenced in README files exist
- [ ] All file paths referenced in configuration files exist
- [ ] Expert domains count and list are accurate

### ✅ Configuration Functionality
- [ ] `.claude/settings.json` does not reference non-existent files
- [ ] Claude Code can load configuration without errors
- [ ] All documented commands can be invoked successfully

### ✅ Consistency
- [ ] Project layout descriptions match actual directory structure
- [ ] Technology stack descriptions are accurate (TypeScript vs Python)
- [ ] Expert domain documentation is complete and accurate

## Risk Assessment

### Low Risk
- Documentation updates (no functional changes)
- Removing non-existent command references
- Correcting technology stack descriptions

### Medium Risk
- Removing statusline configuration (may affect user experience)
- Command directory structure updates (may affect discoverability)

### Mitigation Strategies

1. **Incremental Updates:** Apply changes in phases to isolate potential issues
2. **Backup Configuration:** Keep backup of original configuration files
3. **Testing:** Validate each change independently
4. **Documentation:** Update DEVELOPMENT.md if any development workflows change

## Dependencies

No external dependencies required. All changes are documentation and configuration updates.

## Testing Strategy

### Manual Testing
1. Attempt to invoke all documented slash commands
2. Verify Claude Code loads without configuration errors
3. Check that all referenced files and directories exist

### Automated Testing
Consider adding a configuration validation script that:
- Verifies all referenced commands exist
- Validates JSON configuration files
- Checks directory structure consistency

## Deliverables

1. **Updated CLAUDE.md** - Accurate command references and expert domains
2. **Updated .claude/settings.json** - Remove non-existent file reference
3. **Updated .claude/commands/README.md** - Accurate directory structure
4. **Updated README.md** - Correct automation layer description
5. **Validation Report** - Confirmation that all references are valid

## Success Metrics

- Zero broken references to non-existent commands, files, or directories
- All documented slash commands are invokable
- Configuration loads without errors
- Documentation accurately reflects actual system capabilities

This specification ensures the Claude Code configuration is accurate, reliable, and maintainable, eliminating user confusion and configuration errors.
