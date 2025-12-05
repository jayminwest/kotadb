# Zod - TypeScript-first Schema Validation

**Date Scraped:** 2025-12-05
**Source:** https://zod.dev/?id=introduction
**Version:** Latest (as of scrape date)

## Overview

Zod is a **TypeScript-first schema validation library with static type inference** created by Colin McDonnell (@colinhacks). It enables developers to define schemas for validating data structures with complete type safety.

The fundamental principle: Define a schema, parse some data with it, and receive a strongly typed, validated result.

## Key Features

- **Zero external dependencies** - No external packages required
- **Universal compatibility** - Works in Node.js and all modern browsers
- **Lightweight** - Core bundle is only 2kb (gzipped)
- **Immutable API** - Methods return new instances rather than mutating
- **Concise, developer-friendly interface** - Easy to read and write
- **Plain JavaScript compatible** - TypeScript not required (but recommended)
- **Built-in JSON Schema conversion** - Easy integration with JSON Schema tools
- **Extensive ecosystem** - Rich third-party integrations and tools
- **Static type inference** - Automatic TypeScript type generation from schemas

## Installation

Install via npm:

```bash
npm install zod
```

Zod is also available as `@zod/zod` on jsr.io.

### MCP Server

Zod provides an MCP (Model Context Protocol) server for AI agents to search Zod's documentation programmatically.

## Requirements

- **TypeScript v5.5 or later** (if using TypeScript)
- **Strict mode enabled** - Must have `"strict": true` in `tsconfig.json`

Example `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

## Basic Usage

### Importing

```typescript
import * as z from "zod";
// or
import { z } from "zod";
```

### Defining a Schema

Create schemas using Zod's schema builders:

```typescript
import * as z from "zod";

const User = z.object({
  username: z.string(),
  age: z.number(),
  email: z.string().email(),
});
```

### Parsing Data

#### `.parse()` Method

Validates input data and returns a deep clone if valid. Throws a `ZodError` if validation fails:

```typescript
const userData = {
  username: "johndoe",
  age: 30,
  email: "john@example.com"
};

const validatedUser = User.parse(userData);
// validatedUser is now type-safe and validated
```

If validation fails:
```typescript
try {
  User.parse({ username: "john", age: "thirty" }); // throws ZodError
} catch (error) {
  console.error(error);
}
```

#### `.safeParse()` Method

Returns a discriminated union result object instead of throwing:

```typescript
const result = User.safeParse({ username: 42, age: "100" });

if (!result.success) {
  // result.error contains ZodError details
  console.error(result.error);
} else {
  // result.data contains validated data
  console.log(result.data);
}
```

#### Async Variants

For asynchronous refinements and transforms:

```typescript
const result = await User.parseAsync(data);
// or
const result = await User.safeParseAsync(data);
```

### Type Inference

Extract TypeScript types from your schemas using `z.infer`:

```typescript
type User = z.infer<typeof User>;
// Equivalent to:
// type User = {
//   username: string;
//   age: number;
//   email: string;
// }
```

For schemas with different input/output types (when using `.transform()`):

```typescript
type MySchemaInput = z.input<typeof mySchema>;
type MySchemaOutput = z.output<typeof mySchema>;
```

## Core Schema Types

### Primitives

```typescript
z.string()    // string
z.number()    // number
z.boolean()   // boolean
z.bigint()    // bigint
z.date()      // Date
z.symbol()    // symbol
z.undefined() // undefined
z.null()      // null
z.void()      // void
z.any()       // any
z.unknown()   // unknown
z.never()     // never
```

### Objects

```typescript
const Player = z.object({
  username: z.string(),
  xp: z.number(),
});

type Player = z.infer<typeof Player>;
```

### Arrays

```typescript
const stringArray = z.array(z.string());
const numberArray = z.number().array(); // alternative syntax
```

### Tuples

```typescript
const coordinates = z.tuple([z.number(), z.number()]);
```

### Unions

```typescript
const stringOrNumber = z.union([z.string(), z.number()]);
// or using the shorthand:
const stringOrNumber = z.string().or(z.number());
```

### Records

```typescript
const stringRecord = z.record(z.string());
// Record<string, string>
```

### Maps

```typescript
const myMap = z.map(z.string(), z.number());
```

### Sets

```typescript
const mySet = z.set(z.string());
```

### Promises

```typescript
const promiseSchema = z.promise(z.string());
```

### Functions

```typescript
const myFunction = z.function()
  .args(z.string(), z.number())
  .returns(z.boolean());
