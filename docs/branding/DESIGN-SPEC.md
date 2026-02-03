# KotaDB Design Specification

Issue: #133

## Design Decisions

| Element | Decision |
|---------|----------|
| Logo | Icon + wordmark combo |
| Colors | Cyan/Teal accent palette |
| Hero | Animated code demo |
| Animation | Subtle polish (transitions, reveals) |
| Glass Effects | Subtle frost - elegant, not heavy |
| Social Proof | GitHub stats bar |
| Feature Icons | Outlined icons |

---

## Visual Language

**Theme:** Liquid Glass + Terminal Elegance

**Core Principles:**
1. Depth through transparency - Frosted panels float above dark background
2. Cyan glow as signature - Subtle luminosity, not neon
3. Terminal authenticity - Real code, real commands
4. Quiet confidence - Polish without showiness

---

## Color Palette

```
Background:     #0a0a0f   (deeper black with slight blue tint)
Surface:        #12121a   (elevated panels)
Glass:          rgba(255,255,255,0.03) + backdrop-blur(12px)
Border:         rgba(255,255,255,0.08)

Cyan Primary:   #22d3ee   (cyan-400)
Cyan Glow:      #06b6d4   (cyan-500)
Cyan Muted:     #0891b2   (cyan-600)

Text:           #f4f4f5
Text Muted:     #a1a1aa
```

---

## Typography

**Fonts:** System stack (fast loading, native feel)
```css
--font-sans: -apple-system, BlinkMacSystemFont, Inter, "Segoe UI", Roboto, sans-serif;
--font-mono: "SF Mono", SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
```

**Hierarchy:**
- H1: 48-56px, weight 600
- H2: 32px, weight 600
- Body: 16px, weight 400
- Code: 14px, mono

---

## Logo

**Concept:** Geometric "K" with layered depth

- Three-dimensional K shape using overlapping polygons
- Creates sense of stacked data/database layers
- Cyan gradient from top-left to bottom-right
- Subtle glow effect for premium feel

**Files:**
- `logo-concept-v1.svg` - Full logo with wordmark
- `icon-only-v1.svg` - Icon mark for favicon/app icon

**Wordmark treatment:**
- "kota" in white (#f4f4f5)
- "db" in cyan (#22d3ee)
- Weight: 600 (semibold)
- Letter-spacing: -1px

---

## Components

### Hero Section
- Animated terminal window showing KotaDB commands
- Glass panel container with subtle border
- Floating glow underneath
- Typing animation for commands

### Feature Cards
- Subtle frosted glass background
- Outlined icons (not filled)
- Soft hover lift with glow increase
- Border: rgba(255,255,255,0.08)

### GitHub Stats Bar
- Horizontal layout: Stars | Forks | License
- Glass panel treatment
- Live data via GitHub API or shields.io

### Buttons
- Primary: Cyan fill, white text
- Secondary: Glass background, cyan text, subtle border

---

## Animation Guidelines

**Timing:** 200-300ms for micro-interactions
**Easing:** ease-out for enters, ease-in for exits
**Scroll reveals:** Fade up with 20px offset

**Allowed animations:**
- Hover state transitions
- Button press feedback
- Card hover lift
- Scroll-triggered reveals
- Terminal typing effect

**Avoid:**
- Parallax scrolling
- Auto-playing videos
- Distracting motion
