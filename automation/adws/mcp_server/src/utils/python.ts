/**
 * Python Executable Path Resolution Utility
 *
 * Resolves the Python executable path for spawning Python bridge processes.
 * Supports environment variable configuration with fallback to default.
 *
 * Environment Variables:
 * - PYTHON_PATH: Absolute path to Python executable (e.g., /usr/bin/python3)
 *
 * Fallback Behavior:
 * If PYTHON_PATH is not set or empty, defaults to "python3" (searches system PATH).
 *
 * @example
 * // With PYTHON_PATH set
 * process.env.PYTHON_PATH = '/usr/local/bin/python3';
 * getPythonExecutable(); // Returns: '/usr/local/bin/python3'
 *
 * @example
 * // Without PYTHON_PATH (uses system PATH)
 * delete process.env.PYTHON_PATH;
 * getPythonExecutable(); // Returns: 'python3'
 */

/**
 * Returns the Python executable path to use for spawning subprocesses.
 *
 * Resolution order:
 * 1. PYTHON_PATH environment variable (if set and non-empty)
 * 2. Default to "python3" (searches system PATH)
 *
 * @returns {string} Python executable path or name
 */
export function getPythonExecutable(): string {
  const pythonPath = process.env.PYTHON_PATH;

  if (pythonPath && pythonPath.trim().length > 0) {
    return pythonPath.trim();
  }

  return "python3";
}
