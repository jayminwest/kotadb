---
title: Zod - Primitives
source: https://zod.dev/?id=primitives
date: 2026-01-30
tags:
  - zod
  - validation
  - typescript
  - primitives
---

# Zod - Primitives

Zod provides schemas for all JavaScript primitive types and special types.

## Primitive Types

### z.string()

Creates a schema for string values.

```typescript
const schema = z.string();

schema.parse('hello'); // 'hello'
schema.parse(123);     // Throws ZodError
```

### z.number()

Creates a schema for number values (including floats).

```typescript
const schema = z.number();

schema.parse(42);      // 42
schema.parse(3.14);    // 3.14
schema.parse('42');    // Throws ZodError
schema.parse(NaN);     // Throws ZodError (by default)
```

### z.bigint()

Creates a schema for BigInt values.

```typescript
const schema = z.bigint();

schema.parse(BigInt(100));  // 100n
schema.parse(100n);         // 100n
schema.parse(100);          // Throws ZodError
```

### z.boolean()

Creates a schema for boolean values.

```typescript
const schema = z.boolean();

schema.parse(true);   // true
schema.parse(false);  // false
schema.parse(1);      // Throws ZodError
```

### z.date()

Creates a schema for Date objects.

```typescript
const schema = z.date();

schema.parse(new Date());           // Date object
schema.parse('2024-01-01');         // Throws ZodError
schema.parse(new Date('invalid'));  // Throws ZodError (invalid date)
```

### z.symbol()

Creates a schema for Symbol values.

```typescript
const schema = z.symbol();

schema.parse(Symbol('test'));  // Symbol(test)
schema.parse('symbol');        // Throws ZodError
```

### z.undefined()

Creates a schema that only accepts `undefined`.

```typescript
const schema = z.undefined();

schema.parse(undefined);  // undefined
schema.parse(null);       // Throws ZodError
```

### z.null()

Creates a schema that only accepts `null`.

```typescript
const schema = z.null();

schema.parse(null);       // null
schema.parse(undefined);  // Throws ZodError
```

### z.void()

Creates a schema that accepts `undefined`. Useful for function return types.

```typescript
const schema = z.void();

schema.parse(undefined);  // undefined
```

### z.any()

Creates a schema that accepts any value. Disables type checking.

```typescript
const schema = z.any();

schema.parse('anything');  // 'anything'
schema.parse(123);         // 123
schema.parse(null);        // null
```

### z.unknown()

Creates a schema that accepts any value but requires type checking before use.

```typescript
const schema = z.unknown();

schema.parse('anything');  // 'anything'
schema.parse(123);         // 123

// Type is 'unknown', requires narrowing before use
const result: unknown = schema.parse(data);
if (typeof result === 'string') {
  console.log(result.toUpperCase());
}
```

### z.never()

Creates a schema that accepts no values. Useful for exhaustive type checking.

```typescript
const schema = z.never();

schema.parse('anything');  // Always throws ZodError
```

## String Validations

### Length Validations

```typescript
z.string().min(5);          // Minimum 5 characters
z.string().max(100);        // Maximum 100 characters
z.string().length(10);      // Exactly 10 characters
z.string().nonempty();      // Alias for .min(1)
```

### Format Validations

```typescript
// Email
z.string().email();
z.string().email('Invalid email address');

// URL
z.string().url();
z.string().url('Must be a valid URL');

// UUID
z.string().uuid();

// CUID
z.string().cuid();
z.string().cuid2();

// ULID
z.string().ulid();

// Emoji
z.string().emoji();

// Datetime (ISO 8601)
z.string().datetime();
z.string().datetime({ offset: true });  // Allow timezone offset
z.string().datetime({ precision: 3 });  // Millisecond precision

// Date (YYYY-MM-DD)
z.string().date();

// Time (HH:MM:SS)
z.string().time();

// Duration (ISO 8601)
z.string().duration();

// IP Address
z.string().ip();
z.string().ip({ version: 'v4' });
z.string().ip({ version: 'v6' });

// Base64
z.string().base64();
```

### Pattern Matching

```typescript
// Regex validation
z.string().regex(/^[a-z]+$/);
z.string().regex(/^\d{3}-\d{4}$/, 'Invalid phone format');

// Includes substring
z.string().includes('hello');
z.string().includes('@', { message: 'Must contain @' });

// Starts with
z.string().startsWith('https://');

// Ends with
z.string().endsWith('.com');
```

### Transformations

```typescript
// Trim whitespace
z.string().trim();

// Convert to lowercase
z.string().toLowerCase();

// Convert to uppercase
z.string().toUpperCase();
```

### Combined Example

```typescript
const EmailSchema = z.string()
  .email('Invalid email')
  .min(5, 'Email too short')
  .max(100, 'Email too long')
  .toLowerCase()
  .trim();

const PasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')
  .regex(/[A-Z]/, 'Must contain uppercase')
  .regex(/[a-z]/, 'Must contain lowercase')
  .regex(/[0-9]/, 'Must contain number');
```

## Number Validations

### Range Validations

```typescript
z.number().min(0);           // >= 0
z.number().max(100);         // <= 100
z.number().gte(0);           // >= 0 (alias for min)
z.number().lte(100);         // <= 100 (alias for max)
z.number().gt(0);            // > 0
z.number().lt(100);          // < 100
```

### Sign Validations

