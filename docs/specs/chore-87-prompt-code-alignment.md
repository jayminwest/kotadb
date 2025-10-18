# Chore Plan: Prompt-Code Alignment Validation for ADW Templates

## Context

The ADW (AI Developer Workflow) system depends on **slash command templates** (`.claude/commands/`) to orchestrate autonomous workflows. These templates are executable specifications that must align exactly with Python code expectations in `automation/adws/adw_modules/`. When misaligned, workflows fail silently or produce incorrect results.

**Recent Issue #84 Investigation** exposed three critical prompt-code misalignments:
1. `/commit` template executed git commands instead of returning message strings
2. Plan phase cleanup removed worktrees before subsequent phases could use them
3. `/find_plan_file` output parsing assumed single code block format

These failures demonstrate that **prompts are code** and require systematic validation to prevent regressions. This chore establishes documentation, validation tooling, and testing infrastructure to ensure template-code contract compliance.

### Constraints
- **Priority**: High (blocks other ADW reliability work)
- **Effort**: Medium (1-3 days)
- **Scope**: Documentation first (Phase 1), automation deferred to follow-up
- **Timeline**: Complete Phase 1 immediately; Phases 2-3 tracked as separate issues

## Relevant Files

### Modified Files
- `.claude/commands/docs/conditional_docs.md` — Add condition for new alignment guide
- `automation/adws/README.md` — Reference alignment guide in template development section

### New Files
- `.claude/commands/docs/prompt-code-alignment.md` — Core alignment guide
- `docs/specs/chore-87-prompt-code-alignment.md` — This plan

### Future Work (Out of Scope)
- `automation/adws/scripts/validate-prompt-alignment.py` — Automated validation script (Phase 2)
- `automation/adws/adw_tests/test_prompt_responses.py` — Integration tests (Phase 3)
- `.github/workflows/automation-ci.yml` — CI integration for validation (Phase 2)

## Work Items

### Preparation
1. Verify working directory is the worktree (`automation/trees/chore-87-*`)
2. Ensure all relative paths avoid absolute references
3. Confirm git status is clean before starting

### Execution
1. **Create alignment documentation** (`.claude/commands/docs/prompt-code-alignment.md`)
   - Define template categories (message-only, action, data structure)
   - Document template-to-code mappings for all workflows
   - Provide testing methodology for new templates
   - List common misalignment patterns with symptoms/fixes
   - Include examples from recent issue #84 fixes

2. **Update conditional docs** (`.claude/commands/docs/conditional_docs.md`)
   - Add entry for `prompt-code-alignment.md` with clear conditions
   - Condition: "When creating or modifying slash command templates"
   - Condition: "When debugging ADW workflow failures with agent output"
   - Place in appropriate section near other ADW documentation

3. **Update ADW README** (`automation/adws/README.md`)
   - Add subsection under template development guidance
   - Reference the new alignment guide
   - Link to fixed templates as examples (`/commit`, `/find_plan_file`)

### Follow-up
1. **Validation** — Run all validation commands to ensure no regressions
2. **Commit** — Generate commit message and create commit
3. **Push** — Push branch to remote
4. **Pull Request** — Create PR using `/pull_request` slash command

## Step by Step Tasks

### 1. Create Alignment Guide
- Write `.claude/commands/docs/prompt-code-alignment.md` with comprehensive template development guidance
- Document all template-to-function mappings from `workflow_ops.py`:
  - `/commit` → `create_commit_message()` (expects: string)
  - `/find_plan_file` → `locate_plan_file()` (expects: path without git prefixes)
  - `/implement` → `implement_plan()` (expects: file modifications)
  - `/pull_request` → `create_pull_request()` (expects: PR URL)
  - `/classify_issue` → `classify_issue()` (expects: `/chore`, `/bug`, or `/feature`)
  - `/generate_branch_name` → `generate_branch_name()` (expects: branch name string)
  - `/chore`, `/bug`, `/feature` → `build_plan()` (expects: plan file path in agent output)
  - `/review` → `run_review()` (expects: ReviewResult JSON)
  - `/document` → `document_changes()` (expects: DocumentationResult JSON)
  - `/patch` → `create_and_implement_patch()` (expects: patch file path)
