/**
 * Validation API types
 *
 * Type definitions for the POST /validate-output endpoint.
 * Used by automation layer to validate slash command outputs against schemas.
 */

/**
 * Validation error for a specific field or path.
 */
export interface ValidationError {
	/** JSON path to the field with error (e.g., "user.email", "[0].name") */
	path: string;

	/** Human-readable error message */
	message: string;
}

/**
 * Request payload for POST /validate-output endpoint.
 * Validates output against a Zod-compatible JSON schema.
 */
export interface ValidationRequest {
	/** Zod-compatible JSON schema (object with type, properties, etc.) */
	schema: object;

	/** The output string to validate */
	output: string;
}

/**
 * Response from POST /validate-output endpoint.
 * Returns validation result with optional errors.
 */
export interface ValidationResponse {
	/** Whether the output passes validation */
	valid: boolean;

	/** Array of validation errors (only present if valid is false) */
	errors?: ValidationError[];
}
