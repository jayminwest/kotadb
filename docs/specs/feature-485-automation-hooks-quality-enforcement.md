# Feature Plan: Automation Hooks for Quality Enforcement

## Issue Reference
- **Issue**: #485
- **Title**: feat: implement automation hooks for quality enforcement
- **Labels**: component:ci-cd, priority:medium, effort:medium, status:needs-investigation
- **Parent**: #481 (epic: overhaul .claude/ directory)
- **Depends on**: #474 (Phase 1: foundation must be complete)

## Overview

### Problem
Currently, KotaDB has no automation hooks configured in the `.claude/` directory. Quality enforcement (linting, type checking) is entirely manual, requiring developers to remember to run these checks after file modifications. This leads to inconsistent code quality and delayed feedback loops.

### Desired Outcome
Implement Claude Code hooks that automatically execute quality enforcement tasks:
1. **PostToolUse hooks** trigger linting after Write|Edit operations on TypeScript/JavaScript files
2. **UserPromptSubmit hooks** provide contextual information for common operations
3. Shared utilities enable consistent hook development patterns

### Non-Goals
- Blocking hooks that prevent Claude from continuing (hooks should be advisory)
- Test execution hooks (too slow for real-time feedback)
- Complex build system integration (focus on fast, lightweight checks)

## Technical Approach

### Architecture Notes

Claude Code hooks are configured in `settings.json` files and execute shell commands at specific lifecycle events. Hooks receive JSON input via stdin and output JSON to stdout to communicate results.

**Hook Execution Flow:**
1. Event triggers (e.g., PostToolUse after Write completes)
2. Matcher filters by tool name (e.g., `Write|Edit`)
3. Command executes with JSON input on stdin
4. Hook returns JSON with `decision` and `additionalContext`
5. Claude receives feedback via `additionalContext`

### Key Modules to Touch

| Path | Purpose |
|------|---------|
| `.claude/hooks/` | New directory for hook scripts |
| `.claude/hooks/utils/` | Shared utilities for hooks |
| `.claude/settings.json` | Hook configuration (new file) |
| `.gitignore` | Add `__pycache__` exclusion for hooks |

### Data/API Impacts

None. Hooks operate locally and do not affect database schema, API endpoints, or external integrations.

## Relevant Files

- `.claude/settings.local.json` — Existing local settings (reference for structure)
- `.claude/commands/testing/logging-standards.md` — Python logging requirements (sys.stdout.write)
- `app/biome.json` — Biome linter configuration (ESLint replacement)
- `.gitignore` — Already excludes `__pycache__/` globally

### New Files

| Path | Purpose |
|------|---------|
| `.claude/hooks/auto_linter.py` | PostToolUse hook for auto-linting TypeScript/JavaScript files |
| `.claude/hooks/context_builder.py` | UserPromptSubmit hook for context enrichment |
| `.claude/hooks/utils/__init__.py` | Package marker for utils module |
| `.claude/hooks/utils/hook_helpers.py` | Shared utilities (JSON output, file detection) |
| `.claude/settings.json` | Project-level hooks configuration |

## Task Breakdown

### Phase 1: Foundation
- Create `.claude/hooks/` directory structure
- Create shared utilities module
- Verify `.gitignore` handles `__pycache__`

### Phase 2: Implementation
- Implement `auto_linter.py` PostToolUse hook
- Implement `context_builder.py` UserPromptSubmit hook
- Configure hooks in `.claude/settings.json`

### Phase 3: Integration & Validation
- Test hooks locally with Write/Edit operations
- Verify non-blocking behavior on errors
- Update conditional docs with hooks reference
- Push branch and prepare for PR

## Step by Step Tasks

### 1. Create Directory Structure
- Create `.claude/hooks/` directory
- Create `.claude/hooks/utils/` subdirectory
- Verify `__pycache__/` is in root `.gitignore` (already present)

### 2. Implement Shared Utilities
- Create `.claude/hooks/utils/__init__.py` (empty package marker)
- Create `.claude/hooks/utils/hook_helpers.py` with:
  - `read_hook_input()` — Parse JSON from stdin
  - `output_result(decision, message)` — Write JSON to stdout
  - `is_js_ts_file(path)` — Check if file is JavaScript/TypeScript
  - `get_project_root()` — Return project root from `$CLAUDE_PROJECT_DIR`

