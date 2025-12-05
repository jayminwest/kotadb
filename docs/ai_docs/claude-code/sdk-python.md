# Python Agent SDK Documentation

**Date:** 2025-12-05
**Source:** https://platform.claude.com/docs/en/agent-sdk/python.md

## Overview

The Python Agent SDK enables interaction with Claude Code through two primary interfaces:

- **`query()`**: For one-off interactions that create a fresh session each time
- **`ClaudeSDKClient`**: For maintaining conversation context across multiple exchanges

## Installation

```bash
pip install claude-agent-sdk
```

## Core APIs

### query() Function

Creates a fresh session each time, returning an async iterator of messages. Ideal for independent tasks without conversation memory.

```python
async def query(
    *,
    prompt: str | AsyncIterable[dict[str, Any]],
    options: ClaudeAgentOptions | None = None
) -> AsyncIterator[Message]
```

**Use Cases:**
- One-off questions where you don't need conversation history
- Independent tasks that don't require context from previous exchanges

**Example:**

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write"],
        permission_mode="acceptEdits"
    )

    async for message in query(prompt="What is in the README?", options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)
```

### ClaudeSDKClient Class

Maintains session continuity across multiple `query()` calls, supporting interrupts, hooks, and custom tools.

**Features:**
- Session persistence across exchanges
- Real-time message streaming
- Interrupt capability mid-execution
- Async context manager support

**Key Methods:**

- **`connect()`** - Establish connection with optional initial prompt
- **`query()`** - Send new request in streaming mode
- **`receive_response()`** - Iterate until final ResultMessage
- **`receive_messages()`** - Consume all messages from the stream
- **`interrupt()`** - Stop execution mid-task
- **`disconnect()`** - Close session

**Example:**

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Bash"],
        permission_mode="plan"
    )

    async with ClaudeSDKClient(options) as client:
        await client.connect()
        await client.query("Analyze the codebase structure")

        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                process_response(message)

        # Follow-up in the same session
        await client.query("Now create a summary document")
        async for message in client.receive_response():
            process_response(message)
```

## Configuration Options

### ClaudeAgentOptions

Provides comprehensive control over Claude Code's behavior:

| Setting | Type | Purpose |
|---------|------|---------|
| `allowed_tools` | `list[str]` | Tools Claude can access |
| `system_prompt` | `str | SystemPrompt` | Custom or preset instructions |
| `mcp_servers` | `dict` | External tool integrations |
| `permission_mode` | `str` | Control execution behavior |
| `cwd` | `str` | Working directory |
| `can_use_tool` | `callable` | Custom permission logic |
| `hooks` | `dict` | Event interception callbacks |
| `setting_sources` | `list[str]` | Load filesystem config |
| `output_format` | `OutputFormat` | Structured output schema |
| `sandbox` | `SandboxSettings` | Command execution restrictions |

**Permission Modes:**
- `"acceptEdits"` - Automatically accept file edits
- `"plan"` - Plan mode for reviewing actions
- `"bypassPermissions"` - Skip all permission checks

**Example:**

```python
options = ClaudeAgentOptions(
    allowed_tools=["Read", "Write", "Edit", "Bash"],
    system_prompt="You are a code review assistant",
    permission_mode="plan",
    cwd="/path/to/project",
    setting_sources=["user", "project"]
)
```

## Custom Tools & MCP Servers

### Creating Custom Tools

The `@tool` decorator creates type-safe MCP tools:

```python
from claude_agent_sdk import tool

@tool("calculator", "Performs basic math operations", {
    "operation": str,
    "a": float,
    "b": float
})
async def calculator_tool(args: dict) -> dict[str, Any]:
    op = args["operation"]
    a = args["a"]
    b = args["b"]

    result = {
        "add": a + b,
        "subtract": a - b,
        "multiply": a * b,
        "divide": a / b if b != 0 else None
    }.get(op)

    return {
        "content": [{
            "type": "text",
            "text": f"Result: {result}"
        }]
    }
```

### Creating MCP Servers

Combine tools into servers using `create_sdk_mcp_server()`:

```python
from claude_agent_sdk import create_sdk_mcp_server

# Create server with custom tools
mcp_server = create_sdk_mcp_server(
    calculator_tool,
    # Add more tools as needed
)

# Use in ClaudeAgentOptions
options = ClaudeAgentOptions(
    mcp_servers={
        "calculator": mcp_server
    },
    allowed_tools=["calculator"]
)
```

## Message Types

All communications use strongly-typed messages:

### UserMessage
Input with content blocks representing user prompts.

### AssistantMessage
Claude's response with content blocks.

**Content Block Types:**
- `TextBlock` - Text responses
- `ThinkingBlock` - Claude's reasoning process
- `ToolUseBlock` - Tool invocations
- `ToolResultBlock` - Tool execution results

