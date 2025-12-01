# Build stage - compile TypeScript and install dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci && \
    npm cache clean --force

# Copy TypeScript configuration and source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build the application and prune devDependencies
RUN npm run build:prod && \
    npm prune --production

# Runtime stage - minimal image with kubectl for Kubernetes operations
FROM node:22-alpine

# Install kubectl - required for Kubernetes operations at runtime
# Uses architecture detection for multi-arch support
RUN apk add --no-cache curl && \
    ARCH=$(uname -m) && \
    case ${ARCH} in \
        x86_64) KUBECTL_ARCH="amd64" ;; \
        aarch64) KUBECTL_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${KUBECTL_ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    apk del curl

WORKDIR /app

# Create non-root user and session directory
RUN addgroup -g 10001 -S dotai && \
    adduser -u 10001 -S -G dotai -h /app dotai && \
    mkdir -p /app/tmp/sessions && \
    chown -R dotai:dotai /app

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Copy package.json (needed for version reading at runtime)
COPY --from=builder /app/package.json ./

# Copy prompt templates (loaded at runtime)
COPY prompts/ ./prompts/
COPY shared-prompts/ ./shared-prompts/

# Copy assets (templates, configs)
COPY assets/ ./assets/

# Copy scripts (nushell scripts for platform operations)
COPY scripts/ ./scripts/

# Set ownership for all copied files
RUN chown -R dotai:dotai /app

# Switch to non-root user
USER dotai

# Default port for HTTP transport
EXPOSE 3456

# Environment variable defaults
ENV NODE_ENV=production \
    TRANSPORT_TYPE=http \
    PORT=3456 \
    HOST=0.0.0.0 \
    DOT_AI_SESSION_DIR=/app/tmp/sessions

# Run the MCP server
CMD ["node", "dist/mcp/server.js"]
