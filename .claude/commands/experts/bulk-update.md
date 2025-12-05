---
description: Invoke all expert _improve commands in parallel to bulk update expert knowledge bases
---

# Bulk Expert Update

**Template Category**: Action
**Prompt Level**: 7 (Meta-Cognitive)

You are a Bulk Update Orchestrator that coordinates parallel improvement of all domain experts. You spawn sub-agents using the Task tool, where each sub-agent invokes a single `*_improve.md` slash command in its own context window.

## Purpose

Systematically update all expert knowledge bases by:
1. Spawning 8 sub-agents in parallel using Task tool (one per expert)
2. Each sub-agent invokes a single `*_improve.md` slash command in its own isolated context
3. Collecting and aggregating improvement reports
4. Providing consolidated summary of all updates

## Target Experts

| Expert | Slash Command |
|--------|---------------|
| Architecture | `/experts:architecture-expert:architecture_expert_improve` |
| Testing | `/experts:testing-expert:testing_expert_improve` |
| Security | `/experts:security-expert:security_expert_improve` |
| Integration | `/experts:integration-expert:integration_expert_improve` |
| UX | `/experts:ux-expert:ux_expert_improve` |
| CC Hook | `/experts:cc_hook_expert:cc_hook_expert_improve` |
| Claude Config | `/experts:claude-config:claude_config_improve` |
| Orchestrators | `/experts:orchestrators:improve_orchestrators` |

## Workflow

### 1. Announce Operation

Inform the user that bulk expert improvement is starting:

```
Starting bulk expert update across 8 domain experts (spawning parallel sub-agents)...
```

### 2. Spawn Sub-Agents in Parallel

Use the Task tool to spawn ALL 8 sub-agents in a SINGLE message. Each sub-agent runs in its own context window with:

- `subagent_type`: `general-purpose`
- `model`: `haiku` (fast, cost-effective for simple delegation)
- `description`: `{Expert Name} expert improve`

**CRITICAL**: All 8 Task tool invocations MUST be sent in a single message to achieve true parallel execution.

**Sub-Agent Prompt Template:**

For each expert, construct the prompt by replacing `{EXPERT_NAME}` and `{SLASH_COMMAND}`:

```
You are a delegation agent for the bulk expert update workflow.

## Your Task

Invoke the {EXPERT_NAME} expert improve command and report results.

## Command to Invoke

Use the SlashCommand tool with:
command: "{SLASH_COMMAND}"

## Instructions

1. Invoke the slash command using the SlashCommand tool
2. Wait for the command to complete fully
3. Observe the results and any file modifications

## Response Format

Return ONLY a structured report with these fields:

- **Expert**: {EXPERT_NAME}
- **Status**: completed | failed | skipped
- **Updates Made**: Yes | No
- **Summary**: One sentence describing outcome
- **Files Modified**: Comma-separated list or "None"
- **Error**: Error message if failed, otherwise "None"

Do not include any other text or explanation.
```

**The 8 Sub-Agent Configurations:**

| Expert Name | Slash Command | Description |
|-------------|---------------|-------------|
| Architecture | `/experts:architecture-expert:architecture_expert_improve` | Architecture expert improve |
| Testing | `/experts:testing-expert:testing_expert_improve` | Testing expert improve |
| Security | `/experts:security-expert:security_expert_improve` | Security expert improve |
| Integration | `/experts:integration-expert:integration_expert_improve` | Integration expert improve |
| UX | `/experts:ux-expert:ux_expert_improve` | UX expert improve |
| CC Hook | `/experts:cc_hook_expert:cc_hook_expert_improve` | CC Hook expert improve |
| Claude Config | `/experts:claude-config:claude_config_improve` | Claude Config expert improve |
| Orchestrators | `/experts:orchestrators:improve_orchestrators` | Orchestrators improve |

### 3. Collect Results

Wait for all sub-agents to complete and parse their structured responses.

Each response contains:
- Expert name
- Status (completed/failed/skipped)
- Updates Made flag
- Summary of changes
- Files modified
- Error messages (if any)

### 4. Handle Failures

Sub-agent failures are isolated to their own context:
1. A failed sub-agent does not affect other sub-agents
2. Note failures in the Expert Status table
3. Continue aggregating results from successful sub-agents
4. Include failure details and error messages in the summary

### 5. Generate Consolidated Report

Aggregate all results into the structured output format below.

## Output Format

```markdown
# Bulk Expert Update Report

## Summary

- **Experts Processed**: 8
- **Updates Made**: <count>
- **No Updates Needed**: <count>
- **Failures**: <count>
- **Timestamp**: <ISO 8601>

## Expert Status

| Expert | Status | Updates | Details |
|--------|--------|---------|---------|
| Architecture | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| Testing | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| Security | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| Integration | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| UX | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| CC Hook | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| Claude Config | ✅ / ❌ / ⏭️ | Yes/No | <summary> |
| Orchestrators | ✅ / ❌ / ⏭️ | Yes/No | <summary> |

Status Legend:
- ✅ Completed successfully
- ❌ Failed (see error details)
- ⏭️ Skipped (no updates needed)

## Updates Made

### Architecture Expert
<summary of updates or "No updates needed">

### Testing Expert
<summary of updates or "No updates needed">

### Security Expert
<summary of updates or "No updates needed">

### Integration Expert
<summary of updates or "No updates needed">

### UX Expert
<summary of updates or "No updates needed">

### CC Hook Expert
<summary of updates or "No updates needed">

### Claude Config Expert
<summary of updates or "No updates needed">

### Orchestrators
<summary of updates or "No updates needed">

## Failures (if any)

<list of failed experts with error messages>

## Files Modified

<aggregated list of all files modified across all experts>

## Recommendations

<suggestions for follow-up actions if any experts failed or patterns were identified>
```

## Usage

```bash
# Run bulk update after making significant changes to the codebase
/experts:bulk-update

# Typical usage scenarios:
# - After completing a major feature
# - After architectural refactoring
# - Before a release to ensure expert knowledge is current
# - During periodic maintenance
```

## Benefits of Sub-Agent Delegation

1. **True Parallelism**: Each expert runs in its own context window simultaneously
2. **Context Isolation**: No cross-pollution between expert analyses
3. **Failure Isolation**: One failed expert doesn't affect others
4. **Cost Efficiency**: Uses haiku model for simple delegation tasks
5. **Scalability**: Pattern scales to additional experts without context overflow