```typescript
z.number().positive();       // > 0
z.number().nonnegative();    // >= 0
z.number().negative();       // < 0
z.number().nonpositive();    // <= 0
```

### Type Validations

```typescript
z.number().int();            // Integer only
z.number().finite();         // Not Infinity or -Infinity
z.number().safe();           // Within safe integer range
```

### Multiple Validations

```typescript
z.number().multipleOf(5);    // Divisible by 5
z.number().step(0.01);       // Alias for multipleOf
```

### Combined Example

```typescript
const AgeSchema = z.number()
  .int('Age must be a whole number')
  .min(0, 'Age cannot be negative')
  .max(150, 'Invalid age');

const PriceSchema = z.number()
  .positive('Price must be positive')
  .multipleOf(0.01)
  .finite();

const PercentageSchema = z.number()
  .min(0)
  .max(100);
```

## BigInt Validations

```typescript
z.bigint().positive();       // > 0n
z.bigint().negative();       // < 0n
z.bigint().nonnegative();    // >= 0n
z.bigint().nonpositive();    // <= 0n
z.bigint().multipleOf(5n);   // Divisible by 5n
z.bigint().min(0n);          // >= 0n
z.bigint().max(100n);        // <= 100n
z.bigint().gte(0n);          // >= 0n
z.bigint().lte(100n);        // <= 100n
z.bigint().gt(0n);           // > 0n
z.bigint().lt(100n);         // < 100n
```

## Date Validations

```typescript
z.date().min(new Date('2020-01-01'));  // After this date
z.date().max(new Date('2030-12-31'));  // Before this date
```

## Coercion Methods

Coercion methods attempt to convert input to the target type before validation.

### z.coerce.string()

```typescript
const schema = z.coerce.string();

schema.parse(123);        // '123'
schema.parse(true);       // 'true'
schema.parse(null);       // 'null'
schema.parse(undefined);  // 'undefined'
```

### z.coerce.number()

```typescript
const schema = z.coerce.number();

schema.parse('42');       // 42
schema.parse('3.14');     // 3.14
schema.parse(true);       // 1
schema.parse(false);      // 0
schema.parse('');         // 0
schema.parse('hello');    // NaN (then fails validation)
```

### z.coerce.boolean()

```typescript
const schema = z.coerce.boolean();

schema.parse('true');     // true (truthy string)
schema.parse('');         // false (empty string is falsy)
schema.parse(1);          // true
schema.parse(0);          // false
schema.parse(null);       // false
```

### z.coerce.bigint()

```typescript
const schema = z.coerce.bigint();

schema.parse('100');      // 100n
schema.parse(100);        // 100n
schema.parse(true);       // 1n
```

### z.coerce.date()

```typescript
const schema = z.coerce.date();

schema.parse('2024-01-01');           // Date object
schema.parse(1704067200000);          // Date from timestamp
schema.parse(new Date('2024-01-01')); // Date object
```

### Coercion with Validations

```typescript
// Coerce to number, then validate
const AgeSchema = z.coerce.number()
  .int()
  .min(0)
  .max(150);

AgeSchema.parse('25');    // 25
AgeSchema.parse('25.5');  // Throws (not an integer after coercion)
AgeSchema.parse('-5');    // Throws (negative after coercion)

// Coerce to date, then validate
const FutureDateSchema = z.coerce.date()
  .min(new Date());

FutureDateSchema.parse('2030-01-01');  // Date object
FutureDateSchema.parse('2020-01-01');  // Throws (in the past)
```

## Literal Types

Create schemas that match exact values.

```typescript
const TrueSchema = z.literal(true);
const FortyTwo = z.literal(42);
const HelloWorld = z.literal('hello world');

TrueSchema.parse(true);     // true
TrueSchema.parse(false);    // Throws

FortyTwo.parse(42);         // 42
FortyTwo.parse(43);         // Throws

HelloWorld.parse('hello world');  // 'hello world'
HelloWorld.parse('hello');        // Throws
```

## Complete Primitives Example

```typescript
import { z } from 'zod';

// User profile schema with various primitives
const UserProfileSchema = z.object({
  // String with validations
  username: z.string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/),
  
  // Email with coercion (trim + lowercase)
  email: z.string()
    .email()
    .trim()
    .toLowerCase(),
  
  // Number with range
  age: z.number()
    .int()
    .min(13)
    .max(120)
    .optional(),
  
  // Coerced number from string input
  score: z.coerce.number()
    .min(0)
    .max(100)
    .default(0),
  
  // Boolean
  isVerified: z.boolean().default(false),
  
  // Date with coercion
  birthDate: z.coerce.date().optional(),
  
  // UUID string
  id: z.string().uuid(),
  
  // URL string
  website: z.string().url().optional(),
  
  // Literal type
  status: z.literal('active'),
});

type UserProfile = z.infer<typeof UserProfileSchema>;

// Usage
const profile = UserProfileSchema.parse({
  username: 'john_doe',
  email: '  John@Example.COM  ',
  age: 28,
  score: '85',
  isVerified: true,
  birthDate: '1996-05-15',
  id: '550e8400-e29b-41d4-a716-446655440000',
  website: 'https://example.com',
  status: 'active',
});

console.log(profile.email);     // 'john@example.com' (trimmed + lowercased)
console.log(profile.score);     // 85 (coerced from string)
console.log(profile.birthDate); // Date object
```
