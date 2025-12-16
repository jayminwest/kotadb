/**
 * OpenAPI schema extensions for KotaDB API.
 * 
 * Extends existing Zod schemas with OpenAPI metadata for spec generation.
 * Uses @asteasolutions/zod-to-openapi package to add descriptions, examples, and documentation.
 */

import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ===== Request Schemas =====

export const IndexRequestSchema = z.object({
	repository: z.string()
		.min(1)
		.openapi({
			description: 'Repository identifier (e.g., "owner/repo" or local path)',
			example: 'octocat/Hello-World',
		}),
	ref: z.string()
		.optional()
		.openapi({
			description: 'Git ref to index (branch, tag, or commit SHA). Defaults to repository\'s default branch.',
			example: 'main',
		}),
	localPath: z.string()
		.optional()
		.openapi({
			description: 'Local filesystem path (for local repositories instead of remote clones)',
			example: '/Users/dev/my-project',
		}),
}).openapi('IndexRequest');

export const IndexResponseSchema = z.object({
	jobId: z.string()
		.uuid()
		.openapi({
			description: 'Index job UUID for tracking status',
			example: '550e8400-e29b-41d4-a716-446655440000',
		}),
	status: z.string()
		.openapi({
			description: 'Initial job status (always "pending" when job is created)',
			example: 'pending',
		}),
}).openapi('IndexResponse');

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
			example: ['express', '@supabase/supabase-js'],
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

export const JobStatusResponseSchema = z.object({
	id: z.string()
		.uuid()
		.openapi({
			description: 'Job UUID (primary key)',
			example: '550e8400-e29b-41d4-a716-446655440000',
		}),
	repository_id: z.string()
		.uuid()
		.openapi({
			description: 'Repository UUID being indexed',
			example: '650e8400-e29b-41d4-a716-446655440000',
		}),
	ref: z.string()
		.optional()
		.openapi({
			description: 'Git ref being indexed (branch, tag, or commit)',
			example: 'main',
		}),
	status: z.enum(['pending', 'processing', 'completed', 'failed', 'skipped'])
		.openapi({
			description: 'Job status',
			example: 'completed',
		}),
	started_at: z.string()
		.datetime()
		.optional()
		.openapi({
			description: 'Timestamp when job started processing',
			example: '2025-12-16T10:25:00Z',
		}),
	completed_at: z.string()
		.datetime()
		.optional()
		.openapi({
			description: 'Timestamp when job completed',
			example: '2025-12-16T10:30:00Z',
		}),
	error_message: z.string()
		.optional()
		.openapi({
			description: 'Error message if job failed',
			example: 'Repository not found',
		}),
	stats: z.object({
		files_indexed: z.number()
			.int()
			.optional()
			.openapi({
				description: 'Number of files indexed',
				example: 150,
			}),
		symbols_extracted: z.number()
			.int()
			.optional()
			.openapi({
				description: 'Number of code symbols extracted',
				example: 2500,
			}),
		references_found: z.number()
			.int()
			.optional()
			.openapi({
				description: 'Number of symbol references found',
				example: 1800,
			}),
		dependencies_extracted: z.number()
			.int()
			.optional()
			.openapi({
				description: 'Number of package dependencies extracted',
				example: 45,
			}),
	}).optional()
		.openapi({
			description: 'Job statistics',
		}),
	created_at: z.string()
		.datetime()
		.optional()
		.openapi({
			description: 'Job creation timestamp',
			example: '2025-12-16T10:20:00Z',
		}),
}).openapi('JobStatusResponse');

// ===== Project Schemas =====

export const CreateProjectRequestSchema = z.object({
	name: z.string()
		.min(1)
		.openapi({
			description: 'Project name',
			example: 'My Project',
		}),
	description: z.string()
		.optional()
		.openapi({
			description: 'Project description (optional)',
			example: 'A collection of related repositories',
		}),
	repository_ids: z.array(z.string().uuid())
		.optional()
		.openapi({
			description: 'List of repository IDs to add to project (optional)',
			example: ['550e8400-e29b-41d4-a716-446655440000'],
		}),
}).openapi('CreateProjectRequest');

