/**
 * OpenAPI spec generation tests.
 * 
 * Tests that the OpenAPI spec is generated correctly with all required
 * endpoints, schemas, and security definitions.
 * 
 * NOTE: Updated for local-only v2.0.0 (Issue #591)
 * Cloud-only endpoints (subscriptions) have been removed.
 * POST /index removed - indexing available via MCP tool only.
 */

import { describe, expect, test } from 'bun:test';
import { buildOpenAPISpec, clearSpecCache } from '@api/openapi/builder.js';
import { expectedCoreEndpoints, expectedRateLimitHeaders } from '../helpers/openapi-fixtures.js';

describe('OpenAPI Spec Generation', () => {
	test('generates spec without errors', () => {
		clearSpecCache();
		const spec = buildOpenAPISpec();
		
		expect(spec).toBeDefined();
		expect(spec).toHaveProperty('openapi');
		expect(spec).toHaveProperty('info');
		expect(spec).toHaveProperty('paths');
	});

	test('has correct OpenAPI version', () => {
		const spec = buildOpenAPISpec() as any;
		
		expect(spec.openapi).toBe('3.1.0');
	});

	test('has valid info section', () => {
		const spec = buildOpenAPISpec() as any;
		
		expect(spec.info).toHaveProperty('title');
		expect(spec.info).toHaveProperty('version');
		expect(spec.info).toHaveProperty('description');
		expect(spec.info.title).toBe('KotaDB API');
		expect(spec.info.version).toBe('0.1.0');
	});

	test('defines security schemes', () => {
		const spec = buildOpenAPISpec() as any;
		
		expect(spec.components).toHaveProperty('securitySchemes');
		expect(spec.components.securitySchemes).toHaveProperty('apiKey');
		expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');
		
		// Verify API key scheme
		const apiKeyScheme = spec.components.securitySchemes.apiKey;
		expect(apiKeyScheme.type).toBe('http');
		expect(apiKeyScheme.scheme).toBe('bearer');
		expect(apiKeyScheme.bearerFormat).toBe('API Key');
		
		// Verify JWT scheme
		const bearerScheme = spec.components.securitySchemes.bearerAuth;
		expect(bearerScheme.type).toBe('http');
		expect(bearerScheme.scheme).toBe('bearer');
		expect(bearerScheme.bearerFormat).toBe('JWT');
	});

	test('documents all core endpoints', () => {
		const spec = buildOpenAPISpec() as any;
		
		for (const { path, method } of expectedCoreEndpoints) {
			expect(spec.paths).toHaveProperty(path);
			expect(spec.paths[path]).toHaveProperty(method);
		}
	});

	test('includes rate limit headers in authenticated endpoints', () => {
		const spec = buildOpenAPISpec() as any;
		
		// Check /search endpoint (authenticated)
		const searchOperation = spec.paths['/search']?.get;
		expect(searchOperation).toBeDefined();
		
		// Should have 200 response with rate limit headers
		const response200 = searchOperation?.responses?.['200'];
		expect(response200).toBeDefined();
		expect(response200?.headers).toBeDefined();
		
		// Verify rate limit headers present
		for (const header of expectedRateLimitHeaders) {
			expect(response200?.headers).toHaveProperty(header);
		}
	});

	test('includes 429 error response for authenticated endpoints', () => {
		const spec = buildOpenAPISpec() as any;
		
		// Check /search endpoint (authenticated)
		const searchOperation = spec.paths['/search']?.get;
		expect(searchOperation).toBeDefined();
		
		// Should have 429 response
		const response429 = searchOperation?.responses?.['429'];
		expect(response429).toBeDefined();
		expect(response429?.description).toContain('Rate limit');
	});

	test('marks health endpoint as public', () => {
		const spec = buildOpenAPISpec() as any;
		
		const healthOperation = spec.paths['/health']?.get;
		expect(healthOperation).toBeDefined();
		
		// Public endpoints have empty security array
		expect(healthOperation?.security).toEqual([]);
	});

	test('applies security to authenticated endpoints', () => {
		const spec = buildOpenAPISpec() as any;
		
		// Check /search endpoint (authenticated)
		const searchOperation = spec.paths['/search']?.get;
		expect(searchOperation).toBeDefined();
		
		// Should have security requirements
		expect(searchOperation?.security).toBeDefined();
		expect(Array.isArray(searchOperation?.security)).toBe(true);
		expect(searchOperation?.security.length).toBeGreaterThan(0);
	});

	test('has servers defined', () => {
		const spec = buildOpenAPISpec() as any;
		
		expect(spec.servers).toBeDefined();
		expect(Array.isArray(spec.servers)).toBe(true);
		expect(spec.servers.length).toBeGreaterThan(0);
		
		// Local-only mode: should have localhost server
		const localServer = spec.servers.find((s: any) => s.url.includes('localhost'));
		expect(localServer).toBeDefined();
	});

	test('version matches package.json', () => {
		const spec = buildOpenAPISpec() as any;
		
		// Version should be 0.1.0 (from package.json)
		expect(spec.info.version).toBe('0.1.0');
	});

	test('caches spec on subsequent calls', () => {
		clearSpecCache();
		
		const spec1 = buildOpenAPISpec();
		const spec2 = buildOpenAPISpec();
		
		// Should return same object reference (cached)
		expect(spec1).toBe(spec2);
	});

	test('has tags defined', () => {
		const spec = buildOpenAPISpec() as any;
		
		expect(spec.tags).toBeDefined();
		expect(Array.isArray(spec.tags)).toBe(true);
		
		// Check for expected tags (local-only mode)
		const tagNames = spec.tags.map((t: any) => t.name);
		expect(tagNames).toContain('Health');
		expect(tagNames).toContain('Search');
		expect(tagNames).toContain('MCP');
		expect(tagNames).toContain('Validation');
		// NOTE: Indexing, Jobs, Projects, API Keys tags removed for local-only mode
	});

	test('all paths have operation IDs or summaries', () => {
		const spec = buildOpenAPISpec() as any;
		
		for (const [path, methods] of Object.entries(spec.paths)) {
			for (const [method, operation] of Object.entries(methods as any)) {
				expect((operation as any).summary).toBeDefined();
			}
		}
	});

	test('all operations have response schemas', () => {
		const spec = buildOpenAPISpec() as any;
		
		for (const [path, methods] of Object.entries(spec.paths)) {
			for (const [method, operation] of Object.entries(methods as any)) {
				const responses = (operation as any).responses;
				expect(responses).toBeDefined();
				expect(Object.keys(responses).length).toBeGreaterThan(0);
			}
		}
	});
});
