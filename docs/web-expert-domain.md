# Web Expert Domain Guide

> New in v2.2.0

## Overview

The Web Expert Domain provides specialized knowledge for managing KotaDB's marketing website, documentation site, and design system. It includes agents for planning, building, improving, and answering questions about web content and design.

## Domain Structure

```
.claude/agents/experts/web/
├── web-plan-agent.md      # Plans web content and design changes
├── web-build-agent.md     # Implements web content from specs
├── web-improve-agent.md   # Evolves web expertise from changes
└── web-question-agent.md  # Answers web development questions
```

## Scope and Responsibilities

### Content Management

- **Marketing pages**: Landing page, features, pricing
- **Documentation**: User guides, API reference, tutorials
- **Blog content**: Release announcements, philosophy posts
- **Legal pages**: Privacy policy, terms of service

### Design System

- **Components**: Reusable UI components
- **Styling**: CSS, themes, responsive design
- **Branding**: Colors, typography, logos, imagery
- **Layout**: Grid systems, spacing, breakpoints

### Site Architecture

- **Routing**: Page structure and navigation
- **SEO**: Meta tags, structured data, sitemaps
- **Performance**: Optimization, lazy loading, caching
- **Accessibility**: WCAG compliance, semantic HTML

## Agent Types

### web-plan-agent

Plans web content and design system changes.

**Use Cases:**
- New marketing page designs
- Documentation restructuring
- Design system updates
- SEO optimization plans

**Example Usage:**
```bash
/do "Plan a new features page highlighting v2.2.0 capabilities"
/do "Redesign the documentation navigation for better UX"
/do "Plan responsive design improvements for mobile"
```

**Specializations:**
- Content strategy and information architecture
- User experience (UX) planning
- Technical SEO optimization
- Performance improvement planning

### web-build-agent

Implements web content and design from specifications.

**Use Cases:**
- Creating new pages from designs
- Implementing component updates
- Building responsive layouts
- Adding new blog content

**Example Usage:**
```bash
/do "Build the new pricing page from the spec"
/do "Implement dark mode toggle component"
/do "Create responsive grid system for documentation"
```

**Specializations:**
- HTML/CSS/JavaScript implementation
- React/Next.js component development
- Responsive design implementation
- Content creation and formatting

### web-improve-agent

Updates web expertise based on recent changes and learnings.

**Use Cases:**
- Learning from site performance data
- Updating best practices
- Refining design patterns
- Incorporating user feedback

**Example Usage:**
```bash
/do "Update web expertise based on latest performance audit"
/do "Incorporate accessibility improvements into design system"
/do "Refine content strategy based on user analytics"
```

**Specializations:**
- Performance analysis and optimization
- User experience improvement
- Design system evolution
- Content effectiveness analysis

### web-question-agent

Answers questions about web development, design system, and content management.

**Use Cases:**
- Design system guidance
- Implementation questions
- Content strategy advice
- Technical web development help

**Example Usage:**
```bash
/do "How should we structure the new documentation sections?"
/do "What's the best approach for implementing dark mode?"
/do "How do we optimize page load times for the marketing site?"
```

**Specializations:**
- Web development best practices
- Design system guidance
- Content strategy recommendations
- Performance optimization advice

## Key Technologies

### Frontend Stack

- **Framework**: Next.js 14+ with App Router
- **Styling**: Tailwind CSS with custom design tokens
- **Components**: React components with TypeScript
- **Icons**: Lucide React icon library
- **Fonts**: Inter for UI, JetBrains Mono for code

### Content Management

- **Blog**: Markdown files in `web/blog/content/`
- **Documentation**: Markdown files in `web/docs/content/`
- **Static Pages**: React components in `web/src/app/`
- **Data**: JSON/YAML for structured content

### Build and Deployment

- **Build Tool**: Next.js built-in bundler
- **Styling**: PostCSS with Tailwind CSS
- **Optimization**: Next.js Image optimization, static generation
- **Deployment**: Vercel or static hosting

## Design System

### Color Palette

```css
/* Primary Colors */
--primary-50: #f0f9ff;
--primary-500: #3b82f6;
--primary-900: #1e3a8a;

/* Semantic Colors */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
--info: #3b82f6;
```

### Typography Scale

```css
/* Headings */
--text-4xl: 2.25rem;    /* 36px */
--text-3xl: 1.875rem;   /* 30px */
--text-2xl: 1.5rem;     /* 24px */
--text-xl: 1.25rem;     /* 20px */

/* Body Text */
--text-lg: 1.125rem;    /* 18px */
--text-base: 1rem;      /* 16px */
--text-sm: 0.875rem;    /* 14px */
```

### Component Library

- **Buttons**: Primary, secondary, outline, ghost variants
- **Cards**: Content cards with consistent spacing
- **Navigation**: Header, sidebar, breadcrumbs
- **Forms**: Input fields, selects, checkboxes
- **Feedback**: Alerts, modals, toast notifications

## Content Patterns

### Documentation Structure

```markdown
---
title: Page Title
description: Brief description for SEO
order: 1
last_updated: YYYY-MM-DD
version: 2.2.0
reviewed_by: web-build-agent
---

# Page Title

Brief introduction...

## Section 1

Content with consistent structure...
```

### Blog Post Format

