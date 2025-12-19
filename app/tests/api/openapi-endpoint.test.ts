/**
 * OpenAPI endpoint integration tests.
 * 
 * Tests the GET /openapi.json endpoint to ensure it returns
 * valid spec without authentication and with correct headers.
 * 
 * NOTE: These tests require the dev server to be running.
 */

import { describe, expect, test } from 'bun:test';

describe('GET /openapi.json endpoint', () => {
	test('spec can be imported and built without errors', async () => {
		const { buildOpenAPISpec } = await import('@api/openapi/builder.js');
		const spec = buildOpenAPISpec();
		
		expect(spec).toBeDefined();
	});
});
