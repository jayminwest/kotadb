/**
 * Database schema type definitions
 */

/**
 * User entity from database
 */
export interface User {
	id: string;
	email: string;
	name: string;
	created_at: Date;
	updated_at: Date;
	is_active: boolean;
}

/**
 * Post entity
 */
export interface Post {
	id: string;
	title: string;
	content: string;
	author_id: string;
	published: boolean;
	created_at: Date;
	updated_at: Date;
}

/**
 * Comment entity
 */
export interface Comment {
	id: string;
	post_id: string;
	user_id: string;
	content: string;
	created_at: Date;
}

/**
 * Database tables enum
 */
export enum TableName {
	Users = "users",
	Posts = "posts",
	Comments = "comments",
}

/**
 * Query filter type
 */
export type WhereClause<T> = {
	[K in keyof T]?: T[K] | { $in: T[K][] } | { $gt: T[K] } | { $lt: T[K] };
};

/**
 * Order by clause
 */
export type OrderBy<T> = {
	field: keyof T;
	direction: "asc" | "desc";
};

/**
 * Pagination options
 */
export interface PaginationOptions {
	limit?: number;
	offset?: number;
}

/**
 * Query options combining filters, ordering, and pagination
 */
export interface QueryOptions<T> {
	where?: WhereClause<T>;
	orderBy?: OrderBy<T>[];
	pagination?: PaginationOptions;
}

/**
 * Database row types mapped to entities
 */
export type TableRow<T extends TableName> = T extends TableName.Users
	? User
	: T extends TableName.Posts
		? Post
		: T extends TableName.Comments
			? Comment
			: never;

/**
 * Insert input types (omit generated fields)
 */
export type InsertInput<T> = Omit<T, "id" | "created_at" | "updated_at">;

/**
 * Update input types (partial, omit timestamps)
 */
export type UpdateInput<T> = Partial<
	Omit<T, "id" | "created_at" | "updated_at">
>;
