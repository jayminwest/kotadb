---
title: Zod - Error Handling
source: https://zod.dev/?id=error-handling
date: 2026-01-30
tags:
  - zod
  - validation
  - typescript
  - error-handling
---

# Zod - Error Handling

Zod provides comprehensive error handling capabilities with detailed error messages and formatting options.

## .parse() vs .safeParse()

### .parse()

Throws a `ZodError` if validation fails.

```typescript
import { z } from 'zod';

const schema = z.string().email();

try {
  const result = schema.parse('invalid-email');
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Validation failed:', error.errors);
  }
}
```

### .safeParse()

Returns a result object instead of throwing.

```typescript
const schema = z.string().email();

const result = schema.safeParse('invalid-email');

if (result.success) {
  // result.data is the validated value
  console.log('Email:', result.data);
} else {
  // result.error is a ZodError
  console.error('Errors:', result.error.errors);
}
```

### Type Narrowing

```typescript
const result = schema.safeParse(input);

if (result.success) {
  // TypeScript knows result.data exists and has the correct type
  const email: string = result.data;
} else {
  // TypeScript knows result.error is a ZodError
  const errors: z.ZodError = result.error;
}
```

### Async Variants

```typescript
// For schemas with async refinements or transforms
const asyncResult = await schema.safeParseAsync(input);

try {
  const result = await schema.parseAsync(input);
} catch (error) {
  // Handle error
}
```

## ZodError

The `ZodError` class contains detailed information about validation failures.

### Structure

```typescript
interface ZodError<T = unknown> {
  issues: ZodIssue[];
  errors: ZodIssue[];  // Alias for issues
  
  format(): ZodFormattedError<T>;
  flatten(): FlattenedError<T>;
  isEmpty: boolean;
  message: string;
}
```

### ZodIssue

Each validation failure is represented as a `ZodIssue`.

```typescript
interface ZodIssue {
  code: ZodIssueCode;
  path: (string | number)[];
  message: string;
  // Additional fields depending on the code
}

// Issue codes
type ZodIssueCode =
  | 'invalid_type'
  | 'invalid_literal'
  | 'custom'
  | 'invalid_union'
  | 'invalid_union_discriminator'
  | 'invalid_enum_value'
  | 'unrecognized_keys'
  | 'invalid_arguments'
  | 'invalid_return_type'
  | 'invalid_date'
  | 'invalid_string'
  | 'too_small'
  | 'too_big'
  | 'invalid_intersection_types'
  | 'not_multiple_of'
  | 'not_finite';
```

### Accessing Errors

```typescript
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0),
});

const result = UserSchema.safeParse({
  name: '',
  email: 'invalid',
  age: -5,
});

if (!result.success) {
  // Iterate over all issues
  for (const issue of result.error.issues) {
    console.log(`Path: ${issue.path.join('.')}`);
    console.log(`Code: ${issue.code}`);
    console.log(`Message: ${issue.message}`);
  }
}
```

## .format()

Formats errors into a nested object structure matching the schema shape.

```typescript
const UserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  address: z.object({
    street: z.string(),
    city: z.string(),
  }),
});

const result = UserSchema.safeParse({
  name: '',
  email: 'invalid',
  address: {
    street: '',
    city: 123,
  },
});

if (!result.success) {
  const formatted = result.error.format();
  
  console.log(formatted);
  // {
  //   _errors: [],
  //   name: { _errors: ['String must contain at least 1 character(s)'] },
  //   email: { _errors: ['Invalid email'] },
  //   address: {
  //     _errors: [],
  //     street: { _errors: ['String must contain at least 1 character(s)'] },
  //     city: { _errors: ['Expected string, received number'] },
  //   },
  // }
  
  // Access specific field errors
  console.log(formatted.name?._errors);     // ['String must contain at least 1 character(s)']
  console.log(formatted.email?._errors);    // ['Invalid email']
  console.log(formatted.address?.city?._errors); // ['Expected string, received number']
}
```

### Type-Safe Format

```typescript
type FormattedError = z.inferFormattedError<typeof UserSchema>;

const formatted: FormattedError = result.error.format();
```

## .flatten()

Flattens errors into a simple object with field errors and form-level errors.