### 3. Implement Auto-Linter Hook
- Create `.claude/hooks/auto_linter.py`
- Read hook input to get `file_path` from `tool_input`
- Filter: only process `.ts`, `.tsx`, `.js`, `.jsx` files
- Run Biome linter: `bunx biome check --write <file_path>`
- Return non-blocking result with lint status
- Use `sys.stdout.write()` per logging standards

### 4. Implement Context Builder Hook
- Create `.claude/hooks/context_builder.py`
- Read prompt content from hook input
- Analyze prompt for common patterns (testing, database, API)
- Return `additionalContext` with relevant file suggestions
- Keep implementation lightweight (< 1 second execution)

### 5. Configure Hooks in settings.json
- Create `.claude/settings.json` with hooks configuration
- Configure PostToolUse for `Write|Edit` matcher
- Configure UserPromptSubmit with empty matcher
- Set appropriate timeouts (45 seconds for linter, 10 seconds for context)

### 6. Update Documentation
- Add hooks documentation entry to `.claude/commands/docs/conditional_docs/app.md`
- Document hook usage and configuration

### 7. Validate and Push
- Test PostToolUse hook by editing a TypeScript file
- Test UserPromptSubmit hook by submitting a prompt
- Verify hooks don't block on errors (exit code handling)
- Run validation: `bun run lint && bun run typecheck && bun test`
- Commit changes with conventional commit format
- Push branch: `git push -u origin feat/485-automation-hooks-quality-enforcement`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Hooks slow down development workflow | Set strict timeouts (45s max), use fast tools (Biome over ESLint) |
| Hook errors block Claude operations | Always return `decision: "continue"`, handle exceptions gracefully |
| Python path issues in different environments | Use `#!/usr/bin/env python3` shebang, rely on system Python |
| File path inconsistencies in worktrees | Use `$CLAUDE_PROJECT_DIR` environment variable for absolute paths |
| Biome not available in all environments | Check for Biome availability, skip gracefully if missing |

## Validation Strategy

### Automated Tests
Integration tests are not applicable for Claude Code hooks as they execute within the Claude Code runtime environment. Validation is performed manually.

### Manual Checks
1. **PostToolUse Hook Test:**
   - Edit a TypeScript file with intentional lint issues
   - Verify hook runs and reports lint status in `additionalContext`
   - Confirm file is auto-fixed if `--write` flag works

2. **UserPromptSubmit Hook Test:**
   - Submit prompt mentioning "test" or "database"
   - Verify context builder adds relevant file suggestions

3. **Error Handling Test:**
   - Temporarily break hook (syntax error)
   - Verify Claude continues operating (non-blocking)

4. **Timeout Test:**
   - Add artificial delay to hook
   - Verify timeout triggers and hook doesn't block

### Release Guardrails
- Hooks are local-only and don't affect production systems
- No monitoring/alerting required
- Rollback: Remove hooks from `settings.json`

## Validation Commands

```bash
# Run from app/ directory
cd app

# Lint check
bun run lint

# Type check
bunx tsc --noEmit

# Run all tests
bun test

# Build verification
bun run build

# Hook-specific validation (manual)
# 1. Edit a .ts file and observe hook output
# 2. Submit a prompt and check for context additions
```

## Implementation Notes

### Hook Input Format (PostToolUse)
```json
{
  "tool_input": {
    "file_path": "/path/to/file.ts",
    "content": "file content..."
  },
  "session": {
    "id": "session-id"
  },
  "event": "PostToolUse",
  "tool": "Write"
}
```

### Hook Output Format
```json
{
  "decision": "continue",
  "additionalContext": "✓ Lint passed (0 errors)"
}
```

### Settings.json Configuration
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/auto_linter.py",
            "timeout": 45
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "python3 $CLAUDE_PROJECT_DIR/.claude/hooks/context_builder.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### Logging Standards Compliance
All Python hooks must use `sys.stdout.write()` and `sys.stderr.write()` instead of `print()` per KotaDB logging standards defined in `.claude/commands/testing/logging-standards.md`.

## Issue Relationships

- **Parent**: #481 (epic: overhaul .claude/ directory)
- **Depends on**: #474 (Phase 1: .claude directory foundation — completed)
- **Related to**: #482 (CLAUDE.md navigation gateway)
- **Related to**: #484 (agent registry with capability indexes)
