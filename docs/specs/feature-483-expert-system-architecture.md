# Feature Plan: Expert System Architecture with Domain Specialists

## Overview

### Problem
- No formalized expert system for domain-specialized analysis
- Domain knowledge scattered across multiple slash commands without systematic organization
- No self-improvement mechanism for accumulating learnings from completed work
- Planning and review processes lack multi-perspective synthesis

### Desired Outcome
- Structured `experts/` subdirectory under `.claude/commands/` containing domain experts
- Each expert has `_plan`, `_review`, and `_improve` command patterns
- Planning Council and Review Panel orchestrators coordinate multi-expert analysis
- Self-improvement commands extract patterns from git history to evolve expertise

### Non-goals
- Replacing existing agents in `.claude/agents/` (experts are commands, not agents)
- Modifying existing slash commands to use experts (future follow-up work)
- Creating experts for domains not relevant to KotaDB (web/UI, mobile, etc.)

## Technical Approach

### Architecture Notes

**Expert vs Agent Distinction:**
- **Agents** (`.claude/agents/`): Stateless workers with tool access definitions, invoked via Task tool
- **Experts** (`.claude/commands/experts/`): Slash commands with accumulated domain knowledge in Expertise sections

**Three-Command Pattern per Expert:**
1. `{domain}_expert_plan.md` (Level 5) - Analyze requirements from domain perspective
2. `{domain}_expert_review.md` (Level 5) - Review code changes from domain perspective
3. `{domain}_expert_improve.md` (Level 6-7) - Self-improve by analyzing git history

**Prompt Maturity Levels:**
- Level 5 (Higher Order): Accept context via `$ARGUMENTS`, reference Expertise section
- Level 6-7 (Self-Improving): Update own or other files' Expertise sections

### Key Modules to Touch
- `.claude/commands/` - Add `experts/` subdirectory structure
- `.claude/commands/README.md` - Document expert system pattern
- `.claude/commands/docs/conditional_docs/app.md` - Add expert system documentation reference

### Data/API Impacts
- None - this is purely documentation/command infrastructure

## Relevant Files

### Existing Files
- `.claude/commands/README.md` — Needs experts subdirectory documentation
- `.claude/agents/README.md` — Reference for agent pattern (experts are different)
- `.claude/agents/agent-registry.json` — Model for structuring expert registry
- `docs/claude-directory-configuration-guide.md` — Source of expert system patterns (lines 731-943)
- `docs/specs/chore-474-claude-directory-standardization.md` — Foundation work completed

### New Files

#### Directory Structure
- `.claude/commands/experts/` — Root directory for all experts
- `.claude/commands/experts/orchestrators/` — Multi-expert coordination commands
- `.claude/commands/experts/architecture-expert/` — Architecture domain expert
- `.claude/commands/experts/testing-expert/` — Testing domain expert
- `.claude/commands/experts/security-expert/` — Security domain expert
- `.claude/commands/experts/integration-expert/` — Integration domain expert

#### Expert Commands (16 files)
- `.claude/commands/experts/architecture-expert/architecture_expert_plan.md`
- `.claude/commands/experts/architecture-expert/architecture_expert_review.md`
- `.claude/commands/experts/architecture-expert/architecture_expert_improve.md`
- `.claude/commands/experts/testing-expert/testing_expert_plan.md`
- `.claude/commands/experts/testing-expert/testing_expert_review.md`
- `.claude/commands/experts/testing-expert/testing_expert_improve.md`
- `.claude/commands/experts/security-expert/security_expert_plan.md`
- `.claude/commands/experts/security-expert/security_expert_review.md`
- `.claude/commands/experts/security-expert/security_expert_improve.md`
- `.claude/commands/experts/integration-expert/integration_expert_plan.md`
- `.claude/commands/experts/integration-expert/integration_expert_review.md`
- `.claude/commands/experts/integration-expert/integration_expert_improve.md`

#### Orchestrators (2 files)
- `.claude/commands/experts/orchestrators/planning_council.md`
- `.claude/commands/experts/orchestrators/review_panel.md`

