# Server Actions and Mutations in Next.js

**Source**: https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
**Date Scraped**: 2025-12-05

---

## Core Concept

Server Functions are asynchronous operations that execute on the server and can be invoked from the client via network requests. When used for mutations and updates, they're called "Server Actions."

## Creating Server Functions

The `"use server"` directive marks functions as server-executable. You can place it at the function level or file level:

**File-level approach:**
```ts
'use server'
export async function createPost(formData: FormData) {
  const title = formData.get('title')
  const content = formData.get('content')
  // Update data and revalidate cache
}
```

**Function-level approach (Server Components only):**
```tsx
export default function Page() {
  async function createPost(formData: FormData) {
    'use server'
    // mutation logic
  }
  return <>{/* JSX */}</>
}
```

### Key Constraint

Server Functions cannot be defined directly in Client Components, but they can be imported from files with the `"use server"` directive and invoked there.

## Invoking Server Functions

### Forms
Server Actions automatically receive `FormData` when passed to form `action` props:

```tsx
<form action={createPost}>
  <input type="text" name="title" />
  <button type="submit">Create</button>
</form>
```

### Event Handlers
Use event listeners to trigger mutations with custom logic:

```tsx
<button onClick={async () => {
  const result = await incrementLike()
  setLikes(result)
}}>Like</button>
```

### useEffect Hook
Trigger mutations on component mount or dependency changes for automatic updates.

## Essential Patterns

**Showing pending states:** The `useActionState` hook provides a boolean indicating execution status for displaying loading indicators.

**Cache management:** Call `revalidatePath()` or `revalidateTag()` after mutations to update cached data.

**Navigation:** Use `redirect()` to route users after successful mutations.

**Cookie handling:** Access cookies via the `cookies()` API to read, set, or delete values within Server Actions.

## Important Behaviors

Server Functions use `POST` requests exclusively and execute sequentially rather than in parallel. Progressive enhancement is supported by default, allowing forms to work even without JavaScript.