```typescript
const result = UserSchema.safeParse({
  name: '',
  email: 'invalid',
});

if (!result.success) {
  const flattened = result.error.flatten();
  
  console.log(flattened);
  // {
  //   formErrors: [],
  //   fieldErrors: {
  //     name: ['String must contain at least 1 character(s)'],
  //     email: ['Invalid email'],
  //   },
  // }
  
  // Access field errors
  console.log(flattened.fieldErrors.name);   // ['String must contain at least 1 character(s)']
  console.log(flattened.fieldErrors.email);  // ['Invalid email']
}
```

### Custom Error Mapper

```typescript
const flattened = result.error.flatten((issue) => ({
  message: issue.message,
  code: issue.code,
}));

// {
//   formErrors: [],
//   fieldErrors: {
//     name: [{ message: '...', code: 'too_small' }],
//     email: [{ message: '...', code: 'invalid_string' }],
//   },
// }
```

## Custom Error Messages

### Inline Messages

```typescript
const schema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name is too long')
  .email('Invalid email format');

const schema = z.number()
  .min(0, { message: 'Must be non-negative' })
  .max(100, { message: 'Cannot exceed 100' });
```

### Message Object

```typescript
const schema = z.string({
  required_error: 'This field is required',
  invalid_type_error: 'Must be a string',
}).min(1, {
  message: 'Cannot be empty',
});
```

### Object-Level Messages

```typescript
const UserSchema = z.object({
  password: z.string(),
  confirmPassword: z.string(),
}, {
  required_error: 'User data is required',
  invalid_type_error: 'User data must be an object',
});
```

### Custom Validation Messages

```typescript
const schema = z.string().refine(
  (val) => val.includes('@'),
  {
    message: 'Must contain @ symbol',
    path: [], // Optional: override error path
  }
);

// Multiple custom messages
const PasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .refine((val) => /[A-Z]/.test(val), 'Must contain uppercase letter')
  .refine((val) => /[a-z]/.test(val), 'Must contain lowercase letter')
  .refine((val) => /[0-9]/.test(val), 'Must contain a number')
  .refine((val) => /[^A-Za-z0-9]/.test(val), 'Must contain special character');
```

## Error Customization

### Global Error Map

```typescript
const customErrorMap: z.ZodErrorMap = (issue, ctx) => {
  // Custom handling for specific issue codes
  if (issue.code === z.ZodIssueCode.invalid_type) {
    if (issue.expected === 'string') {
      return { message: 'This field must be text' };
    }
    if (issue.expected === 'number') {
      return { message: 'This field must be a number' };
    }
  }
  
  if (issue.code === z.ZodIssueCode.too_small) {
    if (issue.type === 'string') {
      return { message: `Must be at least ${issue.minimum} characters` };
    }
    if (issue.type === 'number') {
      return { message: `Must be at least ${issue.minimum}` };
    }
  }
  
  // Fall back to default message
  return { message: ctx.defaultError };
};

// Set globally
z.setErrorMap(customErrorMap);
```

### Schema-Level Error Map

```typescript
const schema = z.string().min(5);

const result = schema.safeParse('hi', {
  errorMap: (issue, ctx) => {
    if (issue.code === z.ZodIssueCode.too_small) {
      return { message: 'Username must be longer' };
    }
    return { message: ctx.defaultError };
  },
});
```

## Error Handling Patterns

### Form Validation

```typescript
import { z } from 'zod';

const FormSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

interface FormErrors {
  username?: string[];
  email?: string[];
  password?: string[];
  confirmPassword?: string[];
  _form?: string[];
}

function validateForm(formData: unknown): { 
  data: z.infer<typeof FormSchema> | null; 
  errors: FormErrors;
} {
  const result = FormSchema.safeParse(formData);
  
  if (result.success) {
    return { data: result.data, errors: {} };
  }
  
  const { fieldErrors, formErrors } = result.error.flatten();
  
  return {
    data: null,
    errors: {
      ...fieldErrors,
      _form: formErrors.length > 0 ? formErrors : undefined,
    },
  };
}

// Usage
const { data, errors } = validateForm({
  username: 'ab',
  email: 'invalid',
  password: '123',
  confirmPassword: '456',
});

if (errors.username) {
  console.log('Username errors:', errors.username);
}
```

### API Response Validation

