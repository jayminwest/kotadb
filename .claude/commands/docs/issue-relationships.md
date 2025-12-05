# Issue Relationship Documentation Standards

**Template Category**: Message-Only
**Prompt Level**: 1 (Static)

This document defines the relationship types and documentation standards for tracking issue dependencies, context, and evolution across the KotaDB project.

## When to Use This Documentation

Consult this guide when:
- Creating new GitHub issues or spec files
- Planning implementation work and identifying dependencies
- Building dependency graphs for issue prioritization
- Writing commit messages with relationship metadata
- Reviewing PRs for relationship documentation completeness
- Enabling AI agents to discover prerequisite context automatically

## Relationship Types

### Depends On
**Purpose**: Issues that MUST be completed before work can start on the current issue.

**When to use**:
- Technical prerequisite work is required (e.g., API endpoint must exist before building UI)
- Shared infrastructure or utilities must be in place first
- Database schema changes needed before feature implementation
- Blocking dependency that prevents starting implementation

**Example**:
```markdown
## Issue Relationships
- **Depends On**: #25 (API key generation) - Required for authentication middleware
```

**Benefits**:
- Prevents wasted effort on blocked issues
- Enables dependency-aware prioritization
- Helps AI agents avoid starting blocked work

---

### Related To
**Purpose**: Issues providing context or sharing technical concerns (not strict blockers).

**When to use**:
- Issues touch the same subsystem or component
- Similar architectural patterns or design decisions
- Shared technical concerns without direct dependency
- Useful context for understanding implementation approach

**Example**:
```markdown
## Issue Relationships
- **Related To**: #26 (rate limiting) - Both touch authentication layer
- **Related To**: #45 (stats reporting) - Similar observability patterns
```

**Benefits**:
- Provides architectural context during implementation
- Helps discover reusable patterns and utilities
- Enables better code review by understanding related work

---

### Blocks
**Purpose**: Issues waiting on current work to complete.

**When to use**:
- Downstream work cannot start until current issue is merged
- High-leverage work that unblocks multiple features
- Infrastructure changes enabling future capabilities

**Example**:
```markdown
## Issue Relationships
- **Blocks**: #74 (symbol extraction), #116 (dependency search) - Requires AST parsing foundation
```

**Benefits**:
- Identifies high-impact work for prioritization
- Visualizes downstream effects of delays
- Helps scope epic completion timelines

---

### Supersedes
**Purpose**: Current issue replaces or deprecates previous work.

**When to use**:
- Architectural migration replacing old implementation
- Cleanup work removing deprecated code
- Refactoring that makes previous approaches obsolete

**Example**:
```markdown
## Issue Relationships
- **Supersedes**: #20, #22, #24 (SQLite implementations) - Replaced by unified Postgres approach
```

**Benefits**:
- Clarifies evolution of technical decisions
- Prevents confusion about which approach is current
- Helps identify cleanup opportunities

---

### Child Of
**Purpose**: Current issue is part of larger epic or tracking issue.

**When to use**:
- Issue is one task in multi-phase epic
- Granular implementation of larger feature
- Subtask tracking for complex initiatives

**Example**:
```markdown
## Issue Relationships
- **Child Of**: #70 (AST parsing epic) - Phase 1: Parser infrastructure
```

**Benefits**:
- Connects tactical work to strategic initiatives
- Tracks epic completion progress
- Provides context for scope boundaries

---

### Follow-Up
**Purpose**: Planned next steps after current work completes (not blockers).

**When to use**:
- Future enhancements identified during implementation
- Technical debt or optimizations deferred for later
- Nice-to-have improvements outside current scope

**Example**:
```markdown
## Issue Relationships
- **Follow-Up**: #148 (hybrid resilience patterns) - Enhanced error handling after MCP foundation
```

**Benefits**:
- Captures future work without scope creep
- Documents known limitations for later iteration
- Prevents forgetting planned improvements

---

## Documentation Standards

### Spec Files
All spec files in `docs/specs/` MUST include an `## Issue Relationships` section if any relationships exist:

```markdown
## Issue Relationships

- **Depends On**: #25 (API key generation) - Required for authentication middleware
- **Related To**: #26 (rate limiting) - Both touch authentication layer
- **Blocks**: #74 (symbol extraction) - Provides AST parsing foundation
- **Child Of**: #70 (AST parsing epic) - Phase 1: Parser infrastructure
- **Follow-Up**: #148 (hybrid resilience) - Enhanced error handling patterns
```

**Formatting requirements**:
- Use H2 heading (`## Issue Relationships`)
- Each relationship type on separate line
- Format: `- **{Type}**: #{issue_number} ({short_title}) - {brief_rationale}`
- Order: Depends On → Related To → Blocks → Supersedes → Child Of → Follow-Up
- If no relationships exist, omit the section entirely (do not include empty section)

---

### GitHub Issues
Issue descriptions SHOULD include relationship metadata when creating issues via GitHub web UI or CLI:

```markdown
## Relationships

**Depends On**: #25
**Related To**: #26, #45
**Blocks**: #74, #116
```

Use GitHub issue templates (`.github/ISSUE_TEMPLATE/*.yml`) which include relationship fields.

---

### GitHub Pull Requests
PR descriptions MUST reference related issues in the description:

```markdown
## Related Issues

Closes #123
Depends-On: #25
Related-To: #26
```

