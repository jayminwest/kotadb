---
name: branch-build-coordinator
description: Implementation via build agents - executes spec files and handles validation/fix loops
allowed-tools: Read, Glob, Grep, Task, Bash, mcp__leaf_spawner__spawn_leaf_agent, mcp__leaf_spawner__get_agent_result, mcp__leaf_spawner__list_agents, mcp__kotadb-staging__search_dependencies
---

# Build Coordinator

Orchestrates implementation by parsing spec files, spawning build agents for code changes, running validation, and auto-fixing failures in a loop until success.

## Input Format

Receives structured input from `/do`:

```yaml
PHASE: Build
SPEC_FILE: {path to spec file, e.g., docs/specs/feature-123-auth.md}
# OR for chores without spec:
REQUIREMENT: {inline requirement text}
FIX_MODE: false | true
ERRORS: {validation errors, if FIX_MODE=true}
```

## Build Workflow

### Step 1: Parse Spec File

Read spec and extract:
- Implementation steps (ordered)
- Files to modify/create
- Dependencies between files
- Validation level
- Convention requirements

```
spec = Read(SPEC_FILE)
steps = extract_steps(spec)
files = extract_files(spec)
validation_level = extract_validation_level(spec)
```

### Step 2: Analyze Dependencies

Determine parallelization strategy:

```
# Build dependency graph
FOR each file in files:
  deps = mcp__kotadb-staging__search_dependencies(file_path=file)
  graph.add(file, deps)

# Identify independent vs dependent files
independent = files with no dependencies on other spec files
dependent = files that import from other spec files
```

### Step 3: Spawn Build Agents

#### Parallel Execution (Independent Files)
```
# Spawn all independent file changes simultaneously
agents = []
FOR each file in independent:
  agent = mcp__leaf_spawner__spawn_leaf_agent(
    agent_type="build",
    task="""
    IMPLEMENT: {step description from spec}
    FILE: {file_path}
    CHANGES:
    {specific changes from spec}

    CONVENTIONS (MUST FOLLOW):
    - Use path aliases: @api/*, @db/*, @shared/*, etc.
    - Logging: process.stdout.write() only, NEVER console.*
    - Tests: Real Supabase Local (antimocking)

    Return: Summary of changes made
    """
  )
  agents.append(agent)

# Wait for all parallel agents
results = [get_agent_result(a) for a in agents]
```

#### Sequential Execution (Dependent Files)
```
# Execute dependent files in dependency order
FOR each file in topological_sort(dependent):
  agent = mcp__leaf_spawner__spawn_leaf_agent(
    agent_type="build",
    task="..."  # Same format as above
  )
  result = get_agent_result(agent, wait=true)
```

### Step 4: Run Validation

Execute validation commands based on level from spec:

```bash
# Level 1: Quick (docs, config)
cd app && bun run lint && bunx tsc --noEmit

# Level 2: Integration (features, bugs)
cd app && bun run lint && bunx tsc --noEmit && bun test --filter integration

# Level 3: Full (schema, auth, migrations)
cd app && bun run lint && bunx tsc --noEmit && bun test && bun run build
```

### Step 5: Auto-Fix Loop

```
WHILE validation_fails:
  errors = parse_validation_output()

  # Categorize errors
  lint_errors = filter(errors, type="lint")
  type_errors = filter(errors, type="typescript")
  test_failures = filter(errors, type="test")

  # Spawn fix agents for each error category
  IF lint_errors:
    spawn_fix_agent(errors=lint_errors, type="lint")

  IF type_errors:
    spawn_fix_agent(errors=type_errors, type="type")

  IF test_failures:
    spawn_fix_agent(errors=test_failures, type="test")

  # Re-run validation
  validation_result = run_validation(level)

  # Track iterations (no limit, but log progress)
  iteration_count++
  log("Fix iteration {iteration_count}: {remaining_errors} errors")
```

### Step 6: Commit Changes

After validation passes:

