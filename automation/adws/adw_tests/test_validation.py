"""Test suite for ADW output validation functions.

These tests verify validation logic catches malformed outputs observed in
historical bad commits (PR #90) while avoiding false positives.
"""

import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from adws.adw_modules.validation import (
    validate_commit_message,
    validate_pr_description,
    verify_staged_files,
)


class TestValidateCommitMessage:
    """Test commit message validation against Conventional Commits format."""

    def test_valid_feat_commit(self):
        """Valid feature commit passes validation."""
        message = "feat: add user authentication"
        is_valid, error = validate_commit_message(message)
        assert is_valid is True
        assert error is None

    def test_valid_fix_commit(self):
        """Valid bug fix commit passes validation."""
        message = "fix: resolve login redirect issue"
        is_valid, error = validate_commit_message(message)
        assert is_valid is True
        assert error is None

    def test_valid_chore_commit(self):
        """Valid chore commit passes validation."""
        message = "chore: add output validation for ADW workflows"
        is_valid, error = validate_commit_message(message)
        assert is_valid is True
        assert error is None

    def test_valid_commit_with_scope(self):
        """Valid commit with scope passes validation."""
        message = "feat(auth): implement JWT token refresh"
        is_valid, error = validate_commit_message(message)
        assert is_valid is True
        assert error is None

    def test_valid_commit_with_body(self):
        """Valid commit with body text passes validation."""
        message = """chore: add output validation for ADW workflows

This commit introduces validation functions to prevent malformed
commit messages and PR descriptions from entering git history."""
        is_valid, error = validate_commit_message(message)
        assert is_valid is True
        assert error is None

    def test_invalid_meta_commentary_based_on(self):
        """Commit with 'based on' meta-commentary fails validation."""
        message = "Based on the changes, the commit should add validation"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "meta-commentary" in error
        assert "based on" in error.lower()

    def test_invalid_meta_commentary_here_is(self):
        """Commit with 'here is' meta-commentary fails validation."""
        message = "Here is a commit message for the validation work"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "meta-commentary" in error
        assert "here is" in error.lower()

    def test_invalid_meta_commentary_the_commit_should(self):
        """Commit with 'the commit should' meta-commentary fails validation."""
        message = "The commit should describe the addition of validation"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "meta-commentary" in error
        assert "the commit should" in error.lower()

    def test_invalid_meta_commentary_i_can_see(self):
        """Commit with 'i can see' meta-commentary fails validation."""
        message = "I can see from the git status that files were added"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "meta-commentary" in error
        assert "i can see" in error.lower()

    def test_invalid_meta_commentary_looking_at(self):
        """Commit with 'looking at' meta-commentary fails validation."""
        message = "Looking at the changes, this adds validation logic"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "meta-commentary" in error
        assert "looking at" in error.lower()

    def test_invalid_missing_type(self):
        """Commit without type prefix fails validation."""
        message = "add validation for commit messages"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "Conventional Commits format" in error

    def test_invalid_wrong_type(self):
        """Commit with invalid type fails validation."""
        message = "added: validation for commit messages"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "Conventional Commits format" in error

    def test_invalid_missing_colon(self):
        """Commit missing colon separator fails validation."""
        message = "feat add validation"
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "Conventional Commits format" in error

    def test_invalid_empty_message(self):
        """Empty commit message fails validation."""
        message = ""
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "empty" in error.lower()

    def test_invalid_whitespace_only(self):
        """Whitespace-only commit message fails validation."""
        message = "   \n  \t  "
        is_valid, error = validate_commit_message(message)
        assert is_valid is False
        assert "empty" in error.lower()

    def test_all_valid_types(self):
        """All conventional commit types are accepted."""
        valid_types = ["feat", "fix", "chore", "docs", "test", "refactor", "perf", "ci", "build", "style"]
        for commit_type in valid_types:
            message = f"{commit_type}: test message"
            is_valid, error = validate_commit_message(message)
            assert is_valid is True, f"Type '{commit_type}' should be valid but got error: {error}"


class TestValidatePRDescription:
    """Test PR description validation for required sections."""

    def test_valid_description_with_validation_evidence(self):
        """Valid PR with validation evidence section passes."""
        description = """## Summary
Added validation for ADW outputs.

## Validation Evidence
- All tests passed
- Linting successful"""
        is_valid, error = validate_pr_description(description)
        assert is_valid is True
        assert error is None

    def test_valid_description_with_validation_header(self):
        """Valid PR with ### Validation header passes."""
        description = """### Validation
Commands run:
- lint (passed)
- typecheck (passed)"""
        is_valid, error = validate_pr_description(description)
        assert is_valid is True
        assert error is None

    def test_valid_description_with_case_insensitive_validation(self):
        """Validation section is case-insensitive."""
        description = """## VALIDATION EVIDENCE
All checks passed"""
        is_valid, error = validate_pr_description(description)
        assert is_valid is True
        assert error is None

    def test_invalid_missing_validation_section(self):
        """PR without validation section fails."""
        description = """## Summary
Just some changes.

## Changes
- Updated module A
- Fixed bug in module B"""
        is_valid, error = validate_pr_description(description)
        assert is_valid is False
        assert "validation evidence" in error.lower()

    def test_invalid_empty_description(self):
        """Empty PR description fails."""
        description = ""
        is_valid, error = validate_pr_description(description)
        assert is_valid is False
        assert "empty" in error.lower()

    def test_valid_with_file_count_matching(self):
        """PR with matching file count passes."""
        description = """## Validation Evidence
All tests passed

4 files changed, 120 insertions(+), 15 deletions(-)"""
        staged_files = ["file1.py", "file2.py", "file3.py", "file4.py"]
        is_valid, error = validate_pr_description(description, staged_files)
        assert is_valid is True
        assert error is None

    def test_invalid_with_file_count_mismatch(self):
        """PR with mismatched file count fails."""
        description = """## Validation Evidence
All tests passed

5 files changed, 120 insertions(+), 15 deletions(-)"""
        staged_files = ["file1.py", "file2.py", "file3.py"]  # Only 3 files
        is_valid, error = validate_pr_description(description, staged_files)
        assert is_valid is False
        assert "file count mismatch" in error.lower()
        assert "5 files" in error
        assert "3 files" in error

    def test_valid_without_file_count_no_staged_files(self):
        """PR without staged files list doesn't check file count."""
        description = """## Validation Evidence
All tests passed

100 files changed"""
        is_valid, error = validate_pr_description(description, staged_files=None)
        assert is_valid is True
        assert error is None


