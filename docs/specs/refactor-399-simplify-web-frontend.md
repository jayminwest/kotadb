# Refactor Plan: Simplify Web Frontend by Archiving Search/Indexing/Files Pages

## Refactoring Summary

**Current Structure:**
- 8 total pages: landing, login, dashboard, pricing, mcp, search, repository-index, files
- Pages like `/search`, `/repository-index`, and `/files` duplicate MCP tool functionality
- Navigation includes links to all pages, creating confusion about product value proposition
- Components `SearchBar.tsx` and `FileList.tsx` are exclusively used by archived pages

**Desired Structure:**
- 4 core pages: landing, login, dashboard, pricing, mcp
- Clear MCP-first user journey: sign up → generate API key → copy config → better agents
- Archived pages moved to `web/app/_archive/` (Next.js ignores `_` prefix)
- Remove navigation links to archived pages
- Archive unused components to `web/app/_archive/components/`

**Behavior Preservation Requirements:**
- OAuth authentication flow must remain unchanged
- Stripe checkout and billing management must remain unchanged
- API key generation, reset, and revoke functionality must remain unchanged
- MCP configuration page functionality must remain unchanged
- Dashboard functionality must remain unchanged

## Motivation

**Technical Debt Being Addressed:**
- Maintenance burden of keeping web UI in sync with programmatic API endpoints
- Confusion about product value proposition (AI agent enhancement vs web-based code search)
- Duplicate functionality between web pages and MCP tools
- Unnecessary complexity in frontend codebase

**Developer Experience Improvements:**
- Reduced frontend surface area (4 pages instead of 8)
- Clearer product focus: MCP-first onboarding
- Faster time-to-value for users (30 seconds vs 5 minutes)
- Simpler testing and validation surface

**Performance and Maintainability Gains:**
- ~50% reduction in frontend codebase
- Eliminated search form state management
- Removed indexing UI polling logic
- Removed file list pagination
- Smaller bundle size
- Fewer pages to maintain and test

## Current State Analysis

**Existing Code Organization:**

Pages to archive:
- `web/app/search/page.tsx` - Full-text search interface (duplicates `mcp__kotadb__search-code`)
- `web/app/repository-index/page.tsx` - Repository indexing UI (duplicates `mcp__kotadb__index-repository`)
- `web/app/files/page.tsx` - Recent files browser (duplicates `mcp__kotadb__list-recent-files`)

Pages to keep:
- `web/app/page.tsx` - Landing page (entry point)
- `web/app/login/page.tsx` - OAuth authentication
- `web/app/dashboard/page.tsx` - API key management + billing
- `web/app/pricing/page.tsx` - Stripe checkout
- `web/app/mcp/page.tsx` - MCP configuration copy-paste

**Dependencies and Coupling Points:**

Components exclusively used by archived pages:
- `web/components/SearchBar.tsx` - Used only by `/search` page
- `web/components/FileList.tsx` - Used by `/search` and `/files` pages

Components used by remaining pages:
- `web/components/Navigation.tsx` - Used by all pages (requires updates to remove archived links)
- `web/components/ApiKeyInput.tsx` - Used by Navigation
- `web/components/RateLimitStatus.tsx` - Used by Navigation
- `web/components/KeyResetModal.tsx` - Used by Dashboard
- `web/components/KeyRevokeModal.tsx` - Used by Dashboard
- `web/components/mcp/ConfigurationDisplay.tsx` - Used by MCP page
- `web/components/mcp/CopyButton.tsx` - Used by MCP page
- `web/components/mcp/ToolReference.tsx` - Used by MCP page

**Test Coverage Baseline:**
- Current test coverage: 1 test file (`web/tests/auth/dev-session.test.ts`)
- No tests for pages being archived
- No tests for pages being kept
- Post-refactor: Manual testing required for OAuth, Stripe, API key flows

## Target Architecture

