# Zod Unions Documentation

**Date**: 2025-12-05
**Source**: https://zod.dev/?id=unions

## Overview

Zod provides union types to represent logical "OR" relationships between schemas. Union types (`A | B`) represent a logical 'OR'. Zod union schemas will check the input against each option in order.

## Basic Union Usage

Create a union by passing an array of schemas to `z.union()`:

```typescript
const stringOrNumber = z.union([z.string(), z.number()]);
// inferred type: string | number

stringOrNumber.parse("foo"); // passes
stringOrNumber.parse(14);    // passes
```

The validation process follows sequential matching—the first schema that successfully validates the input is returned.

## Extracting Union Options

Access the internal schemas comprising a union through the `.options` property:

```typescript
stringOrNumber.options; // [ZodString, ZodNumber]
```

## Discriminated Unions

For improved performance with object unions sharing a common key, use `z.discriminatedUnion()`. This approach leverages a "discriminator key" to efficiently narrow the type:

```typescript
const MyResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), data: z.string() }),
  z.object({ status: z.literal("failed"), error: z.string() }),
]);
```

Each option should be an object schema where the discriminator property corresponds to literal values, typically using `z.enum()`, `z.literal()`, `z.null()`, or `z.undefined()`.

**Key advantage**: Discriminated unions are significantly faster than naive unions for large option sets, as they avoid sequential validation attempts.
