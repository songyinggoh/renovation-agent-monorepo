# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy pnpm lock file from root and backend package.json
COPY pnpm-lock.yaml ./
COPY backend/package.json ./package.json

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy the rest of the backend source code
COPY backend/. .

# Build the TypeScript application
RUN pnpm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copy package.json for start script and dependencies
COPY --from=builder /app/package.json ./package.json

# Only copy production dependencies and build output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose the port the app runs on (Cloud Run defaults to 8080, but uses $PORT)
ENV PORT 8080
EXPOSE 8080

# Command to run the application
CMD ["pnpm", "start"]