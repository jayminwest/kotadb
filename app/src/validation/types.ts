/**
 * Validation API types
 *
 * Type definitions for the /validate-output endpoint
 */

/**
 * Validation error for a specific field or path
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Request payload for output validation
 */
export interface ValidationRequest {
  schema: object;  // Zod-compatible JSON schema
  output: string;  // The output to validate
}

/**
 * Response from validation endpoint
 */
export interface ValidationResponse {
  valid: boolean;
  errors?: ValidationError[];
}
