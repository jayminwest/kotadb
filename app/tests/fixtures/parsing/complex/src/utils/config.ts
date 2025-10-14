/**
 * Configuration management with type references
 */

import type { DatabaseConfig } from "../db/client";
import type { LoggerConfig } from "./logger";

/**
 * Server configuration
 */
export interface ServerConfig {
	host: string;
	port: number;
	cors: {
		enabled: boolean;
		origins: string[];
	};
	rateLimit?: {
		windowMs: number;
		max: number;
	};
}

/**
 * Application configuration combining all sub-configs
 */
export interface AppConfig {
	environment: "development" | "staging" | "production";
	server: ServerConfig;
	database: DatabaseConfig;
	logger: LoggerConfig;
}

/**
 * Default configuration for development
 */
export const defaultConfig: AppConfig = {
	environment: "development",
	server: {
		host: "localhost",
		port: 3000,
		cors: {
			enabled: true,
			origins: ["http://localhost:3000"],
		},
	},
	database: {
		host: "localhost",
		port: 5432,
		database: "test_db",
		user: "postgres",
		password: "postgres",
		ssl: false,
		poolSize: 10,
	},
	logger: {
		level: 1, // INFO
		format: "text",
		destination: "console",
	},
};

/**
 * Configuration loader class
 */
export class ConfigLoader {
	private config: AppConfig;

	constructor(initialConfig?: Partial<AppConfig>) {
		this.config = { ...defaultConfig, ...initialConfig };
	}

	/**
	 * Get the full configuration
	 */
	getConfig(): AppConfig {
		return { ...this.config };
	}

	/**
	 * Get server configuration
	 */
	getServerConfig(): ServerConfig {
		return { ...this.config.server };
	}

	/**
	 * Get database configuration
	 */
	getDatabaseConfig(): DatabaseConfig {
		return { ...this.config.database };
	}

	/**
	 * Get logger configuration
	 */
	getLoggerConfig(): LoggerConfig {
		return { ...this.config.logger };
	}

	/**
	 * Update configuration
	 */
	update(updates: Partial<AppConfig>): void {
		this.config = { ...this.config, ...updates };
	}

	/**
	 * Load configuration from environment variables
	 */
	loadFromEnv(): void {
		// Example environment variable parsing
		if (process.env.PORT) {
			this.config.server.port = Number.parseInt(process.env.PORT, 10);
		}

		if (process.env.DATABASE_URL) {
			const url = new URL(process.env.DATABASE_URL);
			this.config.database.host = url.hostname;
			this.config.database.port = Number.parseInt(url.port, 10);
		}
	}

	/**
	 * Validate configuration
	 */
	validate(): boolean {
		const errors: string[] = [];

		if (this.config.server.port < 1 || this.config.server.port > 65535) {
			errors.push("Invalid server port");
		}

		if (!this.config.database.host) {
			errors.push("Database host is required");
		}

		if (errors.length > 0) {
			throw new Error(`Configuration validation failed: ${errors.join(", ")}`);
		}

		return true;
	}
}

/**
 * Global configuration instance
 */
let globalConfig: ConfigLoader | null = null;

/**
 * Initialize global configuration
 */
export function initConfig(config?: Partial<AppConfig>): ConfigLoader {
	if (!globalConfig) {
		globalConfig = new ConfigLoader(config);
		globalConfig.loadFromEnv();
		globalConfig.validate();
	}
	return globalConfig;
}

/**
 * Get global configuration
 */
export function getConfig(): AppConfig {
	if (!globalConfig) {
		throw new Error("Configuration not initialized. Call initConfig first.");
	}
	return globalConfig.getConfig();
}

/**
 * Helper to get specific config sections
 */
export const config = {
	server: (): ServerConfig =>
		globalConfig?.getServerConfig() || defaultConfig.server,
	database: (): DatabaseConfig =>
		globalConfig?.getDatabaseConfig() || defaultConfig.database,
	logger: (): LoggerConfig =>
		globalConfig?.getLoggerConfig() || defaultConfig.logger,
};
