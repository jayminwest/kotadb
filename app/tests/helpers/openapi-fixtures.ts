/**
 * Test fixtures for OpenAPI validation tests.
 * 
 * Provides minimal valid OpenAPI 3.1 spec as reference,
 * sample schemas, and expected security scheme definitions.
 * 
 * NOTE: Updated for local-only v2.0.0 (Issue #591)
 * Cloud-only endpoints (subscriptions, API keys) have been removed.
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
 * NOTE: Local-only mode - subscription and API key endpoints removed.
 * Project endpoints remain but use local SQLite storage.
 */
export const expectedCoreEndpoints = [
	{ path: '/health', method: 'get' },
	{ path: '/index', method: 'post' },
	{ path: '/jobs/{jobId}', method: 'get' },
	{ path: '/search', method: 'get' },
	{ path: '/files/recent', method: 'get' },
	{ path: '/api/projects', method: 'get' },
	{ path: '/api/projects', method: 'post' },
	{ path: '/api/projects/{id}', method: 'get' },
	{ path: '/api/projects/{id}', method: 'patch' },
	{ path: '/api/projects/{id}', method: 'delete' },
	// Cloud-only endpoints removed for v2.0.0:
	// - /api/keys/generate
	// - /api/keys/current
	// - /api/keys/reset
	// - /api/subscriptions/create-checkout-session
	// - /api/subscriptions/create-portal-session
	// - /api/subscriptions/current
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
