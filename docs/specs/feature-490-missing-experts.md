# Feature Plan: Create Missing Expert Systems

## Issue Metadata
- **Issue Number**: #490
- **Title**: feat(experts): create missing UX, CC Hook, Claude Config, and Orchestrators experts
- **Labels**: component:documentation, priority:medium, effort:medium, status:needs-investigation
- **Parent Issue**: #483 (feat: implement expert system architecture)
- **Related Epic**: #481 (overhaul .claude/ directory)

## Overview

### Problem
The `bulk-update.md` command references 8 domain experts, but only 4 currently exist. This causes the bulk update orchestrator to fail when invoking the missing expert commands.

### Current State
- 4 experts implemented: Architecture, Testing, Security, Integration
- 4 experts missing: UX, CC Hook, Claude Config, Orchestrators (improve command)

### Desired Outcome
- All 8 experts fully implemented with `_plan`, `_review`, and `_improve` commands
- `bulk-update` command executes successfully across all experts
- Each expert has domain-specific knowledge sections that self-update

### Non-Goals
- Refactoring existing experts (Architecture, Testing, Security, Integration)
- Modifying the bulk-update orchestrator logic
- Adding new orchestrators beyond the existing planning_council and review_panel

## Technical Approach

### Architecture Notes
All new experts follow the established pattern from existing experts:
1. **_plan.md**: Level 5 (Higher Order) - Provides domain analysis for issue planning
2. **_review.md**: Level 5 (Higher Order) - Provides domain analysis for PR reviews
3. **_improve.md**: Level 6 (Self-Modifying) - Analyzes git history to update expertise sections

### Expert Domain Focus

| Expert | Directory | Domain Knowledge |
|--------|-----------|------------------|
| UX | `.claude/commands/experts/ux-expert/` | CLI output formatting, error messages, progress indicators, user feedback |
| CC Hook | `.claude/commands/experts/cc-hook-expert/` | Claude Code hooks, pre-commit automation, shell script patterns |
| Claude Config | `.claude/commands/experts/claude-config-expert/` | CLAUDE.md structure, settings.json, MCP configuration, agent registry |
| Orchestrators | `.claude/commands/experts/orchestrators/` | Multi-expert coordination improvement (new `improve_orchestrators.md`) |

### Command Registration
Each expert's slash commands will be auto-discovered by Claude Code from the `.claude/commands/` directory structure following the nested command pattern:
- `/experts:ux-expert:ux_expert_plan`
- `/experts:ux-expert:ux_expert_review`
- `/experts:ux-expert:ux_expert_improve`

### Template Structure
Each command follows the established frontmatter pattern:
```yaml
---
description: <one-line description>
argument-hint: <optional argument hint>
---
```

## Relevant Files

### Existing Expert Templates (Reference)
- `.claude/commands/experts/architecture-expert/architecture_expert_plan.md` — Template for _plan commands
- `.claude/commands/experts/architecture-expert/architecture_expert_review.md` — Template for _review commands
- `.claude/commands/experts/architecture-expert/architecture_expert_improve.md` — Template for _improve commands

### Orchestrator Files (Reference)
- `.claude/commands/experts/orchestrators/planning_council.md` — Multi-expert planning coordination
- `.claude/commands/experts/orchestrators/review_panel.md` — Multi-expert review aggregation
- `.claude/commands/experts/bulk-update.md` — Bulk improvement orchestrator (references all 8 experts)

### Related Documentation
- `.claude/docs/prompt-levels.md` — 7-level prompt maturity model
- `.claude/commands/docs/conditional_docs/app.md` — Conditional documentation routing

### New Files
- `.claude/commands/experts/ux-expert/ux_expert_plan.md` — UX domain analysis for planning
- `.claude/commands/experts/ux-expert/ux_expert_review.md` — UX domain analysis for reviews
- `.claude/commands/experts/ux-expert/ux_expert_improve.md` — UX self-improvement command
- `.claude/commands/experts/cc-hook-expert/cc_hook_expert_plan.md` — CC Hook domain analysis for planning
- `.claude/commands/experts/cc-hook-expert/cc_hook_expert_review.md` — CC Hook domain analysis for reviews
- `.claude/commands/experts/cc-hook-expert/cc_hook_expert_improve.md` — CC Hook self-improvement command
- `.claude/commands/experts/claude-config-expert/claude_config_plan.md` — Claude Config domain analysis for planning
- `.claude/commands/experts/claude-config-expert/claude_config_review.md` — Claude Config domain analysis for reviews
- `.claude/commands/experts/claude-config-expert/claude_config_improve.md` — Claude Config self-improvement command
- `.claude/commands/experts/orchestrators/improve_orchestrators.md` — Orchestrator self-improvement command

## Task Breakdown

### Phase 1: UX Expert Implementation
1. Create `.claude/commands/experts/ux-expert/` directory
2. Implement `ux_expert_plan.md` with CLI/terminal UX domain knowledge
3. Implement `ux_expert_review.md` with UX review focus areas
4. Implement `ux_expert_improve.md` with self-improvement workflow

### Phase 2: CC Hook Expert Implementation
1. Create `.claude/commands/experts/cc-hook-expert/` directory
2. Implement `cc_hook_expert_plan.md` with Claude Code hook patterns
3. Implement `cc_hook_expert_review.md` with hook review criteria
4. Implement `cc_hook_expert_improve.md` with self-improvement workflow

### Phase 3: Claude Config Expert Implementation
1. Create `.claude/commands/experts/claude-config-expert/` directory
2. Implement `claude_config_plan.md` with configuration domain knowledge
3. Implement `claude_config_review.md` with config review criteria
4. Implement `claude_config_improve.md` with self-improvement workflow

