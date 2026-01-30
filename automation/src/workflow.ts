/**
 * Claude Agent SDK integration for workflow execution
 */
import { query, type SDKMessage, type SDKResultMessage, type SDKSystemMessage, type SDKAssistantMessage } from "@anthropic-ai/claude-code";
import { dirname } from "node:path";

export interface WorkflowResult {
  success: boolean;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  prUrl: string | null;
  errorMessage: string | null;
}

function extractPrUrl(text: string): string | null {
  // Match GitHub PR URLs
  const prUrlPattern = /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;
  const match = text.match(prUrlPattern);
  return match ? match[0] : null;
}

function getProjectRoot(): string {
  // automation/src/workflow.ts -> automation -> project root
  return dirname(dirname(import.meta.dir));
}

function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === "system" && "subtype" in msg && msg.subtype === "init";
}

function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === "result";
}

function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === "assistant";
}

export async function runWorkflow(
  issueNumber: number,
  dryRun = false
): Promise<WorkflowResult> {
  const result: WorkflowResult = {
    success: false,
    sessionId: null,
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: 0,
    prUrl: null,
    errorMessage: null,
  };

  const prompt = dryRun
    ? `/do #${issueNumber} --dry-run`
    : `/do #${issueNumber}`;

  const projectRoot = getProjectRoot();

  try {
    const messages: SDKMessage[] = [];

    for await (const message of query({
      prompt,
      options: {
        maxTurns: 100,
        cwd: projectRoot,
        permissionMode: "bypassPermissions",
        mcpServers: {
          kotadb: {
            type: "stdio",
            command: "bunx",
            args: ["--bun", "kotadb"],
            env: {
              KOTADB_CWD: projectRoot,
            },
          },
        },
      },
    })) {
      messages.push(message);

      // Extract session ID from init message
      if (isSystemMessage(message)) {
        result.sessionId = message.session_id;
      }

      // Log progress to stderr
      if (isAssistantMessage(message)) {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              process.stderr.write(".");
            }
          }
        }
      }

      // Track token usage from result messages
      if (isResultMessage(message)) {
        result.inputTokens = message.usage.input_tokens;
        result.outputTokens = message.usage.output_tokens;
        result.totalCostUsd = message.total_cost_usd;
        result.success = !message.is_error;
      }
    }

    process.stderr.write("\n");

    // Check for PR URL in final messages
    const lastAssistant = messages.filter(isAssistantMessage).pop();

    if (lastAssistant) {
      const content = lastAssistant.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            const prUrl = extractPrUrl(block.text);
            if (prUrl) {
              result.prUrl = prUrl;
            }
          }
        }
      }
    }
  } catch (error) {
    result.success = false;
    result.errorMessage =
      error instanceof Error ? error.message : String(error);
  }

  return result;
}
