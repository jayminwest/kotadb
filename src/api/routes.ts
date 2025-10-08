import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import type { IndexRequest, AuthContext } from "@shared/index";
import { buildSnippet } from "@indexer/extractors";
import { discoverSources, parseSourceFile } from "@indexer/parsers";
import { prepareRepository } from "@indexer/repos";
import {
  listRecentFiles,
  recordIndexRun,
  saveIndexedFiles,
  searchFiles,
  updateIndexRunStatus
} from "./queries";
import { handleMcpRequest } from "@mcp/handler";
import { authenticateRequest } from "@auth/middleware";

export interface Router {
  handle: (request: Request) => Promise<Response> | Response;
}

export function createRouter(db: Database): Router {
  return {
    handle: async (request: Request) => {
      const { pathname, searchParams } = new URL(request.url);

      // Health check is public (no authentication required)
      if (request.method === "GET" && pathname === "/health") {
        return json({ status: "ok", timestamp: new Date().toISOString() });
      }

      // Authenticate all other requests
      const { context, response } = await authenticateRequest(request);
      if (response) {
        return response; // Authentication failed
      }

      // All routes below have authenticated context available
      return handleAuthenticatedRequest(db, request, context!, pathname, searchParams);
    }
  };
}

/**
 * Handle authenticated requests.
 * All routes here have valid AuthContext available.
 */
async function handleAuthenticatedRequest(
  db: Database,
  request: Request,
  context: AuthContext,
  pathname: string,
  searchParams: URLSearchParams
): Promise<Response> {
  if (request.method === "POST" && pathname === "/index") {
    return handleIndexRequest(db, request, context);
  }

  if (request.method === "GET" && pathname === "/search") {
    const term = searchParams.get("term");
    if (!term) {
      return json({ error: "Missing term query parameter" }, 400);
    }

    const projectRoot = searchParams.get("project");
    const limit = searchParams.get("limit");
    const results = searchFiles(db, term, context.userId, {
      projectRoot: projectRoot ?? undefined,
      limit: limit ? Number(limit) : undefined
    }).map((row) => ({
      ...row,
      snippet: buildSnippet(row.content, term)
    }));

    return json({ results });
  }

  if (request.method === "GET" && pathname === "/files/recent") {
    const limit = Number(searchParams.get("limit") ?? "10");
    return json({ results: listRecentFiles(db, limit, context.userId) });
  }

  if (pathname === "/mcp") {
    if (request.method === "POST") {
      return handleMcpRequest(db, request, context);
    }

    if (request.method === "GET") {
      return json(
        { error: "Server does not support MCP SSE streams yet" },
        405,
        { Allow: "POST" }
      );
    }

    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  }

  return json({ error: "Not found" }, 404);
}

async function handleIndexRequest(
  db: Database,
  request: Request,
  context: AuthContext
): Promise<Response> {
  let payload: Partial<IndexRequest> | null = null;

  try {
    payload = (await request.json()) as Partial<IndexRequest>;
  } catch (error) {
    return json({ error: `Invalid JSON body: ${(error as Error).message}` }, 400);
  }

  if (!payload?.repository) {
    return json({ error: "Field 'repository' is required" }, 400);
  }

  const indexRequest: IndexRequest = {
    repository: payload.repository,
    ref: payload.ref,
    localPath: payload.localPath
  };

  const runId = recordIndexRun(db, indexRequest, context.userId);

  queueMicrotask(() =>
    runIndexingWorkflow(db, indexRequest, runId, context.userId).catch((error) => {
      console.error("Indexing workflow failed", error);
      updateIndexRunStatus(db, runId, "failed");
    })
  );

  return json({ runId }, 202);
}

async function runIndexingWorkflow(
  db: Database,
  request: IndexRequest,
  runId: number,
  userId: string
): Promise<void> {
  const repo = await prepareRepository(request);

  if (!existsSync(repo.localPath)) {
    console.warn(`Indexing skipped: path ${repo.localPath} does not exist.`);
    updateIndexRunStatus(db, runId, "skipped");
    return;
  }

  const sources = await discoverSources(repo.localPath);
  const records = (
    await Promise.all(sources.map((source) => parseSourceFile(source, repo.localPath)))
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  saveIndexedFiles(db, records, userId);
  updateIndexRunStatus(db, runId, "completed");
}

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      ...extraHeaders
    }
  });
}
