# Zod Arrays Documentation

**Source**: https://zod.dev/?id=arrays
**Date**: 2025-12-05

## Basic Array Definition

To create an array schema in Zod, use `z.array()` with the element type:

```typescript
const stringArray = z.array(z.string());
// or equivalently
z.string().array()
```

## Accessing Inner Schema

Extract the element schema from an array using `.unwrap()`:

```typescript
stringArray.unwrap(); // => string schema
```

## Array Validations

Zod provides several built-in validation methods for arrays:

```typescript
z.array(z.string()).min(5);      // minimum 5 items required
z.array(z.string()).max(5);      // maximum 5 items allowed
z.array(z.string()).length(5);   // exactly 5 items required
```

## Key Points

- Arrays validate that inputs contain the specified element type
- The `.min()`, `.max()`, and `.length()` methods constrain the number of array elements
- Zod validates each element against the provided schema
- These are part of Zod's comprehensive schema validation toolkit available in both standard Zod and Zod Mini packages

Arrays work seamlessly with other Zod features like transformations, refinements, and composition with complex types like objects and unions.
