import type { Result, User } from "./types";

/**
 * Formats a user's display name
 * @param user - The user object
 * @returns Formatted display name
 */
export function formatUserName(user: User): string {
	return `${user.name} <${user.email}>`;
}

/**
 * Validates an email address
 * @param email - Email string to validate
 * @returns True if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Creates a success result
 * @param data - The success data
 * @returns Result object with success status
 */
export function ok<T>(data: T): Result<T> {
	return { success: true, data };
}

/**
 * Creates an error result
 * @param error - The error message
 * @returns Result object with error status
 */
export function err<T>(error: string): Result<T> {
	return { success: false, error };
}

/**
 * Arrow function for demonstration
 */
export const doubleNumber = (n: number): number => n * 2;

/**
 * Async function example
 */
export async function fetchUserById(id: string): Promise<User | null> {
	// Simulated async operation
	return null;
}
