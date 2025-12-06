---
description: Cascading bulk-update orchestrator for the entire .claude directory
argument-hint: [docs]
---

# All-Project Bulk Update

**Template Category**: Action
**Prompt Level**: 7 (Meta-Cognitive)

You are a Master Orchestrator that coordinates a three-tier cascading update of the entire `.claude/` directory. You spawn Tier 2 directory orchestrators in parallel, which in turn coordinate Tier 3 workers for specific subdirectories.

## Purpose

Systematically update all `.claude/` content by:
1. Spawning 4-5 Tier 2 orchestrators in parallel (one per major directory)
2. Each Tier 2 orchestrator coordinates Tier 3 workers for its subdirectories
3. Collecting and aggregating reports from all tiers
4. Providing consolidated summary of all updates

## Architecture

```
/tools:all-proj-bulk-update [docs]
          |
          +-- [Tier 2] agents-updater
          +-- [Tier 2] commands-updater --> [Tier 3] workers for each subdirectory
          +-- [Tier 2] hooks-updater
          +-- [Tier 2] docs-updater (.claude/docs/)
          +-- [Tier 2] root-docs-updater (optional, docs/)
```

## Tier 2 Target Directories

| Directory | Update Strategy |
|-----------|-----------------|
| `.claude/agents/` | Validate agent definitions match CLAUDE.md agent types |
| `.claude/commands/` | Coordinate Tier 3 workers for all subdirectories |
| `.claude/hooks/` | Validate Python syntax and settings.json registration |
| `.claude/docs/` | Verify prompt-levels.md and other docs are current |
| `docs/` (optional) | Sync project documentation with codebase |

## Workflow

### 1. Announce Operation

Inform the user that bulk project update is starting:

```
Starting all-project bulk update across .claude directory (spawning parallel Tier 2 orchestrators)...
```

### 2. Parse Arguments

Check `$ARGUMENTS` for optional `docs` scope:
- If `$ARGUMENTS` contains "docs": Include root `docs/` directory in update scope
- Otherwise: Only update `.claude/` contents

### 3. Spawn Tier 2 Orchestrators in Parallel

Use the Task tool to spawn ALL Tier 2 orchestrators in a SINGLE message. Each orchestrator runs in its own context window with:

- `subagent_type`: `general-purpose`
- `model`: `haiku` (fast, cost-effective for delegation)
- `description`: `{Directory} updater`

**CRITICAL**: All Tier 2 Task tool invocations MUST be sent in a single message to achieve true parallel execution.

### Tier 2 Orchestrator Prompts

#### agents-updater

```
You are a Tier 2 Orchestrator for the .claude/agents/ directory.

## Your Task

Validate that all agent definitions in .claude/agents/*.md match the registered agent types in CLAUDE.md.

## Instructions

1. Read CLAUDE.md to extract the list of registered agent types
2. Glob .claude/agents/*.md to find all agent definition files
3. For each agent file, verify:
   - The agent name matches a registered type
   - The description is current and accurate
   - The tools list is appropriate
4. Note any discrepancies or needed updates

## Response Format

Return ONLY a structured report:

- **Directory**: agents/
- **Status**: completed | failed | skipped
- **Files Checked**: <count>
- **Updates Made**: Yes | No
- **Summary**: One sentence describing outcome
- **Files Modified**: Comma-separated list or "None"
- **Discrepancies**: List of issues found or "None"
- **Error**: Error message if failed, otherwise "None"
```

#### commands-updater

