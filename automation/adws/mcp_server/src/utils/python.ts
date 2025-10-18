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

/**
 * Validation result for Python executable check.
 */
export interface PythonValidationResult {
  valid: boolean;
  path: string;
  error?: string;
}

/**
 * Validates that the Python executable exists and is accessible.
 *
 * Checks:
 * 1. Resolves Python path using getPythonExecutable()
 * 2. For absolute paths: verifies file exists and is executable
 * 3. For relative paths (e.g., "python3"): assumes system PATH resolution
 *
 * @returns {PythonValidationResult} Validation result with path and error details
 */
export function validatePythonExecutable(): PythonValidationResult {
  const pythonPath = getPythonExecutable();

  // If path is relative (e.g., "python3"), trust system PATH resolution
  // Bun's spawn() will search PATH for the executable
  if (!pythonPath.startsWith("/")) {
    return {
      valid: true,
      path: pythonPath,
    };
  }

  // For absolute paths, verify file exists and is accessible
  try {
    const fs = require("fs");

    // Check if file exists
    if (!fs.existsSync(pythonPath)) {
      return {
        valid: false,
        path: pythonPath,
        error: `Python executable not found at path: ${pythonPath}`,
      };
    }

    // Check if file is executable (requires read + execute permissions)
    try {
      fs.accessSync(pythonPath, fs.constants.X_OK);
    } catch (accessErr) {
      return {
        valid: false,
        path: pythonPath,
        error: `Python executable is not executable: ${pythonPath}`,
      };
    }

    return {
      valid: true,
      path: pythonPath,
    };
  } catch (err) {
    return {
      valid: false,
      path: pythonPath,
      error: `Failed to validate Python executable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
