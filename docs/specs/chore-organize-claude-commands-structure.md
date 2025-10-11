# Chore Plan: Consolidate Claude Commands into Single Root Directory

## Context
Currently, KotaDB maintains two separate `.claude/commands/` directories:
- `.claude/commands/` (root level, 29 files) — used when working from the project root
- `automation/.claude/commands/` (automation subdirectory, 29 files) — duplicate set for automation context

This duplication creates maintenance overhead and sync drift (e.g., `conditional_docs.md` differs between locations). The goal is to consolidate into a single `.claude/commands/` directory at the repository root, organized into subdirectories that clarify context:
- `.claude/commands/app/` — commands specific to the TypeScript/Bun application layer
- `.claude/commands/automation/` — commands specific to the Python ADW automation layer
- `.claude/commands/` (root) — shared commands that apply across both contexts

This change improves maintainability by eliminating duplication while preserving context-specific guidance through explicit subdirectories.

## Relevant Files
- `.claude/commands/*` — existing root-level command files (29 files)
- `automation/.claude/commands/*` — existing automation-level command files (29 files, to be removed)
- `.claude/commands/conditional_docs.md` — references to documentation paths (needs path audit)
- `automation/adws/README.md` — may reference `.claude/commands/` location
- `CLAUDE.md` — may reference slash command locations or structure
- `README.md` — may reference Claude Code usage or command structure

### New Files
- `.claude/commands/app/` — directory for application-specific commands (if applicable)
- `.claude/commands/automation/` — directory for automation-specific commands (if applicable)
- Updated `.claude/commands/conditional_docs.md` — merged and reconciled version from both sources

## Work Items

### Preparation
1. **Audit command files for context**: Determine which commands are truly context-specific (app vs automation) vs shared
2. **Backup current state**: Create git commit checkpoint before restructuring
3. **Verify working directory**: Ensure on `develop` branch with clean status
4. **Compare conditional_docs.md**: Identify differences between root and automation versions to reconcile

### Execution
1. **Analyze command content**: Read a sample of command files to determine if they contain app-specific or automation-specific logic
2. **Reconcile conditional_docs.md**: Merge the two versions, keeping the most complete/accurate guidance
3. **Organize commands**:
   - If all commands are shared: keep all 29 commands at `.claude/commands/` root level
   - If context-specific: move app commands to `.claude/commands/app/`, automation commands to `.claude/commands/automation/`
   - Keep truly shared commands (e.g., `commit.md`, `tools.md`) at `.claude/commands/` root
4. **Remove automation/.claude/**: Delete `automation/.claude/commands/` directory entirely
5. **Update documentation references**:
   - Search for references to `.claude/commands/` paths in `CLAUDE.md`, `README.md`, `automation/adws/README.md`
   - Update any hardcoded paths or instructions
6. **Update conditional_docs.md**: Ensure all documentation paths are accurate after reorganization

### Follow-up
1. **Verify command discovery**: Test that Claude Code still discovers commands correctly
2. **Check automation workflows**: Ensure ADW scripts don't break due to path changes
3. **Update .gitignore if needed**: Ensure no generated files are accidentally tracked
4. **Document new structure**: Add brief note to `CLAUDE.md` or `README.md` about command organization

## Step by Step Tasks

### 1. Preparation
- Create new feature branch: `git checkout -b chore/organize-claude-commands-structure`
- Run `git status` to confirm clean working tree

### 2. Analysis Phase
- Read 3-5 representative command files from both `.claude/commands/` and `automation/.claude/commands/` to assess context-specificity
- Compare `.claude/commands/conditional_docs.md` with `automation/.claude/commands/conditional_docs.md` line-by-line
- Grep for references to `.claude/commands` in documentation files: `CLAUDE.md`, `README.md`, `automation/adws/README.md`

### 3. Reconciliation
- Merge `conditional_docs.md` files, keeping the union of all documentation references
- Decide on final command organization strategy based on content analysis (shared vs app/automation split)

### 4. Restructuring
- **If all commands are shared** (most likely scenario):
  - Keep all commands at `.claude/commands/` root level
  - Delete `automation/.claude/commands/` directory entirely
  - Update reconciled `conditional_docs.md` at `.claude/commands/conditional_docs.md`
- **If commands need separation**:
  - Create `.claude/commands/app/` and `.claude/commands/automation/` directories
  - Move context-specific commands to appropriate subdirectories
  - Keep shared commands at `.claude/commands/` root
  - Delete `automation/.claude/commands/` directory

### 5. Documentation Updates
- Update any references to `automation/.claude/commands/` in documentation files
- Update `.claude/commands/conditional_docs.md` path references if needed
- Add brief note to `CLAUDE.md` about command structure (if significant changes made)

### 6. Validation
- Run `ls -la .claude/commands/` to verify structure
- Run `ls -la automation/.claude/` to confirm deletion
- Run `git status` to review all changes
- Search for any remaining references: `rg "automation/\.claude" --type md`

### 7. Finalization
- Stage all changes: `git add .claude/ automation/ docs/ CLAUDE.md README.md`
- Review staged changes: `git diff --staged`
- Commit with descriptive message
- Push branch: `git push -u origin chore/organize-claude-commands-structure`
- Create pull request using `/pull_request` command

## Risks

| Risk | Mitigation |
|------|------------|
| Claude Code fails to discover commands after reorganization | Test command discovery before finalizing; Claude Code supports nested command directories |
| Automation workflows break due to hardcoded paths | Grep for all references to `.claude/commands` paths before making changes; ADW scripts should use relative paths |
| Loss of context-specific guidance | Analyze command content carefully before deciding on shared vs split structure; preserve any context-specific instructions |
| Merge conflicts if other work is in progress | Coordinate timing; this is a low-risk structural change that should merge cleanly |

## Validation Commands

Since this is primarily a file organization task with no code changes, validation focuses on structural verification:

```bash
# Verify command structure
ls -la .claude/commands/
test ! -d automation/.claude && echo "✓ automation/.claude removed" || echo "✗ automation/.claude still exists"

# Verify no broken references
rg "automation/\.claude" --type md
rg "\.claude/commands" --type md | grep -v "^#" | head -20

# Verify git status
git status

# Standard validation (should pass since no code changes)
cd app && bun run lint       # (if lint script exists)
cd app && bunx tsc --noEmit  # Type-check
cd app && bun test           # Run test suite (ensures no import breaks)
```

**Impact Level**: Low (file organization only, no code changes)
- No need for `/validate-implementation` supplemental checks beyond basic smoke tests

## Deliverables

1. **Consolidated command structure**:
   - Single `.claude/commands/` directory at repository root
   - Optional subdirectories (`.claude/commands/app/`, `.claude/commands/automation/`) if context-specific commands identified
   - Zero duplication between root and automation directories

2. **Reconciled documentation**:
   - Unified `conditional_docs.md` with complete coverage from both sources
   - Updated path references in `CLAUDE.md`, `README.md`, `automation/adws/README.md` (if applicable)

3. **Validation evidence**:
   - Passing test suite (no import breaks)
   - Confirmed deletion of `automation/.claude/` directory
   - No dangling references to old command paths

4. **Pull request**:
   - Branch: `chore/organize-claude-commands-structure`
   - Target: `develop`
   - Title: `chore: consolidate Claude commands into single root directory`
   - Includes this plan as reference documentation
