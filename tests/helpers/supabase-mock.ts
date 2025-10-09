/**
 * Mock Supabase client for testing
 * Provides a minimal implementation of SupabaseClient interface for unit tests
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface MockSupabaseOptions {
	selectData?: any[];
	insertData?: any;
	updateData?: any;
	error?: { message: string; code?: string } | null;
}

/**
 * Create a mock Supabase client for testing
 */
export function createMockSupabaseClient(
	options: MockSupabaseOptions = {},
): SupabaseClient {
	const { selectData = [], insertData = null, updateData = null, error = null } = options;

	const mockClient = {
		from: (table: string) => ({
			select: (columns?: string) => ({
				eq: (column: string, value: any) => ({
					maybeSingle: () => Promise.resolve({ data: selectData[0] || null, error }),
					single: () => Promise.resolve({ data: selectData[0] || null, error }),
				}),
				limit: (count: number) => Promise.resolve({ data: selectData.slice(0, count), error }),
				order: (column: string, options?: any) => ({
					limit: (count: number) => Promise.resolve({ data: selectData.slice(0, count), error }),
				}),
				ilike: (column: string, pattern: string) => ({
					eq: (column: string, value: any) => ({
						order: (column: string, options?: any) => ({
							limit: (count: number) => Promise.resolve({ data: selectData.slice(0, count), error }),
						}),
					}),
					order: (column: string, options?: any) => ({
						limit: (count: number) => Promise.resolve({ data: selectData.slice(0, count), error }),
					}),
				}),
			}),
			insert: (data: any) => ({
				select: (columns?: string) => ({
					single: () => Promise.resolve({ data: insertData, error }),
				}),
			}),
			upsert: (data: any, options?: any) =>
				Promise.resolve({ data: insertData, error, count: Array.isArray(data) ? data.length : 1 }),
			update: (data: any) => ({
				eq: (column: string, value: any) => Promise.resolve({ data: updateData, error }),
			}),
		}),
		rpc: (functionName: string, params?: any) => Promise.resolve({ data: null, error: null }),
	} as unknown as SupabaseClient;

	return mockClient;
}
