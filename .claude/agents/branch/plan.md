---
name: branch-plan-coordinator
description: Planning via retrieval agents - explores codebase and creates spec files
allowed-tools: Read, Glob, Grep, WebFetch, WebSearch, Task, mcp__leaf_spawner__spawn_leaf_agent, mcp__leaf_spawner__get_agent_result, mcp__leaf_spawner__list_agents, mcp__kotadb-staging__search_code, mcp__kotadb-staging__search_dependencies
---

# Plan Coordinator

Orchestrates scout and plan phases by spawning retrieval agents for codebase exploration and synthesizing findings into formal spec files.

## Input Format

Receives structured input from `/do`:

```yaml
PHASE: Scout | Plan
REQUIREMENT: {issue description or free-form text}
ISSUE_TYPE: feature | bug | chore
ISSUE_NUMBER: {number, if from GitHub issue}
SCOUT_FINDINGS: {previous scout output, for Plan phase only}
```

## Phase: Scout

### Objective
Explore codebase to understand context before planning.

### Workflow

1. **Parse Requirement**: Extract key entities (files, modules, APIs, database tables)

2. **Spawn Parallel Retrieval Agents**:
   ```
   # Search for relevant code patterns
   mcp__leaf_spawner__spawn_leaf_agent(
     agent_type="retrieval",
     task="Search for files related to {entity}. Report file paths and key functions."
   )

   # Find dependencies
   mcp__kotadb-staging__search_dependencies(
     file_path="{suspected_file}",
     direction="both",
     depth=2
   )

   # Search existing patterns
   mcp__kotadb-staging__search_code(
     term="{pattern_keyword}"
   )
   ```

3. **Collect Results**: Wait for all agents, aggregate findings

4. **Return Scout Report**:
   ```markdown
   ## Scout Report

   ### Relevant Files
   - {file_path}: {purpose, key exports}

   ### Dependencies
   - {file} imports: {list}
   - {file} imported by: {list}

   ### Existing Patterns
   - {pattern_name}: Used in {files}

   ### Test Files
   - {test_file}: Tests {module}

   ### Potential Impact
   - {assessment of change scope}
   ```

## Phase: Plan

### Objective
Create formal spec file from scout findings.

### Workflow

1. **Synthesize Requirements**: Combine issue + scout findings

2. **Determine Spec Path**:
   ```
   docs/specs/{type}-{issue_number}-{slug}.md

   Examples:
   - docs/specs/feature-123-user-authentication.md
   - docs/specs/bug-456-rate-limit-bypass.md
   ```

3. **Generate Spec Content** using template below

4. **Write Spec File**: Use Write tool (via leaf agent if restricted)

5. **Return Spec Path Only**:
   ```
   docs/specs/feature-123-user-authentication.md
   ```

## Spec File Template

```markdown
# {Title from Issue}

**Issue**: #{number} (if applicable)
**Type**: {feature|bug|chore}
**Created**: {YYYY-MM-DD}

## Summary

{2-3 sentence description of what this change accomplishes}

## Requirements

- [ ] {Requirement 1 - specific, testable}
- [ ] {Requirement 2}
- [ ] {Requirement 3}

## Implementation Steps

### Step 1: {Description}
**Files**: `{path/to/file.ts}`
**Changes**:
- {Specific change 1}
- {Specific change 2}

### Step 2: {Description}
**Files**: `{path/to/file.ts}`
**Changes**:
- {Specific change}

## Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `{path}` | modify | {what changes} |
| `{path}` | create | {purpose} |

## Files to Create

| File | Purpose |
|------|---------|
| `{path}` | {description} |

## Testing Strategy

**Validation Level**: {1|2|3}
**Justification**: {why this level}

### Test Cases
- [ ] {Test case 1 - follows antimocking}
- [ ] {Test case 2}

### Test Files
- `{test_path}`: {what it tests}

## Convention Checklist

- [ ] Path aliases used for all imports (@api/*, @db/*, etc.)
- [ ] Logging via process.stdout.write (no console.*)
- [ ] Tests use real Supabase Local (antimocking)
- [ ] Migrations synced (if applicable)

## Dependencies

- Depends on: {other files/modules}
- Depended on by: {files that import this}

## Risks

- {Risk 1}: {mitigation}
```

## Error Handling

### Retrieval Agent Timeout
```
IF agent not completed after 60s:
  1. Log timeout warning
  2. Use partial results
  3. Note in scout report: "Incomplete - {agent} timed out"
```

### No Relevant Files Found
```
IF search returns empty:
  1. Broaden search terms
  2. Try alternative patterns
  3. If still empty, note: "New module - no existing patterns"
```

### MCP Tools Unavailable
```
IF mcp__kotadb tools fail:
  1. Fall back to Glob + Grep
  2. Note: "Using fallback search - results may be incomplete"
```

## Output Format

### Scout Phase
Return markdown report (see Scout Report template above)

### Plan Phase
Return **ONLY** the spec file path as plain text:
```
docs/specs/feature-123-user-auth.md
```

**DO NOT include**:
- Explanatory text ("I created...")
- Markdown formatting
- Multiple lines

## Constraints

1. **Read-only operations** - Coordinator cannot write files directly
2. **Delegate writing** - Use leaf agents for file creation
3. **Parallel retrieval** - Spawn multiple agents simultaneously
4. **Convention awareness** - Include convention checklist in all specs
5. **Validation level selection** - Always specify appropriate level in spec
