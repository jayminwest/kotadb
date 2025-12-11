# /do Command Migration Guide

This guide helps you migrate from individual workflow commands to the universal `/do` entry point.

## Overview

The `/do` command provides a single entry point that classifies your intent and routes to the appropriate workflow. This simplifies the command discovery problem and enforces the orchestrator delegation pattern.

## Command Equivalency Table

| Old Command | New /do Phrasing |
|-------------|------------------|
| `/workflows:orchestrator #123` | `/do #123` |
| `/workflows:orchestrator 123` | `/do issue 123` |
| `/workflows:plan <spec>` | `/do plan <spec>` |
| `/workflows:implement <spec>` | `/do implement <spec>` |
| `/issues:feature <title>` | `/do feature request <title>` |
| `/issues:bug <title>` | `/do bug report <title>` |
| `/issues:chore <title>` | `/do chore <title>` |
| `/experts:orchestrators:review_panel <pr>` | `/do review PR #<pr>` |
| `/workflows:document <target>` | `/do document <target>` |
| `/ci:deploy staging` | `/do deploy to staging` |
| `/release:release` | `/do release to production` |

## Intent Categories

The `/do` command classifies requirements into 7 categories:

| Category | Patterns | Example |
|----------|----------|---------|
| **github_issue** | `#\d+`, `issue`, `bug report`, `feature request` | `/do #123` |
| **spec_planning** | `plan`, `spec`, `design`, `architect` | `/do plan API endpoint` |
| **implementation** | `implement`, `build`, `fix`, `add`, `create` | `/do implement login` |
| **review** | `review`, `check`, `audit`, `PR #` | `/do review PR #456` |
| **documentation** | `document`, `docs`, `readme` | `/do document API` |
| **ci_cd** | `ci`, `pipeline`, `deploy`, `release` | `/do deploy staging` |
| **expert_analysis** | `expert`, `security review`, `architecture analysis` | `/do security review` |

## Migration Phases

### Phase 1: Parallel Operation (Current)

- Both old commands and `/do` work simultaneously
- Start using `/do` for new workflows
- Old commands have no deprecation warnings

### Phase 2: Soft Deprecation

- Old commands show informational notices
- Documentation prefers `/do` examples
- Migration metrics tracked

### Phase 3: Hard Deprecation

- Old commands show prominent warnings
- Redirect suggestions to `/do` equivalents
- Final migration push

## How to Use /do

### Basic Usage

```bash
# Work on a GitHub issue
/do #123

# Plan a new feature
/do plan user authentication system

# Implement from a spec
/do implement docs/specs/feature-auth.md

# Review a PR
/do review PR #456

# Document something
/do document API endpoints

# Deploy
/do deploy to staging
```

### Handling Ambiguity

If `/do` can't confidently classify your intent, it will ask:

```
What type of workflow does this requirement need?

1. GitHub Issue - Work on issue or create new
2. Planning - Create implementation spec
3. Implementation - Build/fix/create code
4. Review - Review PR or changes
5. Documentation - Update docs
6. CI/CD - Deploy or manage pipelines
7. Expert Analysis - Security/architecture review
```

Select the option that best matches your intent.

### Resumability

Each `/do` invocation creates a state file for resumability:

```
.claude/data/do_state/do-{timestamp}-{random}.json
```

If a workflow is interrupted, you can review the state file to understand where it stopped.

## Orchestrator Pattern Enforcement

The `/do` command enforces the orchestrator delegation pattern:

### What This Means

- Orchestrators (like `/do`) **cannot directly modify files**
- File modifications must be delegated to build agents via `Task` tool
- This ensures separation between planning and execution

### Blocked Tools

When `/do` or any orchestrator is active, these tools are blocked:
- `Write`
- `Edit`
- `MultiEdit`
- `NotebookEdit`

### Allowed Tools

These tools remain available:
- `Read`, `Grep`, `Glob`, `Bash`
- `Task` (for delegation)
- `SlashCommand` (for routing)
- `AskUserQuestion`, `TodoWrite`

### How Enforcement Works

1. **Context Detection**: `orchestrator_context.py` hook detects `/do` and sets context
2. **Tool Blocking**: `orchestrator_guard.py` hook blocks file modification tools
3. **Delegation Required**: File changes must go through `Task` tool to build agents

### Error Message Example

If you try to use `Write` in orchestrator context:

```
[BLOCKED] Tool 'Write' is not allowed in orchestrator context.

Context: do-router
Target: <file path>

Orchestrators must delegate file modifications to build agents.

To proceed:
1. Use the Task tool to spawn a build-agent with your file requirements
2. Or use SlashCommand to delegate to an implementation workflow
```

## Troubleshooting

### Issue: Misclassification

**Symptom**: `/do` routes to the wrong workflow

**Solution**: Use more explicit keywords
- Instead of: `/do something`
- Use: `/do implement something` or `/do plan something`

### Issue: Low Confidence

**Symptom**: `/do` asks for clarification when you expected routing

**Solution**: Add intent keywords
- Instead of: `/do auth`
- Use: `/do implement auth endpoint`

### Issue: Tool Blocked

**Symptom**: Error about blocked tools in orchestrator context

**Solution**: This is expected behavior. Use the suggested delegation pattern:
```
Use Task tool with subagent_type='build-agent':
"Create/modify <file> with: [your specification]"
```

### Issue: State File Missing

**Symptom**: Cannot resume interrupted workflow

**Solution**: Check `.claude/data/do_state/` for recent state files. The state file contains checkpoint information including the last completed phase.

## Frequently Asked Questions

### Q: Do I have to use /do?

No, existing commands still work. Use `/do` when you want automatic routing or don't remember the specific command.

### Q: What if /do routes incorrectly?

You can always use the specific command directly, or add more explicit keywords to help classification.

### Q: Why are Write/Edit blocked?

This enforces separation of concerns. Orchestrators plan and coordinate; build agents execute. This pattern improves traceability and allows for review checkpoints.

### Q: How do I bypass the orchestrator guard?

The guard is enforced at the framework level. If you need direct file access, use specific implementation commands like `/workflows:implement` which don't set orchestrator context.

### Q: Where is the state stored?

- Context: `.claude/data/orchestrator_context.json`
- Workflow state: `.claude/data/do_state/`

## References

- Command definition: `.claude/commands/do.md`
- Agent definition: `.claude/agents/do-router.md`
- Context hook: `.claude/hooks/orchestrator_context.py`
- Guard hook: `.claude/hooks/orchestrator_guard.py`
- CLAUDE.md: Orchestrator Pattern Enforcement section