## Task Breakdown

### Phase 1: Directory Structure and Documentation
- Create expert directory hierarchy
- Document expert system pattern in README
- Establish invocation syntax conventions

### Phase 2: Architecture Expert
- Create `architecture_expert_plan.md` with KotaDB-specific patterns
- Create `architecture_expert_review.md` with review focus areas
- Create `architecture_expert_improve.md` with git analysis workflow

### Phase 3: Testing Expert
- Create `testing_expert_plan.md` with antimocking philosophy
- Create `testing_expert_review.md` with test quality criteria
- Create `testing_expert_improve.md` with test pattern extraction

### Phase 4: Security Expert
- Create `security_expert_plan.md` with RLS and auth patterns
- Create `security_expert_review.md` with security checklist
- Create `security_expert_improve.md` with vulnerability pattern learning

### Phase 5: Integration Expert
- Create `integration_expert_plan.md` with MCP/Supabase patterns
- Create `integration_expert_review.md` with integration testing focus
- Create `integration_expert_improve.md` with API pattern extraction

### Phase 6: Orchestrators
- Create `planning_council.md` for multi-expert planning synthesis
- Create `review_panel.md` for multi-expert review synthesis

### Phase 7: Integration and Validation
- Update `.claude/commands/README.md` with expert documentation
- Update conditional docs with expert references
- Validate all commands invoke without errors
- Push to remote

## Step by Step Tasks

### Task Group 1: Create Directory Structure
- Create `.claude/commands/experts/` directory
- Create `.claude/commands/experts/orchestrators/` subdirectory
- Create `.claude/commands/experts/architecture-expert/` subdirectory
- Create `.claude/commands/experts/testing-expert/` subdirectory
- Create `.claude/commands/experts/security-expert/` subdirectory
- Create `.claude/commands/experts/integration-expert/` subdirectory

### Task Group 2: Create Architecture Expert
- Create `architecture_expert_plan.md` (Level 5):
  - Frontmatter: `description`, `argument-hint`
  - Variables section with `USER_PROMPT: $ARGUMENTS`
  - Expertise section with KotaDB patterns:
    - Path alias architecture (`@api/*`, `@db/*`, etc.)
    - Component boundaries (API, Auth, Indexer, Queue, Validation)
    - Data flow patterns (request → auth → rate limit → handler → response)
    - Anti-patterns from codebase history
  - Workflow: Analyze → Identify patterns → Formulate recommendations
  - Report Format: Analysis, Recommendations, Risks

- Create `architecture_expert_review.md` (Level 5):
  - Focus on: Breaking API contracts, circular dependencies, pattern violations
  - Reference existing patterns from Expertise section
  - Output: APPROVE/CHANGES_REQUESTED/COMMENT with findings

- Create `architecture_expert_improve.md` (Level 6-7):
  - Analyze recent commits: `git log --oneline -30 --all -- "app/src/**"`
  - Extract patterns from successful implementations
  - Update Expertise sections in `_plan` and `_review` commands
  - Document anti-patterns discovered

### Task Group 3: Create Testing Expert
- Create `testing_expert_plan.md` (Level 5):
  - Expertise section with antimocking philosophy (from `.claude/commands/docs/anti-mock.md`)
  - Real Supabase Local connection patterns
  - Test data seeding strategies
  - Integration vs unit test boundaries
  - MCP testing patterns

- Create `testing_expert_review.md` (Level 5):
  - Focus on: Mock usage (forbidden), test isolation, coverage gaps
  - Checklist from antimocking guidelines
  - Output: Test quality assessment with specific recommendations

- Create `testing_expert_improve.md` (Level 6-7):
  - Analyze test files: `git log --oneline -30 --all -- "app/tests/**"`
  - Extract successful test patterns
  - Document flaky test resolutions
  - Update antimocking best practices

### Task Group 4: Create Security Expert
- Create `security_expert_plan.md` (Level 5):
  - Expertise section with RLS policy patterns (from `.claude/commands/docs/database.md`)
  - Authentication flow (API key validation, tier verification)
  - Rate limiting security considerations
  - Input validation patterns

