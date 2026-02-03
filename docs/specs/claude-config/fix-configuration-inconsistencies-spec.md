# Fix Claude Code Configuration Inconsistencies - Implementation Spec

**Issue:** #77 - Multiple configuration files contain references to non-existent commands, missing expert domains, and outdated automation documentation.

**Target:** Clean up and synchronize all Claude Code configuration files to reflect actual project state.

## Summary

This specification addresses systematic inconsistencies across Claude Code configuration files:

1. **CLAUDE.md** references 4 non-existent slash commands
2. **.claude/settings.json** references missing statusline.py script
3. **.claude/commands/README.md** documents non-existent subdirectories
4. **README.md** automation section describes Python/adws instead of TypeScript
5. Two expert domains (automation, documentation) exist but are undocumented in CLAUDE.md
6. Complete audit needed of all actually available slash commands

## Current State Analysis

### Non-Existent Slash Commands in CLAUDE.md

The following commands listed in CLAUDE.md:33-37 don't exist:

| Listed Command | Status | Action |
|----------------|--------|--------|
| `/tools:bun_install` | ❌ Missing | Remove from table |
| `/tools:pr-review` | ❌ Missing | Remove from table |
| `/tools:question` | ❌ Missing | Remove from table |
| `/validation:resolve_failed_validation` | ❌ Missing | Remove from table |

### Actual Available Commands

Based on filesystem scan of `.claude/commands/**/*.md`:

| Category | Actual Commands |
|----------|----------------|
| **Core** | `/do` |
| **Git** | `/git:commit`, `/git:pull_request` |
| **Issues** | `/issues:audit`, `/issues:bug`, `/issues:chore`, `/issues:classify_issue`, `/issues:feature`, `/issues:issue`, `/issues:prioritize`, `/issues:refactor` |
| **Tools** | `/tools:install`, `/tools:tools` |
| **Docs** | `/docs:load-ai-docs` |
| **Release** | `/release:release` |

### Missing statusline.py Reference

`.claude/settings.json:21` references:
```json
"command": "python3 $CLAUDE_PROJECT_DIR/.claude/statusline.py"
```

But `.claude/statusline.py` doesn't exist.

### Non-Existent Subdirectories in Commands README

`.claude/commands/README.md:57-67` documents these subdirectories that don't exist:

- `workflows/` ❌
- `homeserver/` ❌  
- `worktree/` ❌
- `automation/` ❌
- `app/` ❌
- `ci/` ❌
- `experts/` ❌

Actual subdirectories: `docs/`, `git/`, `issues/`, `release/`, `tools/`

### Expert Domains - Documented vs Actual

**CLAUDE.md:41-51** lists 7 expert domains:
- ✅ `claude-config`
- ✅ `agent-authoring` 
- ✅ `database`
- ✅ `api`
- ✅ `testing`
- ✅ `indexer`
- ✅ `github`

**Actually available** (based on `.claude/agents/experts/` scan):
- ✅ All 7 above domains exist
- ❌ `automation` - exists but undocumented
- ❌ `documentation` - exists but undocumented

### Automation Documentation Mismatch

**README.md:272-280** describes automation as:
```
automation/            # Agentic layer (Python AI developer workflows)
  adws/                # ADW automation scripts and modules
```

But `automation/README.md` shows it's actually **TypeScript with Claude Agent SDK**, not Python/adws.

## Implementation Plan

### 1. Fix CLAUDE.md (CLAUDE.md:32-37)

**Remove non-existent commands from Preserved Commands table:**

```diff
| Category | Commands |
|----------|----------|
| **Git** | `/git:commit`, `/git:pull_request` |
- | **Issues** | `/issues:feature`, `/issues:bug`, `/issues:chore`, `/issues:refactor`, `/issues:classify_issue`, `/issues:audit`, `/issues:prioritize` |
+ | **Issues** | `/issues:audit`, `/issues:bug`, `/issues:chore`, `/issues:classify_issue`, `/issues:feature`, `/issues:issue`, `/issues:prioritize`, `/issues:refactor` |
- | **Tools** | `/tools:install`, `/tools:bun_install`, `/tools:pr-review`, `/tools:question`, `/tools:tools` |
+ | **Tools** | `/tools:install`, `/tools:tools` |
| **Docs** | `/docs:load-ai-docs` |
| **Release** | `/release:release` |
- | **Validation** | `/validation:resolve_failed_validation` |
```

**Add missing expert domains to table (CLAUDE.md:44-51):**

```diff
| Domain | Purpose | Location |
|--------|---------|----------|
| `claude-config` | .claude/ configuration (commands, hooks, settings) | `.claude/agents/experts/claude-config/` |
| `agent-authoring` | Agent creation (frontmatter, tools, registry) | `.claude/agents/experts/agent-authoring/` |
| `database` | SQLite schema, FTS5, migrations, queries | `.claude/agents/experts/database/` |
| `api` | HTTP endpoints, MCP tools, Express patterns | `.claude/agents/experts/api/` |
| `testing` | Antimocking, Bun tests, SQLite test patterns | `.claude/agents/experts/testing/` |
| `indexer` | AST parsing, symbol extraction, code analysis | `.claude/agents/experts/indexer/` |
| `github` | Issues, PRs, branches, GitHub CLI workflows | `.claude/agents/experts/github/` |
+ | `automation` | Claude Agent SDK workflows, orchestration | `.claude/agents/experts/automation/` |
+ | `documentation` | Documentation generation and management | `.claude/agents/experts/documentation/` |
```

