# Chore Plan: Document GitHub App Setup and Configuration

## Context
This chore creates comprehensive documentation for registering and configuring the KotaDB GitHub App. This is a critical MVP blocker (child of Epic 5 #257) that blocks issue #259 (token generation) and provides setup context for #260 (webhook receiver).

The documentation enables developers and operators to set up GitHub integration in both development and production environments with minimal friction. This is foundational work that must be completed before implementing the GitHub App authentication and webhook handling code.

**Constraints:**
- MVP blocker status requires completion before Epic 5 can proceed
- Must be complete enough to support immediate implementation work
- Should follow existing KotaDB documentation patterns and style

## Relevant Files
- `docs/github-app-setup.md` — New comprehensive setup guide (to be created)
- `.claude/commands/docs/conditional_docs/app.md` — Conditional docs map (update to reference new guide)
- `docs/vision/epic-5-github-integration.md` — Epic context and requirements

### New Files
- `docs/github-app-setup.md` — Complete GitHub App registration and configuration guide with step-by-step instructions, permissions, webhooks, environment variables, and troubleshooting

## Work Items

### Preparation
- Verify current working directory is in worktree (not absolute paths)
- Review Epic 5 documentation for requirements and context
- Review GitHub Apps official documentation for accuracy
- Identify KotaDB documentation style patterns from existing docs

### Execution
- Create `docs/github-app-setup.md` with all required sections
- Document GitHub App registration process with step-by-step instructions
- List all required repository and account permissions with explanations
- Document webhook configuration (URL, secret, events)
- Provide environment variable examples for development and production
- Include separate setup paths for development vs production apps
- Add troubleshooting section for common setup issues
- Update `.claude/commands/docs/conditional_docs/app.md` to reference new guide

### Follow-up
- Verify documentation completeness against acceptance criteria
- Run validation commands to ensure no unintended changes
- Push branch for PR creation

## Step by Step Tasks

### 1. Verify Environment and Context
- Confirm working directory is worktree root
- Read Epic 5 documentation for requirements context
- Review GitHub Apps official documentation for accuracy

### 2. Create Documentation File
- Create `docs/github-app-setup.md` with complete structure
- Include overview section explaining GitHub App purpose
- Document prerequisites (GitHub account, organization access)
- Provide step-by-step registration instructions
- Note: Screenshots will be placeholders with descriptions for now (actual screenshots can be added during production setup)

### 3. Document Permissions Configuration
- List repository permissions (Contents: Read-only, Metadata: Read-only)
- List account permissions (None required)
- Explain why each permission is needed
- Document webhook events (Push event for auto-indexing)

### 4. Document Webhook Setup
- Provide webhook URL configuration instructions
- Document webhook secret generation and storage
- List subscribed events with explanations
- Include environment-specific webhook URL examples

### 5. Document Environment Variables
- Document `GITHUB_APP_ID` with example
- Document `GITHUB_APP_PRIVATE_KEY` with format notes
- Document `GITHUB_WEBHOOK_SECRET` with generation guidance
- Provide examples for local development and production

### 6. Document Development vs Production Setup
- Explain why separate apps are needed for dev and prod
- Provide naming conventions (KotaDB vs KotaDB Dev)
- Document different callback URLs and webhook URLs
- Include testing guidance for development app

### 7. Add Verification and Troubleshooting
- Document verification steps to test setup
- Add troubleshooting section for common issues
- Include common errors and solutions
- Provide references to GitHub documentation

### 8. Update Conditional Docs Map
- Update `.claude/commands/docs/conditional_docs/app.md`
- Add condition for when to read GitHub App setup guide
- Reference from GitHub integration and webhook contexts

### 9. Validation
- Run `bun run typecheck` (verify no type errors)
- Run `bun run lint` (verify no lint issues)
- Review documentation against acceptance criteria
- Verify all required sections are complete

### 10. Git Operations
- Stage changes: `git add docs/specs/chore-258-github-app-setup.md docs/github-app-setup.md .claude/commands/docs/conditional_docs/app.md`
- Commit with message: `chore(docs): document GitHub App setup and configuration (#258)`
- Push branch: `git push -u origin chore/258-github-app-setup`

## Risks

**Risk:** Documentation becomes outdated as GitHub UI changes
**Mitigation:** Use descriptive text alongside screenshot placeholders; focus on concepts and settings rather than specific UI navigation paths

**Risk:** Missing critical permissions or configuration details
**Mitigation:** Cross-reference official GitHub Apps documentation and Epic 5 requirements; validate against production use cases in issue #259

**Risk:** Development vs production setup confusion
**Mitigation:** Use clear section headers and explicit environment callouts; provide side-by-side comparison table where appropriate

**Risk:** Environment variable examples expose sensitive data
**Mitigation:** Use placeholder values and emphasize secure storage requirements; reference secrets management best practices

## Validation Commands

- `bun run typecheck` — Verify no TypeScript errors introduced
- `bun run lint` — Verify no ESLint issues
- Manual review against acceptance criteria checklist
- Verify documentation follows KotaDB style patterns
- Cross-reference with GitHub Apps official documentation

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore(docs): document GitHub App setup and configuration (#258)`

**Example valid commit:**
```
chore(docs): document GitHub App setup and configuration (#258)
```

**Example invalid commit:**
```
Based on the plan, this commit should add GitHub App setup documentation
```

## Deliverables

- **Code changes**: None (documentation only)
- **Config updates**: None
- **Documentation updates**:
  - New file: `docs/github-app-setup.md` (complete GitHub App setup guide)
  - Updated: `.claude/commands/docs/conditional_docs/app.md` (reference to new guide)
  - Updated: `docs/specs/chore-258-github-app-setup.md` (this plan)