- Create `security_expert_review.md` (Level 5):
  - Focus on: Missing RLS policies, SQL injection risks, auth bypass
  - OWASP Top 10 checklist adapted for KotaDB
  - Output: Security assessment with severity ratings

- Create `security_expert_improve.md` (Level 6-7):
  - Analyze security-related commits
  - Extract patterns from RLS policy implementations
  - Document vulnerability patterns discovered in reviews

### Task Group 5: Create Integration Expert
- Create `integration_expert_plan.md` (Level 5):
  - Expertise section with MCP server patterns (from `.claude/commands/docs/mcp-integration.md`)
  - Supabase client initialization patterns
  - External API integration patterns (GitHub, Fly.io)
  - Queue system integration patterns

- Create `integration_expert_review.md` (Level 5):
  - Focus on: Error handling at boundaries, retry logic, timeout configs
  - MCP tool response format compliance
  - Output: Integration quality assessment

- Create `integration_expert_improve.md` (Level 6-7):
  - Analyze integration code: `git log --oneline -30 --all -- "app/src/mcp/**" "app/src/api/**"`
  - Extract successful integration patterns
  - Document edge cases and error handling improvements

### Task Group 6: Create Orchestrators
- Create `planning_council.md`:
  - Description: Coordinate multiple experts for comprehensive planning
  - Workflow:
    1. Invoke all 4 experts in parallel using SlashCommand tool
    2. Wait for all expert responses
    3. Synthesize findings: identify cross-cutting concerns
    4. Produce single unified analysis (NOT separate files per expert)
  - CRITICAL: Output constraint - single spec file inclusion
  - Report format with synthesized recommendations

- Create `review_panel.md`:
  - Description: Coordinate multiple experts for comprehensive review
  - Workflow similar to planning council but for review context
  - Aggregate status: APPROVE only if all experts approve
  - Single consolidated review output

### Task Group 7: Update Documentation
- Update `.claude/commands/README.md`:
  - Add `experts/` to directory structure listing
  - Document expert invocation syntax: `/experts:architecture-expert:architecture_expert_plan`
  - Add section on 7-level prompt maturity model reference
  - Document three-command pattern per expert

- Add entry to `.claude/commands/docs/conditional_docs/app.md`:
  - Conditions: When working with expert system or domain analysis
  - Reference to expert commands and orchestrators

### Task Group 8: Validation and Push
- Verify all expert command files parse correctly (markdown syntax)
- Test one expert invocation: `/experts:architecture-expert:architecture_expert_plan "test context"`
- Run validation:
  - `cd app && bun run lint`
  - `cd app && bunx tsc --noEmit`
- Stage changes: `git add .claude/commands/experts/`
- Commit: `feat(commands): implement expert system architecture (#483)`
- Push: `git push -u origin chore/484-agent-registry-capability-indexes`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Expert invocation syntax too verbose | Document shorthand aliases in CLAUDE.md Quick Reference |
| Expertise sections become stale | `_improve` commands specifically target staleness; schedule regular runs |
| Planning Council creates multiple files | Explicit "CRITICAL: single output file" constraint in orchestrator |
| Self-improvement destroys existing knowledge | `_improve` workflow explicitly preserves and appends, not replaces |
| Too many experts overwhelm orchestrators | Start with 4 core experts; add more only if clear need emerges |
| Commands not discovered by Claude Code | Follow `.md` extension convention and directory discovery patterns |

## Validation Strategy

### Automated Tests
- No automated tests required (documentation/command infrastructure)
- Manual verification of command discovery

### Manual Checks
- Invoke each expert `_plan` command with sample context
- Invoke each expert `_review` command with PR context
- Invoke Planning Council and verify single output
- Invoke Review Panel and verify consolidated status

### Release Guardrails
- Document that experts are experimental (v0.1.0)
- Monitor for Claude Code command discovery issues
- Track expert invocation frequency via git history

## Validation Commands

