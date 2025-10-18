# Chore Plan: Update automation/ to use root .claude/commands/ structure

## Context

Following commit `31d44ec` which consolidated Claude commands into a single root `.claude/commands/` directory, the automation layer still contains references to the old `automation/.claude/commands/` path structure. This creates confusion and potential for errors if automation code tries to reference commands from the old (now deleted) location.

**Why this matters now:**
- The automation layer (`automation/adws/`) relies on slash command templates to execute workflows
- `automation/adws/adw_modules/agent.py` contains hardcoded path references that must be updated
- Documentation in `automation/adws/README.md` references slash commands but may need clarification
- Maintaining stale references increases cognitive load and risk of runtime failures

**Constraints:**
- Must not break existing ADW workflows (plan, build, test, review, document, patch)
- Must preserve all slash command functionality
- Should align with the single source of truth principle from commit `31d44ec`

## Relevant Files

- `automation/adws/adw_modules/agent.py:26` — Defines `COMMANDS_ROOT` path to slash commands
- `automation/adws/README.md:353` — Documents slash command integration in "Home Server Integration" section
- `.claude/commands/docs/conditional_docs.md` — Conditional documentation reference (may need update)
- `automation/adws/adw_modules/workflow_ops.py` — Uses slash commands but imports from `agent.py`
- `automation/adws/adw_modules/data_types.py` — Defines `SlashCommand` type literals (verify completeness)

### New Files

None (documentation-only updates to existing files)

## Work Items

### Preparation
1. Verify current working directory is `develop` branch with clean working tree
2. Confirm all slash commands in `.claude/commands/` are accessible
3. Create feature branch: `chore/update-automation-commands-path`

### Execution
1. Update `COMMANDS_ROOT` constant in `automation/adws/adw_modules/agent.py:26` to reference root `.claude/commands/`
2. Verify `command_template_path()` function logic handles subdirectories correctly (e.g., `issues/chore.md`)
3. Review `automation/adws/README.md:353-361` for accurate slash command references
4. Cross-reference `SlashCommand` literals in `data_types.py` against actual command files in `.claude/commands/`
5. Update `.claude/commands/docs/conditional_docs.md` if new automation-specific command documentation is needed

### Follow-up
1. Run existing ADW unit tests: `cd automation && uv run pytest adws/adw_tests/`
2. Manually verify template loading with sample slash command (e.g., `/classify_issue`)
3. Confirm no broken imports or path resolution failures
4. Document any discovered gaps in slash command coverage

## Step by Step Tasks

### Task Group 1: Branch Setup
- Ensure working tree is clean: `git status`
- Create and checkout feature branch: `git checkout -b chore/update-automation-commands-path`

### Task Group 2: Code Updates
- Update `COMMANDS_ROOT` in `automation/adws/adw_modules/agent.py:26` from `automation/.claude/commands` to `.claude/commands`
- Verify `command_template_path()` handles subdirectory structure (e.g., `issues/`, `workflows/`, `git/`)
- Audit `SlashCommand` type in `data_types.py:62-79` to ensure all root commands are represented
- Update README.md section on slash commands to clarify root `.claude/commands/` location

### Task Group 3: Verification
- Run unit tests: `cd automation && PYTHONPATH=$(pwd) uv run pytest adws/adw_tests/ -v`
- Verify template loading for critical commands: `/chore`, `/bug`, `/feature`, `/implement`, `/build`
- Check for any hardcoded path assumptions in test fixtures

### Task Group 4: Documentation
- Review `.claude/commands/docs/conditional_docs.md` for automation-related conditions
- Add entry for this chore plan if missing: `docs/specs/chore-update-automation-commands-path.md`

### Task Group 5: Finalization
- Re-run validation: `cd automation && PYTHONPATH=$(pwd) uv run pytest adws/adw_tests/`
- Commit changes: `git add -A && git commit -m "chore: update automation/ to use root .claude/commands/ structure"`
- Push branch with tracking: `git push -u origin chore/update-automation-commands-path`
- (Manual: invoke `/pull_request` via Claude Code to create PR)

## Risks

| Risk | Mitigation |
|------|-----------|
| **Path resolution fails for subdirectory commands** | `command_template_path()` already strips leading `/` and appends `.md`, so subdirs like `issues/chore.md` should resolve correctly. Test with multiple command patterns. |
| **Tests break due to missing fixtures** | Run test suite after each change to catch regressions early. |
| **Documentation drift between root and automation layers** | Consolidate all slash command docs in `.claude/commands/` (already done in 31d44ec). This chore only updates references. |
| **Backward compatibility with old ADW runs** | ADW state is ephemeral; no persistent data depends on old command paths. |

## Validation Commands

- `cd automation && PYTHONPATH=$(pwd) uv run pytest adws/adw_tests/`
- `cd automation && PYTHONPATH=$(pwd) uv run adws/health_check.py --json`
- Verify slash command rendering: test with `/chore`, `/bug`, `/feature`, `/implement`

**Supplemental checks:**
- Manual template path verification for subdirectory commands
- Grep for any remaining `automation/.claude` references: `grep -r "automation/.claude" automation/`

## Deliverables

- **Code changes:**
  - Updated `COMMANDS_ROOT` constant in `agent.py`
  - Verified `command_template_path()` subdirectory handling

- **Documentation updates:**
  - Clarified slash command location in `automation/adws/README.md`
  - Added conditional docs entry for this chore plan (if applicable)

- **Validation:**
  - All automation unit tests passing
  - Template loading verified for representative slash commands
  - No hardcoded path references to old `automation/.claude/commands/` location