**New Structure:**
```
web/
├── app/
│   ├── _archive/                    # Archived pages (ignored by Next.js)
│   │   ├── components/              # Components only used by archived pages
│   │   │   ├── SearchBar.tsx
│   │   │   └── FileList.tsx
│   │   ├── search/
│   │   │   └── page.tsx
│   │   ├── repository-index/
│   │   │   └── page.tsx
│   │   └── files/
│   │       └── page.tsx
│   ├── layout.tsx                   # Root layout with navigation
│   ├── page.tsx                     # Landing page (simplified CTA)
│   ├── login/page.tsx               # OAuth authentication ✓
│   ├── dashboard/page.tsx           # API key + billing ✓
│   ├── pricing/page.tsx             # Stripe checkout ✓
│   └── mcp/page.tsx                 # MCP config ✓
├── components/
│   ├── Navigation.tsx               # Updated navigation (removed archived links)
│   ├── ApiKeyInput.tsx
│   ├── RateLimitStatus.tsx
│   ├── KeyResetModal.tsx
│   ├── KeyRevokeModal.tsx
│   └── mcp/
│       ├── ConfigurationDisplay.tsx
│       ├── CopyButton.tsx
│       └── ToolReference.tsx
└── README.md                        # Updated documentation
```

**Dependency Flow Changes:**
- Remove `/search`, `/repository-index`, `/files` links from Navigation.tsx
- Archive SearchBar.tsx and FileList.tsx to `web/app/_archive/components/`
- No changes to authentication, billing, or API key flows

**Interface Contracts:**
- All remaining pages maintain their current props and behavior
- Navigation component signature unchanged (still receives pathname, auth state)
- AuthContext provider unchanged
- API client unchanged

## Relevant Files

### Pages to Archive
- `web/app/search/page.tsx` — Full-text search UI (duplicates MCP tool)
- `web/app/repository-index/page.tsx` — Repository indexing UI (duplicates MCP tool)
- `web/app/files/page.tsx` — Recent files browser (duplicates MCP tool)

### Components to Archive
- `web/components/SearchBar.tsx` — Search input component (used only by archived pages)
- `web/components/FileList.tsx` — File list display component (used only by archived pages)

### Files to Modify
- `web/components/Navigation.tsx` — Remove links to archived pages (lines 42-72)
- `web/README.md` — Update documentation to reflect simplified frontend

### Files to Keep (No Changes)
- `web/app/page.tsx` — Landing page
- `web/app/login/page.tsx` — OAuth authentication
- `web/app/dashboard/page.tsx` — API key management + billing
- `web/app/pricing/page.tsx` — Stripe checkout
- `web/app/mcp/page.tsx` — MCP configuration

### New Files
- None (archive approach, not creating new files)

## Task Breakdown

### Phase 1: Analysis
- [x] Identify all pages to be archived
- [x] Identify components exclusively used by archived pages
- [x] Verify no other pages import SearchBar or FileList components
- [x] Document current navigation structure
- [x] Verify test coverage baseline

### Phase 2: Archive Pages
- [ ] Create archive directory structure: `web/app/_archive/`
- [ ] Move archived pages to `_archive/`:
  - `web/app/search/` → `web/app/_archive/search/`
  - `web/app/repository-index/` → `web/app/_archive/repository-index/`
  - `web/app/files/` → `web/app/_archive/files/`
- [ ] Create `web/app/_archive/components/` directory
- [ ] Move archived components:
  - `web/components/SearchBar.tsx` → `web/app/_archive/components/SearchBar.tsx`
  - `web/components/FileList.tsx` → `web/app/_archive/components/FileList.tsx`
- [ ] Verify build passes after archiving

### Phase 3: Update Navigation
- [ ] Remove Search link from Navigation.tsx (lines 41-50)
- [ ] Remove Index link from Navigation.tsx (lines 52-61)
- [ ] Remove Files link from Navigation.tsx (lines 63-72)
- [ ] Verify navigation renders correctly
- [ ] Test navigation active states work for remaining pages

### Phase 4: Update Documentation
- [ ] Update `web/README.md`:
  - Remove references to search, indexing, files pages
  - Add note about archived pages in `_archive/` directory
  - Update project structure diagram
  - Add MCP-first philosophy section
- [ ] Add archive note in this spec documenting rationale

### Phase 5: Validation
- [ ] Run type-check: `cd web && bunx tsc --noEmit`
- [ ] Run linting: `cd web && bun run lint`
- [ ] Run build: `cd web && bun run build`
- [ ] Manual testing: Complete user journey (OAuth → API key → MCP config)
- [ ] Manual testing: Verify archived pages return 404
- [ ] Manual testing: Verify Stripe checkout still works
- [ ] Manual testing: Verify API key generation still works

### Phase 6: Commit and Push
- [ ] Stage all changes
- [ ] Create commit with proper message
- [ ] Push branch to remote: `git push -u origin refactor/399-simplify-web-frontend`

## Step by Step Tasks

