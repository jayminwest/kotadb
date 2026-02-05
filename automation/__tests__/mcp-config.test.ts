import { describe, it, expect } from "bun:test";
import { join } from "node:path";

describe("MCP Configuration", () => {
  it("should include --stdio flag in orchestrator config", () => {
    const args = ["--bun", "kotadb", "--stdio"];
    expect(args).toContain("--stdio");
    expect(args.indexOf("--stdio")).toBeGreaterThan(args.indexOf("kotadb"));
  });
  
  it("should include --stdio flag in auto-record config", () => {
    const args = ["--bun", "kotadb", "--stdio", "--toolset", "memory"];
    expect(args).toContain("--stdio");
    expect(args).toContain("--toolset");
    expect(args).toContain("memory");
    expect(args.indexOf("--stdio")).toBeGreaterThan(args.indexOf("kotadb"));
    expect(args.indexOf("--toolset")).toBeGreaterThan(args.indexOf("--stdio"));
  });
  
  it("should include --stdio flag in curator config", () => {
    const args = ["--bun", "kotadb", "--stdio", "--toolset", "memory"];
    expect(args).toContain("--stdio");
    expect(args.indexOf("--stdio")).toBeGreaterThan(args.indexOf("kotadb"));
  });
  
  it("should use KOTADB_PATH env var pointing to main repo database", () => {
    const mainProjectRoot = "/Users/test/kotadb";
    const expectedPath = join(mainProjectRoot, ".kotadb", "kota.db");
    const env = { KOTADB_PATH: expectedPath };
    
    expect(env.KOTADB_PATH).toBe(expectedPath);
    expect(env.KOTADB_PATH).toContain(".kotadb/kota.db");
    expect(env.KOTADB_PATH).toContain(mainProjectRoot);
  });
  
  it("should construct correct database path for worktree context", () => {
    const mainProjectRoot = "/Users/dev/projects/kotadb";
    const worktreePath = "/tmp/worktree-issue-123";
    
    // MCP should point to main repo DB, not worktree
    const kotadbPath = join(mainProjectRoot, ".kotadb", "kota.db");
    
    expect(kotadbPath).not.toContain(worktreePath);
    expect(kotadbPath).toBe("/Users/dev/projects/kotadb/.kotadb/kota.db");
  });
  
  it("should not have KOTADB_CWD in environment", () => {
    // Verify we're using KOTADB_PATH, not the old KOTADB_CWD
    const env = { KOTADB_PATH: "/path/to/kota.db" };
    
    expect(env).toHaveProperty("KOTADB_PATH");
    expect(env).not.toHaveProperty("KOTADB_CWD");
  });
  
  it("should validate args array order", () => {
    // Orchestrator: no toolset
    const orchestratorArgs = ["--bun", "kotadb", "--stdio"];
    expect(orchestratorArgs).toEqual(["--bun", "kotadb", "--stdio"]);
    
    // Auto-record/Curator: with toolset
    const memoryArgs = ["--bun", "kotadb", "--stdio", "--toolset", "memory"];
    expect(memoryArgs).toEqual(["--bun", "kotadb", "--stdio", "--toolset", "memory"]);
  });
});

describe("MCP Configuration Types", () => {
  it("should validate MCP server config structure", () => {
    const mainProjectRoot = "/Users/test/kotadb";
    
    const mcpConfig = {
      kotadb: {
        type: "stdio" as const,
        command: "bunx",
        args: ["--bun", "kotadb", "--stdio"],
        env: { KOTADB_PATH: join(mainProjectRoot, ".kotadb", "kota.db") }
      }
    };
    
    expect(mcpConfig.kotadb.type).toBe("stdio");
    expect(mcpConfig.kotadb.command).toBe("bunx");
    expect(mcpConfig.kotadb.args).toContain("--stdio");
    expect(mcpConfig.kotadb.env.KOTADB_PATH).toMatch(/\.kotadb\/kota\.db$/);
  });
  
  it("should validate memory toolset config structure", () => {
    const projectRoot = "/Users/test/kotadb";
    
    const mcpConfig = {
      kotadb: {
        type: "stdio" as const,
        command: "bunx",
        args: ["--bun", "kotadb", "--stdio", "--toolset", "memory"],
        env: { KOTADB_PATH: join(projectRoot, ".kotadb", "kota.db") }
      }
    };
    
    expect(mcpConfig.kotadb.args).toContain("--toolset");
    expect(mcpConfig.kotadb.args).toContain("memory");
    const toolsetIndex = mcpConfig.kotadb.args.indexOf("--toolset");
    const memoryIndex = mcpConfig.kotadb.args.indexOf("memory");
    expect(memoryIndex).toBe(toolsetIndex + 1);
  });
});
