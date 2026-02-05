// Automated outcome recording example

// Success recording
await autoRecordSuccess({
  workflowId,
  issueNumber: 123,
  domain: 'automation',
  filesModified: ['src/orchestrator.ts', 'src/curator.ts'],
  projectRoot,
  logger,
  reporter
});

// Failure recording
await autoRecordFailure({
  workflowId,
  issueNumber: 123,
  domain: 'automation',
  error: 'Build phase failed: type error in curator.ts',
  projectRoot,
  logger,
  reporter
});
