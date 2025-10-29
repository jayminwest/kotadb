#!/usr/bin/env bun
/**
 * Generate test accounts for local development, dogfooding, and frontend testing.
 *
 * Usage: bun run scripts/generate-test-account.ts [email] [tier] [--session-token]
 *
 * Arguments:
 *   email - Optional email address, defaults to "test@kotadb.dev"
 *   tier - Optional tier (free|solo|team), defaults to "team"
 *   --session-token - Generate frontend session tokens instead of API key
 *
 * Examples:
 *   # Backend API testing (default)
 *   bun run scripts/generate-test-account.ts test@local.dev team
 *
 *   # Frontend testing with session tokens
 *   bun run scripts/generate-test-account.ts test@local.dev free --session-token
 */

import { generateApiKey } from "../src/auth/keys";
import { getServiceClient } from "../src/db/client";
import type { Tier } from "@shared/types/auth";

/**
 * User creation result containing user ID and metadata.
 */
interface CreateUserResult {
	userId: string;
	email: string;
	isNewUser: boolean;
}

/**
 * Session token generation result with access and refresh tokens.
 */
interface SessionTokenResult {
	accessToken: string;
	refreshToken: string;
	hashedToken: string;
	userId: string;
	email: string;
}

/**
 * Parse command-line arguments.
 */
function parseArgs(): {
	email: string;
	tier: Tier;
	generateSessionToken: boolean;
} {
	const args = process.argv.slice(2);

	let email = "test@kotadb.dev";
	let tier: Tier = "team";
	let generateSessionToken = false;

	// Parse arguments
	for (const arg of args) {
		if (arg === "--session-token") {
			generateSessionToken = true;
		} else if (arg.includes("@")) {
			email = arg;
		} else if (arg === "free" || arg === "solo" || arg === "team") {
			tier = arg;
		}
	}

	return { email, tier, generateSessionToken };
}

/**
 * Create or retrieve test user with service account metadata.
 *
 * Adds metadata to mark accounts as automation test accounts:
 * - service_account: true
 * - purpose: 'automation-testing'
 */
async function createOrGetTestUser(email: string): Promise<CreateUserResult> {
	const supabase = getServiceClient();

	// Check if test user already exists
	const { data: existingUser } = await supabase.auth.admin.listUsers();
	const testUser = existingUser?.users.find((u) => u.email === email);

	if (testUser) {
		process.stdout.write(`Using existing test user: ${testUser.id}\n`);
		return {
			userId: testUser.id,
			email: testUser.email || email,
			isNewUser: false,
		};
	}

	// Create test user with metadata
	const { data, error } = await supabase.auth.admin.createUser({
		email,
		password: "test-password-123",
		email_confirm: true,
		user_metadata: {
			service_account: true,
			purpose: "automation-testing",
		},
	});

	if (error) {
		process.stderr.write(`Failed to create test user: ${error.message}\n`);
		process.exit(1);
	}

	process.stdout.write(`Created test user: ${data.user.id}\n`);
	return {
		userId: data.user.id,
		email: data.user.email || email,
		isNewUser: true,
	};
}

/**
 * Generate session tokens using Supabase Auth signIn.
 *
 * Signs in with the test account credentials to obtain real access and refresh tokens.
 * These tokens can be used for cookie-based frontend authentication testing.
 */
async function generateSessionTokens(
	userId: string,
	email: string,
): Promise<SessionTokenResult> {
	const supabase = getServiceClient();

	// Sign in with password to get session tokens
	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password: "test-password-123",
	});

	if (error || !data.session) {
		throw new Error(
			`Failed to generate session tokens: ${error?.message || "No session created"}`,
		);
	}

	return {
		accessToken: data.session.access_token,
		refreshToken: data.session.refresh_token,
		hashedToken: "",
		userId,
		email,
	};
}

/**
 * Format and display backend API testing output.
 */
function displayBackendOutput(result: {
	apiKey: string;
	keyId: string;
	tier: Tier;
	rateLimitPerHour: number;
	createdAt: Date;
}) {
	process.stdout.write("\n=== TEST ACCOUNT GENERATED ===\n");
	process.stdout.write("Mode: Backend API Testing\n\n");

	process.stdout.write("--- API Key Details ---\n");
	process.stdout.write(`API Key: ${result.apiKey}\n`);
	process.stdout.write(`Key ID: ${result.keyId}\n`);
	process.stdout.write(`Tier: ${result.tier}\n`);
	process.stdout.write(`Rate Limit: ${result.rateLimitPerHour} requests/hour\n`);
	process.stdout.write(`Created At: ${result.createdAt.toISOString()}\n`);

	process.stdout.write("\n--- Usage Example ---\n");
	process.stdout.write(
		`curl -H "Authorization: Bearer ${result.apiKey}" http://localhost:3000/search?term=auth\n`,
	);

	process.stdout.write(
		"\n⚠️  Save this API key - it won't be shown again!\n",
	);
}

/**
 * Format and display frontend session token output.
 */
function displayFrontendOutput(tokens: SessionTokenResult) {
	process.stdout.write("\n=== TEST ACCOUNT GENERATED ===\n");
	process.stdout.write("Mode: Frontend Testing (Session Tokens)\n\n");

	process.stdout.write("--- Session Tokens ---\n");
	process.stdout.write(`Email: ${tokens.email}\n`);
	process.stdout.write(`User ID: ${tokens.userId}\n`);
	process.stdout.write(`Access Token: ${tokens.accessToken}\n`);
	process.stdout.write(`Refresh Token: ${tokens.refreshToken}\n`);

	process.stdout.write("\n--- Playwright Cookie Injection Example ---\n");
	process.stdout.write("await page.context().addCookies([{\n");
	process.stdout.write("  name: 'sb-localhost-auth-token',\n");
	process.stdout.write("  value: JSON.stringify({\n");
	process.stdout.write(`    access_token: '${tokens.accessToken}',\n`);
	process.stdout.write(`    refresh_token: '${tokens.refreshToken}',\n`);
	process.stdout.write("    expires_in: 3600,\n");
	process.stdout.write("    token_type: 'bearer'\n");
	process.stdout.write("  }),\n");
	process.stdout.write("  domain: 'localhost',\n");
	process.stdout.write("  path: '/',\n");
	process.stdout.write("  httpOnly: false,\n");
	process.stdout.write("  secure: false,\n");
	process.stdout.write("  sameSite: 'Lax'\n");
	process.stdout.write("}]);\n");

	process.stdout.write("\n--- Token Expiration ---\n");
	process.stdout.write(
		"⚠️  Access tokens expire in 1 hour (default Supabase setting)\n",
	);
	process.stdout.write(
		"⚠️  Use refresh token to obtain new access tokens when expired\n",
	);
	process.stdout.write(
		"⚠️  Cookie name format: sb-{project-ref}-auth-token (localhost for Supabase Local)\n",
	);
}

async function main() {
	const { email, tier, generateSessionToken } = parseArgs();

	// Create or retrieve test user
	const user = await createOrGetTestUser(email);

	if (generateSessionToken) {
		// Frontend testing mode: generate session tokens
		const tokens = await generateSessionTokens(user.userId, user.email);
		displayFrontendOutput(tokens);
	} else {
		// Backend testing mode: generate API key
		const result = await generateApiKey({
			userId: user.userId,
			tier,
		});
		displayBackendOutput(result);
	}
}

main().catch((error) => {
	process.stderr.write(`Error: ${error.message}\n`);
	process.exit(1);
});
