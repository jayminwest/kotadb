/**
 * Spec validation logic for validate_implementation_spec MCP tool
 *
 * Validates implementation specs against KotaDB conventions:
 * - Migration naming conventions
 * - Path alias usage
 * - Test file naming
 * - File location patterns
 * - Dependency compatibility
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	ImplementationSpec,
	ValidationResult,
	ValidationIssue,
} from "@shared/types";
import { resolveFilePath } from "@api/queries";
import { getGitHubClient } from "./github-integration";

/**
 * Validate implementation spec against KotaDB conventions
 *
 * @param supabase - Supabase client instance
 * @param spec - Implementation spec to validate
 * @param userId - User ID for RLS context
 * @returns Validation results
 */
export async function validateImplementationSpec(
	supabase: SupabaseClient,
	spec: ImplementationSpec,
	userId: string,
): Promise<ValidationResult> {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	// Resolve repository ID
	const repositoryId = await resolveRepositoryId(
		supabase,
		spec.repository,
		userId,
	);

	if (!repositoryId) {
		errors.push({
			type: "repository",
			message: "No repository found. Please index a repository first.",
		});

		return {
			valid: false,
			errors,
			warnings,
			approval_conditions: [],
			risk_assessment: "Cannot assess - no repository data",
			summary: "Validation failed: No repository indexed",
		};
	}

	// Validate file conflicts
	const fileConflicts = await checkFileConflicts(
		supabase,
		spec,
		repositoryId,
		userId,
	);
	errors.push(...fileConflicts.errors);
	warnings.push(...fileConflicts.warnings);

	// Validate naming conventions
	const namingIssues = validateNamingConventions(spec);
	errors.push(...namingIssues.errors);
	warnings.push(...namingIssues.warnings);

	// Validate path aliases
	const pathAliasIssues = await validatePathAliases(spec);
	errors.push(...pathAliasIssues.errors);
	warnings.push(...pathAliasIssues.warnings);

	// Estimate test coverage impact
	const testCoverageIssues = estimateTestCoverageImpact(spec);
	warnings.push(...testCoverageIssues);

	// Validate dependencies
	const dependencyIssues = validateDependencies(spec);
	warnings.push(...dependencyIssues);

	// Generate approval conditions
	const approvalConditions = generateApprovalConditions(
		spec,
		errors,
		warnings,
	);

	// Calculate risk assessment
	const riskAssessment = calculateRiskAssessment(spec, errors, warnings);

	// Generate summary
	const summary = generateSummary(spec, errors, warnings);

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		approval_conditions: approvalConditions,
		risk_assessment: riskAssessment,
		summary,
	};
}

/**
 * Resolve repository ID from request or use first available repository
 */
async function resolveRepositoryId(
	supabase: SupabaseClient,
	repositoryId: string | undefined,
	userId: string,
): Promise<string | null> {
	if (repositoryId) {
		return repositoryId;
	}

	// Get first repository for user
	const { data } = await supabase
		.from("repositories")
		.select("id")
		.eq("user_id", userId)
		.limit(1)
		.maybeSingle();

	return data?.id ?? null;
}

/**
 * Check for file conflicts (files already exist or are in other branches)
 */
async function checkFileConflicts(
	supabase: SupabaseClient,
	spec: ImplementationSpec,
	repositoryId: string,
	userId: string,
): Promise<{ errors: ValidationIssue[]; warnings: ValidationIssue[] }> {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	// Check files_to_create for conflicts
	if (spec.files_to_create) {
		for (const fileSpec of spec.files_to_create) {
			const fileId = await resolveFilePath(
				supabase,
				fileSpec.path,
				repositoryId,
				userId,
			);

			if (fileId) {
				errors.push({
					type: "file_conflict",
					message: `File already exists: ${fileSpec.path}`,
					affected_resource: fileSpec.path,
					suggested_fix: "Remove from files_to_create or rename the file",
				});
			}
		}
	}

	// Check for GitHub branch conflicts (if available)
	const { data: repo } = await supabase
		.from("repositories")
		.select("full_name")
		.eq("id", repositoryId)
		.maybeSingle();

	if (repo && repo.full_name) {
		const [owner, repoName] = repo.full_name.split("/");
		if (owner && repoName) {
			const githubClient = getGitHubClient();
			if (githubClient.isAvailable()) {
				const allFiles = [
					...(spec.files_to_create?.map((f) => f.path) ?? []),
					...(spec.files_to_modify?.map((f) => f.path) ?? []),
				];

				const conflicts = await githubClient.detectFileConflicts(
					owner,
					repoName,
					allFiles,
				);

				for (const conflict of conflicts) {
					warnings.push({
						type: "branch_conflict",
						message: conflict.description,
						affected_resource: conflict.metadata?.overlapping_files
							? (conflict.metadata.overlapping_files as string[])[0]
							: undefined,
						suggested_fix: "Coordinate with open PR or wait for merge",
					});
				}
			}
		}
	}

	return { errors, warnings };
}

