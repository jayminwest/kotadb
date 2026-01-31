---
title: Agent SDK Reference - TypeScript
source: https://code.claude.com/docs/en/agent-sdk/typescript
date: 2026-01-30
tags:
  - claude-code
  - sdk
  - typescript
  - agent
---

# Agent SDK Reference - TypeScript

The Claude Code TypeScript SDK provides programmatic access to Claude Code's agent capabilities, enabling you to build custom agents and integrate Claude Code into your applications.

## Installation

```bash
npm install @anthropic-ai/claude-code-sdk
# or
yarn add @anthropic-ai/claude-code-sdk
# or
pnpm add @anthropic-ai/claude-code-sdk
```

## Core Functions

### query()

The primary function for interacting with Claude Code. Sends a prompt and returns an async generator of messages.

```typescript
import { query } from '@anthropic-ai/claude-code-sdk';

async function main() {
  const messages = query({
    prompt: 'Explain the code in this file',
    options: {
      cwd: process.cwd(),
    },
  });

  for await (const message of messages) {
    if (message.type === 'assistant') {
      console.log(message.content);
    }
  }
}
```

**Parameters:**
- `prompt: string` - The user's request or question
- `options?: Options` - Configuration options for the query

**Returns:** `AsyncGenerator<SDKMessage>`

### tool()

Creates a custom tool that can be used by the agent.

```typescript
import { tool } from '@anthropic-ai/claude-code-sdk';

const myTool = tool({
  name: 'get_weather',
  description: 'Get the current weather for a location',
  inputSchema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: 'The city and state, e.g. San Francisco, CA',
      },
    },
    required: ['location'],
  },
  handler: async (input) => {
    // Implement tool logic
    return { temperature: 72, conditions: 'sunny' };
  },
});
```

**Parameters:**
- `name: string` - Unique identifier for the tool
- `description: string` - Human-readable description of what the tool does
- `inputSchema: object` - JSON Schema defining the tool's input parameters
- `handler: (input: T) => Promise<R>` - Function that executes the tool logic

### createSdkMcpServer()

Creates an MCP (Model Context Protocol) server from SDK tools.

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-code-sdk';

const server = createSdkMcpServer({
  name: 'my-mcp-server',
  version: '1.0.0',
  tools: [myTool],
});

server.listen({ port: 3000 });
```

## Options Type

The `Options` type configures the behavior of a query.

```typescript
interface Options {
  // Working directory for the agent
  cwd?: string;

  // System prompt to prepend to the conversation
  systemPrompt?: string;

  // Maximum number of turns (agent loops)
  maxTurns?: number;

  // Maximum tokens for the response
  maxTokens?: number;

  // Model to use (defaults to claude-sonnet-4-20250514)
  model?: string;

  // API key (defaults to ANTHROPIC_API_KEY env var)
  apiKey?: string;

  // Custom tools to make available
  tools?: Tool[];

  // MCP servers to connect to
  mcpServers?: McpServerConfig[];

  // Permission configuration
  permissions?: Permissions;

  // Sandbox configuration
  sandbox?: SandboxConfig;

  // Hook configuration
  hooks?: Hooks;

  // Environment variables to pass to tools
  env?: Record<string, string>;

  // Continue from a previous conversation
  conversationId?: string;

  // Resume a previous session
  resume?: boolean;

  // Allowed tools (whitelist)
  allowedTools?: string[];

  // Disallowed tools (blacklist)
  disallowedTools?: string[];

  // Enable verbose logging
  verbose?: boolean;

  // Custom headers for API requests
  headers?: Record<string, string>;

  // Timeout in milliseconds
  timeout?: number;
}
```

## Query Interface

```typescript
interface Query {
  prompt: string;
  options?: Options;
}
```

## Message Types

### SDKMessage

The base union type for all messages emitted by the SDK.

```typescript
type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKToolUseMessage
  | SDKToolResultMessage
  | SDKResultMessage
  | SDKErrorMessage
  | SDKSystemMessage;
