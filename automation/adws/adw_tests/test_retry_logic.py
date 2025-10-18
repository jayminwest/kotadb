"""Tests for agent retry logic."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from adws.adw_modules.agent import (
    AgentPromptRequest,
    AgentPromptResponse,
    RetryCode,
    prompt_claude_code_with_retry,
)


@pytest.fixture
def sample_request():
    """Create a sample prompt request for testing."""
    return AgentPromptRequest(
        prompt="Test prompt",
        adw_id="test_adw_123",
        agent_name="test_agent",
        model="sonnet",
        dangerously_skip_permissions=True,
        output_file="/tmp/test_output.jsonl",
    )


def test_retry_code_enum_values():
    """Verify RetryCode enum has expected values."""
    assert RetryCode.CLAUDE_CODE_ERROR == "claude_code_error"
    assert RetryCode.TIMEOUT_ERROR == "timeout_error"
    assert RetryCode.EXECUTION_ERROR == "execution_error"
    assert RetryCode.ERROR_DURING_EXECUTION == "error_during_execution"
    assert RetryCode.NONE == "none"


def test_retry_on_transient_error_succeeds_eventually(sample_request):
    """Test that transient errors trigger retries and eventually succeed."""
    responses = [
        # First attempt: transient error
        AgentPromptResponse(
            output="Network error",
            success=False,
            session_id=None,
            retry_code=RetryCode.TIMEOUT_ERROR,
        ),
        # Second attempt: success
        AgentPromptResponse(
            output="Success",
            success=True,
            session_id="session123",
            retry_code=RetryCode.NONE,
        ),
    ]

    with patch("adws.adw_modules.agent.prompt_claude_code", side_effect=responses):
        with patch("time.sleep"):  # Speed up test by skipping actual sleep
            result = prompt_claude_code_with_retry(sample_request, max_retries=3)

    assert result.success is True
    assert result.output == "Success"
    assert result.retry_code == RetryCode.NONE


def test_retry_max_retries_exhausted(sample_request):
    """Test that max retries are respected and final error is returned."""
    error_response = AgentPromptResponse(
        output="Persistent error",
        success=False,
        session_id=None,
        retry_code=RetryCode.CLAUDE_CODE_ERROR,
    )

    with patch("adws.adw_modules.agent.prompt_claude_code", return_value=error_response):
        with patch("time.sleep"):  # Speed up test
            result = prompt_claude_code_with_retry(sample_request, max_retries=2)

    assert result.success is False
    assert result.output == "Persistent error"
    assert result.retry_code == RetryCode.CLAUDE_CODE_ERROR


def test_no_retry_on_success(sample_request):
    """Test that successful responses return immediately without retries."""
    success_response = AgentPromptResponse(
        output="Success",
        success=True,
        session_id="session123",
        retry_code=RetryCode.NONE,
    )

    with patch("adws.adw_modules.agent.prompt_claude_code", return_value=success_response) as mock_prompt:
        result = prompt_claude_code_with_retry(sample_request, max_retries=3)

    # Should only call once (no retries)
    assert mock_prompt.call_count == 1
    assert result.success is True


def test_custom_retry_delays(sample_request):
    """Test that custom retry delays are respected."""
    error_response = AgentPromptResponse(
        output="Error",
        success=False,
        session_id=None,
        retry_code=RetryCode.EXECUTION_ERROR,
    )

    custom_delays = [2, 4, 6]

    with patch("adws.adw_modules.agent.prompt_claude_code", return_value=error_response):
        with patch("time.sleep") as mock_sleep:
            prompt_claude_code_with_retry(sample_request, max_retries=3, retry_delays=custom_delays)

    # Verify sleep was called with correct delays
    assert mock_sleep.call_count == 3  # max_retries
    mock_sleep.assert_any_call(2)
    mock_sleep.assert_any_call(4)
    mock_sleep.assert_any_call(6)


def test_retry_on_all_retryable_error_types(sample_request):
    """Test that all retryable error types trigger retries."""
    retryable_codes = [
        RetryCode.CLAUDE_CODE_ERROR,
        RetryCode.TIMEOUT_ERROR,
        RetryCode.EXECUTION_ERROR,
        RetryCode.ERROR_DURING_EXECUTION,
    ]

    for retry_code in retryable_codes:
        responses = [
            AgentPromptResponse(
                output="Error",
                success=False,
                session_id=None,
                retry_code=retry_code,
            ),
            AgentPromptResponse(
                output="Success",
                success=True,
                session_id="session123",
                retry_code=RetryCode.NONE,
            ),
        ]

        with patch("adws.adw_modules.agent.prompt_claude_code", side_effect=responses):
            with patch("time.sleep"):
                result = prompt_claude_code_with_retry(sample_request, max_retries=3)

        assert result.success is True, f"Failed for retry_code: {retry_code}"


def test_exponential_backoff_default_delays(sample_request):
    """Test that default retry delays follow exponential pattern (1s, 3s, 5s)."""
    error_response = AgentPromptResponse(
        output="Error",
        success=False,
        session_id=None,
        retry_code=RetryCode.TIMEOUT_ERROR,
    )

    with patch("adws.adw_modules.agent.prompt_claude_code", return_value=error_response):
        with patch("time.sleep") as mock_sleep:
            prompt_claude_code_with_retry(sample_request, max_retries=3)

    # Verify default delays: [1, 3, 5]
    assert mock_sleep.call_count == 3
    calls = [call[0][0] for call in mock_sleep.call_args_list]
    assert calls == [1, 3, 5]