```

## Schema Methods

### Optional and Nullable

```typescript
const optionalString = z.string().optional(); // string | undefined
const nullableString = z.string().nullable(); // string | null
const nullishString = z.string().nullish();   // string | null | undefined
```

### Default Values

```typescript
const stringWithDefault = z.string().default("default value");
```

### Catch (Error Recovery)

```typescript
const numberWithCatch = z.number().catch(0);
// Returns 0 if parsing fails
```

## Refinements and Transformations

### `.refine()`

Add custom validation logic:

```typescript
const positiveNumber = z.number().refine(val => val > 0, {
  message: "Number must be positive"
});
```

### `.superRefine()`

More advanced refinement with full control over error handling:

```typescript
const schema = z.object({
  password: z.string(),
  confirmPassword: z.string()
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Passwords must match",
      path: ["confirmPassword"]
    });
  }
});
```

### `.transform()`

Transform validated data:

```typescript
const stringToNumber = z.string().transform(val => parseInt(val, 10));
```

### `.preprocess()`

Preprocess input before validation:

```typescript
const schema = z.preprocess(
  (input) => (typeof input === "string" ? input.toLowerCase() : input),
  z.string()
);
```

## Error Handling

### ZodError Structure

When validation fails, Zod throws (or returns in `safeParse`) a `ZodError` containing:

- **issues**: Array of validation issues
- **path**: Path to the field that failed
- **code**: Error code (e.g., "invalid_type", "too_small", "too_big")
- **message**: Human-readable error message

### Error Formatting

```typescript
const result = schema.safeParse(data);
if (!result.success) {
  // Formatted errors
  const formatted = result.error.format();

  // Flattened errors
  const flattened = result.error.flatten();
}
```

## String Validations

Zod provides extensive string validations:

```typescript
z.string().email()           // Email validation
z.string().url()             // URL validation
z.string().uuid()            // UUID validation
z.string().cuid()            // CUID validation
z.string().regex(/pattern/)  // Custom regex
z.string().min(5)            // Minimum length
z.string().max(100)          // Maximum length
z.string().length(10)        // Exact length
z.string().trim()            // Trim whitespace
z.string().toLowerCase()     // Convert to lowercase
z.string().toUpperCase()     // Convert to uppercase
```

## Number Validations

```typescript
z.number().min(0)            // Minimum value
z.number().max(100)          // Maximum value
z.number().int()             // Must be integer
z.number().positive()        // Must be > 0
z.number().negative()        // Must be < 0
z.number().nonnegative()     // Must be >= 0
z.number().nonpositive()     // Must be <= 0
z.number().multipleOf(5)     // Must be multiple of 5
z.number().finite()          // Must be finite
z.number().safe()            // Must be safe integer
```

## Coercion

Coerce input values to the target type:

```typescript
z.coerce.string()  // Coerce to string
z.coerce.number()  // Coerce to number
z.coerce.boolean() // Coerce to boolean
z.coerce.date()    // Coerce to Date
z.coerce.bigint()  // Coerce to bigint
```

Example:
```typescript
const schema = z.coerce.number();
schema.parse("123"); // returns 123 (number)
```

## JSON Schema Conversion

Convert Zod schemas to JSON Schema:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";

const jsonSchema = zodToJsonSchema(myZodSchema);
```

## Ecosystem

Zod has a thriving ecosystem including:

### API Libraries
- **tRPC** - End-to-end typesafe APIs

### Form Integrations
- **React Hook Form** - Form validation with Zod resolver
- **Formik** - Formik integration
- **React Final Form** - React Final Form adapter

### Mocking Libraries
- Tools for generating mock data from Zod schemas

### ORM Integrations
- Prisma Zod Generator
- Drizzle ORM integration

### Documentation Tools
- Auto-generate API documentation from Zod schemas

### And many more...

Visit the [Zod ecosystem page](https://zod.dev/ecosystem) for the complete list.

## Sponsorship

Zod is open-source and supported by sponsors at various tiers:

- **Platinum**: CodeRabbit
- **Gold**: Courier, Neon
- **Silver**: Retool, Stainless
- **Bronze**: Speakeasy, and others

Sponsorship at any level is appreciated and helps maintain the project.

## Community

- **Documentation**: [zod.dev](https://zod.dev)
- **API Reference**: [zod.dev/api](https://zod.dev/api)
- **Discord**: Community Discord server available
- **Social Media**: Follow on X (formerly Twitter) and Bluesky
- **GitHub**: [github.com/colinhacks/zod](https://github.com/colinhacks/zod)

## License

MIT

---

**Note:** This documentation represents the introduction and getting started content from the Zod documentation. For comprehensive API documentation covering advanced topics like discriminated unions, recursive types, custom error maps, and more, visit the official documentation at [zod.dev](https://zod.dev).
