# Chore Plan: Create ROADMAP.md for Agent Communication

## Context

KotaDB needs a centralized ROADMAP.md document at the repository root to facilitate agent-to-agent and agent-to-human communication about development priorities, planned features, and strategic direction. This will serve as a quick-reference guide for both human developers and AI agents (especially ADW workflows) to understand current focus areas, upcoming milestones, and architectural evolution plans.

The project currently has extensive vision documentation in `docs/vision/` (VISION.md, epic files, manifesto, multi-agent investigation), but lacks a concise, root-level roadmap that synthesizes current state and immediate priorities. The README.md covers getting started and API usage but doesn't outline strategic direction or planned features.

**Why this matters now**:
- ADW agents need quick context about what's in flight, what's next, and what's blocked
- Human developers onboarding need clear visibility into project priorities
- Roadmap will reduce redundant planning discussions by serving as SSOT for strategic direction

**Constraints**:
- Avoid duplicating content from VISION.md and epic files (reference, don't rewrite)
- Keep it concise and scannable (1-2 pages max)
- Structure for easy agent parsing (clear sections, minimal prose)

## Relevant Files

- `README.md` — Will reference ROADMAP.md for discoverability
- `docs/vision/VISION.md` — Comprehensive vision document to reference (not duplicate)
- `docs/vision/README.md` — Epic overview and dependency graph
- `docs/vision/epic-*.md` — Detailed implementation plans per epic
- `.claude/commands/docs/conditional_docs.md` — May need extension for when to read ROADMAP.md

### New Files

- `ROADMAP.md` — Root-level strategic roadmap document

## Work Items

### Preparation
- Review existing vision/epic documentation to extract current state
- Identify key milestones and priorities from open issues and recent commits
- Determine structure that balances human readability and agent parseability

### Execution
1. Create ROADMAP.md with clear sections:
   - Current State (what's shipped, what works today)
   - Immediate Priorities (next 1-2 months)
   - Medium-Term Goals (3-6 months)
   - Long-Term Vision (6+ months, high-level only)
   - Dependencies & Blockers (what's waiting on external work)
   - Key Decisions & Trade-offs (architectural choices that inform future work)

2. Extract current state from:
   - README.md (deployed features)
   - Recent commit history (what just shipped)
   - Open high-priority issues (what's in flight)

3. Extract priorities from:
   - `docs/vision/VISION.md` Phase 1 scope
   - `docs/vision/README.md` epic dependencies
   - High-priority issues with `status:needs-investigation` or `status:blocked`

4. Update README.md to reference ROADMAP.md in "Next Steps" or new "Project Roadmap" section

5. (Optional) Extend `.claude/commands/docs/conditional_docs.md` with condition for reading ROADMAP.md:
   - When agents need strategic context about project priorities
   - When working on large features that may overlap with planned work
   - When investigating blockers or dependencies

### Follow-up
- Monitor agent usage of ROADMAP.md to validate structure effectiveness
- Update ROADMAP.md as milestones complete or priorities shift (treat as living document)
- Consider adding "Last Updated" timestamp to track freshness

## Step by Step Tasks

### Preparation & Research
- Read `docs/vision/VISION.md` to extract Phase 1 scope and success metrics
- Read `docs/vision/README.md` to understand epic dependencies and timeline
- Review recent commits (last 10-20) to identify shipped features
- Query open issues with `gh issue list --label priority:high --json number,title,labels` to identify in-flight work

### Document Creation
- Create `ROADMAP.md` skeleton with sections: Current State, Immediate Priorities, Medium-Term, Long-Term, Dependencies, Key Decisions
- Populate "Current State" section:
  - Extract shipped features from README.md API Highlights
  - Note testing infrastructure status (antimocking, Docker Compose, CI)
  - Note deployment status (Fly.io staging/prod readiness)
- Populate "Immediate Priorities" section:
  - Reference Phase 1A-1E milestones from VISION.md
  - Link to epic files for detailed specs
  - Note completion status (checkboxes or status badges)
- Populate "Medium-Term Goals" section:
  - Reference out-of-scope items from VISION.md that may be future work
  - Note dependencies on external services or frontend work
- Populate "Long-Term Vision" section:
  - High-level strategic goals (multi-language support, self-hosted options, etc.)
  - Reference VISION.md success metrics
- Populate "Dependencies & Blockers" section:
  - External service setup (GitHub App registration, Stripe integration)
  - Frontend coordination needs (OpenAPI spec, Supabase schema)
  - Cross-epic blockers (e.g., Epic 3 blocks Epic 4)
- Populate "Key Decisions & Trade-offs" section:
  - Database choice (PostgreSQL/Supabase, SQLite for local only)
  - MCP transport (SSE)
  - Authentication (API keys with tier-based rate limiting)
  - Testing philosophy (antimocking, real Supabase Local)

### Integration
- Update README.md to add reference to ROADMAP.md:
  - Add new "Project Roadmap" section after "API Highlights" or in "Next Steps"
  - Brief intro: "See ROADMAP.md for current priorities and strategic direction"
- (Optional) Update `.claude/commands/docs/conditional_docs.md`:
  - Add condition: "Read ROADMAP.md when planning large features, investigating blockers, or needing strategic context"

### Validation & Commit
- Run `bun run lint` (should be no-op for markdown, but verify no linting infrastructure issues)
- Verify ROADMAP.md renders correctly in GitHub UI (headings, links, checkboxes)
- Commit changes with conventional commit format: `chore: create ROADMAP.md for strategic planning and agent communication (#231)`
- Push branch with `git push -u origin chore/231-roadmap-doc`

## Risks

- **Risk**: Roadmap becomes stale if not updated regularly
  - **Mitigation**: Add "Last Updated" timestamp and note in ADW workflows to update ROADMAP.md when milestones complete

- **Risk**: Duplication with VISION.md creates maintenance burden
  - **Mitigation**: Use references and links to VISION.md/epic files instead of duplicating content; ROADMAP is summary/index, not replacement

- **Risk**: Structure not useful for agents (too human-centric)
  - **Mitigation**: Use clear section headings, bullet points, and checkbox syntax that agents can parse; avoid long prose paragraphs

## Validation Commands

- `bun run lint` (verify no linting issues introduced)
- `bun run typecheck` (should be no-op for markdown-only change)
- Manual validation: Render ROADMAP.md in GitHub UI to verify formatting

## Commit Message Validation

All commits for this chore will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `chore: create ROADMAP.md for strategic planning and agent communication (#231)` not `Based on the plan, the commit should create ROADMAP.md`

## Deliverables

- `ROADMAP.md` in repository root with clear sections for current state, priorities, and strategic direction
- Updated `README.md` with reference to ROADMAP.md
- (Optional) Updated `.claude/commands/docs/conditional_docs.md` with condition for reading ROADMAP.md