**Update expert domain count in line 41:**

```diff
- Seven expert domains provide specialized knowledge with plan, build, improve, and question agents:
+ Nine expert domains provide specialized knowledge with plan, build, improve, and question agents:
```

### 2. Fix .claude/settings.json (line 21)

**Remove statusline.py reference:**

```diff
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
- },
- "statusLine": {
-   "type": "command",
-   "command": "python3 $CLAUDE_PROJECT_DIR/.claude/statusline.py"
  }
}
```

### 3. Fix .claude/commands/README.md (lines 56-67)

**Replace non-existent subdirectories with actual ones:**

```diff
## Directory Structure

The commands are organized into the following subdirectories:

- **workflows/** - SDLC phase commands (plan, build, test, review, document)
+ **docs/** - Documentation helpers (load AI docs)
- **git/** - Version control operations (commit, branch management)
+ **git/** - Version control operations (commit, pull request)
- **issues/** - GitHub issue template commands (chore, bug, feature)
+ **issues/** - GitHub issue commands (audit, bug, chore, classify, feature, issue, prioritize, refactor)
- **homeserver/** - Trigger automation and webhook handlers
- **worktree/** - Git worktree management commands
- **automation/** - ADW workflow orchestration commands
- **app/** - Application layer commands (start server, database operations)
- **docs/** - Documentation helpers (anti-mock guidelines, conditional docs, prompt-code alignment)
- **ci/** - CI/CD workflow commands
+ **release/** - Release management commands
- **tools/** - Utility commands (install, PR review)
+ **tools/** - Utility commands (install, tools listing)
- **experts/** - Domain expert system (architecture, testing, security, integration)
```

### 4. Fix README.md (lines 272-280)

**Update automation description:**

```diff
```
automation/            # Agentic layer (Python AI developer workflows)
  adws/                # ADW automation scripts and modules
```

```
automation/            # Agentic layer (TypeScript Claude Agent SDK)
  src/                 # CLI automation scripts and orchestration
  .data/               # SQLite metrics and logs storage
```

### 5. Update Usage Examples in CLAUDE.md

**Add usage examples for new expert domains (after line 60):**

```diff
**Usage via /do:**
- Implementation: `/do "Add new hook for X"` (plan -> approval -> build -> improve)
- Questions: `/do "How do I create a slash command?"` (direct answer)
- Database: `/do "Create migration for user table"` (database expert)
- API: `/do "Add MCP tool for search"` (api expert)
- Testing: `/do "Write tests for indexer"` (testing expert)
- Indexer: `/do "How does AST parsing work?"` (indexer expert)
- GitHub: `/do "Create PR for this branch"` (github expert)
+ Automation: `/do "Run workflow on issue #123"` (automation expert)
+ Documentation: `/do "Generate API docs"` (documentation expert)
```

## Validation Criteria

### Pre-Implementation Validation

1. **File existence checks:**
   ```bash
   # Verify statusline.py doesn't exist
   [ ! -f .claude/statusline.py ] || echo "ERROR: statusline.py exists"
   
   # Verify expert domains exist
   ls .claude/agents/experts/ | grep -E "^(automation|documentation)$"
   
   # Verify actual command structure
   find .claude/commands -name "*.md" | wc -l
   ```

2. **Command discovery validation:**
   ```bash
   # List actual vs documented commands
   find .claude/commands -name "*.md" | grep -v README | sed 's|.claude/commands/||; s|\.md$||; s|/|:|g' | sort
   ```

### Post-Implementation Validation

1. **All references are accurate:**
   - No broken command references in CLAUDE.md
   - No missing file references in settings.json
   - Directory listings match filesystem
   - Expert domain count is correct

2. **Documentation consistency:**
   - README.md automation description matches automation/README.md
   - Command categories align across all files
   - Expert domains documented in CLAUDE.md exist in filesystem

3. **Functional validation:**
   - Settings.json is valid JSON
   - All referenced commands can be invoked
   - Expert domains accessible via /do routing

## Dependencies

**Files to modify:**
- `CLAUDE.md` (lines 32-37, 41, 44-51, 53-60)
- `.claude/settings.json` (remove lines 19-22)
- `.claude/commands/README.md` (lines 56-67)
- `README.md` (lines 272-280)

**Files to verify exist:**
- `.claude/agents/experts/automation/`
- `.claude/agents/experts/documentation/`  
- All slash command `.md` files referenced

**No new files created - this is purely a cleanup/sync operation.**

## Risk Assessment

**Low Risk Changes:**
- Documentation updates (CLAUDE.md, README.md)
- Removing non-functional references

**Medium Risk Changes:**  
- `.claude/settings.json` modification (affects Claude Code behavior)
- Command README updates (affects discoverability)

**Mitigation:**
- Test settings.json syntax before committing
- Verify /do command routing still works
- Test sample slash commands after changes

## Success Criteria

1. ✅ All references in CLAUDE.md point to existing commands/domains
2. ✅ .claude/settings.json contains no broken file references  
3. ✅ .claude/commands/README.md documents only existing subdirectories
4. ✅ README.md automation description matches actual TypeScript implementation
5. ✅ All 9 expert domains (including automation, documentation) documented
6. ✅ Command listings are complete and accurate across all files

---

**Estimated Implementation Time:** 30 minutes
**Validation Level:** Level 1 (config-only changes, no code impact)
**Breaking Changes:** None (pure documentation/config sync)