### Phase 4: Orchestrators Improve Command
1. Implement `improve_orchestrators.md` in existing orchestrators directory
2. Self-improvement mechanism for planning_council and review_panel
3. Pattern extraction from orchestrator usage in git history

### Phase 5: Validation and Integration
1. Test each expert command independently
2. Run `/experts:bulk-update` to verify all 8 experts complete
3. Update conditional documentation in app.md
4. Push branch and create PR

## Step by Step Tasks

### Task Group 1: Create UX Expert
- Create directory `.claude/commands/experts/ux-expert/`
- Create `ux_expert_plan.md` following architecture_expert_plan.md template
  - Expertise section: CLI output formatting, error messaging, progress indicators, accessibility
  - Workflow: Parse context → Identify UX touchpoints → Assess user experience → Pattern match → Risk assessment
- Create `ux_expert_review.md` following architecture_expert_review.md template
  - Review focus: Output formatting consistency, error message clarity, progress feedback, color/emoji usage
  - Pattern violations: Missing progress indicators, unclear error messages, inconsistent formatting
- Create `ux_expert_improve.md` following architecture_expert_improve.md template
  - Git log analysis: `git log --oneline -30 --all -- ".claude/**" "app/src/**/*.ts"`
  - Pattern categories: Output formatting, error handling UX, progress indicators, accessibility

### Task Group 2: Create CC Hook Expert
- Create directory `.claude/commands/experts/cc-hook-expert/`
- Create `cc_hook_expert_plan.md`
  - Expertise section: Hook types (PreToolUse, PostToolUse, UserPromptSubmit), trigger patterns, timeout configuration
  - Reference: `.claude/hooks/` directory patterns
- Create `cc_hook_expert_review.md`
  - Review focus: Hook safety, timeout appropriateness, matcher correctness, error handling
  - Pattern violations: Missing error handling, incorrect matchers, excessive timeouts
- Create `cc_hook_expert_improve.md`
  - Git log analysis: `git log --oneline -30 --all -- ".claude/hooks/**" ".claude/settings.json"`
  - Pattern categories: Hook triggers, error recovery, performance optimization

### Task Group 3: Create Claude Config Expert
- Create directory `.claude/commands/experts/claude-config-expert/`
- Create `claude_config_plan.md`
  - Expertise section: CLAUDE.md structure, settings.json configuration, MCP server setup, agent registry patterns
  - Reference: CLAUDE.md, `.claude/settings.json`, `.claude/settings.local.json.template`
- Create `claude_config_review.md`
  - Review focus: CLAUDE.md documentation accuracy, settings.json validity, MCP tool configuration
  - Pattern violations: Outdated documentation, invalid JSON, missing MCP configurations
- Create `claude_config_improve.md`
  - Git log analysis: `git log --oneline -30 --all -- "CLAUDE.md" ".claude/settings*.json" ".claude/commands/**"`
  - Pattern categories: Documentation structure, configuration patterns, command organization

### Task Group 4: Create Orchestrators Improve Command
- Create `improve_orchestrators.md` in `.claude/commands/experts/orchestrators/`
  - Self-improvement mechanism for planning_council and review_panel
  - Git log analysis: `git log --oneline -30 --all -- ".claude/commands/experts/orchestrators/**"`
  - Pattern extraction from orchestrator usage
  - Update rules for synthesis patterns, conflict resolution, expert coordination

### Task Group 5: Update Documentation
- Update `.claude/commands/docs/conditional_docs/app.md`
  - Add entries for new experts under Expert System section
  - Update Available Experts list to include: ux-expert, cc-hook-expert, claude-config-expert
- Update bulk-update.md if any path adjustments needed (verify current paths match new structure)

### Task Group 6: Validation and Push
- Test each new expert command:
  - `/experts:ux-expert:ux_expert_plan "test context"`
  - `/experts:cc-hook-expert:cc_hook_expert_plan "test context"`
  - `/experts:claude-config-expert:claude_config_plan "test context"`
  - `/experts:orchestrators:improve_orchestrators`
- Run `/experts:bulk-update` and verify all 8 experts complete
- Stage changes: `git add .claude/commands/experts/`
- Commit: `git commit -m "feat(experts): add UX, CC Hook, Claude Config experts and orchestrator improve (#490)"`
- Push: `git push -u origin feat/490-missing-experts`

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Expert command paths don't match bulk-update.md references | HIGH | Verify exact paths in bulk-update.md before implementation; use consistent naming |
| Self-improvement commands modify expert files incorrectly | MEDIUM | Follow established _improve.md pattern; test on non-critical files first |
| Domain knowledge sections incomplete | LOW | Start with core patterns; _improve commands will enhance over time |
| Slash command discovery fails for nested directories | MEDIUM | Test each command individually before bulk validation |

## Validation Strategy

### Automated Tests
- No automated tests required (slash commands are documentation, not code)
- Validation through manual invocation of each command

### Manual Checks
1. Invoke each `_plan` command with sample issue context
2. Invoke each `_review` command with sample PR context
3. Invoke each `_improve` command and verify Expertise section updates
4. Run `/experts:bulk-update` and verify all 8 experts report completion

### Release Guardrails
- All commands must produce structured output matching template formats
- Bulk update must complete with 8/8 experts reporting status
- No orphaned slash command references in bulk-update.md

## Validation Commands

```bash
# Validation Level 2 (minimum for features)
bun run lint
bun run typecheck
bun test --filter integration
bun test
bun run build

# Domain-specific validation
# Note: These are slash commands, not shell commands
# /experts:ux-expert:ux_expert_plan "sample issue"
# /experts:bulk-update
```

## Dependencies

- **Prerequisite**: Existing expert structure in `.claude/commands/experts/`
- **Blocked by**: None (this completes the expert architecture)
- **Enables**: Full functionality of `/experts:bulk-update` command
