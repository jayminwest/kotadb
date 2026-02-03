---
title: Connect Claude Code to tools via MCP
source: https://code.claude.com/docs/en/mcp
date: 2026-01-30
---

# Model Context Protocol (MCP) in Claude Code

Claude Code integrates with external tools through the Model Context Protocol (MCP), an open-source standard enabling connections to hundreds of tools and data sources. MCP servers provide access to databases, APIs, monitoring systems, and specialized tools that extend Claude's capabilities beyond the built-in toolset.

## What You Can Do with MCP

With MCP servers enabled, Claude Code gains access to powerful external integrations:

| Capability | Example Use Cases |
|-----------|-------------------|
| **Error Monitoring** | Query Sentry for errors, analyze stack traces, track issue resolution |
| **Code Management** | Create PRs, review code, manage issues via GitHub |
| **Database Access** | Query PostgreSQL, analyze schemas, run SQL queries |
| **Issue Tracking** | Extract requirements from Jira/Linear, update ticket status |
| **Design Systems** | Pull design updates from Figma, sync component changes |
| **Analytics** | Examine error logs, usage metrics across platforms |
| **Automation** | Trigger workflows, send notifications, manage deployments |

## Popular MCP Servers

### Sentry

Monitor application errors and performance directly from Claude Code.

```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/sse
```

**Available Tools:**
- `get_sentry_issues` - Retrieve error issues from projects
- `get_sentry_issue_details` - Get detailed information about specific issues
- `get_sentry_event` - Fetch individual error events
- `search_sentry_errors` - Search across error messages

### GitHub

Access repositories, issues, pull requests, and code reviews.

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

**Available Tools:**
- `create_pull_request` - Create new pull requests
- `get_pull_request` - Retrieve PR details and status
- `list_issues` - List repository issues
- `create_issue` - Create new issues
- `get_file_contents` - Read files from repositories
- `search_code` - Search across codebases

### PostgreSQL

Query databases and analyze schemas directly.

```bash
claude mcp add --transport stdio postgres -- npx @anthropic/mcp-server-postgres postgresql://user:pass@host:5432/db
```

**Available Tools:**
- `query` - Execute SQL queries
- `list_tables` - List database tables
- `describe_table` - Get table schema information
- `list_schemas` - List database schemas

### Other Popular Servers

| Server | Transport | Command |
|--------|-----------|---------|
| **Notion** | HTTP | `claude mcp add --transport http notion https://mcp.notion.com/mcp` |
| **Slack** | HTTP | `claude mcp add --transport http slack https://mcp.slack.com/sse` |
| **Linear** | HTTP | `claude mcp add --transport http linear https://mcp.linear.app/sse` |
| **Airtable** | stdio | `claude mcp add --transport stdio airtable -- npx airtable-mcp-server` |
| **Puppeteer** | stdio | `claude mcp add --transport stdio puppeteer -- npx @anthropic/mcp-server-puppeteer` |
| **Filesystem** | stdio | `claude mcp add --transport stdio fs -- npx @anthropic/mcp-server-filesystem /path` |
| **Memory** | stdio | `claude mcp add --transport stdio memory -- npx @anthropic/mcp-server-memory` |

## Installing MCP Servers

### HTTP Transport (Recommended)

HTTP is the preferred transport for cloud-based integrations. It supports OAuth authentication, automatic reconnection, and efficient bidirectional communication.

```bash
claude mcp add --transport http <name> <url>
```

**Examples:**
```bash
# Add Notion MCP server
claude mcp add --transport http notion https://mcp.notion.com/mcp

# Add custom HTTP server with headers
claude mcp add --transport http custom https://api.example.com/mcp \
  --header "X-Custom-Header: value"
```

### SSE Transport (Deprecated)

Server-Sent Events transport is legacy and no longer recommended. Use HTTP transport instead.

```bash
claude mcp add --transport sse <name> <url>
```

### Stdio Transport

Stdio transport runs MCP servers as local processes. Use this for tools that need local execution or filesystem access.

```bash
claude mcp add --transport stdio <name> -- <command>
```

**The `--` separator is required** to distinguish Claude's flags from the server command arguments.