export const UpdateProjectRequestSchema = z.object({
	name: z.string()
		.min(1)
		.optional()
		.openapi({
			description: 'Updated project name (optional)',
			example: 'Renamed Project',
		}),
	description: z.string()
		.optional()
		.openapi({
			description: 'Updated project description (optional)',
			example: 'Updated description',
		}),
	repository_ids: z.array(z.string().uuid())
		.optional()
		.openapi({
			description: 'Updated list of repository IDs (replaces existing, optional)',
			example: ['550e8400-e29b-41d4-a716-446655440000', '650e8400-e29b-41d4-a716-446655440000'],
		}),
}).openapi('UpdateProjectRequest');

export const RepositorySchema = z.object({
	id: z.string()
		.uuid()
		.openapi({
			description: 'Repository UUID',
			example: '550e8400-e29b-41d4-a716-446655440000',
		}),
	name: z.string()
		.openapi({
			description: 'Repository name',
			example: 'octocat/Hello-World',
		}),
	url: z.string()
		.url()
		.optional()
		.openapi({
			description: 'Repository URL (optional)',
			example: 'https://github.com/octocat/Hello-World',
		}),
	created_at: z.string()
		.datetime()
		.openapi({
			description: 'Repository creation timestamp',
			example: '2025-12-16T10:00:00Z',
		}),
}).openapi('Repository');

export const ProjectSchema = z.object({
	id: z.string()
		.uuid()
		.openapi({
			description: 'Project UUID (primary key)',
			example: '750e8400-e29b-41d4-a716-446655440000',
		}),
	user_id: z.string()
		.uuid()
		.nullable()
		.openapi({
			description: 'User UUID who owns this project',
			example: '850e8400-e29b-41d4-a716-446655440000',
		}),
	org_id: z.string()
		.uuid()
		.nullable()
		.openapi({
			description: 'Organization UUID that owns this project',
			example: null,
		}),
	name: z.string()
		.openapi({
			description: 'Project name (unique per user or organization)',
			example: 'My Project',
		}),
	description: z.string()
		.nullable()
		.optional()
		.openapi({
			description: 'Project description (optional)',
			example: 'A collection of related repositories',
		}),
	created_at: z.string()
		.datetime()
		.openapi({
			description: 'Creation timestamp',
			example: '2025-12-16T10:00:00Z',
		}),
	updated_at: z.string()
		.datetime()
		.openapi({
			description: 'Last update timestamp',
			example: '2025-12-16T10:30:00Z',
		}),
	metadata: z.record(z.string(), z.unknown())
		.optional()
		.openapi({
			description: 'Additional metadata (stored as JSONB in database)',
			example: { tags: ['backend', 'api'] },
		}),
}).openapi('Project');

export const ProjectWithReposSchema = ProjectSchema.extend({
	repositories: z.array(RepositorySchema)
		.openapi({
			description: 'List of repositories in this project',
		}),
	repository_count: z.number()
		.int()
		.openapi({
			description: 'Count of repositories in this project',
			example: 3,
		}),
}).openapi('ProjectWithRepos');

export const ProjectListItemSchema = ProjectSchema.extend({
	repository_count: z.number()
		.int()
		.openapi({
			description: 'Count of repositories in this project',
			example: 3,
		}),
}).openapi('ProjectListItem');

// ===== Subscription Schemas =====

export const CreateCheckoutSessionRequestSchema = z.object({
	tier: z.enum(['solo', 'team'])
		.openapi({
			description: 'Subscription tier to purchase',
			example: 'solo',
		}),
	successUrl: z.string()
		.url()
		.openapi({
			description: 'Success URL to redirect after payment',
			example: 'https://app.kotadb.com/success',
		}),
	cancelUrl: z.string()
		.url()
		.openapi({
			description: 'Cancel URL to redirect if user cancels',
			example: 'https://app.kotadb.com/cancel',
		}),
}).openapi('CreateCheckoutSessionRequest');

