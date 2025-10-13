#!/usr/bin/env python3
"""Diagnostic tool to validate worktree setup and file tracking.

Usage:
    python3 automation/adws/scripts/validate-worktree-setup.py <worktree-name>
"""

import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], cwd: Path | None = None) -> tuple[int, str, str]:
    """Run a shell command and return (returncode, stdout, stderr)."""
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def main() -> None:
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python3 validate-worktree-setup.py <worktree-name>" + "\n")
        sys.exit(1)

    worktree_name = sys.argv[1]
    project_root = Path(__file__).parent.parent.parent.parent
    worktree_path = project_root / "trees" / worktree_name

    sys.stdout.write(f"=== Worktree Validation: {worktree_name} ===\n\n")

    # Check 1: Worktree exists
    sys.stdout.write("1. Checking worktree existence..." + "\n")
    if worktree_path.exists():
        sys.stdout.write(f"   ✅ Worktree exists at: {worktree_path}" + "\n")
    else:
        sys.stdout.write(f"   ❌ Worktree not found at: {worktree_path}" + "\n")
        sys.stdout.write("\nAvailable worktrees:" + "\n")
        returncode, stdout, _ = run_command(["git", "worktree", "list"])
        if returncode == 0:
            sys.stdout.write(stdout + "\n")
        sys.exit(1)

    # Check 2: CWD matches worktree
    sys.stdout.write("\n2. Checking working directory..." + "\n")
    returncode, stdout, _ = run_command(["pwd"], cwd=worktree_path)
    if returncode == 0:
        sys.stdout.write(f"   ✅ CWD: {stdout}" + "\n")
    else:
        sys.stdout.write(f"   ❌ Failed to determine CWD\n")

    # Check 3: Git status
    sys.stdout.write("\n3. Checking git status..." + "\n")
    returncode, stdout, _ = run_command(["git", "status", "--porcelain"], cwd=worktree_path)
    if returncode == 0:
        if stdout:
            sys.stdout.write(f"   Changes detected:\n{stdout}" + "\n")
        else:
            sys.stdout.write("   ✅ Clean worktree (no changes)\n")
    else:
        sys.stdout.write(f"   ❌ Git status failed\n")

    # Check 4: Test file creation and tracking
    sys.stdout.write("\n4. Testing file creation and git tracking..." + "\n")
    test_file = worktree_path / "test-validation.txt"
    test_file.write_text("validation test")
    sys.stdout.write(f"   Created test file: test-validation.txt\n")

    # Check if git detects the file
    returncode, stdout, _ = run_command(["git", "status", "--porcelain"], cwd=worktree_path)
    if "test-validation.txt" in stdout:
        sys.stdout.write("   ✅ Git detects new file" + "\n")
    else:
        sys.stdout.write("   ❌ Git does not detect new file\n")

    # Try to stage the file
    returncode, stdout, stderr = run_command(["git", "add", "test-validation.txt"], cwd=worktree_path)
    if returncode == 0:
        sys.stdout.write("   ✅ File staged successfully" + "\n")
    else:
        sys.stdout.write(f"   ❌ Failed to stage file: {stderr}\n")

    # Verify file is in index
    returncode, stdout, stderr = run_command(
        ["git", "ls-files", "--error-unmatch", "test-validation.txt"], cwd=worktree_path
    )
    if returncode == 0:
        sys.stdout.write("   ✅ File tracked in git index" + "\n")
    else:
        sys.stdout.write(f"   ❌ File not in git index: {stderr}\n")

    # Cleanup test file
    returncode, _, _ = run_command(["git", "restore", "--staged", "test-validation.txt"], cwd=worktree_path)
    test_file.unlink()
    sys.stdout.write("   🧹 Test file cleaned up\n")

    # Check 5: Branch information
    sys.stdout.write("\n5. Checking branch information..." + "\n")
    returncode, stdout, _ = run_command(["git", "branch", "--show-current"], cwd=worktree_path)
    if returncode == 0:
        sys.stdout.write(f"   ✅ Current branch: {stdout}" + "\n")
    else:
        sys.stdout.write("   ❌ Failed to get branch information" + "\n")

    sys.stdout.write("\n=== Validation Complete ===" + "\n")


if __name__ == "__main__":
    main()
