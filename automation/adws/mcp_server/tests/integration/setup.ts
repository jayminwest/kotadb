/**
 * Integration test setup utilities
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";

/**
 * Create a temporary git repository for testing
 */
export function createTestGitRepo(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "mcp-test-git-"));

  // Initialize git repo
  execSync("git init", { cwd: tempDir });
  execSync('git config user.name "Test User"', { cwd: tempDir });
  execSync('git config user.email "test@example.com"', { cwd: tempDir });

  // Create initial commit
  writeFileSync(join(tempDir, "README.md"), "# Test Repo\n");
  execSync("git add .", { cwd: tempDir });
  execSync('git commit -m "Initial commit"', { cwd: tempDir });

  return tempDir;
}

/**
 * Create a temporary ADW state directory for testing
 */
export function createTestStateDir(adwId: string): string {
  const stateDir = join(tmpdir(), "mcp-test-agents", adwId);
  mkdirSync(stateDir, { recursive: true });

  // Create a sample state file
  const stateData = {
    adw_id: adwId,
    issue_number: "999",
    current_phase: "plan",
    status: "in_progress",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    plan_file: "docs/specs/test-999-plan.md",
    worktree_path: `trees/test-${adwId}`,
  };

  writeFileSync(
    join(stateDir, "adw_state.json"),
    JSON.stringify(stateData, null, 2)
  );

  return stateDir;
}

/**
 * Cleanup temporary directory
 */
export function cleanup(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup ${path}:`, error);
  }
}

/**
 * Create a test worktree with invalid TypeScript for validation tests
 */
export function createTestWorktreeWithErrors(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "mcp-test-worktree-"));
  const appDir = join(tempDir, "app");
  const srcDir = join(appDir, "src");

  mkdirSync(srcDir, { recursive: true });

  // Create a TypeScript file with syntax errors
  writeFileSync(
    join(srcDir, "test.ts"),
    `
    // This has type errors
    const x: string = 123;
    function foo() {
      return bar(); // bar is not defined
    }
    `
  );

  // Create package.json
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({
      name: "test-app",
      scripts: {
        lint: "echo 'Linting...'",
        typecheck: "tsc --noEmit || exit 1",
      },
    })
  );

  // Create tsconfig.json
  writeFileSync(
    join(appDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        target: "ES2020",
        module: "ESNext",
      },
      include: ["src"],
    })
  );

  return tempDir;
}

/**
 * Create a test worktree with valid code
 */
export function createTestWorktreeValid(): string {
  const tempDir = mkdtempSync(join(tmpdir(), "mcp-test-worktree-"));
  const appDir = join(tempDir, "app");
  const srcDir = join(appDir, "src");

  mkdirSync(srcDir, { recursive: true });

  // Create a valid TypeScript file
  writeFileSync(
    join(srcDir, "test.ts"),
    `
    export function add(a: number, b: number): number {
      return a + b;
    }
    `
  );

  // Create package.json
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({
      name: "test-app",
      scripts: {
        lint: "echo 'Linting passed'",
        typecheck: "echo 'Type check passed'",
      },
    })
  );

  return tempDir;
}