Use the PR template (`.github/pull_request_template.md`) which includes a relationships section.

---

### Commit Messages
Commit messages MAY include relationship metadata in footer for important dependencies:

```
feat: add rate limiting middleware

Implement tier-based rate limiting with hourly quotas.

Depends-On: #25
Related-To: #26
```

**Format**: Use `{Relationship-Type}: #{issue_number}` in commit footer (after blank line from body).

---

## Machine-Readable Format

AI agents and automation scripts MUST parse relationship metadata using these rules:

1. **Spec files**: Extract from `## Issue Relationships` section
2. **Line format**: `- **{Type}**: #{number} ({title}) - {rationale}`
3. **Valid types**: `Depends On`, `Related To`, `Blocks`, `Supersedes`, `Child Of`, `Follow-Up`
4. **Issue number extraction**: Regex pattern `#(\d+)`
5. **Multi-issue support**: Comma-separated issue numbers (e.g., `#74, #116`)

**Example parsing logic**:
```python
import re

def parse_relationships(spec_content: str) -> dict[str, list[int]]:
    relationships = {}
    in_section = False

    for line in spec_content.split('\n'):
        if line.strip() == '## Issue Relationships':
            in_section = True
            continue
        if in_section and line.startswith('## '):
            break
        if in_section and line.startswith('- **'):
            match = re.match(r'- \*\*(.+?)\*\*: (.+)', line)
            if match:
                rel_type = match.group(1)
                issues = re.findall(r'#(\d+)', match.group(2))
                relationships[rel_type] = [int(i) for i in issues]

    return relationships
```

---

## Prioritization Strategy

When selecting issues to work on, follow this dependency-aware prioritization:

1. **Fetch open issues**: `gh issue list --state open --limit 100`
2. **Parse relationship metadata** from issue bodies and linked spec files
3. **Build dependency graph** to identify:
   - Unblocked issues (no unresolved "Depends On" relationships)
   - High-leverage issues (many "Blocks" relationships)
   - Isolated issues (no dependencies, safe for parallel work)
4. **Select highest-priority unblocked issue** based on:
   - Labels: `priority:high` > `priority:medium` > `priority:low`
   - Effort: `effort:small` preferred for quick wins
   - Strategic alignment: Issues tied to active epics
5. **Verify dependency resolution** before starting:
   - Check if "Depends On" issues are closed/merged
   - Validate related context is still current

---

## Benefits

### For Human Developers
- **Reduced Wasted Effort**: Avoid starting work on blocked issues
- **Better Context**: Understand prerequisite work and design decisions
- **Improved Traceability**: Clear history of feature evolution
- **Faster Onboarding**: New contributors understand issue context quickly

### For AI Agents
- **Automatic Context Discovery**: Find related issues for implementation planning
- **Dependency Validation**: Check if prerequisites are met before starting work
- **Scope Boundary Detection**: Understand what's in/out of scope via relationships
- **Reduced Planning Errors**: Avoid missing dependencies during autonomous execution

### For Project Management
- **Dependency Visualization**: Build graphs showing blockers and enablers
- **Epic Progress Tracking**: Monitor completion via "Child Of" relationships
- **Risk Assessment**: Identify high-leverage work with many "Blocks" relationships
- **Resource Allocation**: Prioritize unblocked work for parallel execution

---

## Examples

### Simple Feature with Prerequisites
```markdown
## Issue Relationships

- **Depends On**: #25 (API key generation) - Required for authentication
- **Related To**: #26 (rate limiting) - Shares authentication middleware
```

### Epic with Multiple Children
```markdown
## Issue Relationships

- **Child Of**: #70 (AST parsing epic) - Phase 2: Symbol extraction
- **Depends On**: #72 (test infrastructure) - Requires parser foundation
- **Blocks**: #116 (dependency search) - Provides symbol data for search
```

### Cleanup/Refactor Work
```markdown
## Issue Relationships

- **Supersedes**: #20, #22, #24 (SQLite implementations) - Migration to Postgres
- **Related To**: #27 (standardize Postgres) - Part of database consolidation effort
```

### Follow-Up Enhancement
```markdown
## Issue Relationships

- **Child Of**: #145 (ADW MCP integration) - Core implementation
- **Follow-Up**: #148 (hybrid resilience) - Enhanced error handling patterns
```

---

## Validation

When reviewing PRs or planning implementation, validate relationship documentation:

1. **Completeness**: Are all meaningful relationships documented?
2. **Accuracy**: Are "Depends On" issues actually merged/closed?
3. **Relevance**: Are "Related To" issues still applicable context?
4. **Format**: Does relationship section follow formatting standards?
5. **Machine-readability**: Can automation parse the relationships correctly?

Use the `/review` command to check relationship validation during PR review.

---

## Common Anti-Patterns

**AVOID**:
- Over-documenting trivial relationships (e.g., "Related To: #1 - Both are features")
- Using "Depends On" for soft dependencies (use "Related To" instead)
- Forgetting to update relationships when scope changes
- Inconsistent formatting that breaks parsing
- Adding relationships to issues after they're closed (update spec files instead)

**INSTEAD**:
- Document meaningful connections only
- Use precise relationship types
- Update relationships during implementation if context changes
- Follow formatting standards strictly
- Maintain relationship metadata in living spec files
