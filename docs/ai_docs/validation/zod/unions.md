---
title: Zod - Unions
source: https://zod.dev/?id=unions
date: 2026-01-30
tags:
  - zod
  - validation
  - typescript
  - unions
---

# Zod - Unions

Zod provides several ways to define union types and enumerations.

## z.union()

Creates a schema that accepts multiple types.

```typescript
import { z } from 'zod';

const StringOrNumber = z.union([z.string(), z.number()]);

type StringOrNumber = z.infer<typeof StringOrNumber>;
// string | number

StringOrNumber.parse('hello');  // Valid
StringOrNumber.parse(42);       // Valid
StringOrNumber.parse(true);     // Throws ZodError
```

### Union of Objects

```typescript
const DogSchema = z.object({
  type: z.literal('dog'),
  breed: z.string(),
  barks: z.boolean(),
});

const CatSchema = z.object({
  type: z.literal('cat'),
  breed: z.string(),
  meows: z.boolean(),
});

const PetSchema = z.union([DogSchema, CatSchema]);

type Pet = z.infer<typeof PetSchema>;
// { type: 'dog'; breed: string; barks: boolean } | { type: 'cat'; breed: string; meows: boolean }

PetSchema.parse({ type: 'dog', breed: 'Labrador', barks: true });  // Valid
PetSchema.parse({ type: 'cat', breed: 'Siamese', meows: true });   // Valid
```

### Union of Multiple Types

```typescript
const FlexibleValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

type FlexibleValue = z.infer<typeof FlexibleValue>;
// string | number | boolean | null
```

### Shorthand with .or()

```typescript
const StringOrNumber = z.string().or(z.number());

// Equivalent to:
const StringOrNumber = z.union([z.string(), z.number()]);
```

## z.discriminatedUnion()

A more efficient union for objects that share a common discriminator field.

```typescript
const ResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: z.string(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    code: z.number(),
  }),
]);

type Result = z.infer<typeof ResultSchema>;
// | { status: 'success'; data: string }
// | { status: 'error'; message: string; code: number }

ResultSchema.parse({ status: 'success', data: 'Hello' });           // Valid
ResultSchema.parse({ status: 'error', message: 'Oops', code: 500 }); // Valid
ResultSchema.parse({ status: 'pending' });                          // Throws ZodError
```

### Benefits of Discriminated Unions

1. **Better performance**: Zod can quickly determine which variant to use based on the discriminator
2. **Better error messages**: Errors are specific to the matched variant
3. **TypeScript narrowing**: Works perfectly with TypeScript's type narrowing

```typescript
const EventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('click'),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    type: z.literal('keypress'),
    key: z.string(),
    modifiers: z.array(z.string()),
  }),
  z.object({
    type: z.literal('scroll'),
    deltaX: z.number(),
    deltaY: z.number(),
  }),
]);

type Event = z.infer<typeof EventSchema>;

function handleEvent(event: Event) {
  switch (event.type) {
    case 'click':
      console.log(`Clicked at (${event.x}, ${event.y})`);
      break;
    case 'keypress':
      console.log(`Pressed ${event.key}`);
      break;
    case 'scroll':
      console.log(`Scrolled by (${event.deltaX}, ${event.deltaY})`);
      break;
  }
}
```

## z.literal()

Creates a schema that matches an exact primitive value.

```typescript
const TrueSchema = z.literal(true);
const FortyTwo = z.literal(42);
const HelloWorld = z.literal('hello world');

TrueSchema.parse(true);          // Valid
TrueSchema.parse(false);         // Throws ZodError

FortyTwo.parse(42);              // Valid
FortyTwo.parse(43);              // Throws ZodError

HelloWorld.parse('hello world'); // Valid
HelloWorld.parse('hello');       // Throws ZodError
```

### Literal Types

```typescript
type TrueType = z.infer<typeof TrueSchema>;     // true
type FortyTwoType = z.infer<typeof FortyTwo>;   // 42
type HelloWorldType = z.infer<typeof HelloWorld>; // 'hello world'
```

### Union of Literals

```typescript
const DirectionSchema = z.union([
  z.literal('north'),
  z.literal('south'),
  z.literal('east'),
  z.literal('west'),
]);

type Direction = z.infer<typeof DirectionSchema>;
// 'north' | 'south' | 'east' | 'west'
```

## Enums

### z.enum()

Creates a schema from a fixed set of string values.

```typescript
const StatusSchema = z.enum(['pending', 'active', 'archived']);

type Status = z.infer<typeof StatusSchema>;
// 'pending' | 'active' | 'archived'

StatusSchema.parse('active');   // Valid
StatusSchema.parse('deleted');  // Throws ZodError
```

### Enum Values and Options

```typescript
const StatusSchema = z.enum(['pending', 'active', 'archived']);

// Access the values
StatusSchema.options;  // ['pending', 'active', 'archived']
StatusSchema.enum;     // { pending: 'pending', active: 'active', archived: 'archived' }

// Use enum values
const status = StatusSchema.enum.active;  // 'active'

// Type-safe access
StatusSchema.enum.pending;   // Valid
StatusSchema.enum.deleted;   // TypeScript error
```

### Extracting and Excluding Values

