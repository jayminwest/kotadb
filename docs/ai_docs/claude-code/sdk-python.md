---
title: Agent SDK Reference - Python
source: https://code.claude.com/docs/en/agent-sdk/python
date: 2026-01-30
tags:
  - claude-code
  - sdk
  - python
  - agent
---

# Agent SDK Reference - Python

The Claude Code Python SDK provides programmatic access to Claude Code's agent capabilities for Python applications.

## Installation

```bash
pip install claude-code-sdk
```

Or with optional dependencies:

```bash
pip install claude-code-sdk[all]
```

## ClaudeCodeSDK Class

The main entry point for interacting with Claude Code.

```python
from claude_code_sdk import ClaudeCodeSDK

sdk = ClaudeCodeSDK()
```

### Constructor Parameters

```python
ClaudeCodeSDK(
    api_key: str | None = None,      # API key (defaults to ANTHROPIC_API_KEY)
    model: str | None = None,         # Model to use
    timeout: float | None = None,     # Request timeout in seconds
    max_retries: int = 2,             # Maximum retry attempts
)
```

## query() Method

Send a prompt to Claude Code and receive responses.

### Synchronous Usage

```python
from claude_code_sdk import ClaudeCodeSDK

sdk = ClaudeCodeSDK()

# Simple query
response = sdk.query("Explain the code in main.py")

# With options
response = sdk.query(
    prompt="Refactor this function for better performance",
    cwd="/path/to/project",
    max_turns=10,
)

for message in response:
    if message.type == "assistant":
        print(message.content)
    elif message.type == "result":
        print(f"Total tokens: {message.total_tokens}")
```

### Async Usage

```python
import asyncio
from claude_code_sdk import ClaudeCodeSDK

async def main():
    sdk = ClaudeCodeSDK()
    
    async for message in sdk.query_async(
        prompt="Write unit tests for utils.py",
        cwd="/path/to/project"
    ):
        if message.type == "assistant":
            print(message.content)

asyncio.run(main())
```

### Query Parameters

```python
def query(
    self,
    prompt: str,
    *,
    cwd: str | None = None,
    system_prompt: str | None = None,
    max_turns: int | None = None,
    max_tokens: int | None = None,
    tools: list[Tool] | None = None,
    mcp_servers: list[McpServerConfig] | None = None,
    permissions: Permissions | None = None,
    allowed_tools: list[str] | None = None,
    disallowed_tools: list[str] | None = None,
    conversation_id: str | None = None,
    resume: bool = False,
    env: dict[str, str] | None = None,
    verbose: bool = False,
) -> Generator[SDKMessage, None, None]:
    ...
```

## Options

### Permissions

```python
from claude_code_sdk import Permissions, FileSystemPermissions, ShellPermissions

permissions = Permissions(
    file_system=FileSystemPermissions(
        read=True,
        write=["src/**/*.py", "tests/**/*.py"],
        delete=False,
    ),
    shell=ShellPermissions(
        allow=True,
        allowed_commands=["python", "pip", "pytest"],
        blocked_commands=["rm -rf", "sudo"],
    ),
    network=NetworkPermissions(
        allow=True,
        allowed_hosts=["api.github.com", "pypi.org"],
    ),
)

response = sdk.query(
    prompt="Run the test suite",
    permissions=permissions,
)
```

### MCP Server Configuration

```python
from claude_code_sdk import McpServerConfig

mcp_config = McpServerConfig(
    name="my-server",
    command="python",
    args=["mcp_server.py"],
    env={"DEBUG": "true"},
)

response = sdk.query(
    prompt="Use the MCP tools",
    mcp_servers=[mcp_config],
)
```

### Custom Tools

```python
from claude_code_sdk import Tool

def search_codebase(query: str, file_type: str = "py") -> dict:
    """Search the codebase for matching patterns."""
    # Implementation
    return {"matches": [...]}

search_tool = Tool(
    name="search_codebase",
    description="Search the codebase for patterns",
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query"
            },
            "file_type": {
                "type": "string", 
                "description": "File extension to search",
                "default": "py"
            }
        },
        "required": ["query"]
    },
    handler=search_codebase,
)

response = sdk.query(
    prompt="Search for authentication code",
    tools=[search_tool],
)
```

## Message Types

### SDKMessage (Base)

```python
from claude_code_sdk import SDKMessage

class SDKMessage:
    type: str
    timestamp: float
```

### AssistantMessage

```python
class AssistantMessage(SDKMessage):
    type: Literal["assistant"]
    content: str
    id: str
```

### UserMessage

```python
class UserMessage(SDKMessage):
    type: Literal["user"]
    content: str
    id: str
```

### ToolUseMessage

```python
class ToolUseMessage(SDKMessage):
    type: Literal["tool_use"]
    tool_name: str
    tool_input: dict
    tool_use_id: str
```

### ToolResultMessage

```python
class ToolResultMessage(SDKMessage):
    type: Literal["tool_result"]
    tool_use_id: str
    result: Any
    is_error: bool
```

### ResultMessage

```python
class ResultMessage(SDKMessage):
    type: Literal["result"]
    success: bool
    conversation_id: str
    total_tokens: int
    input_tokens: int
    output_tokens: int
    duration: float
```

### ErrorMessage

```python
class ErrorMessage(SDKMessage):
    type: Literal["error"]
    error: str
    code: str | None
```

