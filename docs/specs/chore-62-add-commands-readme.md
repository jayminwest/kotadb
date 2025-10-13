# Chore Plan: Add README.md to .claude/commands/

## Context
The `.claude/commands/` directory was recently reorganized in #58 into logical subdirectories (workflows, git, issues, homeserver, worktree, automation, app, docs, ci, tools), but lacks central documentation explaining this structure to developers. New contributors adding slash commands or understanding the Claude Code integration workflow need a README that documents the purpose, organization, and discovery mechanism for these commands.

This documentation fills a gap between the root README.md (project overview) and individual command files by providing an entry point specifically for the slash command system.

## Relevant Files
- `.claude/commands/` — Target directory for new README.md
- `README.md` — Root readme that will reference the commands directory
- `.claude/commands/docs/conditional_docs.md` — Existing doc guide to update with new README condition

### New Files
- `.claude/commands/README.md` — Documentation explaining slash command organization and discovery

## Work Items

### Preparation
- Review existing subdirectory structure in `.claude/commands/`
- Examine sample command files to understand naming patterns (e.g., `/workflows:plan`, `/issues:chore`)
- Verify root README.md Project Layout section references

### Execution
1. Create `.claude/commands/README.md` with sections:
   - Overview: Purpose of directory and Claude Code slash command integration
   - Directory Structure: Document 11 subdirectories and their purposes
   - Command Discovery: How Claude Code discovers and invokes commands
   - Adding New Commands: Guidelines for subdirectory placement and file naming
   - Examples: Show command paths like `/workflows:plan`, `/issues:issue`, `/git:commit`
   - Documentation References: Link to conditional_docs.md and CLAUDE.md

2. Update root `README.md` Project Layout section:
   - Add brief line under `.claude/commands/` entry referencing README for organization details
   - Keep reference lightweight (single line mentioning "see .claude/commands/README.md")

3. Extend `.claude/commands/docs/conditional_docs.md`:
   - Add new condition entry for `.claude/commands/README.md`
   - Condition: "When adding new slash commands or understanding command organization pattern"

### Follow-up
- Verify README renders correctly on GitHub
- Confirm README doesn't duplicate content from CLAUDE.md or other existing docs
- Validate that new developers can use README to determine where to place new commands

## Step by Step Tasks

### Create Commands README
1. Write `.claude/commands/README.md` covering:
   - Purpose: Claude Code slash command storage and organization
   - Subdirectories: workflows (SDLC phases), git (version control ops), issues (GitHub issue templates), homeserver (trigger automation), worktree (git worktree management), automation (ADW workflows), app (application layer commands), docs (documentation helpers), ci (CI/CD workflows), tools (utilities)
   - Discovery mechanism: Claude Code reads `.md` files as command prompts, invoked via `/subdirectory:filename` syntax
   - Contribution guidelines: Match subdirectory to command domain, use descriptive filenames, follow existing command format
   - Examples: `/workflows:plan` → `.claude/commands/workflows/plan.md`, `/issues:chore` → `.claude/commands/issues/chore.md`
   - References: Link to `conditional_docs.md` for doc discovery, `CLAUDE.md` for project architecture

### Update Root README
2. Edit `README.md` Project Layout section:
   - Add reference under `.claude/commands/` line: "See `.claude/commands/README.md` for organization details and contribution guidelines."

### Update Conditional Docs
3. Edit `.claude/commands/docs/conditional_docs.md`:
   - Insert new entry after line 10 (before README.md entry):
     ```
     - .claude/commands/README.md
       - Conditions:
         - When adding new slash commands and determining subdirectory placement
         - When understanding Claude Code slash command discovery and organization
         - When onboarding developers to the command structure after #58 reorganization
     ```

### Validation
4. Verify changes:
   - Check that `.claude/commands/README.md` renders correctly in GitHub
   - Confirm root README.md reference is visible and non-redundant
   - Validate conditional_docs.md formatting and entry ordering
   - Ensure no duplication of content between README files
5. Run linting: `cd app && bun run lint` (if applicable to markdown)
6. Push branch: `git add docs/specs/chore-62-add-commands-readme.md .claude/commands/README.md README.md .claude/commands/docs/conditional_docs.md && git commit -m "docs: add README.md to .claude/commands/" && git push -u origin chore/62-add-commands-readme`
7. Create PR: `/pull_request chore/62-add-commands-readme <issue_json> docs/specs/chore-62-add-commands-readme.md <adw_id>`

## Risks
- **Duplication with existing docs** → Keep README focused on command organization, avoid repeating CLAUDE.md architecture details
- **Stale documentation** → Reference existing docs rather than duplicating details that may change
- **Over-documentation** → Keep README concise and actionable, prioritize quick reference over exhaustive explanation

## Validation Commands
- Visual inspection of GitHub markdown rendering
- Check root README.md for clean reference integration
- Verify conditional_docs.md maintains alphabetical/logical ordering
- No code changes, so no build/test commands needed

## Deliverables
- `.claude/commands/README.md` — Central documentation for slash command organization
- Updated `README.md` — Project Layout section references commands README
- Updated `.claude/commands/docs/conditional_docs.md` — Condition for when to read commands README
- This plan document — `docs/specs/chore-62-add-commands-readme.md`
