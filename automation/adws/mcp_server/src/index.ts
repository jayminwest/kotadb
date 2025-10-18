/**
 * ADW MCP Server entry point
 *
 * Bootstraps Express HTTP server with MCP endpoint
 */

import express, { Request, Response } from "express";
import { createAdwMcpServer, createAdwMcpTransport } from "./server.js";
import { getPythonExecutable } from "./utils/python.js";

const PORT = process.env.ADW_MCP_PORT || 4000;

const app = express();

// JSON body parser for MCP requests
app.use(express.json());

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", server: "kotadb-adw" });
});

// MCP endpoint
app.post("/mcp", async (req: Request, res: Response) => {
  // TODO: Add authentication middleware (API key validation)
  // For now, allow all requests for development

  try {
    // Create per-request server instance (stateless mode)
    const server = createAdwMcpServer();
    const transport = createAdwMcpTransport();

    // Connect server to transport
    await server.connect(transport);

    // Register cleanup on response close
    res.on("close", () => {
      transport.close();
    });

    // SDK transport handles request/response
    // Pass req.body as third parameter (parsed by express.json())
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    // Only send error if headers haven't been sent yet
    if (!res.headersSent) {
      console.error("MCP handler error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.listen(PORT, () => {
  const pythonPath = getPythonExecutable();
  console.log(`ADW MCP server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Using Python executable: ${pythonPath}`);

  if (!process.env.PYTHON_PATH) {
    console.warn("WARNING: PYTHON_PATH environment variable not set. Using default 'python3' from system PATH.");
    console.warn("For production use, set PYTHON_PATH to absolute path of Python executable.");
  }
});
