# @kotadb/shared

Shared TypeScript types for the KotaDB monorepo. This package provides a single source of truth for API contracts, database entities, and authentication types used across all KotaDB applications.

## Overview

The `@kotadb/shared` package contains type definitions that are shared between the backend API (`app/`), frontend applications (e.g., `web/`), CLI tools, and other consumers in the monorepo. By centralizing these types, we ensure:

- **Type safety across boundaries**: Backend and frontend share the same contracts
- **Refactoring confidence**: Change types once, TypeScript guides all updates
- **Better DX**: Full autocomplete and type checking in all layers
- **No API drift**: Contracts enforced at compile time, not runtime

## Package Structure

```
shared/
├── package.json          # Package metadata for @kotadb/shared
├── tsconfig.json         # TypeScript config with strict mode
├── README.md             # This file
└── types/
    ├── index.ts          # Re-exports all types for convenient imports
    ├── api.ts            # API request/response types
    ├── entities.ts       # Database entity types
    ├── auth.ts           # Authentication types
    ├── rate-limit.ts     # Rate limiting types
    └── validation.ts     # Validation API types
```

## Usage

### Importing Types in Application Layer

```typescript
// Import from @shared/* path alias (configured in app/tsconfig.json)
import type { IndexRequest, SearchResponse } from "@shared/types/api";
import type { Repository, IndexedFile } from "@shared/types/entities";
import type { AuthContext, Tier } from "@shared/types/auth";
import type { RateLimitResult } from "@shared/types/rate-limit";
import type { ValidationRequest } from "@shared/types/validation";

// Or import all types from the index
import type {
  IndexRequest,
  SearchResponse,
  Repository,
  AuthContext
} from "@shared/types";
```

### Importing Types in Future Frontend Applications

```typescript
// In web/src/api/client.ts (example for Next.js app)
import type { IndexRequest, IndexResponse } from "@shared/types/api";

export async function indexRepository(req: IndexRequest): Promise<IndexResponse> {
  const response = await fetch("/api/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return response.json();
}
```

### Path Alias Configuration

Each consuming project must configure the `@shared/*` path alias in its `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  }
}
```

## Type Categories

### API Types (`types/api.ts`)

Request and response types for all HTTP endpoints:

- `IndexRequest`, `IndexResponse` — POST /index
- `SearchRequest`, `SearchResponse`, `SearchResult` — GET /search
- `RecentFilesResponse` — GET /files/recent
- `HealthResponse` — GET /health

### Entity Types (`types/entities.ts`)

Database entity types matching PostgreSQL schema:

- `Repository` — Indexed repositories
- `IndexedFile` — Files with parsed content
- `IndexJob` — Indexing job status
- `Symbol` — Code symbols (functions, classes, etc.)
- `Reference` — Symbol references
- `Dependency` — Package dependencies

### Auth Types (`types/auth.ts`)

Authentication and authorization types:

- `Tier` — User tier enum ('free' | 'solo' | 'team')
- `AuthContext` — Authenticated user context
- `AuthenticatedRequest` — Request with auth property
- `ApiKey` — API key entity

### Rate Limit Types (`types/rate-limit.ts`)

Rate limiting types:

- `RateLimitResult` — Rate limit enforcement result
- `RateLimitHeaders` — Response header types
- `RateLimitConfig` — Tier-based rate limit configuration

### Validation Types (`types/validation.ts`)

Validation API types:

- `ValidationRequest` — Schema validation request
- `ValidationResponse` — Validation result with errors
- `ValidationError` — Field-level validation error

## When to Add Types to `shared/`

**Add types to `shared/` when:**

- Type is used in API requests or responses (client ↔ server contract)
- Type represents a database entity shared across services
- Type is part of authentication or authorization flow
- Type will be consumed by multiple projects (backend, frontend, CLI)

**Keep types in `app/src/types/` when:**

- Type is internal implementation detail (e.g., `ApiContext` with Supabase client)
- Type is specific to backend logic (e.g., indexer internals)
- Type will never be needed outside the application layer

## Breaking Changes and Versioning

Shared types follow semantic versioning principles:

- **Patch (0.1.x)**: Documentation updates, non-breaking additions
- **Minor (0.x.0)**: New optional fields, new types
- **Major (x.0.0)**: Breaking changes (renamed fields, removed types, changed types)

When making breaking changes:

1. Update the type in `shared/types/`
2. Use TypeScript compiler errors to find all affected consumers
3. Update all consumers in the same PR
4. Bump version in `shared/package.json`
5. Document migration in PR description

## IDE Support

VS Code and other TypeScript-aware editors will provide full autocomplete and type checking for `@shared/*` imports after the path alias is configured. To verify:

1. Open a file that imports from `@shared/types/api`
2. Hover over an imported type (e.g., `IndexRequest`)
3. Confirm the definition shows from `shared/types/api.ts`
4. Change a field in `shared/types/api.ts`
5. Verify TypeScript errors appear in all consuming files

## CI/CD Integration

The CI workflow (`.github/workflows/app-ci.yml`) includes type-checking for shared types:

```yaml
- name: Type-check shared types
  run: cd shared && bunx tsc --noEmit

- name: Type-check application
  run: cd app && bunx tsc --noEmit
```

Path triggers ensure CI runs when shared types change:

```yaml
on:
  push:
    paths:
      - 'shared/**'
      - 'app/**'
```

## Examples

### Full API Request/Response Flow

```typescript
// Backend handler (app/src/api/routes.ts)
import type { IndexRequest, IndexResponse } from "@shared/types/api";

app.post("/index", async (req: Request): Promise<Response> => {
  const body = await req.json() as IndexRequest;

  // Implementation...

  const response: IndexResponse = {
    success: true,
    message: "Indexing started",
    jobId: "abc-123"
  };

  return Response.json(response);
});

// Frontend client (web/src/api/index.ts)
import type { IndexRequest, IndexResponse } from "@shared/types/api";

export async function indexRepo(req: IndexRequest): Promise<IndexResponse> {
  const res = await fetch("/api/index", {
    method: "POST",
    body: JSON.stringify(req)
  });
  return res.json();
}
```

### Database Entity Type Usage

```typescript
// Backend query (app/src/api/queries.ts)
import type { Repository, IndexedFile } from "@shared/types/entities";

export async function getRecentFiles(): Promise<IndexedFile[]> {
  const { data } = await supabase
    .from("indexed_files")
    .select("*")
    .order("indexed_at", { ascending: false })
    .limit(50);

  return data as IndexedFile[];
}

// Frontend display (web/src/components/FileList.tsx)
import type { IndexedFile } from "@shared/types/entities";

export function FileList({ files }: { files: IndexedFile[] }) {
  return (
    <ul>
      {files.map(file => (
        <li key={file.id}>{file.path}</li>
      ))}
    </ul>
  );
}
```

## Future Enhancements

Planned additions to `@kotadb/shared`:

- MCP types (`types/mcp.ts`) when frontend needs MCP integration
- Schema validation types (`types/schemas.ts`) for multi-consumer validation
- Migration guide templates for breaking changes
- Automated type documentation generation
- Type versioning and compatibility checks
