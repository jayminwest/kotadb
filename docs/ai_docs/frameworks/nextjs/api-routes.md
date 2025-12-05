# Next.js Route Handlers (API Routes)

**Source**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
**Date**: 2025-12-05

---

## Overview

Route Handlers allow you to create custom request handlers for a given route using the Web Request and Response APIs. This feature enables developers to build API endpoints within the Next.js App Router structure.

Route Handlers are defined in a `route.js` or `route.ts` file inside the `app` directory and can be nested within any route segment, similar to `page.js` and `layout.js`.

**Important**: Route Handlers are only available inside the `app` directory. They are the equivalent of API Routes inside the `pages` directory, meaning you do not need to use API Routes and Route Handlers together.

---

## Convention

Route Handlers are defined in a `route.js|ts` file inside the `app` directory:

```typescript
// app/api/route.ts
export async function GET(request: Request) {
  return new Response('Hello, Next.js!')
}
```

Route Handlers can be nested anywhere inside the `app` directory, similar to `page.js` and `layout.js`. But there cannot be a `route.js` file at the same route segment level as `page.js`.

---

## Supported HTTP Methods

The following HTTP methods are supported: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`.

If an unsupported method is called, Next.js will return a `405 Method Not Allowed` response.

### Auto OPTIONS Implementation

When `OPTIONS` is not explicitly defined, Next.js will automatically implement `OPTIONS` and set the appropriate Response `Allow` header depending on the other methods defined in the Route Handler.

---

## Parameters

### `request` (optional)

The `request` object is a NextRequest instance, which is an extension of the Web Request API. NextRequest provides convenient methods for accessing cookies and an enhanced URL object called `nextUrl`.

### `context` (optional)

The context parameter is an object containing:

- **params**: A promise that resolves to an object containing the dynamic route parameters for the current route.

**Example**:

```typescript
// app/dashboard/[team]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ team: string }> }
) {
  const team = (await params).team
  return new Response(`Team: ${team}`)
}
```

For the route `app/dashboard/[team]/route.ts` accessed via `/dashboard/1`, the params will be `{ team: '1' }`.

---

## Type Safety with RouteContext

For strongly-typed parameters, you can use the `RouteContext` helper:

```typescript
// app/dashboard/[team]/route.ts
import type { RouteContext } from 'next'

export async function GET(
  request: Request,
  context: RouteContext<'team'>
) {
  const team = (await context.params).team
  return new Response(`Team: ${team}`)
}
```

Types are generated during `next dev`, `next build`, or `next typegen`. After type generation, the `RouteContext` helper is globally available and doesn't require importing.

---

## Reading Request Data

### JSON Body

```typescript
// app/api/route.ts
export async function POST(request: Request) {
  const res = await request.json()
  return Response.json({ res })
}
```

### Form Data

```typescript
// app/api/route.ts
export async function POST(request: Request) {
  const formData = await request.formData()
  const name = formData.get('name')
  const email = formData.get('email')
  return Response.json({ name, email })
}
```

### Request Body

You can read the raw Request body using standard Web API methods:

```typescript
// app/api/route.ts
export async function POST(request: Request) {
  const body = await request.text()
  return new Response(body)
}
```

---

## Cookies

### Reading Cookies

You can read cookies using the `cookies()` function from `next/headers`:

```typescript
// app/api/route.ts
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')

  return new Response('Hello, Next.js!', {
    status: 200,
    headers: { 'Set-Cookie': `token=${token}` },
  })
}
```

### Setting Cookies

```typescript
// app/api/route.ts
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const cookieStore = await cookies()
  cookieStore.set('name', 'value')
  // or
  cookieStore.set('name', 'value', { secure: true })
  // or
  cookieStore.set({
    name: 'name',
    value: 'value',
    httpOnly: true,
    path: '/',
  })

  return new Response('Cookie set!')
}
```

Alternatively, you can use the Web Response API to set cookies:

```typescript
// app/api/route.ts
export async function GET(request: Request) {
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: {
      'Set-Cookie': 'name=value; Path=/; HttpOnly'
    },
  })
}
```

---

## Headers

### Reading Headers

You can read headers using the `headers()` function from `next/headers`:

```typescript
// app/api/route.ts
import { headers } from 'next/headers'

export async function GET(request: Request) {
  const headersList = await headers()
  const referer = headersList.get('referer')

  return new Response('Hello, Next.js!', {
    status: 200,
  })
}
```

**Note**: The `headers` instance is read-only. To set headers, you need to return a new `Response` with new headers.

### Setting Headers

```typescript
// app/api/route.ts
export async function GET(request: Request) {
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
    },
  })
}
```

---

## Redirects

You can use the `redirect()` function from `next/navigation` to redirect to a different route:

```typescript
// app/api/route.ts
import { redirect } from 'next/navigation'

export async function GET(request: Request) {
  redirect('https://nextjs.org/')
}
```

---

## Dynamic Route Segments

Route Handlers can use Dynamic Segments to create request handlers from dynamic data:

```typescript
// app/items/[slug]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const slug = (await params).slug
  // Fetch data for the specific slug
  return new Response(`Item: ${slug}`)
}
```

---

## URL Query Parameters

Query parameters can be accessed via `request.nextUrl.searchParams`:

```typescript
// app/api/search/route.ts
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('query')

  // For /api/search?query=hello, query equals "hello"
  return Response.json({ query })
}
```

---

## Streaming

Streaming is commonly used with Large Language Models (LLMs) for AI-generated content:

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { StreamingTextResponse, streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
  })

  return new StreamingTextResponse(result.toAIStream())
}
```

