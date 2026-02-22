# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm (match version pinned in package.json packageManager field)
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

# Copy monorepo root files needed for pnpm workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Copy package.json files for backend and its workspace dependency
COPY backend/package.json ./backend/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install dependencies for backend and shared-types
RUN pnpm install --frozen-lockfile --filter renovation-agent-backend...

# Copy shared-types source and build it first
COPY packages/shared-types/. ./packages/shared-types/
RUN pnpm --filter @renovation/shared-types run build

# Copy the rest of the backend source code
COPY backend/. ./backend/

# Build the TypeScript application
WORKDIR /app/backend
RUN pnpm run build

# Create production-only deployment (strips devDependencies)
WORKDIR /app
RUN pnpm --filter renovation-agent-backend deploy --prod /app/deploy

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy only production dependencies and build output
COPY --from=builder /app/deploy/package.json ./package.json
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/deploy/dist ./dist

# Expose the port the app runs on (override via $PORT env var)
ENV PORT="8080"
EXPOSE 8080

# Command to run the application
CMD ["node", "dist/server.js"]