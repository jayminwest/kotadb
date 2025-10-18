"""Test suite for ADW commit message validation.

These tests verify validation logic catches malformed commit messages observed in
historical bad commits (PR #90) while avoiding false positives.
"""

from adws.adw_modules.workflow_ops import validate_commit_message


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
