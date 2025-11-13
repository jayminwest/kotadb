# Feature Plan: Mobile Navigation for Web Application

**Issue**: #452
**Title**: feat: add mobile navigation for web application
**Component**: component:backend (needs frontend/web component label)
**Priority**: priority:high
**Effort**: effort:medium (1-3 days)
**Status**: status:needs-investigation

## Overview

### Problem
The KotaDB web application lacks mobile navigation, forcing users to manually type URLs to navigate between pages. The current `Navigation.tsx` component uses `hidden md:flex` to hide navigation links on mobile viewports, making the dashboard (/dashboard), MCP setup (/mcp), pricing (/pricing), and other key pages inaccessible via UI on mobile devices. This creates a critical UX issue discovered during manual smoke testing (#448) on develop.kotadb.io.

**Current State**:
- Desktop navigation works perfectly with horizontal nav links
- Mobile viewports (< 768px) hide all navigation links via `hidden md:flex`
- Users on Safari mobile and Chrome mobile cannot navigate without manually typing URLs
- Existing liquid glass design system is implemented but not applied to mobile navigation

### Desired Outcome
Implement mobile-responsive navigation that provides:
- Accessible navigation menu on mobile viewports (hamburger menu pattern)
- Links to all key pages: Dashboard, Pricing, MCP, with logout functionality
- Seamless integration with existing Liquid Glass design system (#281)
- Consistent user experience across mobile and desktop breakpoints
- Preserved desktop navigation without any regressions

### Non-Goals
- Bottom navigation bar implementation (deferred - hamburger menu is simpler and consistent with desktop header)
- Redesigning desktop navigation layout or behavior
- Adding new pages or navigation destinations beyond existing routes
- Implementing swipe gestures or advanced mobile interactions
- Mobile-specific page layouts (this is purely navigation infrastructure)

## Technical Approach

### Architecture Notes
The implementation follows a mobile-first enhancement approach:
1. **Component Layer**: Add mobile menu state management to existing `Navigation.tsx`
2. **UI Layer**: Implement hamburger icon and slide-out drawer with glass styling
3. **Accessibility Layer**: Ensure keyboard navigation, focus management, and ARIA labels
4. **Responsive Design**: Use Tailwind breakpoints to toggle desktop/mobile navigation patterns

**Key Design Decisions**:
- **Hamburger Menu** over bottom nav: Aligns with existing sticky header, simpler implementation
- **Client-side state**: React useState for menu open/close (no persistence needed)
- **Glass Styling**: Reuse existing `glass-light`/`glass-dark` utilities for consistency
- **Animation**: CSS transitions for smooth drawer open/close (60fps performance)

### Key Modules to Touch
- **Navigation Component** (`web/components/Navigation.tsx`): Add mobile menu state, hamburger button, drawer markup
- **Global Styles** (`web/app/globals.css`): Add drawer animation styles and overlay backdrop
- **Layout** (`web/app/layout.tsx`): Verify no layout shifts from drawer implementation
- **Liquid Glass Design System**: Leverage existing glass utilities for drawer and overlay

### Data/API Impacts
None. This is a pure frontend/UI change with no backend, API, or database modifications.

## Relevant Files

### Modified Files
- `web/components/Navigation.tsx` — Add mobile menu state management, hamburger button, slide-out drawer with navigation links
- `web/app/globals.css` — Add drawer animation keyframes and overlay backdrop styling (optional - can use inline Tailwind)
- `web/tailwind.config.ts` — Add drawer width token if needed (optional - can use fixed width)

### New Files
None. All functionality can be implemented in existing `Navigation.tsx` component.

## Task Breakdown

### Phase 1: Mobile Menu Foundation (0.5 days)
- Add mobile menu state (`isMenuOpen`, `setIsMenuOpen`) to Navigation component
- Create hamburger icon button (visible on mobile: `md:hidden`)
- Implement drawer container with glass styling and slide-in animation
- Add overlay backdrop with click-to-close functionality

### Phase 2: Navigation Links and Functionality (0.5 days)
- Render navigation links in mobile drawer (Dashboard, Pricing, MCP)
- Add user profile section (email, tier badge, sign out button)
- Implement active route highlighting (same as desktop)
- Ensure drawer closes on navigation link click
- Test authentication states (authenticated vs. unauthenticated)

### Phase 3: Accessibility, Animation, and Testing (0.5-1 day)
- Add ARIA labels and roles (menu, menuitem, aria-expanded)
- Implement focus trapping in open drawer (prevent focus outside)
- Add keyboard navigation (Escape key to close, Tab navigation)
- Implement smooth CSS transitions for drawer and backdrop
- Test on Safari mobile and Chrome mobile
- Validate contrast ratios on glass backgrounds
- Ensure no desktop navigation regressions
- Verify touch targets meet 44x44px minimum size

## Step by Step Tasks

### Foundation Setup
1. Review existing Navigation component structure and authentication context
2. Research mobile menu best practices and accessibility patterns (ARIA, focus management)
3. Plan mobile menu state management approach (useState, close on route change)
4. Design drawer layout: width (80vw or 320px max), slide direction (left or right), overlay backdrop

### Mobile Menu Implementation
5. Add mobile menu state to `Navigation.tsx`:
   - `const [isMenuOpen, setIsMenuOpen] = useState(false)`
   - Close menu on route change with `useEffect` watching `pathname`
   - Add escape key handler to close menu
6. Create hamburger icon button (top-right of navbar, mobile only):
   - Use SVG icon (3 horizontal lines) or existing icon library
   - Apply `md:hidden` to show only on mobile
   - Add click handler to toggle `isMenuOpen`
   - Style with glass button aesthetics matching existing nav buttons
7. Implement slide-out drawer container:
   - Fixed positioning: `fixed inset-y-0 left-0 z-50` (slides from left)
   - Width: `w-80` (320px) with max-width constraint
   - Glass background: `glass-light dark:glass-dark`
   - Transform animation: `translate-x-0` (open) vs `-translate-x-full` (closed)
   - Smooth transition: `transition-transform duration-300 ease-in-out`
8. Add overlay backdrop:
   - Fixed positioning: `fixed inset-0 z-40`
   - Semi-transparent black: `bg-black/50`
   - Click handler to close drawer: `onClick={() => setIsMenuOpen(false)}`
   - Fade animation: `transition-opacity duration-300`
   - Conditional rendering: show only when `isMenuOpen` is true
9. Populate drawer with navigation links:
   - Logo/brand at top (matching desktop navbar)
   - Navigation links section: Dashboard, Pricing, MCP (if authenticated)
   - User profile section at bottom: email, tier badge, sign out button
   - Add dividers between sections for visual hierarchy
   - Apply active route styling (same logic as desktop: `isActive(path)`)
10. Implement drawer close behavior:
    - Close on navigation link click: add `onClick={() => setIsMenuOpen(false)}` to each link
    - Close on overlay backdrop click
    - Close on Escape key press (keyboard accessibility)
    - Ensure smooth animation on close (same transition as open)

### Accessibility and UX Refinement
11. Add ARIA attributes:
    - Hamburger button: `aria-label="Open menu"`, `aria-expanded={isMenuOpen}`
    - Drawer container: `role="dialog"`, `aria-modal="true"`, `aria-label="Mobile navigation"`
    - Navigation list: `role="menu"`, individual links: `role="menuitem"`
12. Implement focus management:
    - When drawer opens: focus first navigation link
    - When drawer closes: return focus to hamburger button
    - Trap focus inside drawer when open (prevent Tab to underlying content)
    - Use `useEffect` with `document.activeElement` to manage focus
13. Add keyboard navigation:
    - Escape key closes drawer
    - Tab cycles through links inside drawer (focus trapping)
    - Arrow keys for vertical navigation (optional enhancement)
14. Implement smooth animations:
    - Drawer slide-in: `transform translate-x` with `transition-transform duration-300`
    - Overlay fade-in: `opacity` with `transition-opacity duration-300`
    - Test 60fps performance on mid-range mobile devices
15. Validate touch targets:
    - All buttons and links: minimum 44x44px touch area
    - Hamburger icon: `h-12 w-12` (48px, meets accessibility standard)
    - Navigation links: `py-4 px-6` (comfortable tap area)
    - Sign out button: same sizing as other interactive elements

### Testing and Validation
16. Mobile browser testing:
    - Safari mobile (iOS 15+): Verify drawer animation, glass effects, touch interactions
    - Chrome mobile (Android): Test same scenarios, ensure parity with iOS
    - Test on staging environment (develop.kotadb.io)
    - Verify no console errors or warnings in mobile DevTools
17. Contrast and readability validation:
    - Use WebAIM Contrast Checker for text on glass backgrounds
    - Ensure all text meets WCAG 2.1 AA: ≥4.5:1 for body text
    - Test in light mode and dark mode
    - Verify tier badges remain readable in drawer
18. Desktop regression testing:
    - Verify desktop navigation remains unchanged (horizontal links visible)
    - Ensure hamburger button is hidden on desktop (`md:hidden`)
    - Test sticky navbar behavior with drawer implementation
    - Validate glass effects still work on desktop navbar
19. Accessibility audit:
    - Run axe DevTools scan on mobile viewport
    - Verify focus trapping works correctly
    - Test with VoiceOver (iOS) or TalkBack (Android)
    - Ensure keyboard navigation (Escape, Tab) works as expected
20. Performance validation:
    - Run Lighthouse mobile audit on staging
    - Verify Performance ≥90, Accessibility ≥90
    - Test on iPhone SE and mid-range Android device
    - Ensure no layout shift from drawer implementation

### Documentation and Finalization
21. Update `web/docs/STYLING_GUIDE.md`:
    - Add "Mobile Navigation" section documenting hamburger menu pattern
    - Include code example for mobile drawer with glass styling
    - Document accessibility requirements (ARIA, focus management)
    - Add troubleshooting section for common mobile nav issues
22. Take screenshots for PR:
    - Mobile view with closed menu (hamburger icon visible)
    - Mobile view with open drawer (showing navigation links)
    - Desktop view (unchanged, hamburger hidden)
    - Both light mode and dark mode variants
23. Run final validation commands:
    - `cd web && bun run lint` (ensure no ESLint errors)
    - `cd web && bun run typecheck` (TypeScript compilation)
    - `cd web && bun run build` (production build verification)
    - Fix any errors or warnings that surface
24. Commit changes with conventional format:
    - `feat(web): add mobile navigation with hamburger menu (#452)`
    - Include summary of implementation approach and testing coverage
    - Reference issue #448 (smoke testing discovery) in commit body
25. Push branch and prepare for PR:
    - `git add web/components/Navigation.tsx web/app/globals.css web/docs/STYLING_GUIDE.md`
    - `git commit` (follow commit message validation rules)
    - `git push -u origin feature-452-72b62f86`
    - Verify CI passes (lint, typecheck, build)
    - Create PR with title: `feat: add mobile navigation for web application (#452)`

## Risks & Mitigations

### Risk: Text Readability in Mobile Drawer
**Mitigation**: Reuse existing glass utilities (`glass-light`/`glass-dark`) that are already validated for contrast. If drawer background is too transparent, increase opacity in drawer-specific class. Test with WebAIM Contrast Checker at each step.

### Risk: Focus Trapping Breaking Accessibility
**Mitigation**: Use proven focus trap pattern from accessibility libraries (e.g., focus-trap-react or manual implementation with `querySelectorAll`). Test with screen readers (VoiceOver, TalkBack) to ensure users can escape drawer. Escape key as fallback exit.

### Risk: Drawer Animation Performance on Low-End Devices
**Mitigation**: Use CSS `transform` (GPU-accelerated) instead of `left`/`right` properties. Limit blur to drawer container only (not individual links). Test on iPhone SE and budget Android device. If performance issues arise, reduce blur intensity on mobile or disable animations with `prefers-reduced-motion`.

### Risk: Desktop Navigation Regression
**Mitigation**: Use responsive utilities carefully (`md:hidden` for hamburger, `hidden md:flex` for desktop links). Test on multiple desktop breakpoints (1024px, 1280px, 1920px). Run visual regression tests with screenshots before/after. Ensure hamburger button is completely hidden on desktop (not just invisible).

### Risk: State Management Issues (Menu Not Closing)
**Mitigation**: Close drawer on route change with `useEffect` watching `pathname`. Add explicit close handlers on link clicks, backdrop clicks, and Escape key. Test edge cases: sign out button, external links, page refresh.

### Risk: Mobile Safari Quirks (Fixed Positioning, Viewport Units)
**Mitigation**: Test on real iOS device (not just simulator). Use `inset-y-0` instead of `top-0 bottom-0` for better cross-browser support. Avoid `100vh` if it causes issues; use `fixed` positioning with `height: 100%`. Document any Safari-specific workarounds.

## Validation Strategy

### Automated Tests
- **TypeScript + Lint**: `bun run typecheck` and `bun run lint` must pass (zero errors)
- **Production Build**: `bun run build` must succeed (no compilation errors)
- **Lighthouse Mobile**: Run performance/accessibility audit on staging
  - Target: Performance ≥90, Accessibility ≥90
  - Test on `/dashboard`, `/mcp`, `/pricing` with mobile viewport
- **axe DevTools**: Automated accessibility scan on mobile viewport
  - Zero critical or serious violations
  - Verify ARIA attributes and keyboard navigation

### Manual Checks
- **Mobile Browser Testing**:
  - Safari mobile (iOS 15+): Navigation flow, drawer animation, glass effects
  - Chrome mobile (Android): Same scenarios, verify cross-platform parity
  - Test on develop.kotadb.io staging environment
  - Document any browser-specific issues or workarounds
- **Contrast Validation**:
  - WebAIM Contrast Checker for text on glass drawer background
  - Verify light mode and dark mode both meet WCAG 2.1 AA (≥4.5:1)
  - Check tier badges, sign out button, navigation links
- **Touch Target Validation**:
  - Measure hamburger icon, navigation links, buttons with browser DevTools
  - Ensure all interactive elements ≥44x44px
  - Test with actual finger taps (not mouse clicks)
- **Focus Management Testing**:
  - Open drawer: first link receives focus
  - Close drawer: focus returns to hamburger button
  - Tab key cycles through drawer links (trapped)
  - Escape key closes drawer from any focused element
- **Screen Reader Testing**:
  - VoiceOver (iOS) or TalkBack (Android) navigation
  - Verify ARIA labels are announced correctly
  - Ensure drawer can be opened, navigated, and closed with screen reader gestures
- **Desktop Regression Testing**:
  - Verify horizontal navigation links visible on desktop
  - Ensure hamburger button is completely hidden (not present in DOM or with `display: none`)
  - Test on multiple desktop breakpoints: 768px, 1024px, 1440px, 1920px
  - Validate sticky navbar behavior unchanged

### Release Guardrails
- **Staging Validation**: Full smoke test on develop.kotadb.io before merging to develop
  - Test authenticated and unauthenticated flows
  - Verify all navigation destinations load correctly
  - Check rate limit status, tier badges, sign out functionality
- **User Feedback**: Internal team review on mobile devices (gather feedback from 2-3 developers)
- **Rollback Plan**: If mobile navigation issues arise post-deployment, hotfix can hide mobile menu with `display: none` on `.mobile-menu` class while investigating
- **Monitoring**: Track user feedback via support channels for navigation usability issues (first 2 weeks post-launch)

## Validation Commands

```bash
# Type-checking
cd web && bun run typecheck

# Linting
cd web && bun run lint

# Production build
cd web && bun run build

# Start development server for manual testing
cd web && bun run dev

# Mobile testing (use browser DevTools device mode or real devices)
# Navigate to http://localhost:3001 and test on iPhone SE, Pixel 5 viewports

# Run Lighthouse mobile audit (manual via Chrome DevTools)
# 1. Open DevTools → Lighthouse
# 2. Select "Mobile" device
# 3. Select "Performance" and "Accessibility" categories
# 4. Run audit on /dashboard, /mcp, /pricing

# Accessibility scan (manual via axe DevTools browser extension)
# 1. Install axe DevTools extension
# 2. Set viewport to mobile (375x667 or 390x844)
# 3. Navigate to /dashboard, /mcp, /pricing
# 4. Run axe scan and verify zero critical/serious violations
```

## Issue Relationships

**Related To**:
- #448: Manual Smoke Testing Issues (discovered mobile navigation gap)
- #281: Liquid Glass Design System (reuse glass utilities for drawer)
- #420: Related design system work (Liquid Glass styling context)

**Depends On**: None (can proceed independently)

**Blocks**: None (UX improvement, not a blocker for other work)

## References

- [MDN: ARIA Best Practices for Menus](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/menu_role)
- [W3C: Disclosure Pattern (Hamburger Menu)](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [WebAIM: Keyboard Accessibility](https://webaim.org/techniques/keyboard/)
- [Apple Human Interface Guidelines: Navigation](https://developer.apple.com/design/human-interface-guidelines/components/navigation-and-search/navigation-bars/)
- [Tailwind CSS: Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Liquid Glass Design System](web/docs/STYLING_GUIDE.md) (internal documentation)

## Notes

**Hamburger Menu Pattern**: The hamburger menu (slide-out drawer) was chosen over bottom navigation bar because:
1. Aligns with existing sticky header architecture
2. Simpler implementation with fewer layout constraints
3. More space for navigation links and user profile section
4. Consistent with desktop navigation (both header-based)

**Glass Styling Consistency**: Reuse existing `glass-light` and `glass-dark` utilities from #281 implementation. No need to create new glass classes; drawer inherits same aesthetic as desktop navbar.

**Performance Consideration**: Drawer uses CSS `transform` for GPU-accelerated animation. Avoid JavaScript-based animation libraries to minimize bundle size and ensure 60fps performance on mid-range mobile devices.

**Future Enhancements**:
- Swipe gesture to open/close drawer (can be added in follow-up issue)
- Bottom navigation bar as alternative pattern (deferred for now)
- Persistent menu state in localStorage (not needed for MVP)
- Animated hamburger icon (three lines → X transition)

**Accessibility Priority**: Focus management and keyboard navigation are critical for this feature. The drawer must be fully accessible to screen reader users and keyboard-only navigation. Test with real assistive technologies before merging.

**Label Management Note**: Issue #452 is currently labeled `component:backend` but should have a frontend/web component label. Consider creating `component:frontend` or `component:web` label for web application features. For now, proceed with existing labels and document in PR description.
