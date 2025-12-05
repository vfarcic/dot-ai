# Note: We use tag-only references (not SHA256 digests) to support multi-architecture builds.
# Docker Buildx automatically selects the correct architecture-specific image for each platform.
# Using SHA256 digests would pin to a single architecture and cause "exec format error" on other platforms.

# Stage 1: Builder - download kubectl and install npm package
FROM node:22-slim AS builder

# Install curl for downloading kubectl
RUN apt-get update && \
    apt-get install -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# renovate: datasource=github-releases depName=kubernetes/kubernetes
ARG KUBECTL_VERSION=v1.32.0
# Download kubectl
RUN ARCH=$(dpkg --print-architecture) && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/kubectl

# renovate: datasource=github-releases depName=helm/helm
ARG HELM_VERSION=v4.0.1
# Download and install Helm
RUN curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash -s -- --version ${HELM_VERSION}

# Copy and install pre-built dot-ai package
# Package is built outside Docker (npm run build + npm pack)
# For local builds: vfarcic-dot-ai-*.tgz is created by build script
# For CI builds: same .tgz is used for both image and npm publish
COPY vfarcic-dot-ai-*.tgz /tmp/
RUN npm install -g /tmp/vfarcic-dot-ai-*.tgz

# Stage 2: Runtime - copy installed binaries and packages
FROM node:22-slim

# Install ca-certificates for TLS verification (required for helm repo operations)
RUN apt-get update && \
    apt-get install -y ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy kubectl and helm binaries from builder
COPY --from=builder /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --from=builder /usr/local/bin/helm /usr/local/bin/helm

# Copy entire npm global installation from builder
COPY --from=builder /usr/local/lib/node_modules/@vfarcic/dot-ai /usr/local/lib/node_modules/@vfarcic/dot-ai

# Recreate the bin symlink (Docker COPY dereferences symlinks)
RUN ln -s /usr/local/lib/node_modules/@vfarcic/dot-ai/dist/mcp/server.js /usr/local/bin/dot-ai-mcp

# Set working directory
WORKDIR /app

# Create sessions directory
RUN mkdir -p /app/sessions

# Set default environment variables
ENV DOT_AI_SESSION_DIR=/app/sessions
ENV NODE_ENV=production
# Transport defaults to stdio for backward compatibility
# Set TRANSPORT_TYPE=http for HTTP mode
ENV TRANSPORT_TYPE=stdio
ENV PORT=3456
ENV HOST=0.0.0.0

# Expose port for HTTP transport (used when TRANSPORT_TYPE=http)
EXPOSE 3456

# Default command to run dot-ai-mcp
CMD ["dot-ai-mcp"]
