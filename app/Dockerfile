# syntax=docker/dockerfile:1
FROM oven/bun:1.1.29 AS base

WORKDIR /app

# Install git for repository cloning
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --verbose

COPY . .

EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
