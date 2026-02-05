// SDK query() integration example

import { query, type SDKMessage } from "@anthropic-ai/claude-code";

const messages: SDKMessage[] = [];
for await (const message of query({
  prompt: `/do #${issueNumber}`,
  options: {
    maxTurns: 100,
    cwd: projectRoot,
    permissionMode: "bypassPermissions",
    mcpServers: {
      kotadb: {
        type: "stdio",
        command: "bunx",
        args: ["--bun", "kotadb"],
        env: { KOTADB_CWD: projectRoot }
      }
    },
    stderr: (data: string) => { /* suppress */ },
    hooks: { /* ... */ }
  }
})) {
  messages.push(message);
  // Handle message types...
}
