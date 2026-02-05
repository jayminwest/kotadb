# Context Contracts

Declarative specifications for agent context requirements and output scope, enabling intelligent orchestration and scope safety.

## Overview

Context contracts are frontmatter declarations that specify:
1. **Requirements**: What context an agent needs before spawning (files, memory, prompts)
2. **Outputs**: What scope of files/tests an agent can modify
3. **Validation**: Pre-spawn and post-complete checks to ensure contract compliance

This enables orchestrators to validate requirements before spawning agents and enforce scope boundaries during execution.

## Contract Schema

Full schema: `.claude/schemas/context-contract.schema.json`

```yaml
contextContract:
  contextSource: spec_file | prompt | inbox | hybrid
  requires:
    - type: spec_file | expertise | memory | prompt | inbox | file | env
      key: VARIABLE_NAME
      description: Human-readable requirement description
      path: /path/to/file  # For file types
      scope: failures | decisions | patterns | all  # For memory types
      required: true | false
  produces:
    files:
      scope: "glob/pattern/**"
      exclude:
        - "**/*.test.ts"
    tests:
      scope: "test/pattern/**"
      colocated: "**/__tests__/**"
      requiresTests: true
    memory:
      allowed:
        - decision
        - failure
        - insight
  validation:
    preSpawn:
      - check: file_exists
        target: SPEC
    postComplete:
      - check: tests_pass
        command: "bun test"
```

## Requirement Types

### spec_file

Required specification file for implementation.

```yaml
requires:
  - type: spec_file
    key: SPEC
    description: Path to implementation specification
    required: true
```

**Usage:** Build agents that implement from specs.

### expertise

Domain expertise YAML file.

```yaml
requires:
  - type: expertise
    key: DOMAIN_EXPERTISE
    description: Database domain expertise
    path: .claude/agents/experts/database/expertise.yaml
    required: true
```

**Usage:** All domain expert agents should reference their expertise.

### memory

Past learnings from memory system.

```yaml
requires:
  - type: memory
    key: PAST_FAILURES
    description: Relevant failures to avoid
    scope: failures
    required: false
```

**Scopes:**
- `failures`: Past mistakes to avoid
- `decisions`: Architectural decisions
- `patterns`: Code patterns and conventions
- `all`: All memory types

**Usage:** Plan and improve agents benefit from memory context.

### prompt

User-provided context via prompt.

```yaml
requires:
  - type: prompt
    key: USER_PROMPT
    description: User's question or request
    required: true
```

**Usage:** Question agents and orchestrators that receive direct input.

### file

Specific file needed for context.

```yaml
requires:
  - type: file
    key: TARGET_FILE
    description: File to refactor
    required: false
```

**Usage:** Improve agents working on specific files.

### env

Environment variable.

```yaml
requires:
  - type: env
    key: GITHUB_TOKEN
    description: GitHub API authentication
    required: true
```

**Usage:** Agents that integrate with external services.

## Output Scopes

### File Scope

Declares which files an agent can modify.

```yaml
produces:
  files:
    scope: "app/src/db/**"
    exclude:
      - "**/*.test.ts"
      - "**/__tests__/**"
```

**Enforcement:** PreToolUse hook blocks Write/Edit outside scope.

**Pattern Examples:**
- `app/src/db/**` - Database domain
- `.claude/**` - Claude config domain
- `docs/**` - Documentation domain
- `**/*.md` - All markdown files
- `app/src/{api,mcp}/**` - Multiple directories

### Test Scope

Declares test file requirements.

```yaml
produces:
  tests:
    scope: "app/tests/db/**"
    colocated: "**/__tests__/**"
    requiresTests: true
```

**Fields:**
- `scope`: Where test files should be created
- `colocated`: Pattern for colocated tests (e.g., `__tests__/` next to source)
- `requiresTests`: Whether tests are mandatory for new source files

**Enforcement:** PostToolUse warns if source files added without tests.

