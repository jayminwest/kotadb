/**
 * Build output validator for ADW orchestrator
 * Runs type-check, tests, and convention scans on modified files
 */

/** Result of a full validation pass */
export interface ValidationResult {
  passed: boolean;
  typeCheck: { passed: boolean; errors: string[] };
  tests: { passed: boolean; errors: string[]; skipped: boolean };
  conventions: { passed: boolean; violations: string[] };
  /** Human-readable summary */
  summary: string;
}

/** Options for validateBuildOutput */
export interface ValidateOptions {
  /** Path to run tsc/tests in */
  projectRoot: string;
  /** List of modified file paths */
  filesModified: string[];
  /** Skip test execution */
  skipTests?: boolean;
  /** Skip tsc --noEmit */
  skipTypeCheck?: boolean;
}

/** Timeout for type-check (60 seconds) */
const TYPE_CHECK_TIMEOUT_MS = 60_000;

/** Timeout for test execution (120 seconds) */
const TEST_TIMEOUT_MS = 120_000;

/** Maximum depth for relative imports before suggesting path aliases */
const MAX_RELATIVE_DEPTH = 3;

/** Patterns that violate the no-console convention */
const CONSOLE_PATTERNS = [
  /\bconsole\.log\b/,
  /\bconsole\.warn\b/,
  /\bconsole\.error\b/,
  /\bconsole\.info\b/,
];

/**
 * Run a subprocess with a timeout, returning stdout, stderr, and exit code
 */
async function runCommand(
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  clearTimeout(timer);
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode, timedOut };
}

/**
 * Run type-check via bunx tsc --noEmit
 */
async function runTypeCheck(
  projectRoot: string,
): Promise<{ passed: boolean; errors: string[] }> {
  const { stdout, stderr, exitCode, timedOut } = await runCommand(
    ["bunx", "tsc", "--noEmit"],
    projectRoot,
    TYPE_CHECK_TIMEOUT_MS,
  );

  if (timedOut) {
    return { passed: false, errors: ["Type-check timed out after 60s"] };
  }

  if (exitCode === 0) {
    return { passed: true, errors: [] };
  }

  // Parse tsc error output - errors appear on stdout for tsc
  const output = stdout || stderr;
  const errorLines = output
    .split("\n")
    .filter((line) => line.includes("error TS"))
    .map((line) => line.trim());

  // If we couldn't parse specific errors, include the raw output (truncated)
  if (errorLines.length === 0 && output.length > 0) {
    const truncated =
      output.length > 1000 ? output.substring(0, 1000) + "..." : output;
    return { passed: false, errors: [truncated] };
  }

  return { passed: false, errors: errorLines };
}

/**
 * Run tests via bun test
 */
async function runTests(
  projectRoot: string,
): Promise<{ passed: boolean; errors: string[]; skipped: boolean }> {
  // Check if any test files exist
  const findProc = Bun.spawn(
    ["find", projectRoot, "-name", "*.test.ts", "-o", "-name", "*.spec.ts"],
    { cwd: projectRoot, stdout: "pipe", stderr: "pipe" },
  );
  const findOutput = await new Response(findProc.stdout).text();
  await findProc.exited;

  if (findOutput.trim().length === 0) {
    return { passed: true, errors: [], skipped: true };
  }

  const { stdout, stderr, exitCode, timedOut } = await runCommand(
    ["bun", "test"],
    projectRoot,
    TEST_TIMEOUT_MS,
  );

  if (timedOut) {
    return { passed: false, errors: ["Tests timed out after 120s"], skipped: false };
  }

  if (exitCode === 0) {
    return { passed: true, errors: [], skipped: false };
  }

  // Parse test failure output
  const output = stdout || stderr;
  const failureLines = output
    .split("\n")
    .filter(
      (line) =>
        line.includes("FAIL") ||
        line.includes("error:") ||
        line.includes("Error:") ||
        line.includes("expected"),
    )
    .map((line) => line.trim())
    .slice(0, 20); // Cap at 20 lines

  if (failureLines.length === 0 && output.length > 0) {
    const truncated =
      output.length > 1000 ? output.substring(0, 1000) + "..." : output;
    return { passed: false, errors: [truncated], skipped: false };
  }

  return { passed: false, errors: failureLines, skipped: false };
}

/**
 * Scan modified files for convention violations
 */
