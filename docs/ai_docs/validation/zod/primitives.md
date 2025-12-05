# Zod Primitives

**Source:** https://zod.dev/?id=primitives
**Date:** 2025-12-05

## Overview

Zod provides fundamental schema types for validating basic JavaScript values. The documentation covers primitive types, coercion mechanisms, and various validation strategies.

## Core Primitive Types

Zod supports these basic schemas:

```typescript
z.string();
z.number();
z.bigint();
z.boolean();
z.symbol();
z.undefined();
z.null();
```

## Type Coercion

Zod includes a coercion system through `z.coerce` that automatically converts input values to appropriate types:

```typescript
z.coerce.string();    // Uses String(input)
z.coerce.number();    // Uses Number(input)
z.coerce.boolean();   // Uses Boolean(input)
z.coerce.bigint();    // Uses BigInt(input)
```

### Customizing Input Types

The input type of these coerced schemas is `unknown` by default. Users can specify more precise input types through generic parameters:

```typescript
const B = z.coerce.number<number>();
type BInput = z.input<typeof B>; // => number
```

## Validation Examples

The coercion feature handles various input scenarios:

- `schema.parse("tuna")` returns `"tuna"`
- `schema.parse(42)` converts to `"42"`
- `schema.parse(true)` converts to `"true"`
- `schema.parse(null)` converts to `"null"`

This approach allows developers to handle user input that may arrive in unexpected formats while maintaining type safety throughout their applications.
