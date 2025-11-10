#!/usr/bin/env bun
/**
 * Generate an API key for the staging environment.
 *
 * Usage: bun run scripts/generate-staging-key.ts [tier]
 *
 * Arguments:
 *   tier - Optional tier (free|solo|team), defaults to "team"
 *
 * Example:
 *   bun run scripts/generate-staging-key.ts team
 */

import { generateApiKey } from "../src/auth/keys";
import { createClient } from "@supabase/supabase-js";

async function main() {
	const tier = (process.argv[2] as "free" | "solo" | "team") || "team";

	// Get staging credentials from Fly.io secrets
	const stagingUrl = "https://szuaoiiwrwpuhdbruydr.supabase.co";
	const stagingServiceKey = process.env.SUPABASE_SERVICE_KEY_STAGING;

	if (!stagingServiceKey) {
		process.stderr.write(
			"Error: SUPABASE_SERVICE_KEY_STAGING environment variable is required\n",
		);
		process.stderr.write(
			"Get it from: flyctl secrets list --app kotadb-staging\n",
		);
		process.exit(1);
	}

	// Create staging Supabase client
	const supabase = createClient(stagingUrl, stagingServiceKey, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		},
	});

	// Check if staging MCP user already exists
	const { data: existingUser } = await supabase.auth.admin.listUsers();
	let userId: string;

	const stagingUser = existingUser?.users.find(
		(u) => u.email === "staging-mcp@kotadb.dev",
	);

	if (stagingUser) {
		process.stdout.write(`Using existing staging MCP user: ${stagingUser.id}\n`);
		userId = stagingUser.id;
	} else {
		// Create staging MCP user
		const { data, error } = await supabase.auth.admin.createUser({
			email: "staging-mcp@kotadb.dev",
			password: `staging-mcp-${Date.now()}`,
			email_confirm: true,
		});

		if (error) {
			process.stderr.write(`Failed to create staging user: ${error.message}\n`);
			process.exit(1);
		}

		userId = data.user.id;
		process.stdout.write(`Created staging MCP user: ${userId}\n`);
	}

	// Set env vars temporarily for generateApiKey to use the staging database
	const originalUrl = process.env.SUPABASE_URL;
	const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;

	process.env.SUPABASE_URL = stagingUrl;
	process.env.SUPABASE_SERVICE_KEY = stagingServiceKey;

	try {
		// Generate API key
		const result = await generateApiKey({
			userId,
			tier,
		});

		process.stdout.write("\n=== Staging API Key Generated ===\n");
		process.stdout.write(`API Key: ${result.apiKey}\n`);
		process.stdout.write(`Key ID: ${result.keyId}\n`);
		process.stdout.write(`Tier: ${result.tier}\n`);
		process.stdout.write(
			`Rate Limit: ${result.rateLimitPerHour} requests/hour\n`,
		);
		process.stdout.write(`Created At: ${result.createdAt.toISOString()}\n`);
		process.stdout.write("\nSave this API key - it won't be shown again!\n");
		process.stdout.write(
			`\nTo use: curl -H "Authorization: Bearer ${result.apiKey}" https://kotadb-staging.fly.dev/search?term=auth\n`,
		);
		process.stdout.write(
			`\nUpdate .mcp.json with this key for the kotadb-staging server.\n`,
		);
	} finally {
		// Restore original env vars
		if (originalUrl) process.env.SUPABASE_URL = originalUrl;
		if (originalServiceKey) process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
	}
}

main().catch((error) => {
	process.stderr.write(`Error: ${error.message}\n`);
	process.exit(1);
});
