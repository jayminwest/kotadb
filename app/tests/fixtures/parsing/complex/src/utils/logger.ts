/**
 * Logging utility with multiple log levels
 */

/**
 * Log level enumeration
 */
export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

/**
 * Log entry structure
 */
export interface LogEntry {
	timestamp: Date;
	level: LogLevel;
	message: string;
	context?: Record<string, any>;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
	level: LogLevel;
	format?: "json" | "text";
	destination?: "console" | "file";
}

/**
 * Logger class with configurable output
 */
export class Logger {
	private config: LoggerConfig;
	private entries: LogEntry[] = [];

	constructor(config: LoggerConfig = { level: LogLevel.INFO }) {
		this.config = config;
	}

	/**
	 * Log a debug message
	 * @param message - Debug message
	 * @param context - Additional context
	 */
	debug(message: string, context?: Record<string, any>): void {
		this.log(LogLevel.DEBUG, message, context);
	}

	/**
	 * Log an info message
	 * @param message - Info message
	 * @param context - Additional context
	 */
	info(message: string, context?: Record<string, any>): void {
		this.log(LogLevel.INFO, message, context);
	}

	/**
	 * Log a warning message
	 * @param message - Warning message
	 * @param context - Additional context
	 */
	warn(message: string, context?: Record<string, any>): void {
		this.log(LogLevel.WARN, message, context);
	}

	/**
	 * Log an error message
	 * @param message - Error message
	 * @param context - Additional context or error object
	 */
	error(message: string, context?: Record<string, any>): void {
		this.log(LogLevel.ERROR, message, context);
	}

	/**
	 * Internal log method
	 */
	private log(
		level: LogLevel,
		message: string,
		context?: Record<string, any>,
	): void {
		if (level < this.config.level) {
			return;
		}

		const entry: LogEntry = {
			timestamp: new Date(),
			level,
			message,
			context,
		};

		this.entries.push(entry);
		this.output(entry);
	}

	/**
	 * Output log entry based on configuration
	 */
	private output(entry: LogEntry): void {
		const formatted =
			this.config.format === "json"
				? this.formatJson(entry)
				: this.formatText(entry);

		if (this.config.destination === "file") {
			// File output would go here
			return;
		}

		// Console output
		console.log(formatted);
	}

	/**
	 * Format log entry as JSON
	 */
	private formatJson(entry: LogEntry): string {
		return JSON.stringify(entry);
	}

	/**
	 * Format log entry as text
	 */
	private formatText(entry: LogEntry): string {
		const levelName = LogLevel[entry.level];
		const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
		return `[${entry.timestamp.toISOString()}] ${levelName}: ${entry.message}${contextStr}`;
	}

	/**
	 * Get all log entries
	 */
	getEntries(): LogEntry[] {
		return [...this.entries];
	}

	/**
	 * Clear all log entries
	 */
	clear(): void {
		this.entries = [];
	}

	/**
	 * Update logger configuration
	 */
	configure(config: Partial<LoggerConfig>): void {
		this.config = { ...this.config, ...config };
	}
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Get or create global logger
 */
export function getLogger(): Logger {
	if (!globalLogger) {
		globalLogger = new Logger();
	}
	return globalLogger;
}

/**
 * Create a child logger with specific context
 */
export function createLogger(config?: LoggerConfig): Logger {
	return new Logger(config);
}

/**
 * Convenience functions using global logger
 */
export const log = {
	debug: (message: string, context?: Record<string, any>) =>
		getLogger().debug(message, context),
	info: (message: string, context?: Record<string, any>) =>
		getLogger().info(message, context),
	warn: (message: string, context?: Record<string, any>) =>
		getLogger().warn(message, context),
	error: (message: string, context?: Record<string, any>) =>
		getLogger().error(message, context),
};
