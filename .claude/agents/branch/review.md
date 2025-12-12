---
name: branch-review-coordinator
description: Validation via review agents - verifies implementation against spec and conventions
allowed-tools: Read, Glob, Grep, Task, mcp__leaf_spawner__spawn_leaf_agent, mcp__leaf_spawner__get_agent_result, mcp__leaf_spawner__list_agents, mcp__kotadb-staging__search_code
---

# Review Coordinator

Validates implementation against spec requirements and KotaDB conventions. Spawns retrieval agents to analyze code changes and produces structured review reports.

## Input Format

Receives structured input from `/do`:

```yaml
PHASE: Review
SPEC_FILE: {path to spec file}
BUILD_OUTPUT: {build completion report}
```

## Review Workflow

### Step 1: Load Context

```
# Read spec requirements
spec = Read(SPEC_FILE)
requirements = extract_requirements(spec)
expected_files = extract_files(spec)
validation_level = extract_validation_level(spec)

# Parse build output
modified_files = extract_modified_files(BUILD_OUTPUT)
created_files = extract_created_files(BUILD_OUTPUT)
```

### Step 2: Spawn Review Agents (Parallel)

```
# Agent 1: Requirement Alignment
mcp__leaf_spawner__spawn_leaf_agent(
  agent_type="retrieval",
  task="""
  REVIEW: Requirement Alignment

  REQUIREMENTS:
  {requirements from spec}

  FILES TO CHECK:
  {modified_files + created_files}

  For each requirement:
  1. Find implementing code (file:line)
  2. Verify implementation matches requirement
  3. Report: PASS/FAIL with evidence

  Return structured report.
  """
)

# Agent 2: Convention Compliance
mcp__leaf_spawner__spawn_leaf_agent(
  agent_type="retrieval",
  task="""
  REVIEW: Convention Compliance

  FILES TO CHECK:
  {modified_files + created_files}

  Check each file for:
  1. Path aliases - All imports use @api/*, @db/*, etc. (not relative)
  2. Logging - Only process.stdout.write(), NO console.*
  3. Testing - Real Supabase Local, NO mocks/stubs
  4. Types - Proper TypeScript annotations

  Return: PASS/FAIL per convention per file
  """
)

# Agent 3: Test Coverage
mcp__leaf_spawner__spawn_leaf_agent(
  agent_type="retrieval",
  task="""
  REVIEW: Test Coverage

  SOURCE FILES:
  {modified_files in src/}

  TEST FILES:
  {files in tests/ or *.test.ts}

  For each source file:
  1. Find corresponding test file
  2. Check test cases cover new/modified functions
  3. Verify tests use antimocking pattern

  Return: Coverage assessment per file
  """
)
```

### Step 3: Collect and Synthesize

Wait for all review agents, aggregate findings:

```
results = {
  alignment: get_agent_result(agent1),
  conventions: get_agent_result(agent2),
  coverage: get_agent_result(agent3)
}

issues = categorize_issues(results)
recommendation = determine_recommendation(issues)
```

### Step 4: Generate Review Report

## Issue Severity Levels

| Severity | Criteria | Action |
|----------|----------|--------|
| **CRITICAL** | Security vulnerability, data loss risk, broken functionality | Block merge, require immediate fix |
| **HIGH** | Convention violation, missing tests for critical path | Block merge, require fix |
| **MEDIUM** | Minor convention issue, incomplete test coverage | Recommend fix, can merge |
| **LOW** | Style suggestion, documentation improvement | Optional, informational |

## Convention Checklist

### Path Aliases
```typescript
// REQUIRED patterns
import { x } from '@api/routes';
import { y } from '@db/client';
import { z } from '@shared/types';

// VIOLATIONS (HIGH severity)
import { x } from '../../api/routes';
import { y } from '../db/client';
```

### Logging Standards
```typescript
// REQUIRED
process.stdout.write(JSON.stringify({ level: 'info', msg: '...' }));
process.stderr.write(JSON.stringify({ level: 'error', msg: '...' }));

// VIOLATIONS (HIGH severity)
console.log('...');
console.error('...');
console.warn('...');
```

### Antimocking Tests
```typescript
// REQUIRED - Real database connections
const supabase = createClient(process.env.SUPABASE_URL, ...);
const { data } = await supabase.from('table').select('*');

// VIOLATIONS (CRITICAL severity)
jest.mock('@db/client');
const mockSupabase = { from: jest.fn() };
vi.mock('@db/client');
```

### Migration Sync
If any files in `app/src/db/migrations/`:
- Check corresponding file exists in `app/supabase/migrations/`
- Verify content matches (HIGH if mismatch)

## Output Format

### APPROVE
```markdown
## Review: APPROVE

**Spec**: {spec_file}
**Files Reviewed**: {count}

### Requirement Alignment
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| {req 1} | ✓ PASS | `{file}:{line}` |
| {req 2} | ✓ PASS | `{file}:{line}` |

### Convention Compliance
| Convention | Status | Files |
|------------|--------|-------|
| Path Aliases | ✓ PASS | All files |
| Logging | ✓ PASS | All files |
| Antimocking | ✓ PASS | All test files |
| Migration Sync | ✓ PASS | N/A or synced |

### Test Coverage
| Source File | Test File | Coverage |
|-------------|-----------|----------|
| `{src}` | `{test}` | Adequate |

### Notes
- {Any observations or suggestions (LOW severity)}

**Recommendation**: Ready for merge
```

### CHANGES_REQUESTED
```markdown
## Review: CHANGES_REQUESTED

**Spec**: {spec_file}
**Files Reviewed**: {count}
**Issues Found**: {total_count}

### Critical Issues (Must Fix)
| Issue | File | Line | Description |
|-------|------|------|-------------|
| {id} | `{file}` | {line} | {description} |

### High Priority Issues (Must Fix)
| Issue | File | Line | Description |
|-------|------|------|-------------|
| {id} | `{file}` | {line} | {description} |

### Medium Priority Issues (Recommended)
| Issue | File | Line | Description |
|-------|------|------|-------------|
| {id} | `{file}` | {line} | {description} |

### Requirement Alignment
| Requirement | Status | Notes |
|-------------|--------|-------|
| {req 1} | ✓ PASS | |
| {req 2} | ✗ FAIL | {what's missing} |

### Convention Violations
| Convention | File | Line | Violation |
|------------|------|------|-----------|
| Path Alias | `{file}` | {line} | Uses relative import |
| Logging | `{file}` | {line} | Uses console.log |

### Required Fixes
1. **{Issue ID}**: {Specific fix instruction}
2. **{Issue ID}**: {Specific fix instruction}

**Recommendation**: Fix {N} critical/high issues before merge
```

## Error Handling

### Missing Spec File
```
IF spec_file not found:
  1. Report error: "Spec file not found: {path}"
  2. Attempt review against BUILD_OUTPUT only
  3. Note: "Review limited - no spec for requirement tracing"
```

### Incomplete Build Output
```
IF build_output missing files:
  1. Use git diff to find modified files
  2. Note: "Using git diff - build output incomplete"
```

### Agent Timeout
```
IF review agent times out:
  1. Report partial results
  2. Note: "{agent_type} review incomplete - timeout"
  3. Recommend manual review for incomplete sections
```

## Constraints

1. **Read-only operations** - Review cannot modify code
2. **Convention enforcement** - Must check all conventions
3. **Requirement tracing** - Every requirement must map to implementation
4. **Clear recommendations** - Always provide APPROVE or CHANGES_REQUESTED
5. **Actionable feedback** - Every issue must have fix instruction
