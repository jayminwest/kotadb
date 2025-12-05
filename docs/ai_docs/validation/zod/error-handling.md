# Zod Error Handling Documentation

**Source:** https://zod.dev/?id=error-handling
**Date:** 2025-12-05

## Overview

When validation fails in Zod, the framework provides mechanisms to capture and handle validation errors gracefully.

## Error Throwing with `.parse()`

The `.parse()` method throws a `ZodError` instance when validation fails. This error contains detailed information about what went wrong:

**Example Structure:**
```typescript
try {
  Player.parse({ username: 42, xp: "100" });
} catch(error){
  if(error instanceof z.ZodError){
    error.issues; // Array of validation problems
  }
}
```

Each issue in the array contains:
- `expected`: The anticipated data type
- `code`: Error classification (e.g., 'invalid_type')
- `path`: Location of the problematic field
- `message`: Human-readable error description

## Safe Parsing with `.safeParse()`

To avoid try-catch blocks, developers can use `.safeParse()`, which returns a discriminated union object:

```typescript
const result = Player.safeParse({ username: 42, xp: "100" });
if (!result.success) {
  result.error; // ZodError instance
} else {
  result.data; // Validated, typed data
}
```

This approach separates success and failure states without exceptions.

## Asynchronous Error Handling

For schemas using async operations like async refinements or transforms, use `.safeParseAsync()` or `.parseAsync()` instead of their synchronous counterparts.
