---
name: branch-review-coordinator
description: Validation via expert review agents - verifies implementation against spec and conventions
allowed-tools: Read, Glob, Grep, Task, mcp__leaf_spawner__spawn_parallel_agents, mcp__leaf_spawner__get_agent_result, mcp__leaf_spawner__list_agents, mcp__kotadb-staging__search_code
---

# Review Coordinator

Validates implementation against spec requirements and KotaDB conventions. Spawns expert agents in parallel to analyze code changes and produces structured review reports.

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

# Collect diff context for review
git_diff = bash("git diff develop...HEAD")
file_list = modified_files + created_files
```

### Step 2: Spawn Expert Review Panel (Parallel)

All 7 experts are spawned in parallel using `mcp__leaf_spawner__spawn_parallel_agents`:

```
review_context = f"""
MODE: review

SPEC_FILE: {SPEC_FILE}
REQUIREMENTS:
{requirements}

MODIFIED_FILES:
{file_list}

GIT_DIFF:
{git_diff}

BUILD_OUTPUT:
{BUILD_OUTPUT}

Review the implementation for your domain and return verdict: APPROVE, CHANGES_REQUESTED, or COMMENT
"""

agent_results = mcp__leaf_spawner__spawn_parallel_agents([
  {
    "agent_type": "expert-architecture",
    "task": review_context
  },
  {
    "agent_type": "expert-testing",
    "task": review_context
  },
  {
    "agent_type": "expert-security",
    "task": review_context
  },
  {
    "agent_type": "expert-integration",
    "task": review_context
  },
  {
    "agent_type": "expert-ux",
    "task": review_context
  },
  {
    "agent_type": "expert-cc-hook",
    "task": review_context
  },
  {
    "agent_type": "expert-claude-config",
    "task": review_context
  }
], timeout=120)
```

### Step 3: Aggregate Expert Verdicts

Each expert returns structured review with verdict. Aggregation logic:

```python
verdicts = []
all_issues = []

for expert_name, result in agent_results.items():
  verdict = extract_verdict(result)  # APPROVE | CHANGES_REQUESTED | COMMENT
  issues = extract_issues(result)
  
  verdicts.append(verdict)
  all_issues.extend(issues)

# Aggregation logic:
# - If ANY expert returns CHANGES_REQUESTED → overall CHANGES_REQUESTED
# - If ALL return APPROVE → overall APPROVE
# - Otherwise → COMMENT (informational feedback only)

if any(v == "CHANGES_REQUESTED" for v in verdicts):
  overall_verdict = "CHANGES_REQUESTED"
elif all(v == "APPROVE" for v in verdicts):
  overall_verdict = "APPROVE"
else:
  overall_verdict = "COMMENT"
