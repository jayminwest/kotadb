/**
 * Type definitions for simple fixture
 * Contains interfaces and type aliases for testing symbol extraction
 */

/**
 * User interface with basic properties
 */
export interface User {
	id: string;
	name: string;
	email: string;
	age?: number;
}

/**
 * Product type with pricing information
 */
export type Product = {
	id: string;
	name: string;
	price: number;
	inStock: boolean;
};

/**
 * Result type for operations that may fail
 */
export type Result<T> =
	| { success: true; data: T }
	| { success: false; error: string };

/**
 * Status enum-like type
 */
export type Status = "pending" | "active" | "completed" | "cancelled";
