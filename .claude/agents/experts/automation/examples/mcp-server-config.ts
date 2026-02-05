// MCP server configuration example

mcpServers: {
  kotadb: {
    type: "stdio",
    command: "bunx",
    args: ["--bun", "kotadb", "--toolset", "memory"],
    env: { KOTADB_CWD: projectRoot }
  }
}
