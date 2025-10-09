import type { SupabaseClient } from "@supabase/supabase-js";
import type { IndexRequest, AuthContext } from "@shared/index";
import { buildSnippet } from "@indexer/extractors";
import {
  ensureRepository,
  listRecentFiles,
  recordIndexRun,
  runIndexingWorkflow,
  searchFiles,
  updateIndexRunStatus
} from "./queries";
import { handleMcpRequest } from "@mcp/handler";
import { authenticateRequest } from "@auth/middleware";

export interface Router {
  handle: (request: Request) => Promise<Response> | Response;
}

export function createRouter(supabase: SupabaseClient): Router {
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
      return handleAuthenticatedRequest(supabase, request, context!, pathname, searchParams);
    }
  };
}

/**
 * Handle authenticated requests.
 * All routes here have valid AuthContext available.
 */
async function handleAuthenticatedRequest(
  supabase: SupabaseClient,
  request: Request,
  context: AuthContext,
  pathname: string,
  searchParams: URLSearchParams
): Promise<Response> {
  if (request.method === "POST" && pathname === "/index") {
    return handleIndexRequest(supabase, request, context);
  }

  if (request.method === "GET" && pathname === "/search") {
    const term = searchParams.get("term");
    if (!term) {
      return json({ error: "Missing term query parameter" }, 400);
    }

    const repositoryId = searchParams.get("repository");
    const limit = searchParams.get("limit");

    try {
      const results = await searchFiles(supabase, term, context.userId, {
        repositoryId: repositoryId ?? undefined,
        limit: limit ? Number(limit) : undefined
      });

      const resultsWithSnippets = results.map((row) => ({
        ...row,
        snippet: buildSnippet(row.content, term)
      }));

      return json({ results: resultsWithSnippets });
    } catch (error) {
      return json({ error: `Search failed: ${(error as Error).message}` }, 500);
    }
  }

  if (request.method === "GET" && pathname === "/files/recent") {
    const limit = Number(searchParams.get("limit") ?? "10");
    try {
      const results = await listRecentFiles(supabase, limit, context.userId);
      return json({ results });
    } catch (error) {
      return json({ error: `Failed to list files: ${(error as Error).message}` }, 500);
    }
  }

  if (pathname === "/mcp") {
    if (request.method === "POST") {
      return handleMcpRequest(supabase, request, context);
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
  supabase: SupabaseClient,
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

  try {
    // Find or create repository in database
    const repositoryId = await ensureRepository(supabase, context.userId, indexRequest);
    const runId = await recordIndexRun(supabase, indexRequest, context.userId, repositoryId);

    queueMicrotask(() =>
      runIndexingWorkflow(supabase, indexRequest, runId, context.userId, repositoryId).catch((error) => {
        console.error("Indexing workflow failed", error);
        updateIndexRunStatus(supabase, runId, "failed", error.message).catch(console.error);
      })
    );

    return json({ runId }, 202);
  } catch (error) {
    return json({ error: `Failed to start indexing: ${(error as Error).message}` }, 500);
  }
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
