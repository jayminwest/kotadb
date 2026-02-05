// SDK hooks integration example

import type { HookCallback, HookInput, HookCallbackMatcher } from "@anthropic-ai/claude-code";

function createPreToolUseHook(reporter: ConsoleReporter): HookCallback {
  return async (input: HookInput) => {
    try {
      if (input.hook_event_name === "PreToolUse") {
        const summary = summarizeToolInput(input.tool_name, input.tool_input);
        reporter.logToolUse(input.tool_name, summary);
      }
    } catch {
      // Non-fatal: continue workflow on hook error
    }
    return {};
  };
}

const hooks: Partial<Record<string, HookCallbackMatcher[]>> = {
  PreToolUse: [{ hooks: [createPreToolUseHook(reporter)] }],
  PostToolUse: [{ hooks: [createPostToolUseHook(reporter)] }],
  Notification: [{ hooks: [createNotificationHook(reporter)] }]
};

const sdkOptions = {
  maxTurns: 100,
  hooks
};