### Memory Scope

Declares which memory types agent can record.

```yaml
produces:
  memory:
    allowed:
      - decision
      - failure
      - insight
```

**Enforcement:** Prevents read-only agents from recording to memory.

**Usage:**
- Build agents: All three types
- Improve agents: All three types
- Plan agents: Only insights
- Question agents: None (read-only)

## Context Source

Declares primary mechanism for receiving context.

```yaml
contextSource: spec_file
```

**Values:**
- `spec_file`: Agent expects SPEC variable with path to specification
- `prompt`: Agent expects USER_PROMPT with direct instructions
- `inbox`: Agent reads from inbox/queue system
- `hybrid`: Agent accepts multiple input methods

**Usage:**
- Build agents: `spec_file`
- Question agents: `prompt`
- Plan agents: `prompt`
- Improve agents: `hybrid` (prompt or file)

## Validation

### Pre-Spawn Validation

Runs before agent is spawned to ensure requirements are met.

```yaml
validation:
  preSpawn:
    - check: file_exists
      target: SPEC
    - check: memory_available
      target: PAST_FAILURES
```

**Check Types:**
- `file_exists`: Verifies required file exists
- `memory_available`: Checks memory system is accessible
- `env_set`: Verifies environment variable is set

**Behavior:** If validation fails, spawn is blocked with clear error message.

### Post-Complete Validation

Runs after agent completes to verify outputs.

```yaml
validation:
  postComplete:
    - check: tests_pass
      command: "cd app && bun test app/tests/db/"
    - check: type_check
      command: "cd app && bunx tsc --noEmit"
```

**Check Types:**
- `tests_pass`: Runs test command
- `type_check`: Runs type checker
- `scope_valid`: Verifies all modified files are in scope
- `lint_pass`: Runs linter

**Behavior:** If validation fails, warning is issued (not blocking by default).

## Contract Examples

### Build Agent (Full Contract)

```yaml
contextContract:
  contextSource: spec_file
  requires:
    - type: spec_file
      key: SPEC
      description: Implementation specification
      required: true
    - type: expertise
      key: DOMAIN_EXPERTISE
      description: Domain expertise file
      path: .claude/agents/experts/database/expertise.yaml
      required: true
    - type: prompt
      key: USER_PROMPT
      description: Original user request
      required: false
  produces:
    files:
      scope: "app/src/db/**"
      exclude:
        - "**/*.test.ts"
    tests:
      scope: "app/tests/db/**"
      requiresTests: true
    memory:
      allowed:
        - decision
        - failure
        - insight
  validation:
    preSpawn:
      - check: file_exists
        target: SPEC
    postComplete:
      - check: tests_pass
        command: "cd app && bun test app/tests/db/"
```

### Question Agent (Minimal Contract)

```yaml
contextContract:
  contextSource: prompt
  requires:
    - type: prompt
      key: USER_PROMPT
      description: Question to answer
      required: true
    - type: expertise
      key: DOMAIN_EXPERTISE
      description: Domain expertise file
      path: .claude/agents/experts/database/expertise.yaml
      required: true
```

### Plan Agent (Memory-Enhanced)

```yaml
contextContract:
  contextSource: prompt
  requires:
    - type: prompt
      key: USER_PROMPT
      description: Requirement to plan
      required: true
    - type: memory
      key: PAST_FAILURES
      description: Relevant past failures
      scope: failures
      required: false
    - type: memory
      key: PAST_DECISIONS
      description: Architectural decisions
      scope: decisions
      required: false
    - type: expertise
      key: DOMAIN_EXPERTISE
      description: Domain expertise file
      path: .claude/agents/experts/database/expertise.yaml
      required: true
```

## Implementation

### Validation Library

TypeScript library: `.claude/lib/contract-validator.ts`

