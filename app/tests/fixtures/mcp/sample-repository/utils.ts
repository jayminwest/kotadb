/**
 * Sample utility functions for testing
 */

export function formatUserName(firstName: string, lastName: string): string {
	return `${firstName} ${lastName}`;
}

export function validateEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function generateUserId(): string {
	return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
