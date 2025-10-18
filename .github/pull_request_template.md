# Pull Request

## Description

Brief summary of the changes in this PR (2-3 sentences).

## Related Issues

<!-- Link to related GitHub issues using keywords like Closes, Fixes, Resolves -->
<!-- Document issue relationships as needed -->

Closes #[issue_number]

**Issue Relationships:**
- Depends-On: #[number] (if this PR requires another PR/issue to be merged first)
- Related-To: #[number], #[number] (related context or shared technical concerns)
- Blocks: #[number] (what this PR enables downstream)

## Changes

<!-- List the main changes in this PR -->

- Change 1
- Change 2
- Change 3

## Validation

<!-- Select and complete the appropriate validation level -->

**Validation Level**: [Level 1 / Level 2 / Level 3]

### Commands Executed

- [ ] `bun run lint` - PASSED / FAILED
- [ ] `bunx tsc --noEmit` - PASSED / FAILED
- [ ] `bun test --filter integration` - PASSED / FAILED (Level 2+)
- [ ] `bun test` - PASSED / FAILED (Level 3 only)
- [ ] `bun run build` - PASSED / FAILED (Level 3 only)

### Test Results

<!-- Include test output showing pass/fail status -->
```
[paste relevant test output here]
```

### Real-Service Evidence

<!-- For changes touching database, auth, or external services -->
<!-- Provide evidence that integration tests hit real services, not mocks -->

Example:
- Supabase query logs showing rate limit increments
- Screenshot of database state after test run
- API request logs from integration tests

## Anti-Mock Compliance

<!-- Required for PRs touching test files -->

- [ ] No new mock helpers introduced (`createMock*`, fake clients, manual spies)
- [ ] Existing real-service integration tests updated (if applicable)
- [ ] New tests use real Supabase access paths (if applicable)
- [ ] Failure injection uses real utilities, not mocks (if applicable)

**Notes**: [Any temporary skips or follow-up issues for test coverage]

## Deployment Notes

<!-- Any special considerations for deployment -->

- [ ] Environment variables added/changed (list them)
- [ ] Database migrations included (list migration files)
- [ ] Breaking changes (describe impact)
- [ ] Feature flags required (list flags)

## Checklist

- [ ] Code follows project conventions and style
- [ ] Tests added/updated for new functionality
- [ ] Documentation updated (CLAUDE.md, README.md, spec files)
- [ ] Validation commands completed successfully
- [ ] PR title follows Conventional Commits format
- [ ] Issue relationships documented (if applicable)
- [ ] Branch is up to date with `develop`

## Screenshots / Recordings (Optional)

<!-- Add screenshots or recordings if helpful for visual changes -->

## Additional Context (Optional)

<!-- Any other context, decisions, or trade-offs worth noting -->