```markdown
---
title: "Blog Post Title"
description: "SEO-optimized description"
author: "Author Name"
date: "YYYY-MM-DD"
tags: ["tag1", "tag2"]
image: "/blog/images/post-image.jpg"
---

# Blog Post Title

Introduction paragraph...
```

### Code Examples

```markdown
## Example Section

Brief explanation...

```typescript
// Clear, commented code examples
interface Example {
  property: string;
}
```

**Key points:**
- Point 1 about the example
- Point 2 with additional context
```

## Workflow Integration

### With /do Command

The web expert domain integrates seamlessly with the `/do` command:

```bash
# Content creation
/do "Create a blog post about v2.2.0 memory layer features"

# Design updates
/do "Update the homepage hero section with new messaging"

# Performance optimization
/do "Optimize image loading on the features page"

# Documentation improvements
/do "Improve the getting started guide with better examples"
```

### With Other Domains

Web domain collaborates with other expert domains:

**Documentation Domain:**
- Ensures consistent documentation structure
- Coordinates content updates across docs/

**API Domain:**
- Documents API changes on the website
- Creates API reference pages

**Database Domain:**
- Documents database schema on the site
- Creates migration guides

## File Structure

### Website Source

```
web/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   ├── styles/          # Global styles and design tokens
│   └── lib/             # Utilities and helpers
├── blog/
│   └── content/         # Blog post markdown files
├── docs/
│   └── content/         # Documentation markdown files
└── public/              # Static assets
    ├── images/
    ├── icons/
    └── logos/
```

### Content Organization

```
web/blog/content/
├── 2026-01-15-launch-announcement.md
├── 2026-01-20-local-first-philosophy.md
└── 2026-02-04-v2-2-0-release.md

web/docs/content/
├── installation.md
├── configuration.md
├── api-reference.md
└── architecture.md
```

## Best Practices

### Content Guidelines

1. **Clear headings**: Use descriptive, scannable headings
2. **Short paragraphs**: Keep paragraphs focused and brief
3. **Code examples**: Include working, tested code examples
4. **Visual hierarchy**: Use consistent heading levels
5. **Cross-references**: Link to related content appropriately

### Design Principles

1. **Consistency**: Follow design system patterns
2. **Accessibility**: Ensure WCAG AA compliance
3. **Performance**: Optimize for fast loading
4. **Mobile-first**: Design for mobile, enhance for desktop
5. **Semantic HTML**: Use proper HTML structure

### SEO Guidelines

1. **Meta descriptions**: Write compelling, accurate descriptions
2. **Title tags**: Use descriptive, keyword-rich titles
3. **Header structure**: Use proper H1-H6 hierarchy
4. **Internal linking**: Link to relevant internal content
5. **Image alt text**: Provide descriptive alt text

## Performance Standards

### Core Web Vitals

- **Largest Contentful Paint (LCP)**: < 2.5 seconds
- **First Input Delay (FID)**: < 100 milliseconds
- **Cumulative Layout Shift (CLS)**: < 0.1

### Optimization Techniques

1. **Image optimization**: Use Next.js Image component
2. **Code splitting**: Implement route-based splitting
3. **Lazy loading**: Load content below the fold lazily
4. **Caching**: Use appropriate caching headers
5. **Compression**: Enable gzip/brotli compression

## Deployment and Maintenance

### Build Process

```bash
# Development
npm run dev

# Production build
npm run build

# Static export
npm run export
```

### Content Updates

1. **Content changes**: Direct markdown file updates
2. **Component updates**: React component modifications
3. **Style changes**: Design token and CSS updates
4. **Deploy**: Automated deployment on content changes

### Monitoring

- **Performance**: Core Web Vitals monitoring
- **SEO**: Search engine ranking tracking
- **Analytics**: User behavior and content performance
- **Errors**: Frontend error monitoring

## Migration and Maintenance

### Content Migration

When restructuring content:

1. **Backup current content**: Create full content backup
2. **Plan redirect strategy**: Map old URLs to new structure
3. **Update internal links**: Fix all cross-references
4. **Test thoroughly**: Verify all links and functionality

### Regular Maintenance

1. **Content review**: Quarterly content audit and updates
2. **Performance audit**: Monthly performance optimization
3. **SEO review**: Regular SEO analysis and improvements
4. **Accessibility audit**: Periodic accessibility testing

## Integration Examples

### Creating New Content

```bash
# Plan new feature documentation
/do "Plan documentation for the new unified search feature"

# Build the documentation
/do "Build unified search documentation from the spec"

# Update related content
/do "Update API reference to include unified search tool"
```

### Design System Updates

```bash
# Plan component updates
/do "Plan button component redesign for better accessibility"

# Implement the changes
/do "Update button component with new accessibility features"

# Document the changes
/do "Update design system documentation with new button patterns"
```

### Performance Improvements

```bash
# Analyze current performance
/do "Analyze homepage performance and identify optimization opportunities"

# Implement optimizations
/do "Implement image optimization and lazy loading on features page"

# Document improvements
/do "Document performance optimization patterns for future reference"
```

## Next Steps

- Explore the web expert agents for your content needs
- Review the design system for consistent implementation
- Set up automated deployment for content updates
- Consider the documentation domain for technical content coordination
- Integrate web workflows with your overall development process