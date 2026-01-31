---
title: Zod - Objects
source: https://zod.dev/?id=objects
date: 2026-01-30
tags:
  - zod
  - validation
  - typescript
  - objects
---

# Zod - Objects

Zod provides powerful tools for defining and manipulating object schemas.

## z.object()

Creates a schema for an object with specified keys.

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;
// { name: string; age: number; email: string }

UserSchema.parse({
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
});
```

### Nested Objects

```typescript
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string(),
});

const PersonSchema = z.object({
  name: z.string(),
  address: AddressSchema,
});

type Person = z.infer<typeof PersonSchema>;
// { name: string; address: { street: string; city: string; country: string } }
```

## Optional and Required

### Optional Fields

```typescript
const UserSchema = z.object({
  name: z.string(),
  nickname: z.string().optional(),  // string | undefined
});

UserSchema.parse({ name: 'Alice' });  // Valid
UserSchema.parse({ name: 'Alice', nickname: 'Ali' });  // Valid
```

### Nullable Fields

```typescript
const UserSchema = z.object({
  name: z.string(),
  middleName: z.string().nullable(),  // string | null
});

UserSchema.parse({ name: 'Alice', middleName: null });  // Valid
```

### Nullish Fields

```typescript
const UserSchema = z.object({
  name: z.string(),
  bio: z.string().nullish(),  // string | null | undefined
});

UserSchema.parse({ name: 'Alice' });  // Valid
UserSchema.parse({ name: 'Alice', bio: null });  // Valid
```

### Default Values

```typescript
const UserSchema = z.object({
  name: z.string(),
  role: z.string().default('user'),
  createdAt: z.date().default(() => new Date()),
});

const user = UserSchema.parse({ name: 'Alice' });
// { name: 'Alice', role: 'user', createdAt: Date }
```

## .shape

Access the schema of individual properties.

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const nameSchema = UserSchema.shape.name;  // z.string()
const ageSchema = UserSchema.shape.age;    // z.number()

nameSchema.parse('Alice');  // Valid
```

## .keyof()

Creates a schema for the keys of an object schema.

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string(),
});

const UserKeys = UserSchema.keyof();
// z.enum(['name', 'age', 'email'])

type UserKey = z.infer<typeof UserKeys>;
// 'name' | 'age' | 'email'

UserKeys.parse('name');   // Valid
UserKeys.parse('other');  // Throws ZodError
```

## .extend()

Creates a new schema by adding properties to an existing object schema.

```typescript
const BaseUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const AdminSchema = BaseUserSchema.extend({
  role: z.literal('admin'),
  permissions: z.array(z.string()),
});

type Admin = z.infer<typeof AdminSchema>;
// { name: string; email: string; role: 'admin'; permissions: string[] }
```

### Overriding Properties

`.extend()` can override existing properties:

```typescript
const BaseSchema = z.object({
  id: z.string(),
});

const ExtendedSchema = BaseSchema.extend({
  id: z.number(),  // Override string with number
});

type Extended = z.infer<typeof ExtendedSchema>;
// { id: number }
```

## .merge()

Merges two object schemas together.

```typescript
const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
});

const ContactSchema = z.object({
  email: z.string().email(),
  phone: z.string(),
});

const PersonWithContactSchema = PersonSchema.merge(ContactSchema);

type PersonWithContact = z.infer<typeof PersonWithContactSchema>;
// { name: string; age: number; email: string; phone: string }
```

**Note:** `.merge()` and `.extend()` behave similarly, but `.merge()` cannot override properties.

## .pick()

Creates a schema with only the specified properties.

```typescript
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
});

const PublicUserSchema = UserSchema.pick({
  id: true,
  name: true,
});

type PublicUser = z.infer<typeof PublicUserSchema>;
// { id: string; name: string }
```

## .omit()

Creates a schema without the specified properties.

```typescript
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  password: z.string(),
});

const UserWithoutPasswordSchema = UserSchema.omit({
  password: true,
});

type UserWithoutPassword = z.infer<typeof UserWithoutPasswordSchema>;
// { id: string; name: string; email: string }
```

## .partial()

Makes all properties optional.

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const PartialUserSchema = UserSchema.partial();

type PartialUser = z.infer<typeof PartialUserSchema>;
// { name?: string; age?: number; email?: string }

PartialUserSchema.parse({});  // Valid
PartialUserSchema.parse({ name: 'Alice' });  // Valid
```

### Selective Partial

Make only specific properties optional:

```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
});

const PartialUserSchema = UserSchema.partial({
  age: true,
  email: true,
});

type PartialUser = z.infer<typeof PartialUserSchema>;
// { name: string; age?: number; email?: string }
```