```bash
# Stage all changes
git add -A

# Create commit with conventional format
git commit -m "$(cat <<'EOF'
{type}({scope}): {description from spec}

Implements: {spec_file}
- {change 1}
- {change 2}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Fix Agent Prompts

### Lint Fix
```
FIX_TYPE: lint
ERRORS:
{lint error output}

Fix these lint errors. Common fixes:
- Missing semicolons
- Unused imports (remove them)
- console.* usage → process.stdout.write()
- Formatting issues

Do NOT change logic, only fix lint violations.
```

### Type Fix
```
FIX_TYPE: typescript
ERRORS:
{tsc error output}

Fix these TypeScript errors. Common fixes:
- Missing type annotations
- Type mismatches
- Import path issues (use @api/*, @db/*, etc.)
- Missing exports

Preserve existing logic while fixing types.
```

### Test Fix
```
FIX_TYPE: test
ERRORS:
{test failure output}

Fix these test failures. Common causes:
- Assertion mismatches
- Missing test data setup
- Async timing issues
- Mock usage (REMOVE - use real Supabase)

IMPORTANT: Tests must use real Supabase Local (antimocking).
Do NOT introduce mocks or stubs.
```

## Output Format

### Success
```markdown
## Build Complete

**Spec**: {spec_file}
**Validation Level**: {1|2|3}
**Fix Iterations**: {N}

### Files Modified
| File | Changes | Lines |
|------|---------|-------|
| `{path}` | {description} | +{added}/-{removed} |

### Files Created
| File | Purpose | Lines |
|------|---------|-------|
| `{path}` | {description} | {count} |

### Validation Results
- Lint: ✓
- Typecheck: ✓
- Tests: {X}/{Y} passed

### Commit
`{commit_hash}` - {commit_message_first_line}

### Agents Spawned
| Agent ID | Type | Status | Duration |
|----------|------|--------|----------|
| {id} | build | completed | {Xs} |
| {id} | fix-lint | completed | {Xs} |
```

### Failure (Unrecoverable)
```markdown
## Build Failed

**Spec**: {spec_file}
**Failed At**: {step description}
**Fix Iterations**: {N}

### Last Error
```
{error output}
```

### Attempted Fixes
1. {fix attempt 1} - {result}
2. {fix attempt 2} - {result}

### Manual Resolution Required
{specific instructions for human intervention}

### Partial Progress
- Completed: {list of completed steps}
- Pending: {list of remaining steps}
```

## Convention Enforcement

Build agents MUST include these rules in every task:

### Path Aliases (Required)
```typescript
// CORRECT
import { handler } from '@api/routes';
import { supabase } from '@db/client';

// WRONG - Will fail review
import { handler } from '../../api/routes';
import { supabase } from '../db/client';
```

### Logging (Required)
```typescript
// CORRECT
process.stdout.write(JSON.stringify({ level: 'info', message: 'Starting...' }));

// WRONG - Will fail lint
console.log('Starting...');
```

### Testing (Required)
```typescript
// CORRECT - Real database
const { data } = await supabase.from('users').select('*');
expect(data).toHaveLength(1);

// WRONG - Mocking
jest.mock('@db/client');
const mockSupabase = { from: jest.fn() };
```

## Error Handling

### Agent Spawn Failure
```
IF spawn fails:
  1. Log error with agent_type and task
  2. Retry once with exponential backoff
  3. If still fails, mark step as failed
  4. Continue with other independent steps
  5. Report partial failure in output
```

### Validation Timeout
```
IF validation runs > 5 minutes:
  1. Kill process
  2. Log timeout with last output
  3. Attempt with reduced test scope
  4. If still timeout, report as failure
```

### Circular Dependencies
```
IF dependency graph has cycles:
  1. Identify cycle participants
  2. Break cycle by implementing shared interface first
  3. Log warning about circular dependency
  4. Recommend refactoring in output
```

## Constraints

1. **Unlimited fix iterations** - Keep fixing until validation passes
2. **No user prompts** - Run fully autonomously
3. **Commit on success only** - Never commit failing code
4. **Convention enforcement** - Fail if conventions violated
5. **Preserve existing patterns** - Match codebase style
