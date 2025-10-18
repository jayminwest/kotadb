/**
 * MCP lifecycle handlers (initialize, capability negotiation)
 */

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
}
