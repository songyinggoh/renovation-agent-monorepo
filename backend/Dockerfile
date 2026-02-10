# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy monorepo root files needed for pnpm workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy backend package.json
COPY backend/package.json ./backend/

# Install dependencies for backend only
RUN pnpm install --frozen-lockfile --filter renovation-agent-backend

# Copy the rest of the backend source code
COPY backend/. ./backend/

# Build the TypeScript application
WORKDIR /app/backend
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS production

# Install pnpm for start script
RUN npm install -g pnpm

WORKDIR /app

# Copy package.json for start script and dependencies
COPY --from=builder /app/backend/package.json ./package.json

# Only copy production dependencies and build output
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./dist

# Expose the port the app runs on (override via $PORT env var)
ENV PORT="8080"
EXPOSE 8080

# Command to run the application
CMD ["pnpm", "start"]