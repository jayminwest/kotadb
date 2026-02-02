/**
 * OpenAPI schema extensions for KotaDB API.
 * 
 * Extends existing Zod schemas with OpenAPI metadata for spec generation.
 * Uses @asteasolutions/zod-to-openapi package to add descriptions, examples, and documentation.
 * 
 * NOTE: Local-only mode - cloud-only schemas (Jobs, Projects, API Keys) have been removed.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ===== Request Schemas =====

export const SearchRequestSchema = z.object({
	term: z.string()
		.min(1)
		.openapi({
			description: 'Search term to match in file content',
			example: 'function authenticate',
		}),
	repository: z.string()
		.uuid()
		.optional()
		.openapi({
			description: 'Optional repository ID filter (UUID)',
			example: '550e8400-e29b-41d4-a716-446655440000',
		}),
	limit: z.number()
		.int()
		.min(1)
		.max(100)
		.optional()
		.openapi({
			description: 'Maximum number of results to return (default: 20, max: 100)',
			example: 20,
		}),
});

export const SearchResultSchema = z.object({
	id: z.string()
		.uuid()
		.optional()
		.openapi({
			description: 'File UUID',
			example: '650e8400-e29b-41d4-a716-446655440000',
		}),
	projectRoot: z.string()
		.uuid()
		.openapi({
			description: 'Repository UUID (aliased as projectRoot for compatibility)',
			example: '550e8400-e29b-41d4-a716-446655440000',
		}),
	path: z.string()
		.openapi({
			description: 'File path relative to repository root',
			example: 'src/auth/login.ts',
		}),
	content: z.string()
		.openapi({
			description: 'File content',
			example: 'export function authenticate(token: string) { ... }',
		}),
	dependencies: z.array(z.string())
		.openapi({
			description: 'Package dependencies extracted from file',
			example: ['express', 'better-sqlite3'],
		}),
	indexedAt: z.string()
		.datetime()
		.openapi({
			description: 'Timestamp when file was indexed (ISO 8601)',
			example: '2025-12-16T10:30:00Z',
		}),
	snippet: z.string()
		.optional()
		.openapi({
			description: 'Content snippet with search term context',
			example: '...function authenticate(token: string) {...',
		}),
}).openapi('SearchResult');

export const SearchResponseSchema = z.object({
	results: z.array(SearchResultSchema)
		.openapi({
			description: 'Array of search results',
		}),
}).openapi('SearchResponse');

export const RecentFilesResponseSchema = z.object({
	results: z.array(SearchResultSchema)
		.openapi({
			description: 'Array of recently indexed files',
		}),
}).openapi('RecentFilesResponse');

export const HealthResponseSchema = z.object({
	status: z.string()
		.openapi({
			description: 'Service status ("ok" if healthy)',
			example: 'ok',
		}),
	timestamp: z.string()
		.datetime()
		.openapi({
			description: 'ISO 8601 timestamp of health check',
			example: '2025-12-16T10:30:00Z',
		}),
}).openapi('HealthResponse');

// ===== Error Schemas =====

export const ErrorResponseSchema = z.object({
	error: z.string()
		.openapi({
			description: 'Error message',
			example: 'Invalid request parameters',
		}),
	details: z.unknown()
		.optional()
		.openapi({
			description: 'Additional error details (optional)',
			example: { field: 'repository', issue: 'required' },
		}),
}).openapi('ErrorResponse');

export const RateLimitErrorResponseSchema = z.object({
	error: z.string()
		.openapi({
			description: 'Rate limit error message',
			example: 'Rate limit exceeded',
		}),
	limit: z.number()
		.int()
		.openapi({
			description: 'Rate limit threshold',
			example: 100,
		}),
	remaining: z.number()
		.int()
		.openapi({
			description: 'Remaining requests',
			example: 0,
		}),
	reset: z.number()
		.int()
		.openapi({
			description: 'Unix timestamp when rate limit resets',
			example: 1702742400,
		}),
}).openapi('RateLimitErrorResponse');

// ===== MCP (Model Context Protocol) Schemas =====

/**
 * JSON-RPC 2.0 request wrapper for MCP tools
 * Follows the MCP protocol specification: https://spec.modelcontextprotocol.io
 */
