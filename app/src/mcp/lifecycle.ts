/**
 * MCP lifecycle handlers (initialize, capability negotiation)
 */

import { createLogger } from "@logging/logger.js";
import { Sentry } from "../instrument.js";

const logger = createLogger({ module: "mcp-lifecycle" });

export interface ClientInfo {
	name: string;
	version: string;
}

export interface InitializeRequest {
	protocolVersion: string;
	capabilities: Record<string, unknown>;
	clientInfo: ClientInfo;
}

export interface ServerInfo {
	name: string;
	version: string;
}

export interface ToolCapability {
	listChanged?: boolean;
}

export interface ServerCapabilities {
	tools?: ToolCapability;
	resources?: Record<string, unknown>;
	prompts?: Record<string, unknown>;
}

export interface InitializeResult {
	protocolVersion: string;
	capabilities: ServerCapabilities;
	serverInfo: ServerInfo;
}

/**
 * Handle initialize request from MCP client
 */
export function handleInitialize(_params: InitializeRequest): InitializeResult {
	try {
		logger.info("MCP server initialization", {
			client_name: _params.clientInfo.name,
			client_version: _params.clientInfo.version,
			protocol_version: _params.protocolVersion,
		});

		return {
			protocolVersion: "2025-06-18",
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
			serverInfo: {
				name: "kotadb",
				version: "0.1.0",
			},
		};
	} catch (error) {
		logger.error(
			"MCP server initialization failed",
			error instanceof Error ? error : new Error(String(error)),
		);
		Sentry.captureException(error);
		throw error;
	}
}