### SystemMessage
Metadata about execution state and system events.

### ResultMessage
Final outcome with cost and usage statistics.

**Example:**

```python
async for message in client.receive_response():
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock):
                print(f"Text: {block.text}")
            elif isinstance(block, ThinkingBlock):
                print(f"Thinking: {block.thinking}")
            elif isinstance(block, ToolUseBlock):
                print(f"Tool: {block.name}, Args: {block.input}")

    elif isinstance(message, ResultMessage):
        print(f"Cost: ${message.cost}")
        print(f"Tokens: {message.usage}")
```

## Built-in Tools

The SDK provides access to 20+ tools including:

### File Operations
- **Read** - Read file contents
- **Write** - Create or overwrite files
- **Edit** - Make precise edits to existing files
- **Glob** - Find files matching patterns

### Execution
- **Bash** - Execute shell commands
- **NotebookEdit** - Edit Jupyter notebooks

### Search
- **Grep** - Search file contents
- **WebSearch** - Search the web
- **WebFetch** - Fetch URL content

### Utilities
- **Task** - Delegate to subagents
- **TodoWrite** - Manage task lists

Each tool has defined input/output schemas for validation.

## Hooks & Permission Control

### Hooks

Hooks intercept events and enable custom behavior at various execution points:

**Hook Types:**
- `PreToolUse` - Before tool execution
- `PostToolUse` - After tool execution
- `UserPromptSubmit` - When user submits a prompt
- `Stop` - When execution stops

**Example:**

```python
async def pre_tool_hook(input_data, tool_use_id, context):
    tool_name = input_data.get("name")
    print(f"About to use tool: {tool_name}")

    # Block dangerous operations
    if tool_name == "Bash" and "rm -rf" in str(input_data.get("input", {})):
        return {"decision": "block", "reason": "Dangerous command detected"}

    return {}  # Allow

async def post_tool_hook(result, tool_use_id, context):
    print(f"Tool completed: {result}")
    return {}

options = ClaudeAgentOptions(
    hooks={
        "PreToolUse": pre_tool_hook,
        "PostToolUse": post_tool_hook
    }
)
```

### Custom Permission Control

The `can_use_tool` handler provides granular permission control:

```python
async def permission_handler(tool_name, tool_input, context):
    # Deny specific tools
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        if "sudo" in command:
            return {"allowed": False, "reason": "Sudo not permitted"}

    # Modify tool inputs
    if tool_name == "Write":
        # Ensure files only written to specific directory
        file_path = tool_input.get("file_path", "")
        if not file_path.startswith("/safe/path/"):
            return {"allowed": False, "reason": "Write restricted to /safe/path/"}

    return {"allowed": True}

options = ClaudeAgentOptions(
    can_use_tool=permission_handler
)
```

## Error Handling

Defined exception hierarchy:

- **`ClaudeSDKError`** - Base exception for all SDK errors
- **`CLINotFoundError`** - Claude Code CLI not installed
- **`ProcessError`** - Command execution failed
- **`CLIConnectionError`** - Connection issues with Claude Code
- **`CLIJSONDecodeError`** - Response parsing failed

**Example:**

```python
from claude_agent_sdk import CLINotFoundError, ProcessError, ClaudeSDKError

try:
    async for message in query(prompt="Hello", options=options):
        process(message)
except CLINotFoundError:
    print("Please install Claude Code CLI")
except ProcessError as e:
    print(f"Process failed: {e}")
except ClaudeSDKError as e:
    print(f"SDK error: {e}")
```

## Sandbox Configuration

Optional sandboxing restricts command execution. Configure via `SandboxSettings`:

```python
from claude_agent_sdk import SandboxSettings

sandbox = SandboxSettings(
    enabled=True,
    autoAllowBashIfSandboxed=True,
    excludedCommands=["docker", "kubectl", "systemctl"],
    networkPolicy="block"  # or "allow"
)

options = ClaudeAgentOptions(
    sandbox=sandbox,
    allowed_tools=["Bash", "Read", "Write"]
)
```

**Settings:**
- `enabled` - Enable sandbox mode
- `autoAllowBashIfSandboxed` - Auto-approve Bash commands in sandbox
- `excludedCommands` - Commands that are blocked even in sandbox
- `networkPolicy` - Control network access independently from file permissions

## Setting Sources

The `setting_sources` parameter controls configuration loading:

- **`"user"`** - Global settings (`~/.claude/settings.json`)
- **`"project"`** - Team settings (`.claude/settings.json`)
- **`"local"`** - Local overrides (`.claude/settings.local.json`)

When omitted, no filesystem settings load, providing SDK isolation.

**Example:**

