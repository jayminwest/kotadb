# Chore Plan: Align vision/ directory with current implementation state

## Context

The `docs/vision/` directory was written before significant implementation work began (October 2025) and describes an ambitious 10-epic roadmap without reflecting:
- Current implementation state (60% complete per recent gap analysis)
- Strategic phasing clarified in multi-agent framework investigation (SaaS platform is outward-facing product in Phase 1, ADW framework productization deferred to Phase 2/3)
- Pragmatic technical decisions made during implementation (HTTP JSON-RPC instead of SSE streaming for MCP)
- Critical gaps blocking SaaS MVP (AST parsing Epic 3, job queue Epic 4, GitHub integration Epic 5)

This creates confusion for contributors about:
- What's in scope for current work vs. future phases
- Which epic tasks are complete, in-progress, or not started
- How ADW automation relates to the product roadmap
- What the actual path to MVP looks like

**Deadline**: None specified, but important for guiding contributor prioritization

**Constraints**:
- Preserve original vision content (don't delete aspirational goals)
- Maintain epic structure for reference
- Clearly separate Phase 1 (SaaS MVP) from Phase 2/3 (multi-agent framework)
- Ensure documentation helps contributors pick up work, not just describe history

## Relevant Files

- docs/vision/VISION.md — outdated status ("2025-10-06", many unchecked boxes for completed work)
- docs/vision/README.md — lacks navigation guidance to prioritize practical over aspirational docs
- docs/vision/epic-1-database-foundation.md — marked "Not Started" but database schema is implemented
- docs/vision/epic-2-authentication.md — marked "Not Started" but auth middleware and API keys are live
- docs/vision/epic-3-code-parsing.md — critical gap, needs status update (30% complete, blocks MVP)
- docs/vision/epic-4-job-queue.md — critical gap (0% complete, blocks MVP)
- docs/vision/epic-5-github-integration.md — critical gap (0% complete, blocks MVP)
- docs/vision/epic-6-rest-api.md — partially complete (70%), needs reality check
- docs/vision/epic-7-mcp-server.md — nearly complete (95%), MCP SDK migration happened
- docs/vision/epic-8-monitoring.md — minimal progress (15%)
- docs/vision/epic-9-cicd-deployment.md — partially complete (40%, CI exists but no Fly.io deployment)
- docs/vision/epic-10-testing.md — largely complete (85%, 317 tests passing)
- docs/vision/2025-10-13-multi-agent-framework-investigation.md — strategic phasing guidance
- docs/vision/manifesto.md — Phase 2/3 marketing material, not current priority

### New Files

- docs/vision/ROADMAP.md — practical roadmap with completion status, MVP blockers, realistic timeline
- docs/vision/CURRENT_STATE.md — gap analysis summary with "what works" vs. "what blocks MVP" sections
- docs/vision/archive/manifesto.md — moved from docs/vision/manifesto.md (Phase 2/3 content)

## Work Items

### Preparation
- Verify working directory is correct (worktree if using /orchestrator, main project directory otherwise)
- Review issue #224 description for acceptance criteria
- Confirm git status shows clean working tree or expected changes only
- Ensure `gh` CLI is authenticated for issue label verification

### Execution
1. Audit current implementation state
   - Count implemented vs. planned features per epic
   - Review closed issues matching epic themes
   - Document pragmatic technical decisions (MCP SDK instead of custom SSE, etc.)
   - Map completion percentages per epic from gap analysis findings

2. Create ROADMAP.md
   - Synthesize 10-epic structure with current state
   - Mark each epic with completion status (✅ complete, 🟡 partial, ❌ not started)
   - Highlight MVP blockers (Epic 3: AST parsing, Epic 4: Job queue, Epic 5: GitHub integration)
   - Include realistic timeline (10-week MVP path with 5 2-week sprints)
   - Document strategic phasing (Phase 1: SaaS platform, Phase 2/3: Multi-agent framework)

3. Update VISION.md
   - Update "Last Updated" date to 2025-10-20
   - Update "Status" field to reflect partial completion
   - Add "Current Status" subsections to each component describing what's built
   - Document technical decisions made during implementation (MCP SDK, HTTP JSON-RPC transport, etc.)
   - Keep aspirational goals but clarify phasing
   - Update checklist items to reflect completed work (database schema, auth middleware, MCP server, etc.)

4. Create CURRENT_STATE.md
   - Copy gap analysis findings with completion percentages per epic
   - Add "What's Working" section listing implemented features
   - Add "What's Blocking MVP" section highlighting Epic 3, 4, 5
   - Include actionable next steps for contributors
   - Add comparison table: Vision vs. Reality for each epic

5. Update epic files with completion status
   - Add header note: "This is a reference document from original planning. See ROADMAP.md for current priorities."
   - Add completion checkboxes to each issue (✅ complete, 🟡 in-progress, ❌ not started)
   - Link to relevant PRs/commits for completed work
   - Update epic status fields ("Not Started" → actual status)
   - Note which issues were completed but not tracked in epic files

6. Update README.md
   - Add navigation guidance: "Start with ROADMAP.md (practical), then VISION.md (aspirational)"
   - Clarify relationship between SaaS product (Phase 1) and ADW framework (Phase 2/3)
   - Link to multi-agent investigation doc for Phase 2/3 context
   - Add link to CURRENT_STATE.md for gap analysis

7. Archive outdated content
   - Create docs/vision/archive/ directory
   - Move manifesto.md to archive (Phase 2/3 marketing material)
   - Update any links to manifesto.md to point to archive location

### Follow-up
- Validate no broken links in updated documentation
- Confirm new contributor can understand priorities from ROADMAP.md
- Verify epic completion status matches actual codebase state
- Ensure no contradictions between VISION.md and CURRENT_STATE.md

## Step by Step Tasks

### Audit Phase
1. Count TypeScript files in app/src to understand implementation scale
2. Review closed issues with component labels (component:database, component:auth, component:mcp, etc.)
3. Document completed work vs. epic promises in temporary notes
4. Identify pragmatic technical decisions made during implementation

### Documentation Creation Phase
5. Create docs/vision/ROADMAP.md with 10-epic completion status
6. Add MVP blocker section to ROADMAP.md (Epic 3, 4, 5)
7. Add strategic phasing section to ROADMAP.md (Phase 1 vs. Phase 2/3)
8. Add realistic timeline to ROADMAP.md (10-week MVP path)
9. Create docs/vision/CURRENT_STATE.md with gap analysis
10. Add "What's Working" section to CURRENT_STATE.md
11. Add "What's Blocking MVP" section to CURRENT_STATE.md
12. Add comparison table to CURRENT_STATE.md (Vision vs. Reality)

### Documentation Update Phase
13. Update docs/vision/VISION.md status fields (date, status, current state)
14. Add "Current Status" subsections to VISION.md components
15. Document technical decisions in VISION.md (MCP SDK, HTTP JSON-RPC, etc.)
16. Update VISION.md checklist items to reflect completed work
17. Update docs/vision/epic-1-database-foundation.md with completion status
18. Update docs/vision/epic-2-authentication.md with completion status
19. Update docs/vision/epic-3-code-parsing.md with gap status (30% complete, MVP blocker)
20. Update docs/vision/epic-4-job-queue.md with gap status (0% complete, MVP blocker)
21. Update docs/vision/epic-5-github-integration.md with gap status (0% complete, MVP blocker)
22. Update docs/vision/epic-6-rest-api.md with partial completion status (70%)
23. Update docs/vision/epic-7-mcp-server.md with near-complete status (95%, MCP SDK migration)
24. Update docs/vision/epic-8-monitoring.md with minimal progress status (15%)
25. Update docs/vision/epic-9-cicd-deployment.md with partial status (40%, CI exists but no Fly.io)
26. Update docs/vision/epic-10-testing.md with high completion status (85%, 317 tests)
27. Update docs/vision/README.md with navigation guidance
28. Add strategic phasing explanation to README.md
29. Link to CURRENT_STATE.md from README.md

### Archival Phase
30. Create docs/vision/archive/ directory
31. Move docs/vision/manifesto.md to docs/vision/archive/manifesto.md
32. Update any references to manifesto.md to point to archive location

### Validation Phase
33. Run validation suite (bun run lint, bun run typecheck)
34. Check for broken links in updated documentation
35. Verify new contributor can understand priorities from ROADMAP.md
36. Confirm no contradictions between VISION.md and CURRENT_STATE.md
37. Stage all changes for commit
38. Create commit with conventional commit message
39. Push branch to remote with -u flag

## Risks

- **Scope creep** → Keep updates focused on status alignment, defer new vision work
  - Mitigation: Only update status fields and completion markers, don't redesign vision structure
- **Incomplete gap analysis** → May miss completed work not tracked in issues
  - Mitigation: Cross-reference codebase implementation (app/src) with epic promises
- **Broken links after archive move** → Moving manifesto.md may break references
  - Mitigation: Search for "manifesto.md" references before moving, update all links
- **Conflicting narratives** → VISION.md may contradict CURRENT_STATE.md
  - Mitigation: Review both docs side-by-side before finalizing, ensure consistency

## Validation Commands

- `bun run lint` (verify no linting errors in markdown files if linter configured)
- `bun run typecheck` (N/A for markdown-only changes, but run for consistency)
- `bun test` (N/A for documentation, but run to ensure no test breakage)
- `bun run build` (N/A for documentation, but run to ensure no build breakage)

**Supplemental checks based on impact level**:
- Check for broken markdown links: `grep -r "docs/vision/manifesto.md" docs/`
- Verify epic file updates: `git diff docs/vision/epic-*.md | grep -E "^\+\s*(Status|✅|🟡|❌)"`
- Confirm new files created: `ls -la docs/vision/ROADMAP.md docs/vision/CURRENT_STATE.md docs/vision/archive/`

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `docs(vision): align vision docs with current implementation state` not `Based on the plan, the commit should update vision docs`

**Example commit message**:
```
docs(vision): align vision docs with current implementation state

- Create ROADMAP.md with epic completion status and MVP blockers
- Create CURRENT_STATE.md with gap analysis and actionable next steps
- Update VISION.md with current status and technical decisions
- Update all epic files with completion markers (✅/🟡/❌)
- Update README.md with navigation guidance (practical → aspirational)
- Archive manifesto.md to docs/vision/archive/ (Phase 2/3 content)

Closes #224
```

## Deliverables

- Code changes: None (documentation-only chore)
- Config updates: None
- Documentation updates:
  - New: docs/vision/ROADMAP.md (practical roadmap with completion status)
  - New: docs/vision/CURRENT_STATE.md (gap analysis with actionable next steps)
  - Updated: docs/vision/VISION.md (current status, technical decisions)
  - Updated: docs/vision/epic-*.md (10 files with completion markers)
  - Updated: docs/vision/README.md (navigation guidance, strategic phasing)
  - Archived: docs/vision/archive/manifesto.md (moved from docs/vision/)
