/**
 * OpenAPI 3.1 spec builder for KotaDB API.
 * 
 * Generates complete OpenAPI specification document with:
 * - Info section (title, version, description)
 * - Server definitions (production, staging, local)
 * - Security schemes (API key, JWT bearer)
 * - Path operations from paths.ts
 * - Component schemas from schemas.ts
 */

import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { registerPaths } from './paths.js';

// Cache for pre-computed spec
let cachedSpec: unknown | null = null;

/**
 * Build complete OpenAPI 3.1 specification document
 */
export function buildOpenAPISpec(): unknown {
	// Return cached spec if available
	if (cachedSpec) {
		return cachedSpec;
	}

	const startTime = Date.now();

	// Create registry
	const registry = new OpenAPIRegistry();

	// Register security schemes
	registry.registerComponent('securitySchemes', 'apiKey', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'API Key',
		description: 'API key authentication using Bearer token. Format: `kota_<tier>_<prefix>_<secret>`. Example: `kota_free_key123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`',
	});

	registry.registerComponent('securitySchemes', 'bearerAuth', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
		description: 'JWT bearer token authentication. Obtained from Supabase Auth.',
	});

	// Register all path operations
	registerPaths(registry);

	// Generate OpenAPI spec
	const generator = new OpenApiGeneratorV31(registry.definitions);
	
	const spec = generator.generateDocument({
		openapi: '3.1.0',
		info: {
			title: 'KotaDB API',
			version: '0.1.0', // Match package.json version
			description: `
# KotaDB API Documentation

KotaDB provides a code intelligence API for indexing, searching, and analyzing code repositories.

## Authentication

KotaDB supports two authentication methods:

### 1. API Key Authentication (Recommended for SDKs)

Use Bearer token format with your API key:

\`\`\`
Authorization: Bearer kota_free_key123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

API keys can be generated via the \`POST /api/keys/generate\` endpoint (requires JWT authentication first).

### 2. JWT Bearer Token (For web applications)

Use Supabase Auth JWT tokens:

\`\`\`
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

## Rate Limiting

All authenticated endpoints are rate-limited with dual limits enforced:

- **Hourly limit**: 100 requests/hour (free tier)
- **Daily limit**: 1000 requests/day (free tier)

Both limits are checked on each request. Whichever limit is reached first will block the request.

Rate limit headers are included in all authenticated endpoint responses:

- \`X-RateLimit-Limit\`: Hourly threshold for the tier
- \`X-RateLimit-Remaining\`: Remaining requests (minimum of hourly and daily remaining)
- \`X-RateLimit-Reset\`: Unix timestamp when the hourly limit resets

When rate limit is exceeded, the API returns HTTP 429 with a \`Retry-After\` header indicating seconds until the limit resets.

## Error Responses

All error responses follow a consistent format:

\`\`\`json
{
  "error": "Error message",
  "details": { /* optional additional context */ }
}
\`\`\`

Common HTTP status codes:

- \`400\`: Invalid request parameters
- \`401\`: Unauthorized (missing/invalid authentication)
- \`404\`: Resource not found
- \`429\`: Rate limit exceeded
- \`500\`: Internal server error

## Endpoints Overview

- **Health**: Service availability check
- **Indexing**: Trigger repository indexing jobs
- **Jobs**: Track indexing job status and progress
- **Search**: Search indexed code content
- **Files**: Retrieve recently indexed files
- **Projects**: Manage multi-repository projects
- **API Keys**: Generate and manage API keys

			`.trim(),
			contact: {
				name: 'KotaDB Support',
				url: 'https://kotadb.com/support',
			},
			license: {
				identifier: 'LicenseRef-Proprietary',
				name: 'Proprietary',
			},
		},
		servers: [
			{
				url: 'https://api.kotadb.com',
				description: 'Production server',
			},
			{
				url: 'https://staging-api.kotadb.com',
				description: 'Staging server',
			},
			{
				url: 'http://localhost:3001',
				description: 'Local development server',
			},
		],
		tags: [
			{
				name: 'Health',
				description: 'Service health and status endpoints',
			},
			{
				name: 'Indexing',
				description: 'Repository indexing operations',
			},
			{
				name: 'Jobs',
				description: 'Indexing job status and tracking',
			},
			{
				name: 'Search',
				description: 'Code search operations',
			},
			{
				name: 'Files',
				description: 'File listing and retrieval',
			},
			{
				name: 'Projects',
				description: 'Multi-repository project management',
			},
			{
				name: 'API Keys',
				description: 'API key generation and management',
			},
		],
	});

	const duration = Date.now() - startTime;
	const pathCount = Object.keys(spec.paths || {}).length;

	process.stdout.write(JSON.stringify({
		level: 'info',
		module: 'openapi-builder',
		message: 'OpenAPI spec generated',
		duration_ms: duration,
		path_count: pathCount,
	}) + '\n');

	// Cache the spec
	cachedSpec = spec;

	return spec;
}

/**
 * Clear cached spec (for testing or hot reload)
 */
export function clearSpecCache(): void {
	cachedSpec = null;
}
