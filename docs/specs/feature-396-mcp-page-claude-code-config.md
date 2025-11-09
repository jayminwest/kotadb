# Feature Plan: MCP Configuration Page for Claude Code Integration

**Issue**: #396
**Title**: feat: add /mcp page for Claude Code configuration with copy-paste setup
**Type**: Feature Enhancement
**Priority**: Medium (improves onboarding experience)
**Effort**: Medium (1-3 days, estimated 7-9 hours)
**Status**: Needs investigation

## Overview

### Problem

Users who want to integrate KotaDB with Claude Code CLI must manually construct the MCP configuration file, which is error-prone and time-consuming:

1. **Manual JSON construction** - Users must read documentation to understand `.mcp.json` format
2. **API key copy-paste errors** - Users must manually copy their API key from dashboard and paste into config template
3. **Syntax errors** - Malformed JSON due to missing quotes, commas, or brackets
4. **Configuration discovery** - Users don't know the correct server URL or headers format
5. **No validation feedback** - Users can't verify their configuration works until they try Claude Code

**Current User Experience**:
```
User generates API key on dashboard
→ Reads MCP documentation
→ Manually creates ~/.claude/mcp.json
→ Copies API key from dashboard
→ Pastes into JSON template
→ Saves file
→ Debugs syntax errors (if any)
→ Tests with Claude Code
```

**Time**: ~5 minutes, error-prone

### Desired Outcome

Users can copy a pre-populated, working MCP configuration with one click:

```
User navigates to /mcp page
→ Sees pre-populated configuration with their API key
→ Clicks "Copy Configuration"
→ Pastes into ~/.claude/mcp.json
→ Immediately uses Claude Code with KotaDB
```

**Time**: ~30 seconds, no errors

### Non-Goals

- Automatic installation of MCP configuration (requires filesystem access)
- Real-time validation of Claude Code connection (requires Claude Code CLI integration)
- Multi-project configuration management (Phase 2 enhancement)
- API key generation from `/mcp` page (user must generate from dashboard first)
- Mobile-optimized configuration editing (view-only on mobile is sufficient)

## Technical Approach

### Page Architecture

**Route**: `web/app/mcp/page.tsx`

**Authentication**: OAuth session required (reuses existing middleware pattern from `/dashboard`)

**Data Flow**:
```
User visits /mcp
→ Middleware checks OAuth session (redirect to /login if not authenticated)
→ Page checks AuthContext for API key
→ If no API key: Display "Generate API Key" prompt with link to /dashboard
→ If API key exists: Display pre-populated configurations
→ User clicks "Copy Configuration"
→ Navigator.clipboard.writeText() copies to clipboard
→ Toast notification confirms success
```

### Configuration Templates

**Global Configuration** (`~/.claude/mcp.json`):
```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "https://kotadb.io/mcp",
      "headers": {
        "Authorization": "Bearer kota_free_abc123_xyz789"
      }
    }
  }
}
```

**Project Configuration** (`.mcp.json`):
```json
{
  "mcpServers": {
    "kotadb": {
      "type": "http",
      "url": "https://kotadb.io/mcp",
      "headers": {
        "Authorization": "Bearer kota_free_abc123_xyz789"
      }
    }
  }
}
```

