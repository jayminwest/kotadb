/**
 * Impact analysis logic for analyze_change_impact MCP tool
 *
 * Local-only v2.0.0: Uses SQLite instead of Supabase
 *
 * Provides comprehensive change impact analysis including:
 * - Dependency aggregation (direct and indirect dependents)
 * - Test scope calculation
 * - Risk level scoring
 * - Architectural pattern detection
 */

import { queryDependents, resolveFilePath } from "@api/queries";
import { getGlobalDatabase } from "@db/sqlite/index.js";
import { createLogger } from "@logging/logger.js";
import type {
	AffectedFile,
	ChangeImpactRequest,
	ChangeImpactResponse,
	ConflictInfo,
	TestScope,
} from "@shared/types";
import { Sentry } from "../instrument.js";

const logger = createLogger({ module: "mcp-impact-analysis" });

/**
 * Analyze change impact for proposed modifications
 *
 * @param request - Change impact request
 * @param userId - User ID for context
 * @returns Impact analysis results
 */
export async function analyzeChangeImpact(
	request: ChangeImpactRequest,
	userId: string,
): Promise<ChangeImpactResponse> {
	try {
		logger.info("Starting change impact analysis", {
			change_type: request.change_type,
			user_id: userId,
			files_to_modify: request.files_to_modify?.length ?? 0,
			files_to_create: request.files_to_create?.length ?? 0,
			files_to_delete: request.files_to_delete?.length ?? 0,
		});

		// Resolve repository ID from SQLite
		const repositoryId = resolveRepositoryId(request.repository);

		if (!repositoryId) {
			logger.warn("Change impact analysis failed: no repository", {
				change_type: request.change_type,
				user_id: userId,
			});

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
		const lastIndexedAt = getLastIndexedTimestamp(repositoryId);

		// Aggregate all files to analyze
		const filesToAnalyze = [
			...(request.files_to_modify ?? []),
			...(request.files_to_create ?? []),
			...(request.files_to_delete ?? []),
		];

		// Aggregate dependency graph for affected files
		const affectedFiles = aggregateDependencyGraph(filesToAnalyze, repositoryId);

		// Calculate test scope
		const testScope = calculateTestScope(affectedFiles, repositoryId);

		// Calculate risk level
		const riskLevel = calculateRiskLevel(
			affectedFiles,
			request.breaking_changes ?? false,
			testScope,
		);

		// Detect architectural patterns and warnings
		const architecturalWarnings = detectArchitecturalPatterns(request, filesToAnalyze);

		// No PR conflict detection in local mode (no GitHub integration required)
		const conflicts: ConflictInfo[] = [];

		// Generate deployment impact estimate
		const deploymentImpact = generateDeploymentImpact(request, affectedFiles, riskLevel);

		// Generate summary
		const summary = generateSummary(request, affectedFiles, testScope, riskLevel, conflicts);

		logger.info("Change impact analysis completed", {
			change_type: request.change_type,
			user_id: userId,
			affected_files_count: affectedFiles.length,
			risk_level: riskLevel,
		});

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
	} catch (error) {
		logger.error(
			"Change impact analysis error",
			error instanceof Error ? error : new Error(String(error)),
			{
				change_type: request.change_type,
				user_id: userId,
			},
		);
		Sentry.captureException(error, {
			tags: { change_type: request.change_type, user_id: userId },
		});
		throw error;
	}
}

/**
 * Resolve repository ID from request or use first available repository
 */
function resolveRepositoryId(repositoryId: string | undefined): string | null {
	if (repositoryId) {
		return repositoryId;
	}

	// Get first repository from SQLite
	const db = getGlobalDatabase();
	const repo = db.queryOne<{ id: string }>(
		"SELECT id FROM repositories ORDER BY created_at DESC LIMIT 1",
		[],
	);

	return repo?.id ?? null;
}

/**
 * Get last indexed timestamp for repository
 */
function getLastIndexedTimestamp(repositoryId: string): string {
	const db = getGlobalDatabase();
	const result = db.queryOne<{ indexed_at: string }>(
		"SELECT indexed_at FROM indexed_files WHERE repository_id = ? ORDER BY indexed_at DESC LIMIT 1",
		[repositoryId],
	);

	return result?.indexed_at ?? new Date().toISOString();
}

/**
 * Aggregate dependency graph for affected files
 */
function aggregateDependencyGraph(filePaths: string[], repositoryId: string): AffectedFile[] {
	const affectedFiles: AffectedFile[] = [];
	const processedFiles = new Set<string>();

	// Process each file to analyze
	for (const filePath of filePaths) {
		if (processedFiles.has(filePath)) continue;
		processedFiles.add(filePath);

		// Resolve file ID using SQLite
		const fileId = resolveFilePath(filePath, repositoryId);

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
		const dependents = queryDependents(fileId, 2, true);

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
				reason: "Directly depends on " + filePath,
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
				reason: "Indirectly depends on " + filePath,
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
function calculateTestScope(affectedFiles: AffectedFile[], repositoryId: string): TestScope {
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
			const fileId = resolveFilePath(testPath, repositoryId);

			if (fileId && !testFiles.includes(testPath)) {
				testFiles.push(testPath);
			} else if (!testFiles.includes(testPath) && !recommendedTestFiles.includes(testPath)) {
				recommendedTestFiles.push(testPath);
			}
		}
	}

	// Calculate coverage impact
	const testFileCount = testFiles.length;
	const affectedFileCount = affectedFiles.filter((f) => !isTestFile(f.path)).length;
	const coverageRatio = affectedFileCount > 0 ? testFileCount / affectedFileCount : 0;

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
	return (
		path.includes(".test.") ||
		path.includes(".spec.") ||
		path.includes("/tests/") ||
		path.includes("/__tests__/")
	);
}

/**
 * Generate potential test file paths for a source file
 */
function generateTestFilePaths(sourcePath: string): string[] {
	const paths: string[] = [];

	// Replace .ts with .test.ts or .spec.ts
	const withoutExt = sourcePath.replace(/\.(ts|tsx|js|jsx)$/, "");
	paths.push(withoutExt + ".test.ts");
	paths.push(withoutExt + ".spec.ts");
	paths.push(withoutExt + ".test.tsx");
	paths.push(withoutExt + ".spec.tsx");

	// Check in tests directory
	const fileName = sourcePath.split("/").pop();
	if (fileName) {
		const fileNameWithoutExt = fileName.replace(/\.(ts|tsx|js|jsx)$/, "");
		paths.push("tests/" + fileNameWithoutExt + ".test.ts");
		paths.push("__tests__/" + fileNameWithoutExt + ".test.ts");
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
	const testCoverageRatio =
		affectedFiles.filter((f) => !isTestFile(f.path)).length > 0
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
function detectArchitecturalPatterns(request: ChangeImpactRequest, filePaths: string[]): string[] {
	const warnings: string[] = [];

	// Check for database migrations
	const hasMigrations = filePaths.some(
		(path) => path.includes("migration") || path.includes("db/") || path.includes("database/"),
	);
	if (hasMigrations) {
		warnings.push(
			"Database migration detected - verify SQLite schema changes in app/src/db/sqlite-schema.sql",
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
	const hasApiChanges = filePaths.some((path) => path.includes("api/") || path.includes("routes"));
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
		"Change type: " +
			request.change_type +
			". " +
			affectedFiles.length +
			" files affected (including dependents).",
	);

	parts.push(
		"Test scope: " +
			testScope.test_files.length +
			" test files identified. " +
			testScope.coverage_impact,
	);

	parts.push("Risk level: " + riskLevel.toUpperCase() + ".");

	if (conflicts.length > 0) {
		parts.push(conflicts.length + " potential conflicts detected with open PRs.");
	}

	if (request.breaking_changes) {
		parts.push("WARNING: Breaking changes included.");
	}

	return parts.join(" ");
}
