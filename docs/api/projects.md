# Projects API

## Overview

The Projects API enables multi-repository grouping and organization. Projects allow users to logically group related repositories for scoped searching and management.

## Base URL

```
https://api.kotadb.com
```

## Authentication

All endpoints require authentication via API key or JWT token in the `Authorization` header:

```
Authorization: Bearer <api_key or jwt_token>
```

## Rate Limiting

API requests are subject to tier-based rate limits:
- **Free tier**: 100 requests/hour
- **Solo tier**: 1,000 requests/hour
- **Team tier**: 10,000 requests/hour

Rate limit information is returned in response headers:
- `X-RateLimit-Limit`: Maximum requests per hour
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Endpoints

### Create Project

Create a new project with optional repository associations.

**Endpoint:** `POST /api/projects`

**Request Body:**
```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "repository_ids": ["uuid"] (optional)
}
```

**Example Request:**
```bash
curl -X POST https://api.kotadb.com/api/projects \
  -H "Authorization: Bearer kota_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Frontend Project",
    "description": "All frontend repositories",
    "repository_ids": ["550e8400-e29b-41d4-a716-446655440000"]
  }'
```

**Success Response (201 Created):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**Error Responses:**
- **400 Bad Request**: Invalid input (missing name, invalid repository IDs)
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Insufficient permissions (e.g., repository belongs to another user)
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

---

### List Projects

Retrieve all projects for the authenticated user with repository counts.

**Endpoint:** `GET /api/projects`

**Query Parameters:** None

**Example Request:**
```bash
curl -X GET https://api.kotadb.com/api/projects \
  -H "Authorization: Bearer kota_..."
```

**Success Response (200 OK):**
```json
{
  "projects": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "user_id": "user-uuid",
      "org_id": null,
      "name": "Frontend Project",
      "description": "All frontend repositories",
      "created_at": "2025-11-12T22:00:00Z",
      "updated_at": "2025-11-12T22:00:00Z",
      "metadata": {},
      "repository_count": 3
    }
  ]
}
```

**Error Responses:**
- **401 Unauthorized**: Missing or invalid authentication
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

---

### Get Project

Retrieve a specific project with full repository details.

**Endpoint:** `GET /api/projects/:id`

**Path Parameters:**
- `id` (required): Project UUID

**Example Request:**
```bash
curl -X GET https://api.kotadb.com/api/projects/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer kota_..."
```

**Success Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "user_id": "user-uuid",
  "org_id": null,
  "name": "Frontend Project",
  "description": "All frontend repositories",
  "created_at": "2025-11-12T22:00:00Z",
  "updated_at": "2025-11-12T22:00:00Z",
  "metadata": {},
  "repository_count": 2,
  "repositories": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "full_name": "owner/repo1",
      "git_url": "https://github.com/owner/repo1",
      "default_branch": "main",
      "created_at": "2025-11-12T20:00:00Z",
      "updated_at": "2025-11-12T21:00:00Z"
    }
  ]
}
```

**Error Responses:**
- **400 Bad Request**: Invalid project ID format
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Project belongs to another user (RLS policy)
- **404 Not Found**: Project does not exist or no access
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

---

### Update Project

Update project metadata and/or repository associations.

**Endpoint:** `PATCH /api/projects/:id`

**Path Parameters:**
- `id` (required): Project UUID

**Request Body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "repository_ids": ["uuid"] (optional)
}
```

**Notes:**
- If `repository_ids` is provided, it **replaces** all existing repository associations
- Omit `repository_ids` to update only name/description without changing repositories

**Example Request:**
```bash
curl -X PATCH https://api.kotadb.com/api/projects/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer kota_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Frontend Project",
    "repository_ids": ["550e8400-e29b-41d4-a716-446655440001"]
  }'
```

**Success Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- **400 Bad Request**: Invalid input (invalid UUID format, invalid repository IDs)
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Project belongs to another user or insufficient permissions
- **404 Not Found**: Project does not exist
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

---

### Delete Project

Delete a project. Repository associations are cascade deleted, but repositories themselves remain in the index.

**Endpoint:** `DELETE /api/projects/:id`

**Path Parameters:**
- `id` (required): Project UUID

