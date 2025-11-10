/**
 * Impact analysis logic for analyze_change_impact MCP tool
 *
 * Provides comprehensive change impact analysis including:
 * - Dependency aggregation (direct and indirect dependents)
 * - Test scope calculation
 * - Risk level scoring
 * - Architectural pattern detection
 * - Conflict detection with open PRs
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
	ChangeImpactRequest,
	ChangeImpactResponse,
	AffectedFile,
	TestScope,
	ConflictInfo,
} from "@shared/types";
import {
	queryDependents,
	queryDependencies,
	resolveFilePath,
} from "@api/queries";
import { getGitHubClient } from "./github-integration";

/**
 * Analyze change impact for proposed modifications
 *
 * @param supabase - Supabase client instance
 * @param request - Change impact request
 * @param userId - User ID for RLS context
 * @returns Impact analysis results
 */
export async function analyzeChangeImpact(
	supabase: SupabaseClient,
	request: ChangeImpactRequest,
	userId: string,
): Promise<ChangeImpactResponse> {
	// Resolve repository ID
	const repositoryId = await resolveRepositoryId(
		supabase,
		request.repository,
		userId,
	);

	if (!repositoryId) {
		return {
			affected_files: [],
			test_scope: {
				test_files: [],
				recommended_test_files: [],
				coverage_impact: "No repository indexed. Please index a repository first.",
			},
			architectural_warnings: [],
			conflicts: [],
			risk_level: "low",
			deployment_impact: "Cannot assess - no repository data available",
			last_indexed_at: new Date().toISOString(),
			summary: "No repository data available for impact analysis",
		};
	}

	// Get last indexed timestamp
	const lastIndexedAt = await getLastIndexedTimestamp(supabase, repositoryId);

	// Aggregate all files to analyze
	const filesToAnalyze = [
		...(request.files_to_modify ?? []),
		...(request.files_to_create ?? []),
		...(request.files_to_delete ?? []),
	];

	// Aggregate dependency graph for affected files
	const affectedFiles = await aggregateDependencyGraph(
		supabase,
		filesToAnalyze,
		repositoryId,
		userId,
	);

	// Calculate test scope
	const testScope = await calculateTestScope(
		supabase,
		affectedFiles,
		repositoryId,
		userId,
	);

	// Calculate risk level
	const riskLevel = calculateRiskLevel(
		affectedFiles,
		request.breaking_changes ?? false,
		testScope,
	);

	// Detect architectural patterns and warnings
	const architecturalWarnings = await detectArchitecturalPatterns(
		supabase,
		request,
		filesToAnalyze,
		repositoryId,
	);

	// Detect conflicts with open PRs
	const conflicts = await detectConflicts(
		supabase,
		repositoryId,
		filesToAnalyze,
	);

	// Generate deployment impact estimate
	const deploymentImpact = generateDeploymentImpact(
		request,
		affectedFiles,
		riskLevel,
	);

	// Generate summary
	const summary = generateSummary(
		request,
		affectedFiles,
		testScope,
		riskLevel,
		conflicts,
	);

	return {
		affected_files: affectedFiles,
		test_scope: testScope,
		architectural_warnings: architecturalWarnings,
		conflicts,
		risk_level: riskLevel,
		deployment_impact: deploymentImpact,
		last_indexed_at: lastIndexedAt,
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
 * Get last indexed timestamp for repository
 */
async function getLastIndexedTimestamp(
	supabase: SupabaseClient,
	repositoryId: string,
): Promise<string> {
	const { data } = await supabase
		.from("indexed_files")
		.select("indexed_at")
		.eq("repository_id", repositoryId)
		.order("indexed_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	return data?.indexed_at ?? new Date().toISOString();
}

/**
 * Aggregate dependency graph for affected files
 */
async function aggregateDependencyGraph(
	supabase: SupabaseClient,
	filePaths: string[],
	repositoryId: string,
	userId: string,
): Promise<AffectedFile[]> {
	const affectedFiles: AffectedFile[] = [];
	const processedFiles = new Set<string>();

	// Process each file to analyze
	for (const filePath of filePaths) {
		if (processedFiles.has(filePath)) continue;
		processedFiles.add(filePath);

		// Resolve file ID
		const fileId = await resolveFilePath(
			supabase,
			filePath,
			repositoryId,
			userId,
		);

		if (!fileId) {
			// File doesn't exist yet (new file)
			affectedFiles.push({
				path: filePath,
				reason: "New file to be created",
				change_requirement: "test",
				direct_dependents_count: 0,
				indirect_dependents_count: 0,
			});
			continue;
		}

		// Query dependents with depth 2 to get indirect dependents
		const dependents = await queryDependents(
			supabase,
			fileId,
			2,
			true,
			userId,
		);

		// Add the file itself
		affectedFiles.push({
			path: filePath,
			reason: "Direct modification",
			change_requirement: "update",
			direct_dependents_count: dependents.direct.length,
			indirect_dependents_count: Object.values(dependents.indirect).reduce(
				(sum, arr) => sum + arr.length,
				0,
			),
		});

		// Add direct dependents
		for (const dependent of dependents.direct) {
			if (processedFiles.has(dependent)) continue;
			processedFiles.add(dependent);

			affectedFiles.push({
				path: dependent,
				reason: `Directly depends on ${filePath}`,
				change_requirement: "review",
				direct_dependents_count: 0,
				indirect_dependents_count: 0,
			});
		}

		// Add indirect dependents (limited to avoid explosion)
		const indirectDependents = Object.values(dependents.indirect).flat();
		for (const dependent of indirectDependents.slice(0, 20)) {
			// Limit to 20
			if (processedFiles.has(dependent)) continue;
			processedFiles.add(dependent);

			affectedFiles.push({
				path: dependent,
				reason: `Indirectly depends on ${filePath}`,
				change_requirement: "review",
				direct_dependents_count: 0,
				indirect_dependents_count: 0,
			});
		}
	}

	return affectedFiles;
}

/**
 * Calculate test scope for affected files
 */
async function calculateTestScope(
	supabase: SupabaseClient,
	affectedFiles: AffectedFile[],
	repositoryId: string,
	userId: string,
): Promise<TestScope> {
	const testFiles: string[] = [];
	const recommendedTestFiles: string[] = [];

	// Find test files for affected files
	for (const file of affectedFiles) {
		// Check if file itself is a test
		if (isTestFile(file.path)) {
			testFiles.push(file.path);
			continue;
		}

		// Look for corresponding test files
		const potentialTestFiles = generateTestFilePaths(file.path);

		for (const testPath of potentialTestFiles) {
			const fileId = await resolveFilePath(
				supabase,
				testPath,
				repositoryId,
				userId,
			);

			if (fileId && !testFiles.includes(testPath)) {
				testFiles.push(testPath);
			} else if (!testFiles.includes(testPath) && !recommendedTestFiles.includes(testPath)) {
				recommendedTestFiles.push(testPath);
			}
		}
	}

	// Calculate coverage impact
	const testFileCount = testFiles.length;
	const affectedFileCount = affectedFiles.filter(
		(f) => !isTestFile(f.path),
	).length;
	const coverageRatio =
		affectedFileCount > 0 ? testFileCount / affectedFileCount : 0;

	let coverageImpact: string;
	if (coverageRatio >= 0.8) {
		coverageImpact = "Good test coverage - most affected files have tests";
	} else if (coverageRatio >= 0.5) {
		coverageImpact = "Moderate test coverage - some affected files lack tests";
	} else {
		coverageImpact = "Low test coverage - many affected files lack tests. Consider adding tests.";
	}

	return {
		test_files: testFiles,
		recommended_test_files: recommendedTestFiles,
		coverage_impact: coverageImpact,
	};
}

/**
 * Check if a file is a test file
 */
function isTestFile(path: string): boolean {
	return path.includes(".test.") || path.includes(".spec.") || path.includes("/tests/") || path.includes("/__tests__/");
}

/**
 * Generate potential test file paths for a source file
 */
function generateTestFilePaths(sourcePath: string): string[] {
	const paths: string[] = [];

	// Replace .ts with .test.ts or .spec.ts
	const withoutExt = sourcePath.replace(/\.(ts|tsx|js|jsx)$/, "");
	paths.push(`${withoutExt}.test.ts`);
	paths.push(`${withoutExt}.spec.ts`);
	paths.push(`${withoutExt}.test.tsx`);
	paths.push(`${withoutExt}.spec.tsx`);

	// Check in tests directory
	const fileName = sourcePath.split("/").pop();
	if (fileName) {
		const fileNameWithoutExt = fileName.replace(/\.(ts|tsx|js|jsx)$/, "");
		paths.push(`tests/${fileNameWithoutExt}.test.ts`);
		paths.push(`__tests__/${fileNameWithoutExt}.test.ts`);
	}

	return paths;
}

/**
 * Calculate risk level based on impact breadth and breaking changes
 */
function calculateRiskLevel(
	affectedFiles: AffectedFile[],
	breakingChanges: boolean,
	testScope: TestScope,
): "low" | "medium" | "high" {
	const totalAffected = affectedFiles.length;
	const testCoverageRatio = affectedFiles.filter((f) => !isTestFile(f.path)).length > 0
		? testScope.test_files.length / affectedFiles.filter((f) => !isTestFile(f.path)).length
		: 1;

	// High risk conditions
	if (breakingChanges || totalAffected > 50 || testCoverageRatio < 0.3) {
		return "high";
	}

	// Medium risk conditions
	if (totalAffected > 10 || testCoverageRatio < 0.6) {
		return "medium";
	}

	// Low risk
	return "low";
}

/**
 * Detect architectural patterns and generate warnings
 */
async function detectArchitecturalPatterns(
	supabase: SupabaseClient,
	request: ChangeImpactRequest,
	filePaths: string[],
	repositoryId: string,
): Promise<string[]> {
	const warnings: string[] = [];

	// Check for database migrations
	const hasMigrations = filePaths.some(
		(path) =>
			path.includes("migration") || path.includes("db/") || path.includes("database/"),
	);
	if (hasMigrations) {
		warnings.push(
			"Database migration detected - ensure migration sync between app/src/db/migrations and app/supabase/migrations",
		);
	}

	// Check for auth changes
	const hasAuthChanges = filePaths.some(
		(path) => path.includes("auth") || path.includes("middleware"),
	);
	if (hasAuthChanges) {
		warnings.push(
			"Authentication changes detected - verify rate limiting and RLS policies are updated",
		);
	}

	// Check for API changes
	const hasApiChanges = filePaths.some(
		(path) => path.includes("api/") || path.includes("routes"),
	);
	if (hasApiChanges) {
		warnings.push(
			"API changes detected - update API documentation and consider versioning if breaking",
		);
	}

	// Check for schema changes
	const hasSchemaChanges = filePaths.some(
		(path) => path.includes("schema") || path.includes("types"),
	);
	if (hasSchemaChanges && request.change_type === "refactor") {
		warnings.push(
			"Schema/type changes detected - verify all consumers are updated to avoid runtime errors",
		);
	}

	// Check for breaking changes
	if (request.breaking_changes) {
		warnings.push(
			"Breaking changes detected - ensure proper deprecation notices and migration guides are provided",
		);
	}

	return warnings;
}

/**
 * Detect conflicts with open PRs
 */
async function detectConflicts(
	supabase: SupabaseClient,
	repositoryId: string,
	filePaths: string[],
): Promise<ConflictInfo[]> {
	const conflicts: ConflictInfo[] = [];

	// Get repository metadata for GitHub integration
	const { data: repo } = await supabase
		.from("repositories")
		.select("full_name")
		.eq("id", repositoryId)
		.maybeSingle();

	if (!repo || !repo.full_name) {
		return conflicts;
	}

	// Parse owner and repo name
	const [owner, repoName] = repo.full_name.split("/");
	if (!owner || !repoName) {
		return conflicts;
	}

	// Use GitHub client to detect conflicts
	const githubClient = getGitHubClient();
	const prConflicts = await githubClient.detectFileConflicts(
		owner,
		repoName,
		filePaths,
	);

	conflicts.push(...prConflicts);

	return conflicts;
}

/**
 * Generate deployment impact estimate
 */
function generateDeploymentImpact(
	request: ChangeImpactRequest,
	affectedFiles: AffectedFile[],
	riskLevel: "low" | "medium" | "high",
): string {
	const components: string[] = [];

	// Impact based on change type
	if (request.change_type === "feature") {
		components.push("New feature deployment");
	} else if (request.change_type === "refactor") {
		components.push("Refactoring deployment (no user-facing changes expected)");
	} else if (request.change_type === "fix") {
		components.push("Bug fix deployment");
	} else {
		components.push("Maintenance deployment");
	}

	// Impact based on affected files
	if (affectedFiles.length > 50) {
		components.push("Large-scale changes affecting 50+ files");
	} else if (affectedFiles.length > 10) {
		components.push("Medium-scale changes affecting 10+ files");
	} else {
		components.push("Small-scale changes affecting <10 files");
	}

	// Risk level impact
	if (riskLevel === "high") {
		components.push("HIGH RISK - recommend staging deployment and gradual rollout");
	} else if (riskLevel === "medium") {
		components.push("MEDIUM RISK - recommend testing in staging before production");
	} else {
		components.push("LOW RISK - safe for direct production deployment");
	}

	return components.join(". ");
}

/**
 * Generate summary of impact analysis
 */
function generateSummary(
	request: ChangeImpactRequest,
	affectedFiles: AffectedFile[],
	testScope: TestScope,
	riskLevel: "low" | "medium" | "high",
	conflicts: ConflictInfo[],
): string {
	const parts: string[] = [];

	parts.push(
		`Change type: ${request.change_type}. ${affectedFiles.length} files affected (including dependents).`,
	);

	parts.push(
		`Test scope: ${testScope.test_files.length} test files identified. ${testScope.coverage_impact}`,
	);

	parts.push(`Risk level: ${riskLevel.toUpperCase()}.`);

	if (conflicts.length > 0) {
		parts.push(
			`${conflicts.length} potential conflicts detected with open PRs.`,
		);
	}

	if (request.breaking_changes) {
		parts.push("WARNING: Breaking changes included.");
	}

	return parts.join(" ");
}
