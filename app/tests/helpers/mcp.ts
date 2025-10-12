/**
 * MCP-specific test helpers for working with SDK responses.
 *
 * The MCP SDK wraps tool results in content blocks. This module provides
 * utilities to extract and parse tool results from SDK response format.
 */

/**
 * Extract tool result from MCP SDK content block response
 *
 * The SDK returns tool results wrapped in a content block:
 * {
 *   result: {
 *     content: [
 *       { type: "text", text: "{...tool result JSON...}" }
 *     ]
 *   }
 * }
 *
 * This helper extracts and parses the JSON from the first content block.
 *
 * @param data - The JSON-RPC response object from MCP endpoint
 * @returns Parsed tool result object
 * @throws Error if content block is missing or JSON is invalid
 */
export function extractToolResult(data: any): any {
	if (!data.result) {
		throw new Error("Response missing result field");
	}

	if (!data.result.content || !Array.isArray(data.result.content)) {
		throw new Error("Response result missing content array");
	}

	if (data.result.content.length === 0) {
		throw new Error("Response content array is empty");
	}

	const firstContent = data.result.content[0];
	if (!firstContent.text) {
		throw new Error("First content block missing text field");
	}

	try {
		return JSON.parse(firstContent.text);
	} catch (err) {
		throw new Error(`Failed to parse content block text as JSON: ${err}`);
	}
}
