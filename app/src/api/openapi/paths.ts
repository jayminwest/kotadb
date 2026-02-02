/**
 * OpenAPI path operations for KotaDB API.
 * 
 * Defines all public API endpoints with request/response schemas,
 * parameters, security requirements, and documentation.
 */

import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	SearchRequestSchema,
	SearchResponseSchema,
	RecentFilesResponseSchema,
	HealthResponseSchema,
	ErrorResponseSchema,
	RateLimitErrorResponseSchema,
	McpRequestSchema,
	McpResponseSchema,
	McpHealthResponseSchema,
	ValidationRequestSchema,
	ValidationResponseSchema,
} from './schemas.js';
/**
 * Standard rate limit response headers
 * Included in all authenticated endpoint responses
 */
const rateLimitHeaders = {
	'X-RateLimit-Limit-Hour': {
		description: 'Total requests allowed per hour for the tier',
		schema: { type: 'string' as const },
		example: '100',
	},
	'X-RateLimit-Remaining-Hour': {
		description: 'Requests remaining in current hour window',
		schema: { type: 'string' as const },
		example: '95',
	},
	'X-RateLimit-Reset-Hour': {
		description: 'Unix timestamp when the hourly limit resets',
		schema: { type: 'string' as const },
		example: '1702742400',
	},
	'X-RateLimit-Limit-Day': {
		description: 'Total requests allowed per day for the tier',
		schema: { type: 'string' as const },
		example: '1000',
	},
	'X-RateLimit-Remaining-Day': {
		description: 'Requests remaining in current day window',
		schema: { type: 'string' as const },
		example: '950',
	},
	'X-RateLimit-Reset-Day': {
		description: 'Unix timestamp when the daily limit resets',
		schema: { type: 'string' as const },
		example: '1702828800',
	},
};


/**
 * Register all API path operations with the OpenAPI registry
 */
export function registerPaths(registry: OpenAPIRegistry): void {
	// ===== Health Check =====
	registry.registerPath({
		method: 'get',
		path: '/health',
		summary: 'Health check',
		description: 'Simple health check endpoint to verify service availability',
		tags: ['Health'],
		security: [], // Public endpoint
		responses: {
			200: {
				description: 'Service is healthy',
				content: {
					'application/json': {
						schema: HealthResponseSchema,
					},
				},
			},
		},
	});

	// ===== Search =====
	registry.registerPath({
		method: 'get',
		path: '/search',
		summary: 'Search code',
		description: 'Search indexed file content with optional repository filtering',
		tags: ['Search'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			query: SearchRequestSchema,
		},
		responses: {
			200: {
				description: 'Search results retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: SearchResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid search parameters',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - Invalid or missing authentication',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			429: {
				description: 'Rate limit exceeded',
				content: {
					'application/json': {
						schema: RateLimitErrorResponseSchema,
					},
				},
			},
			500: {
				description: 'Internal server error',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
		},
	});

	// ===== Recent Files =====
	registry.registerPath({
		method: 'get',
		path: '/files/recent',
		summary: 'Get recent files',
		description: 'Retrieve recently indexed files',
		tags: ['Files'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		responses: {
			200: {
				description: 'Recent files retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: RecentFilesResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - Invalid or missing authentication',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			429: {
				description: 'Rate limit exceeded',
				content: {
					'application/json': {
						schema: RateLimitErrorResponseSchema,
					},
				},
			},
			500: {
				description: 'Internal server error',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
		},
	});

	// ===== Validation =====
	registry.registerPath({
		method: 'post',
		path: '/validate-output',
		summary: 'Validate command output',
		description: 'Validate command output against a Zod-compatible JSON schema. Used by automation layer to validate slash command outputs.',
		tags: ['Validation'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			body: {
				description: 'Validation request with schema and output',
				content: {
					'application/json': {
						schema: ValidationRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: 'Validation completed successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: ValidationResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters (missing schema or output)',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - Invalid or missing authentication',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			429: {
				description: 'Rate limit exceeded',
				content: {
					'application/json': {
						schema: RateLimitErrorResponseSchema,
					},
				},
			},
			500: {
				description: 'Validation failed due to internal error',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
		},
	});

	// ===== MCP (Model Context Protocol) =====
	registry.registerPath({
		method: 'get',
		path: '/mcp',
		summary: 'MCP health check',
		description: 'Health check endpoint for MCP protocol availability. Returns MCP server metadata and protocol version.',
		tags: ['MCP'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		responses: {
			200: {
				description: 'MCP server is available',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: McpHealthResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - Invalid or missing authentication',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			429: {
				description: 'Rate limit exceeded',
				content: {
					'application/json': {
						schema: RateLimitErrorResponseSchema,
					},
				},
			},
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/mcp',
		summary: 'Execute MCP tool',
		description: 'Execute Model Context Protocol (MCP) tools for code intelligence operations. Uses JSON-RPC 2.0 protocol for request/response messaging. Available tools: search_code, index_repository, list_recent_files, search_dependencies, analyze_change_impact, validate_implementation_spec, kota_sync_export, kota_sync_import. The endpoint requires both application/json and text/event-stream in the Accept header. Responses follow JSON-RPC 2.0 format with result on success or error on failure.',
		tags: ['MCP'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			body: {
				description: 'JSON-RPC 2.0 request with MCP tool invocation',
				content: {
					'application/json': {
						schema: McpRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: 'Tool executed successfully. Rate limit headers are included in the response.',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: McpResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid JSON-RPC request format',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - Invalid or missing authentication',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			406: {
				description: 'Not Acceptable - Must accept both application/json and text/event-stream',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			429: {
				description: 'Rate limit exceeded',
				content: {
					'application/json': {
						schema: RateLimitErrorResponseSchema,
					},
				},
			},
			500: {
				description: 'Internal server error during tool execution',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
		},
	});
}
