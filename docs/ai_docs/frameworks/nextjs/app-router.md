# Next.js App Router Documentation

**Source:** https://nextjs.org/docs/app
**Date Scraped:** 2025-12-05
**Version:** 16.0.7
**Last Updated:** 2025-06-16

---

## Overview

The Next.js App Router is a new paradigm for building React applications using React's latest features. The App Router uses React canary releases built-in, which include stable React 19 changes, as well as newer features being validated in frameworks.

This differs from the Pages Router, which uses the project's installed React version.

---

## Getting Started

The Getting Started section introduces developers to creating their first Next.js application and covers fundamental concepts needed across projects.

### Prerequisites

The documentation expects familiarity with:
- HTML
- CSS
- JavaScript
- React

For those new to React, the documentation references:
- React Foundations course
- Next.js Foundations course (Dashboard App)

---

## Installation

### System Requirements

- **Node.js**: Minimum version 20.9 required
- **OS Support**: macOS, Windows (including WSL), and Linux
- **Browsers**: Chrome 111+, Edge 111+, Firefox 111+, Safari 16.4+

### Automated Setup

```bash
npx create-next-app@latest
```

The `--yes` flag bypasses configuration prompts, enabling:
- TypeScript
- Tailwind CSS
- ESLint
- App Router
- Turbopack
- Import alias `@/*`

Running `npx create-next-app@latest` prompts users to either accept recommended defaults or customize:
- TypeScript configuration
- Linters
- React Compiler
- Tailwind CSS
- Directory structure
- Routing
- Import aliases

### Manual Installation

1. Install core packages:
```bash
npm install next react react-dom
# or
yarn add next react react-dom
# or
pnpm add next react react-dom
# or
bun add next react react-dom
```

2. Add scripts to `package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

Turbopack serves as the default bundler; Webpack can be used via CLI flags.

### Project Structure

**Root Layout** (`app/layout.tsx`):
- Must contain HTML and body tags
- Required for App Router

**Home Page** (`app/page.tsx`):
- Default route for your application

**Public Folder** (optional):
- Stores static assets
- Referenced from the root path

---

## Core Features

### 1. Project Structure
File and folder conventions for organizing Next.js applications.

### 2. Layouts and Pages
Creating pages and using the Link component for navigation.

### 3. Linking and Navigating
Navigation optimizations including:
- Prefetching
- Prerendering
- Client-side navigation

### 4. Server and Client Components
Rendering strategies for both server and client environments.

**Server Components:**
- Default component type in App Router
- Render on the server
- No JavaScript sent to client by default
- Better performance and SEO

**Client Components:**
- Marked with `'use client'` directive
- Interactive components
- Access to browser APIs
- Can use hooks

### 5. Cache Components
Combining static and dynamic rendering benefits for optimal performance.

### 6. Fetching Data
Data retrieval and content streaming capabilities.

### 7. Updating Data
Data mutation via Server Functions (Server Actions).

### 8. Caching and Revalidating
Data caching strategies including:
- Request memoization
- Data cache
- Full route cache
- Router cache

### 9. Error Handling
Managing expected and uncaught errors with:
- `error.js` for error boundaries
- `not-found.js` for 404 pages
- `global-error.js` for global error handling

### 10. CSS
Multiple styling approaches:
- Tailwind CSS
- CSS Modules
- Global CSS
- CSS-in-JS
- Sass

### 11. Image Optimization
Next.js image optimization features via the `<Image>` component:
- Automatic image optimization
- Responsive images
- Lazy loading
- Blur placeholder support

### 12. Font Optimization
Font performance improvements using `next/font`:
- Automatic font optimization
- Self-hosting fonts
- No layout shift
- Subset optimization

### 13. Metadata and OG Images
Page metadata and dynamic social media images:
- Static metadata export
- Dynamic metadata generation
- OG image generation

### 14. Route Handlers
API route creation for handling HTTP requests:
- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Server-side logic
- API endpoints

### 15. Proxy Configuration
Proxy configuration for API requests and rewrites.

### 16. Deploying
Deployment procedures for production environments.

### 17. Upgrading
Version updates and canary releases.

---

## API Reference

The Next.js App Router API Reference includes:

### 1. Directives
Used to modify the behavior of your Next.js application:
- `'use client'` - Marks a component as a Client Component
- `'use server'` - Marks a function as a Server Action

### 2. Components
Built-in component APIs:
- `<Image>` - Image optimization component
- `<Link>` - Client-side navigation
- `<Font>` - Font optimization
- `<Script>` - Script loading strategies

### 3. File-system Conventions
Standards for organizing files and folders:
- `layout.js` - Shared UI for segments
- `page.js` - Unique UI for routes
- `loading.js` - Loading UI
- `not-found.js` - 404 UI
- `error.js` - Error UI
- `global-error.js` - Global error UI
- `route.js` - API endpoints
- `template.js` - Re-rendered layout
- `default.js` - Parallel route fallback

### 4. Functions
API Reference for Next.js Functions and Hooks:
- Data fetching functions
- Server Actions
- Hooks for client components
- Utility functions

### 5. Configuration
Settings and options in `next.config.js`:
- Build configuration
- Runtime configuration
- Compiler options
- Environment variables

### 6. CLI
Command Line Interface tools:
- `next dev` - Start development server
- `next build` - Create production build
- `next start` - Start production server
- `next lint` - Run ESLint

### 7. Edge Runtime
APIs available in edge computing environments for:
- Middleware
- Edge Route Handlers
- Edge API Routes

### 8. Turbopack
An incremental bundler optimized for JavaScript and TypeScript, written in Rust, and built into Next.js.

---

## TypeScript Configuration

**Built-in Support:**
- Activates automatically when renaming files to `.ts`/`.tsx`
- Minimum version: 5.1.0

**Type Checking:**
- Next.js provides TypeScript plugin for IDE support
- Strict mode recommended

---

## Linting

Choose between:
- **ESLint** - Configured via `package.json` scripts or `.eslintrc` files
- **Biome** - Alternative linter/formatter

---

## Import Aliases

Configure `tsconfig.json` with `baseUrl` and `paths` to map directory shortcuts:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["components/*"],
      "@/utils/*": ["utils/*"]
    }
  }
}
```

Default configuration uses `@/*` for imports from the root.

---

## Key Distinctions from Pages Router

1. **React Version**: App Router uses React canary releases with React 19 features
2. **Routing**: File-system based routing in `app/` directory
3. **Server Components**: Server Components by default
4. **Data Fetching**: Uses `fetch()` with extended capabilities
5. **Layouts**: Nested layouts with `layout.js`
6. **Loading & Error States**: Built-in support with `loading.js` and `error.js`

---

## Navigation Features

- Search documentation using keyboard shortcuts (Cmd+K or Ctrl+K)
- Toggle between App Router and Pages Router documentation
- Comprehensive sidebar navigation

---

## Additional Resources

For detailed code examples, function signatures, parameters, return types, and usage examples, refer to the individual documentation pages at:

- Getting Started: https://nextjs.org/docs/app/getting-started
- Building Your Application: https://nextjs.org/docs/app/building-your-application
- API Reference: https://nextjs.org/docs/app/api-reference

---

## Notes

This documentation serves as a high-level overview of the Next.js App Router. For complete details, code examples, and in-depth explanations, please refer to the official Next.js documentation at https://nextjs.org/docs/app.

The App Router represents a significant evolution in Next.js architecture, emphasizing:
- Server-first rendering
- React Server Components
- Streaming and Suspense
- Improved performance
- Enhanced developer experience
