# KotaDB Web Application

Next.js web interface for KotaDB code intelligence platform.

## Features

- **Code Search**: Full-text search across indexed repositories with context snippets
- **Repository Indexing**: Index GitHub repositories for searchable code intelligence
- **Recent Files**: View recently indexed files across all repositories
- **Rate Limiting**: Visual rate limit quota tracking with countdown timer
- **Type-Safe API Client**: Shared TypeScript types with backend for compile-time safety

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

### Docker

```bash
# Start web service with Docker Compose
docker compose up web

# Build web service container
docker compose build web
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
│   ├── layout.tsx            # Root layout with navigation
│   ├── page.tsx              # Landing page
│   ├── search/page.tsx       # Code search interface
│   ├── repository-index/page.tsx  # Repository indexing
│   └── files/page.tsx        # Recent files view
├── components/               # Reusable React components
│   ├── Navigation.tsx        # Top navigation bar
│   ├── ApiKeyInput.tsx       # API key management
│   ├── RateLimitStatus.tsx   # Rate limit indicator
│   ├── SearchBar.tsx         # Search input
│   └── FileList.tsx          # File results display
├── context/                  # React context providers
│   └── AuthContext.tsx       # Authentication state
├── lib/                      # Utility libraries
│   └── api-client.ts         # Type-safe API client
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

<<<<<<< HEAD
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
=======
See `docs/deployment.md` for deployment instructions (Fly.io, Vercel, etc.).
>>>>>>> origin/main

## Contributing

Follow KotaDB contribution guidelines. Ensure all changes pass:

- Type checking: `bunx tsc --noEmit`
- Linting: `bun run lint`
- Production build: `bun run build`