**Example Request:**
```bash
curl -X DELETE https://api.kotadb.com/api/projects/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer kota_..."
```

**Success Response (200 OK):**
```json
{
  "success": true
}
```

**Error Responses:**
- **400 Bad Request**: Invalid project ID format
- **401 Unauthorized**: Missing or invalid authentication
- **403 Forbidden**: Project belongs to another user or insufficient permissions
- **404 Not Found**: Project does not exist
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

---

## Project-Scoped Search

The `/search` endpoint supports filtering results by project via the `project_id` query parameter.

**Endpoint:** `GET /search`

**Query Parameters:**
- `term` (required): Search term
- `project_id` (optional): Project UUID to scope search
- `limit` (optional): Maximum results (default: 20, max: 100)
- `repository` (optional): Repository ID (cannot be combined with `project_id`)

**Example Request:**
```bash
curl -X GET "https://api.kotadb.com/search?term=authenticate&project_id=123e4567-e89b-12d3-a456-426614174000" \
  -H "Authorization: Bearer kota_..."
```

**Response:** Standard search results, filtered to repositories in the specified project.

---

## Row Level Security (RLS)

All project operations enforce PostgreSQL Row Level Security policies:

- **SELECT**: Users can only see their own projects or projects in organizations they belong to
- **INSERT**: Users can only create projects under their own user ID or organizations they belong to
- **UPDATE**: Users can update their own projects or organization projects (requires `owner` or `admin` role)
- **DELETE**: Users can delete their own projects or organization projects (requires `owner` or `admin` role)

Cross-user access attempts return `403 Forbidden` or `404 Not Found` depending on the operation.

---

## Data Model

### Project Entity

```typescript
interface Project {
  id: string;                  // UUID
  user_id: string | null;      // Owner user UUID (mutually exclusive with org_id)
  org_id: string | null;       // Owner organization UUID (mutually exclusive with user_id)
  name: string;                // Unique per user/org
  description?: string | null;
  created_at: string;          // ISO 8601 timestamp
  updated_at: string;          // ISO 8601 timestamp
  metadata?: Record<string, unknown>; // JSONB metadata
}
```

### ProjectRepository Join

```typescript
interface ProjectRepository {
  id: string;             // UUID
  project_id: string;     // Foreign key to projects table
  repository_id: string;  // Foreign key to repositories table
  added_at: string;       // ISO 8601 timestamp
}
```

**Constraints:**
- Unique constraint on `(project_id, repository_id)` pair
- Cascade delete when project or repository is deleted
- CHECK constraint ensures `user_id` OR `org_id` is set (not both)

---

## Common Patterns

### Creating a Project with Multiple Repositories

```bash
curl -X POST https://api.kotadb.com/api/projects \
  -H "Authorization: Bearer kota_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Microservices Project",
    "description": "All microservice repositories",
    "repository_ids": [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003"
    ]
  }'
```

### Updating Repository List (Replace)

```bash
curl -X PATCH https://api.kotadb.com/api/projects/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer kota_..." \
  -H "Content-Type: application/json" \
  -d '{
    "repository_ids": ["550e8400-e29b-41d4-a716-446655440004"]
  }'
```

### Searching Within a Project

```bash
curl -X GET "https://api.kotadb.com/search?term=function&project_id=123e4567-e89b-12d3-a456-426614174000&limit=50" \
  -H "Authorization: Bearer kota_..."
```

---

## Migration Information

**Migration File:** `20251112222109_add_projects_tables.sql`

**Tables Created:**
- `projects`: Project metadata and ownership
- `project_repositories`: Many-to-many join table

**Indexes:**
- `idx_projects_user_id`: Fast user-owned project lookups
- `idx_projects_org_id`: Fast org-owned project lookups
- `idx_projects_user_name`: Enforce unique names per user
- `idx_projects_org_name`: Enforce unique names per organization
- `idx_project_repositories_project_id`: Fast repository list queries
- `idx_project_repositories_repository_id`: Fast project membership queries

---

## Related Documentation

- [Search API Documentation](./search.md)
- [Repository Management](./repositories.md)
- [Authentication Guide](../auth/authentication.md)
- [Rate Limiting](../guides/rate-limiting.md)