```
You are a Tier 2 Orchestrator for the .claude/commands/ directory.

## Your Task

Coordinate Tier 3 workers for each commands subdirectory by spawning parallel sub-agents.

## Subdirectories to Process

| Subdirectory | Update Strategy |
|--------------|-----------------|
| app/ | Sync with app/ codebase changes (paths, scripts) |
| automation/ | Sync with automation/ directory changes |
| ci/ | Match CI workflow file changes (.github/workflows/) |
| docs/ | Verify referenced documentation exists |
| experts/ | Delegate to /experts:bulk-update |
| git/ | Validate commit/PR templates match conventions |
| homeserver/ | Validate homeserver task commands |
| issues/ | Sync issue templates with label conventions |
| release/ | Verify release workflow alignment |
| tasks/ | Validate task management commands |
| testing/ | Sync with test infrastructure changes |
| tools/ | Verify tool references are accurate |
| validation/ | Sync with validation patterns |
| workflows/ | Validate against SDLC patterns |
| worktree/ | Sync with worktree scripts |

## Instructions

1. For the experts/ subdirectory, invoke the SlashCommand tool with: /experts:bulk-update
2. For all other subdirectories, spawn Tier 3 workers in parallel using Task tool
3. Each Tier 3 worker should:
   - Glob files in the subdirectory
   - Check file content is current and accurate
   - Note any files needing updates
   - Return structured report

## Tier 3 Worker Prompt Template

For each subdirectory (except experts/), construct a worker prompt:

You are a Tier 3 Worker for the .claude/commands/{SUBDIRECTORY}/ directory.

## Your Task
Verify all command files in this subdirectory are current and accurate.

## Instructions
1. Glob .claude/commands/{SUBDIRECTORY}/*.md
2. For each file, verify content matches codebase reality
3. Note any outdated references or needed updates

## Response Format
- **Subdirectory**: {SUBDIRECTORY}/
- **Status**: completed | failed
- **Files Checked**: <count>
- **Updates Needed**: Yes | No
- **Details**: Brief summary
- **Error**: Error message if failed, otherwise "None"

## Response Format

Aggregate all Tier 3 reports into:

- **Directory**: commands/
- **Status**: completed | failed | partial
- **Subdirectories Processed**: <count>
- **Updates Made**: Yes | No
- **Summary**: One sentence overview
- **Subdirectory Details**: Table of Tier 3 results
- **Files Modified**: Aggregated list or "None"
- **Error**: Error message if failed, otherwise "None"
```

#### hooks-updater

```
You are a Tier 2 Orchestrator for the .claude/hooks/ directory.

## Your Task

Validate all Python hook files for syntax correctness and verify they are registered in .claude/settings.json.

## Instructions

1. Glob .claude/hooks/*.py to find all hook files
2. For each hook file:
   - Check Python syntax validity (import ast; ast.parse(content))
   - Extract the hook trigger type from filename/content
3. Read .claude/settings.json to find hook registrations
4. Verify each hook file is properly registered
5. Note any unregistered hooks or registration errors

## Response Format

Return ONLY a structured report:

- **Directory**: hooks/
- **Status**: completed | failed | skipped
- **Files Checked**: <count>
- **Updates Made**: Yes | No
- **Summary**: One sentence describing outcome
- **Syntax Errors**: List of files with errors or "None"
- **Unregistered Hooks**: List or "None"
- **Error**: Error message if failed, otherwise "None"
```

#### docs-updater

```
You are a Tier 2 Orchestrator for the .claude/docs/ directory.

## Your Task

Verify that documentation files in .claude/docs/ are current and accurate.

## Instructions

1. Glob .claude/docs/*.md to find all documentation files
2. For each file, verify:
   - Content is current with codebase reality
   - Cross-references to other files exist
   - Examples are accurate
3. Pay special attention to:
   - prompt-levels.md: Verify level descriptions match actual commands
   - Any other core documentation

## Response Format

Return ONLY a structured report:

- **Directory**: docs/
- **Status**: completed | failed | skipped
- **Files Checked**: <count>
- **Updates Made**: Yes | No
- **Summary**: One sentence describing outcome
- **Files Modified**: Comma-separated list or "None"
- **Outdated References**: List or "None"
- **Error**: Error message if failed, otherwise "None"
```

#### root-docs-updater (Only if `docs` argument provided)

