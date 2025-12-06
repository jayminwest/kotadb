# Docs: Clarify Marketing Site Copy with Benefit-Focused Value Proposition (Issue #489)

## User Story / Problem Statement

The current KotaDB marketing site copy is technically accurate but fails to communicate the **core value proposition** for developers who have never heard of the product. The messaging uses jargon ("MCP", "semantic search", "dependency analysis") without explaining **why** these matter.

**The Real Value Proposition:**
> KotaDB gives your AI coding assistant a searchable memory of your entire codebase. Instead of expensive repeated file reads, your AI can instantly find where functions are defined, trace dependencies, and search for patterns—making it dramatically better at accurate, context-aware changes.

**Target Audience:** Developers using Claude Code (or similar AI coding assistants) who want their AI to be smarter about their specific codebase.

## Expert Analysis Summary

### UX/Copy Analysis
- Current hero ("Code Intelligence for AI Agents") is generic and doesn't differentiate
- Subheadline uses unexplained jargon (MCP) - fails 5-second clarity test
- All 4 features are feature-focused, not benefit-focused
- CTA is generic, not transformational

### Technical Accuracy Verification
- **"Instant code search"**: Verified via `SEARCH_CODE_TOOL` - PostgreSQL full-text search
- **"Dependency mapping"**: Verified via `SEARCH_DEPENDENCIES_TOOL` with recursive depth 1-5
- **"Change impact analysis"**: Verified via `ANALYZE_CHANGE_IMPACT_TOOL`
- **"Searchable memory"**: Verified - persistent PostgreSQL storage, not ephemeral
- **"Works with Claude Code"**: Verified - MCP endpoint at POST /mcp

### Risk Assessment
- **Overall Risk:** VERY LOW
- No code logic changes, no API contracts modified, no styling changes
- Reversible with git revert

## Synthesized Recommendations

### Priority Actions
1. Rewrite hero headline/subheadline for immediate clarity
2. Transform feature descriptions from feature-focused to benefit-focused
3. Update user journey Step 3 to focus on transformation outcome
4. Revise CTA to be action-oriented with time-bound promise

### Jargon to Remove/Explain
- "MCP" / "Model Context Protocol" - remove from hero, simplify to "Works with Claude Code"
- "semantic search" - replace with "instant code search"
- "dependency graph traversal" - replace with "dependency mapping"

## Implementation Plan

### Phase 1: Feature Showcase (Do First)
- [ ] Update feature titles (Code Search → Instant Code Search, etc.)
- [ ] Rewrite feature descriptions with benefit-first framing
- [ ] Update section header to address hallucination pain point

### Phase 2: Landing Hero
- [ ] Replace headline: "Give Your AI a Searchable Memory of Your Codebase"
- [ ] Replace subheadline with plain-language benefit statement
- [ ] Remove unexplained MCP reference

### Phase 3: User Journey
- [ ] Simplify Step 1 description
- [ ] Update Step 2 with concrete tier info
- [ ] Rewrite Step 3 to focus on transformation ("Watch Your AI Get Smarter")

### Phase 4: CTA Section
- [ ] Replace headline with time-bound promise ("Make Your AI Smarter in 30 Seconds")
- [ ] Add social proof and friction removers to description

## File Changes

### File 1: web/components/FeatureShowcase.tsx

**Lines 2-23 - Replace features array:**
```tsx
const features = [
  {
    title: 'Instant Code Search',
    description: 'Your AI finds exactly what it needs in milliseconds—no more expensive file-by-file reading that burns through tokens and context windows',
    icon: '🔍',
  },
  {
    title: 'Dependency Mapping',
    description: 'Know what breaks before changing anything. Your AI sees the full picture of how files connect, preventing breaking changes',
    icon: '🔗',
  },
  {
    title: 'Change Impact Analysis',
    description: 'Validate changes before your AI writes them. Catch architectural conflicts and missing test coverage automatically',
    icon: '⚡',
  },
  {
    title: 'Works with Claude Code',
    description: 'Drop in your API key and Claude Code gains instant access to your entire codebase structure—zero config, maximum intelligence',
    icon: '🔌',
  },
]
```

**Lines 29-34 - Replace section header:**
```tsx
<h2 className="text-4xl font-bold mb-4">
  Everything Your AI Needs to Stop Hallucinating
</h2>
<p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
  Real code intelligence—not just embedding search
</p>
```

### File 2: web/components/LandingHero.tsx

**Lines 40-48 - Replace hero:**
```tsx
<h1 className="text-5xl md:text-6xl font-bold tracking-tight">
  Give Your AI a{' '}
  <span className="bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
    Searchable Memory
  </span>
  {' '}of Your Codebase
</h1>

<p className="text-xl md:text-2xl text-gray-700 dark:text-gray-300 max-w-3xl mx-auto">
  Stop your AI from guessing. KotaDB indexes your repositories so Claude Code can instantly find code, trace dependencies, and understand impact—without reading files one by one.
</p>
```

### File 3: web/components/UserJourney.tsx

**Lines 2-18 - Replace steps array:**
```tsx
const steps = [
  {
    number: '1',
    title: 'Sign Up with GitHub',
    description: 'One-click OAuth—no passwords, no credit card, no friction',
  },
  {
    number: '2',
    title: 'Get Your API Key',
    description: 'Free tier gives you 100 requests/hour to start. Upgrade as you grow',
  },
  {
    number: '3',
    title: 'Watch Your AI Get Smarter',
    description: 'Paste your key into Claude Code. Instantly, your AI can search thousands of files, map dependencies, and validate changes—no more guessing',
  },
]
```

### File 4: web/app/page.tsx

**Lines 16-20 - Replace CTA:**
```tsx
<h2 className="text-4xl font-bold">
  Make Your AI Smarter in 30 Seconds
</h2>
<p className="text-xl text-gray-600 dark:text-gray-400">
  Join developers who've given Claude Code a searchable memory of their codebase. Free tier. No credit card. Start now.
</p>
```

## Validation Requirements

- [ ] TypeScript compiles: `cd web && bunx tsc --noEmit`
- [ ] Dev server runs: `cd web && bun run dev`
- [ ] Visual inspection at http://localhost:3001
- [ ] Mobile responsive check (375px, 768px, 1440px)
- [ ] 5-second clarity test: First-time visitor can explain value proposition
- [ ] Zero unexplained jargon in hero section

## Notes

- All changes are copy-only (string literals)
- No props, interfaces, or component signatures change
- No styling/layout changes required
- Rollback: `git revert` if issues arise
