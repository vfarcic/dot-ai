# Agentic Tools Plugin
# Multi-stage build for minimal production image

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for TypeScript compilation)
RUN npm ci

# Copy TypeScript source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Runtime stage - minimal image with no build tools
FROM node:20-alpine

WORKDIR /app

# Install kubectl and helm for Kubernetes operations
# Using curl to download the stable release binaries, detecting architecture
RUN apk add --no-cache curl jq && \
    KUBECTL_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt) && \
    HELM_VERSION=$(curl -s https://api.github.com/repos/helm/helm/releases/latest | jq -r .tag_name) && \
    ARCH=$(uname -m) && \
    case $ARCH in \
      x86_64) ARCH="amd64" ;; \
      aarch64) ARCH="arm64" ;; \
    esac && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    # Install Helm (latest version)
    curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${ARCH}.tar.gz" | tar xz && \
    mv linux-${ARCH}/helm /usr/local/bin/ && \
    rm -rf linux-${ARCH} && \
    apk del curl jq

# Create non-root user for security
RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

# Copy only the compiled JavaScript output
# No runtime dependencies needed - uses only Node.js built-ins
COPY --from=builder /app/dist ./dist

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Default port (configurable via PORT env var)
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
