# Chore Plan: Organize .claude/commands into subdirectories

## Context
After consolidating commands from `automation/.claude/commands/` into the root `.claude/commands/` directory (#59), we now have 29 commands in a flat structure. As the command inventory grows, discoverability suffers. Grouping related commands into logical subdirectories will improve navigation and establish a clear pattern for future additions.

**Constraints:**
- Must preserve slash command invocation (e.g., `/prime`, `/commit`) without path prefixes
- Claude Code command discovery must continue to work seamlessly
- No functional changes to command behavior

## Relevant Files
- `.claude/commands/*.md` — 29 existing command files to be reorganized
- `.claude/commands/conditional_docs.md` — Documentation index referencing command locations
- `README.md` — Project overview mentioning command structure
- `automation/adws/README.md` — ADW documentation referencing slash commands

### New Files
- `.claude/commands/workflows/*.md` — SDLC workflow commands (prime, implement, plan, build, validate-implementation)
- `.claude/commands/git/*.md` — Git operation commands (commit, pull_request)
- `.claude/commands/issues/*.md` — Issue management commands (chore, feature, bug, issue, classify_issue)
- `.claude/commands/homeserver/*.md` — Home server integration commands (get_homeserver_tasks, update_homeserver_task)
- `.claude/commands/worktree/*.md` — Git worktree commands (make_worktree_name, init_worktree)
- `.claude/commands/automation/*.md` — Automation utilities (generate_branch_name, find_plan_file)
- `.claude/commands/app/*.md` — Application-specific commands (start, schema_plan)
- `.claude/commands/docs/*.md` — Documentation commands (conditional_docs, docs-update, anti-mock)
- `.claude/commands/ci/*.md` — CI/CD commands (ci-audit, ci-update)
- `.claude/commands/tools/*.md` — Development tools (install, bun_install, tools, pr-review)

## Work Items

### Preparation
- Verify Claude Code supports nested command structures (test with sample subdirectory)
- Create backup of current `.claude/commands/` directory structure
- Document current command count and categorization mapping

### Execution
- Create subdirectory structure under `.claude/commands/`
- Move commands into appropriate subdirectories based on functional grouping
- Update any internal references within command files if needed
- Update documentation files (README.md, automation/adws/README.md, conditional_docs.md)
- Test slash command invocation after reorganization

### Follow-up
- Verify all slash commands resolve correctly (spot-check 5+ commands)
- Update `.claude/commands/conditional_docs.md` to reference new paths
- Document subdirectory structure pattern for future command additions

## Step by Step Tasks

### 1. Preparation and Verification
- Create backup: `cp -r .claude/commands .claude/commands.backup`
- Test Claude Code nested command discovery with sample subdirectory
- List all current commands: `ls .claude/commands/*.md | wc -l` (expect 29)

### 2. Create Subdirectory Structure
- Create subdirectories:
  - `mkdir -p .claude/commands/workflows`
  - `mkdir -p .claude/commands/git`
  - `mkdir -p .claude/commands/issues`
  - `mkdir -p .claude/commands/homeserver`
  - `mkdir -p .claude/commands/worktree`
  - `mkdir -p .claude/commands/automation`
  - `mkdir -p .claude/commands/app`
  - `mkdir -p .claude/commands/docs`
  - `mkdir -p .claude/commands/ci`
  - `mkdir -p .claude/commands/tools`

### 3. Move Workflow Commands
- Move: `prime.md`, `implement.md`, `plan.md`, `build.md`, `validate-implementation.md` → `workflows/`
- Commands: `git mv .claude/commands/{prime,implement,plan,build,validate-implementation}.md .claude/commands/workflows/`

### 4. Move Git Commands
- Move: `commit.md`, `pull_request.md` → `git/`
- Commands: `git mv .claude/commands/{commit,pull_request}.md .claude/commands/git/`

### 5. Move Issue Management Commands
- Move: `chore.md`, `feature.md`, `bug.md`, `issue.md`, `classify_issue.md` → `issues/`
- Commands: `git mv .claude/commands/{chore,feature,bug,issue,classify_issue}.md .claude/commands/issues/`

### 6. Move Home Server Commands
- Move: `get_homeserver_tasks.md`, `update_homeserver_task.md` → `homeserver/`
- Commands: `git mv .claude/commands/{get_homeserver_tasks,update_homeserver_task}.md .claude/commands/homeserver/`

### 7. Move Worktree Commands
- Move: `make_worktree_name.md`, `init_worktree.md` → `worktree/`
- Commands: `git mv .claude/commands/{make_worktree_name,init_worktree}.md .claude/commands/worktree/`

### 8. Move Automation Utilities
- Move: `generate_branch_name.md`, `find_plan_file.md` → `automation/`
- Commands: `git mv .claude/commands/{generate_branch_name,find_plan_file}.md .claude/commands/automation/`

### 9. Move Application Commands
- Move: `start.md`, `schema_plan.md` → `app/`
- Commands: `git mv .claude/commands/{start,schema_plan}.md .claude/commands/app/`

### 10. Move Documentation Commands
- Move: `conditional_docs.md`, `docs-update.md`, `anti-mock.md` → `docs/`
- Commands: `git mv .claude/commands/{conditional_docs,docs-update,anti-mock}.md .claude/commands/docs/`

### 11. Move CI/CD Commands
- Move: `ci-audit.md`, `ci-update.md` → `ci/`
- Commands: `git mv .claude/commands/{ci-audit,ci-update}.md .claude/commands/ci/`

### 12. Move Development Tools
- Move: `install.md`, `bun_install.md`, `tools.md`, `pr-review.md` → `tools/`
- Commands: `git mv .claude/commands/{install,bun_install,tools,pr-review}.md .claude/commands/tools/`

### 13. Verify Command Discovery
- Test slash commands work after reorganization:
  - `/prime` (workflows)
  - `/commit` (git)
  - `/issue` (issues)
  - `/get_homeserver_tasks` (homeserver)
  - `/start` (app)
- Confirm no broken command references

### 14. Update Documentation References
- Update `.claude/commands/docs/conditional_docs.md` to reflect new structure
- Update `README.md` project layout section
- Update `automation/adws/README.md` slash command references if needed

### 15. Final Validation and Commit
- Verify directory structure: `tree .claude/commands -L 2`
- Verify all commands moved: `find .claude/commands -name "*.md" -type f | wc -l` (expect 29)
- Verify no files left at root: `ls .claude/commands/*.md 2>/dev/null | wc -l` (expect 0)
- Run validation: `git status` (should show renamed files)
- Create feature branch: `git checkout -b chore/58-organize-commands-subdirectories`
- Stage changes: `git add -A`
- Commit with descriptive message following project conventions
- Push branch: `git push -u origin chore/58-organize-commands-subdirectories`
- Invoke `/pull_request chore/58-organize-commands-subdirectories '{"number":58,"title":"chore: organize .claude/commands into subdirectories across all layers","body":"## Context\\n\\nAfter establishing the three-layer command structure in #56, we have commands distributed across:\\n- `shared/.claude/commands/` (11+ shared commands)\\n- `app/.claude/commands/` (2+ app-specific commands)\\n- `automation/.claude/commands/` (8+ automation-specific commands)\\n\\n## Problem\\n\\nAs the number of commands grows, flat directory structures become hard to navigate:\\n- No logical grouping of related commands\\n- Difficult to find specific command types (workflows vs git vs issues)\\n- No clear organization pattern for future commands\\n\\n## Proposed Solution\\n\\nOrganize commands into logical subdirectories within each layer:\\n\\n**shared/.claude/commands/**\\n```\\nworkflows/       # prime, implement, plan, build, validate-implementation\\ngit/             # commit, pull_request\\nissues/          # chore, feature, bug\\ndocs/            # conditional_docs\\n```\\n\\n**app/.claude/commands/**\\n```\\nserver/          # start\\ndatabase/        # schema_plan\\n```\\n\\n**automation/.claude/commands/**\\n```\\nhomeserver/      # get_homeserver_tasks, update_homeserver_task\\nworktree/        # make_worktree_name, init_worktree\\nissues/          # issue, classify_issue, find_plan_file, generate_branch_name\\n```\\n\\n## Success Criteria\\n\\n- Commands organized into logical subdirectories by function\\n- Claude Code command discovery still works (may need path updates)\\n- Clear pattern for where to place new commands\\n- Documentation updated with new structure\\n- No breaking changes to existing slash command invocations","labels":[{"id":"LA_kwDOP788W88AAAACMfY5cQ","name":"component:ci-cd","description":"CI/CD pipeline and automation","color":"8250DF"},{"id":"LA_kwDOP788W88AAAACMfY50Q","name":"component:documentation","description":"Documentation updates","color":"0E7490"},{"id":"LA_kwDOP788W88AAAACMfY8sg","name":"priority:medium","description":"Medium priority issues","color":"FBCA04"},{"id":"LA_kwDOP788W88AAAACMfY-0A","name":"effort:small","description":"Less than 1 day of work","color":"C2E0C6"},{"id":"LA_kwDOP788W88AAAACMfZBoQ","name":"status:needs-investigation","description":"Requires research or investigation","color":"D4C5F9"}]}' docs/specs/chore-58-organize-commands-subdirectories.md <adw_id>`

## Risks
- **Risk**: Claude Code may not discover commands in subdirectories
  - **Mitigation**: Test command discovery with sample subdirectory before full migration; if unsupported, document limitation and keep flat structure
- **Risk**: Internal command references may break if they use relative paths
  - **Mitigation**: Grep for cross-references (`grep -r "\.claude/commands/" .claude/commands/`) and update before committing
- **Risk**: Documentation drift if references aren't updated
  - **Mitigation**: Update all doc references in same commit; add validation step to check for stale paths

## Validation Commands
- `git status` — Verify all renames tracked correctly
- `find .claude/commands -name "*.md" -type f | wc -l` — Confirm 29 commands present
- `ls .claude/commands/*.md 2>/dev/null | wc -l` — Confirm 0 files at root level
- `tree .claude/commands -L 2` — Visualize new directory structure
- Test slash command invocation for 5+ commands across different subdirectories

## Deliverables
- Reorganized `.claude/commands/` directory with logical subdirectories
- Updated `conditional_docs.md` with new command paths
- Updated `README.md` and `automation/adws/README.md` references
- Verification that all slash commands resolve correctly
- Documentation of subdirectory categorization pattern for future commands
