# /roadmap-update

Perform comprehensive ROADMAP.md updates by analyzing recent repository changes, validating implementations across all project areas, and synchronizing epic statuses with actual progress.

## Arguments
- `--since <date>`: Check changes since specific date (default: ROADMAP.md "Last Updated" date)
- `--dry-run`: Analyze changes without modifying ROADMAP.md
- `--skip-validation`: Skip implementation validation (faster, less thorough)
- `--areas <app|automation|web|all>`: Limit analysis to specific project areas (default: all)

## CRITICAL: Output Format Requirements

Return **ONLY** a JSON object matching this exact schema:

```json
{
  "success": boolean,
  "documentation_created": boolean,
  "documentation_path": string | null,
  "summary": string | null,
  "error_message": string | null
}
```

**Field Requirements:**
- `success`: `true` if task completed successfully, `false` if errors occurred
- `documentation_created`: `true` if ROADMAP.md was updated, `false` if no changes needed
- `documentation_path`: "ROADMAP.md" if updated, `null` if not
- `summary`: 2-4 sentence description including epic changes, PR/commit references, validation performed
- `error_message`: Error description if `success: false`, `null` otherwise

**DO NOT include:**
- Markdown formatting around JSON (no ``` backticks in output)
- Explanatory text (e.g., "Here is the result:")
- Comments within JSON
- Trailing commas

**Example output:**
```json
{
  "success": true,
  "documentation_created": true,
  "documentation_path": "ROADMAP.md",
  "summary": "Updated ROADMAP.md based on 12 PRs merged since 2025-10-20. Epic 4 (Job Queue) increased from 0% to 65-70%. Epic 11 (Web Frontend) added at 95%. Added 4 new epics covering web frontend, GitHub integration, billing, and ADW features. Validation confirmed 42 test files and 78-80% overall completion.",
  "error_message": null
}
```

## Overview

The roadmap-update workflow automates synchronization between code implementations and roadmap documentation by:
1. **Discovery**: Analyzing closed issues, merged PRs, and recent commits
2. **Validation**: Using subagents to verify implementation status across project areas
3. **Analysis**: Cross-referencing epic definitions with actual codebase state
4. **Update**: Modifying ROADMAP.md with corrected percentages and new epics
5. **Documentation**: Creating investigation report with detailed findings

**Target Use Cases:**
- Post-sprint roadmap refresh (weekly/bi-weekly)
- Pre-release status validation
- Onboarding documentation updates
- Audit trail for progress tracking

## Workflow Steps

### Phase 1: Git State & Discovery (2-3 minutes)

**Step 1.1: Initialize Context**
```bash
# Sync repository state
git fetch --all --prune
git pull --rebase
git rev-parse --abbrev-ref HEAD
git status --short

# Extract last update date from ROADMAP.md
grep "Last Updated" ROADMAP.md
```

**Step 1.2: Discover Recent Changes**

Use the Task tool with subagent_type="Explore" to analyze:

```markdown
Search for changes since <date> in:
1. Closed GitHub issues (features, bugs, chores)
2. Merged pull requests to develop/main
3. Recent commits (git log --since="<date>" --oneline)
4. New spec files in docs/specs/

Return:
- List of closed issues with titles and types (feature/bug/chore)
- List of merged PRs with descriptions
- Summary of commit activity by area (app/, automation/, web/)
- New spec files added
```

**Expected Output**: List of 10-30 items with issue numbers, PR numbers, and brief descriptions

### Phase 2: Implementation Validation (5-10 minutes)

**Step 2.1: App Backend Validation**

Launch Task agent (subagent_type="Explore", thoroughness="very thorough"):

```markdown
Investigate app/ directory for Epic 4 (Job Queue) and Epic 6 (REST API):

1. Job Queue (Epic 4):
   - Search for pg-boss usage: app/src/queue/
   - Find worker implementations
   - Check POST /index endpoint implementation
   - Locate job status endpoints
   - Find retry/error handling logic
   - Count test files: app/tests/queue/

2. REST API (Epic 6):
   - Inventory all API endpoints in app/src/api/routes.ts
   - Find authentication middleware
   - Check rate limiting implementation
   - Locate validation endpoints

Return completion assessment (0-100%) with evidence:
- Files found
- Features implemented
- Test coverage
- Known gaps or TODOs
```

**Step 2.2: Web Frontend Validation**

Launch Task agent (subagent_type="Explore", thoroughness="very thorough"):

```markdown
Investigate web/ directory for Epic 11 (Web Frontend) and Epic 13 (Billing):

1. Web Frontend (Epic 11):
   - List all pages in web/app/
   - Find authentication implementation (GitHub OAuth, Supabase)
   - Check API client integration (web/lib/)
   - Locate deployment configuration (Vercel)
   - Count test files

2. Billing & Monetization (Epic 13):
   - Find Stripe integration (pricing, checkout, subscriptions)
   - Check webhook handlers
   - Locate subscription management UI
   - Identify pricing tiers and configuration

Return completion assessment (0-100%) with evidence:
- Pages implemented
- Features operational
- Deployment status
- Known bugs or blockers
```

**Step 2.3: Automation & ADW Validation**

Launch Task agent (subagent_type="Explore", thoroughness="medium"):

```markdown
Investigate automation/adws/ for Epic 14 (ADW Advanced Features):

1. Auto-merge system
2. Observability & metrics (scripts/analyze_logs.py)
3. Orchestrator command (.claude/commands/workflows/orchestrator.md)
4. Beads integration (adw_modules/beads_ops.py)
5. Home server trigger
6. API-driven phase tasks

Return completion assessment (0-100%) with evidence:
- Features implemented
- Configuration files
- Integration status
```

**Step 2.4: GitHub Integration Validation**

Launch Task agent (subagent_type="Explore", thoroughness="very thorough"):

```markdown
Investigate Epic 12 (GitHub Integration):

1. GitHub App authentication (app/src/github/app-auth.ts)
2. Webhook receiver (app/src/github/webhook-handler.ts)
3. Auto-indexing processor (app/src/github/webhook-processor.ts)
4. Installation token caching
5. Test coverage (app/tests/github/)

Return completion assessment (0-100%) with evidence:
- Webhook verification implementation
- Auto-indexing status
- Private repo support
- Test files
```

### Phase 3: Epic Analysis & Gap Identification (3-5 minutes)

**Step 3.1: Cross-Reference Epic Files**

For each epic (1-14):
1. Read epic file from docs/vision/ (if exists)
2. Compare planned features with validation findings
3. Identify discrepancies between roadmap percentage and actual implementation
4. Document specific gaps with time estimates

**Step 3.2: Identify New Epics**

Search for substantial implementations not covered by existing epics:
- Frontend features not in original plan
- Billing/monetization system
- Advanced ADW features
- Additional MCP tools beyond original 4

**Step 3.3: Calculate Overall Progress**

```
overall_progress = weighted_average([
  (Epic 1, 0.10),  # Database
  (Epic 2, 0.10),  # Auth
  (Epic 3, 0.08),  # Parsing
  (Epic 4, 0.12),  # Job Queue
  (Epic 6, 0.08),  # REST API
  (Epic 7, 0.08),  # MCP Server
  (Epic 8, 0.05),  # Monitoring
  (Epic 9, 0.08),  # CI/CD
  (Epic 10, 0.08), # Testing
  (Epic 11, 0.10), # Web Frontend
  (Epic 12, 0.08), # GitHub Integration
  (Epic 13, 0.08), # Billing
  (Epic 14, 0.07)  # ADW Advanced
])
```

### Phase 4: ROADMAP.md Update (2-3 minutes)

**Step 4.1: Read Current ROADMAP.md**

```bash
cat ROADMAP.md
```

**Step 4.2: Update Header**

```markdown
**Last Updated**: <current_date>
**Overall Progress**: ~<calculated>% complete
```

**Step 4.3: Update Current Status Section**

- Expand "Foundation Complete" list with new features
- Add "Recent Progress" section with changes since last update
- Update "Remaining Gaps for MVP" with current blockers

**Step 4.4: Update Epic Status Tables**

Organize epics into categories:
1. **Core Infrastructure** (Complete): Epics 1, 2, 3, 7, 10
2. **Backend Services** (Near Complete): Epics 4, 6, 12
3. **Operations & Deployment**: Epics 8, 9
4. **Frontend & Billing** (New): Epics 11, 13
5. **Automation** (New): Epic 14

For each epic:
- Update completion percentage
- Add "Gaps" column with specific items
- Mark as ✅ (>80%), 🟡 (40-80%), or 🔴 (<40%)

**Step 4.5: Update Immediate Priorities**

List 5-7 specific tasks with time estimates:
```markdown
1. **Task description** (~X hours) - Epic Y gap
```

**Step 4.6: Add New Epics Summary**

For each new epic (11-14):
```markdown
**Epic N: Name** (X% complete)
- Feature 1
- Feature 2
- **Gaps**: Gap description
```

**Step 4.7: Update Dependencies & Metrics**

- Mark completed external dependencies
- Update success metrics with achieved targets

### Phase 5: Investigation Report (1-2 minutes)

**Step 5.1: Generate Detailed Report**

Create `ROADMAP_INVESTIGATION_FINDINGS.md` with:
1. Executive summary
2. Detailed epic analysis (what's implemented, what's missing)
3. Completion assessment with evidence
4. File paths for all implementations
5. Code snippets showing key features
6. Test coverage statistics
7. Recommended action plan

**Step 5.2: Reference Report in ROADMAP.md**

Add link to investigation report in Navigation section and footer.

### Phase 6: Validation & Git Operations (2-3 minutes)

**Step 6.1: Validate Markdown**

```bash
# Check for markdown syntax errors
bunx markdownlint-cli2 ROADMAP.md

# Verify all internal links resolve
grep -o '\[.*\](.*\.md)' ROADMAP.md
```

**Step 6.2: Git Operations**

```bash
# Stage changes
git add ROADMAP.md ROADMAP_INVESTIGATION_FINDINGS.md

# Check diff
git diff --stat
git diff --cached ROADMAP.md | head -100

# Commit with conventional format
git commit -m "docs: comprehensive roadmap update based on investigation

- Updated overall progress from X% to Y%
- Epic 4 (Job Queue): 0% → 65-70%
- Epic 5 → Epic 12 (GitHub Integration): 0% → 85%
- Added 4 new epics (11-14)
- Created detailed investigation report

Refs: <issue numbers or PR numbers if applicable>"

# Push if on feature branch
git push -u origin <branch>
```

**Step 6.3: Create PR (if on feature branch)**

If not on develop/main, use `/pull_request` command to create PR.

## Subagent Coordination

**Agent 1: Discovery Agent**
- Type: Explore (medium thoroughness)
- Task: Find closed issues, merged PRs, new specs
- Output: List of changes since last update

**Agent 2: App Backend Validator**
- Type: Explore (very thorough)
- Task: Validate Epic 4, 6 implementations
- Output: Completion percentages with file evidence

**Agent 3: Web Frontend Validator**
- Type: Explore (very thorough)
- Task: Validate Epic 11, 13 implementations
- Output: Page count, features, deployment status

**Agent 4: Automation Validator**
- Type: Explore (medium)
- Task: Validate Epic 14 implementations
- Output: Feature list with completion status

**Agent 5: GitHub Integration Validator**
- Type: Explore (very thorough)
- Task: Validate Epic 12 implementations
- Output: Webhook status, test coverage

**Parallel Execution**: Agents 2-5 can run concurrently for faster execution (5-10 minutes total vs 20-30 sequential).

## Error Handling

**Common Errors:**

1. **Git state not clean**:
   ```
   Error: Working tree has uncommitted changes
   Solution: Stash or commit changes before running roadmap update
   ```

2. **ROADMAP.md parse failure**:
   ```
   Error: Could not extract "Last Updated" date
   Solution: Manually specify --since <date>
   ```

3. **Subagent timeout**:
   ```
   Error: Exploration agent exceeded 10 minute timeout
   Solution: Use --areas flag to limit scope
   ```

4. **Epic file not found**:
   ```
   Warning: docs/vision/epic-11-web-frontend.md does not exist
   Action: Skip epic file comparison, use validation findings only
   ```

## Example Invocations

**Standard weekly update:**
```bash
/roadmap-update
```

**Fast update (skip validation):**
```bash
/roadmap-update --skip-validation
```

**Focused update (web frontend only):**
```bash
/roadmap-update --areas web
```

**Dry run (analyze without changes):**
```bash
/roadmap-update --dry-run
```

**Custom date range:**
```bash
/roadmap-update --since 2025-10-01
```

## Success Criteria

**Minimum Requirements:**
- ROADMAP.md "Last Updated" reflects current date
- Overall progress percentage matches weighted epic completion
- All epics have completion percentage and gaps documented
- At least 3 validation agents executed successfully
- Git commit created with conventional message

**Quality Indicators:**
- Investigation report >500 lines with code snippets
- Epic percentages within ±5% of actual implementation
- All new features documented in appropriate epic
- Immediate priorities list actionable tasks with time estimates
- No broken internal links in ROADMAP.md

## Related Commands

- `/prime` - Build baseline context before roadmap update
- `/docs-update` - Update other documentation files
- `/workflows:orchestrator` - Full issue-to-PR automation
- `/ci:ci-audit` - Validate CI configuration matches roadmap claims

## Notes

**Performance**: Full roadmap update with all validation takes 15-25 minutes. Use `--areas` and `--skip-validation` flags for faster iterations.

**Frequency**: Recommended weekly or bi-weekly during active development, monthly for maintenance phases.

**Collaboration**: Multiple developers can run roadmap updates concurrently if working on different project areas (--areas flag prevents conflicts).

**Audit Trail**: Investigation reports are timestamped and versioned, providing historical progress tracking.
