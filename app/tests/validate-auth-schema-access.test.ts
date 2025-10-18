/**
 * Validation test: Prevent direct access to auth schema via Supabase client
 *
 * The auth schema (auth.users, auth.sessions, etc.) is managed by GoTrue (Supabase Auth service)
 * and is protected from direct writes via the Supabase JS client. Attempts to insert/update/delete
 * via client.from("auth.*") will fail with malformed error objects.
 *
 * This test ensures no test files attempt direct auth schema writes, which would cause
 * intermittent CI failures with "undefined" error messages.
 *
 * Correct approach: Seed auth.users via SQL (see app/supabase/seed.sql) and use pre-seeded
 * test users in tests (TEST_USER_IDS from app/tests/helpers/db.ts).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";

describe("Auth Schema Access Validation", () => {
	test("test files should not access auth schema via Supabase client", async () => {
		// Find all test files and test helpers
		const glob = new Glob("tests/**/*.{ts,js}");
		const testFiles: string[] = [];

		for await (const file of glob.scan({ cwd: process.cwd(), absolute: true })) {
			testFiles.push(file);
		}

		const violations: { file: string; lines: number[] }[] = [];

		for (const file of testFiles) {
			// Skip this validation test file itself (it contains auth schema patterns in comments/examples)
			if (file.endsWith("validate-auth-schema-access.test.ts")) {
				continue;
			}

			const content = readFileSync(file, "utf-8");
			const lines = content.split("\n");

			const violatingLines: number[] = [];

			lines.forEach((line, index) => {
				// Check for direct auth schema access patterns
				// Pattern 1: client.from("auth.users")
				// Pattern 2: client.from('auth.users')
				// Pattern 3: client.from(`auth.users`)
				const authSchemaPattern =
					/\.from\s*\(\s*["'`]auth\.(users|sessions|identities|refresh_tokens|instances|audit_log_entries|schema_migrations|mfa_amr_claims|mfa_challenges|mfa_factors|saml_providers|saml_relay_states|sso_domains|sso_providers)["'`]\s*\)/;

				if (authSchemaPattern.test(line)) {
					violatingLines.push(index + 1); // 1-indexed line numbers
				}
			});

			if (violatingLines.length > 0) {
				violations.push({ file, lines: violatingLines });
			}
		}

		// Report violations with detailed error message
		if (violations.length > 0) {
			const errorMessage = violations
				.map(({ file, lines }) => {
					const relPath = file.replace(process.cwd() + "/", "");
					return `  ${relPath}:${lines.join(", ")}`;
				})
				.join("\n");

			throw new Error(
				`Found direct auth schema access via Supabase client (protected by GoTrue):\n${errorMessage}\n\n` +
					"The auth schema is managed by GoTrue and cannot be written via Supabase JS client.\n" +
					"Use pre-seeded test users from TEST_USER_IDS in app/tests/helpers/db.ts instead.\n" +
					"See app/supabase/seed.sql for how to seed auth.users via SQL.",
			);
		}

		// If no violations, test passes
		expect(violations).toEqual([]);
	});
});