```

### SDKAssistantMessage

Represents a response from the assistant.

```typescript
interface SDKAssistantMessage {
  type: 'assistant';
  content: string;
  id: string;
  timestamp: number;
}
```

### SDKResultMessage

The final message indicating the query has completed.

```typescript
interface SDKResultMessage {
  type: 'result';
  success: boolean;
  conversationId: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  duration: number;
}
```

### SDKUserMessage

Represents a user input message.

```typescript
interface SDKUserMessage {
  type: 'user';
  content: string;
  id: string;
  timestamp: number;
}
```

### SDKToolUseMessage

Indicates the agent is invoking a tool.

```typescript
interface SDKToolUseMessage {
  type: 'tool_use';
  toolName: string;
  toolInput: unknown;
  toolUseId: string;
  timestamp: number;
}
```

### SDKToolResultMessage

Contains the result of a tool invocation.

```typescript
interface SDKToolResultMessage {
  type: 'tool_result';
  toolUseId: string;
  result: unknown;
  isError: boolean;
  timestamp: number;
}
```

### SDKErrorMessage

Indicates an error occurred during processing.

```typescript
interface SDKErrorMessage {
  type: 'error';
  error: string;
  code?: string;
  timestamp: number;
}
```

### SDKSystemMessage

System-level messages for status updates.

```typescript
interface SDKSystemMessage {
  type: 'system';
  content: string;
  timestamp: number;
}
```

## Hook Types

Hooks allow you to intercept and modify agent behavior at various points.

```typescript
interface Hooks {
  // Called before each tool execution
  beforeToolUse?: (toolUse: ToolUseContext) => Promise<ToolUseResult | void>;

  // Called after each tool execution
  afterToolUse?: (result: ToolResultContext) => Promise<void>;

  // Called before sending a message to the model
  beforeModelCall?: (context: ModelCallContext) => Promise<void>;

  // Called after receiving a response from the model
  afterModelCall?: (context: ModelResponseContext) => Promise<void>;

  // Called when the agent completes
  onComplete?: (result: CompletionContext) => Promise<void>;

  // Called when an error occurs
  onError?: (error: ErrorContext) => Promise<void>;
}

interface ToolUseContext {
  toolName: string;
  toolInput: unknown;
  conversationId: string;
}

interface ToolUseResult {
  // Return to skip tool execution and use this result instead
  result?: unknown;
  // Return true to allow the tool to execute
  allow?: boolean;
  // Return a message to show to the user
  message?: string;
}
```

## Permission Types

Configure what actions the agent is allowed to perform.

```typescript
interface Permissions {
  // File system permissions
  fileSystem?: {
    read?: boolean | string[];  // true, false, or glob patterns
    write?: boolean | string[];
    delete?: boolean | string[];
  };

  // Network permissions
  network?: {
    allow?: boolean;
    allowedHosts?: string[];
    blockedHosts?: string[];
  };

  // Shell/Bash permissions
  shell?: {
    allow?: boolean;
    allowedCommands?: string[];
    blockedCommands?: string[];
  };

  // MCP tool permissions
  mcpTools?: {
    allow?: boolean;
    allowedTools?: string[];
    blockedTools?: string[];
  };

  // Auto-approve certain actions
  autoApprove?: {
    read?: boolean;
    write?: boolean;
    bash?: boolean;
    mcp?: boolean;
  };
}
```

## Sandbox Configuration

Configure isolated execution environments for the agent.

```typescript
interface SandboxConfig {
  // Enable sandboxed execution
  enabled: boolean;

  // Sandbox type
  type: 'docker' | 'firecracker' | 'none';

  // Docker-specific configuration
  docker?: {
    image?: string;
    volumes?: Array<{
      host: string;
      container: string;
      readonly?: boolean;
    }>;
    env?: Record<string, string>;
    network?: 'none' | 'bridge' | 'host';
    memory?: string;
    cpus?: number;
  };

  // Firecracker-specific configuration
  firecracker?: {
    kernelImage?: string;
    rootfs?: string;
    vcpuCount?: number;
    memSizeMib?: number;
  };

  // Timeout for sandbox operations
  timeout?: number;

  // Working directory inside the sandbox
  workDir?: string;
}
```

## Complete Example

```typescript
import { query, tool } from '@anthropic-ai/claude-code-sdk';

// Define a custom tool
const searchDocs = tool({
  name: 'search_docs',
  description: 'Search project documentation',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  handler: async ({ query }) => {
    // Implementation
    return { results: ['doc1.md', 'doc2.md'] };
  },
});

async function main() {
  const messages = query({
    prompt: 'Search the docs for authentication patterns',
    options: {
      cwd: '/path/to/project',
      tools: [searchDocs],
      maxTurns: 10,
      permissions: {
        fileSystem: {
          read: true,
          write: ['src/**/*.ts'],
        },
        shell: {
          allow: true,
          allowedCommands: ['npm', 'bun', 'git'],
        },
      },
      hooks: {
        beforeToolUse: async (ctx) => {
          console.log(`Using tool: ${ctx.toolName}`);
        },
        onComplete: async (ctx) => {
          console.log('Agent completed');
        },
      },
    },
  });

  for await (const message of messages) {
    switch (message.type) {
      case 'assistant':
        console.log('Assistant:', message.content);
        break;
      case 'tool_use':
        console.log(`Tool: ${message.toolName}`);
        break;
      case 'result':
        console.log(`Done! Tokens: ${message.totalTokens}`);
        break;
      case 'error':
        console.error('Error:', message.error);
        break;
    }
  }
}

main();
```