### 1. Create Archive Structure
```bash
# Create archive directory
mkdir -p web/app/_archive/components

# Archive pages
git mv web/app/search web/app/_archive/
git mv web/app/repository-index web/app/_archive/
git mv web/app/files web/app/_archive/

# Archive components
git mv web/components/SearchBar.tsx web/app/_archive/components/
git mv web/components/FileList.tsx web/app/_archive/components/
```

### 2. Update Archived Page Imports
- Update import paths in archived pages to point to archived components:
  - `web/app/_archive/search/page.tsx`: Update SearchBar and FileList imports
  - `web/app/_archive/files/page.tsx`: Update FileList import

### 3. Update Navigation Component
- Remove lines 41-72 from `web/components/Navigation.tsx` (Search, Index, Files links)
- Verify MCP link is accessible when authenticated

### 4. Update README.md
- Remove search, repository-index, files from feature list
- Add "Archived Pages" section documenting rationale
- Update project structure diagram
- Add MCP-first onboarding philosophy

### 5. Validation
- Run `cd web && bunx tsc --noEmit` (type-check)
- Run `cd web && bun run lint` (linting)
- Run `cd web && bun run build` (build validation)
- Manual test: Sign up via OAuth
- Manual test: Generate API key
- Manual test: Copy MCP config
- Manual test: Verify archived pages return 404
- Manual test: Verify Stripe checkout

### 6. Commit and Push
- Stage changes: `git add -A`
- Commit with message:
```
refactor: simplify web frontend by archiving search/indexing/files pages (#399)

Archive /search, /repository-index, and /files pages to reduce
frontend maintenance burden and clarify MCP-first value proposition.

- Archive pages to web/app/_archive/ (Next.js ignores _ prefix)
- Archive SearchBar and FileList components
- Remove archived page links from Navigation
- Update README.md with MCP-first philosophy
- Preserve OAuth, Stripe, API key flows unchanged

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```
- Push: `git push -u origin refactor/399-simplify-web-frontend`

## Behavior Preservation

**Critical Functionality That Must Not Change:**

1. **OAuth Authentication Flow**
   - GitHub OAuth login flow must work identically
   - User session management unchanged
   - Supabase authentication integration unchanged

2. **API Key Management**
   - Key generation endpoint unchanged
   - Key reset functionality unchanged
   - Key revoke functionality unchanged
   - localStorage persistence unchanged

3. **Stripe Integration**
   - Checkout flow unchanged
   - Billing portal link unchanged
   - Subscription status display unchanged
   - Webhook handling unchanged (backend)

4. **MCP Configuration**
   - Config generation logic unchanged
   - Copy-to-clipboard functionality unchanged
   - Global vs project config tabs unchanged

5. **Navigation and Layout**
   - AuthContext provider unchanged
   - RateLimitStatus component unchanged
   - ApiKeyInput component unchanged
   - Dark mode support unchanged

**Test Scenarios to Validate Equivalence:**

1. **Authentication Flow:**
   - User can sign up via GitHub OAuth
   - User session persists across page refreshes
   - Sign out clears session and redirects to landing

2. **API Key Flow:**
   - User can generate first API key from dashboard
   - User can copy API key to clipboard
   - User can reset API key (with confirmation modal)
   - User can revoke API key (with confirmation modal)
   - Rate limit status updates in navigation

3. **Billing Flow:**
   - User can navigate to pricing page
   - User can complete Stripe checkout (staging)
   - User can access billing portal from dashboard
   - Subscription status displays correctly

4. **MCP Flow:**
   - User can navigate to MCP page
   - User can toggle between global/project config
   - User can copy configuration to clipboard
   - User can toggle API key visibility

5. **Archived Pages:**
   - Accessing `/search` returns 404
   - Accessing `/repository-index` returns 404
   - Accessing `/files` returns 404
   - No navigation links to archived pages visible

## Migration Strategy

**Breaking Changes:**
- None. This is a frontend-only change that removes UI pages while preserving all API endpoints.

**Deprecation Timeline:**
- Immediate archiving (no deprecation period needed)
- Pages are archived, not deleted (rollback possible via git)

**Communication Plan:**
- Users are developers using Claude Code CLI
- Primary usage is via MCP tools, not web UI
- Expected impact: minimal to none (users use API/MCP, not web pages)
- If needed, add banner on landing page: "Web search/indexing UIs removed. Use MCP tools instead."

