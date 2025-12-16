/**
 * Request handlers for API routes
 * Circular dependency with routes.ts (handlers import route types, routes import handlers)
 */

import type { Request, Response } from "./middleware";
import type { RouteConfig } from "./routes"; // Circular: routes imports handlers, handlers imports route types

/**
 * Handler result type
 */
export type HandlerResult = {
	status: number;
	data: any;
};

/**
 * Base handler interface
 */
export interface Handler {
	handle(req: Request): Promise<HandlerResult>;
}

/**
 * Health check handler
 */
export class HealthCheckHandler implements Handler {
	async handle(req: Request): Promise<HandlerResult> {
		return {
			status: 200,
			data: { status: "healthy", timestamp: Date.now() },
		};
	}
}

/**
 * User list handler
 */
export class ListUsersHandler implements Handler {
	async handle(req: Request): Promise<HandlerResult> {
		// Simulated database query
		const users = [
			{ id: "1", name: "Alice" },
			{ id: "2", name: "Bob" },
		];
		return { status: 200, data: { users } };
	}
}

/**
 * Create user handler with validation
 */
export class CreateUserHandler implements Handler {
	async handle(req: Request): Promise<HandlerResult> {
		const { name, email } = req.body || {};

		if (!name || !email) {
			return { status: 400, data: { error: "Missing required fields" } };
		}

		const newUser = { id: crypto.randomUUID(), name, email };
		return { status: 201, data: { user: newUser } };
	}
}

/**
 * Factory function for handler instantiation
 */
export function createHandler(type: string): Handler {
	switch (type) {
		case "health":
			return new HealthCheckHandler();
		case "list":
			return new ListUsersHandler();
		case "create":
			return new CreateUserHandler();
		default:
			throw new Error(`Unknown handler type: ${type}`);
	}
}

/**
 * Handler registry for dynamic lookup
 */
export const handlerRegistry = new Map<string, Handler>([
	["health", new HealthCheckHandler()],
	["list", new ListUsersHandler()],
	["create", new CreateUserHandler()],
]);

/**
 * Anonymous function for error formatting
 */
const formatError = (error: Error): HandlerResult => ({
	status: 500,
	data: { error: error.message, stack: error.stack },
});

export { formatError };

/**
 * Arrow function for success response
 */
export const successResponse = (data: any, status = 200): HandlerResult => ({
	status,
	data,
});
