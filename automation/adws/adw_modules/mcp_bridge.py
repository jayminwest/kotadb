"""Python bridge module for MCP server tool invocations.

This module provides a Python interface for the TypeScript MCP server to interact with
ADW state, git operations, validation, and phase execution.
"""
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
try:
    from .state import ADWState, StateNotFoundError, agents_root
    from .utils import project_root
    from .git_ops import create_worktree as git_create_worktree_impl
    from .git_ops import cleanup_worktree as git_cleanup_worktree_impl
except ImportError:
    _module_dir = Path(__file__).parent
    sys.path.insert(0, str(_module_dir))
    from state import ADWState, StateNotFoundError, agents_root
    from utils import project_root
    from git_ops import create_worktree as git_create_worktree_impl
    from git_ops import cleanup_worktree as git_cleanup_worktree_impl

def get_adw_state(adw_id: str) -> Dict[str, Any]:
    """Load ADW state for a given adw_id.

    Args:
        adw_id: The ADW workflow identifier

    Returns:
        State dictionary with all fields

    Raises:
        StateNotFoundError: If state file doesn't exist
    """
    try:
        state = ADWState.load(adw_id)
        return state.to_dict()
    except StateNotFoundError as e:
        return {'error': str(e), 'success': False}

def list_adw_workflows(adw_id_filter: Optional[str]=None, status_filter: Optional[str]=None, limit: int=50) -> Dict[str, Any]:
    """List all ADW workflows with optional filtering.

    Args:
        adw_id_filter: Optional ADW ID prefix filter
        status_filter: Optional status filter (e.g., completed, failed)
        limit: Maximum number of results to return

    Returns:
        Dictionary with workflows list, total count, and filtered count
    """
    agents_dir = agents_root()
    if not agents_dir.exists():
        return {'workflows': [], 'total': 0, 'filtered': 0, 'limit': limit}
    all_dirs = list(agents_dir.iterdir())
    workflows = []
    for agent_dir in sorted(all_dirs, reverse=True):
        if not agent_dir.is_dir():
            continue
        if adw_id_filter and (not agent_dir.name.startswith(adw_id_filter)):
            continue
        state_file = agent_dir / 'adw_state.json'
        if not state_file.exists():
            continue
        try:
            state = ADWState.load(agent_dir.name)
            state_dict = state.to_dict()
            if status_filter:
                workflow_status = state_dict.get('extra', {}).get('status', 'unknown')
                if workflow_status != status_filter:
                    continue
            workflow_summary = {'adw_id': agent_dir.name, 'issue_number': state_dict.get('issue_number'), 'issue_class': state_dict.get('issue_class'), 'branch_name': state_dict.get('branch_name'), 'worktree_path': state_dict.get('worktree_path'), 'worktree_created_at': state_dict.get('worktree_created_at'), 'pr_created': state_dict.get('pr_created'), 'status': state_dict.get('extra', {}).get('status'), 'triggered_by': state_dict.get('extra', {}).get('triggered_by')}
            workflows.append(workflow_summary)
            if len(workflows) >= limit:
                break
        except Exception:
            continue
    return {'workflows': workflows, 'total': len(all_dirs), 'filtered': len(workflows), 'limit': limit}

