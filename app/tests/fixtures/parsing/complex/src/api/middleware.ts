/**
 * Middleware functions for API routes
 */

export type Request = {
	path: string;
	method: string;
	headers: Record<string, string>;
	body?: any;
};

export type Response = {
	status: number;
	body: any;
};

export type NextFunction = () => void;
export type MiddlewareHandler = (
	req: Request,
	res: Response,
	next: NextFunction,
) => void;

/**
 * Logs incoming requests
 */
export function loggingMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
): void {
	console.log(`${req.method} ${req.path}`);
	next();
}

/**
 * Validates authentication token
 * @param req - Request object
 * @returns True if authenticated
 */
export function isAuthenticated(req: Request): boolean {
	const authHeader = req.headers.authorization;
	return authHeader?.startsWith("Bearer ") ?? false;
}

/**
 * Authentication middleware
 */
export const authMiddleware: MiddlewareHandler = (req, res, next) => {
	if (!isAuthenticated(req)) {
		res.status = 401;
		res.body = { error: "Unauthorized" };
		return;
	}
	next();
};

/**
 * CORS middleware with configurable origins
 */
export function corsMiddleware(allowedOrigins: string[]): MiddlewareHandler {
	return (req, res, next) => {
		const origin = req.headers.origin;
		if (origin && allowedOrigins.includes(origin)) {
			res.body = {
				...res.body,
				headers: { "Access-Control-Allow-Origin": origin },
			};
		}
		next();
	};
}

/**
 * Error handling wrapper
 */
export const wrapAsync = (handler: MiddlewareHandler): MiddlewareHandler => {
	return async (req, res, next) => {
		try {
			await handler(req, res, next);
		} catch (error) {
			res.status = 500;
			res.body = { error: "Internal server error" };
		}
	};
};
