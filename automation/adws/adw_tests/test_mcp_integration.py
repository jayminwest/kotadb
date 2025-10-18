"""Integration tests for MCP server connectivity and agent configuration.

Tests verify that ADW agents can connect to the local KotaDB MCP server
and that the health check correctly validates server availability.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest


@pytest.fixture
def mcp_env_vars(monkeypatch):
    """Set up MCP environment variables for testing."""
    monkeypatch.setenv("KOTA_MCP_API_KEY", "kota_team_test123_abc456def789")
    monkeypatch.setenv("MCP_SERVER_URL", "http://localhost:3000/mcp")


def test_setup_mcp_config_creates_file(mcp_env_vars):
    """Test that setup_mcp_config creates a valid .mcp.json file."""
    from adws.adw_modules.agent import setup_mcp_config

    with tempfile.TemporaryDirectory() as tmpdir:
        cwd = str(tmpdir)

        # Create MCP configuration
        setup_mcp_config(cwd)

        # Verify .mcp.json was created
        config_path = Path(cwd) / ".mcp.json"
        assert config_path.exists()

        # Verify config content
        with open(config_path, encoding="utf-8") as f:
            config = json.load(f)

        assert "mcpServers" in config
        assert "kotadb" in config["mcpServers"]

        kotadb_config = config["mcpServers"]["kotadb"]
        assert kotadb_config["type"] == "http"
        assert kotadb_config["url"] == "http://localhost:3000/mcp"
        assert "Authorization" in kotadb_config["headers"]
        assert kotadb_config["headers"]["Authorization"] == "Bearer kota_team_test123_abc456def789"


def test_setup_mcp_config_skips_when_no_api_key(monkeypatch):
    """Test that setup_mcp_config skips creation if API key is not set."""
    from adws.adw_modules.agent import setup_mcp_config

    # Ensure API key is not set
    monkeypatch.delenv("KOTA_MCP_API_KEY", raising=False)

    with tempfile.TemporaryDirectory() as tmpdir:
        cwd = str(tmpdir)

        # Create MCP configuration
        setup_mcp_config(cwd)

        # Verify .mcp.json was NOT created
        config_path = Path(cwd) / ".mcp.json"
        assert not config_path.exists()


def test_setup_mcp_config_uses_default_url(monkeypatch):
    """Test that setup_mcp_config uses default URL if not specified."""
    from adws.adw_modules.agent import setup_mcp_config

    monkeypatch.setenv("KOTA_MCP_API_KEY", "kota_team_test123_abc456def789")
    monkeypatch.delenv("MCP_SERVER_URL", raising=False)

    with tempfile.TemporaryDirectory() as tmpdir:
        cwd = str(tmpdir)

        # Create MCP configuration
        setup_mcp_config(cwd)

        # Verify config uses default URL
        config_path = Path(cwd) / ".mcp.json"
        with open(config_path, encoding="utf-8") as f:
            config = json.load(f)

        assert config["mcpServers"]["kotadb"]["url"] == "http://localhost:3000/mcp"


def test_check_mcp_server_success(mcp_env_vars):
    """Test health check with successful MCP server response."""
    from adws.health_check import check_mcp_server

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "result": {
            "tools": [
                {"name": "search_code"},
                {"name": "index_repository"},
                {"name": "list_recent_files"},
            ]
        },
        "id": 1,
    }

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.post.return_value = mock_response

        result = check_mcp_server()

        assert result.success is True
        assert result.error is None
        assert result.details["tool_count"] == 3
        assert "search_code" in result.details["tools"]
        assert "index_repository" in result.details["tools"]
        assert "list_recent_files" in result.details["tools"]


def test_check_mcp_server_missing_api_key(monkeypatch):
    """Test health check fails when API key is not configured."""
    from adws.health_check import check_mcp_server

    monkeypatch.delenv("KOTA_MCP_API_KEY", raising=False)

    result = check_mcp_server()

    assert result.success is False
    assert "KOTA_MCP_API_KEY" in result.error
    assert result.details["configured"] is False


def test_check_mcp_server_connection_refused(mcp_env_vars):
    """Test health check handles connection refused errors."""
    from adws.health_check import check_mcp_server

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.post.side_effect = httpx.ConnectError("Connection refused")

        result = check_mcp_server()

        assert result.success is False
        assert "Cannot connect to MCP server" in result.error
        assert result.details["error_type"] == "connection_refused"


def test_check_mcp_server_timeout(mcp_env_vars):
    """Test health check handles timeout errors."""
    from adws.health_check import check_mcp_server

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.post.side_effect = httpx.TimeoutException("Request timeout")

        result = check_mcp_server()

        assert result.success is False
        assert "timed out" in result.error
        assert result.details["error_type"] == "timeout"


def test_check_mcp_server_authentication_failed(mcp_env_vars):
    """Test health check detects authentication failures."""
    from adws.health_check import check_mcp_server

    mock_response = MagicMock()
    mock_response.status_code = 401

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.post.return_value = mock_response

        result = check_mcp_server()

        assert result.success is False
        assert "authentication failed" in result.error
        assert result.details["status_code"] == 401


def test_check_mcp_server_jsonrpc_error(mcp_env_vars):
    """Test health check handles JSON-RPC error responses."""
    from adws.health_check import check_mcp_server

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "error": {"code": -32601, "message": "Method not found"},
        "id": 1,
    }

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.post.return_value = mock_response

        result = check_mcp_server()

        assert result.success is False
        assert "Method not found" in result.error
        assert result.details["error_code"] == -32601


def test_check_mcp_server_no_tools(mcp_env_vars):
    """Test health check warns when no tools are available."""
    from adws.health_check import check_mcp_server

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"jsonrpc": "2.0", "result": {"tools": []}, "id": 1}

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_client.return_value.__enter__.return_value.post.return_value = mock_response

        result = check_mcp_server()

        assert result.success is False  # No tools means failure
        assert result.warning == "No tools available from MCP server"
        assert result.details["tool_count"] == 0


def test_check_mcp_server_custom_url(monkeypatch):
    """Test health check uses custom MCP_SERVER_URL."""
    from adws.health_check import check_mcp_server

    monkeypatch.setenv("KOTA_MCP_API_KEY", "kota_team_test123_abc456def789")
    monkeypatch.setenv("MCP_SERVER_URL", "http://localhost:4000/mcp")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "jsonrpc": "2.0",
        "result": {"tools": [{"name": "search_code"}]},
        "id": 1,
    }

    with patch("adws.health_check.httpx.Client") as mock_client:
        mock_instance = mock_client.return_value.__enter__.return_value
        mock_instance.post.return_value = mock_response

        result = check_mcp_server()

        # Verify correct URL was called
        mock_instance.post.assert_called_once()
        call_args = mock_instance.post.call_args
        assert call_args[0][0] == "http://localhost:4000/mcp"
        assert result.success is True