/**
 * Validate naming conventions
 */
function validateNamingConventions(
	spec: ImplementationSpec,
): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	// Validate migration naming
	if (spec.migrations) {
		const migrationPattern = /^\d{14}_[a-z0-9_-]+\.sql$/;

		for (const migration of spec.migrations) {
			if (!migrationPattern.test(migration.filename)) {
				errors.push({
					type: "naming_convention",
					message: `Invalid migration filename: ${migration.filename}`,
					affected_resource: migration.filename,
					suggested_fix:
						"Use format: YYYYMMDDHHMMSS_description.sql (e.g., 20251108120000_add_oauth_providers.sql)",
				});
			}
		}
	}

	// Validate test file naming
	const allFiles = [
		...(spec.files_to_create?.map((f) => f.path) ?? []),
		...(spec.files_to_modify?.map((f) => f.path) ?? []),
	];

	for (const filePath of allFiles) {
		// Check if test files follow convention
		if (filePath.includes("test") || filePath.includes("spec")) {
			if (
				!filePath.endsWith(".test.ts") &&
				!filePath.endsWith(".spec.ts") &&
				!filePath.endsWith(".test.tsx") &&
				!filePath.endsWith(".spec.tsx")
			) {
				warnings.push({
					type: "naming_convention",
					message: `Test file should use .test.ts or .spec.ts extension: ${filePath}`,
					affected_resource: filePath,
					suggested_fix: "Rename to use .test.ts or .spec.ts extension",
				});
			}
		}
	}

	return { errors, warnings };
}

/**
 * Validate path alias usage
 */
async function validatePathAliases(
	spec: ImplementationSpec,
): Promise<{ errors: ValidationIssue[]; warnings: ValidationIssue[] }> {
	const errors: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	// Define valid path alias prefixes for KotaDB
	const validPrefixes = [
		"@api/",
		"@auth/",
		"@db/",
		"@indexer/",
		"@mcp/",
		"@validation/",
		"@queue/",
		"@shared/",
	];

	// Check if files are in correct directories for their aliases
	const allFiles = [
		...(spec.files_to_create?.map((f) => f.path) ?? []),
		...(spec.files_to_modify?.map((f) => f.path) ?? []),
	];

	for (const filePath of allFiles) {
		// Skip test files and non-TypeScript files
		if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) continue;
		if (filePath.includes("test") || filePath.includes("spec")) continue;

		// Check if file is in app/src directory (should use path aliases)
		if (filePath.startsWith("app/src/")) {
			const relativePath = filePath.replace("app/src/", "");
			const parts = relativePath.split("/");

			if (parts.length > 1) {
				const topLevelDir = parts[0];
				const expectedAlias = `@${topLevelDir}/`;

				if (!validPrefixes.includes(expectedAlias)) {
					warnings.push({
						type: "path_alias",
						message: `File in app/src/${topLevelDir}/ but no standard path alias exists`,
						affected_resource: filePath,
						suggested_fix: `Consider using existing aliases: ${validPrefixes.join(", ")}`,
					});
				}
			}
		}
	}

	return { errors, warnings };
}

/**
 * Estimate test coverage impact
 */
function estimateTestCoverageImpact(
	spec: ImplementationSpec,
): ValidationIssue[] {
	const warnings: ValidationIssue[] = [];

	// Count implementation files vs test files
	const implementationFiles =
		spec.files_to_create?.filter(
			(f) => !f.path.includes("test") && !f.path.includes("spec"),
		) ?? [];
	const testFiles =
		spec.files_to_create?.filter(
			(f) => f.path.includes("test") || f.path.includes("spec"),
		) ?? [];

	// Warn if implementation files lack corresponding tests
	if (implementationFiles.length > 0 && testFiles.length === 0) {
		warnings.push({
			type: "test_coverage",
			message: `No test files specified for ${implementationFiles.length} implementation file(s)`,
			suggested_fix:
				"Add test files for new implementation files to maintain test coverage",
		});
	}

	// Warn if test coverage ratio is low
	const testRatio =
		implementationFiles.length > 0
			? testFiles.length / implementationFiles.length
			: 1;
	if (testRatio < 0.5 && implementationFiles.length > 2) {
		warnings.push({
			type: "test_coverage",
			message: `Low test coverage ratio: ${testFiles.length} tests for ${implementationFiles.length} implementation files`,
			suggested_fix:
				"Consider adding more test files to achieve at least 1:1 ratio",
		});
	}

	return warnings;
}

/**
 * Validate dependencies
 */