- Define template categories with clear behavioral expectations
- List common misalignment patterns with symptoms and fixes
- Provide testing methodology for new templates

### 2. Update Conditional Documentation
- Edit `.claude/commands/docs/conditional_docs.md`
- Add new entry for `prompt-code-alignment.md`
- Define clear conditions for when to consult the guide
- Integrate with existing ADW documentation references

### 3. Update ADW README
- Edit `automation/adws/README.md`
- Add subsection in template development section
- Cross-reference alignment guide for template authors
- Link to recent fixes (#84, #87) as case studies

### 4. Stage Changes
- Stage all modified and new files for commit

### 5. Validation
- Run `cd app && bunx tsc --noEmit` (type-check TypeScript)
- Run `cd automation && uv run ruff check adws/` (lint Python automation)
- Run `cd automation && uv run pytest adws/adw_tests/ -v` (run automation tests)

### 6. Commit Work
- Generate commit message using git context
- Create commit with ADW identifier in body
- Verify commit succeeded with git log

### 7. Push Branch
- Push branch to remote: `git push -u origin chore/87-prompt-code-alignment`
- Verify push succeeded

### 8. Create Pull Request
- Run `/pull_request chore/87-prompt-code-alignment <issue_json> docs/specs/chore-87-prompt-code-alignment.md <adw_id>`
- Verify PR creation and link in output

## Risks

### Risk: Documentation becomes stale as templates evolve
**Mitigation**: Include version references and "last updated" timestamp; recommend periodic audits

### Risk: Guide too prescriptive, slows template iteration
**Mitigation**: Focus on principles and patterns rather than rigid rules; provide examples instead of mandates

### Risk: Manual validation remains error-prone without automation
**Mitigation**: Phase 2 (automated validation) addresses this; prioritize creating clear validation criteria in Phase 1

### Risk: Developers may not discover the guide when needed
**Mitigation**: Integrate guide into `conditional_docs.md` and ADW README; link from common entry points

## Validation Commands

```bash
# Type-check TypeScript (no app/ code changes expected, but verify)
cd app && bunx tsc --noEmit

# Lint Python automation code
cd automation && uv run ruff check adws/

# Run automation test suite
cd automation && uv run pytest adws/adw_tests/ -v

# Verify no hardcoded environment URLs
cd app && bun run test:validate-env

# Validate migration sync
cd app && bun run test:validate-migrations
```

## Deliverables

### Documentation
1. **Alignment Guide** (`.claude/commands/docs/prompt-code-alignment.md`)
   - Template categories and behavioral contracts
   - Complete template-to-function mappings
   - Testing methodology for new templates
   - Common misalignment patterns with fixes
   - Case studies from issue #84 resolution

2. **Updated Conditional Docs** (`.claude/commands/docs/conditional_docs.md`)
   - New entry for alignment guide with clear conditions
   - Integration with existing ADW documentation references

3. **Updated ADW README** (`automation/adws/README.md`)
   - New subsection on template-code alignment
   - Cross-references to alignment guide
   - Links to recent fixes as examples

### Code Changes
- No application code changes
- No Python code changes (documentation only)

### Configuration Updates
- No configuration file changes required

### Future Work (Separate Issues)
1. **Phase 2**: Automated validation script (`validate-prompt-alignment.py`)
   - Parse template markdown to extract output contracts
   - Cross-reference with Python consuming functions
   - Report mismatches in CI pipeline
   - Integrate with pre-commit hooks

2. **Phase 3**: Integration test coverage
   - Mock agent responses for each template
   - Verify Python parsing handles expected formats
   - Test edge cases (malformed output, missing fields)
   - Add to `automation/adws/adw_tests/test_prompt_responses.py`