export const CreateCheckoutSessionResponseSchema = z.object({
	url: z.string()
		.url()
		.openapi({
			description: 'Stripe Checkout session URL',
			example: 'https://checkout.stripe.com/c/pay/cs_test_...',
		}),
	sessionId: z.string()
		.openapi({
			description: 'Stripe session ID',
			example: 'cs_test_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
		}),
}).openapi('CreateCheckoutSessionResponse');

export const CreatePortalSessionRequestSchema = z.object({
	returnUrl: z.string()
		.url()
		.openapi({
			description: 'Return URL after user completes billing portal actions',
			example: 'https://app.kotadb.com/settings',
		}),
}).openapi('CreatePortalSessionRequest');

export const CreatePortalSessionResponseSchema = z.object({
	url: z.string()
		.url()
		.openapi({
			description: 'Stripe billing portal URL',
			example: 'https://billing.stripe.com/p/session/test_...',
		}),
}).openapi('CreatePortalSessionResponse');

export const CurrentSubscriptionResponseSchema = z.object({
	subscription: z.object({
		id: z.string()
			.uuid()
			.openapi({
				description: 'Subscription UUID',
				example: '950e8400-e29b-41d4-a716-446655440000',
			}),
		tier: z.enum(['free', 'solo', 'team'])
			.openapi({
				description: 'Subscription tier',
				example: 'solo',
			}),
		status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'unpaid'])
			.openapi({
				description: 'Subscription status',
				example: 'active',
			}),
		current_period_start: z.string()
			.datetime()
			.nullable()
			.openapi({
				description: 'Current period start timestamp',
				example: '2025-12-01T00:00:00Z',
			}),
		current_period_end: z.string()
			.datetime()
			.nullable()
			.openapi({
				description: 'Current period end timestamp',
				example: '2026-01-01T00:00:00Z',
			}),
		cancel_at_period_end: z.boolean()
			.openapi({
				description: 'Whether subscription cancels at period end',
				example: false,
			}),
	}).nullable()
		.openapi({
			description: 'Subscription data (null if no subscription exists)',
		}),
}).openapi('CurrentSubscriptionResponse');

// ===== API Key Schemas =====

export const GenerateApiKeyResponseSchema = z.object({
	apiKey: z.string()
		.openapi({
			description: 'Generated API key in kota_* format',
			example: 'kota_free_key123_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
		}),
	keyId: z.string()
		.uuid()
		.openapi({
			description: 'API key UUID',
			example: 'a50e8400-e29b-41d4-a716-446655440000',
		}),
}).openapi('GenerateApiKeyResponse');

export const GetCurrentApiKeyResponseSchema = z.object({
	keyId: z.string()
		.uuid()
		.openapi({
			description: 'API key UUID',
			example: 'a50e8400-e29b-41d4-a716-446655440000',
		}),
	keyPrefix: z.string()
		.openapi({
			description: 'API key prefix (first 20 characters)',
			example: 'kota_free_key123_xxx',
		}),
	createdAt: z.string()
		.datetime()
		.openapi({
			description: 'API key creation timestamp',
			example: '2025-12-01T10:00:00Z',
		}),
}).openapi('GetCurrentApiKeyResponse');

export const ResetApiKeyResponseSchema = z.object({
	apiKey: z.string()
		.openapi({
			description: 'New API key in kota_* format',
			example: 'kota_free_key456_yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
		}),
	keyId: z.string()
		.uuid()
		.openapi({
			description: 'API key UUID',
			example: 'b60e8400-e29b-41d4-a716-446655440000',
		}),
}).openapi('ResetApiKeyResponse');

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

// ===== Repository Operations =====

export const AddRepositoryToProjectResponseSchema = z.object({
	success: z.boolean()
		.openapi({
			description: 'Operation success status',
			example: true,
		}),
}).openapi('AddRepositoryToProjectResponse');

export const RemoveRepositoryFromProjectResponseSchema = z.object({
	success: z.boolean()
		.openapi({
			description: 'Operation success status',
			example: true,
		}),
}).openapi('RemoveRepositoryFromProjectResponse');

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
