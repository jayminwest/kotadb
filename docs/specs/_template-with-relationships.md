# [Type] Plan: [Title]

## Metadata
- **Issue**: #[number]
- **Title**: [Conventional Commit format title]
- **Labels**: component:[x], priority:[x], effort:[x], status:[x]
- **Branch**: `[type]/[number]-[slug]`

## Issue Relationships

- **Depends On**: #[number] ([short title]) - [brief rationale for dependency]
- **Related To**: #[number] ([short title]) - [shared context or technical concern]
- **Blocks**: #[number] ([short title]) - [what this enables downstream]
- **Child Of**: #[number] ([epic/tracking issue]) - [which larger initiative]
- **Supersedes**: #[number] ([old approach]) - [why this replaces it]
- **Follow-Up**: #[number] ([future work]) - [planned next steps]

**Note**: Only include relationship types that apply. Omit this section entirely if no relationships exist.

## Context

Brief description of the problem or motivation. What needs to be accomplished and why?

**Constraints:**
- List any technical or business constraints
- Backward compatibility requirements
- Performance considerations
- Security requirements

## Relevant Files

List files that will be modified or are relevant for understanding this work:
- `path/to/file.ts` — brief description of what this file does
- `path/to/another/file.ts` — another relevant file

### New Files

List any new files that will be created:
- `path/to/new/file.ts` — purpose of this new file

## Work Items

High-level breakdown of work to be done:

### Preparation
- [ ] Research existing implementations
- [ ] Review related issues and PRs
- [ ] Verify current behavior
- [ ] Create branch

### Execution
1. First logical step
2. Second logical step
3. Third logical step

### Follow-up
- [ ] Monitor adoption/metrics
- [ ] Update documentation
- [ ] Create follow-up issues if needed

## Step by Step Tasks

Detailed implementation steps in order:

### [Task Group Name]
- Specific action item with file path and change description
- Another specific action item
- Test or validation step

### [Next Task Group]
- Continue with logical grouping of tasks
- Include validation steps

### Validation and Finalization
- Run validation commands (see "Validation Commands" section)
- Verify changes work as expected
- Clean up any temporary files or debugging code
- Commit changes with conventional commit message
- Push branch to remote

## Risks

**Risk**: Description of potential risk or issue
→ **Mitigation**: How to address or minimize this risk

**Risk**: Another potential risk
→ **Mitigation**: Mitigation strategy

## Validation Commands

Select appropriate validation level based on changes:

**Level 1** (Quick): Docs-only, config comments
- `bun run lint` — validate markdown formatting
- `bunx tsc --noEmit` — type-check TypeScript

**Level 2** (Integration): Features, bugs, endpoints (DEFAULT)
- `bun run lint` — validate formatting
- `bunx tsc --noEmit` — type-check
- `bun test --filter integration` — integration tests

**Level 3** (Release): Schema, auth, migrations, high-risk
- `bun run lint` — validate formatting
- `bunx tsc --noEmit` — type-check
- `bun test --filter integration` — integration tests
- `bun test` — full test suite
- `bun run build` — production build

Manual verification steps (if applicable):
- Manual test step 1
- Manual test step 2

## Commit Message Validation

All commits for this work will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `feat: add search filters` not `Based on the plan, the commit should add search filters`

## Deliverables

**Code changes:**
- Brief description of code being added/modified
- New modules or significant refactors

**Config updates:**
- Configuration files being modified
- Environment variables added

**Documentation updates:**
- Documentation files being created or updated
- README changes
- API documentation changes

**Test coverage:**
- New test files or test cases
- Test coverage targets

## Dependencies

External dependencies or prerequisites:

**npm packages:**
- `package-name@version` — why this package is needed

**Environment variables:**
- `ENV_VAR_NAME` — description and where to get value

**Infrastructure:**
- Database migrations required
- External services needed
- Deployment configuration

**Related work:**
- PRs that must be merged first
- Issues that must be completed
- External dependencies or blockers

## References

- Related GitHub issues
- Pull requests with similar changes
- External documentation or resources
- Design documents or RFCs
- Meeting notes or decisions