function validateDependencies(spec: ImplementationSpec): ValidationIssue[] {
	const warnings: ValidationIssue[] = [];

	if (!spec.dependencies_to_add || spec.dependencies_to_add.length === 0) {
		return warnings;
	}

	// Check for common dependency issues
	for (const dep of spec.dependencies_to_add) {
		// Warn about missing version
		if (!dep.version) {
			warnings.push({
				type: "dependency",
				message: `No version specified for dependency: ${dep.name}`,
				affected_resource: dep.name,
				suggested_fix: "Specify an exact version or version range",
			});
		}

		// Warn about potentially problematic dependencies
		if (dep.name.includes("mock") || dep.name.includes("stub")) {
			warnings.push({
				type: "dependency",
				message: `Mocking library detected: ${dep.name}. KotaDB follows antimocking philosophy.`,
				affected_resource: dep.name,
				suggested_fix:
					"Consider using real service instances instead of mocks (see /anti-mock)",
			});
		}
	}

	return warnings;
}

/**
 * Generate approval conditions checklist
 */
function generateApprovalConditions(
	spec: ImplementationSpec,
	errors: ValidationIssue[],
	warnings: ValidationIssue[],
): string[] {
	const conditions: string[] = [];

	// Blocking conditions from errors
	if (errors.length > 0) {
		conditions.push(
			`Fix ${errors.length} validation error(s) before implementation`,
		);
	}

	// Migration-specific conditions
	if (spec.migrations && spec.migrations.length > 0) {
		conditions.push(
			"Ensure migration sync between app/src/db/migrations and app/supabase/migrations",
		);
		conditions.push("Run migration sync validation: bun run test:validate-migrations");
	}

	// Breaking changes conditions
	if (spec.breaking_changes) {
		conditions.push("Document breaking changes in PR description");
		conditions.push("Provide migration guide for affected consumers");
		conditions.push("Consider feature flag for gradual rollout");
	}

	// Test coverage conditions
	const hasTests =
		spec.files_to_create?.some(
			(f) => f.path.includes("test") || f.path.includes("spec"),
		) ?? false;
	if (!hasTests) {
		conditions.push("Add test files before merging to maintain coverage");
	}

	// Dependency conditions
	if (spec.dependencies_to_add && spec.dependencies_to_add.length > 0) {
		conditions.push(
			`Verify ${spec.dependencies_to_add.length} new dependencies are necessary and compatible`,
		);
	}

	// General conditions
	conditions.push("Run full test suite before creating PR");
	conditions.push("Update documentation if APIs or schemas change");

	return conditions;
}

/**
 * Calculate risk assessment
 */
function calculateRiskAssessment(
	spec: ImplementationSpec,
	errors: ValidationIssue[],
	warnings: ValidationIssue[],
): string {
	const riskFactors: string[] = [];

	if (errors.length > 0) {
		riskFactors.push(`${errors.length} blocking errors`);
	}

	if (warnings.length > 3) {
		riskFactors.push(`${warnings.length} warnings`);
	}

	if (spec.breaking_changes) {
		riskFactors.push("breaking changes");
	}

	if (spec.migrations && spec.migrations.length > 0) {
		riskFactors.push(`${spec.migrations.length} database migrations`);
	}

	const totalFiles =
		(spec.files_to_create?.length ?? 0) + (spec.files_to_modify?.length ?? 0);
	if (totalFiles > 20) {
		riskFactors.push(`${totalFiles} files affected`);
	}

	if (riskFactors.length === 0) {
		return "LOW RISK - Spec follows conventions and has no blocking issues";
	}

	if (riskFactors.length >= 3 || spec.breaking_changes) {
		return `HIGH RISK - ${riskFactors.join(", ")}. Requires careful review and testing.`;
	}

	return `MEDIUM RISK - ${riskFactors.join(", ")}. Standard review process recommended.`;
}

/**
 * Generate summary of validation results
 */
function generateSummary(
	spec: ImplementationSpec,
	errors: ValidationIssue[],
	warnings: ValidationIssue[],
): string {
	const parts: string[] = [];

	parts.push(`Validation for feature: ${spec.feature_name}.`);

	if (errors.length > 0) {
		parts.push(`FAILED - ${errors.length} error(s) must be fixed.`);
	} else {
		parts.push("PASSED - No blocking errors.");
	}

	if (warnings.length > 0) {
		parts.push(`${warnings.length} warning(s) for review.`);
	}

	const totalFiles =
		(spec.files_to_create?.length ?? 0) + (spec.files_to_modify?.length ?? 0);
	parts.push(`${totalFiles} files planned.`);

	if (spec.migrations && spec.migrations.length > 0) {
		parts.push(`${spec.migrations.length} migration(s) included.`);
	}

	return parts.join(" ");
}
