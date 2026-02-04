/**
 * Auto-recording functions for workflow outcomes
 * 
 * Automatically records successful and failed workflows to KotaDB memory tools
 * for future workflow learning.
 * 
 * Issue: #148 - Deep KotaDB Integration
 */
import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import type { WorkflowLogger } from "./logger.ts";
import type { ConsoleReporter } from "./reporter.ts";
import { getAllWorkflowContexts } from "./context.ts";

export interface AutoRecordSuccessOptions {
  workflowId: string;
  issueNumber: number;
  domain: string;
  filesModified: string[];
  projectRoot: string;
  logger: WorkflowLogger;
  reporter: ConsoleReporter;
}

export interface AutoRecordFailureOptions {
  workflowId: string;
  issueNumber: number;
  domain: string;
  error: string;
  projectRoot: string;
  logger: WorkflowLogger;
  reporter: ConsoleReporter;
}

/**
 * Auto-record successful workflow as a decision
 */
export async function autoRecordSuccess(options: AutoRecordSuccessOptions): Promise<void> {
  const { workflowId, issueNumber, domain, filesModified, projectRoot, logger, reporter } = options;
  
  reporter.logProgress("Recording workflow success...");
  logger.logEvent("AUTO_RECORD_START", { workflow_id: workflowId, type: "decision" });
  
  // Retrieve all workflow contexts
  const contexts = getAllWorkflowContexts(workflowId);
  const contextSummary = contexts.map(c => `${c.phase}: ${c.summary}`).join('\n');
  
  const prompt = `Record this successful workflow as an architectural decision:

Issue: #${issueNumber}
Domain: ${domain}
Files Modified: ${filesModified.join(', ')}

Workflow Context:
${contextSummary}

Use record_decision tool with:
- title: "Implemented ${domain} changes for #${issueNumber}"
- context: "Automated workflow completed successfully"
- decision: [Brief summary of what was implemented]
- scope: "pattern"
- related_files: [${filesModified.map(f => `"${f}"`).join(', ')}]
`;

  const sdkOptions = {
    model: "claude-haiku-4-5-20251001",
    maxTurns: 5,
    cwd: projectRoot,
    permissionMode: "bypassPermissions" as const,
    mcpServers: {
      kotadb: {
        type: "stdio" as const,
        command: "bunx",
        args: ["--bun", "kotadb", "--toolset", "memory"],
        env: { KOTADB_CWD: projectRoot }
      }
    },
    stderr: (data: string) => {
      logger.logEvent("AUTO_RECORD_SDK_STDERR", { data });
    }
  };
  
  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options: sdkOptions })) {
    messages.push(message);
    logger.addMessage(message);
  }
  
  logger.logEvent("AUTO_RECORD_COMPLETE", { workflow_id: workflowId, type: "decision" });
  reporter.logKeyAction("Recorded workflow success as decision");
}

/**
 * Auto-record failed workflow as a failure
 */
export async function autoRecordFailure(options: AutoRecordFailureOptions): Promise<void> {
  const { workflowId, issueNumber, domain, error, projectRoot, logger, reporter } = options;
  
  reporter.logProgress("Recording workflow failure...");
  logger.logEvent("AUTO_RECORD_START", { workflow_id: workflowId, type: "failure" });
  
  // Retrieve all workflow contexts
  const contexts = getAllWorkflowContexts(workflowId);
  const contextSummary = contexts.map(c => `${c.phase}: ${c.summary}`).join('\n');
  
  const prompt = `Record this failed workflow as a failure for future reference:

Issue: #${issueNumber}
Domain: ${domain}
Error: ${error}

Workflow Context:
${contextSummary}

Use record_failure tool with:
- title: "Failed ${domain} workflow for #${issueNumber}"
- problem: "Automated workflow failed during execution"
- approach: [What was attempted based on context]
- failure_reason: "${error}"
`;

  const sdkOptions = {
    model: "claude-haiku-4-5-20251001",
    maxTurns: 5,
    cwd: projectRoot,
    permissionMode: "bypassPermissions" as const,
    mcpServers: {
      kotadb: {
        type: "stdio" as const,
        command: "bunx",
        args: ["--bun", "kotadb", "--toolset", "memory"],
        env: { KOTADB_CWD: projectRoot }
      }
    },
    stderr: (data: string) => {
      logger.logEvent("AUTO_RECORD_SDK_STDERR", { data });
    }
  };
  
  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt, options: sdkOptions })) {
    messages.push(message);
    logger.addMessage(message);
  }
  
  logger.logEvent("AUTO_RECORD_COMPLETE", { workflow_id: workflowId, type: "failure" });
  reporter.logKeyAction("Recorded workflow failure for learning");
}