```typescript
const RoleSchema = z.enum(['admin', 'editor', 'viewer', 'guest']);

// Extract specific values
const AdminOnlySchema = RoleSchema.extract(['admin']);
type AdminOnly = z.infer<typeof AdminOnlySchema>;
// 'admin'

// Exclude specific values
const NonGuestSchema = RoleSchema.exclude(['guest']);
type NonGuest = z.infer<typeof NonGuestSchema>;
// 'admin' | 'editor' | 'viewer'
```

### z.nativeEnum()

Creates a schema from a TypeScript enum.

```typescript
enum Status {
  Pending = 'PENDING',
  Active = 'ACTIVE',
  Archived = 'ARCHIVED',
}

const StatusSchema = z.nativeEnum(Status);

type StatusType = z.infer<typeof StatusSchema>;
// Status (the enum type)

StatusSchema.parse(Status.Active);  // Valid
StatusSchema.parse('ACTIVE');       // Valid
StatusSchema.parse('active');       // Throws ZodError
```

### Numeric Enums

```typescript
enum Priority {
  Low = 0,
  Medium = 1,
  High = 2,
}

const PrioritySchema = z.nativeEnum(Priority);

PrioritySchema.parse(Priority.High);  // Valid
PrioritySchema.parse(2);              // Valid
PrioritySchema.parse(5);              // Throws ZodError
```

### Const Objects as Enums

```typescript
const STATUS = {
  Pending: 'PENDING',
  Active: 'ACTIVE',
  Archived: 'ARCHIVED',
} as const;

const StatusSchema = z.nativeEnum(STATUS);

type Status = z.infer<typeof StatusSchema>;
// 'PENDING' | 'ACTIVE' | 'ARCHIVED'

StatusSchema.parse('PENDING');  // Valid
StatusSchema.parse('pending');  // Throws ZodError
```

## Optional and Nullable Unions

```typescript
// Optional (value or undefined)
const OptionalString = z.string().optional();
// equivalent to: z.union([z.string(), z.undefined()])

// Nullable (value or null)
const NullableString = z.string().nullable();
// equivalent to: z.union([z.string(), z.null()])

// Nullish (value, null, or undefined)
const NullishString = z.string().nullish();
// equivalent to: z.union([z.string(), z.null(), z.undefined()])
```

## Complete Unions Example

```typescript
import { z } from 'zod';

// Define status enum
const OrderStatus = z.enum([
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]);

// Define payment method as discriminated union
const PaymentMethodSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('credit_card'),
    cardNumber: z.string().regex(/^\d{16}$/),
    expiryMonth: z.number().min(1).max(12),
    expiryYear: z.number().min(2024),
    cvv: z.string().length(3),
  }),
  z.object({
    type: z.literal('paypal'),
    email: z.string().email(),
  }),
  z.object({
    type: z.literal('bank_transfer'),
    accountNumber: z.string(),
    routingNumber: z.string(),
  }),
  z.object({
    type: z.literal('crypto'),
    walletAddress: z.string(),
    currency: z.enum(['BTC', 'ETH', 'USDT']),
  }),
]);

// Define shipping option
const ShippingOptionSchema = z.union([
  z.literal('standard'),
  z.literal('express'),
  z.literal('overnight'),
]);

// Define order item
const OrderItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().positive(),
});

// Define complete order
const OrderSchema = z.object({
  id: z.string().uuid(),
  status: OrderStatus,
  items: z.array(OrderItemSchema).nonempty(),
  shipping: ShippingOptionSchema,
  payment: PaymentMethodSchema,
  notes: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
});

type Order = z.infer<typeof OrderSchema>;
type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
type OrderStatus = z.infer<typeof OrderStatus>;

// Type-safe order handling
function processOrder(order: Order) {
  console.log(`Processing order ${order.id}`);
  console.log(`Status: ${order.status}`);
  console.log(`Items: ${order.items.length}`);
  
  // Payment type narrowing
  switch (order.payment.type) {
    case 'credit_card':
      console.log(`Card ending in ${order.payment.cardNumber.slice(-4)}`);
      break;
    case 'paypal':
      console.log(`PayPal: ${order.payment.email}`);
      break;
    case 'bank_transfer':
      console.log(`Bank: ${order.payment.accountNumber}`);
      break;
    case 'crypto':
      console.log(`Crypto: ${order.payment.currency} to ${order.payment.walletAddress}`);
      break;
  }
}

// Usage
const order = OrderSchema.parse({
  id: '550e8400-e29b-41d4-a716-446655440000',
  status: 'pending',
  items: [
    {
      productId: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Widget',
      quantity: 2,
      price: 29.99,
    },
  ],
  shipping: 'express',
  payment: {
    type: 'credit_card',
    cardNumber: '4111111111111111',
    expiryMonth: 12,
    expiryYear: 2025,
    cvv: '123',
  },
});

processOrder(order);

// Validation with discriminated union
const invalidPayment = PaymentMethodSchema.safeParse({
  type: 'crypto',
  walletAddress: '0x123...',
  currency: 'DOGE',  // Invalid - not in enum
});

if (!invalidPayment.success) {
  console.error('Payment validation failed:', invalidPayment.error.errors);
}
```
