/**
 * Database client initialization and re-exports
 * Demonstrates export * pattern for re-exporting
 */

import type { DatabaseClient } from "./queries";

/**
 * Re-export all types and functions from queries module
 */
export * from "./queries";

/**
 * Re-export schema types
 */
export type { User, Post, Comment, TableName } from "./schema";

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
	host: string;
	port: number;
	database: string;
	user: string;
	password: string;
	ssl?: boolean;
	poolSize?: number;
}

/**
 * Connection pool class
 */
export class ConnectionPool {
	private connections: DatabaseClient[] = [];
	private available: DatabaseClient[] = [];

	constructor(
		private config: DatabaseConfig,
		private maxPoolSize = 10,
	) {}

	/**
	 * Initialize the connection pool
	 */
	async initialize(): Promise<void> {
		for (let i = 0; i < this.maxPoolSize; i++) {
			const client = await this.createConnection();
			this.connections.push(client);
			this.available.push(client);
		}
	}

	/**
	 * Acquire a connection from the pool
	 */
	async acquire(): Promise<DatabaseClient> {
		if (this.available.length === 0) {
			throw new Error("No available connections in pool");
		}
		return this.available.pop()!;
	}

	/**
	 * Release a connection back to the pool
	 */
	release(client: DatabaseClient): void {
		this.available.push(client);
	}

	/**
	 * Close all connections
	 */
	async close(): Promise<void> {
		this.connections = [];
		this.available = [];
	}

	/**
	 * Create a new database connection
	 */
	private async createConnection(): Promise<DatabaseClient> {
		// Mock implementation
		return {
			query: async <T>(sql: string, params?: any[]): Promise<T[]> => [],
			execute: async (sql: string, params?: any[]): Promise<void> => {},
		};
	}
}

/**
 * Global connection pool instance
 */
let globalPool: ConnectionPool | null = null;

/**
 * Initialize global database connection
 */
export async function initializeDatabase(
	config: DatabaseConfig,
): Promise<ConnectionPool> {
	if (globalPool) {
		return globalPool;
	}

	globalPool = new ConnectionPool(config);
	await globalPool.initialize();
	return globalPool;
}

/**
 * Get the global connection pool
 */
export function getPool(): ConnectionPool {
	if (!globalPool) {
		throw new Error("Database not initialized. Call initializeDatabase first.");
	}
	return globalPool;
}

/**
 * Get a database client from the pool
 */
export async function getClient(): Promise<DatabaseClient> {
	const pool = getPool();
	return pool.acquire();
}

/**
 * Release a client back to the pool
 */
export function releaseClient(client: DatabaseClient): void {
	const pool = getPool();
	pool.release(client);
}

/**
 * Close database connections
 */
export async function closeDatabase(): Promise<void> {
	if (globalPool) {
		await globalPool.close();
		globalPool = null;
	}
}

/**
 * Helper function to execute query with automatic client management
 */
export async function executeQuery<T>(
	callback: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
	const client = await getClient();
	try {
		return await callback(client);
	} finally {
		releaseClient(client);
	}
}
