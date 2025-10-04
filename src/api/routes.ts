import { existsSync } from "node:fs";
import { Database } from "bun:sqlite";
import type { IndexRequest } from "@shared/index";
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

export interface Router {
  handle: (request: Request) => Promise<Response> | Response;
}

export function createRouter(db: Database): Router {
  return {
    handle: async (request: Request) => {
      const { pathname, searchParams } = new URL(request.url);

      if (request.method === "GET" && pathname === "/health") {
        return json({ status: "ok", timestamp: new Date().toISOString() });
      }

      if (request.method === "POST" && pathname === "/index") {
        return handleIndexRequest(db, request);
      }

      if (request.method === "GET" && pathname === "/search") {
        const term = searchParams.get("term");
        if (!term) {
          return json({ error: "Missing term query parameter" }, 400);
        }

        const projectRoot = searchParams.get("project");
        const limit = searchParams.get("limit");
        const results = searchFiles(db, term, {
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
        return json({ results: listRecentFiles(db, limit) });
      }

      return json({ error: "Not found" }, 404);
    }
  };
}

async function handleIndexRequest(db: Database, request: Request): Promise<Response> {
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

  const runId = recordIndexRun(db, indexRequest);

  queueMicrotask(() =>
    runIndexingWorkflow(db, indexRequest, runId).catch((error) => {
      console.error("Indexing workflow failed", error);
      updateIndexRunStatus(db, runId, "failed");
    })
  );

  return json({ runId }, 202);
}

async function runIndexingWorkflow(db: Database, request: IndexRequest, runId: number): Promise<void> {
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

  saveIndexedFiles(db, records);
  updateIndexRunStatus(db, runId, "completed");
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
