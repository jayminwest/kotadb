# Chore Plan: Restructure Orchestrator Command for Maintainability

## Metadata
- **Issue**: N/A (internal improvement)
- **Title**: chore: restructure orchestrator.md to thin orchestrator pattern
- **Labels**: component:claude-config, priority:medium, effort:medium, status:planned
- **Branch**: `chore/orchestrator-restructure`

## Context

The `/experts:orchestrators:orchestrator` command is currently 668 lines—approximately 4.5x the recommended ~150 line target for orchestrator prompts. This creates:

1. **Massive context overhead** every time the orchestrator runs
2. **Implementation details** that should live in subagents, not the orchestrator
3. **Brittle coupling**—if parsing changes, the orchestrator prompt needs updating
4. **Missing user checkpoint** between plan and build phases

**Constraints:**
- Maintain backward compatibility with existing `phases=scout,plan,build` syntax
- Preserve all existing functionality—restructure only, not feature changes
- Keep subagent invocation patterns (Task tool) unchanged
- Ensure documentation artifacts (`docs/specs/`, `docs/reviews/`) continue to be created

## Issue Relationships

- **Related To**: #490 (Expert Triad Pattern) - orchestrator uses expert patterns
- **Related To**: #491 (CLAUDE.md Navigation Gateway) - may need command table update

## Relevant Files

### Modified Files
- `.claude/commands/experts/orchestrators/orchestrator.md` — Main restructure target (668→~150 lines)
- `.claude/commands/experts/orchestrators/planning_council.md` — Minor updates for consistency (132 lines, already well-structured)
- `.claude/commands/experts/orchestrators/review_panel.md` — Minor updates for consistency (147 lines, already well-structured)
- `CLAUDE.md` — Update command table if flags change

### New Files
- `docs/implementation-guides/orchestrator-implementation.md` — Relocated implementation details (state schemas, detailed examples)
- `.claude/commands/agents/build-agent.md` — Build agent prompt with implementation details moved from orchestrator

## Work Items

### Preparation
- [x] Review existing orchestrator.md structure and identify sections to relocate
- [x] Examine planning_council.md and review_panel.md for patterns
- [x] Read spec template and existing chore specs for format
- [ ] Create branch

### Execution
1. Create `docs/implementation-guides/orchestrator-implementation.md` with relocated details
2. Create `.claude/commands/agents/build-agent.md` with build prompt template
3. Slim down `orchestrator.md` to ~150 lines
4. Add user review checkpoint between plan and build phases
5. Add convenience flags (`--plan-only`, `--build-only`, `--no-review`)
6. Update CLAUDE.md command table if needed

### Follow-up
- [ ] Test orchestrator with existing workflows
- [ ] Monitor for any breakage in downstream usage

## Step by Step Tasks

### Task Group 1: Create Implementation Guide Document
1. Create `docs/implementation-guides/` directory if needed
2. Create `docs/implementation-guides/orchestrator-implementation.md` containing:
   - State file schema documentation (from orchestrator lines ~150-158)
   - Build Agent Prompt Template (from orchestrator lines 223-277)
   - Git operations detailed examples (from orchestrator lines 287-302)
   - Error handling patterns (from orchestrator lines 323-351)
   - Partial success handling (from orchestrator lines 333-351)
3. Add frontmatter with cross-reference to orchestrator.md

### Task Group 2: Create Build Agent Definition
1. Create `.claude/commands/agents/` directory if needed
2. Create `.claude/commands/agents/build-agent.md` with:
   - Frontmatter: description, argument-hint
   - Template Category: Action, Prompt Level: 5
   - Build prompt template (relocated from orchestrator lines 223-277)
   - File implementation instructions
   - Validation steps
   - Error recovery patterns
3. Reference this agent in orchestrator.md

### Task Group 3: Restructure Orchestrator to Thin Pattern
1. Read current `orchestrator.md` (668 lines)
2. Keep only:
   - Frontmatter and header (~10 lines)
   - Phase Definitions table (~15 lines)
   - Instructions header and input parsing (~20 lines)
   - Phase execution stubs with Task tool invocations (~60 lines)
   - Phase transition rules (~15 lines)
   - Progress reporting templates (~20 lines)
   - Error handling summary (~10 lines)
   - Output format template (~20 lines)
3. Replace detailed sections with references:
   - "See `docs/implementation-guides/orchestrator-implementation.md` for detailed patterns"
   - "See `.claude/commands/agents/build-agent.md` for build prompt template"
4. Target: ~150 lines total