export const McpRequestSchema = z.object({
	jsonrpc: z.literal('2.0')
		.openapi({
			description: 'JSON-RPC version (always "2.0")',
			example: '2.0',
		}),
	id: z.union([z.string(), z.number()])
		.openapi({
			description: 'Request ID for matching responses',
			example: 1,
		}),
	method: z.string()
		.openapi({
			description: 'MCP method name (e.g., "tools/call")',
			example: 'tools/call',
		}),
	params: z.object({
		name: z.string()
			.openapi({
				description: 'Tool name to invoke',
				example: 'search_dependencies',
			}),
		arguments: z.record(z.string(), z.unknown())
			.optional()
			.openapi({
				description: 'Tool-specific parameters',
				example: {
					file_path: 'src/api/routes.ts',
					direction: 'dependents',
					depth: 2,
				},
			}),
	}).optional()
		.openapi({
			description: 'Method parameters (structure varies by method)',
		}),
}).openapi('McpRequest');

/**
 * JSON-RPC 2.0 response wrapper for MCP tools
 */
export const McpResponseSchema = z.object({
	jsonrpc: z.literal('2.0')
		.openapi({
			description: 'JSON-RPC version (always "2.0")',
			example: '2.0',
		}),
	id: z.union([z.string(), z.number(), z.null()])
		.openapi({
			description: 'Request ID that this response matches',
			example: 1,
		}),
	result: z.unknown()
		.optional()
		.openapi({
			description: 'Tool execution result (structure varies by tool)',
			example: {
				content: [
					{
						type: 'text',
						text: 'Found 5 files that depend on src/api/routes.ts',
					},
				],
			},
		}),
	error: z.object({
		code: z.number()
			.int()
			.openapi({
				description: 'JSON-RPC error code',
				example: -32602,
			}),
		message: z.string()
			.openapi({
				description: 'Error message',
				example: 'Invalid params',
			}),
		data: z.unknown()
			.optional()
			.openapi({
				description: 'Additional error information',
			}),
	}).optional()
		.openapi({
			description: 'Error object (present only if request failed)',
		}),
}).openapi('McpResponse');

/**
 * MCP health check response
 */
export const McpHealthResponseSchema = z.object({
	status: z.string()
		.openapi({
			description: 'Service status',
			example: 'ok',
		}),
	protocol: z.string()
		.openapi({
			description: 'Protocol name',
			example: 'mcp',
		}),
	version: z.string()
		.openapi({
			description: 'MCP protocol version',
			example: '2024-11-05',
		}),
	transport: z.string()
		.openapi({
			description: 'Transport mechanism',
			example: 'http',
		}),
}).openapi('McpHealthResponse');

// ===== Validation Schemas =====

/**
 * Validation error for a specific field or path
 */
export const ValidationErrorSchema = z.object({
	path: z.string()
		.openapi({
			description: 'JSON path to the field with error (e.g., "user.email", "[0].name")',
			example: 'user.email',
		}),
	message: z.string()
		.openapi({
			description: 'Human-readable error message',
			example: 'Invalid email format',
		}),
}).openapi('ValidationError');

/**
 * Request payload for POST /validate-output endpoint
 */
export const ValidationRequestSchema = z.object({
	schema: z.record(z.string(), z.unknown())
		.openapi({
			description: 'Zod-compatible JSON schema (object with type, properties, etc.)',
			example: {
				type: 'object',
				properties: {
					name: { type: 'string' },
					age: { type: 'number' },
				},
				required: ['name'],
			},
		}),
	output: z.string()
		.openapi({
			description: 'The output string to validate',
			example: '{"name": "John", "age": 30}',
		}),
}).openapi('ValidationRequest');

/**
 * Response from POST /validate-output endpoint
 */
export const ValidationResponseSchema = z.object({
	valid: z.boolean()
		.openapi({
			description: 'Whether the output passes validation',
			example: true,
		}),
	errors: z.array(ValidationErrorSchema)
		.optional()
		.openapi({
			description: 'Array of validation errors (only present if valid is false)',
		}),
}).openapi('ValidationResponse');
