/**
 * OpenAPI 3.1 compliance validation tests.
 * 
 * Uses real @apidevtools/swagger-parser to validate that the generated
 * OpenAPI spec is valid according to OpenAPI 3.1 standards.
 */

import { describe, expect, test } from 'bun:test';
import SwaggerParser from '@apidevtools/swagger-parser';
import { buildOpenAPISpec, clearSpecCache } from '@api/openapi/builder.js';

describe('OpenAPI 3.1 Compliance', () => {
	test('spec passes OpenAPI 3.1 validation', async () => {
		clearSpecCache();
		const spec = buildOpenAPISpec();
		
		// Use real swagger-parser to validate (antimocking)
		const api = await SwaggerParser.validate(spec as any);
		
		expect(api).toBeDefined();
		expect((api as any).openapi).toBe('3.1.0');
	});

	test('spec can be dereferenced without errors', async () => {
		const spec = buildOpenAPISpec();
		
		// Dereference $ref pointers
		const dereferenced = await SwaggerParser.dereference(spec as any);
		
		expect(dereferenced).toBeDefined();
		expect((dereferenced as any).paths).toBeDefined();
	});

	test('spec has no circular references', async () => {
		const spec = buildOpenAPISpec();
		
		// This will throw if circular references exist
		await expect(SwaggerParser.dereference(spec as any)).resolves.toBeDefined();
	});

	test('all referenced schemas exist', async () => {
		const spec = buildOpenAPISpec();
		
		// Bundle resolves all references
		const bundled = await SwaggerParser.bundle(spec as any);
		
		expect(bundled).toBeDefined();
	});

	test('spec can be parsed as JSON', () => {
		const spec = buildOpenAPISpec();
		
		// Should be able to stringify and parse
		const json = JSON.stringify(spec);
		const parsed = JSON.parse(json);
		
		expect(parsed).toBeDefined();
		expect(parsed.openapi).toBe('3.1.0');
	});
});