You can also use lower-level Web APIs directly:

```typescript
// app/api/route.ts
function iteratorToStream(iterator: AsyncIterator) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) {
        controller.close()
      } else {
        controller.enqueue(value)
      }
    },
  })
}

export async function GET() {
  const iterator = createIterator()
  const stream = iteratorToStream(iterator)
  return new Response(stream)
}
```

---

## Request Body (Streaming)

You can stream request bodies for processing:

```typescript
// app/api/route.ts
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = request.body
  const reader = body?.getReader()

  // Read the stream
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // Process the chunk
      console.log(value)
    }
  }

  return new Response('Stream processed')
}
```

---

## CORS

You can set CORS headers on a Response using standard Web API methods:

```typescript
// app/api/route.ts
export async function GET(request: Request) {
  return new Response('Hello, Next.js!', {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
```

### Handling Preflight Requests

```typescript
// app/api/route.ts
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
```

---

## Webhooks

You can use a Route Handler to receive webhooks from third-party services:

```typescript
// app/api/webhook/route.ts
export async function POST(request: Request) {
  try {
    const payload = await request.json()
    // Process the webhook payload
    console.log('Webhook received:', payload)

    return new Response('Webhook processed successfully', { status: 200 })
  } catch (error) {
    return new Response('Webhook processing failed', { status: 500 })
  }
}
```

---

## Non-UI Responses

You can use Route Handlers to return non-UI content such as XML, JSON, or other formats:

### Sitemap Example

```typescript
// app/sitemap.ts
export async function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://example.com</loc>
        <lastmod>2023-01-01</lastmod>
      </url>
    </urlset>`,
    {
      headers: {
        'Content-Type': 'application/xml',
      },
    }
  )
}
```

### RSS Feed Example

```typescript
// app/rss.xml/route.ts
export async function GET() {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>My Blog</title>
        <link>https://example.com</link>
        <description>A blog about web development</description>
      </channel>
    </rss>`,
    {
      headers: {
        'Content-Type': 'application/xml',
      },
    }
  )
}
```

---

## Segment Config Options

Route Handlers support the same route segment configuration as Pages and Layouts:

```typescript
// app/api/route.ts
export const dynamic = 'auto'
export const dynamicParams = true
export const revalidate = false
export const fetchCache = 'auto'
export const runtime = 'nodejs'
export const preferredRegion = 'auto'
```

### Available Options

- **dynamic**: `'auto' | 'force-dynamic' | 'error' | 'force-static'` (default: `'auto'`)
- **dynamicParams**: `boolean` (default: `true`)
- **revalidate**: `false | 0 | number` (default: `false`)
- **fetchCache**: `'auto' | 'default-cache' | 'only-cache' | 'force-cache' | 'force-no-store' | 'default-no-store' | 'only-no-store'` (default: `'auto'`)
- **runtime**: `'nodejs' | 'edge'` (default: `'nodejs'`)
- **preferredRegion**: `'auto' | 'global' | 'home' | string | string[]` (default: `'auto'`)

### Revalidation Example

```typescript
// app/api/posts/route.ts
export const revalidate = 60 // Revalidate every 60 seconds

export async function GET() {
  const posts = await fetch('https://api.example.com/posts').then(res => res.json())
  return Response.json(posts)
}
```

---

## Caching Behavior

### Default Caching

Route Handlers are cached by default when using the `GET` method with the Response object.

```typescript
// app/api/route.ts
export async function GET() {
  const res = await fetch('https://api.example.com/data', {
    headers: {
      'Content-Type': 'application/json',
    },
  })
  const data = await res.json()

  return Response.json({ data })
}
```

### Opting Out of Caching

You can opt out of caching by:

- Using the `Request` object with the `GET` method
- Using any other HTTP method
- Using Dynamic Functions like `cookies()` and `headers()`
- Manually specifying dynamic mode via segment config options

```typescript
// app/api/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const res = await fetch(`https://api.example.com/data/${id}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  })
  const data = await res.json()

  return Response.json({ data })
}
```

---

## Version History

| Version | Changes |
|---------|---------|
| `v15.0.0-RC` | `context.params` is now a promise. A codemod is available. |
| `v15.0.0-RC` | The default caching for `GET` handlers was changed from static to dynamic. |
| `v13.2.0` | Route Handlers are introduced. |

---

## Best Practices

1. **Use TypeScript**: Leverage type safety with `NextRequest` and `RouteContext` helpers
2. **Handle Errors**: Always wrap request handlers in try-catch blocks for production
3. **Validate Input**: Validate and sanitize all request data before processing
4. **Set Appropriate Headers**: Include proper CORS, caching, and content-type headers
5. **Use Segment Config**: Configure caching and runtime behavior appropriately
6. **Stream When Appropriate**: Use streaming for large responses or real-time data
7. **Secure Webhooks**: Validate webhook signatures from third-party services

---

## Additional Resources

- [Next.js Routing Documentation](https://nextjs.org/docs/app/building-your-application/routing)
- [API Reference: NextRequest](https://nextjs.org/docs/app/api-reference/functions/next-request)
- [API Reference: NextResponse](https://nextjs.org/docs/app/api-reference/functions/next-response)
