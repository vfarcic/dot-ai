# =============================================================================
# Stage 1: Builder
# Install dependencies and compile TypeScript to JavaScript
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (for Docker layer caching)
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build:prod

# =============================================================================
# Stage 2: Runtime
# Minimal production image with only what's needed to run
# =============================================================================
FROM node:22-alpine

WORKDIR /app

# Install kubectl (required runtime dependency for Kubernetes operations)
# Uses architecture detection for multi-arch support
RUN apk add --no-cache curl && \
    ARCH=$(uname -m) && \
    case "$ARCH" in \
        x86_64) KUBECTL_ARCH="amd64" ;; \
        aarch64) KUBECTL_ARCH="arm64" ;; \
        armv7l) KUBECTL_ARCH="arm" ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${KUBECTL_ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    apk del curl

# Create non-root user and group
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy compiled application from builder
COPY --from=builder /app/dist/ ./dist/

# Copy runtime file dependencies (loaded at runtime via fs.readFileSync)
COPY prompts/ ./prompts/
COPY shared-prompts/ ./shared-prompts/

# Create session directory (used by default if DOT_AI_SESSION_DIR not set)
RUN mkdir -p ./tmp/sessions

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose default port (configurable via PORT env var)
EXPOSE 3456

# Start the MCP server
CMD ["node", "dist/mcp/server.js"]