**Dynamic Variables**:
- `apiKey` - From `AuthContext.apiKey` (user's actual API key)
- `apiUrl` - From `process.env.NEXT_PUBLIC_API_URL` (environment-aware server URL)

### UI Components

**Layout**:
```
┌─────────────────────────────────────────────┐
│  MCP Configuration for Claude Code          │
│                                             │
│  [Tabs: Global Config | Project Config]    │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │ {                                    │  │
│  │   "mcpServers": {                    │  │
│  │     "kotadb": {                      │  │
│  │       "type": "http",                │  │
│  │       "url": "https://kotadb.io/mcp",│  │
│  │       "headers": {                   │  │
│  │         "Authorization": "Bearer ●●●"│  │
│  │       }                              │  │
│  │     }                                │  │
│  │   }                                  │  │
│  │ }                                    │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  [Show API Key] [Copy Configuration]       │
│                                             │
│  Setup Instructions:                        │
│  1. Copy configuration above               │
│  2. Save to ~/.claude/mcp.json             │
│  3. Verify: claude mcp list                │
│                                             │
│  Available Tools:                           │
│  • search_code - Search indexed code       │
│  • index_repository - Queue indexing       │
│  • list_recent_files - Recent files        │
│  • search_dependencies - Dependency graph  │
└─────────────────────────────────────────────┘
```

**Component Structure**:
```
web/app/mcp/page.tsx (Main page with auth check)
├── ConfigurationDisplay (Syntax-highlighted JSON)
│   ├── JSON syntax highlighting (native <pre><code>)
│   ├── API key masking (●●●●●●●●)
│   └── Show/Hide toggle
├── CopyButton (Copy to clipboard with feedback)
│   ├── navigator.clipboard.writeText()
│   └── Toast notification on success
└── ToolReference (MCP tools documentation)
    └── List of available tools with descriptions
```

### Dependencies

**No new dependencies required**:
- Native browser `navigator.clipboard.writeText()` for copy functionality
- Native `<pre>` and `<code>` elements for JSON display
- Existing Tailwind CSS for styling
- Existing AuthContext for API key access

**Rationale**: Minimize bundle size, avoid dependency bloat for simple feature

### Security Considerations

**API Key Masking**:
- Display API key as `●●●●●●●●` by default
- Provide "Show API Key" toggle to reveal full key
- Toggle state is component-local (not persisted)

**No Client-Side Key Generation**:
- Page does not generate API keys
- Only displays keys already generated from dashboard
- Links to `/dashboard` for key generation

**Environment-Aware URLs**:
- Local development: `http://localhost:3000/mcp`
- Production: `https://kotadb.io/mcp` (or `NEXT_PUBLIC_API_URL/mcp`)
- Prevents hardcoded production URLs in development

## Relevant Files

### New Files

- `web/app/mcp/page.tsx` — Main MCP configuration page component (OAuth-protected)
- `web/components/mcp/ConfigurationDisplay.tsx` — JSON configuration display with syntax highlighting
- `web/components/mcp/CopyButton.tsx` — Copy-to-clipboard button with success feedback
- `web/components/mcp/ToolReference.tsx` — MCP tools reference list

### Modified Files

- `web/app/dashboard/page.tsx:356-484` — Add "MCP Configuration" card linking to `/mcp` page
- `web/middleware.ts:40` — Add `/mcp` to `oauthOnlyRoutes` array for OAuth protection
- `web/components/Navigation.tsx` — Add `/mcp` navigation link (if navigation component exists)

### Documentation to Create

- `docs/guides/mcp-frontend-setup.md` — User guide for using MCP configuration page
- Update `README.md` — Add MCP configuration page to features list
- Update `web/README.md` — Document MCP page component architecture

## Task Breakdown

### Phase 1: Core Page Component (2-3 hours)

1. Create `web/app/mcp/page.tsx` with basic layout and authentication check
2. Implement redirect to `/login` if no OAuth session (middleware handles this)
3. Fetch API key from `AuthContext.apiKey`
4. Display "Generate API Key" prompt if no key exists (link to `/dashboard`)
5. Generate global and project configurations dynamically using `apiKey` and `apiUrl`
6. Implement tab switching between global/project configs (controlled component state)
7. Add basic styling with Tailwind CSS (match existing dashboard design)

### Phase 2: Configuration Display (1-2 hours)

8. Create `web/components/mcp/ConfigurationDisplay.tsx` component
9. Implement JSON syntax highlighting using native `<pre>` and `<code>` elements
10. Add API key masking (display as `●●●●●●●●` by default)
11. Implement "Show API Key" toggle button (local state: `showKey`)
12. Add responsive layout for mobile devices (horizontal scroll if needed)

### Phase 3: Copy Functionality (1 hour)

13. Create `web/components/mcp/CopyButton.tsx` component
14. Implement `navigator.clipboard.writeText()` for copying configuration
15. Add success toast notification on copy (custom toast component or native alert)
16. Handle copy errors gracefully (fallback for older browsers: `document.execCommand('copy')`)
17. Add keyboard accessibility (Enter/Space to copy)

### Phase 4: Tool Reference & Instructions (1 hour)

18. Create `web/components/mcp/ToolReference.tsx` component
19. List all MCP tools with descriptions:
    - `search_code` - Search indexed code files for keywords
    - `index_repository` - Queue repository for indexing
    - `list_recent_files` - List recently indexed files
    - `search_dependencies` - Search dependency graph for file relationships
20. Add setup instructions (copy → save → verify)
21. Include verification command example (`claude mcp list`)
22. Add troubleshooting tips (connection failed, 401, 429)

### Phase 5: Navigation Integration (30 minutes)

23. Update `web/app/dashboard/page.tsx` to add "MCP Configuration" card
24. Update `web/middleware.ts` to protect `/mcp` route (add to `oauthOnlyRoutes`)
25. Add navigation link if top nav exists (optional)
26. Test navigation flow (dashboard → MCP → back)

### Phase 6: Testing & Polish (1-2 hours)

27. Test with no API key (should show "Generate API Key" prompt)
28. Test with valid API key (should show configurations)
29. Test copy functionality across browsers (Chrome, Firefox, Safari)
30. Test mobile responsive layout (iPhone, Android)
31. Test API key show/hide toggle
32. Test tab switching between global/project configs
33. Verify syntax highlighting renders correctly
34. Run frontend validation: `cd web && bun run lint && bun run typecheck && bun run build`

### Phase 7: Documentation (1 hour)

35. Create `docs/guides/mcp-frontend-setup.md` with screenshots
36. Update `README.md` to mention MCP configuration page
37. Update `web/README.md` with component documentation
38. Add inline code comments for maintainability

## Step by Step Tasks

### Implementation Tasks

1. **Create main page component**:
   - Create `web/app/mcp/page.tsx`
   - Add authentication check using `useAuth()` hook
   - Implement API key check (show prompt if no key)
   - Generate configuration templates dynamically
   - Add tab switching state management

2. **Build configuration display**:
   - Create `web/components/mcp/ConfigurationDisplay.tsx`
   - Implement JSON syntax highlighting with native elements
   - Add API key masking with show/hide toggle
   - Style with Tailwind CSS (match dashboard design)

3. **Implement copy functionality**:
   - Create `web/components/mcp/CopyButton.tsx`
   - Use `navigator.clipboard.writeText()` for copying
   - Add success toast notification
   - Implement error handling and fallback

4. **Add tool reference**:
   - Create `web/components/mcp/ToolReference.tsx`
   - List all MCP tools with descriptions
   - Add setup instructions and verification steps
   - Include troubleshooting tips

5. **Integrate with navigation**:
   - Update `web/app/dashboard/page.tsx` to add MCP card
   - Update `web/middleware.ts` to protect `/mcp` route
   - Add navigation link (optional)

6. **Test and validate**:
   - Manual testing checklist (no API key, valid key, copy, mobile)
   - Run frontend validation commands
   - Test across browsers

7. **Create documentation**:
   - Write user guide in `docs/guides/mcp-frontend-setup.md`
   - Update README files
   - Add code comments

8. **Final validation and push**:
   - Re-run all validation commands
   - Verify no type errors or lint issues
   - Push branch: `git push -u origin feat/396-mcp-page-claude-code-config`

## Risks & Mitigations

### Risk: Browser clipboard API not supported in older browsers
**Mitigation**: Implement fallback using `document.execCommand('copy')`. Display warning message if neither API is available.

### Risk: API key exposure in browser DevTools
**Mitigation**: API keys are already user-specific and stored in localStorage. MCP page does not introduce new security concerns. Document best practices for API key management.

### Risk: Users copy configuration but don't know where to save it
**Mitigation**: Provide clear step-by-step instructions on page. Include file path examples for macOS, Linux, Windows.

### Risk: Server URL mismatch between environments
**Mitigation**: Use `NEXT_PUBLIC_API_URL` environment variable. Verify correct URL is displayed in development vs production.

### Risk: Adding syntax highlighting library increases bundle size
**Mitigation**: Use native `<pre>` and `<code>` elements with CSS for syntax highlighting. No external library required.

## Validation Strategy

### Automated Tests (optional Phase 2 enhancement)

**Component Tests** (`web/app/mcp/page.test.tsx`):
```typescript
describe('MCP Configuration Page', () => {
  it('redirects to login if not authenticated', () => {})
  it('shows generate prompt if no API key', () => {})
  it('displays configurations if API key exists', () => {})
  it('copies configuration to clipboard', () => {})
  it('toggles API key visibility', () => {})
})
```

**Note**: Component tests are not required for Phase 1 delivery. Focus on manual testing first.

### Manual Testing Checklist

**Authentication Flow**:
- [ ] Navigate to `/mcp` without login → redirects to `/login`
- [ ] Login via OAuth → redirected to dashboard
- [ ] Navigate to `/mcp` after login → page loads successfully

**API Key States**:
- [ ] No API key generated → "Generate API Key" prompt appears
- [ ] Click "Generate API Key" → redirects to `/dashboard`
- [ ] Generate API key on dashboard → return to `/mcp` → configurations display

**Configuration Display**:
- [ ] Global config shows correct `~/.claude/mcp.json` path
- [ ] Project config shows correct `.mcp.json` path
- [ ] API key is masked by default (`●●●●●●●●`)
- [ ] Click "Show API Key" → actual key revealed
- [ ] Click "Hide API Key" → key masked again
- [ ] Server URL matches environment (`localhost:3000` in dev, `kotadb.io` in prod)

**Copy Functionality**:
- [ ] Click "Copy Configuration" → success toast appears
- [ ] Paste into text editor → valid JSON with correct structure
- [ ] API key in pasted config matches user's actual key
- [ ] Copy works on desktop browsers (Chrome, Firefox, Safari, Edge)
- [ ] Copy works on mobile browsers (iOS Safari, Android Chrome)

**Tool Reference**:
- [ ] All 4 MCP tools listed (search_code, index_repository, list_recent_files, search_dependencies)
- [ ] Tool descriptions are accurate and helpful
- [ ] Setup instructions are clear and actionable
- [ ] Verification command example works (`claude mcp list`)

**Responsive Design**:
- [ ] Page renders correctly on mobile (< 640px)
- [ ] Configuration display scrolls horizontally if needed
- [ ] Buttons stack vertically on small screens
- [ ] Text remains readable on all screen sizes

**Accessibility**:
- [ ] Copy button accessible via keyboard (Tab + Enter)
- [ ] Show/Hide toggle accessible via keyboard
- [ ] Tab navigation accessible via keyboard
- [ ] Screen reader announces button actions correctly

### Health Checks

```bash
# Frontend validation
cd web
bun run lint
bun run typecheck
bun run build

# Manual verification
# 1. Start dev server: bun run dev
# 2. Navigate to http://localhost:3001/mcp
# 3. Complete manual testing checklist above
```

## Validation Commands

### Level 2 (Required Minimum)

```bash
# Frontend validation
cd web
bun run lint
bun run typecheck
bun run build
```

### Domain-Specific Checks

```bash
# Test page rendering
cd web
bun run dev &
# Open browser to http://localhost:3001/mcp
# Test with valid API key in localStorage
# Test with no API key
# Test copy functionality
```

## Issue Relationships

- **Related To**: #394 (Frontend auth fixes) - Shares authentication middleware and API key management patterns
- **Related To**: #386 (API key dashboard UI) - Extends dashboard with MCP integration UX
- **Related To**: #68 (MCP regression testing) - MCP server functionality that this page configures
- **Related To**: #355 (Production MVP launch) - Improves onboarding experience for production users
- **Depends On**: None (all dependencies already merged)
- **Blocks**: None (enhancement, not blocking other work)

## Success Criteria

**Definition of Done**:
1. ✅ All Phase 1-7 tasks completed
2. ✅ Manual testing checklist passes 100%
3. ✅ Page accessible at `/mcp` route with OAuth protection
4. ✅ Users can copy configuration with 1 click
5. ✅ API key properly injected into configuration templates
6. ✅ Works on desktop and mobile browsers
7. ✅ Frontend validation commands pass (lint, typecheck, build)
8. ✅ Documentation created and updated
9. ✅ No breaking changes to existing pages
10. ✅ Improves user onboarding for Claude Code integration

**User Impact**:
- Reduces MCP setup time from ~5 minutes (manual) to ~30 seconds (copy-paste)
- Eliminates JSON syntax errors during manual configuration
- Improves discoverability of MCP integration feature
- Increases Claude Code adoption among KotaDB users

**Estimated Time**: 7-9 hours total (1-2 working days)
