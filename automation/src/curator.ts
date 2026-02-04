/**
 * Haiku-powered context curator for workflow phase transitions
 * 
 * Uses lightweight haiku model to query KotaDB memory tools (failures, patterns, decisions)
 * and produce curated ~500 token summaries for next phase injection.
 * 
 * Issue: #148 - Deep KotaDB Integration
 */
import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import { storeWorkflowContext, type WorkflowContextData } from "./context.ts";
import type { WorkflowLogger } from "./logger.ts";
import type { ConsoleReporter } from "./reporter.ts";

export interface CurationOptions {
  /** Workflow identifier */
  workflowId: string;
  
  /** Current phase (determines what to query) */
  phase: 'post-analysis' | 'post-plan' | 'post-build';
  
  /** Domain extracted from analysis */
  domain: string;
  
  /** Requirements or context from current phase */
  currentPhaseOutput: string;
  
  /** Project root for SDK execution */
  projectRoot: string;
  
  /** Logger instance */
  logger: WorkflowLogger;
  
  /** Reporter for console output */
  reporter: ConsoleReporter;
}

export interface CuratedContext {
  /** Phase this context was curated for */
  phase: string;
  
  /** Curated summary (~500 tokens) */
  summary: string;
  
  /** Relevant failures found */
  relevantFailures: string[];
  
  /** Relevant patterns found */
  relevantPatterns: string[];
  
  /** Relevant decisions found */
  relevantDecisions: string[];
  
  /** Timestamp */
  timestamp: string;
  
  /** Token count for monitoring */
  tokenCount: number;
}

interface CuratedSummary {
  summary: string;
  failures: string[];
  patterns: string[];
  decisions: string[];
}

/**
 * Curate context for next workflow phase using haiku
 * 
 * @param options - Curation options
 * @returns Curated context summary (~500 tokens)
 */
export async function curateContext(options: CurationOptions): Promise<CuratedContext> {
  const { workflowId, phase, domain, currentPhaseOutput, projectRoot, logger, reporter } = options;
  
  // Don't use reporter.startPhase/completePhase as "curation" is not a WorkflowPhase
  logger.logEvent("CURATOR_START", { workflow_id: workflowId, phase, domain });
  
  // Build haiku prompt that will query KotaDB tools
  const curatorPrompt = buildCuratorPrompt({ phase, domain, currentPhaseOutput });
  
  // Configure SDK for haiku curator call
  const sdkOptions = {
    model: "claude-haiku-3-5-20241022", // Haiku for speed and cost
    maxTurns: 20, // Lightweight - just query and summarize
    cwd: projectRoot,
    permissionMode: "bypassPermissions" as const,
    mcpServers: {
      kotadb: {
        type: "stdio" as const,
        command: "bunx",
        args: ["--bun", "kotadb", "--toolset", "memory"], // Memory tier for search tools
        env: { KOTADB_CWD: projectRoot }
      }
    },
    stderr: (data: string) => {
      // Suppress SDK output during curation
      logger.logEvent("CURATOR_SDK_STDERR", { data });
    }
  };
  
  // Execute curator query
  const messages: SDKMessage[] = [];
  for await (const message of query({ prompt: curatorPrompt, options: sdkOptions })) {
    messages.push(message);
    logger.addMessage(message);
  }
  
  // Extract curated context from messages
  const curatedSummary = extractCuratedSummary(messages);
  
  // Parse structured data from curator output
  const curatedContext: CuratedContext = {
    phase,
    summary: curatedSummary.summary,
    relevantFailures: curatedSummary.failures,
    relevantPatterns: curatedSummary.patterns,
    relevantDecisions: curatedSummary.decisions,
    timestamp: new Date().toISOString(),
    tokenCount: curatedSummary.summary.split(/\s+/).length
  };
  
  // Store curated context for next phase - map post-X phase to workflow phase
  const workflowPhase: WorkflowContextData['phase'] = 
    phase === 'post-analysis' ? 'analysis' :
    phase === 'post-plan' ? 'plan' :
    'build'; // post-build
  
  const contextData: WorkflowContextData = {
    phase: workflowPhase,
    summary: curatedContext.summary,
    keyFindings: [
      ...curatedContext.relevantFailures.map(f => `FAILURE: ${f}`),
      ...curatedContext.relevantPatterns.map(p => `PATTERN: ${p}`),
      ...curatedContext.relevantDecisions.map(d => `DECISION: ${d}`)
    ],
    timestamp: curatedContext.timestamp
  };
  
  storeWorkflowContext(workflowId, workflowPhase, contextData);
  
  logger.logEvent("CURATOR_COMPLETE", { 
    workflow_id: workflowId, 
    phase, 
    token_count: curatedContext.tokenCount 
  });
  
  return curatedContext;
}

function buildCuratorPrompt(options: {
  phase: string;
  domain: string;
  currentPhaseOutput: string;
}): string {
  const { phase, domain, currentPhaseOutput } = options;
  
  return `You are a context curator for the ${domain} domain in an automated workflow.

## Your Task

Query KotaDB memory tools to find relevant context for the next phase:

1. Use search tool with scope=["failures"] to find past failures related to ${domain}
2. Use search tool with scope=["patterns"] to find established patterns for ${domain}
3. Use search tool with scope=["decisions"] to find architectural decisions for ${domain}

## Current Phase Output

${currentPhaseOutput}

## Instructions

1. Query each scope (failures, patterns, decisions) with relevant search terms
2. Synthesize findings into a curated ~500 token summary
3. Return structured output:

**CURATED CONTEXT**

**Summary**: [Concise synthesis of relevant context]

**Relevant Failures**:
- [Failure 1 - one line]
- [Failure 2 - one line]
- ...

**Relevant Patterns**:
- [Pattern 1 - one line]
- [Pattern 2 - one line]
- ...

**Relevant Decisions**:
- [Decision 1 - one line]
- [Decision 2 - one line]
- ...

Be concise. Focus on actionable insights that will help the next phase avoid mistakes and follow conventions.
`;
}

function extractCuratedSummary(messages: SDKMessage[]): CuratedSummary {
  // Extract assistant text from messages
  const assistantText = messages
    .filter(m => m.type === "assistant")
    .map(m => ("text" in m ? m.text : ""))
    .join("\n");
  
  // Parse structured output (simple regex-based extraction)
  const summaryMatch = assistantText.match(/\*\*Summary\*\*:\s*(.+?)(?=\*\*Relevant|$)/s);
  const failuresMatch = assistantText.match(/\*\*Relevant Failures\*\*:\s*((?:- .+\n?)+)/);
  const patternsMatch = assistantText.match(/\*\*Relevant Patterns\*\*:\s*((?:- .+\n?)+)/);
  const decisionsMatch = assistantText.match(/\*\*Relevant Decisions\*\*:\s*((?:- .+\n?)+)/);
  
  const extractItems = (match: RegExpMatchArray | null): string[] => {
    if (!match || !match[1]) return [];
    return match[1]
      .split('\n')
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0);
  };
  
  return {
    summary: summaryMatch?.[1]?.trim() || "No summary generated",
    failures: extractItems(failuresMatch),
    patterns: extractItems(patternsMatch),
    decisions: extractItems(decisionsMatch)
  };
}
