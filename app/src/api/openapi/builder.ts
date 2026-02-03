/**
 * OpenAPI 3.1 spec builder for KotaDB API.
 * 
 * Generates complete OpenAPI specification document with:
 * - Info section (title, version, description)
 * - Server definitions (local only)
 * - Security schemes (API key, JWT bearer)
 * - Path operations from paths.ts
 * - Component schemas from schemas.ts
 * 
 * NOTE: Local-only mode - cloud infrastructure references removed.
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
		description: 'JWT bearer token authentication.',
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

KotaDB is a local-only code intelligence API for indexing, searching, and analyzing code repositories.
Data is stored in SQLite and all operations run locally.

## Authentication

KotaDB supports two authentication methods:

### 1. API Key Authentication (Recommended for SDKs)

Use Bearer token format with your API key:

\`\`\`
Authorization: Bearer kota_free_key123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
\`\`\`

### 2. JWT Bearer Token (For web applications)

Use JWT tokens:

\`\`\`
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
\`\`\`

## Rate Limiting

All authenticated endpoints are rate-limited:

- **Hourly limit**: 100 requests/hour
- **Daily limit**: 1000 requests/day

Rate limit headers are included in all authenticated endpoint responses:

- \`X-RateLimit-Limit-Hour\`: Hourly threshold
- \`X-RateLimit-Remaining-Hour\`: Remaining hourly requests
- \`X-RateLimit-Reset-Hour\`: Unix timestamp when hourly limit resets
- \`X-RateLimit-Limit-Day\`: Daily threshold
- \`X-RateLimit-Remaining-Day\`: Remaining daily requests
- \`X-RateLimit-Reset-Day\`: Unix timestamp when daily limit resets

When rate limit is exceeded, the API returns HTTP 429 with a \`Retry-After\` header.

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
- **Search**: Search indexed code content
- **Files**: Retrieve recently indexed files
- **Validation**: Validate command output against schemas
- **MCP**: Model Context Protocol tools for code intelligence

## MCP Tools

Repository indexing and advanced code intelligence operations are available via MCP tools:

- \`index_repository\`: Index a git repository
- \`search_code\`: Search indexed code
- \`list_recent_files\`: List recently indexed files
- \`search_dependencies\`: Find file dependencies
- \`analyze_change_impact\`: Analyze impact of code changes
- \`validate_implementation_spec\`: Validate implementation specifications
- \`kota_sync_export\`: Export database to JSONL
- \`kota_sync_import\`: Import JSONL to database

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
				name: 'Search',
				description: 'Code search operations',
			},
			{
				name: 'Files',
				description: 'File listing and retrieval',
			},
			{
				name: 'Validation',
				description: 'Output validation operations',
			},
			{
				name: 'MCP',
				description: 'Model Context Protocol tools for code intelligence',
			},
		],
	});

	const duration = Date.now() - startTime;
	const pathCount = Object.keys(spec.paths || {}).length;

	process.stderr.write(JSON.stringify({
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
