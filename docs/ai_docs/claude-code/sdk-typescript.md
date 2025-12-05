# Agent SDK Reference - TypeScript

**Date:** 2025-12-05
**Source:** https://platform.claude.com/docs/en/agent-sdk/typescript.md

This comprehensive documentation covers the TypeScript Agent SDK for Claude Code, detailing all available functions, types, interfaces, and configuration options.

## Installation

Install via npm:

```bash
npm install @anthropic-ai/claude-agent-sdk
```

## Core Functions

The SDK provides three primary functions for Claude Code integration:

### query()

The primary function for interacting with Claude Code. It accepts a prompt (string or async iterable) and optional configuration, returning an `AsyncGenerator` that streams messages. This enables real-time interaction with Claude's responses.

**Signature:**
```typescript
query(prompt: string | AsyncIterable<string>, options?: Options): AsyncGenerator<SDKMessage>
```

### tool()

Creates type-safe MCP tool definitions using Zod schemas. Developers define tool name, description, input schema, and async handler function for custom tool integration.

**Purpose:** Enables the model to execute custom functionality with validated inputs.

### createSdkMcpServer()

Establishes an in-process MCP server with specified tools, enabling local tool serving without external processes.

**Purpose:** Instantiates an in-process MCP server with specified tools and metadata.

## Configuration Options

The `Options` type provides extensive customization for Claude Code execution:

### Execution Control
- **Model selection** - Specify which Claude model to use
- **Fallback models** - Configure alternative models if primary is unavailable
- **Maximum turns** - Limit conversation depth
- **Budget limits** - Control execution costs
- **Thinking token allocation** - Configure extended thinking capabilities

### Runtime
- Runtime selection (Node, Deno, Bun)
- Executable selection
- Environment variables
- Working directory configuration

### Permission Management
- **Permission modes:**
  - `default` - Standard permission prompting
  - `acceptEdits` - Automatically accept edit operations
  - `bypassPermissions` - Skip permission checks entirely
  - `plan` - Planning mode with restricted permissions
- **Custom permission functions** - Implement `canUseTool` handlers for granular control
- **Tool allowlists** - Specify which tools are permitted
- **Tool denylists** - Explicitly block certain tools
- **Permission updates** - Dynamic permission modification during execution

### Tool Configuration
- **Built-in tool preset** - Use standard Claude Code tools
- **Custom tool arrays** - Provide your own tool implementations
- **Tool allowlisting/denylisting** - Fine-grained tool access control

### Session Management
- Continue existing sessions
- Resume previous sessions
- Fork sessions for parallel exploration

### Advanced Features
- **Hooks for lifecycle events** - Monitor and respond to execution events
- **Sandbox settings** - Isolate command execution
- **MCP servers** - Connect to external MCP servers
- **Plugins** - Extend functionality with plugins
- **Structured outputs** - Define JSON schemas for deterministic results via `outputFormat`

### Settings Sources

The `settingSources` parameter controls which configuration files load:
- User settings
- Project settings
- Local settings

**Important:** The SDK does **not** load any filesystem settings by default, providing isolation. Developers can explicitly enable loading from configuration files via the `settingSources` parameter.

## Message Architecture

The SDK uses a unified message type system for streaming communication:

### SDKAssistantMessage
Claude's responses with UUIDs and session tracking. Represents model-generated content during the conversation.

### SDKUserMessage
User inputs supporting streaming mode. Can be provided as strings or async iterables for progressive input.

### SDKResultMessage
Final results with comprehensive execution metadata:
- Token usage statistics
- Cost information
- Structured outputs (if configured)
- Session completion data

### SDKSystemMessage
Initialization data covering:
- Available tools
- Model configuration
- Permission settings
- Runtime information

### SDKPartialAssistantMessage
Streaming events emitted during response generation (when streaming is enabled). Allows real-time processing of incremental responses.

### SDKCompactBoundaryMessage
Conversation compaction markers indicating when conversation history has been compressed or summarized.

## Built-in Tools

The SDK includes comprehensive tools for various operations:

### File Operations
- **Read** - Read file contents
- **Write** - Write or create files
- **Edit** - Modify existing files with precise edits

