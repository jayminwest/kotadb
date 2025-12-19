/**
 * OpenAPI path operations for KotaDB API.
 * 
 * Defines all public API endpoints with request/response schemas,
 * parameters, security requirements, and documentation.
 */

import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
	IndexRequestSchema,
	IndexResponseSchema,
	SearchRequestSchema,
	SearchResponseSchema,
	RecentFilesResponseSchema,
	HealthResponseSchema,
	JobStatusResponseSchema,
	CreateProjectRequestSchema,
	UpdateProjectRequestSchema,
	ProjectWithReposSchema,
	ProjectListItemSchema,
	CreateCheckoutSessionRequestSchema,
	CreateCheckoutSessionResponseSchema,
	CreatePortalSessionRequestSchema,
	CreatePortalSessionResponseSchema,
	CurrentSubscriptionResponseSchema,
	GenerateApiKeyResponseSchema,
	GetCurrentApiKeyResponseSchema,
	ResetApiKeyResponseSchema,
	AddRepositoryToProjectResponseSchema,
	RemoveRepositoryFromProjectResponseSchema,
	ErrorResponseSchema,
	RateLimitErrorResponseSchema,
	McpRequestSchema,
	McpResponseSchema,
	McpHealthResponseSchema,
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

	// ===== Indexing =====
	registry.registerPath({
		method: 'post',
		path: '/index',
		summary: 'Index repository',
		description: 'Trigger indexing of a repository. Creates a background job to clone, parse, and index the repository code.',
		tags: ['Indexing'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			body: {
				description: 'Repository indexing request',
				content: {
					'application/json': {
						schema: IndexRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: 'Indexing job created successfully. Rate limit headers are included in the response.',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: IndexResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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

	// ===== Job Status =====
	registry.registerPath({
		method: 'get',
		path: '/jobs/{jobId}',
		summary: 'Get job status',
		description: 'Retrieve status and progress information for an indexing job',
		tags: ['Jobs'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			params: z.object({
				jobId: z.string().uuid().openapi({ description: 'Job UUID', example: '550e8400-e29b-41d4-a716-446655440000' }),
			}),
		},
		responses: {
			200: {
				description: 'Job status retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: JobStatusResponseSchema,
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
			404: {
				description: 'Job not found',
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

	// ===== Projects =====
	registry.registerPath({
		method: 'post',
		path: '/api/projects',
		summary: 'Create project',
		description: 'Create a new project with optional repository associations',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			body: {
				description: 'Project creation request',
				content: {
					'application/json': {
						schema: CreateProjectRequestSchema,
					},
				},
			},
		},
		responses: {
			201: {
				description: 'Project created successfully',
				content: {
					'application/json': {
						schema: ProjectWithReposSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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

	registry.registerPath({
		method: 'get',
		path: '/api/projects',
		summary: 'List projects',
		description: 'Retrieve all projects for the authenticated user',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		responses: {
			200: {
				description: 'Projects retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: z.array(ProjectListItemSchema),
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

	registry.registerPath({
		method: 'get',
		path: '/api/projects/{id}',
		summary: 'Get project',
		description: 'Retrieve a specific project with its repositories',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().uuid().openapi({ description: 'Project UUID', example: '750e8400-e29b-41d4-a716-446655440000' }),
			}),
		},
		responses: {
			200: {
				description: 'Project retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: ProjectWithReposSchema,
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
			404: {
				description: 'Project not found',
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

	registry.registerPath({
		method: 'patch',
		path: '/api/projects/{id}',
		summary: 'Update project',
		description: 'Update project name, description, or repository associations',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().uuid().openapi({ description: 'Project UUID', example: '750e8400-e29b-41d4-a716-446655440000' }),
			}),
			body: {
				description: 'Project update request',
				content: {
					'application/json': {
						schema: UpdateProjectRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: 'Project updated successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: ProjectWithReposSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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
			404: {
				description: 'Project not found',
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

	registry.registerPath({
		method: 'delete',
		path: '/api/projects/{id}',
		summary: 'Delete project',
		description: 'Delete a project and its repository associations',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().uuid().openapi({ description: 'Project UUID', example: '750e8400-e29b-41d4-a716-446655440000' }),
			}),
		},
		responses: {
			204: {
				description: 'Project deleted successfully',
			},
			401: {
				description: 'Unauthorized - Invalid or missing authentication',
				content: {
					'application/json': {
						schema: ErrorResponseSchema,
					},
				},
			},
			404: {
				description: 'Project not found',
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

	// ===== API Keys =====
	// ===== Repository Operations =====
	registry.registerPath({
		method: 'post',
		path: '/api/projects/{id}/repositories/{repoId}',
		summary: 'Add repository to project',
		description: 'Associate a repository with a project',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().uuid().openapi({ description: 'Project UUID', example: '750e8400-e29b-41d4-a716-446655440000' }),
				repoId: z.string().uuid().openapi({ description: 'Repository UUID', example: 'a50e8400-e29b-41d4-a716-446655440001' }),
			}),
		},
		responses: {
			200: {
				description: 'Repository added successfully. Rate limit headers are included in the response.',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: AddRepositoryToProjectResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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

	registry.registerPath({
		method: 'delete',
		path: '/api/projects/{id}/repositories/{repoId}',
		summary: 'Remove repository from project',
		description: 'Remove a repository association from a project',
		tags: ['Projects'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			params: z.object({
				id: z.string().uuid().openapi({ description: 'Project UUID', example: '750e8400-e29b-41d4-a716-446655440000' }),
				repoId: z.string().uuid().openapi({ description: 'Repository UUID', example: 'a50e8400-e29b-41d4-a716-446655440001' }),
			}),
		},
		responses: {
			200: {
				description: 'Repository removed successfully. Rate limit headers are included in the response.',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: RemoveRepositoryFromProjectResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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

	registry.registerPath({
		method: 'post',
		path: '/api/keys/generate',
		summary: 'Generate API key',
		description: 'Generate a new API key for the authenticated user (JWT only)',
		tags: ['API Keys'],
		security: [{ bearerAuth: [] }], // JWT only
		responses: {
			201: {
				description: 'API key generated successfully',
				content: {
					'application/json': {
						schema: GenerateApiKeyResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - JWT token required',
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

	registry.registerPath({
		method: 'get',
		path: '/api/keys/current',
		summary: 'Get current API key',
		description: 'Retrieve metadata for the current API key (prefix only, not full key)',
		tags: ['API Keys'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		responses: {
			200: {
				description: 'API key metadata retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: GetCurrentApiKeyResponseSchema,
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
			404: {
				description: 'API key not found',
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

	registry.registerPath({
		method: 'post',
		path: '/api/keys/reset',
		summary: 'Reset API key',
		description: 'Reset the API key for the authenticated user (JWT only)',
		tags: ['API Keys'],
		security: [{ bearerAuth: [] }], // JWT only
		responses: {
			200: {
				description: 'API key reset successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: ResetApiKeyResponseSchema,
					},
				},
			},
			401: {
				description: 'Unauthorized - JWT token required',
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

	// ===== Subscriptions =====
	registry.registerPath({
		method: 'post',
		path: '/api/subscriptions/create-checkout-session',
		summary: 'Create Stripe checkout session',
		description: 'Initiate Stripe Checkout for tier upgrade',
		tags: ['Subscriptions'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			body: {
				description: 'Checkout session request',
				content: {
					'application/json': {
						schema: CreateCheckoutSessionRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: 'Checkout session created successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: CreateCheckoutSessionResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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

	registry.registerPath({
		method: 'post',
		path: '/api/subscriptions/create-portal-session',
		summary: 'Create Stripe portal session',
		description: 'Generate Stripe billing portal link for subscription management',
		tags: ['Subscriptions'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		request: {
			body: {
				description: 'Portal session request',
				content: {
					'application/json': {
						schema: CreatePortalSessionRequestSchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: 'Portal session created successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: CreatePortalSessionResponseSchema,
					},
				},
			},
			400: {
				description: 'Invalid request parameters',
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

	registry.registerPath({
		method: 'get',
		path: '/api/subscriptions/current',
		summary: 'Get current subscription',
		description: 'Retrieve current subscription data for the authenticated user',
		tags: ['Subscriptions'],
		security: [{ apiKey: [] }, { bearerAuth: [] }],
		responses: {
			200: {
				description: 'Subscription data retrieved successfully',
				headers: rateLimitHeaders,
				content: {
					'application/json': {
						schema: CurrentSubscriptionResponseSchema,
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
		description: 'Execute Model Context Protocol (MCP) tools for code intelligence operations. Uses JSON-RPC 2.0 protocol for request/response messaging. Available tools include: search_code, list_recent_files, search_dependencies, analyze_change_impact, index_repository, get_index_job_status, create_project, list_projects, get_project, update_project, delete_project, add_repository_to_project, remove_repository_from_project, validate_implementation_spec, sync_export, and sync_import. The endpoint requires both application/json and text/event-stream in the Accept header. Responses follow JSON-RPC 2.0 format with result on success or error on failure.',
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
