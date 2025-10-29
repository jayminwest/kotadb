#!/usr/bin/env bun
/**
 * Generate a test API key for local development and dogfooding.
 *
 * Usage: bun run scripts/generate-test-key.ts [tier]
 *
 * Arguments:
 *   tier - Optional tier (free|solo|team), defaults to "team"
 *
 * Example:
 *   bun run scripts/generate-test-key.ts team
 */

import { generateApiKey } from "../src/auth/keys";
import { getServiceClient } from "../src/db/client";

async function main() {
	const tier = (process.argv[2] as "free" | "solo" | "team") || "team";

	// Create a test user first
	const supabase = getServiceClient();

	// Check if test user already exists
	const { data: existingUser } = await supabase.auth.admin.listUsers();
	let userId: string;

	const testUser = existingUser?.users.find((u) => u.email === "test@kotadb.dev");

	if (testUser) {
		process.stdout.write(`Using existing test user: ${testUser.id}\n`);
		userId = testUser.id;
	} else {
		// Create test user
		const { data, error } = await supabase.auth.admin.createUser({
			email: "test@kotadb.dev",
			password: "test-password-123",
			email_confirm: true,
		});

		if (error) {
			process.stderr.write(`Failed to create test user: ${error.message}\n`);
			process.exit(1);
		}

		userId = data.user.id;
		process.stdout.write(`Created test user: ${userId}\n`);
	}

	// Generate API key
	const result = await generateApiKey({
		userId,
		tier,
	});

	process.stdout.write("\n=== API Key Generated ===\n");
	process.stdout.write(`API Key: ${result.apiKey}\n`);
	process.stdout.write(`Key ID: ${result.keyId}\n`);
	process.stdout.write(`Tier: ${result.tier}\n`);
	process.stdout.write(`Rate Limit: ${result.rateLimitPerHour} requests/hour\n`);
	process.stdout.write(`Created At: ${result.createdAt.toISOString()}\n`);
	process.stdout.write("\nSave this API key - it won't be shown again!\n");
	process.stdout.write(`\nTo use: curl -H "Authorization: Bearer ${result.apiKey}" http://localhost:3000/search?term=auth\n`);
}

main().catch((error) => {
	process.stderr.write(`Error: ${error.message}\n`);
	process.exit(1);
});
