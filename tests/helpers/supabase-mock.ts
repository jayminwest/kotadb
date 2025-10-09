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
	apiKeyData?: any; // For mocking API key validation
}

/**
 * Create a mock Supabase client for testing
 */
export function createMockSupabaseClient(
	options: MockSupabaseOptions = {},
): SupabaseClient {
	const {
		selectData = [],
		insertData = null,
		updateData = null,
		error = null,
		apiKeyData = {
			id: "test-api-key-id",
			user_id: "test-user-id-uuid",
			org_id: "test-org-id-uuid",
			tier: "free",
			secret_hash: "$2b$10$qCub8ulq0BnDmxMUhfwbWOCrWmFUKVFWn2.18eOSgPWdlaHCaZ9ve",
			rate_limit_per_hour: 100,
			enabled: true,
		},
	} = options;

	const mockClient = {
		from: (table: string) => ({
			select: (columns?: string) => ({
				eq: (column: string, value: any) => ({
					maybeSingle: () => {
						// Special handling for API key lookups
						if (table === "api_keys" && column === "key_id") {
							return Promise.resolve({ data: apiKeyData, error: null });
						}
						return Promise.resolve({ data: selectData[0] || null, error });
					},
					single: () => {
						// Special handling for API key lookups
						if (table === "api_keys" && column === "key_id") {
							return Promise.resolve({ data: apiKeyData, error: null });
						}
						return Promise.resolve({ data: selectData[0] || null, error });
					},
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
