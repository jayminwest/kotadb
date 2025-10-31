"""Diagnostic test to validate enhanced logging in worktree git operations.

This test simulates the workflow described in issue #83 where plan files
are created by agents and need to be staged and committed in worktrees.
"""
from __future__ import annotations
import sys
import subprocess
import tempfile
from pathlib import Path
import pytest
from adws.adw_modules.git_ops import _run_git, cleanup_worktree, commit_all, create_worktree, has_changes, stage_paths, verify_file_in_index

@pytest.fixture
def temp_git_repo(monkeypatch):
    """Create a temporary git repository for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir)
        subprocess.run(['git', 'init'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(['git', 'config', 'user.name', 'Test User'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(['git', 'config', 'user.email', 'test@example.com'], cwd=repo_path, check=True, capture_output=True)
        (repo_path / 'README.md').write_text('# Test Repo\n')
        subprocess.run(['git', 'add', 'README.md'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(['git', 'commit', '-m', 'Initial commit'], cwd=repo_path, check=True, capture_output=True)
        subprocess.run(['git', 'checkout', '-b', 'develop'], cwd=repo_path, check=True, capture_output=True)
        import adws.adw_modules.git_ops as git_ops_module
        monkeypatch.setattr(git_ops_module, 'project_root', lambda: repo_path)
        yield repo_path

def test_diagnostic_worktree_plan_file_workflow(temp_git_repo, capsys):
    """Test the complete plan file workflow with diagnostic logging (simulating issue #83 scenario).

    This test validates:
    1. Worktree creation
    2. Plan file creation (simulating agent behavior)
    3. Git status detection
    4. File staging
    5. Commit operations
    6. Enhanced diagnostic logging output
    """
    worktree_name = 'diagnostic-test-83'
    sys.stdout.write('\n' + '=' * 80 + '\n')
    sys.stdout.write('DIAGNOSTIC TEST: Simulating issue #83 plan file workflow' + '\n')
    sys.stdout.write('=' * 80 + '\n')
    sys.stdout.write('\n[Step 1] Creating worktree...' + '\n')
    worktree_path = create_worktree(worktree_name, 'develop')
    sys.stdout.write(f'✓ Worktree created at: {worktree_path}' + '\n')
    sys.stdout.write('\n[Step 2] Checking initial git status...' + '\n')
    assert has_changes(cwd=worktree_path) is False
    sys.stdout.write('✓ Initial state clean (no changes)' + '\n')
    sys.stdout.write('\n[Step 3] Simulating agent creating plan file...' + '\n')
    plan_file_path = worktree_path / 'docs' / 'specs' / 'test-plan.md'
    plan_file_path.parent.mkdir(parents=True, exist_ok=True)
    plan_file_path.write_text('# Test Plan\n\nThis is a diagnostic test plan.\n')
    sys.stdout.write(f'✓ Plan file created: {plan_file_path}' + '\n')
    sys.stdout.write('\n[Step 4] DIAGNOSTIC: Checking git status after file creation...' + '\n')
    status_after_creation = _run_git(['status', '--porcelain'], cwd=worktree_path, check=False)
    sys.stdout.write('git status --porcelain output:' + '\n')
    sys.stdout.write(f'{(status_after_creation.stdout if status_after_creation.stdout else '(empty)')}' + '\n')
    has_changes_result = has_changes(cwd=worktree_path)
    sys.stdout.write(f'has_changes() result: {has_changes_result}' + '\n')
    assert has_changes_result is True, 'has_changes() should return True after creating file'
    sys.stdout.write('✓ Git detected changes' + '\n')
    sys.stdout.write('\n[Step 5] DIAGNOSTIC: Checking file tracking before staging...' + '\n')
    ls_files_before = _run_git(['ls-files', 'docs/specs/test-plan.md'], cwd=worktree_path, check=False)
    sys.stdout.write(f'git ls-files output: {(ls_files_before.stdout if ls_files_before.stdout else '(file not tracked)')}' + '\n')
    tracked_before, track_error = verify_file_in_index('docs/specs/test-plan.md', cwd=worktree_path)
    sys.stdout.write(f'verify_file_in_index() result: {tracked_before}, error: {track_error}' + '\n')
    assert tracked_before is False, 'File should not be tracked before staging'
    sys.stdout.write('✓ File not yet tracked (as expected)' + '\n')
    sys.stdout.write('\n[Step 6] Staging plan file...' + '\n')
    stage_paths(['docs/specs/test-plan.md'], cwd=worktree_path)
    sys.stdout.write('✓ File staged' + '\n')
    sys.stdout.write('\n[Step 7] DIAGNOSTIC: Checking file tracking after staging...' + '\n')
    ls_files_after = _run_git(['ls-files', 'docs/specs/test-plan.md'], cwd=worktree_path, check=False)
    sys.stdout.write(f'git ls-files output: {(ls_files_after.stdout if ls_files_after.stdout else '(empty)')}' + '\n')
    tracked_after, _ = verify_file_in_index('docs/specs/test-plan.md', cwd=worktree_path)
    sys.stdout.write(f'verify_file_in_index() result: {tracked_after}' + '\n')
    assert tracked_after is True, 'File should be tracked after staging'
    sys.stdout.write('✓ File tracked after staging' + '\n')
    sys.stdout.write('\n[Step 8] DIAGNOSTIC: Comprehensive git state before commit...' + '\n')
    status_before_commit = _run_git(['status', '--porcelain'], cwd=worktree_path, check=False)
    sys.stdout.write('git status --porcelain:' + '\n')
    sys.stdout.write(f'{(status_before_commit.stdout if status_before_commit.stdout else '(empty)')}' + '\n')
    has_changes_staged = has_changes(cwd=worktree_path)
    sys.stdout.write(f'has_changes() result: {has_changes_staged}' + '\n')
    diff_index = _run_git(['diff-index', '--cached', 'HEAD'], cwd=worktree_path, check=False)
    sys.stdout.write('git diff-index --cached HEAD:' + '\n')
    sys.stdout.write(f'{(diff_index.stdout if diff_index.stdout else '(empty)')}' + '\n')
    ls_files_all = _run_git(['ls-files'], cwd=worktree_path, check=False)
    sys.stdout.write('git ls-files (all tracked):' + '\n')
    sys.stdout.write(f'{(ls_files_all.stdout if ls_files_all.stdout else '(empty)')}' + '\n')
    sys.stdout.write('\n[Step 9] Committing changes...' + '\n')
    committed, commit_error = commit_all('chore: add diagnostic test plan', cwd=worktree_path)
    if not committed:
        sys.stdout.write(f'✗ Commit failed: {commit_error}' + '\n')
        sys.stdout.write('\nDIAGNOSTIC: Additional debug info on commit failure' + '\n')
        sys.stdout.write(f'  Commit error message: {commit_error}' + '\n')
        sys.stdout.write(f'  Worktree path exists: {worktree_path.exists()}' + '\n')
        sys.stdout.write(f'  Plan file exists: {plan_file_path.exists()}' + '\n')
        final_status = _run_git(['status'], cwd=worktree_path, check=False)
        sys.stdout.write(f'  git status (full):\n{final_status.stdout}' + '\n')
        raise AssertionError(f'Commit should succeed. Error: {commit_error}')
    sys.stdout.write('✓ Commit succeeded' + '\n')
    sys.stdout.write('\n[Step 10] Verifying final state...' + '\n')
    assert has_changes(cwd=worktree_path) is False, 'has_changes() should return False after commit'
    sys.stdout.write('✓ Working tree clean after commit' + '\n')
    tracked_final, _ = verify_file_in_index('docs/specs/test-plan.md', cwd=worktree_path)
    assert tracked_final is True, 'File should remain tracked after commit'
    sys.stdout.write('✓ File still tracked after commit' + '\n')
    sys.stdout.write('\n[Step 11] Cleaning up test worktree...' + '\n')
    cleanup_success = cleanup_worktree(worktree_name)
    assert cleanup_success is True
    sys.stdout.write('✓ Worktree cleaned up' + '\n')
    sys.stdout.write('\n' + '=' * 80 + '\n')
    sys.stdout.write('DIAGNOSTIC TEST COMPLETED SUCCESSFULLY' + '\n')
    sys.stdout.write('=' * 80 + '\n')
    captured = capsys.readouterr()
    assert 'DIAGNOSTIC TEST COMPLETED SUCCESSFULLY' in captured.out
    assert 'has_changes() result: True' in captured.out
    assert 'File tracked after staging' in captured.out
if __name__ == '__main__':
    pytest.main([__file__, '-v', '-s'])