```python
# Load all setting sources
options = ClaudeAgentOptions(
    setting_sources=["user", "project", "local"]
)

# SDK-only mode (no filesystem settings)
options = ClaudeAgentOptions(
    # setting_sources not specified
)
```

## Structured Outputs

Define JSON schemas for validated, type-safe agent responses using `OutputFormat`:

```python
from claude_agent_sdk import OutputFormat

output_format = OutputFormat(
    type="json_schema",
    schema={
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "files_changed": {
                "type": "array",
                "items": {"type": "string"}
            },
            "risk_level": {
                "type": "string",
                "enum": ["low", "medium", "high"]
            }
        },
        "required": ["summary", "files_changed", "risk_level"]
    }
)

options = ClaudeAgentOptions(
    output_format=output_format
)
```

## Advanced Use Cases

### Continuous Conversations

Use `ClaudeSDKClient` with context preservation across turns for interactive applications:

```python
async def interactive_session():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Write", "Edit"],
        permission_mode="plan"
    )

    async with ClaudeSDKClient(options) as client:
        await client.connect()

        # First interaction
        await client.query("Review the main.py file")
        async for message in client.receive_response():
            display(message)

        # Follow-up in same context
        await client.query("Now fix the issues you found")
        async for message in client.receive_response():
            display(message)

        # Another follow-up
        await client.query("Write tests for the fixes")
        async for message in client.receive_response():
            display(message)
```

### Real-time Monitoring

Stream messages to track tool execution, file creation, and progress:

```python
async def monitor_execution():
    async for message in query(prompt="Refactor the codebase", options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    print(f"Using {block.name}: {block.input}")
                elif isinstance(block, TextBlock):
                    print(f"Response: {block.text}")

        elif isinstance(message, SystemMessage):
            print(f"System: {message.content}")

        elif isinstance(message, ResultMessage):
            print(f"Complete! Cost: ${message.cost}")
```

### Interrupt Execution

Stop Claude mid-task when needed:

```python
async def interruptible_task():
    async with ClaudeSDKClient(options) as client:
        await client.connect()
        await client.query("Perform a long-running analysis")

        timeout = 10  # seconds
        start_time = time.time()

        async for message in client.receive_messages():
            if time.time() - start_time > timeout:
                print("Timeout reached, interrupting...")
                await client.interrupt()
                break

            process(message)
```

### Response-Driven Logic

React to Claude's responses before sending follow-ups:

```python
async def adaptive_workflow():
    async with ClaudeSDKClient(options) as client:
        await client.connect()
        await client.query("Analyze code quality")

        risk_level = None
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                # Extract risk assessment from response
                risk_level = extract_risk_level(message)

        # Adapt next step based on risk
        if risk_level == "high":
            await client.query("Create detailed remediation plan")
        else:
            await client.query("Proceed with minor improvements")

        async for message in client.receive_response():
            process(message)
```

## Best Practices

1. **Use context managers**: Always use `async with` for `ClaudeSDKClient` to ensure proper cleanup
2. **Handle errors gracefully**: Catch specific exceptions and provide meaningful error messages
3. **Validate tool inputs**: Use hooks to validate and sanitize tool inputs before execution
4. **Monitor costs**: Track `ResultMessage` usage and cost data for production deployments
5. **Restrict permissions**: Use `allowed_tools` and `can_use_tool` to limit Claude's capabilities
6. **Enable sandbox**: Use sandbox mode for untrusted or automated workflows
7. **Stream processing**: Process messages as they arrive rather than buffering all responses

## Complete Example

```python
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    ResultMessage,
    TextBlock,
    ToolUseBlock
)

async def code_review_agent(file_path: str):
    """Automated code review with structured output."""

    # Define hooks for monitoring
    async def log_tool_use(input_data, tool_use_id, context):
        print(f"Tool: {input_data.get('name')}")
        return {}

    # Configure options
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Edit"],
        permission_mode="plan",
        system_prompt="You are a code review assistant. Focus on best practices, security, and maintainability.",
        hooks={"PreToolUse": log_tool_use},
        setting_sources=["project"]
    )

    try:
        async with ClaudeSDKClient(options) as client:
            await client.connect()

            # Request review
            await client.query(f"Review {file_path} and suggest improvements")

            suggestions = []
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            suggestions.append(block.text)

                elif isinstance(message, ResultMessage):
                    print(f"Review complete. Cost: ${message.cost}")

            return {
                "file": file_path,
                "suggestions": suggestions,
                "cost": message.cost
            }

    except Exception as e:
        print(f"Error during review: {e}")
        return None

# Run the agent
import asyncio
result = asyncio.run(code_review_agent("src/main.py"))
print(result)
```

## Additional Resources

- [Claude Code Documentation](https://code.claude.com/docs)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Agent SDK TypeScript](https://platform.claude.com/docs/en/agent-sdk/typescript.md)