```typescript
const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

async function fetchData<T extends z.ZodSchema>(
  url: string,
  dataSchema: T
): Promise<z.infer<T>> {
  const response = await fetch(url);
  const json = await response.json();
  
  // Validate response structure
  const apiResult = ApiResponseSchema.safeParse(json);
  if (!apiResult.success) {
    throw new Error(`Invalid API response: ${apiResult.error.message}`);
  }
  
  if (!apiResult.data.success) {
    throw new Error(apiResult.data.error || 'Unknown API error');
  }
  
  // Validate data payload
  const dataResult = dataSchema.safeParse(apiResult.data.data);
  if (!dataResult.success) {
    const formatted = dataResult.error.format();
    throw new Error(`Invalid data format: ${JSON.stringify(formatted)}`);
  }
  
  return dataResult.data;
}
```

### Aggregating Multiple Errors

```typescript
function validateMultiple<T extends z.ZodSchema>(
  schema: T,
  items: unknown[]
): { valid: z.infer<T>[]; errors: Array<{ index: number; errors: z.ZodError }> } {
  const valid: z.infer<T>[] = [];
  const errors: Array<{ index: number; errors: z.ZodError }> = [];
  
  items.forEach((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({ index, errors: result.error });
    }
  });
  
  return { valid, errors };
}

// Usage
const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

const users = [
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob', email: 'invalid' },
  { name: '', email: 'charlie@example.com' },
];

const { valid, errors } = validateMultiple(UserSchema, users);

console.log('Valid users:', valid.length);
errors.forEach(({ index, errors }) => {
  console.log(`User ${index} errors:`, errors.flatten().fieldErrors);
});
```

## Complete Error Handling Example

```typescript
import { z } from 'zod';

// Custom error map for the application
const appErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined') {
        return { message: 'This field is required' };
      }
      return { message: `Expected ${issue.expected}, got ${issue.received}` };
    
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        if (issue.minimum === 1) {
          return { message: 'This field cannot be empty' };
        }
        return { message: `Must be at least ${issue.minimum} characters` };
      }
      if (issue.type === 'number') {
        return { message: `Must be ${issue.inclusive ? 'at least' : 'greater than'} ${issue.minimum}` };
      }
      if (issue.type === 'array') {
        return { message: `Must have at least ${issue.minimum} item(s)` };
      }
      break;
    
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') {
        return { message: `Must be at most ${issue.maximum} characters` };
      }
      if (issue.type === 'number') {
        return { message: `Must be ${issue.inclusive ? 'at most' : 'less than'} ${issue.maximum}` };
      }
      break;
    
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') {
        return { message: 'Please enter a valid email address' };
      }
      if (issue.validation === 'url') {
        return { message: 'Please enter a valid URL' };
      }
      break;
  }
  
  return { message: ctx.defaultError };
};

// Set global error map
z.setErrorMap(appErrorMap);

// Schema definitions
const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
});

const UserRegistrationSchema = z.object({
  username: z.string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores allowed'),
  email: z.string().email(),
  password: z.string()
    .min(8)
    .refine((val) => /[A-Z]/.test(val), 'Must contain an uppercase letter')
    .refine((val) => /[a-z]/.test(val), 'Must contain a lowercase letter')
    .refine((val) => /[0-9]/.test(val), 'Must contain a number'),
  confirmPassword: z.string(),
  age: z.number().min(13).max(120).optional(),
  address: AddressSchema.optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and conditions' }),
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Validation result type
type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]>; formErrors: string[] };

// Validation function
function validateRegistration(
  input: unknown
): ValidationResult<z.infer<typeof UserRegistrationSchema>> {
  const result = UserRegistrationSchema.safeParse(input);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const { fieldErrors, formErrors } = result.error.flatten();
  
  return {
    success: false,
    errors: fieldErrors as Record<string, string[]>,
    formErrors,
  };
}

// Usage example
const registrationData = {
  username: 'ab',
  email: 'invalid-email',
  password: 'weak',
  confirmPassword: 'different',
  age: 10,
  acceptTerms: false,
};

const result = validateRegistration(registrationData);

if (!result.success) {
  console.log('Validation failed!');
  console.log('Field errors:');
  for (const [field, errors] of Object.entries(result.errors)) {
    console.log(`  ${field}:`);
    errors.forEach((error) => console.log(`    - ${error}`));
  }
  if (result.formErrors.length > 0) {
    console.log('Form errors:');
    result.formErrors.forEach((error) => console.log(`  - ${error}`));
  }
} else {
  console.log('Registration data is valid:', result.data);
}
```