### Task Group 4: Add User Review Checkpoint
1. Add new section after Plan Phase in orchestrator.md:
   ```markdown
   #### User Review Checkpoint
   **Skip if:** phases does not include `build`

   Use AskUserQuestion:
     question: "Spec created at {spec_file_path}. Continue to build phase?"
     options:
       - "Yes, continue to build" (Recommended)
       - "No, stop here for review"
       - "Let me edit the spec first"
   ```
2. Add skip condition to Phase Transition Rules

### Task Group 5: Add Convenience Flags
1. Update Arguments section in orchestrator.md:
   ```markdown
   ## Arguments
   - `$1`: Task description (required)
   - `phases=<list>`: Comma-separated phases (default: scout,plan,build)
   - `--plan-only`: Equivalent to phases=scout,plan
   - `--build-only <spec-path>`: Skip scout/plan, build from existing spec
   - `--no-review`: Exclude review and validate phases
   ```
2. Update input parsing logic in Instructions section
3. Document flag precedence (explicit phases= overrides convenience flags)

### Task Group 6: Update CLAUDE.md Command Reference
1. Read CLAUDE.md command table for `/experts:orchestrators:orchestrator`
2. Update argument-hint to reflect new flags:
   ```
   /experts:orchestrators:orchestrator <task-description> [phases=scout,plan,build] [--plan-only|--build-only <spec>|--no-review]
   ```
3. Ensure description remains accurate

### Task Group 7: Validate Consistency Across Orchestrator Files
1. Review `planning_council.md` for any outdated references
2. Review `review_panel.md` for any outdated references
3. Ensure all three files use consistent terminology and patterns
4. Verify cross-references are accurate

### Validation and Finalization
- Run validation commands (see "Validation Commands" section)
- Manually test orchestrator with a simple task
- Verify spec file creation still works
- Verify build phase delegation still works
- Commit changes with conventional commit message
- Push branch to remote

## Risks & Mitigations

**Risk**: Breaking existing orchestrator callers who rely on current behavior
→ **Mitigation**: Maintain full backward compatibility with `phases=` syntax. New flags are additive only.

**Risk**: Loss of implementation detail accessibility
→ **Mitigation**: Create dedicated implementation guide document with full details. Add clear cross-references from slim orchestrator.

**Risk**: Build agent prompt may be less discoverable in separate file
→ **Mitigation**: Add explicit reference in orchestrator.md pointing to build-agent.md location.

**Risk**: User checkpoint adds friction to automated workflows
→ **Mitigation**: Checkpoint is skippable—only triggers when build phase is included. CI/automated callers can use `--no-review` or explicit phases to skip.

## Validation Commands

**Level 1 Validation** (documentation/config changes):
```bash
# Validate markdown formatting
cd /Users/jayminwest/Projects/kota-db-ts
bun run lint

# Verify file references are valid
test -f .claude/commands/experts/orchestrators/orchestrator.md && echo "✅ orchestrator.md exists"
test -f .claude/commands/experts/orchestrators/planning_council.md && echo "✅ planning_council.md exists"
test -f .claude/commands/experts/orchestrators/review_panel.md && echo "✅ review_panel.md exists"

# Line count verification (target: ~150 lines)
wc -l .claude/commands/experts/orchestrators/orchestrator.md
```

**Manual Verification**:
- Run `/experts:orchestrators:orchestrator "Test task" phases=scout` and verify scout phase executes
- Run `/experts:orchestrators:orchestrator "Test task" phases=scout,plan` and verify spec file created
- Verify user checkpoint appears when build phase included
- Verify `--plan-only` flag works as expected

## Commit Message Validation

All commits for this work will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit"
- Use direct statements: `chore(orchestrator): slim to 150-line thin pattern`

## Deliverables

**Code changes:**
- Slimmed orchestrator.md (~150 lines, down from 668)
- New build-agent.md with relocated build prompt template
- New orchestrator-implementation.md with detailed patterns

**Config updates:**
- CLAUDE.md command table entry updated with new flags

**Documentation updates:**
- Implementation guide document created
- Cross-references added between orchestrator and implementation guide

**Test coverage:**
- Manual verification of orchestrator functionality
- Line count validation

## Dependencies

**npm packages:**
- None required

**Environment variables:**
- None required

**Infrastructure:**
- None required

**Related work:**
- None blocking

## References

- Existing orchestrator: `.claude/commands/experts/orchestrators/orchestrator.md`
- Spec template: `docs/specs/_template-with-relationships.md`
- Example chore spec: `docs/specs/chore-130-agent-friendly-resilience-patterns.md`
- Claude Config Expert analysis: (this planning session)
- Reference thin orchestrator pattern: ~140 lines from claude-config.md expertise
