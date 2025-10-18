#!/usr/bin/env bun
/**
 * Generate an automation API key with team tier for ADW workflows.
 *
 * Usage:
 *   bun run scripts/generate-automation-key.ts
 *
 * The script creates a dedicated API key for automation workflows with:
 * - Team tier (10,000 requests per hour)
 * - Dedicated user ID for tracking automation usage
 * - Output formatted for copying to .env files
 */

import { generateApiKey } from "../src/auth/keys";
import { getServiceClient } from "../src/db/client";

const AUTOMATION_USER_EMAIL = "automation@kotadb.local";
const AUTOMATION_USER_ID = "00000000-0000-0000-0000-000000000002";

async function main() {
	console.log("🔑 Generating automation API key...\n");

	const supabase = getServiceClient();

	// Check if automation user exists, create if not
	const { data: existingUser } = await supabase
		.from("api_keys")
		.select("user_id")
		.eq("user_id", AUTOMATION_USER_ID)
		.limit(1)
		.maybeSingle();

	if (!existingUser) {
		console.log("📝 Creating automation user entry...");
		// Note: In production, this would create a proper auth.users entry
		// For local testing, we just create the API key record
	}

	// Generate team tier API key
	try {
		const result = await generateApiKey({
			userId: AUTOMATION_USER_ID,
			tier: "team",
		});

		console.log("✅ API key generated successfully!\n");
		console.log("═══════════════════════════════════════════════");
		console.log("API Key Details:");
		console.log("═══════════════════════════════════════════════");
		console.log(`Tier:              ${result.tier}`);
		console.log(`Rate Limit:        ${result.rateLimitPerHour} req/hour`);
		console.log(`Key ID:            ${result.keyId}`);
		console.log(`Created:           ${result.createdAt.toISOString()}\n`);
		console.log("Full API Key (save this - it won't be shown again):");
		console.log(result.apiKey);
		console.log("═══════════════════════════════════════════════\n");
		console.log("💾 Add this to your automation/.env file:\n");
		console.log(`KOTA_MCP_API_KEY=${result.apiKey}`);
		console.log("MCP_SERVER_URL=http://localhost:3000/mcp\n");
		console.log("⚠️  WARNING: Keep this key secure! Anyone with access to this");
		console.log("   key can make up to 10,000 requests per hour to your KotaDB instance.\n");
	} catch (error) {
		console.error("❌ Failed to generate API key:");
		console.error(error);
		process.exit(1);
	}
}

main();
