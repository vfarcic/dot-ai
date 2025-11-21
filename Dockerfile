# =============================================================================
# Multi-stage Dockerfile for DevOps AI Toolkit (dot-ai)
#
# Production-ready TypeScript/Node.js MCP server with Kubernetes integration
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder - Install dependencies and compile TypeScript
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install system dependencies needed for native module compilation
RUN apk add --no-cache \
    python3 \
    make \
    g++

# Copy dependency manifests first (for optimal Docker layer caching)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies needed for build)
# Note: npm audit is kept enabled for security vulnerability detection
RUN npm ci

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code for compilation
COPY src/ ./src/

# Compile TypeScript to JavaScript (outputs to dist/)
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Runtime - Minimal production image
# -----------------------------------------------------------------------------
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install kubectl (Kubernetes CLI) - required for cluster operations
# Uses architecture detection to support multi-arch builds (amd64, arm64)
RUN apk add --no-cache curl && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
    if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    apk del curl

# Create non-root user for security
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# Copy dependency manifests and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copy compiled application from builder stage
COPY --from=builder /app/dist/ ./dist/

# Copy runtime-required directories (loaded by application at runtime)
COPY prompts/ ./prompts/
COPY shared-prompts/ ./shared-prompts/
COPY assets/ ./assets/

# Create session directory with proper permissions
# Note: DOT_AI_SESSION_DIR defaults to ./tmp/sessions in source code
RUN mkdir -p ./tmp/sessions && \
    chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose default HTTP transport port (configurable via PORT env var)
EXPOSE 3456

# Health check is intentionally omitted - application-specific health endpoints
# cannot be verified from codebase analysis. Users can add custom HEALTHCHECK
# if their deployment has health endpoints configured.

# Set the entrypoint to the MCP server
# Note: Environment variables read from source code defaults:
# - DOT_AI_SESSION_DIR: defaults to ./tmp/sessions (already created above)
# - TRANSPORT_TYPE: defaults to 'stdio' (override with 'http' for REST API)
# - PORT: defaults to 3456 (for HTTP transport)
# - KUBECONFIG: required for cluster access (no default, must be provided)
# - ANTHROPIC_API_KEY/OPENAI_API_KEY: required for AI features (no defaults)
CMD ["node", "dist/mcp/server.js"]