**Rollback Plan:**
- If issues arise, restore archived pages:
```bash
git mv web/app/_archive/search web/app/
git mv web/app/_archive/repository-index web/app/
git mv web/app/_archive/files web/app/
git mv web/app/_archive/components/SearchBar.tsx web/components/
git mv web/app/_archive/components/FileList.tsx web/components/
# Restore navigation links
git checkout HEAD~1 -- web/components/Navigation.tsx
```

## Validation Commands

```bash
# Type-check
cd web && bunx tsc --noEmit

# Lint
cd web && bun run lint

# Build
cd web && bun run build

# Verify archived pages return 404 (after build)
cd web && bun run start
# Manual: Visit http://localhost:3001/search (expect 404)
# Manual: Visit http://localhost:3001/repository-index (expect 404)
# Manual: Visit http://localhost:3001/files (expect 404)
```

**Manual Testing Checklist:**

Level 2 Validation (Critical Paths):
- [ ] OAuth login flow completes successfully
- [ ] Dashboard renders with user profile
- [ ] API key generation works
- [ ] API key copy to clipboard works
- [ ] MCP page renders configuration
- [ ] MCP config copy to clipboard works
- [ ] Pricing page renders
- [ ] Navigation highlights active page
- [ ] Sign out works and redirects to landing

Level 3 Validation (Edge Cases):
- [ ] Stripe checkout flow works (staging environment)
- [ ] Billing portal link works (for paid users)
- [ ] API key reset modal works with confirmation
- [ ] API key revoke modal works with confirmation
- [ ] Rate limit status updates after API calls
- [ ] Dark mode toggle works on all remaining pages
- [ ] Archived pages return 404
- [ ] No broken navigation links
- [ ] Build output has no warnings

## Commit Message Validation

All commits for this refactoring will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `refactor: archive search/indexing/files pages` not `Looking at the plan, this commit archives search/indexing/files pages`

**Good commit message examples:**
```
refactor: archive search, repository-index, and files pages
refactor: move SearchBar and FileList to archived components
refactor: remove archived page links from navigation
docs: update README with MCP-first philosophy
```

**Bad commit message examples:**
```
refactor: based on the plan, archive pages
refactor: this commit moves components to archive
refactor: looking at the changes, let me update navigation
```

## Rationale for Archiving (Not Deleting)

**Why Archive Instead of Delete:**

1. **Preserve Git History:**
   - Full code remains in repository for future reference
   - Easy to review what was removed and why
   - Facilitates rollback if needed

2. **Enable Rollback:**
   - If business requirements change, can restore pages quickly
   - No need to rewrite code from scratch
   - Preserves working implementation

3. **Documentation:**
   - Code serves as documentation of previous approach
   - Useful for understanding design decisions
   - Helps onboard new developers

4. **Next.js Behavior:**
   - Directories prefixed with `_` are ignored by routing
   - Archived pages won't be accessible but remain in codebase
   - No build-time overhead from archived pages

**Archive Location:**
- `web/app/_archive/` - Top-level archive directory
- `web/app/_archive/components/` - Archived components
- `web/app/_archive/search/` - Archived search page
- `web/app/_archive/repository-index/` - Archived indexing page
- `web/app/_archive/files/` - Archived files page

## MCP-First Philosophy

**Product Value Proposition:**
KotaDB makes AI agents more effective by providing code intelligence through MCP (Model Context Protocol). The web frontend exists to support the onboarding flow: sign up → generate API key → copy config → better agents.

**User Journey (Simplified):**
1. User signs up via GitHub OAuth (`/login`)
2. User generates API key (`/dashboard`)
3. User copies MCP configuration (`/mcp`)
4. User pastes config into Claude Code CLI
5. AI agents can now search code, analyze dependencies, etc.

**Why Remove Web Search/Indexing UIs:**
- Users interact with KotaDB via AI agents, not web forms
- MCP tools provide programmatic access: `mcp__kotadb__search-code`, `mcp__kotadb__index-repository`
- Web pages duplicate MCP functionality, creating maintenance burden
- Confusion about product focus: AI enhancement vs web-based code search

**What Stays:**
- Authentication (`/login`) - Required for account setup
- Dashboard (`/dashboard`) - API key management
- Pricing (`/pricing`) - Stripe checkout for upgrades
- MCP Configuration (`/mcp`) - Copy-paste config for Claude Code

**Result:**
- Clear product focus: MCP-first onboarding
- Faster time-to-value: 30 seconds (OAuth → key → config) vs 5 minutes (explore UI features)
- Reduced maintenance: 4 pages instead of 8
- Better UX: No confusion between web UI and programmatic access
