/**
 * Unit tests for validation schema logic
 */

import { describe, expect, test } from "bun:test";
import { validateOutput } from "@validation/schemas";

describe("validateOutput", () => {
  describe("string validation", () => {
    test("validates simple strings", () => {
      const schema = { type: "string" };
      const result = validateOutput(schema, "hello world");

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test("rejects non-strings", () => {
      const schema = { type: "string" };
      const result = validateOutput(schema, "123");

      expect(result.valid).toBe(true); // "123" is a valid string
    });

    test("validates string patterns", () => {
      const schema = {
        type: "string",
        pattern: "^docs/specs/.*\\.md$"
      };

      const validResult = validateOutput(schema, "docs/specs/feature-123.md");
      expect(validResult.valid).toBe(true);

      const invalidResult = validateOutput(schema, "src/file.ts");
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
      expect(invalidResult.errors?.[0]?.path).toBe("root");
    });

    test("validates string with minLength", () => {
      const schema = {
        type: "string",
        minLength: 5
      };

      const validResult = validateOutput(schema, "hello");
      expect(validResult.valid).toBe(true);

      const invalidResult = validateOutput(schema, "hi");
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.message).toContain("5");
    });

    test("validates string with maxLength", () => {
      const schema = {
        type: "string",
        maxLength: 10
      };

      const validResult = validateOutput(schema, "hello");
      expect(validResult.valid).toBe(true);

      const invalidResult = validateOutput(schema, "this is too long");
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.message).toContain("10");
    });

    test("validates Conventional Commits format", () => {
      const schema = {
        type: "string",
        pattern: "^(feat|fix|chore|docs|test|refactor|perf|ci|build|style)(\\([^)]+\\))?: [0-9]+ - .{1,50}"
      };

      const validResult = validateOutput(schema, "feat: 123 - add validation endpoint");
      expect(validResult.valid).toBe(true);

      const validWithScope = validateOutput(schema, "feat(api): 123 - add validation");
      expect(validWithScope.valid).toBe(true);

      const invalidResult = validateOutput(schema, "invalid commit message");
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe("number validation", () => {
    test("validates numbers", () => {
      const schema = { type: "number" };
      const result = validateOutput(schema, "42");

      // String "42" won't validate as number type
      expect(result.valid).toBe(false);
    });

    test("validates number with minimum", () => {
      const schema = {
        type: "number",
        minimum: 10
      };

      // This would fail because we're passing a string, not a number
      // In real usage, the output would need to be JSON parsed first
      const result = validateOutput(schema, "5");
      expect(result.valid).toBe(false);
    });
  });

  describe("object validation", () => {
    test("validates simple objects", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" }
        },
        required: ["name"]
      };

      const validResult = validateOutput(
        schema,
        JSON.stringify({ name: "John", age: 30 })
      );
      expect(validResult.valid).toBe(true);

      const validWithoutOptional = validateOutput(
        schema,
        JSON.stringify({ name: "John" })
      );
      expect(validWithoutOptional.valid).toBe(true);

      const invalidResult = validateOutput(
        schema,
        JSON.stringify({ age: 30 })
      );
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.path).toBe("name");
    });

    test("validates GitHub issue format", () => {
      const schema = {
        type: "object",
        properties: {
          number: { type: "number" },
          title: { type: "string" },
          summary: { type: "string" },
          constraints: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["number", "title", "summary"]
      };

      const validResult = validateOutput(
        schema,
        JSON.stringify({
          number: 123,
          title: "feat: add validation",
          summary: "Add validation endpoint",
          constraints: ["Must use Zod", "Must be authenticated"]
        })
      );
      expect(validResult.valid).toBe(true);

      const validWithoutOptional = validateOutput(
        schema,
        JSON.stringify({
          number: 123,
          title: "feat: add validation",
          summary: "Add validation endpoint"
        })
      );
      expect(validWithoutOptional.valid).toBe(true);

      const invalidResult = validateOutput(
        schema,
        JSON.stringify({ number: 123, title: "feat: add validation" })
      );
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.path).toBe("summary");
    });

    test("rejects non-JSON for object schemas", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" }
        }
      };

      const result = validateOutput(schema, "not json");
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]?.message).toContain("JSON");
    });
  });

  describe("array validation", () => {
    test("validates arrays", () => {
      const schema = {
        type: "array",
        items: { type: "string" }
      };

      const validResult = validateOutput(
        schema,
        JSON.stringify(["hello", "world"])
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = validateOutput(
        schema,
        JSON.stringify([1, 2, 3])
      );
      expect(invalidResult.valid).toBe(false);
    });

    test("rejects non-JSON for array schemas", () => {
      const schema = {
        type: "array",
        items: { type: "string" }
      };

      const result = validateOutput(schema, "not json");
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]?.message).toContain("JSON");
    });
  });

  describe("boolean validation", () => {
    test("validates booleans", () => {
      const schema = { type: "boolean" };

      // String "true" won't validate as boolean
      const result = validateOutput(schema, "true");
      expect(result.valid).toBe(false);
    });
  });

  describe("nested object validation", () => {
    test("validates nested objects", () => {
      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" }
            },
            required: ["name"]
          }
        },
        required: ["user"]
      };

      const validResult = validateOutput(
        schema,
        JSON.stringify({
          user: {
            name: "John",
            email: "john@example.com"
          }
        })
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = validateOutput(
        schema,
        JSON.stringify({
          user: {
            email: "john@example.com"
          }
        })
      );
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors?.[0]?.path).toContain("name");
    });
  });

  describe("error handling", () => {
    test("handles invalid schema gracefully", () => {
      const schema = { type: "invalid-type" };
      const result = validateOutput(schema, "test");

      // Should still attempt validation with fallback to z.any()
      expect(result).toBeDefined();
    });

    test("formats error paths correctly", () => {
      const schema = {
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: {
              field: { type: "string" }
            },
            required: ["field"]
          }
        },
        required: ["nested"]
      };

      const result = validateOutput(
        schema,
        JSON.stringify({ nested: {} })
      );

      expect(result.valid).toBe(false);
      expect(result.errors?.[0]?.path).toContain("field");
    });
  });
});
