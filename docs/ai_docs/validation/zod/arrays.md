---
title: Zod - Arrays
source: https://zod.dev/?id=arrays
date: 2026-01-30
tags:
  - zod
  - validation
  - typescript
  - arrays
---

# Zod - Arrays

Zod provides comprehensive support for validating arrays with various constraints.

## z.array()

Creates a schema for arrays containing elements of a specific type.

```typescript
import { z } from 'zod';

// Array of strings
const StringArraySchema = z.array(z.string());

StringArraySchema.parse(['a', 'b', 'c']);  // Valid
StringArraySchema.parse([]);                // Valid
StringArraySchema.parse(['a', 1]);          // Throws ZodError

type StringArray = z.infer<typeof StringArraySchema>;
// string[]
```

### Array of Objects

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const UsersArraySchema = z.array(UserSchema);

type Users = z.infer<typeof UsersArraySchema>;
// Array<{ name: string; age: number }>

UsersArraySchema.parse([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
]);
```

### Array of Union Types

```typescript
const MixedArraySchema = z.array(z.union([z.string(), z.number()]));

type MixedArray = z.infer<typeof MixedArraySchema>;
// (string | number)[]

MixedArraySchema.parse(['hello', 42, 'world', 3.14]);  // Valid
```

## .element

Access the schema of array elements.

```typescript
const NumberArraySchema = z.array(z.number().positive());

const elementSchema = NumberArraySchema.element;
// z.number().positive()

elementSchema.parse(42);   // Valid
elementSchema.parse(-1);   // Throws ZodError
```

## .nonempty()

Requires the array to have at least one element.

```typescript
const NonEmptyArraySchema = z.array(z.string()).nonempty();

type NonEmptyArray = z.infer<typeof NonEmptyArraySchema>;
// [string, ...string[]]

NonEmptyArraySchema.parse(['a']);        // Valid
NonEmptyArraySchema.parse(['a', 'b']);   // Valid
NonEmptyArraySchema.parse([]);           // Throws ZodError
```

### With Custom Error Message

```typescript
const NonEmptyArraySchema = z.array(z.string()).nonempty({
  message: 'Array must contain at least one item',
});
```

## .min()

Requires the array to have at least a specified number of elements.

```typescript
const MinArraySchema = z.array(z.number()).min(3);

MinArraySchema.parse([1, 2, 3]);     // Valid
MinArraySchema.parse([1, 2, 3, 4]);  // Valid
MinArraySchema.parse([1, 2]);        // Throws ZodError
```

### With Custom Error Message

```typescript
const MinArraySchema = z.array(z.number()).min(3, {
  message: 'Must have at least 3 items',
});
```

## .max()

Requires the array to have at most a specified number of elements.

```typescript
const MaxArraySchema = z.array(z.string()).max(5);

MaxArraySchema.parse(['a', 'b']);              // Valid
MaxArraySchema.parse(['a', 'b', 'c', 'd', 'e']); // Valid
MaxArraySchema.parse(['a', 'b', 'c', 'd', 'e', 'f']); // Throws ZodError
```

### With Custom Error Message

```typescript
const MaxArraySchema = z.array(z.string()).max(5, {
  message: 'Cannot have more than 5 items',
});
```

## .length()

Requires the array to have exactly a specified number of elements.

```typescript
const FixedLengthSchema = z.array(z.number()).length(3);

FixedLengthSchema.parse([1, 2, 3]);  // Valid
FixedLengthSchema.parse([1, 2]);     // Throws ZodError
FixedLengthSchema.parse([1, 2, 3, 4]); // Throws ZodError
```

### With Custom Error Message

```typescript
const FixedLengthSchema = z.array(z.number()).length(3, {
  message: 'Must contain exactly 3 items',
});
```

## Combining Constraints

You can chain multiple constraints together.

```typescript
const ConstrainedArraySchema = z.array(z.string())
  .min(1, 'At least one item required')
  .max(10, 'Maximum 10 items allowed');

ConstrainedArraySchema.parse(['a']);                    // Valid
ConstrainedArraySchema.parse(['a', 'b', 'c']);          // Valid
ConstrainedArraySchema.parse([]);                       // Throws (min)
ConstrainedArraySchema.parse(Array(15).fill('x'));     // Throws (max)
```

## Tuples

For fixed-length arrays with specific types at each position, use `z.tuple()`.

```typescript
const PointSchema = z.tuple([z.number(), z.number()]);

type Point = z.infer<typeof PointSchema>;
// [number, number]

PointSchema.parse([10, 20]);     // Valid
PointSchema.parse([10]);         // Throws ZodError
PointSchema.parse([10, 20, 30]); // Throws ZodError
```

### Tuples with Rest Elements

```typescript
const TupleWithRestSchema = z.tuple([z.string(), z.number()]).rest(z.boolean());

type TupleWithRest = z.infer<typeof TupleWithRestSchema>;
// [string, number, ...boolean[]]