### Execution
- **Bash** - Execute shell commands with configurable isolation

### Search & Discovery
- **Glob** - Pattern-based file discovery
- **Grep** - Search file contents with regex
- **WebSearch** - Search the internet for information

### Web Capabilities
- **WebFetch** - Retrieve and process web content

### Code Analysis
- Code understanding and navigation tools

### Specialized Features
- **Notebook editing** - Jupyter notebook manipulation
- **MCP resource access** - Access resources from MCP servers

**Total:** 16 built-in tools spanning file operations, execution, search, web interactions, and specialized features.

## Hook System

Developers can register callbacks for lifecycle events to monitor and modify execution behavior:

### Available Hooks
- **PreToolUse** - Called before a tool is executed
- **PostToolUse** - Called after a tool completes
- **PermissionRequest** - Triggered when permission is needed
- **SessionStart** - Called when a session begins
- **SessionEnd** - Called when a session completes
- **Subagents** - Monitor subagent creation and execution
- **Compaction** - Track conversation history compression

### Hook Context
Hooks receive detailed context about the operation:
- Tool information
- Input parameters
- Execution state
- Session metadata

### Hook Capabilities
- Modify behavior dynamically
- Collect telemetry and metrics
- Implement custom authorization
- Log execution details
- Inject additional context

## Sandbox Configuration

Optional sandbox settings enable command execution isolation:

### Features
- **Command execution isolation** - Run commands in restricted environment
- **Network restrictions** - Control network access for sandboxed commands
- **Configurable exclusions** - Whitelist specific commands or patterns
- **Unix socket access** - Control Unix domain socket availability
- **Permission fallback mechanisms** - Handle permission requests for unsandboxed operations requested by the model

### Use Cases
- Secure execution of untrusted code
- Prevent unintended system modifications
- Comply with security policies
- Test code in isolated environments

## Subagents

Delegate complex tasks to specialized agents with custom configuration:

### Features
- Custom prompts for specialized contexts
- Tool restrictions for focused execution
- Independent permission scopes
- Parallel execution support

### Use Cases
- Break down complex tasks into specialized subtasks
- Implement expert systems with domain-specific agents
- Isolate risky operations
- Improve performance through parallelization

## Structured Outputs

Define JSON schemas for deterministic agent results:

### Configuration
Use `outputFormat` option to specify expected output structure:
```typescript
const options = {
  outputFormat: {
    type: "json_schema",
    schema: yourZodSchema
  }
}
```

### Benefits
- Type-safe results
- Predictable output format
- Easy integration with downstream systems
- Validation at runtime

## Permission System

Implement granular access control through multiple mechanisms:

### Permission Modes
1. **default** - Interactive prompting for all operations
2. **acceptEdits** - Auto-approve file edits, prompt for others
3. **bypassPermissions** - Skip all permission checks (use with caution)
4. **plan** - Planning mode with restricted default permissions

### Custom Handlers
Implement `canUseTool` for fine-grained control:
```typescript
const options = {
  canUseTool: async (toolName, inputs, context) => {
    // Custom authorization logic
    return true; // or false to deny
  }
}
```

### Dynamic Updates
Update permissions during execution based on:
- User feedback
- Tool outcomes
- Session state
- External authorization systems

## Best Practices

1. **Use type-safe tools** - Leverage Zod schemas for tool definitions
2. **Configure appropriate permissions** - Don't use `bypassPermissions` in production
3. **Monitor via hooks** - Implement telemetry and logging through lifecycle hooks
4. **Sandbox untrusted code** - Enable sandbox for executing unknown commands
5. **Set budget limits** - Prevent runaway costs with budget controls
6. **Handle streaming** - Process partial messages for responsive UX
7. **Isolate settings** - Keep SDK isolated from filesystem settings unless explicitly needed
8. **Use structured outputs** - Define schemas for predictable results
9. **Leverage subagents** - Decompose complex tasks for better results

## Related Resources

- Agent SDK Overview
- Python SDK Reference
- MCP Server Documentation
- Claude Code Documentation
- Example Applications
