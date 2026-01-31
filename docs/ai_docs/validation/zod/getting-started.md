---
title: Zod - Getting Started
source: https://zod.dev
date: 2026-01-30
tags:
  - zod
  - validation
  - typescript
  - schema
---

# Zod - Getting Started

Zod is a TypeScript-first schema declaration and validation library. It provides a simple, chainable API to define schemas and validate data at runtime while providing excellent TypeScript type inference.

## Introduction

Zod is designed with these goals:
- **TypeScript-first**: Full type inference from schemas
- **Zero dependencies**: Lightweight and standalone
- **Immutable**: Methods return new instances
- **Concise**: Chainable, functional API
- **Works everywhere**: Browser, Node.js, Deno, Bun

### Key Features

- Define schemas for any data type
- Parse and validate data with detailed error messages
- Transform data during parsing
- Infer TypeScript types from schemas
- Compose complex schemas from simple ones

## Installation

### npm

```bash
npm install zod
```

### yarn

```bash
yarn add zod
```

### pnpm

```bash
pnpm add zod
```

### bun

```bash
bun add zod
```

### TypeScript Configuration

Zod requires TypeScript 4.5+ and the following `tsconfig.json` settings:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Or at minimum:

```json
{
  "compilerOptions": {
    "strictNullChecks": true
  }
}
```

## Basic Usage

### Importing Zod

```typescript
import { z } from 'zod';
```

### Creating a Simple Schema

```typescript
// Define a schema
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

// Infer the TypeScript type
type User = z.infer<typeof UserSchema>;
// { name: string; age: number; email: string }
```

### Parsing Data

```typescript
// Valid data
const validUser = UserSchema.parse({
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
});
// Returns: { name: 'Alice', age: 30, email: 'alice@example.com' }

// Invalid data throws an error
try {
  UserSchema.parse({
    name: 'Bob',
    age: 'thirty', // Wrong type
    email: 'invalid-email',
  });
} catch (error) {
  console.error(error.errors);
}
```

## Schema Definition

### Primitive Types

```typescript
// String
const nameSchema = z.string();

// Number
const ageSchema = z.number();

// Boolean
const activeSchema = z.boolean();

// Date
const createdAtSchema = z.date();
```

### Object Schemas

```typescript
const PersonSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    zipCode: z.string(),
  }).optional(),
});

type Person = z.infer<typeof PersonSchema>;
```

### Array Schemas

```typescript
const TagsSchema = z.array(z.string());

const NumberListSchema = z.array(z.number()).min(1).max(10);
```

### Union Types

```typescript
const StringOrNumber = z.union([z.string(), z.number()]);

// Shorthand
const Status = z.enum(['pending', 'active', 'archived']);
```

### Optional and Nullable

```typescript
const OptionalString = z.string().optional(); // string | undefined
const NullableString = z.string().nullable(); // string | null
const NullishString = z.string().nullish();   // string | null | undefined
```

## Parsing and Validation

### .parse()

Parses data and throws a `ZodError` if validation fails.

```typescript
const schema = z.string();

// Success - returns the value
const result = schema.parse('hello'); // 'hello'

// Failure - throws ZodError
schema.parse(123); // Throws!
```

### .safeParse()

Returns a result object instead of throwing.

```typescript
const schema = z.string();

const successResult = schema.safeParse('hello');
// { success: true, data: 'hello' }

const errorResult = schema.safeParse(123);
// { success: false, error: ZodError }

// Usage pattern
if (successResult.success) {
  console.log(successResult.data);
} else {
  console.error(successResult.error.errors);
}
```

### .parseAsync() and .safeParseAsync()

For schemas with async refinements or transforms.

```typescript
const schema = z.string().refine(async (val) => {
  const exists = await checkDatabase(val);
  return exists;
});

const result = await schema.parseAsync('test');
const safeResult = await schema.safeParseAsync('test');
```

## Type Inference

### Inferring Types

```typescript
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'guest']),
  metadata: z.record(z.string()),
});

// Infer the type
type User = z.infer<typeof UserSchema>;

// Equivalent to:
type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  metadata: Record<string, string>;
};
```

### Input vs Output Types

For schemas with transforms, input and output types may differ.

```typescript
const TransformSchema = z.string().transform((val) => val.length);

type Input = z.input<typeof TransformSchema>;  // string
type Output = z.output<typeof TransformSchema>; // number
type Inferred = z.infer<typeof TransformSchema>; // number (same as output)
```

## Complete Example

```typescript
import { z } from 'zod';

// Define schemas
const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
});

const UserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  age: z.number().int().min(0).max(150).optional(),
  roles: z.array(z.enum(['admin', 'editor', 'viewer'])).default(['viewer']),
  address: AddressSchema.optional(),
  createdAt: z.date().default(() => new Date()),
});

// Infer types
type Address = z.infer<typeof AddressSchema>;
type User = z.infer<typeof UserSchema>;

// Validation function
function validateUser(data: unknown): User | null {
  const result = UserSchema.safeParse(data);
  
  if (result.success) {
    return result.data;
  }
  
  console.error('Validation errors:');
  result.error.errors.forEach((err) => {
    console.error(`  ${err.path.join('.')}: ${err.message}`);
  });
  
  return null;
}

// Usage
const userData = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  username: 'johndoe',
  email: 'john@example.com',
  age: 28,
  address: {
    street: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
  },
};

const user = validateUser(userData);
if (user) {
  console.log('Valid user:', user);
}
```