**Examples:**
```bash
# Add PostgreSQL server with connection string
claude mcp add --transport stdio postgres -- npx @anthropic/mcp-server-postgres \
  "postgresql://user:pass@localhost:5432/mydb"

# Add Airtable with environment variable
claude mcp add --transport stdio airtable \
  --env AIRTABLE_API_KEY=pat123abc \
  -- npx airtable-mcp-server

# Add filesystem server with allowed paths
claude mcp add --transport stdio files -- npx @anthropic/mcp-server-filesystem \
  /home/user/projects /home/user/documents

# Add custom server with multiple environment variables
claude mcp add --transport stdio custom \
  --env API_KEY=secret \
  --env DEBUG=true \
  -- node /path/to/my-mcp-server.js
```

### Installation Flags

| Flag | Description | Example |
|------|-------------|---------|
| `--transport` | Transport type (http, sse, stdio) | `--transport http` |
| `--env` | Set environment variable | `--env API_KEY=value` |
| `--header` | Add HTTP header (http/sse only) | `--header "Auth: Bearer token"` |
| `--scope` | Installation scope | `--scope project` |

## Managing MCP Servers

### List All Servers

```bash
claude mcp list
```

Output shows server name, transport, status, and scope:
```
┌──────────────┬───────────┬──────────┬─────────┐
│ Name         │ Transport │ Status   │ Scope   │
├──────────────┼───────────┼──────────┼─────────┤
│ github       │ http      │ connected│ user    │
│ sentry       │ http      │ connected│ project │
│ postgres     │ stdio     │ running  │ local   │
└──────────────┴───────────┴──────────┴─────────┘
```

### Get Server Details

```bash
claude mcp get <name>
```

Shows configuration, available tools, and connection status:
```
Server: github
Transport: http
URL: https://api.githubcopilot.com/mcp/
Scope: user
Status: connected

Available Tools:
  - create_pull_request
  - get_pull_request
  - list_issues
  - create_issue
  - search_code

Available Resources:
  - repo://owner/repo/contents
  - issues://owner/repo
```

### Remove a Server

```bash
claude mcp remove <name>
```

### Check Status in Claude Code

Use the `/mcp` command within Claude Code to:
- View all configured servers
- Check connection status
- Authenticate with OAuth servers
- Clear authentication tokens
- View available tools and prompts

## MCP Installation Scopes

MCP servers can be installed at three different scopes, determining their availability and storage location.

| Scope | Storage Location | Availability | Use Case |
|-------|-----------------|--------------|----------|
| **local** | `.mcp.json` (gitignored) | Current project only, private | Personal API keys, local dev servers |
| **project** | `.mcp.json` (committed) | Current project, shared via git | Team-standard integrations |
| **user** | `~/.claude.json` | All projects | Personal integrations across projects |

### Setting Scope

```bash
# Install for current project only (not shared)
claude mcp add --scope local --transport http sentry https://mcp.sentry.dev/sse

# Install for project (shared with team via git)
claude mcp add --scope project --transport http github https://api.github.com/mcp

# Install for all your projects
claude mcp add --scope user --transport http notion https://mcp.notion.com/mcp
```

### Scope Precedence

When the same server name exists in multiple scopes, precedence is:
1. **local** (highest priority)
2. **project**
3. **user** (lowest priority)

This allows project-specific overrides of user-level configurations.

## Environment Variable Expansion in .mcp.json

The `.mcp.json` file supports environment variable expansion, enabling secure credential management without hardcoding secrets.

### Syntax

```json
{
  "mcpServers": {
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "@anthropic/mcp-server-postgres",
        "postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:5432/${POSTGRES_DB}"
      ]
    }
  }
}
```

### Supported Patterns

| Pattern | Description |
|---------|-------------|
| `${VAR}` | Expands to value of VAR, error if not set |
| `${VAR:-default}` | Expands to value of VAR, or "default" if not set |
| `${VAR:?error msg}` | Expands to value of VAR, or shows error if not set |