```typescript
import { validateBeforeSpawn, validateScope, validateAfterComplete } from '.claude/lib/contract-validator';

// Before spawning agent
const result = await validateBeforeSpawn(
  'database-build-agent',
  contract,
  { SPEC: '/path/to/spec.md' }
);

if (!result.valid) {
  console.error('Cannot spawn agent:', result.errors);
  return;
}

// During execution (PreToolUse hook)
const scopeCheck = validateScope('/path/to/file.ts', contract);
if (!scopeCheck.allowed) {
  console.error('Scope violation:', scopeCheck.reason);
}

// After completion
const finalResult = await validateAfterComplete(
  'database-build-agent',
  contract,
  modifiedFiles
);
```

### Hooks

**Pre-Spawn (Orchestrator):**
- Parse agent contract from frontmatter
- Call `validateBeforeSpawn()` with provided context
- Block spawn if validation fails
- Inject memory context if available

**PreToolUse (`.claude/hooks/scope-enforcement.ts`):**
- Intercept Write/Edit tool calls
- Parse agent contract
- Call `validateScope()` for target file
- Block operation if outside scope

**PostToolUse:**
- Track modified files
- Call `validateAfterComplete()` after agent finishes
- Warn if scope violations or test requirements unmet

## Domain Scope Reference

Standard file scopes for each domain:

| Domain | File Scope | Test Scope |
|--------|------------|------------|
| database | `app/src/db/**` | `app/tests/db/**` |
| api | `app/src/api/**`, `app/src/mcp/**` | `app/tests/api/**`, `app/tests/mcp/**` |
| indexer | `app/src/indexer/**` | `app/tests/indexer/**` |
| testing | `app/tests/**` | - |
| claude-config | `.claude/**` | - |
| agent-authoring | `.claude/agents/**` | - |
| automation | `automation/src/**` | `automation/src/**/*.test.ts` |
| github | `.github/**` | - |
| documentation | `docs/**`, `web/docs/**` | - |
| web | `web/**` | - |

## Best Practices

### For Agent Authors

1. **Be Explicit**: Declare all requirements, even if optional
2. **Scope Tightly**: Use narrow file scopes to prevent accidental modifications
3. **Validate Early**: Use pre-spawn validation to catch missing requirements
4. **Test Requirements**: Set `requiresTests: true` for domains with test files
5. **Memory Permissions**: Only allow memory recording for agents that need it

### For Orchestrators

1. **Check Contracts**: Parse and validate contracts before spawning
2. **Inject Context**: Pre-fetch memory and inject into agent prompt
3. **Track Files**: Monitor modified files for post-validation
4. **Handle Failures**: Provide clear error messages on validation failure
5. **Aggregate Results**: Collect and summarize worker results

### For Templates

1. **Build Agents**: Full contract with file scope, test requirements, validation
2. **Question Agents**: Minimal contract with prompt + expertise only
3. **Plan Agents**: Include memory requirements for past context
4. **Improve Agents**: Hybrid context source, allow memory recording

## Troubleshooting

### "Required file not found: SPEC"

**Cause:** Build agent spawned without SPEC variable or file doesn't exist.

**Fix:** Ensure orchestrator passes `SPEC=/path/to/spec.md` in agent prompt.

### "File outside declared scope"

**Cause:** Agent attempted to modify file not matching contract scope.

**Fix:** Update contract scope to include file, or modify different file.

### "Source files modified but no tests added"

**Cause:** Agent modified source files but contract requires tests.

**Fix:** Add test files in declared test scope, or set `requiresTests: false`.

### "Pre-spawn validation failed"

**Cause:** Required context not available before spawn.

**Fix:** Ensure all required files, memory, or env vars are available.

## Related Documentation

- [Coordination Messages](./coordination-messages.md) - Agent communication protocols
- [Context Contract Schema](../schemas/context-contract.schema.json) - Full JSON Schema
- [Agent Frontmatter Schema](../schemas/agent-frontmatter.schema.json) - Frontmatter validation
- [Agent Templates](../agents/templates/) - Template agents with contracts