### Deep Partial

Make nested properties optional:

```typescript
const UserSchema = z.object({
  name: z.string(),
  address: z.object({
    street: z.string(),
    city: z.string(),
  }),
});

const DeepPartialUserSchema = UserSchema.deepPartial();

type DeepPartialUser = z.infer<typeof DeepPartialUserSchema>;
// { name?: string; address?: { street?: string; city?: string } }
```

## .required()

Makes all properties required (opposite of `.partial()`).

```typescript
const PartialUserSchema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
});

const RequiredUserSchema = PartialUserSchema.required();

type RequiredUser = z.infer<typeof RequiredUserSchema>;
// { name: string; age: number }
```

### Selective Required

Make only specific properties required:

```typescript
const UserSchema = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
  email: z.string().optional(),
});

const PartialRequiredSchema = UserSchema.required({
  name: true,
});

type PartialRequired = z.infer<typeof PartialRequiredSchema>;
// { name: string; age?: number; email?: string }
```

## .passthrough()

By default, Zod strips unrecognized keys. `.passthrough()` preserves them.

```typescript
const UserSchema = z.object({
  name: z.string(),
});

// Default behavior - strips extra keys
const stripped = UserSchema.parse({
  name: 'Alice',
  extra: 'value',
});
// { name: 'Alice' }

// With passthrough - preserves extra keys
const PassthroughSchema = UserSchema.passthrough();

const preserved = PassthroughSchema.parse({
  name: 'Alice',
  extra: 'value',
});
// { name: 'Alice', extra: 'value' }
```

## .strict()

Rejects objects with unrecognized keys.

```typescript
const StrictUserSchema = z.object({
  name: z.string(),
}).strict();

StrictUserSchema.parse({ name: 'Alice' });  // Valid

StrictUserSchema.parse({
  name: 'Alice',
  extra: 'value',
});  // Throws ZodError
```

### Custom Error Message

```typescript
const StrictUserSchema = z.object({
  name: z.string(),
}).strict({
  message: 'Unknown fields are not allowed',
});
```

## .strip()

Explicitly strips unrecognized keys (default behavior).

```typescript
const UserSchema = z.object({
  name: z.string(),
}).passthrough().strip();  // Override passthrough

const result = UserSchema.parse({
  name: 'Alice',
  extra: 'value',
});
// { name: 'Alice' }
```

## .catchall()

Defines a schema for unrecognized keys.

```typescript
const UserSchema = z.object({
  name: z.string(),
}).catchall(z.string());

const result = UserSchema.parse({
  name: 'Alice',
  customField1: 'value1',
  customField2: 'value2',
});
// { name: 'Alice', customField1: 'value1', customField2: 'value2' }

// Non-string extra values fail
UserSchema.parse({
  name: 'Alice',
  customField: 123,  // Throws - must be string
});
```

### Type Inference with Catchall

```typescript
const Schema = z.object({
  id: z.number(),
}).catchall(z.string());

type SchemaType = z.infer<typeof Schema>;
// { id: number } & { [k: string]: string }
```

## Complete Objects Example

```typescript
import { z } from 'zod';

// Base schemas
const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}$/),
  country: z.string().default('US'),
});

const BaseUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.date().default(() => new Date()),
});

// Extended schemas
const FullUserSchema = BaseUserSchema.extend({
  phone: z.string().optional(),
  address: AddressSchema.optional(),
  preferences: z.object({
    theme: z.enum(['light', 'dark']).default('light'),
    notifications: z.boolean().default(true),
  }).default({}),
});

// Variations
const PublicUserSchema = FullUserSchema.pick({
  id: true,
  name: true,
});

const UserUpdateSchema = FullUserSchema.partial().omit({
  id: true,
  createdAt: true,
});

const StrictUserSchema = FullUserSchema.strict();

// Types
type FullUser = z.infer<typeof FullUserSchema>;
type PublicUser = z.infer<typeof PublicUserSchema>;
type UserUpdate = z.infer<typeof UserUpdateSchema>;

// Usage
const newUser = FullUserSchema.parse({
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'alice@example.com',
  name: 'Alice Johnson',
  phone: '+1-555-123-4567',
  address: {
    street: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
  },
});

console.log(newUser.preferences.theme);  // 'light' (default)
console.log(newUser.address?.country);   // 'US' (default)

// Update with partial schema
const update = UserUpdateSchema.parse({
  name: 'Alice Smith',
  preferences: {
    theme: 'dark',
  },
});

// Extract public info
const publicInfo = PublicUserSchema.parse(newUser);
// { id: '...', name: 'Alice Johnson' }
```
