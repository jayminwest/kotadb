# MCP (Model Context Protocol) - Claude Code Documentation

**Source:** https://code.claude.com/docs/en/mcp.md
**Date:** 2025-12-05

## Overview

Claude Code integrates with external tools through the Model Context Protocol (MCP), an open-source standard enabling connections to hundreds of tools and data sources. MCP servers provide access to databases, APIs, and specialized tools.

## Capabilities

With MCP servers enabled, users can:
- Extract requirements from issue tracking systems and generate pull requests
- Examine error logs and usage analytics across platforms
- Query databases to retrieve specific information
- Incorporate design updates from collaborative design tools
- Streamline repetitive tasks through email and workflow automation

## Installation Methods

### HTTP Server (Recommended)

```bash
claude mcp add --transport http <name> <url>
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

HTTP represents the preferred approach for cloud-based integrations.

### SSE Server (Deprecated)

```bash
claude mcp add --transport sse <name> <url>
```

Server-Sent Events transport is no longer recommended; HTTP should be used instead.

### Local Stdio Server

```bash
claude mcp add --transport stdio <name> -- <command>
claude mcp add --transport stdio airtable --env AIRTABLE_API_KEY=KEY -- npx airtable-mcp-server
```

The `--` separator distinguishes Claude's flags from the server command.

## Configuration Scopes

**Local scope**: Private to you, stored in project path
**Project scope**: Shared team configuration in `.mcp.json`, checked into version control
**User scope**: Available across all projects in `~/.claude.json`

## Management Commands

```bash
claude mcp list          # Display all servers
claude mcp get <name>    # View specific server details
claude mcp remove <name> # Delete a server
/mcp                     # Check status within Claude Code
```

## Authentication

Remote servers requiring OAuth 2.0 authentication use the `/mcp` command within Claude Code for secure login. Tokens are stored safely and refreshed automatically.

## Advanced Features

**Resource references**: Use `@server:protocol://path` syntax to include MCP resources
**Slash commands**: MCP-provided prompts appear as `/mcp__servername__promptname`
**Output limits**: Configurable via `MAX_MCP_OUTPUT_TOKENS` environment variable (default 25,000)

## Enterprise Management

Administrators deploy `managed-mcp.json` to enforce standardized server access. Settings support allowlists/denylists by server name or exact command matching, with denylists taking absolute precedence.
