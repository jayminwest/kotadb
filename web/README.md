# KotaDB Documentation Website

Static documentation site for [KotaDB](https://github.com/jayminwest/kotadb) - a local-first code intelligence tool.

## Overview

This is a static site built with vanilla HTML, CSS, and JavaScript. Content is written in Markdown and rendered client-side using [marked.js](https://marked.js.org/).

## File Structure

```
web/
├── index.html              # Homepage
├── 404.html                # Custom 404 error page
├── vercel.json             # Vercel deployment configuration
├── sitemap.xml             # SEO sitemap
├── robots.txt              # Search engine directives
├── .nojekyll               # Disable Jekyll processing
├── css/
│   ├── main.css            # Core styles
│   └── syntax.css          # Code syntax highlighting
├── js/
│   ├── main.js             # Main JavaScript
│   └── render.js           # Markdown rendering utilities
├── assets/
│   └── lib/
│       └── marked.min.js   # Markdown parser
├── docs/
│   ├── index.html          # Documentation shell
│   └── content/            # Markdown documentation files
│       ├── installation.md
│       ├── configuration.md
│       ├── api-reference.md
│       └── architecture.md
└── blog/
    ├── index.html          # Blog listing page
    ├── post.html           # Individual blog post template
    └── content/            # Markdown blog posts
        ├── 2026-01-15-launch-announcement.md
        └── 2026-01-20-local-first-philosophy.md
```

## Local Development

To run the site locally, you need a static file server. Here are a few options:

### Using Python

```bash
cd web
python3 -m http.server 8000
```

Then open http://localhost:8000

### Using Node.js (npx)

```bash
cd web
npx serve
```

### Using PHP

```bash
cd web
php -S localhost:8000
```

## Deployment

This site is configured for deployment on [Vercel](https://vercel.com/).

### Automatic Deployment

The site automatically deploys when changes are pushed to the `main` branch. Vercel watches the repository and triggers a new deployment on each push.

### Manual Deployment

To deploy manually using the Vercel CLI:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from the web directory
cd web
vercel
```

### Configuration

Vercel configuration is in `vercel.json`:

- **Clean URLs**: Removes `.html` extensions from URLs
- **Security Headers**: Adds X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Asset Caching**: Long-term caching for assets in `/assets/`
- **Rewrites**: Routes `/docs` and `/blog` to their respective index files

## Adding Content

### New Documentation Page

1. Create a new `.md` file in `docs/content/`
2. Add the page to `DOCS_PAGES` in `docs/index.html`
3. Add a navigation link in the sidebar

### New Blog Post

1. Create a new `.md` file in `blog/content/` with the naming convention `YYYY-MM-DD-slug.md`
2. Add YAML frontmatter with `title`, `description`, `date`, and `slug`
3. Add the file path to the `blogPosts` array in `blog/index.html`
4. Add the slug mapping to `postMap` in `blog/post.html`

Example frontmatter:

```yaml
---
title: Your Post Title
description: A brief description for SEO
date: 2026-01-29
slug: your-post-slug
---
```

## License

MIT License - see [LICENSE](https://github.com/jayminwest/kotadb/blob/main/LICENSE)