class TestVerifyStagedFiles:
    """Test verification of staged files against plan mentions."""

    def test_valid_all_mentioned_files_staged(self):
        """All files mentioned in plan are staged."""
        with TemporaryDirectory() as tmpdir:
            # Create a git repository
            subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmpdir, check=True, capture_output=True)

            # Create plan file
            plan_path = Path(tmpdir) / "docs" / "specs"
            plan_path.mkdir(parents=True, exist_ok=True)
            plan_file = plan_path / "plan.md"
            plan_file.write_text("""# Plan
- Create `validation.py` module
- Update `workflow_ops.py` file
- Add tests in `test_validation.py`
""")

            # Create mentioned files and stage them
            (Path(tmpdir) / "validation.py").write_text("# validation")
            (Path(tmpdir) / "workflow_ops.py").write_text("# workflow")
            (Path(tmpdir) / "test_validation.py").write_text("# tests")

            subprocess.run(["git", "add", "."], cwd=tmpdir, check=True, capture_output=True)

            # Verify
            is_valid, error = verify_staged_files("docs/specs/plan.md", tmpdir)
            assert is_valid is True
            assert error is None

    def test_invalid_mentioned_file_not_staged(self):
        """File mentioned in plan but not staged fails validation."""
        with TemporaryDirectory() as tmpdir:
            # Create a git repository
            subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmpdir, check=True, capture_output=True)

            # Create plan file
            plan_path = Path(tmpdir) / "docs" / "specs"
            plan_path.mkdir(parents=True, exist_ok=True)
            plan_file = plan_path / "plan.md"
            plan_file.write_text("""# Plan
- Create `validation.py` module
- Update `workflow_ops.py` file
""")

            # Only stage one file
            (Path(tmpdir) / "validation.py").write_text("# validation")
            subprocess.run(["git", "add", "validation.py"], cwd=tmpdir, check=True, capture_output=True)

            # workflow_ops.py exists but is not staged
            (Path(tmpdir) / "workflow_ops.py").write_text("# workflow")

            # Verify - should fail
            is_valid, error = verify_staged_files("docs/specs/plan.md", tmpdir)
            assert is_valid is False
            assert "not staged" in error
            assert "workflow_ops.py" in error

    def test_valid_no_files_mentioned(self):
        """Plan with no file mentions passes validation."""
        with TemporaryDirectory() as tmpdir:
            # Create a git repository
            subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)

            # Create plan file with no file references
            plan_path = Path(tmpdir) / "docs" / "specs"
            plan_path.mkdir(parents=True, exist_ok=True)
            plan_file = plan_path / "plan.md"
            plan_file.write_text("""# Plan
This is a conceptual plan with no file references.
Just ideas and strategies.
""")

            # Verify - should pass (no files to check)
            is_valid, error = verify_staged_files("docs/specs/plan.md", tmpdir)
            assert is_valid is True
            assert error is None

    def test_invalid_plan_file_not_found(self):
        """Non-existent plan file fails validation."""
        with TemporaryDirectory() as tmpdir:
            subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)

            is_valid, error = verify_staged_files("missing/plan.md", tmpdir)
            assert is_valid is False
            assert "not found" in error.lower()

    def test_valid_supports_multiple_extensions(self):
        """Validation detects various file extensions."""
        with TemporaryDirectory() as tmpdir:
            # Create a git repository
            subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Test User"], cwd=tmpdir, check=True, capture_output=True)

            # Create plan file mentioning different file types
            plan_path = Path(tmpdir) / "plan.md"
            plan_path.write_text("""# Plan
- Python: `module.py`
- TypeScript: `component.ts` and `types.tsx`
- JavaScript: `script.js`
- Config: `config.json` and `settings.yaml`
- Docs: `README.md`
""")

            # Create and stage all files
            files = ["module.py", "component.ts", "types.tsx", "script.js", "config.json", "settings.yaml", "README.md"]
            for filename in files:
                (Path(tmpdir) / filename).write_text(f"# {filename}")

            subprocess.run(["git", "add", "."], cwd=tmpdir, check=True, capture_output=True)

            # Verify
            is_valid, error = verify_staged_files("plan.md", tmpdir)
            assert is_valid is True
            assert error is None