```
You are a Tier 2 Orchestrator for the root docs/ directory.

## Your Task

Sync project documentation in docs/ with codebase changes.

## Instructions

1. Glob docs/**/*.md to find all documentation files
2. For key documentation files, verify:
   - Content matches codebase reality
   - Code examples are current
   - Cross-references are valid
3. Focus on:
   - docs/testing-setup.md: Matches test infrastructure
   - docs/guides/*.md: Guides are current

## Response Format

Return ONLY a structured report:

- **Directory**: docs/
- **Status**: completed | failed | skipped
- **Files Checked**: <count>
- **Updates Made**: Yes | No
- **Summary**: One sentence describing outcome
- **Files Modified**: Comma-separated list or "None"
- **Outdated Content**: List or "None"
- **Error**: Error message if failed, otherwise "None"
```

### 4. Collect Results

Wait for all Tier 2 orchestrators to complete and parse their structured responses.

Each response contains:
- Directory name
- Status (completed/failed/skipped)
- Files checked count
- Updates Made flag
- Summary of changes
- Files modified
- Error messages (if any)

### 5. Handle Failures

Tier 2 failures are isolated to their own context:
1. A failed orchestrator does not affect other orchestrators
2. Note failures in the Directory Status table
3. Continue aggregating results from successful orchestrators
4. Include failure details and error messages in the summary

### 6. Generate Consolidated Report

Aggregate all results into the structured output format below.

## Output Format

```markdown
# All-Project Bulk Update Report

## Summary

- **Directories Processed**: <count>
- **Command Subdirectories**: <count>
- **Updates Made**: <count>
- **No Updates Needed**: <count>
- **Failures**: <count>
- **Docs Scope**: Included / Not included
- **Timestamp**: <ISO 8601>

## Tier 2 Status

| Directory | Status | Updates | Details |
|-----------|--------|---------|---------|
| agents/ | completed/failed/skipped | Yes/No | <summary> |
| commands/ | completed/failed/skipped | Yes/No | <summary> |
| hooks/ | completed/failed/skipped | Yes/No | <summary> |
| docs/ | completed/failed/skipped | Yes/No | <summary> |
| root-docs/ | completed/failed/skipped | Yes/No | <summary> (if requested) |

Status Legend:
- completed: Completed successfully
- failed: Failed (see error details)
- skipped: Skipped (no updates needed)

## Command Subdirectory Details

### app/
<update summary or "No updates needed">

### automation/
<update summary or "No updates needed">

### ci/
<update summary or "No updates needed">

### docs/
<update summary or "No updates needed">

### experts/
<delegated to /experts:bulk-update>

### git/
<update summary or "No updates needed">

### homeserver/
<update summary or "No updates needed">

### issues/
<update summary or "No updates needed">

### release/
<update summary or "No updates needed">

### tasks/
<update summary or "No updates needed">

### testing/
<update summary or "No updates needed">

### tools/
<update summary or "No updates needed">

### validation/
<update summary or "No updates needed">

### workflows/
<update summary or "No updates needed">

### worktree/
<update summary or "No updates needed">

## Failures (if any)

<list of failed orchestrators/workers with error messages>

## Files Modified

<aggregated list of all files modified across all tiers>

## Recommendations

<suggestions for follow-up actions if any orchestrators failed or patterns were identified>
```

## Usage

```bash
# Update only .claude/ directory contents
/tools:all-proj-bulk-update

# Include root docs/ directory in update scope
/tools:all-proj-bulk-update docs
```

## Benefits of Three-Tier Architecture

1. **True Parallelism**: Each directory runs in its own context window simultaneously
2. **Context Isolation**: No cross-pollution between directory analyses
3. **Failure Isolation**: One failed orchestrator doesn't affect others
4. **Cost Efficiency**: Uses haiku model for delegation tasks
5. **Scalability**: Pattern scales to additional directories without context overflow
6. **Reuse**: Leverages existing /experts:bulk-update for experts directory
