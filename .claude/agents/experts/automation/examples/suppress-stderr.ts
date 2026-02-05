// Suppress SDK stderr output example

import type { AutomationSDKOptions } from "@anthropic-ai/claude-code";

const sdkOptions: AutomationSDKOptions = {
  maxTurns: 100,
  cwd: projectRoot,
  permissionMode: "bypassPermissions",
  // Suppress default stderr dots
  stderr: (data: string) => {
    if (verbose) {
      logger.logEvent("SDK_STDERR", { data });
    }
    // Suppress console output (SDK dots)
  },
  hooks: { /* ... */ }
};