### SystemMessage

```python
class SystemMessage(SDKMessage):
    type: Literal["system"]
    content: str
```

## Streaming Responses

The SDK uses generators for streaming responses, allowing you to process messages as they arrive.

### Synchronous Streaming

```python
sdk = ClaudeCodeSDK()

for message in sdk.query("Explain this codebase"):
    match message.type:
        case "assistant":
            print(message.content, end="", flush=True)
        case "tool_use":
            print(f"\n[Using tool: {message.tool_name}]")
        case "tool_result":
            if message.is_error:
                print(f"\n[Tool error: {message.result}]")
        case "result":
            print(f"\n\nCompleted in {message.duration:.2f}s")
            print(f"Tokens used: {message.total_tokens}")
        case "error":
            print(f"\nError: {message.error}")
```

### Async Streaming

```python
import asyncio
from claude_code_sdk import ClaudeCodeSDK

async def stream_response():
    sdk = ClaudeCodeSDK()
    
    async for message in sdk.query_async("Write a README"):
        if message.type == "assistant":
            print(message.content, end="", flush=True)
        elif message.type == "result":
            return message

asyncio.run(stream_response())
```

### Collecting All Messages

```python
# Synchronous
messages = list(sdk.query("Analyze this code"))

# Async
async def collect_messages():
    return [msg async for msg in sdk.query_async("Analyze this code")]

messages = asyncio.run(collect_messages())
```

## Async Usage

### Full Async Example

```python
import asyncio
from claude_code_sdk import ClaudeCodeSDK, Permissions

async def analyze_project():
    sdk = ClaudeCodeSDK()
    
    permissions = Permissions(
        file_system={"read": True, "write": False},
        shell={"allow": False},
    )
    
    messages = []
    async for message in sdk.query_async(
        prompt="Analyze the architecture of this project",
        cwd="/path/to/project",
        permissions=permissions,
        max_turns=5,
    ):
        messages.append(message)
        
        if message.type == "assistant":
            print(f"Claude: {message.content}")
        elif message.type == "error":
            raise RuntimeError(message.error)
    
    return messages

async def main():
    try:
        results = await analyze_project()
        final = next(m for m in results if m.type == "result")
        print(f"Analysis complete. Tokens: {final.total_tokens}")
    except Exception as e:
        print(f"Analysis failed: {e}")

if __name__ == "__main__":
    asyncio.run(main())
```

### Concurrent Queries

```python
import asyncio
from claude_code_sdk import ClaudeCodeSDK

async def analyze_file(sdk: ClaudeCodeSDK, filepath: str) -> str:
    content = []
    async for message in sdk.query_async(
        prompt=f"Analyze {filepath}",
        cwd="/project",
    ):
        if message.type == "assistant":
            content.append(message.content)
    return "".join(content)

async def analyze_multiple_files():
    sdk = ClaudeCodeSDK()
    files = ["main.py", "utils.py", "models.py"]
    
    results = await asyncio.gather(*[
        analyze_file(sdk, f) for f in files
    ])
    
    for filepath, analysis in zip(files, results):
        print(f"=== {filepath} ===")
        print(analysis)

asyncio.run(analyze_multiple_files())
```

## Error Handling

```python
from claude_code_sdk import ClaudeCodeSDK, ClaudeCodeError, AuthenticationError

sdk = ClaudeCodeSDK()

try:
    for message in sdk.query("Do something"):
        if message.type == "error":
            print(f"Query error: {message.error}")
            break
        # Process other messages
except AuthenticationError:
    print("Invalid API key")
except ClaudeCodeError as e:
    print(f"SDK error: {e}")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Complete Example

```python
import asyncio
from claude_code_sdk import (
    ClaudeCodeSDK,
    Tool,
    Permissions,
    FileSystemPermissions,
    ShellPermissions,
)

# Define a custom tool
def get_test_coverage(file_path: str) -> dict:
    """Get test coverage for a file."""
    # Implementation
    return {"coverage": 85.5, "uncovered_lines": [42, 67, 89]}

coverage_tool = Tool(
    name="get_test_coverage",
    description="Get test coverage information for a file",
    input_schema={
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "Path to the file"}
        },
        "required": ["file_path"],
    },
    handler=get_test_coverage,
)

async def main():
    sdk = ClaudeCodeSDK()
    
    permissions = Permissions(
        file_system=FileSystemPermissions(
            read=True,
            write=["src/**/*.py", "tests/**/*.py"],
        ),
        shell=ShellPermissions(
            allow=True,
            allowed_commands=["python", "pytest", "pip"],
        ),
    )
    
    print("Starting code review...")
    
    async for message in sdk.query_async(
        prompt="Review the code in src/ and suggest improvements. Check test coverage.",
        cwd="/path/to/project",
        tools=[coverage_tool],
        permissions=permissions,
        max_turns=15,
    ):
        match message.type:
            case "assistant":
                print(message.content)
            case "tool_use":
                print(f"\n[Checking: {message.tool_input}]")
            case "tool_result":
                if not message.is_error:
                    print(f"[Coverage: {message.result}]")
            case "result":
                print(f"\n--- Review complete ---")
                print(f"Duration: {message.duration:.1f}s")
                print(f"Tokens: {message.total_tokens}")
            case "error":
                print(f"Error: {message.error}")
                break

if __name__ == "__main__":
    asyncio.run(main())
```
