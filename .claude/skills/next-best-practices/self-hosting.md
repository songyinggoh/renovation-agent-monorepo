# Self-Hosting Next.js

Deploy Next.js outside of Vercel.

## Standalone Output

For Docker deployments:

```js
// next.config.js
module.exports = {
  output: 'standalone',
};
```

## Docker Deployment

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

## ISR with Multiple Instances

Use custom cache handler for shared storage (Redis, S3).

```js
// next.config.js
module.exports = {
  cacheHandler: require.resolve('./cache-handler.js'),
  cacheMaxMemorySize: 0,
};
```

## What Works vs Needs Setup

| Feature | Single Instance | Multi-Instance |
|---------|----------------|----------------|
| SSR | Yes | Yes |
| SSG | Yes | Yes |
| ISR | Yes | Needs cache handler |
| Image Optimization | Yes | Yes |

## Health Check Endpoint

```tsx
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'healthy' }, { status: 200 });
}
```
