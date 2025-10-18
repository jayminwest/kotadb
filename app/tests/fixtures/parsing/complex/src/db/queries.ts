/**
 * Database query functions
 */

import {
	type Comment,
	type InsertInput,
	type Post,
	type QueryOptions,
	TableName,
	type TableRow,
	type UpdateInput,
	type User,
} from "./schema";

/**
 * Generic database client interface
 */
export interface DatabaseClient {
	query<T>(sql: string, params?: any[]): Promise<T[]>;
	execute(sql: string, params?: any[]): Promise<void>;
}

/**
 * Query result type
 */
export type QueryResult<T> = {
	rows: T[];
	count: number;
};

/**
 * Base repository class for database operations
 */
export class Repository<T extends TableName> {
	constructor(
		private client: DatabaseClient,
		private tableName: T,
	) {}

	/**
	 * Find all records matching options
	 */
	async findMany(
		options?: QueryOptions<TableRow<T>>,
	): Promise<QueryResult<TableRow<T>>> {
		const sql = this.buildSelectQuery(options);
		const rows = await this.client.query<TableRow<T>>(sql);
		return { rows, count: rows.length };
	}

	/**
	 * Find one record by ID
	 */
	async findById(id: string): Promise<TableRow<T> | null> {
		const sql = `SELECT * FROM ${this.tableName} WHERE id = $1`;
		const rows = await this.client.query<TableRow<T>>(sql, [id]);
		return rows[0] || null;
	}

	/**
	 * Insert a new record
	 */
	async insert(data: InsertInput<TableRow<T>>): Promise<TableRow<T>> {
		const sql = this.buildInsertQuery(data);
		const rows = await this.client.query<TableRow<T>>(sql);
		if (!rows[0]) {
			throw new Error("Insert failed - no rows returned");
		}
		return rows[0];
	}

	/**
	 * Update a record by ID
	 */
	async update(
		id: string,
		data: UpdateInput<TableRow<T>>,
	): Promise<TableRow<T> | null> {
		const sql = this.buildUpdateQuery(id, data);
		const rows = await this.client.query<TableRow<T>>(sql);
		return rows[0] || null;
	}

	/**
	 * Delete a record by ID
	 */
	async delete(id: string): Promise<boolean> {
		const sql = `DELETE FROM ${this.tableName} WHERE id = $1`;
		await this.client.execute(sql, [id]);
		return true;
	}

	/**
	 * Build SELECT query from options
	 */
	private buildSelectQuery(options?: QueryOptions<TableRow<T>>): string {
		let sql = `SELECT * FROM ${this.tableName}`;

		if (options?.where) {
			sql += " WHERE " + this.buildWhereClause(options.where);
		}

		if (options?.orderBy && options.orderBy.length > 0) {
			const orderClauses = options.orderBy.map(
				(o) => `${String(o.field)} ${o.direction}`,
			);
			sql += ` ORDER BY ${orderClauses.join(", ")}`;
		}

		if (options?.pagination) {
			const { limit, offset } = options.pagination;
			if (limit) sql += ` LIMIT ${limit}`;
			if (offset) sql += ` OFFSET ${offset}`;
		}

		return sql;
	}

	/**
	 * Build WHERE clause from filter
	 */
	private buildWhereClause(where: any): string {
		// Simplified WHERE clause builder
		return "1=1";
	}

	/**
	 * Build INSERT query
	 */
	private buildInsertQuery(data: any): string {
		return `INSERT INTO ${this.tableName} DEFAULT VALUES RETURNING *`;
	}

	/**
	 * Build UPDATE query
	 */
	private buildUpdateQuery(id: string, data: any): string {
		return `UPDATE ${this.tableName} SET updated_at = NOW() WHERE id = $1 RETURNING *`;
	}
}

/**
 * Create typed repositories for each table
 */
export const createUserRepository = (client: DatabaseClient) =>
	new Repository<TableName.Users>(client, TableName.Users);

export const createPostRepository = (client: DatabaseClient) =>
	new Repository<TableName.Posts>(client, TableName.Posts);

export const createCommentRepository = (client: DatabaseClient) =>
	new Repository<TableName.Comments>(client, TableName.Comments);

/**
 * Helper function for transaction execution
 */
export async function withTransaction<T>(
	client: DatabaseClient,
	callback: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
	await client.execute("BEGIN");
	try {
		const result = await callback(client);
		await client.execute("COMMIT");
		return result;
	} catch (error) {
		await client.execute("ROLLBACK");
		throw error;
	}
}

/**
 * Batch insert helper
 */
export const batchInsert = async <T>(
	repository: Repository<any>,
	records: T[],
): Promise<void> => {
	for (const record of records) {
		await repository.insert(record as any);
	}
};
