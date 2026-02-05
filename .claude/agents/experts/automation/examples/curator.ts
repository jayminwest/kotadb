// Haiku-powered context curator example

const curatedContext = await curateContext({
  workflowId,
  phase: 'post-analysis',
  domain: 'database',
  currentPhaseOutput: analysisResult,
  projectRoot,
  logger,
  reporter
});

// Context automatically stored and available to next phase
