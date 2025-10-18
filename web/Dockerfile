# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base
WORKDIR /app

# Development stage
FROM base AS development
COPY package.json bun.lockb ./
COPY web/package.json ./web/
COPY shared ./shared/
RUN cd web && bun install --frozen-lockfile
WORKDIR /app/web
CMD ["bun", "run", "dev"]

# Dependencies stage
FROM base AS deps
COPY package.json bun.lockb ./
COPY web/package.json ./web/
COPY shared ./shared/
RUN cd web && bun install --frozen-lockfile --production

# Build stage
FROM base AS builder
COPY package.json bun.lockb ./
COPY web ./web/
COPY shared ./shared/
RUN cd web && bun install --frozen-lockfile
RUN cd web && bun run build

# Production stage
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/package.json ./web/
COPY --from=builder /app/shared ./shared/
WORKDIR /app/web
EXPOSE 3001
CMD ["bun", "run", "start"]