async function scanConventions(
  filesModified: string[],
): Promise<{ passed: boolean; violations: string[] }> {
  const violations: string[] = [];

  for (const filePath of filesModified) {
    if (!filePath.endsWith(".ts")) continue;

    let content: string;
    try {
      const file = Bun.file(filePath);
      content = await file.text();
    } catch {
      // File might not exist (deleted), skip it
      continue;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // Check for console.* usage
      for (const pattern of CONSOLE_PATTERNS) {
        if (pattern.test(line)) {
          // Skip if it's in a comment
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
          violations.push(
            `${filePath}:${lineNum}: console.* usage (use process.stdout/stderr.write)`,
          );
        }
      }

      // Check for deep relative imports in app/src/ files
      if (filePath.includes("app/src/")) {
        const importMatch = line.match(
          /(?:from\s+['"]|import\s+['"]|require\s*\(\s*['"])(\.\.\/(?:\.\.\/){2,}[^'"]+)['"]/,
        );
        if (importMatch) {
          violations.push(
            `${filePath}:${lineNum}: deep relative import "${importMatch[1]}" (use path aliases)`,
          );
        }
      }
    }
  }

  return { passed: violations.length === 0, violations };
}

/**
 * Build a human-readable summary from validation results
 */
function buildSummary(result: Omit<ValidationResult, "summary">): string {
  const parts: string[] = [];

  if (result.typeCheck.passed) {
    parts.push("Type-check passed");
  } else {
    parts.push(`Type-check failed (${result.typeCheck.errors.length} error(s))`);
  }

  if (result.tests.skipped) {
    parts.push("Tests skipped (no test files)");
  } else if (result.tests.passed) {
    parts.push("Tests passed");
  } else {
    parts.push(`Tests failed (${result.tests.errors.length} error(s))`);
  }

  if (result.conventions.passed) {
    parts.push("Conventions clean");
  } else {
    parts.push(
      `Convention violations (${result.conventions.violations.length})`,
    );
  }

  const status = result.passed ? "PASSED" : "FAILED";
  return `Validation ${status}: ${parts.join("; ")}`;
}

/**
 * Validate build output by running type-check, tests, and convention scans
 *
 * @param options - Validation configuration
 * @returns Aggregated validation result with human-readable summary
 */
export async function validateBuildOutput(
  options: ValidateOptions,
): Promise<ValidationResult> {
  const { projectRoot, filesModified, skipTests, skipTypeCheck } = options;

  // Run type-check
  const typeCheck = skipTypeCheck
    ? { passed: true, errors: [] as string[] }
    : await runTypeCheck(projectRoot);

  // Run tests
  const tests = skipTests
    ? { passed: true, errors: [] as string[], skipped: true }
    : await runTests(projectRoot);

  // Run convention scan
  const conventions = await scanConventions(filesModified);

  // Type-check and tests must pass; conventions are advisory
  const passed = typeCheck.passed && tests.passed;

  const partial = { passed, typeCheck, tests, conventions };
  const summary = buildSummary(partial);

  return { ...partial, summary };
}

/**
 * Format validation errors into a concise string suitable for a build-fix prompt
 * Groups by category (type errors, test failures, convention violations)
 * Keeps output under ~500 tokens
 *
 * @param result - The validation result to format
 * @returns Formatted error string for prompt injection
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.passed && result.conventions.passed) {
    return "All checks passed. No errors to fix.";
  }

  const sections: string[] = [];

  // Type errors
  if (!result.typeCheck.passed && result.typeCheck.errors.length > 0) {
    const errors = result.typeCheck.errors.slice(0, 10);
    sections.push("## Type Errors");
    for (const err of errors) {
      sections.push(`- ${err}`);
    }
    if (result.typeCheck.errors.length > 10) {
      sections.push(
        `- ... and ${result.typeCheck.errors.length - 10} more type error(s)`,
      );
    }
  }

  // Test failures
  if (!result.tests.passed && !result.tests.skipped && result.tests.errors.length > 0) {
    const errors = result.tests.errors.slice(0, 10);
    sections.push("## Test Failures");
    for (const err of errors) {
      sections.push(`- ${err}`);
    }
    if (result.tests.errors.length > 10) {
      sections.push(
        `- ... and ${result.tests.errors.length - 10} more test failure(s)`,
      );
    }
  }

  // Convention violations
  if (!result.conventions.passed && result.conventions.violations.length > 0) {
    const violations = result.conventions.violations.slice(0, 10);
    sections.push("## Convention Violations");
    for (const v of violations) {
      sections.push(`- ${v}`);
    }
    if (result.conventions.violations.length > 10) {
      sections.push(
        `- ... and ${result.conventions.violations.length - 10} more violation(s)`,
      );
    }
  }

  return sections.join("\n");
}
