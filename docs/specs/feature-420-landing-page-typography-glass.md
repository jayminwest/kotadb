# Feature Plan: Landing Page Redesign with Typography and Liquid Glass Enhancement

**Issue**: #420
**Title**: feat: enhance frontend UI with landing page, typography, and liquid glass styling
**Component**: component:backend (should be component:frontend when label created)
**Priority**: priority:high
**Effort**: effort:large (>3 days)
**Status**: status:needs-investigation

## Overview

### Problem
The KotaDB web frontend currently suffers from three critical UX deficiencies:
1. **Landing page lacks marketing presence**: The current `/` page functions as a basic status checker rather than a proper marketing landing page that communicates product value
2. **Generic typography**: Uses system fonts (Arial, Helvetica, sans-serif) from `web/app/globals.css:50`, making the interface feel unpolished and low-effort
3. **Incomplete Liquid Glass implementation**: While glass design tokens exist in `web/app/globals.css:9-46` (from #281), they're only applied to Navigation - not fully utilized across dashboard, pricing, MCP, and other core components

**User Impact**: When developers visit kotadb.io for the first time, they see a generic interface that doesn't clearly communicate:
- What KotaDB does (code intelligence for AI agents via MCP)
- Why they should use it (makes Claude Code smarter about their codebase)
- How to get started (sign up → paste config → better agents)

### Desired Outcome
Transform the web frontend into a professional, cohesive marketing + onboarding experience:
1. **New Landing Page**: Clear hero section with value proposition, feature showcase, user journey visualization, strong CTA
2. **Modern Typography**: Replace Arial/Helvetica with professional web fonts (Inter, SF Pro, Geist, or similar)
3. **Full Liquid Glass Application**: Apply glass effects consistently across Navigation (✓ already done), Dashboard cards, Pricing cards, MCP configuration page
4. **Accessibility-First**: Maintain WCAG 2.1 AA standards (≥4.5:1 contrast) across all updates
5. **Mobile-Responsive**: Ensure design scales gracefully on mobile, tablet, desktop

**Success Metrics**:
- Lighthouse: Performance ≥90, Accessibility ≥90
- axe DevTools: Zero critical violations
- User feedback: 2-3 team members approve visual appeal and clarity
- Conversion metric (future): Time from landing page visit to API key generation

### Non-Goals
- Animated glass refraction using WebGL (future enhancement)
- Custom illustrations or 3D graphics (can use placeholder images)
- Video demonstrations (can link to docs)
- Interactive code playground
- Complete component architecture redesign (work with existing structure)
- Breaking changes to authentication, billing, or API key flows

## Technical Approach

### Architecture Notes
**MANDATORY USER CONSULTATION FIRST**: Agent must confer with user before implementation to align on:
1. Font selection (Inter, SF Pro, Geist, or custom preference)
2. Landing page structure and content priorities
3. Color palette refinements beyond glass effects
4. Any specific design references or inspirations
5. Priority order for component updates

**Implementation follows layered approach**:
1. **User Alignment Phase**: Present design proposal, gather requirements
2. **Landing Page Phase**: Restructure `/` route from status checker to marketing page
3. **Typography Phase**: Install chosen font, update global styles and layout
4. **Glass Enhancement Phase**: Apply glass styling to Dashboard, Pricing, MCP pages
5. **Polish Phase**: Add micro-interactions, validate accessibility, cross-browser test

### Key Modules to Touch
- **Landing Page** (`web/app/page.tsx`): Complete rewrite from status checker to marketing page
- **Layout** (`web/app/layout.tsx`): Update font family import
- **Global Styles** (`web/app/globals.css`): Add typography scale, refine glass tokens if needed
- **Navigation** (`web/components/Navigation.tsx`): Already has glass styling (verify, minor tweaks if needed)
- **Dashboard** (`web/app/dashboard/page.tsx`): Apply glass to Profile, Subscription, API Keys cards
- **Pricing** (`web/app/pricing/page.tsx`): Apply glass to pricing tier cards
- **MCP** (`web/app/mcp/page.tsx`): Apply glass to configuration container

### Data/API Impacts
None. Pure frontend/styling change with no backend or API modifications.

## Relevant Files

### Modified Files
- `web/app/page.tsx` — Complete landing page redesign (status checker → marketing page)
- `web/app/layout.tsx` — Update font family import (next/font or CDN)
- `web/app/globals.css` — Add typography scale (h1-h6, body, code), refine glass tokens if needed
- `web/components/Navigation.tsx` — Verify glass styling, minor tweaks if needed (already applied in #281)
- `web/app/dashboard/page.tsx` — Apply glass to Profile, Subscription, API Keys sections
- `web/app/pricing/page.tsx` — Apply glass to pricing tier cards
- `web/app/mcp/page.tsx` — Apply glass to configuration display container
- `web/app/login/page.tsx` — Apply glass to authentication modal (optional, if time permits)

### New Files
- `web/components/LandingHero.tsx` — Hero section component (value proposition, CTA)
- `web/components/FeatureShowcase.tsx` — Feature grid component (search, dependencies, change impact)
- `web/components/UserJourney.tsx` — Onboarding visualization component (3-step flow)
- `web/public/assets/` — Design assets if needed (optional, can use placeholder images)

## Task Breakdown

### Phase 1: User Consultation (MANDATORY - 0.5 days)
**Agent must obtain user approval before proceeding with implementation**
- Present design proposal to user
- Discuss font selection (Inter, SF Pro, Geist, or custom)
- Review landing page structure and content priorities
- Align on color palette refinements
- Confirm component update priority order
- Document user preferences for implementation

### Phase 2: Landing Page Architecture (1 day)
- Rewrite `web/app/page.tsx` from status checker to marketing landing page
- Create `LandingHero.tsx`: Hero section with value proposition ("Code Intelligence for AI Agents")
- Create `FeatureShowcase.tsx`: Feature grid showcasing code search, dependency analysis, change impact
- Create `UserJourney.tsx`: Visualize 3-step onboarding (OAuth → API key → MCP config)
- Add strong CTA button: "Get Started" → `/login`
- Add footer with links to docs, pricing, GitHub, support
- Ensure responsive design for mobile, tablet, desktop

### Phase 3: Typography System (0.5 days)
- Install chosen font via next/font (e.g., `import { Inter } from 'next/font/google'`)
- Update `web/app/layout.tsx` to apply font family
- Define typography scale in `web/app/globals.css`:
  - Heading levels: h1-h6 with consistent sizing and line-height
  - Body text: base font size, line-height, letter-spacing
  - Code snippets: maintain monospace (JetBrains Mono, Fira Code, etc.)
- Validate contrast on all text elements (≥4.5:1 for body, ≥3:1 for large text)

### Phase 4: Liquid Glass Integration (1-2 days)
- Apply glass utilities from `web/app/globals.css:58-106` (`.glass-light`, `.glass-dark`, `.glass-modal`)
- Update `web/app/dashboard/page.tsx`: Apply glass to card containers
- Update `web/app/pricing/page.tsx`: Apply glass to pricing tier cards
- Update `web/app/mcp/page.tsx`: Apply glass to configuration display container
- Optional: Update `web/app/login/page.tsx`: Apply glass to authentication modal
- Validate contrast at every component update (use WebAIM Contrast Checker)
- Test reduced-transparency fallback (macOS "Reduce transparency" setting)

### Phase 5: Visual Polish (0.5-1 day)
- Add micro-interactions: hover states, focus rings, loading spinners
- Implement smooth transitions (Tailwind `transition-all duration-200`)
- Add subtle shadows for depth (complement glass effects)
- Ensure consistent spacing using Tailwind spacing scale
- Dark mode testing: verify glass effects work in both themes
- Mobile responsiveness: test on iPhone SE and mid-range Android

### Phase 6: Validation and Testing (0.5-1 day)
- Run Lighthouse audit: Performance ≥90, Accessibility ≥90
- Run axe DevTools scan: Zero critical violations
- Cross-browser testing: Chrome, Firefox, Safari (desktop + mobile)
- Manual testing: Complete user journey (OAuth → API key → MCP config)
- Screen reader testing: VoiceOver (macOS) or NVDA (Windows)
- User feedback: Gather approval from 2-3 team members

## Step by Step Tasks

### User Consultation
1. Present design proposal to user with:
   - Font options: Inter, SF Pro, Geist (show samples)
   - Landing page wireframe/structure
   - Color palette refinements
   - Component update priority
2. Document user preferences
3. Obtain approval to proceed with implementation

### Landing Page Development
4. Create `web/components/LandingHero.tsx`:
   - Hero section with headline: "Code Intelligence for AI Agents"
   - Subheadline: "Make Claude Code smarter about your codebase"
   - CTA button: "Get Started" → `/login`
   - Optional: Animated gradient background
5. Create `web/components/FeatureShowcase.tsx`:
   - Feature grid with 3-4 cards:
     - Code Search: Fast semantic code search across repositories
     - Dependency Analysis: Understand file relationships and impact
     - Change Impact: Validate changes before implementation
     - MCP Integration: Seamless integration with Claude Code
6. Create `web/components/UserJourney.tsx`:
   - 3-step visualization:
     - Step 1: Sign up with GitHub OAuth
     - Step 2: Generate API key
     - Step 3: Paste MCP config → enhanced agents
7. Rewrite `web/app/page.tsx`:
   - Import and compose new components
   - Add footer with navigation links
   - Ensure responsive layout
   - Test authenticated vs unauthenticated states

### Typography Implementation
8. Install chosen font:
   - Add to `web/app/layout.tsx` using next/font
   - Apply font family to body element
9. Define typography scale in `web/app/globals.css`:
   - Heading styles: h1-h6 (font size, weight, line-height)
   - Body text: base size, line-height, letter-spacing
   - Code fonts: maintain monospace for code snippets
10. Validate typography across all pages:
    - Check contrast ratios (≥4.5:1 for body text)
    - Test readability on mobile and desktop
    - Verify consistent spacing

### Liquid Glass Application
11. Update `web/app/dashboard/page.tsx`:
    - Apply `.glass-light` or `.glass-dark` to Profile card
    - Apply glass styling to Subscription section
    - Apply glass styling to API Keys section
    - Validate contrast for all text on glass surfaces
    - Test hover states and transitions
12. Update `web/app/pricing/page.tsx`:
    - Apply glass styling to Free tier card
    - Apply glass styling to Solo tier card
    - Apply glass styling to Team tier card
    - Validate button text contrast on glass backgrounds
    - Test responsive layout
13. Update `web/app/mcp/page.tsx`:
    - Apply glass container to configuration display
    - Validate code snippet readability on glass surface
    - Test copy-to-clipboard functionality
14. Verify `web/components/Navigation.tsx`:
    - Already has glass styling from #281
    - Test sticky positioning with glass effect
    - Validate text contrast ≥4.5:1
15. Optional: Update `web/app/login/page.tsx`:
    - Apply glass modal styling to authentication form
    - Validate contrast for form inputs

### Visual Polish
16. Add micro-interactions:
    - Hover states: scale, opacity, shadow changes
    - Focus states: ring-2 with brand color
    - Loading states: spinners or skeleton loaders
    - Button press states: slight scale reduction
17. Implement transitions:
    - Add `transition-all duration-200` to interactive elements
    - Test smooth state changes across all components
18. Add shadows for depth:
    - Subtle shadows on glass cards (complement glass effects)
    - Consistent shadow scale across components
19. Spacing audit:
    - Verify consistent spacing using Tailwind scale (4, 8, 16, 24, 32, 64)
    - Fix any alignment issues

### Validation and Testing
20. Run Lighthouse audit:
    - Navigate to pages: `/`, `/dashboard`, `/pricing`, `/mcp`
    - Target: Performance ≥90, Accessibility ≥90
    - Document scores in validation report
21. Run axe DevTools scan:
    - Scan all updated pages
    - Resolve critical and serious violations
    - Document any minor violations (acceptable if not blocking)
22. Contrast validation:
    - Use WebAIM Contrast Checker on all text on glass surfaces
    - Document contrast ratios (≥4.5:1 for body, ≥3:1 for large text)
23. Cross-browser testing:
    - Chrome (desktop + mobile): Verify glass effects render correctly
    - Firefox (desktop + mobile): Test `-webkit-` prefix fallback
    - Safari (desktop + mobile): Verify `-webkit-backdrop-filter` support
    - Document any browser-specific quirks
24. Mobile responsiveness:
    - Test on iPhone SE (small screen)
    - Test on mid-range Android device
    - Verify no layout shift or frame drops
25. Accessibility testing:
    - Test reduced transparency (macOS setting)
    - Screen reader testing: VoiceOver or NVDA
    - Keyboard navigation: ensure all interactive elements accessible
26. User feedback:
    - Demo to 2-3 team members
    - Gather feedback on visual appeal and clarity
    - Iterate on feedback if needed

### Final Validation and Push
27. Run full validation suite:
    - `cd web && bunx tsc --noEmit` (type-check)
    - `cd web && bun run lint` (linting)
    - `cd web && bun run build` (production build)
    - Fix any TypeScript errors or lint warnings
28. Take screenshots for PR:
    - Before/after comparison for key pages
    - Visual regression documentation
29. Commit changes:
    - `feat: redesign landing page with marketing content (#420)`
    - `feat: add modern typography system (#420)`
    - `feat: apply liquid glass styling across dashboard, pricing, mcp (#420)`
    - Follow conventional commits format
30. Push branch and verify CI:
    - `git push -u origin feat/420-landing-page-typography-glass`
    - Monitor GitHub Actions for build/lint/type-check success

## Risks & Mitigations

### Risk: Design Disagreement (User vs Agent)
**Mitigation**: **MANDATORY user consultation before implementation**. Agent presents design proposal with mockups or references, user approves before coding begins. Documented in Phase 1.

### Risk: Scope Creep (Over-Designing)
**Mitigation**: User consultation phase sets clear boundaries. Focus on 4 core pages (landing, dashboard, pricing, mcp). Defer advanced animations or custom illustrations to future iterations.

### Risk: Text Readability on Glass Surfaces
**Mitigation**: Follow #281 spec guidelines - validate contrast at every component update using WebAIM Contrast Checker. If contrast falls below 4.5:1, reduce glass opacity or add text shadow (`text-shadow: 0 1px 2px rgba(0,0,0,0.3)`).

### Risk: Performance Degradation on Mobile
**Mitigation**: Limit backdrop-filter usage to 3-4 layers. Test on iPhone SE and mid-range Android. Reduce blur intensity on mobile breakpoints if needed (`md:backdrop-blur-md` vs desktop `backdrop-blur-lg`).

### Risk: Font Loading Performance Impact
**Mitigation**: Use next/font for automatic font optimization. Enable font-display: swap to prevent FOIT (Flash of Invisible Text). Measure Lighthouse Performance score before/after.

### Risk: Browser Compatibility Issues
**Mitigation**: Add `-webkit-` prefix for Safari support. Implement `@supports` fallback for browsers without `backdrop-filter`. Test in Firefox, Safari, Chrome across desktop and mobile.

### Risk: Accessibility Violations (Low Contrast, Screen Reader Issues)
**Mitigation**: Run axe DevTools scan on all pages. Validate keyboard navigation works. Implement `prefers-reduced-transparency` media query. Test with screen readers to ensure glass effects don't interfere.

### Risk: Landing Page Content Misalignment with Product Vision
**Mitigation**: User consultation in Phase 1 aligns content with product roadmap. Landing page content should reflect MCP-first philosophy from #399.

## Validation Strategy

### Automated Tests
- **TypeScript**: `cd web && bunx tsc --noEmit` (must pass)
- **Lint**: `cd web && bun run lint` (must pass)
- **Build**: `cd web && bun run build` (must succeed, no production build errors)
- **Lighthouse CI**: Run performance/accessibility audit before and after implementation
  - Target: Performance ≥90, Accessibility ≥90, Best Practices ≥90
  - Compare scores to detect regression
- **axe DevTools**: Automated accessibility scan on `/`, `/dashboard`, `/pricing`, `/mcp`
  - Zero critical or serious violations allowed

### Manual Testing Checklist
**Level 2 Validation (Critical Paths)**:
- [ ] Landing page renders with hero, features, journey, CTA
- [ ] OAuth login flow completes successfully (unchanged from before)
- [ ] Dashboard renders with glass-styled cards (Profile, Subscription, API Keys)
- [ ] Pricing page renders with glass-styled tier cards
- [ ] MCP page renders with glass-styled configuration container
- [ ] Navigation highlights active page
- [ ] Dark mode toggle works on all pages
- [ ] Typography is consistent across all pages
- [ ] Glass effects render correctly in Chrome, Firefox, Safari
- [ ] Mobile responsiveness verified on iPhone SE and Android

**Level 3 Validation (Edge Cases)**:
- [ ] Reduced transparency testing: macOS "Reduce transparency" enabled → solid backgrounds
- [ ] Screen reader testing: VoiceOver or NVDA navigates correctly
- [ ] Keyboard navigation: all interactive elements accessible via Tab
- [ ] Contrast validation: all text on glass surfaces ≥4.5:1 (WebAIM Contrast Checker)
- [ ] Performance testing: no frame drops on mid-range mobile
- [ ] API key generation still works (unchanged from before)
- [ ] Stripe checkout still works (unchanged from before)
- [ ] MCP config copy to clipboard still works (unchanged from before)

### Release Guardrails
- **Visual Regression**: Screenshot comparison before/after for key pages (home, dashboard, pricing, mcp)
- **User Feedback**: Internal team review from 2-3 developers on readability and visual appeal
- **Rollback Plan**: If accessibility issues arise post-deployment, feature flag can disable glass effects via CSS variable (`--glass-enabled: 0`)
- **Monitoring**: Track user feedback via support channels for readability complaints (first 2 weeks post-launch)

## Validation Commands

```bash
# Type-checking
cd web && bunx tsc --noEmit

# Linting
cd web && bun run lint

# Production build
cd web && bun run build

# Start development server for manual testing
cd web && bun run dev

# Run Lighthouse audit (manual via Chrome DevTools)
# Navigate to http://localhost:3001
# Open DevTools → Lighthouse → Run audit

# Accessibility scan (manual via axe DevTools browser extension)
# Install axe DevTools extension
# Navigate to updated pages and run scan
```

## Issue Relationships

**Builds On**:
- #281: Liquid Glass design system (CSS tokens implemented, Navigation already styled)
- #399: Frontend simplification (reduced to 4 core pages: landing, dashboard, pricing, mcp)
- #396: MCP configuration page (core page to style with glass effects)

**Related To**:
- #355: MVP launch (first impressions matter for production launch)
- #273: OAuth + Stripe integration (landing page should showcase these features)
- #317: Dev-mode session endpoint (authentication testing infrastructure)

**Depends On**: None (can proceed independently)

**Blocks**: None (quality-of-life improvement, not a blocker for other work)

## References

- #281 spec: `docs/specs/feature-281-liquid-glass-design.md`
- #399 spec: `docs/specs/refactor-399-simplify-web-frontend.md`
- Liquid Glass CSS: `web/app/globals.css:9-106`
- Current landing page: `web/app/page.tsx:1-109`
- Navigation component: `web/components/Navigation.tsx` (already has glass styling)
- [LogRocket: Apple's Liquid Glass UI Design](https://blog.logrocket.com/ux-design/apple-liquid-glass-ui/)
- [WCAG 2.1 Contrast Requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Next.js Font Optimization](https://nextjs.org/docs/basic-features/font-optimization)

## Notes

**User Consultation is Mandatory**: This issue requires design decisions that must align with user preferences. Agent MUST present design proposal and obtain approval before implementation.

**Accessibility First**: If glass effects compromise readability, prioritize contrast over aesthetics. Consider offering high-contrast mode toggle if needed.

**MCP-First Philosophy**: Landing page content should align with the MCP-first product vision from #399. Clear user journey: sign up → API key → MCP config → better agents.

**Landing Page Content Strategy**: Focus on communicating:
1. What KotaDB does (code intelligence for AI agents via MCP)
2. Why developers should use it (makes Claude Code smarter)
3. How to get started (30-second onboarding)

**Typography Best Practices**: Modern web fonts improve perceived professionalism. Recommended fonts:
- **Inter**: Excellent readability, supports code-heavy interfaces
- **SF Pro**: Apple's system font, familiar to many developers
- **Geist**: Vercel's font, optimized for developer tools

**Browser Support**: `backdrop-filter` is supported in 95%+ of browsers as of 2025, but requires `-webkit-` prefix for Safari. Fallback to solid backgrounds for older browsers via `@supports` feature detection.

**Performance Consideration**: Limit backdrop-filter usage to 3-4 layers maximum to prevent GPU overdraw. Test on mid-range mobile devices and reduce blur intensity on smaller breakpoints if needed.

**Future Enhancements** (out of scope for this issue):
- Animated glass refraction using WebGL
- Custom illustrations or 3D graphics
- Video demonstrations
- Interactive code playground
- High-contrast mode toggle in user preferences

## Commit Message Validation

All commits for this feature will be validated. Ensure commit messages:
- Follow Conventional Commits format: `<type>(<scope>): <subject>`
- Valid types: feat, fix, chore, docs, test, refactor, perf, ci, build, style
- **AVOID meta-commentary patterns**: "based on", "the commit should", "here is", "this commit", "i can see", "looking at", "the changes", "let me"
- Use direct statements: `feat: add landing page hero section` not `Based on the plan, this commit adds landing page hero section`

**Good commit message examples**:
```
feat: redesign landing page with marketing content (#420)
feat: add modern typography system with Inter font (#420)
feat: apply liquid glass styling to dashboard cards (#420)
feat: apply liquid glass styling to pricing tiers (#420)
feat: apply liquid glass styling to MCP configuration (#420)
```

**Bad commit message examples**:
```
feat: based on the plan, redesign landing page
feat: this commit adds typography system
feat: looking at the changes, let me apply glass styling
```
