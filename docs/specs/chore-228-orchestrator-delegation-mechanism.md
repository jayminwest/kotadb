# Chore Plan: Clarify orchestrator subagent delegation mechanism

## Context

The `/orchestrator` command (implemented in #187) currently lacks clear implementation instructions for how to delegate work to specialized subagents. The command specification describes a multi-agent architecture where the orchestrator coordinates phase-specific slash commands (`/plan`, `/implement`, `/pull_request`, `/pr-review`), but doesn't explain HOW to spawn these subagents programmatically.

This documentation gap creates ambiguity about:
- Whether to use Claude Code's `SlashCommand` tool or subprocess execution
- How to pass context between orchestrator and subagents (environment variables, state files, arguments)
- How to capture and parse subagent output (plan file paths, PR numbers, validation results)
- How to handle subagent failures and preserve checkpoint state
- How to ensure subagents execute in the correct worktree directory

**Why this matters now**: The orchestrator is a critical coordination layer for the ADW system. Without clear delegation patterns, implementations will be inconsistent, brittle, and difficult to maintain. This chore provides the missing "glue" documentation that transforms the high-level specification into actionable implementation guidance.

**Constraints**: Documentation-only change. No code modifications required. Must align with existing `prompt-code-alignment.md` standards for slash command output contracts.

## Relevant Files

### Existing Files
- `.claude/commands/workflows/orchestrator.md` — Orchestrator command template (needs delegation mechanism instructions)
- `.claude/commands/workflows/plan.md` — Planning phase template (may need output format standardization)
- `.claude/commands/workflows/implement.md` — Implementation phase template (may need output format standardization)
- `.claude/commands/git/pull_request.md` — PR creation template (may need output format standardization)
- `.claude/commands/tools/pr-review.md` — Review phase template (may need output format standardization)
- `.claude/commands/docs/prompt-code-alignment.md` — Output contract standards for slash commands
- `.claude/commands/docs/conditional_docs.md` — Conditional documentation registry (needs new entry)
- `automation/adws/README.md` — ADW architecture overview (context for orchestrator role)
- `docs/specs/feature-187-orchestrator-slash-command.md` — Original feature spec (reference for design intent)

### New Files
None — Documentation-only chore

## Work Items

### Preparation
1. Review existing slash command output formats to identify standardization gaps
2. Analyze `SlashCommand` tool capabilities from Claude Code documentation
3. Document current subprocess execution patterns in ADW Python layer
4. Identify parsing logic requirements for each phase output

### Execution
1. **Document Subagent Invocation Mechanism** in `orchestrator.md`:
   - Add "Subagent Delegation Pattern" section explaining SlashCommand tool usage
   - Provide concrete examples for each phase (plan, build, PR, review)
   - Explain working directory control (CWD vs subprocess parameters)
   - Document error propagation and retry logic

2. **Standardize Phase Output Formats**:
   - Add machine-readable output sections to `/plan`, `/feat`, `/bug`, `/chore` commands
   - Add machine-readable output sections to `/implement` command
   - Add machine-readable output sections to `/pull_request` command
   - Add machine-readable output sections to `/pr-review` command
   - Define JSON output schema for each phase (plan_file, validation_status, pr_number, review_status)

3. **Document Context Passing Pattern**:
   - Add "State File Integration" section to orchestrator.md
   - Document state file schema: `automation/agents/{adw_id}/orchestrator/state.json`
   - Explain how orchestrator writes context before subagent invocation
   - Explain how subagents read context and update state
   - Provide example state file lifecycle across all phases

4. **Document Output Parsing Strategy**:
   - Add "Phase Output Extraction" section to orchestrator.md
   - Provide regex patterns for extracting key data (file paths, PR URLs, validation results)
   - Document fallback strategies when parsing fails
   - Add troubleshooting guide for common parsing errors

5. **Document Error Handling Flow**:
   - Add "Subagent Error Recovery" section to orchestrator.md
   - Explain checkpoint preservation on subagent failures
   - Document how to resume from checkpoint after manual fix
   - Provide examples of common failure scenarios and recovery steps

### Follow-up
1. Validate documentation by manual testing with dry-run orchestrator invocation
2. Update `.claude/commands/docs/conditional_docs.md` with orchestrator delegation patterns entry
3. Update `automation/adws/README.md` to reference orchestrator delegation documentation
4. Verify all slash command output formats align with prompt-code-alignment.md standards

## Step by Step Tasks

### Research and Analysis
- Read `orchestrator.md` sections 167-227 (phase execution pseudocode)
- Read `plan.md`, `implement.md`, `pull_request.md`, `pr-review.md` output sections
- Read `prompt-code-alignment.md` machine-readable output standards
- Read `feature-187-orchestrator-slash-command.md` for design intent
- Identify gaps between specification and implementation guidance

### Document Subagent Invocation Mechanism
- Add "## Subagent Delegation Pattern" section after "## Overview" in orchestrator.md
- Document SlashCommand tool usage pattern:
  ```
  Use SlashCommand tool to invoke phase-specific commands programmatically
  Set working directory context via cwd parameter or state file
  Capture output for parsing and checkpoint updates
  ```
- Add concrete invocation examples for each phase:
  - Plan: `/feat <issue_number>` or `/bug <issue_number>` or `/chore <issue_number>`
  - Build: `/implement <plan_file_path>`
  - PR: `/pull_request`
  - Review: `/pr-review <pr_number>`
- Document error handling: capture stdout/stderr, detect non-zero exit codes, preserve checkpoint

### Standardize Phase Output Formats
- Update `/plan` command (`.claude/commands/workflows/plan.md`):
  - Add "## Output Format" section with JSON schema example
  - Define required fields: `plan_file` (string), `issue_type` (string)
  - Add parsing instructions for orchestrator
- Update `/implement` command (`.claude/commands/workflows/implement.md`):
  - Add "## Output Format" section with JSON schema example
  - Define required fields: `validation_level` (number), `lint` (string), `typecheck` (string), `tests` (string)
  - Add parsing instructions for orchestrator
- Update `/pull_request` command (`.claude/commands/git/pull_request.md`):
  - Add "## Output Format" section with JSON schema example
  - Define required fields: `pr_number` (string), `pr_url` (string)
  - Add parsing instructions for orchestrator
- Update `/pr-review` command (`.claude/commands/tools/pr-review.md`):
  - Add "## Output Format" section with JSON schema example
  - Define required fields: `review_status` (string), `comment_count` (number)
  - Add parsing instructions for orchestrator

### Document Context Passing Pattern
- Add "## State File Integration" section to orchestrator.md
- Document state file schema with all required fields:
  - `adw_id`: unique orchestrator run identifier
  - `issue_number`, `issue_title`, `issue_type`: issue metadata
  - `worktree_name`, `worktree_path`, `branch_name`: git context
  - `phase_status`: completion tracking per phase
  - `checkpoints`: recovery data with timestamps
- Explain state file lifecycle:
  1. Orchestrator creates initial state before first phase
  2. Orchestrator updates state before each subagent invocation
  3. Subagent reads state for context (optional, via `--state` flag)
  4. Orchestrator reads subagent output and updates state after completion
- Add example state file transitions showing before/after for each phase

### Document Output Parsing Strategy
- Add "## Phase Output Extraction" section to orchestrator.md
- For plan phase:
  - Primary: Search for `docs/specs/<type>-<issue>-*.md` files created in last hour
  - Fallback: Parse stdout for lines matching `docs/specs/.*\.md`
  - Error: Prompt user to manually specify plan file path
- For build phase:
  - Primary: Parse stdout for validation results (lint: pass/fail, typecheck: pass/fail, tests: N/N)
  - Fallback: Check exit code (0 = success, non-zero = failure)
  - Error: Mark build as failed, preserve checkpoint, allow manual resume
- For PR phase:
  - Primary: Parse stdout for GitHub PR URL using regex `https://github\.com/[^/]+/[^/]+/pull/(\d+)`
  - Fallback: Query GitHub API for recent PRs on branch
  - Error: Prompt user to manually create PR and provide number
- For review phase:
  - Primary: Parse stdout for review status keywords (approved, changes requested, commented)
  - Fallback: Query GitHub API for PR reviews
  - Error: Mark review as incomplete, log details for manual inspection

### Document Error Handling Flow
- Add "## Subagent Error Recovery" section to orchestrator.md
- Explain checkpoint preservation:
  - Orchestrator saves checkpoint after each successful phase
  - Checkpoint includes: timestamp, phase name, status, artifacts, next_action
  - Checkpoints stored in `automation/agents/{adw_id}/orchestrator/state.json`
- Document resume workflow:
  - User runs `/orchestrator --resume <adw_id>` after fixing issue
  - Orchestrator loads state, identifies last completed phase
  - Orchestrator skips completed phases, resumes from next pending phase
  - Orchestrator verifies prerequisites (worktree exists, artifacts present)
- Provide failure scenario examples:
  - Planning agent fails: checkpoint shows plan=failed, worktree preserved, recovery = fix issue + resume
  - Validation fails: checkpoint shows build=failed with validation errors, recovery = fix in worktree + rerun /implement + resume
  - PR creation fails: checkpoint shows pr=failed, recovery = manual PR creation + update state + resume
  - Review agent fails: checkpoint shows review=failed, recovery = manual review + resume

### Update Documentation References
- Add entry to `.claude/commands/docs/conditional_docs.md`:
  ```markdown
  - .claude/commands/workflows/orchestrator.md
    - Conditions:
      - When understanding orchestrator subagent delegation mechanism
      - When implementing or debugging orchestrator coordination logic
      - When writing slash commands that need machine-readable output for orchestrator consumption
      - When troubleshooting orchestrator state management or checkpoint recovery
  ```
- Update `automation/adws/README.md` "Orchestrator Integration" section:
  - Add reference to delegation pattern documentation in orchestrator.md
  - Add link to prompt-code-alignment.md for output contract standards
  - Add troubleshooting section referencing error recovery documentation

### Validation
- Review orchestrator.md to verify all delegation patterns are documented
- Review all phase command templates to verify output format sections added
- Verify all documentation follows prompt-code-alignment.md standards
- Run `git add docs/specs/chore-228-orchestrator-delegation-mechanism.md .claude/commands/workflows/orchestrator.md .claude/commands/workflows/plan.md .claude/commands/workflows/implement.md .claude/commands/git/pull_request.md .claude/commands/tools/pr-review.md .claude/commands/docs/conditional_docs.md automation/adws/README.md`
- Run `git commit` with properly formatted conventional commit message
- Run `git push -u origin chore-228-orchestrator-delegation-mechanism`

## Risks

### Risk: Slash command output format changes break existing ADW automation
**Impact**: Python ADW layer may parse outputs differently than orchestrator expects
**Mitigation**:
- Add output format sections as additive documentation, not breaking changes
- Existing parsers continue to work with current output
- New orchestrator implementation can use standardized formats
- Document migration path for Python layer if needed

### Risk: SlashCommand tool may not support all required features
**Impact**: Documentation assumes capabilities that don't exist in Claude Code
**Mitigation**:
- Document subprocess execution as fallback mechanism
- Provide both SlashCommand and subprocess examples
- Test minimal example during validation phase
- Add "Known Limitations" section if features unavailable

### Risk: Documentation may be too prescriptive and limit implementation flexibility
**Impact**: Future implementers may need different patterns that contradict documented approach
**Mitigation**:
- Frame documentation as "recommended patterns" not rigid requirements
- Document tradeoffs between SlashCommand tool and subprocess approaches
- Provide multiple examples for different use cases
- Add "Alternative Approaches" section for flexibility

## Validation Commands

No runtime validation required (documentation-only change).

**Documentation Quality Checks**:
```bash
# Verify markdown syntax
markdownlint .claude/commands/workflows/orchestrator.md

# Verify all referenced files exist
ls .claude/commands/workflows/plan.md
ls .claude/commands/workflows/implement.md
ls .claude/commands/git/pull_request.md
ls .claude/commands/tools/pr-review.md

# Verify conditional_docs.md updated
grep -i "orchestrator" .claude/commands/docs/conditional_docs.md
```

**Manual Validation**:
- Read orchestrator.md "Subagent Delegation Pattern" section for clarity
- Verify each phase command has "Output Format" section
- Check state file schema documentation is complete
- Confirm error recovery scenarios are documented with examples

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `docs(orchestrator): add subagent delegation mechanism documentation` not `Based on the plan, the commit should document the delegation mechanism`

## Deliverables

### Documentation Updates
- `.claude/commands/workflows/orchestrator.md` — Added "Subagent Delegation Pattern", "State File Integration", "Phase Output Extraction", "Subagent Error Recovery" sections
- `.claude/commands/workflows/plan.md` — Added "Output Format" section with JSON schema
- `.claude/commands/workflows/implement.md` — Added "Output Format" section with JSON schema
- `.claude/commands/git/pull_request.md` — Added "Output Format" section with JSON schema
- `.claude/commands/tools/pr-review.md` — Added "Output Format" section with JSON schema
- `.claude/commands/docs/conditional_docs.md` — Added orchestrator delegation entry
- `automation/adws/README.md` — Updated orchestrator integration section with delegation references

### Plan Document
- `docs/specs/chore-228-orchestrator-delegation-mechanism.md` — This plan document

## Issue Relationships

- **Related To**: #187 (orchestrator implementation) — Original feature that requires delegation clarification
- **Related To**: #153 (MCP-based ADW orchestration) — Shares orchestration patterns and MCP task integration approaches
- **Related To**: #146 (slash command overhaul) — Part of MCP-first workflow migration initiative that requires clear command contracts
