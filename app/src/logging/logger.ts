/**
 * Structured logging with JSON format, correlation IDs, and sensitive data masking
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
	request_id?: string;
	user_id?: string;
	key_id?: string;
	job_id?: string;
	forceStderr?: boolean;
	[key: string]: unknown;
}

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: LogContext;
	error?: {
		message: string;
		stack?: string;
		code?: string;
	};
}

export interface Logger {
	debug(message: string, context?: LogContext): void;
	info(message: string, context?: LogContext): void;
	warn(message: string, context?: LogContext): void;
	error(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void;
	child(childContext: LogContext): Logger;
}

// Sensitive keys that should be masked in logs
const SENSITIVE_KEYS = [
	"apiKey",
	"api_key",
	"apikey",
	"token",
	"password",
	"secret",
	"authorization",
	"bearer",
	"key",
	"private_key",
	"privateKey",
	"client_secret",
	"clientSecret",
	"access_token",
	"accessToken",
	"refresh_token",
	"refreshToken",
	"session",
	"cookie",
];

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

/**
 * Get configured log level from environment (default: info)
 */
function getLogLevel(): LogLevel {
	const level = process.env.LOG_LEVEL?.toLowerCase();
	if (level === "debug" || level === "info" || level === "warn" || level === "error") {
		return level;
	}
	return "info";
}

/**
 * Check if a log level should be output based on configured level
 */
function shouldLog(level: LogLevel): boolean {
	const configuredLevel = getLogLevel();
	return LOG_LEVELS[level] >= LOG_LEVELS[configuredLevel];
}

/**
 * Mask sensitive data in context objects
 */
function maskSensitiveData(context: LogContext): LogContext {
	const masked: LogContext = {};
	for (const [key, value] of Object.entries(context)) {
		if (SENSITIVE_KEYS.some((sensitiveKey) => key.toLowerCase().includes(sensitiveKey))) {
			masked[key] = "[REDACTED]";
		} else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			masked[key] = maskSensitiveData(value as LogContext);
		} else {
			masked[key] = value;
		}
	}
	return masked;
}

/**
 * Format and write log entry to stdout (info/debug/warn) or stderr (error)
 */
function writeLog(entry: LogEntry, forceStderr = false): void {
	const json = JSON.stringify(entry);
	const output = `${json}\n`;

	if (forceStderr || entry.level === "error") {
		process.stderr.write(output);
	} else {
		process.stdout.write(output);
	}
}

/**
 * Create a logger instance with optional correlation context
 */
export function createLogger(baseContext?: LogContext): Logger {
	const context = baseContext ? maskSensitiveData(baseContext) : {};
	const forceStderr = context.forceStderr === true;

	return {
		debug(message: string, additionalContext?: LogContext): void {
			if (!shouldLog("debug")) return;

			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: "debug",
				message,
				context: additionalContext ? { ...context, ...maskSensitiveData(additionalContext) } : Object.keys(context).length > 0 ? context : undefined,
			};
			writeLog(entry, forceStderr);
		},

		info(message: string, additionalContext?: LogContext): void {
			if (!shouldLog("info")) return;

			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: "info",
				message,
				context: additionalContext ? { ...context, ...maskSensitiveData(additionalContext) } : Object.keys(context).length > 0 ? context : undefined,
			};
			writeLog(entry, forceStderr);
		},

		warn(message: string, additionalContext?: LogContext): void {
			if (!shouldLog("warn")) return;

			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: "warn",
				message,
				context: additionalContext ? { ...context, ...maskSensitiveData(additionalContext) } : Object.keys(context).length > 0 ? context : undefined,
			};
			writeLog(entry, forceStderr);
		},

		error(message: string, errorOrContext?: Error | LogContext, additionalContext?: LogContext): void {
			if (!shouldLog("error")) return;

			const entry: LogEntry = {
				timestamp: new Date().toISOString(),
				level: "error",
				message,
			};

			// Handle error as second parameter
			if (errorOrContext instanceof Error) {
				entry.error = {
					message: errorOrContext.message,
					stack: errorOrContext.stack,
					code: (errorOrContext as Error & { code?: string }).code,
				};
				if (additionalContext) {
					entry.context = { ...context, ...maskSensitiveData(additionalContext) };
				} else if (Object.keys(context).length > 0) {
					entry.context = context;
				}
			} else if (errorOrContext) {
				// Handle context as second parameter
				entry.context = { ...context, ...maskSensitiveData(errorOrContext) };
			} else if (Object.keys(context).length > 0) {
				entry.context = context;
			}

			writeLog(entry, forceStderr);
		},

		child(childContext: LogContext): Logger {
			return createLogger({ ...context, ...childContext });
		},
	};
}
