# KotaDB Web Application

Next.js web interface for KotaDB MCP-first onboarding.

## Product Philosophy

KotaDB makes AI agents more effective by providing code intelligence through MCP (Model Context Protocol). The web frontend supports the onboarding flow: sign up → generate API key → copy config → better agents.

## Features

- **GitHub OAuth Authentication**: Secure sign-up and login via GitHub
- **API Key Management**: Generate, reset, and revoke API keys for MCP access
- **MCP Configuration**: Copy-paste configuration for Claude Code CLI integration
- **Stripe Integration**: Upgrade from free to solo/team tiers
- **Rate Limiting**: Visual rate limit quota tracking with countdown timer
- **Type-Safe API Client**: Shared TypeScript types with backend for compile-time safety

## User Journey

1. Sign up via GitHub OAuth (`/login`)
2. Generate API key (`/dashboard`)
3. Copy MCP configuration (`/mcp`)
4. Paste config into Claude Code CLI
5. AI agents can now search code, analyze dependencies, and more

## Archived Pages

The following pages have been archived to `web/app/_archive/` to reduce maintenance burden and clarify product focus:

- `/search` - Full-text search interface (duplicates `mcp__kotadb__search-code` tool)
- `/repository-index` - Repository indexing UI (duplicates `mcp__kotadb__index-repository` tool)
- `/files` - Recent files browser (duplicates `mcp__kotadb__list-recent-files` tool)

These pages duplicate MCP tool functionality and are not part of the core onboarding flow. Users interact with KotaDB via AI agents, not web forms.

## Getting Started

### Prerequisites

- Bun 1.2.9 or later
- KotaDB API running on `http://localhost:3000` (default)
- Valid API key (format: `kota_<tier>_<key_id>_<secret>`)

### Development

```bash
# Install dependencies (from repository root)
bun install

# Start development server
cd web && bun run dev
```

The web app will be available at `http://localhost:3001`.

### Environment Variables

Create a `.env.local` file in the `web/` directory:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

See `.env.sample` for full configuration options.

### Production Build

```bash
cd web && bun run build
cd web && bun run start
```


## Architecture

### Shared Types

The web app consumes backend types from `../shared/types/`:

```typescript
import type { SearchRequest, SearchResponse } from '@shared/types/api'
import type { AuthContext, Tier } from '@shared/types/auth'
```

TypeScript path alias `@shared/*` points to `../shared/*` (configured in `tsconfig.json`).

### API Client

Type-safe fetch wrappers in `lib/api-client.ts`:

```typescript
import { apiClient } from '@/lib/api-client'

const { response, headers } = await apiClient.search({ term: 'function' }, apiKey)
```

All API methods return rate limit headers for quota tracking.

### Authentication

API keys stored in `localStorage` and passed via `Authorization: Bearer` header.
Managed by `AuthContext` provider in `context/AuthContext.tsx`.

## Project Structure

```
web/
├── app/                      # Next.js 14 App Router
│   ├── _archive/             # Archived pages (ignored by Next.js routing)
│   │   ├── components/       # Components only used by archived pages
│   │   │   ├── SearchBar.tsx
│   │   │   └── FileList.tsx
│   │   ├── search/page.tsx   # Archived search interface
│   │   ├── repository-index/page.tsx  # Archived indexing UI
│   │   └── files/page.tsx    # Archived files browser
│   ├── auth/                 # Authentication routes
│   │   └── dev-session/route.ts  # Dev-mode session endpoint
│   ├── layout.tsx            # Root layout with navigation
│   ├── page.tsx              # Landing page
│   ├── login/page.tsx        # GitHub OAuth authentication
│   ├── dashboard/page.tsx    # API key management + billing
│   ├── pricing/page.tsx      # Stripe checkout
│   └── mcp/page.tsx          # MCP configuration copy-paste
├── components/               # Reusable React components
│   ├── Navigation.tsx        # Top navigation bar
│   ├── ApiKeyInput.tsx       # API key management
│   ├── RateLimitStatus.tsx   # Rate limit indicator
│   ├── KeyResetModal.tsx     # API key reset confirmation
│   ├── KeyRevokeModal.tsx    # API key revoke confirmation
│   └── mcp/                  # MCP page components
│       ├── ConfigurationDisplay.tsx
│       ├── CopyButton.tsx
│       └── ToolReference.tsx
├── context/                  # React context providers
│   └── AuthContext.tsx       # Authentication state
├── lib/                      # Utility libraries
│   ├── api-client.ts         # Type-safe API client
│   └── playwright-helpers.ts # Test session management
└── public/                   # Static assets
```

## Testing

### Type Checking

```bash
cd web && bunx tsc --noEmit
```

### Linting

```bash
cd web && bun run lint
```

### Build Validation

```bash
cd web && bun run build
```

## Deployment

### Vercel

When deploying to Vercel, configure the following environment variables in Project Settings → Environment Variables:

**Required Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`: Production Supabase project URL (from Supabase dashboard → Settings → API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Production Supabase anon key (from Supabase dashboard → Settings → API)
- `NEXT_PUBLIC_API_URL`: Production KotaDB API URL (e.g., `https://api.kotadb.com`)

**Scope:** Apply to Production, Preview, and Development environments

**Security Notes:**
- Never commit credentials to git repository
- Use `.env.local` for local development (excluded by `.gitignore`)
- Production credentials should only exist in Vercel dashboard

**Build Configuration:**
- Build Command: `cd web && bun run build`
- Output Directory: `web/.next`
- Install Command: `bun install`

See `docs/deployment.md` for backend API deployment instructions.

## Contributing

Follow KotaDB contribution guidelines. Ensure all changes pass:

- Type checking: `bunx tsc --noEmit`
- Linting: `bun run lint`
- Production build: `bun run build`
