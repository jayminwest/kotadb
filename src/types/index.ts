import type { Database } from "bun:sqlite";

export interface IndexRequest {
  repository: string;
  ref?: string;
  localPath?: string;
}

export interface IndexedFile {
  id?: number;
  projectRoot: string;
  path: string;
  content: string;
  dependencies: string[];
  indexedAt: Date;
}

export interface ApiContext {
  db: Database;
}
