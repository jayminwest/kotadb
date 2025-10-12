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
        print("Usage: python3 validate-worktree-setup.py <worktree-name>", file=sys.stderr)
        sys.exit(1)

    worktree_name = sys.argv[1]
    project_root = Path(__file__).parent.parent.parent.parent
    worktree_path = project_root / "trees" / worktree_name

    print(f"=== Worktree Validation: {worktree_name} ===\n")

    # Check 1: Worktree exists
    print("1. Checking worktree existence...")
    if worktree_path.exists():
        print(f"   ✅ Worktree exists at: {worktree_path}")
    else:
        print(f"   ❌ Worktree not found at: {worktree_path}")
        print("\nAvailable worktrees:")
        returncode, stdout, _ = run_command(["git", "worktree", "list"])
        if returncode == 0:
            print(stdout)
        sys.exit(1)

    # Check 2: CWD matches worktree
    print("\n2. Checking working directory...")
    returncode, stdout, _ = run_command(["pwd"], cwd=worktree_path)
    if returncode == 0:
        print(f"   ✅ CWD: {stdout}")
    else:
        print(f"   ❌ Failed to determine CWD")

    # Check 3: Git status
    print("\n3. Checking git status...")
    returncode, stdout, _ = run_command(["git", "status", "--porcelain"], cwd=worktree_path)
    if returncode == 0:
        if stdout:
            print(f"   Changes detected:\n{stdout}")
        else:
            print("   ✅ Clean worktree (no changes)")
    else:
        print(f"   ❌ Git status failed")

    # Check 4: Test file creation and tracking
    print("\n4. Testing file creation and git tracking...")
    test_file = worktree_path / "test-validation.txt"
    test_file.write_text("validation test")
    print(f"   Created test file: test-validation.txt")

    # Check if git detects the file
    returncode, stdout, _ = run_command(["git", "status", "--porcelain"], cwd=worktree_path)
    if "test-validation.txt" in stdout:
        print("   ✅ Git detects new file")
    else:
        print("   ❌ Git does not detect new file")

    # Try to stage the file
    returncode, stdout, stderr = run_command(["git", "add", "test-validation.txt"], cwd=worktree_path)
    if returncode == 0:
        print("   ✅ File staged successfully")
    else:
        print(f"   ❌ Failed to stage file: {stderr}")

    # Verify file is in index
    returncode, stdout, stderr = run_command(
        ["git", "ls-files", "--error-unmatch", "test-validation.txt"], cwd=worktree_path
    )
    if returncode == 0:
        print("   ✅ File tracked in git index")
    else:
        print(f"   ❌ File not in git index: {stderr}")

    # Cleanup test file
    returncode, _, _ = run_command(["git", "restore", "--staged", "test-validation.txt"], cwd=worktree_path)
    test_file.unlink()
    print("   🧹 Test file cleaned up")

    # Check 5: Branch information
    print("\n5. Checking branch information...")
    returncode, stdout, _ = run_command(["git", "branch", "--show-current"], cwd=worktree_path)
    if returncode == 0:
        print(f"   ✅ Current branch: {stdout}")
    else:
        print("   ❌ Failed to get branch information")

    print("\n=== Validation Complete ===")


if __name__ == "__main__":
    main()
