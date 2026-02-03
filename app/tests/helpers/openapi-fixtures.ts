/**
 * Test fixtures for OpenAPI validation tests.
 * 
 * Provides minimal valid OpenAPI 3.1 spec as reference,
 * sample schemas, and expected security scheme definitions.
 * 
 * NOTE: Updated for local-only v2.0.0 (Issue #591)
 * Cloud-only endpoints (subscriptions, API keys, jobs, projects) have been removed.
 * POST /index removed - indexing available via MCP tool only.
 */

/**
 * Minimal valid OpenAPI 3.1 specification
 */
export const minimalValidSpec = {
	openapi: '3.1.0',
	info: {
		title: 'Test API',
		version: '1.0.0',
	},
	paths: {},
};

/**
 * Expected core endpoints that must be documented
 * 
 * NOTE: Local-only mode - these are the only endpoints in the OpenAPI spec.
 * Removed endpoints:
 * - /index (indexing available via MCP tool index_repository)
 * - /jobs/{jobId} (job tracking removed)
 * - /api/projects (projects removed)  
 * - /api/keys/* (API keys removed)
 * - /api/subscriptions/* (subscriptions removed)
 */
export const expectedCoreEndpoints = [
	{ path: '/health', method: 'get' },
	{ path: '/search', method: 'get' },
	{ path: '/files/recent', method: 'get' },
	{ path: '/validate-output', method: 'post' },
	{ path: '/mcp', method: 'get' },
	{ path: '/mcp', method: 'post' },
];

/**
 * Expected rate limit headers
 */
export const expectedRateLimitHeaders = [
	'X-RateLimit-Limit-Hour',
	'X-RateLimit-Remaining-Hour',
	'X-RateLimit-Reset-Hour',
	'X-RateLimit-Limit-Day',
	'X-RateLimit-Remaining-Day',
	'X-RateLimit-Reset-Day',
];

/**
 * Expected error response codes
 */
export const expectedErrorCodes = [400, 401, 404, 429, 500];