TupleWithRestSchema.parse(['hello', 42]);                    // Valid
TupleWithRestSchema.parse(['hello', 42, true, false]);       // Valid
TupleWithRestSchema.parse(['hello', 42, 'not boolean']);     // Throws
```

## Sets

For unique values, use `z.set()`.

```typescript
const StringSetSchema = z.set(z.string());

type StringSet = z.infer<typeof StringSetSchema>;
// Set<string>

StringSetSchema.parse(new Set(['a', 'b', 'c']));  // Valid
StringSetSchema.parse(new Set(['a', 'a', 'b']));  // Valid (duplicates ignored)
```

### Set Constraints

```typescript
const ConstrainedSetSchema = z.set(z.number())
  .min(1)
  .max(5);

ConstrainedSetSchema.parse(new Set([1, 2, 3]));  // Valid
ConstrainedSetSchema.parse(new Set());           // Throws (min)
```

## Maps

For key-value collections, use `z.map()`.

```typescript
const StringToNumberMap = z.map(z.string(), z.number());

type StringToNumber = z.infer<typeof StringToNumberMap>;
// Map<string, number>

StringToNumberMap.parse(new Map([
  ['a', 1],
  ['b', 2],
]));  // Valid
```

## Records

For objects with dynamic keys, use `z.record()`.

```typescript
// All string keys to number values
const RecordSchema = z.record(z.string(), z.number());

type RecordType = z.infer<typeof RecordSchema>;
// Record<string, number>

RecordSchema.parse({ a: 1, b: 2, c: 3 });  // Valid
RecordSchema.parse({ a: 'one' });          // Throws

// With enum keys
const StatusRecord = z.record(
  z.enum(['pending', 'active', 'archived']),
  z.number()
);

type StatusRecordType = z.infer<typeof StatusRecord>;
// Partial<Record<'pending' | 'active' | 'archived', number>>
```

## Complete Arrays Example

```typescript
import { z } from 'zod';

// Tag schema
const TagSchema = z.string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Tags must be lowercase alphanumeric with dashes');

// Product schema with arrays
const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  
  // Simple array with constraints
  tags: z.array(TagSchema)
    .min(1, 'At least one tag required')
    .max(10, 'Maximum 10 tags'),
  
  // Array of objects
  variants: z.array(z.object({
    sku: z.string(),
    price: z.number().positive(),
    stock: z.number().int().nonnegative(),
  })).nonempty('At least one variant required'),
  
  // Optional array with default
  images: z.array(z.string().url())
    .default([]),
  
  // Tuple for coordinates
  warehouseLocation: z.tuple([
    z.number(), // latitude
    z.number(), // longitude
  ]).optional(),
  
  // Record for attributes
  attributes: z.record(z.string(), z.union([z.string(), z.number()]))
    .default({}),
});

type Product = z.infer<typeof ProductSchema>;

// Validation function
function validateProduct(data: unknown): Product | null {
  const result = ProductSchema.safeParse(data);
  
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
const product = validateProduct({
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Premium Widget',
  tags: ['electronics', 'gadgets', 'new-arrival'],
  variants: [
    { sku: 'WDG-001-BLK', price: 29.99, stock: 100 },
    { sku: 'WDG-001-WHT', price: 29.99, stock: 75 },
  ],
  images: [
    'https://example.com/widget-1.jpg',
    'https://example.com/widget-2.jpg',
  ],
  warehouseLocation: [37.7749, -122.4194],
  attributes: {
    color: 'black',
    weight: 0.5,
    material: 'aluminum',
  },
});

if (product) {
  console.log(`Product: ${product.name}`);
  console.log(`Tags: ${product.tags.join(', ')}`);
  console.log(`Variants: ${product.variants.length}`);
  console.log(`Images: ${product.images.length}`);
}
```

## Array Transformations

```typescript
// Remove duplicates
const UniqueArraySchema = z.array(z.string())
  .transform((arr) => [...new Set(arr)]);

UniqueArraySchema.parse(['a', 'b', 'a', 'c']);  // ['a', 'b', 'c']

// Sort array
const SortedArraySchema = z.array(z.number())
  .transform((arr) => arr.sort((a, b) => a - b));

SortedArraySchema.parse([3, 1, 4, 1, 5]);  // [1, 1, 3, 4, 5]

// Filter array
const PositiveOnlySchema = z.array(z.number())
  .transform((arr) => arr.filter((n) => n > 0));

PositiveOnlySchema.parse([-1, 2, -3, 4]);  // [2, 4]

// Chained transformations with validation
const ProcessedArraySchema = z.array(z.string())
  .transform((arr) => arr.map((s) => s.toLowerCase().trim()))
  .transform((arr) => [...new Set(arr)])
  .refine((arr) => arr.length >= 1, 'Must have at least one unique item');

ProcessedArraySchema.parse(['  Hello ', 'WORLD', 'hello']);  // ['hello', 'world']
```
