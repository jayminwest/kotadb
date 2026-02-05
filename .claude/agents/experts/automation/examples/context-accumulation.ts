// Context accumulation example

// Generate workflow ID (workflow.ts)
const workflowId = accumulateContext ? generateWorkflowId(issueNumber) : null;

// Thread through orchestration (orchestrator.ts)
export interface OrchestrationOptions {
  issueNumber: number;
  projectRoot: string;
  workflowId: string | null;  // Add this
  // ...
}

// Store phase context (in phase completion handler)
if (workflowId) {
  const contextData: WorkflowContextData = {
    phase: 'analysis',
    summary: 'Analyzed requirements for feature X',
    keyFindings: ['Finding 1', 'Finding 2'],
    filesAnalyzed: ['src/foo.ts', 'src/bar.ts'],
    timestamp: new Date().toISOString()
  };
  storeWorkflowContext(workflowId, 'analysis', contextData);
}

// Retrieve context in next phase
if (workflowId) {
  const analysisContext = getWorkflowContext(workflowId, 'analysis');
  // Use analysisContext to inform planning phase
}

// Clear context on success (orchestrator.ts)
if (workflowId && improveStatus === "success") {
  const deletedCount = clearWorkflowContext(workflowId);
  logger.logEvent("CONTEXT_CLEANUP", { workflow_id: workflowId, deleted_count: deletedCount });
}
