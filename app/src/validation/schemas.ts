/**
 * Core validation logic using Zod
 *
 * Validates command outputs against JSON schemas
 */

import { z } from "zod";
import type { ValidationResponse, ValidationError } from "@shared/types/validation";
import { Sentry } from "../instrument.js";
import { createLogger } from "@logging/logger.js";

const logger = createLogger({ module: "validation-schemas" });

/**
 * Converts a JSON schema object to a Zod schema
 *
 * Supports basic JSON schema types:
 * - string (with optional pattern, minLength, maxLength)
 * - number (with optional minimum, maximum)
 * - boolean
 * - array (with optional items schema)
 * - object (with properties and required fields)
 */
function jsonSchemaToZod(schema: any): z.ZodTypeAny {
  if (schema.type === "string") {
    let stringSchema = z.string();

    if (schema.pattern) {
      stringSchema = stringSchema.regex(
        new RegExp(schema.pattern),
        `Must match pattern: ${schema.pattern}`
      );
    }

    if (schema.minLength !== undefined) {
      stringSchema = stringSchema.min(schema.minLength);
    }

    if (schema.maxLength !== undefined) {
      stringSchema = stringSchema.max(schema.maxLength);
    }

    return stringSchema;
  }

  if (schema.type === "number") {
    let numberSchema = z.number();

    if (schema.minimum !== undefined) {
      numberSchema = numberSchema.min(schema.minimum);
    }

    if (schema.maximum !== undefined) {
      numberSchema = numberSchema.max(schema.maximum);
    }

    return numberSchema;
  }

  if (schema.type === "boolean") {
    return z.boolean();
  }

  if (schema.type === "array") {
    if (schema.items) {
      return z.array(jsonSchemaToZod(schema.items));
    }
    return z.array(z.any());
  }

  if (schema.type === "object") {
    const shape: Record<string, z.ZodTypeAny> = {};

    if (schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        let fieldSchema = jsonSchemaToZod(value);

        // Make optional unless in required array
        if (!schema.required || !schema.required.includes(key)) {
          fieldSchema = fieldSchema.optional();
        }

        shape[key] = fieldSchema;
      }
    }

    return z.object(shape);
  }

  // Fallback for unknown types
  return z.any();
}

/**
 * Validates an output string against a JSON schema
 *
 * @param schema - JSON schema object (Zod-compatible)
 * @param output - The output string to validate
 * @returns ValidationResponse with success status and errors if any
 */
export function validateOutput(
  schema: object,
  output: string
): ValidationResponse {
  try {
    // Convert JSON schema to Zod schema
    const zodSchema = jsonSchemaToZod(schema);

    // Try to parse output as JSON first for object/array schemas
    let parsedOutput: any = output;
    if ((schema as any).type === "object" || (schema as any).type === "array") {
      try {
        parsedOutput = JSON.parse(output);
      } catch (parseError) {
        // If JSON parse fails, return error
        const schemaType = (schema as any).type;
        logger.error("Failed to parse output as JSON", {
          schemaType,
          outputLength: output.length,
          outputPreview: output.substring(0, 100)
        });
        Sentry.captureException(parseError, {
          extra: {
            schemaType,
            outputLength: output.length,
            outputPreview: output.substring(0, 100)
          }
        });
        return {
          valid: false,
          errors: [
            {
              path: "root",
              message: `Expected JSON ${schemaType}, received non-JSON string`
            }
          ]
        };
      }
    }

    // Validate against schema
    const result = zodSchema.safeParse(parsedOutput);

    if (result.success) {
      return { valid: true };
    }

    // Format Zod errors into ValidationError array
    const errors: ValidationError[] = result.error.issues.map((err) => ({
      path: err.path.join(".") || "root",
      message: err.message
    }));

    logger.warn("Validation failed", {
      schemaType: (schema as any).type,
      errorCount: errors.length,
      errors: errors.map(e => ({ path: e.path, message: e.message }))
    });

    return {
      valid: false,
      errors
    };
  } catch (error) {
    // Schema parsing error
    const errorMessage = error instanceof Error ? error.message : "Invalid schema format";
    logger.error("Schema parsing error", {
      schemaType: (schema as any).type,
      error: errorMessage
    });
    Sentry.captureException(error, {
      extra: {
        schemaType: (schema as any).type,
        schemaKeys: Object.keys(schema)
      }
    });
    return {
      valid: false,
      errors: [
        {
          path: "schema",
          message: errorMessage
        }
      ]
    };
  }
}