### Complete .mcp.json Example

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/sse"
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "@anthropic/mcp-server-postgres",
        "postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
      ],
      "env": {
        "DEBUG": "${DEBUG:-false}"
      }
    },
    "custom-api": {
      "type": "stdio",
      "command": "node",
      "args": ["${HOME}/mcp-servers/custom-api/index.js"],
      "env": {
        "API_KEY": "${CUSTOM_API_KEY:?API key required}",
        "API_ENDPOINT": "${API_ENDPOINT:-https://api.example.com}"
      }
    }
  }
}
```

### Best Practices for Credentials

1. **Never commit secrets** - Use environment variables for API keys
2. **Use local scope** - Personal API keys should use `--scope local`
3. **Document required variables** - Add a `.env.example` file
4. **Use default values** - Provide sensible defaults where appropriate

## Practical Examples

### Sentry Monitoring Workflow

Query and analyze production errors directly in Claude Code.

**Setup:**
```bash
claude mcp add --transport http sentry https://mcp.sentry.dev/sse
```

**Usage:**
```
User: Check for any new errors in the API service today

Claude: I'll query Sentry for recent errors in the API service.

[Uses mcp__sentry__get_sentry_issues tool]

Found 3 new issues in the last 24 hours:

1. **NullPointerException in UserService.java:142** (12 events)
   - First seen: 2 hours ago
   - Affected users: 8
   - Stack trace shows issue in getUserProfile()

2. **TimeoutError in PaymentGateway** (5 events)
   - First seen: 6 hours ago
   - All from payment processing endpoint

3. **ValidationError in OrderController** (3 events)
   - First seen: 1 hour ago
   - Related to malformed order data

Would you like me to analyze any of these in detail?
```

### GitHub Code Review Workflow

Perform comprehensive code reviews using GitHub integration.

**Setup:**
```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/
```

**Usage:**
```
User: Review PR #142 for security issues

Claude: I'll fetch the pull request and analyze it for security concerns.

[Uses mcp__github__get_pull_request tool]
[Uses mcp__github__get_file_contents tool for changed files]

## Security Review for PR #142: "Add user authentication"

### Critical Issues Found:

1. **SQL Injection Risk** (auth/login.ts:45)
   ```typescript
   // Current code - VULNERABLE
   const query = `SELECT * FROM users WHERE email = '${email}'`;
   
   // Recommended fix
   const query = 'SELECT * FROM users WHERE email = $1';
   const result = await db.query(query, [email]);
   ```

2. **Missing Rate Limiting** (auth/routes.ts)
   - Login endpoint has no rate limiting
   - Recommend adding express-rate-limit middleware

### Suggestions:
- Add password complexity validation
- Implement account lockout after failed attempts
- Add audit logging for authentication events

Should I create comments on the PR with these findings?
```

### PostgreSQL Database Analysis

Query databases and analyze data directly.

**Setup:**
```bash
claude mcp add --transport stdio postgres \
  --env POSTGRES_URL="postgresql://user:pass@localhost:5432/mydb" \
  -- npx @anthropic/mcp-server-postgres "$POSTGRES_URL"
```

**Usage:**
```
User: Find users who signed up in the last week but haven't made a purchase

Claude: I'll query the database to find recent signups without purchases.

[Uses mcp__postgres__query tool]

Query executed:
```sql
SELECT u.id, u.email, u.created_at
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= NOW() - INTERVAL '7 days'
  AND o.id IS NULL
ORDER BY u.created_at DESC;
```

Found 47 users who signed up in the last 7 days without purchases:

| Email | Signed Up |
|-------|-----------|
| user1@example.com | 2 days ago |
| user2@example.com | 3 days ago |
| ... (45 more) |

Would you like me to:
1. Export this list to a CSV?
2. Draft an onboarding email for these users?
3. Analyze common patterns among these users?
```

## Authentication with OAuth 2.0

Remote MCP servers requiring authentication use OAuth 2.0 for secure login. Claude Code handles the OAuth flow automatically.

### Authentication Flow

1. **Add the server:**
   ```bash
   claude mcp add --transport http notion https://mcp.notion.com/mcp
   ```

2. **Trigger authentication:**
   - Use `/mcp` command in Claude Code
   - Select the server requiring authentication
   - Click "Authenticate"

3. **Complete OAuth flow:**
   - Browser opens to service's login page
   - Grant permissions to Claude Code
   - Token is stored securely

4. **Token management:**
   - Tokens refresh automatically
   - Use `/mcp` to clear tokens if needed
   - Tokens are stored in secure credential storage

### OAuth-Enabled Servers

| Server | OAuth Provider | Scopes Requested |
|--------|---------------|------------------|
| GitHub | GitHub OAuth | repo, read:user |
| Notion | Notion OAuth | read_content, update_content |
| Slack | Slack OAuth | chat:write, channels:read |
| Linear | Linear OAuth | read, write |

### Clearing Authentication

```bash
# Via CLI
claude mcp reset-auth <server-name>

