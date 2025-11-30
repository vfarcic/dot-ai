# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci && \
    npm cache clean --force

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build the application (npm run build includes lint + compile)
RUN npm run build:prod

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install kubectl for Kubernetes operations
# Use dynamic architecture detection for multi-arch support
RUN ARCH=$(case $(uname -m) in x86_64) echo amd64;; aarch64) echo arm64;; *) echo $(uname -m);; esac) && \
    apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    apk del curl

# Create non-root user
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy runtime assets required by the application
COPY --from=builder /app/package.json ./
COPY prompts/ ./prompts/
COPY shared-prompts/ ./shared-prompts/

# Create session directory with proper permissions
RUN mkdir -p ./tmp/sessions && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Default port for HTTP transport (configurable via PORT env var)
EXPOSE 3456

# Environment defaults
ENV NODE_ENV=production \
    TRANSPORT_TYPE=http \
    DOT_AI_SESSION_DIR=./tmp/sessions

# Use exec form for proper signal handling
CMD ["node", "dist/mcp/server.js"]
