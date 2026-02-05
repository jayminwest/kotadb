// MCP toolset configuration example

// CLI parsing (app/src/cli/args.ts)
export type ToolsetTier = "default" | "core" | "memory" | "full";

export function isValidToolsetTier(value: string): value is ToolsetTier {
  return ["default", "core", "memory", "full"].includes(value as ToolsetTier);
}

// MCP server configuration with toolset
mcpServers: {
  kotadb: {
    type: "stdio",
    command: "bunx",
    args: ["--bun", "kotadb", "--toolset", "memory"],
    env: { KOTADB_CWD: projectRoot }
  }
}

// Tool filtering (app/src/mcp/tools.ts)
export function filterToolsByTier(tier: ToolsetTier): ToolDefinition[] {
  const allTools = getToolDefinitions();
  switch (tier) {
    case "core":
      return allTools.filter((t) => t.tier === "core");
    case "default":
      return allTools.filter((t) => t.tier === "core" || t.tier === "sync");
    case "memory":
      return allTools.filter((t) => 
        t.tier === "core" || t.tier === "sync" || t.tier === "memory"
      );
    case "full":
      return allTools;
  }
}

// MCP server tool registration
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tier = context.toolset || "default";
  const filteredTools = filterToolsByTier(tier);
  return { tools: filteredTools };
});