# Or use /mcp command in Claude Code
/mcp
# Select server -> Clear Authentication
```

## Adding MCP Servers from JSON Configuration

You can add multiple MCP servers at once using a JSON configuration file.

### JSON Configuration Format

Create a file `mcp-config.json`:

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/sse"
    },
    "postgres": {
      "type": "stdio",
      "command": "npx",
      "args": ["@anthropic/mcp-server-postgres", "postgresql://localhost:5432/db"],
      "env": {
        "POSTGRES_PASSWORD": "${DB_PASSWORD}"
      }
    },
    "custom": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

### Import Configuration

```bash
# Import all servers from JSON file
claude mcp import mcp-config.json

# Import with specific scope
claude mcp import mcp-config.json --scope project
```

### Merge Behavior

When importing:
- Existing servers with same name are updated
- New servers are added
- Removed servers are preserved (not deleted)

## Importing from Claude Desktop

If you have MCP servers configured in Claude Desktop, you can import them to Claude Code.

### Import Command

```bash
claude mcp import-from-claude-desktop
```

### What Gets Imported

- All configured MCP servers
- Server commands and arguments
- Environment variable references (not values)

### Post-Import Steps

1. **Verify servers:**
   ```bash
   claude mcp list
   ```

2. **Update credentials:**
   Environment variables may need to be set for Claude Code

3. **Test connections:**
   Use `/mcp` in Claude Code to verify servers connect

## Using Claude Code as an MCP Server

Claude Code can itself act as an MCP server, allowing other MCP clients to use Claude Code's capabilities.

### Starting Claude Code as Server

```bash
claude mcp serve
```

### Configuration Options

```bash
# Serve on specific port
claude mcp serve --port 3000

# Serve with specific tools exposed
claude mcp serve --tools Read,Write,Bash