```

### Step 4: Generate Review Report

## Expert Domains

| Expert | Domain Focus |
|--------|--------------|
| **Architecture** | System design, path aliases, layering, module boundaries |
| **Testing** | Test coverage, antimocking patterns, test quality |
| **Security** | Auth, validation, secrets, SQL injection, XSS |
| **Integration** | API contracts, database schema, external services |
| **UX** | Error handling, response formats, API usability |
| **CC-Hook** | Conventional Commits, git hooks, commit message format |
| **Claude Config** | Claude.json, MCP settings, .clinerules, agent configs |

## Issue Severity Levels

| Severity | Criteria | Action |
|----------|----------|--------|
| **CRITICAL** | Security vulnerability, data loss risk, broken functionality | Block merge, require immediate fix |
| **HIGH** | Convention violation, missing tests for critical path | Block merge, require fix |
| **MEDIUM** | Minor convention issue, incomplete test coverage | Recommend fix, can merge |
| **LOW** | Style suggestion, documentation improvement | Optional, informational |

## Convention Checklist (Cross-Cutting)

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
**Experts Consulted**: 7

### Expert Verdicts
| Expert | Verdict | Summary |
|--------|---------|---------|
| Architecture | ✓ APPROVE | Clean layering, path aliases used |
| Testing | ✓ APPROVE | Adequate coverage, antimocking followed |
| Security | ✓ APPROVE | No vulnerabilities detected |
| Integration | ✓ APPROVE | API contracts maintained |
| UX | ✓ APPROVE | Error handling consistent |
| CC-Hook | ✓ APPROVE | Commit message follows conventions |
| Claude Config | ✓ APPROVE | No config changes or properly updated |

### Requirement Alignment
| Requirement | Status | Implementation |
|-------------|--------|----------------|
| {req 1} | ✓ PASS | `{file}:{line}` |
| {req 2} | ✓ PASS | `{file}:{line}` |

### Convention Compliance
| Convention | Status | Notes |
|------------|--------|-------|
| Path Aliases | ✓ PASS | All imports use aliases |
| Logging | ✓ PASS | No console.* usage |
| Antimocking | ✓ PASS | Real Supabase Local |
| Migration Sync | ✓ PASS | N/A or synced |

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
**Experts Consulted**: 7

### Expert Verdicts
| Expert | Verdict | Issues |
|--------|---------|--------|
| Architecture | ✗ CHANGES_REQUESTED | 2 HIGH |
| Testing | ✓ APPROVE | - |
| Security | ✗ CHANGES_REQUESTED | 1 CRITICAL |
| Integration | ✓ APPROVE | - |
| UX | ○ COMMENT | 1 MEDIUM |
| CC-Hook | ✓ APPROVE | - |
| Claude Config | ✓ APPROVE | - |

### Critical Issues (Must Fix)
| Issue | Expert | File | Line | Description |
|-------|--------|------|------|-------------|
| {id} | Security | `{file}` | {line} | {description} |

### High Priority Issues (Must Fix)
| Issue | Expert | File | Line | Description |
|-------|--------|------|------|-------------|
| {id} | Architecture | `{file}` | {line} | {description} |
| {id} | Architecture | `{file}` | {line} | {description} |

### Medium Priority Issues (Recommended)
| Issue | Expert | File | Line | Description |
|-------|--------|------|------|-------------|
| {id} | UX | `{file}` | {line} | {description} |

### Detailed Expert Feedback

#### Architecture Expert
{full review output}

#### Security Expert
{full review output}

#### UX Expert
{full review output}

### Required Fixes
1. **{Issue ID}**: {Specific fix instruction}
2. **{Issue ID}**: {Specific fix instruction}

**Recommendation**: Fix {N} critical/high issues before merge
```

### COMMENT (Informational Only)
```markdown
## Review: COMMENT

**Spec**: {spec_file}
**Files Reviewed**: {count}
**Experts Consulted**: 7

### Expert Verdicts
| Expert | Verdict | Issues |
|--------|---------|--------|
| Architecture | ○ COMMENT | - |
| Testing | ○ COMMENT | 1 LOW |
| Security | ✓ APPROVE | - |
| Integration | ✓ APPROVE | - |
| UX | ○ COMMENT | 1 MEDIUM |
| CC-Hook | ✓ APPROVE | - |
| Claude Config | ✓ APPROVE | - |

### Observations
- {informational feedback}

**Recommendation**: No blocking issues, proceed at discretion
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

### Expert Agent Timeout
```
IF any expert times out:
  1. Report partial results from completed experts
  2. Note: "{expert_name} review incomplete - timeout"
  3. Treat missing expert as COMMENT (neutral)
  4. Recommend manual review for incomplete sections
```

### Expert Agent Failure
```
IF any expert fails:
  1. Log error from failed expert
  2. Continue with remaining expert results
  3. Note: "{expert_name} review failed - {error}"
  4. Do NOT block merge on agent failures (log only)
```

## Constraints

1. **Read-only operations** - Review cannot modify code
2. **Parallel expert spawning** - All 7 experts run simultaneously
3. **Verdict aggregation** - ANY CHANGES_REQUESTED blocks merge
4. **Convention enforcement** - Experts check domain-specific conventions
5. **Requirement tracing** - Every requirement must map to implementation
6. **Clear recommendations** - Always provide APPROVE, CHANGES_REQUESTED, or COMMENT
7. **Actionable feedback** - Every issue must have fix instruction
8. **Expert attribution** - All issues must be attributed to source expert