def execute_git_commit(adw_id: str, message: str, files: Optional[List[str]]=None) -> Dict[str, Any]:
    """Execute git commit in the ADW worktree.

    Args:
        adw_id: The ADW workflow identifier
        message: Commit message
        files: Optional list of files to stage (default: stage all)

    Returns:
        Dictionary with commit hash, message, and files changed
    """
    try:
        state = ADWState.load(adw_id)
        worktree_path = state.get('worktree_path')
        if not worktree_path:
            return {'success': False, 'error': 'No worktree_path found in state'}
        worktree = Path(worktree_path)
        if not worktree.exists():
            return {'success': False, 'error': f'Worktree path does not exist: {worktree_path}'}
        if files:
            for file in files:
                subprocess.run(['git', 'add', file], cwd=worktree, check=True, capture_output=True, text=True)
        else:
            subprocess.run(['git', 'add', '.'], cwd=worktree, check=True, capture_output=True, text=True)
        result = subprocess.run(['git', 'commit', '-m', message], cwd=worktree, check=True, capture_output=True, text=True)
        hash_result = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=worktree, check=True, capture_output=True, text=True)
        commit_hash = hash_result.stdout.strip()
        stat_result = subprocess.run(['git', 'show', '--stat', '--oneline', commit_hash], cwd=worktree, check=True, capture_output=True, text=True)
        files_changed = len([line for line in stat_result.stdout.split('\n') if '|' in line])
        return {'success': True, 'commit_hash': commit_hash, 'message': message, 'files_changed': files_changed}
    except StateNotFoundError as e:
        return {'success': False, 'error': f'State not found: {e}'}
    except subprocess.CalledProcessError as e:
        return {'success': False, 'error': f'Git command failed: {e.stderr}'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def execute_bun_validate(cwd: Optional[str]=None) -> Dict[str, Any]:
    """Execute bun validation commands (lint + typecheck).

    Args:
        cwd: Optional working directory (default: project root)

    Returns:
        Dictionary with validation result and any errors
    """
    work_dir = Path(cwd) if cwd else project_root()
    errors = []
    warnings = []
    try:
        subprocess.run(['bun', 'run', 'lint'], cwd=work_dir / 'app', check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        errors.append(f'Lint failed: {e.stderr}')
    try:
        subprocess.run(['bunx', 'tsc', '--noEmit'], cwd=work_dir / 'app', check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        errors.append(f'Typecheck failed: {e.stderr}')
    return {'valid': len(errors) == 0, 'errors': errors if errors else None, 'warnings': warnings if warnings else None}

def execute_bun_validate_migrations(adw_id: str, cwd: Optional[str]=None) -> Dict[str, Any]:
    """Execute migration validation to detect drift.

    Args:
        adw_id: The ADW workflow identifier
        cwd: Optional working directory (default: app/)

    Returns:
        Dictionary with drift detection result and details
    """
    work_dir = Path(cwd) if cwd else project_root() / 'app'
    try:
        result = subprocess.run(['bun', 'run', 'test:validate-migrations'], cwd=work_dir, capture_output=True, text=True)
        drift_detected = result.returncode != 0
        try:
            state = ADWState.load(adw_id)
            state.update(migration_drift_detected=drift_detected)
        except StateNotFoundError:
            pass
        if drift_detected:
            return {'drift_detected': True, 'details': result.stderr.split('\n') if result.stderr else [], 'files_out_of_sync': []}
        return {'drift_detected': False}
    except subprocess.CalledProcessError as e:
        return {'drift_detected': True, 'error': f'Validation command failed: {e.stderr}'}
    except Exception as e:
        return {'drift_detected': False, 'error': str(e)}

def create_worktree(worktree_name: str, base_branch: str, base_path: str='automation/trees') -> Dict[str, Any]:
    """Create a git worktree.

    Args:
        worktree_name: Name for the worktree directory and branch
        base_branch: Base branch to branch from
        base_path: Base directory for worktrees (default: 'automation/trees')

    Returns:
        Dictionary with worktree creation result
    """
    try:
        worktree_path = git_create_worktree_impl(worktree_name, base_branch, base_path)
        return {'success': True, 'worktree_path': str(worktree_path), 'worktree_name': worktree_name, 'base_branch': base_branch}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def cleanup_worktree(worktree_name: str, base_path: str='automation/trees', delete_branch: bool=True) -> Dict[str, Any]:
    """Clean up a git worktree and optionally delete its branch.

    Args:
        worktree_name: Name of the worktree to remove
        base_path: Base directory for worktrees (default: 'automation/trees')
        delete_branch: Whether to delete the associated branch

    Returns:
        Dictionary with cleanup result
    """
    try:
        success = git_cleanup_worktree_impl(worktree_name, base_path, delete_branch)
        return {'success': success, 'worktree_name': worktree_name, 'branch_deleted': delete_branch}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def execute_command(command: str, args: List[str], adw_id: Optional[str]=None) -> Dict[str, Any]:
    """Execute a slash command via the orchestrator.

    Args:
        command: Slash command to execute (e.g., /classify_issue)
        args: Command arguments
        adw_id: Optional ADW workflow ID for context

    Returns:
        Dictionary with command execution result
    """
    return {'success': False, 'error': 'Command execution not yet implemented', 'command': command, 'args': args}

def main() -> None:
    """CLI entry point for testing bridge functions."""
    if len(sys.argv) < 2:
        sys.stdout.write('Usage: python -m adw_modules.mcp_bridge <command> [args...]' + '\n')
        sys.stdout.write('Commands: get_state, list_workflows, git_commit, validate, validate_migrations, create_worktree, cleanup_worktree, execute_command' + '\n')
        sys.exit(1)
    command = sys.argv[1]
    if command == 'get_state':
        adw_id = sys.argv[2] if len(sys.argv) > 2 else None
        if not adw_id:
            sys.stdout.write(json.dumps({'error': 'adw_id required'}) + '\n')
            sys.exit(1)
        result = get_adw_state(adw_id)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'list_workflows':
        adw_id_filter = None
        status_filter = None
        limit = 50
        i = 2
        while i < len(sys.argv):
            if sys.argv[i] == '--adw-id' and i + 1 < len(sys.argv):
                adw_id_filter = sys.argv[i + 1]
                i += 2
            elif sys.argv[i] == '--status' and i + 1 < len(sys.argv):
                status_filter = sys.argv[i + 1]
                i += 2
            elif sys.argv[i] == '--limit' and i + 1 < len(sys.argv):
                limit = int(sys.argv[i + 1])
                i += 2
            else:
                i += 1
        result = list_adw_workflows(adw_id_filter, status_filter, limit)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'git_commit':
        if len(sys.argv) < 4:
            sys.stdout.write(json.dumps({'error': 'Usage: git_commit <adw_id> <message> [files...]'}) + '\n')
            sys.exit(1)
        adw_id = sys.argv[2]
        message = sys.argv[3]
        files = sys.argv[4:] if len(sys.argv) > 4 else None
        result = execute_git_commit(adw_id, message, files)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'validate':
        cwd = sys.argv[2] if len(sys.argv) > 2 else None
        result = execute_bun_validate(cwd)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'validate_migrations':
        if len(sys.argv) < 3:
            sys.stdout.write(json.dumps({'error': 'adw_id required'}) + '\n')
            sys.exit(1)
        adw_id = sys.argv[2]
        cwd = sys.argv[3] if len(sys.argv) > 3 else None
        result = execute_bun_validate_migrations(adw_id, cwd)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'create_worktree':
        if len(sys.argv) < 4:
            sys.stdout.write(json.dumps({'error': 'Usage: create_worktree <worktree_name> <base_branch> [base_path]'}) + '\n')
            sys.exit(1)
        worktree_name = sys.argv[2]
        base_branch = sys.argv[3]
        base_path = sys.argv[4] if len(sys.argv) > 4 else 'automation/trees'
        result = create_worktree(worktree_name, base_branch, base_path)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'cleanup_worktree':
        if len(sys.argv) < 3:
            sys.stdout.write(json.dumps({'error': 'Usage: cleanup_worktree <worktree_name> [base_path] [delete_branch]'}) + '\n')
            sys.exit(1)
        worktree_name = sys.argv[2]
        base_path = sys.argv[3] if len(sys.argv) > 3 else 'automation/trees'
        delete_branch = sys.argv[4].lower() == 'true' if len(sys.argv) > 4 else True
        result = cleanup_worktree(worktree_name, base_path, delete_branch)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    elif command == 'execute_command':
        if len(sys.argv) < 3:
            sys.stdout.write(json.dumps({'error': 'Usage: execute_command <slash_command> [args...] [--adw-id <id>]'}) + '\n')
            sys.exit(1)
        slash_command = sys.argv[2]
        cmd_args = []
        adw_id = None
        i = 3
        while i < len(sys.argv):
            if sys.argv[i] == '--adw-id' and i + 1 < len(sys.argv):
                adw_id = sys.argv[i + 1]
                i += 2
            else:
                cmd_args.append(sys.argv[i])
                i += 1
        result = execute_command(slash_command, cmd_args, adw_id)
        sys.stdout.write(json.dumps(result, indent=2) + '\n')
    else:
        sys.stdout.write(json.dumps({'error': f'Unknown command: {command}'}) + '\n')
        sys.exit(1)
if __name__ == '__main__':
    main()
__all__ = ['get_adw_state', 'list_adw_workflows', 'execute_git_commit', 'execute_bun_validate', 'execute_bun_validate_migrations', 'create_worktree', 'cleanup_worktree', 'execute_command']
