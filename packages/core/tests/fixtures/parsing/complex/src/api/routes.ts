/**
 * Route configuration and registration
 * Circular dependency with handlers.ts (routes import handlers, handlers import route types)
 */

import { type Handler, createHandler, handlerRegistry } from "./handlers"; // Circular: handlers imports RouteConfig from this file
import type { MiddlewareHandler } from "./middleware";
import { authMiddleware, loggingMiddleware } from "./middleware";

/**
 * HTTP methods enum-like type
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Route configuration
 */
export interface RouteConfig {
	path: string;
	method: HttpMethod;
	handler: Handler;
	middleware?: MiddlewareHandler[];
	description?: string;
}

/**
 * Route registry class
 */
export class RouteRegistry {
	private routes: Map<string, RouteConfig> = new Map();

	/**
	 * Register a new route
	 */
	register(config: RouteConfig): void {
		const key = `${config.method}:${config.path}`;
		this.routes.set(key, config);
	}

	/**
	 * Find route by method and path
	 */
	find(method: HttpMethod, path: string): RouteConfig | undefined {
		const key = `${method}:${path}`;
		return this.routes.get(key);
	}

	/**
	 * Get all registered routes
	 */
	getAll(): RouteConfig[] {
		return Array.from(this.routes.values());
	}

	/**
	 * Clear all routes
	 */
	clear(): void {
		this.routes.clear();
	}
}

/**
 * Create default route registry with standard routes
 */
export function createRouteRegistry(): RouteRegistry {
	const registry = new RouteRegistry();

	// Health check route
	registry.register({
		path: "/health",
		method: "GET",
		handler: handlerRegistry.get("health")!,
		middleware: [loggingMiddleware],
		description: "Health check endpoint",
	});

	// List users route
	registry.register({
		path: "/users",
		method: "GET",
		handler: handlerRegistry.get("list")!,
		middleware: [loggingMiddleware, authMiddleware],
		description: "List all users",
	});

	// Create user route
	registry.register({
		path: "/users",
		method: "POST",
		handler: handlerRegistry.get("create")!,
		middleware: [loggingMiddleware, authMiddleware],
		description: "Create new user",
	});

	return registry;
}

/**
 * Route builder fluent API
 */
export class RouteBuilder {
	private config: Partial<RouteConfig> = {};

	path(path: string): RouteBuilder {
		this.config.path = path;
		return this;
	}

	method(method: HttpMethod): RouteBuilder {
		this.config.method = method;
		return this;
	}

	handler(type: string): RouteBuilder {
		this.config.handler = createHandler(type);
		return this;
	}

	use(...middleware: MiddlewareHandler[]): RouteBuilder {
		this.config.middleware = [...(this.config.middleware || []), ...middleware];
		return this;
	}

	describe(description: string): RouteBuilder {
		this.config.description = description;
		return this;
	}

	build(): RouteConfig {
		if (!this.config.path || !this.config.method || !this.config.handler) {
			throw new Error("Missing required route configuration");
		}
		return this.config as RouteConfig;
	}
}

/**
 * Helper to create route builder
 */
export const route = (): RouteBuilder => new RouteBuilder();

/**
 * Default export for convenience
 */
export default createRouteRegistry;
