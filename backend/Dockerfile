# Use Node.js 20 LTS as base
FROM node:20-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# Development image
FROM base AS development
COPY . .
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# Builder image
FROM base AS builder
COPY . .
RUN npm run build

# Production image
FROM node:20-slim AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]
