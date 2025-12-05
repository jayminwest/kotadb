# Zod Objects Documentation

**Source:** https://zod.dev/?id=objects
**Date:** 2025-12-05

---

## Overview

Objects in Zod validate structured data with key-value pairs. All properties are required by default unless explicitly marked otherwise.

## Basic Object Definition

```typescript
const Person = z.object({
  name: z.string(),
  age: z.number(),
});

type Person = z.infer<typeof Person>;
// => { name: string; age: number; }
```

## Optional Properties

Use `.optional()` to allow undefined values:

```typescript
const Dog = z.object({
  name: z.string(),
  age: z.number().optional(),
});

Dog.parse({ name: "Yeller" }); // ✅
```

## Unknown Key Handling

**Default behavior**: Unknown keys are stripped from results.

```typescript
Dog.parse({ name: "Yeller", extraKey: true });
// => { name: "Yeller" }
```

### Strict Objects

Throw errors on unknown keys:

```typescript
const StrictDog = z.strictObject({
  name: z.string(),
});

StrictDog.parse({ name: "Yeller", extraKey: true }); // ❌ throws
```

### Loose Objects

Allow unknown keys to pass through:

```typescript
const LooseDog = z.looseObject({
  name: z.string(),
});

LooseDog.parse({ name: "Yeller", extraKey: true });
// => { name: "Yeller", extraKey: true }
```

### Catchall Schemas

Validate unrecognized keys against a specific schema:

```typescript
const DogWithStrings = z.object({
  name: z.string(),
  age: z.number().optional(),
}).catchall(z.string());

DogWithStrings.parse({ name: "Yeller", extraKey: "extraValue" }); // ✅
DogWithStrings.parse({ name: "Yeller", extraKey: 42 }); // ❌
```

## Object Utility Methods

### `.shape`

Access internal schemas:

```typescript
Dog.shape.name; // => string schema
Dog.shape.age; // => number schema
```

### `.keyof()`

Create an enum from object keys:

```typescript
const keySchema = Dog.keyof();
// => ZodEnum<["name", "age"]>
```

### `.extend()`

Add or override fields:

```typescript
const DogWithBreed = Dog.extend({
  breed: z.string(),
});
```

**Alternative with spread syntax** (preferred for efficiency and clarity):

```typescript
const DogWithBreed = z.object({
  ...Dog.shape,
  breed: z.string(),
});
```

### `.safeExtend()`

Extend while preventing non-assignable property overwrites:

```typescript
z.object({ a: z.string() }).safeExtend({ a: z.string().min(5) }); // ✅
z.object({ a: z.string() }).safeExtend({ a: z.number() }); // ❌
```

### `.pick()`

Select specific properties:

```typescript
const Recipe = z.object({
  title: z.string(),
  description: z.string().optional(),
  ingredients: z.array(z.string()),
});

const JustTheTitle = Recipe.pick({ title: true });
```

### `.omit()`

Exclude specific properties:

```typescript
const RecipeNoId = Recipe.omit({ id: true });
```

### `.partial()`

Make all or selected properties optional:

```typescript
const PartialRecipe = Recipe.partial();
// All fields optional

const RecipeOptionalIngredients = Recipe.partial({
  ingredients: true,
});
// Only ingredients optional
```

### `.required()`

Make all or selected properties mandatory:

```typescript
const RequiredRecipe = Recipe.required();

const RecipeRequiredDescription = Recipe.required({ description: true });
```

## Recursive Objects

Self-referential schemas use getters:

```typescript
const Category = z.object({
  name: z.string(),
  get subcategories(){
    return z.array(Category)
  }
});

type Category = z.infer<typeof Category>;
// { name: string; subcategories: Category[] }
```

**Mutually recursive types**:

```typescript
const User = z.object({
  email: z.email(),
  get posts(){
    return z.array(Post)
  }
});

const Post = z.object({
  title: z.string(),
  get author(){
    return User
  }
});
```

### Handling Circularity Errors

Add type annotations to recursive getters when TypeScript can't infer them:

```typescript
const Activity = z.object({
  name: z.string(),
  get subactivities(): z.ZodNullable<z.ZodArray<typeof Activity>> {
    return z.nullable(z.array(Activity));
  },
});
```

## Key Points

- Objects validate structured, typed data
- Unknown key behavior is configurable (strip, strict, or loose)
- Utility methods enable composition and transformation
- Spread syntax is preferred over `.extend()` for performance
- Recursive types require getter syntax
