# Chore Plan: Enhance Output Format Specifications in ADW Templates

## Context
This chore addresses inconsistencies in ADW slash command template output specifications that cause agent response parsing brittleness. Building on the prompt-code alignment guide (#87), this work focuses on making output requirements consistently prominent and defensive parsing more robust.

**Why Now:**
- Recent ADW failures show agents adding explanatory text when templates say "Return only X"
- Parsing failures force manual retries, reducing >80% success rate target
- Inconsistent output format prominence across 38 templates creates maintenance burden
- Four templates (`/generate_branch_name`, `/plan`, `/pull_request`, `/patch`) have specific gaps

**Constraints:**
- Must maintain backward compatibility with existing ADW workflows
- Changes should be localized to minimize test surface area
- Follow established patterns from `/find_plan_file` (gold standard)
- No architectural changes - strengthen existing patterns only

## Relevant Files

### Modified Templates
- `.claude/commands/automation/generate_branch_name.md` — Add CRITICAL output section with anti-patterns
- `.claude/commands/workflows/plan.md` — Clarify output contract (path vs file creation)
- `.claude/commands/git/pull_request.md` — Reorganize to move output requirements to top
- `.claude/commands/automation/classify_issue.md` — Add output schema validation hook

### Python Parsing Logic
- `automation/adws/adw_modules/workflow_ops.py` — Enhance `create_and_implement_patch()` with defensive parsing (lines 690-725)

### Reference Documentation
- `docs/specs/prompt-code-alignment.md` — Alignment guide from #87 (reference only, no changes)
- `.claude/commands/docs/conditional_docs.md` — Document when to read alignment guide

### New Files
None - all changes are enhancements to existing files

## Work Items

### Preparation
- Verify worktree isolation (check CWD is `trees/chore-171-*`)
- Create branch `chore/171-abc12345-enhance-output-format-specs` from current branch
- Review existing `/find_plan_file` template as gold standard pattern
- Backup affected templates for rollback safety

### Execution
1. **Enhance `/generate_branch_name` template**
   - Add CRITICAL output format section after line 10
   - Include "DO NOT include" list with specific anti-patterns
   - Add correct/incorrect examples showing common agent mistakes
   - Add output schema section (JSON pattern validation)

2. **Clarify `/plan` output contract**
   - Add explicit "Expected Output" section at line 106
   - Show correct/incorrect examples
   - Document relationship with `/find_plan_file` to avoid confusion
   - Clarify agent should return created path (not just create file)

3. **Reorganize `/pull_request` template**
   - Move "Report" section from lines 92-120 to line 20
   - Keep preconditions/preparation as appendix
   - Makes output requirements immediately visible

4. **Add defensive parsing to `/patch` consumer**
   - Update `create_and_implement_patch()` in `workflow_ops.py:690-725`
   - Extract from markdown code blocks (match `/find_plan_file` pattern)
   - Strip git status prefixes (`?? `, `M `, `A `)
   - Use last code block if multiple found

5. **Add output schema to `/classify_issue`**
   - Add JSON schema section after line 15
   - Format matches existing pattern from `/commit` template
   - Enable future automated validation tooling

### Follow-up
- Run validation commands to ensure no regressions
- Update `.claude/commands/docs/conditional_docs.md` with alignment guide conditions
- Monitor ADW success rates after deployment
- Document patterns in alignment guide for future template authors

## Step by Step Tasks

### 1. Preparation
- Verify current directory is worktree root
- Create branch from current HEAD
- Read `/find_plan_file` template to understand gold standard pattern
- Read `docs/specs/prompt-code-alignment.md` for context

### 2. Template Enhancements
- Update `.claude/commands/automation/generate_branch_name.md`
  - Add CRITICAL section after line 10
  - Add output schema validation hook
- Update `.claude/commands/workflows/plan.md`
  - Add Expected Output section at line 106
  - Add correct/incorrect examples
- Update `.claude/commands/git/pull_request.md`
  - Move Report section to line 20
  - Reorganize preconditions to appendix
- Update `.claude/commands/automation/classify_issue.md`
  - Add output schema after line 15

### 3. Python Parsing Enhancement
- Update `automation/adws/adw_modules/workflow_ops.py`
  - Locate `create_and_implement_patch()` function (lines 690-725)
  - Add markdown code block extraction
  - Add git status prefix stripping
  - Use defensive pattern matching `/find_plan_file`

### 4. Documentation Updates
- Update `.claude/commands/docs/conditional_docs.md`
  - Add condition: "When enhancing ADW templates, read `docs/specs/prompt-code-alignment.md`"
  - Document output format consistency patterns

### 5. Validation
- Run `bun run lint` (TypeScript files unaffected, but verify)
- Run `bun run typecheck` (TypeScript files unaffected, but verify)
- Run `cd automation && uv run pytest adw_tests/` (Python parsing tests)
- Verify markdown syntax in updated templates (no broken formatting)
- Manual review: check CRITICAL sections match gold standard

### 6. Finalization
- Stage all changes: `git add -A`
- Commit with validated message
- Push branch: `git push -u origin chore/171-abc12345-enhance-output-format-specs`

## Risks

| Risk | Mitigation |
|------|------------|
| Defensive parsing changes break existing workflows | Add fallback to old behavior if new parsing fails; incremental rollout |
| Template changes confuse agents trained on old format | Changes strengthen existing patterns (additive only); CRITICAL sections make requirements clearer |
| Output schema validation too strict | Schemas match current actual output patterns (no new constraints) |
| Reorganized `/pull_request` template disrupts workflow | Output requirements still present (just moved up); core logic unchanged |
| Python regex parsing has edge cases | Copy proven pattern from `/find_plan_file` (battle-tested); add unit tests |

## Validation Commands

### Core Validation
```bash
cd automation && uv run pytest adw_tests/
```

### Supplemental Checks
- Manual template review: verify CRITICAL sections match `/find_plan_file`
- Markdown syntax: `markdownlint .claude/commands/`
- Python syntax: `cd automation && uv run python -m py_compile adws/adw_modules/workflow_ops.py`
- Integration test: run ADW workflow with updated templates (manual verification)

### Alignment Validation
- Verify template-to-function mappings documented
- Check output requirements appear in first 30 lines
- Confirm correct/incorrect examples cover common mistakes
- Validate defensive parsing matches template promises

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(templates): enhance output format specs` not `Based on the plan, the commit should enhance output format specs`

Example commit messages:
- `chore(templates): add CRITICAL output sections to ADW templates`
- `chore(parsing): add defensive markdown extraction to patch consumer`
- `docs(templates): reorganize pull_request for output prominence`

## Deliverables

### Code Changes
- 4 template files with enhanced output specifications
- 1 Python function with defensive parsing logic

### Config Updates
None required

### Documentation Updates
- `.claude/commands/docs/conditional_docs.md` — Add alignment guide conditions
- Template inline documentation — Add correct/incorrect examples
- Output schema sections — Enable future validation tooling

### Success Metrics
- Agent responses contain no explanatory text when "Return only X" specified
- Parsing failures reduced (target: <5% of ADW runs)
- CRITICAL sections consistently placed in lines 10-30 across templates
- Defensive parsing handles markdown wrappers and git prefixes gracefully
