#!/usr/bin/env bun
/**
 * GitHub App Configuration Validation Script
 * Issue #366 - Production environment validation for GitHub App credentials
 *
 * Validates that GitHub App environment variables are properly configured
 * and tests API connectivity before deployment.
 *
 * Usage:
 *   bun run scripts/validate-github-app-config.ts
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed (missing credentials, invalid format, or API error)
 */

import { App } from "@octokit/app";

interface ValidationResult {
	check: string;
	status: "PASS" | "FAIL" | "WARN";
	message: string;
}

const results: ValidationResult[] = [];

function logResult(result: ValidationResult): void {
	const icon = result.status === "PASS" ? "✓" : result.status === "FAIL" ? "✗" : "⚠";
	const prefix = `[${result.status}] ${icon}`;
	process.stdout.write(`${prefix} ${result.check}: ${result.message}\n`);
}

async function validateEnvironmentVariables(): Promise<boolean> {
	let allPassed = true;

	// Check GITHUB_APP_ID
	const appId = process.env.GITHUB_APP_ID;
	if (!appId) {
		results.push({
			check: "GITHUB_APP_ID",
			status: "FAIL",
			message: "Environment variable not set. Set this to your GitHub App ID from app settings.",
		});
		allPassed = false;
	} else if (!/^\d+$/.test(appId)) {
		results.push({
			check: "GITHUB_APP_ID",
			status: "FAIL",
			message: `Invalid format: "${appId}". Must be a numeric ID (e.g., "123456").`,
		});
		allPassed = false;
	} else {
		results.push({
			check: "GITHUB_APP_ID",
			status: "PASS",
			message: `Set to ${appId}`,
		});
	}

	// Check GITHUB_APP_PRIVATE_KEY
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
	if (!privateKey) {
		results.push({
			check: "GITHUB_APP_PRIVATE_KEY",
			status: "FAIL",
			message: "Environment variable not set. Set this to your GitHub App's RSA private key in PEM format.",
		});
		allPassed = false;
	} else if (!privateKey.includes("BEGIN RSA PRIVATE KEY")) {
		results.push({
			check: "GITHUB_APP_PRIVATE_KEY",
			status: "FAIL",
			message: "Invalid format. Must include '-----BEGIN RSA PRIVATE KEY-----' header.",
		});
		allPassed = false;
	} else if (!privateKey.includes("END RSA PRIVATE KEY")) {
		results.push({
			check: "GITHUB_APP_PRIVATE_KEY",
			status: "FAIL",
			message: "Invalid format. Must include '-----END RSA PRIVATE KEY-----' footer.",
		});
		allPassed = false;
	} else {
		results.push({
			check: "GITHUB_APP_PRIVATE_KEY",
			status: "PASS",
			message: `Set (${privateKey.length} characters)`,
		});
	}

	// Check GITHUB_WEBHOOK_SECRET (optional but recommended)
	const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!webhookSecret) {
		results.push({
			check: "GITHUB_WEBHOOK_SECRET",
			status: "WARN",
			message: "Not set. Recommended for webhook signature verification.",
		});
	} else {
		results.push({
			check: "GITHUB_WEBHOOK_SECRET",
			status: "PASS",
			message: `Set (${webhookSecret.length} characters)`,
		});
	}

	return allPassed;
}

async function testGitHubApiConnectivity(): Promise<boolean> {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || !privateKey) {
		results.push({
			check: "GitHub API Connectivity",
			status: "FAIL",
			message: "Skipped due to missing credentials",
		});
		return false;
	}

	try {
		const app = new App({
			appId,
			privateKey,
		});

		// Test API connectivity by listing installations
		const { data: installations } = await app.octokit.request("GET /app/installations");

		results.push({
			check: "GitHub API Connectivity",
			status: "PASS",
			message: `Successfully authenticated. Found ${installations.length} installation(s).`,
		});

		// Log installation details for debugging
		if (installations.length > 0) {
			process.stdout.write("\nInstallation Details:\n");
			for (const installation of installations) {
				process.stdout.write(
					`  - Installation ID: ${installation.id}, Account: ${installation.account?.login ?? "unknown"}\n`,
				);
			}
		} else {
			process.stdout.write(
				"\nNo installations found. Install the GitHub App on repositories you want to index.\n",
			);
			process.stdout.write("Visit: https://github.com/settings/installations\n");
		}

		return true;
	} catch (error: unknown) {
		const apiError = error as { message?: string; response?: { status: number } };

		if (apiError.response?.status === 401) {
			results.push({
				check: "GitHub API Connectivity",
				status: "FAIL",
				message: "Authentication failed. Verify GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are correct.",
			});
		} else {
			results.push({
				check: "GitHub API Connectivity",
				status: "FAIL",
				message: `API error: ${apiError.message ?? "Unknown error"}`,
			});
		}

		return false;
	}
}

async function main(): Promise<void> {
	process.stdout.write("GitHub App Configuration Validation\n");
	process.stdout.write("====================================\n\n");

	// Step 1: Validate environment variables
	const envValid = await validateEnvironmentVariables();

	// Step 2: Test GitHub API connectivity (only if env vars are valid)
	let apiValid = false;
	if (envValid) {
		apiValid = await testGitHubApiConnectivity();
	}

	// Print all results
	process.stdout.write("\nValidation Results:\n");
	process.stdout.write("-------------------\n");
	for (const result of results) {
		logResult(result);
	}

	// Summary
	const passCount = results.filter((r) => r.status === "PASS").length;
	const failCount = results.filter((r) => r.status === "FAIL").length;
	const warnCount = results.filter((r) => r.status === "WARN").length;

	process.stdout.write("\n");
	process.stdout.write(`Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings\n`);

	if (failCount > 0) {
		process.stdout.write("\nValidation FAILED. Fix the issues above before deploying.\n");
		process.stdout.write("See docs/github-app-setup.md for configuration instructions.\n");
		process.exit(1);
	}

	process.stdout.write("\nValidation PASSED. GitHub App is properly configured.\n");
	process.exit(0);
}

main().catch((error: unknown) => {
	process.stderr.write(
		`Validation script error: ${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
});
