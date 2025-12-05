# Chore Plan: Configure settings.json and settings.local.json Patterns

## Issue Metadata

- **Issue**: #486
- **Title**: chore: configure settings.json and settings.local.json patterns
- **Type**: Chore
- **Priority**: Medium
- **Effort**: Small
- **Components**: CI/CD, Documentation
- **Branch**: `chore/486-settings-json-configuration`
- **Parent Epic**: #481 (overhaul .claude/ directory)
- **Depends On**: #482 (hooks referenced in settings - already merged)

## Overview

### Problem
The `.claude/settings.json` and `.claude/settings.local.json` patterns need enhancement and documentation. While the current implementation has hooks configured, it lacks:
- Status line configuration
- Comprehensive permission patterns documentation
- Local override pattern documentation for developers
- Proper gitignore verification for `settings.local.json`

### Desired Outcome
- Complete `settings.json` with status line and project defaults
- Documented `settings.local.json` pattern with permission examples
- Status line showing project context (branch, environment)
- `.gitignore` verification for local settings

### Non-Goals
- Changing existing hook implementations (already done in #485)
- MCP server configuration (handled separately)
- Complex status line scripts (keep it simple)

## Technical Approach

### Current State Analysis
The existing `.claude/settings.json` has:
- PostToolUse hooks for auto-linting (Write|Edit matcher)
- UserPromptSubmit hooks for context building

The existing `.claude/settings.local.json` has:
- Basic permission patterns for kotadb MCP tools
- `enableAllProjectMcpServers: true`

### Changes Required

#### 1. Enhance settings.json
Add status line configuration while preserving existing hooks:
```json
{
  "statusLine": {
    "type": "command",
    "command": "python3 $CLAUDE_PROJECT_DIR/.claude/statusline.py"
  },
  "hooks": { /* existing hooks */ }
}
```

#### 2. Create Status Line Script
A simple Python script that displays:
- Project name (KotaDB)
- Current git branch
- Optional: environment indicator

#### 3. Verify .gitignore
Ensure `.claude/settings.local.json` is gitignored (currently not in .gitignore - needs adding).

#### 4. Document Permission Patterns
Create documentation in `.claude/commands/docs/` explaining:
- Permission glob syntax
- Common patterns for KotaDB development
- Local override best practices

#### 5. Update settings.local.json Template
Enhance with comprehensive permission patterns:
```json
{
  "permissions": {
    "allow": [
      "Bash(bun *)",
      "Bash(git *)",
      "Bash(gh *)",
      "Bash(docker *)",
      "Bash(supabase *)",
      "mcp__kotadb__*",
      "mcp__playwright__*",
      "mcp__supabase__*"
    ]
  },
  "enableAllProjectMcpServers": true
}
```

## Relevant Files

### Existing Files to Modify
- `.claude/settings.json` - Add statusLine configuration
- `.gitignore` - Add `.claude/settings.local.json` entry
- `.claude/commands/docs/conditional_docs/app.md` - Add settings documentation reference

### New Files to Create
- `.claude/statusline.py` - Status line script
- `.claude/commands/docs/settings-configuration.md` - Permission patterns documentation
- `.claude/settings.local.json.template` - Template for local settings

## Task Breakdown

### Phase 1: Foundation
- Verify current `.gitignore` status for settings.local.json
- Create status line script
- Test status line functionality

### Phase 2: Configuration Enhancement
- Update `.claude/settings.json` with statusLine
- Add `.claude/settings.local.json` to `.gitignore` if missing
- Create settings template file

### Phase 3: Documentation
- Create settings-configuration.md documentation
- Update conditional_docs/app.md with reference
- Document permission patterns with examples

## Step by Step Tasks

### 1. Gitignore Verification
- Check if `.claude/settings.local.json` is already in `.gitignore`
- Add entry if missing: `.claude/settings.local.json`

### 2. Create Status Line Script
- Create `.claude/statusline.py`
- Implement git branch detection
- Output format: `KotaDB | <branch>`
- Follow KotaDB logging standards (sys.stdout.write)

### 3. Update settings.json
- Add `statusLine` configuration block
- Point to statusline.py script
- Preserve existing hooks configuration

### 4. Create Settings Template
- Create `.claude/settings.local.json.template`
- Include comprehensive permission patterns
- Document MCP server enablement options

### 5. Create Documentation
- Create `.claude/commands/docs/settings-configuration.md`
- Document permission glob syntax
- Provide KotaDB-specific permission examples
- Explain local override pattern

### 6. Update Conditional Docs
- Add settings-configuration.md reference to conditional_docs/app.md
- Document when to consult settings documentation

### 7. Validation and Push
- Run validation commands
- Commit changes with conventional commit format
- Push branch for PR creation

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Status line script slows down Claude Code | Use simple, fast Python script with no external dependencies beyond subprocess |
| Permission patterns too permissive | Document security implications, recommend minimal permissions |
| settings.local.json accidentally committed | Verify .gitignore entry, add pre-commit check if needed |

## Validation Strategy

### Automated Tests
- Verify statusline.py runs without errors
- Verify settings.json is valid JSON
- Verify settings.local.json.template is valid JSON

### Manual Checks
- Test status line displays correctly in Claude Code
- Verify `.claude/settings.local.json` is properly gitignored
- Review permission documentation for clarity

### Validation Commands
```bash
cd app && bun run lint
cd app && bunx tsc --noEmit
python3 .claude/statusline.py  # Should output status line
git check-ignore .claude/settings.local.json  # Should show it's ignored
```

## Issue Relationships

- **Parent**: #481 (epic: overhaul .claude/ directory)
- **Depends On**: #482 (Phase 5: hooks - COMPLETED)
- **Related To**: #485 (automation hooks - COMPLETED)