```bash
# Level 1: Quick validation
cd app && bun run lint
cd app && bunx tsc --noEmit

# Level 2: Structure verification
find .claude/commands/experts -name "*.md" | wc -l  # Should be 14+
ls -la .claude/commands/experts/orchestrators/  # Should show 2 files
ls -la .claude/commands/experts/*/  # Should show 3 files per expert

# Verify frontmatter parsing (no YAML errors)
for f in .claude/commands/experts/**/*.md; do
  head -20 "$f" | grep -q "^---" && echo "OK: $f" || echo "MISSING FRONTMATTER: $f"
done
```

## Issue Relationships

- **Parent**: #481 (epic: overhaul .claude/ directory)
- **Depends on**: #474 (Phase 1: template categories) - COMPLETED
- **Related**: #482 (CLAUDE.md navigation gateway) - COMPLETED
- **Related**: #484 (agent registry capability indexes) - IN PROGRESS (current branch)
- **Enables**: Future workflow commands that leverage expert analysis

## Commit Message Validation

All commits for this feature will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `feat(commands): add architecture expert` not `Based on the plan, this commit adds the architecture expert`

## Appendix: Expert Template Reference

### _plan Command Template (Level 5)
```markdown
---
description: Provide {domain} analysis for planning
argument-hint: <issue-context>
---

# {Domain} Expert - Plan

## Variables

USER_PROMPT: $ARGUMENTS

## Expertise

### {Domain} Knowledge Areas

**Core Patterns:**
- [Pattern 1 with code example from KotaDB]
- [Pattern 2 with code example from KotaDB]

**Anti-Patterns to Avoid:**
- [Anti-pattern discovered from codebase history]

## Workflow

1. **Parse Context**: Understand the requirement from USER_PROMPT
2. **Analyze Implications**: Map to {domain} patterns and concerns
3. **Identify Patterns**: Match against known patterns in Expertise
4. **Formulate Recommendations**: Prioritized actionable items

## Report Format

### {Domain} Perspective

**Analysis:**
- [Key findings from {domain} viewpoint]

**Recommendations:**
1. [Prioritized recommendation with rationale]

**Risks:**
- [Risk assessment with severity]
```

### _review Command Template (Level 5)
```markdown
---
description: Review code changes from {domain} perspective
argument-hint: <pr-number-or-diff-context>
---

# {Domain} Expert - Review

## Variables

REVIEW_CONTEXT: $ARGUMENTS

## Expertise

### Review Focus Areas

**Critical Issues to Flag:**
- [Issue type 1 - automatic CHANGES_REQUESTED]
- [Issue type 2 - automatic CHANGES_REQUESTED]

**Important Concerns:**
- [Concern type - COMMENT level]

## Workflow

1. **Parse Diff**: Understand changes from REVIEW_CONTEXT
2. **Check Critical**: Scan for critical issue patterns
3. **Check Important**: Scan for important concern patterns
4. **Synthesize**: Produce consolidated review

## Output

### {Domain} Review

**Status:** APPROVE | CHANGES_REQUESTED | COMMENT

**Critical Issues:**
- [List if any, empty if none]

**Suggestions:**
- [Improvement suggestions]
```

### _improve Command Template (Level 6-7)
```markdown
---
description: Analyze changes and update {domain} expert knowledge
---

# {Domain} Expert - Improve

## Workflow

### 1. Analyze Recent Changes
```bash
git log --oneline -30 --all -- "{relevant-path-pattern}"
```

### 2. Extract Learnings
- Identify successful patterns in recent merges
- Note decisions that worked well
- Document problems encountered and resolutions

### 3. Update Expertise Sections
- Edit `{domain}_expert_plan.md` Expertise section
- Edit `{domain}_expert_review.md` Expertise section
- **PRESERVE** existing patterns, **APPEND** new learnings
- Remove only patterns confirmed obsolete

### 4. Document Anti-Patterns
- Record patterns that caused issues
- Note why they failed with evidence
- Document better alternatives with code examples

## Output

Return summary of changes made to Expertise sections.
```