# Serve with authentication required
claude mcp serve --require-auth
```

### Connecting from Other Clients

Other MCP clients can connect to Claude Code:

```json
{
  "mcpServers": {
    "claude-code": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Exposed Tools

When serving, Claude Code exposes its built-in tools:
- File operations (Read, Write, Edit)
- Search operations (Glob, Grep)
- Bash execution
- Web fetching

## MCP Output Limits

MCP tool outputs are subject to size limits to prevent context overflow.

### Default Limit

- **Default:** 25,000 tokens per MCP tool response
- Responses exceeding this are truncated

### Configuring Limits

```bash
# Set via environment variable
export MAX_MCP_OUTPUT_TOKENS=50000

# Or in .claude/settings.json
{
  "mcp": {
    "maxOutputTokens": 50000
  }
}
```

### Handling Large Outputs

For tools that may return large outputs:

1. **Use pagination** - Many MCP servers support limit/offset parameters
2. **Filter results** - Use query parameters to narrow results
3. **Stream results** - Some servers support streaming responses

**Example with pagination:**
```
User: Get all open issues from the repo

Claude: I'll fetch issues in batches to handle the large dataset.

[Uses mcp__github__list_issues with per_page=50, page=1]
[Uses mcp__github__list_issues with per_page=50, page=2]
...
```

## MCP Resources and Tool Search

### Resource References

MCP servers can expose resources that can be referenced in conversations using the `@` syntax.

**Syntax:**
```
@server:protocol://path
```

**Examples:**
```
User: Using @github:repo://owner/repo/contents/README.md, summarize this project

User: Compare @postgres:table://users/schema with @postgres:table://customers/schema
```

### Available Resource Types

| Server | Resource Pattern | Description |
|--------|-----------------|-------------|
| GitHub | `repo://owner/repo/contents/path` | File contents |
| GitHub | `issues://owner/repo` | Issue list |
| Postgres | `table://tablename/schema` | Table schema |
| Postgres | `table://tablename/data` | Table data |
| Filesystem | `file:///path/to/file` | Local files |

### Discovering Resources

```bash
# List resources for a server
claude mcp get <server-name>

# In Claude Code
/mcp
# Select server -> View Resources
```

### Tool Search

Claude Code automatically searches MCP tools when processing requests. You can explicitly request tools:

```
User: Use the github create_issue tool to file a bug report

Claude: [Uses mcp__github__create_issue tool]
```

## MCP Prompts as Commands

MCP servers can expose prompts that appear as slash commands in Claude Code.

### Command Format

```
/mcp__<server-name>__<prompt-name> [arguments]
```

### Discovering MCP Commands

```bash
# List all MCP commands
claude mcp prompts

# Or in Claude Code
/mcp
# Select server -> View Prompts
```

### Example MCP Prompts

| Server | Prompt | Command |
|--------|--------|---------|
| GitHub | analyze_pr | `/mcp__github__analyze_pr 142` |
| Sentry | investigate_error | `/mcp__sentry__investigate_error ERROR-123` |
| Postgres | optimize_query | `/mcp__postgres__optimize_query` |

### Creating Custom Prompts

MCP server developers can define prompts in their server:

```typescript
server.setPrompts([
  {
    name: "analyze_pr",
    description: "Analyze a pull request for issues",
    arguments: [
      {
        name: "pr_number",
        description: "Pull request number",
        required: true
      }
    ]
  }
]);
```

## Managed MCP Configuration for Organizations

Enterprise administrators can deploy managed MCP configurations to enforce standardized server access across teams.

### Managed Configuration File

Create `managed-mcp.json` in the organization's managed settings location:

```json
{
  "mcpServers": {
    "required": {
      "company-api": {
        "type": "http",
        "url": "https://internal-api.company.com/mcp",
        "required": true
      }
    },
    "allowed": {
      "github": {
        "type": "http",
        "url": "https://api.githubcopilot.com/mcp/"
      },
      "sentry": {
        "type": "http",
        "url": "https://mcp.sentry.dev/sse"
      }
    },
    "blocked": ["*"]
  },
  "settings": {
    "allowUserServers": false,
    "requireApproval": true
  }
}
```

### Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `required` | Servers that must be available | `{}` |
| `allowed` | Servers users may add | `{}` |
| `blocked` | Blocked server patterns | `[]` |
| `allowUserServers` | Allow user-defined servers | `true` |
| `requireApproval` | Require approval for new servers | `false` |

### Allowlist and Denylist

**Allowlist matching:**
- Exact server names: `"github"`
- URL patterns: `"https://*.company.com/*"`

**Denylist matching:**
- Exact server names: `"untrusted-server"`
- Wildcards: `"*"` (block all except explicitly allowed)

**Precedence:** Denylists always take absolute precedence over allowlists.

### Deployment

Managed configurations can be deployed via:
1. **MDM systems** - Push to managed settings directory
2. **Environment variables** - Set `CLAUDE_MANAGED_MCP_CONFIG`
3. **Configuration management** - Chef, Puppet, Ansible

### User Experience

When managed configuration is active:
- Required servers are always available
- Users see "(managed)" label on managed servers
- Blocked servers cannot be added
- Attempting to add blocked servers shows policy message

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Server not connecting | Network/firewall | Check URL accessibility |
| Authentication failed | Expired token | Use `/mcp` to re-authenticate |
| Tools not appearing | Server error | Check `claude mcp get <name>` |
| Timeout errors | Slow server | Increase timeout in config |
| Permission denied | Missing OAuth scope | Re-authenticate with full permissions |

### Debug Mode

```bash
# Enable debug logging
claude --debug

# Or set environment variable
export CLAUDE_DEBUG=mcp

# View MCP-specific logs
claude mcp logs <server-name>
```

### Health Check

```bash
# Check all servers
claude mcp health

# Check specific server
claude mcp health <server-name>
```

### Reset Server

```bash
# Reset server state (clears cache, reconnects)
claude mcp reset <server-name>

# Reset all servers
claude mcp reset --all
```

## See Also

- **Hooks** - Automate workflows with tool lifecycle hooks
- **Plugins** - Extend Claude Code with custom plugins
- **Slash Commands** - Create custom commands including MCP prompts
- **Identity and Access Management** - Configure MCP tool permissions
- **Settings** - Configure MCP in settings files
