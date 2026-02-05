// ConsoleReporter ANSI formatting example

export const ANSI = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  PHASE: "\x1b[1m\x1b[36m",    // cyan+bold
  ACTION: "\x1b[34m",           // blue
  SUCCESS: "\x1b[32m",          // green
  ERROR: "\x1b[1m\x1b[31m",    // red+bold
  WARNING: "\x1b[33m",          // yellow
  VERBOSE: "\x1b[2m"            // dim
};

class ConsoleReporter {
  logKeyAction(message: string): void {
    // Always shown
    this.write(`  ${ANSI.ACTION}->${ANSI.RESET} ${message}\n`);
  }
  
  logVerbose(message: string): void {
    // Only if verbose
    if (this.verbose) {
      this.write(`  ${ANSI.VERBOSE}${message}${ANSI.RESET}\n`);
    }
  }
  
  private write(text: string): void {
    try {
      process.stdout.write(text);
    } catch {
      // Fallback to stderr
      try {
        process.stderr.write(text);
      } catch {
        // Silent failure
      }
    }
  }
}
