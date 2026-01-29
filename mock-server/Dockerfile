# Mock MCP Server Dockerfile
# Multi-stage build for minimal production image

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifest first for layer caching
COPY package.json ./

# Install dependencies (dev dependencies needed for TypeScript build)
RUN npm install

# Copy TypeScript source files and config
COPY tsconfig.json ./
COPY server.ts routes.ts ./

# Build TypeScript to JavaScript
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 10001 -S mockserver && \
    adduser -u 10001 -S -G mockserver -h /app mockserver

# Copy only runtime artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy fixtures (runtime data)
COPY fixtures ./fixtures

# Set ownership to non-root user
RUN chown -R mockserver:mockserver /app

# Switch to non-root user
USER mockserver

# Default port (configurable via PORT env var)
EXPOSE 3001

# Start the server
CMD ["node", "dist/server.js"]
