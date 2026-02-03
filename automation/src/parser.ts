/**
 * Parser utilities for extracting structured data from agent outputs
 */
import type { SDKMessage, SDKAssistantMessage } from "@anthropic-ai/claude-code";

/**
 * Parse github-question-agent analysis output
 */
export function parseAnalysis(output: string): {
  domain: string;
  requirements: string;
  issueType: string;
} {
  const domainMatch = output.match(/\*\*Domain\*\*:\s*(\S+)/);
  const typeMatch = output.match(/\*\*Type\*\*:\s*(\S+)/);
  
  // Extract requirements section
  const reqMatch = output.match(/\*\*Requirements\*\*:\s*([\s\S]*?)(?=\*\*|$)/);
  
  return {
    domain: domainMatch?.[1] || "github",
    requirements: reqMatch?.[1]?.trim() || output,
    issueType: typeMatch?.[1] || "unknown"
  };
}

/**
 * Extract spec path from plan-agent output
 */
export function extractSpecPath(output: string): string {
  // Match absolute paths to markdown files in docs/specs/
  const pathPattern = /\/[^\s]+\/docs\/specs\/[^\s]+\.md/;
  const match = output.match(pathPattern);
  
  if (!match) {
    throw new Error("Spec path not found in plan-agent output");
  }
  
  return match[0];
}

/**
 * Extract modified file paths from build-agent output
 */
export function extractFilePaths(output: string): string[] {
  // Match absolute paths
  const pathPattern = /\/[^\s]+\.(ts|js|md|yaml|json)/g;
  const matches = output.match(pathPattern);
  
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Extract text content from SDK messages
 */
export function extractTextFromMessages(messages: SDKMessage[]): string {
  const textBlocks: string[] = [];
  
  for (const message of messages) {
    if (message.type === "assistant") {
      const assistantMsg = message as SDKAssistantMessage;
      const content = assistantMsg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            textBlocks.push(block.text);
          }
        }
      }
    }
  }
  
  return textBlocks.join("\n\n");
}
