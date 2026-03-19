# Agentic Tools Plugin
# Pre-built artifacts (dist/ and node_modules/) are created by the CI workflow
# on native amd64, avoiding QEMU arm64 emulation issues with npm ci.
# All dependencies are pure JavaScript, so pre-built artifacts work on both architectures.

FROM node:20-alpine@sha256:09e2b3d9726018aecf269bd35325f46bf75046a643a66d28360ec71132750ec8

WORKDIR /app

# Copy kubectl and helm binaries from official images (Renovate auto-updates these)
COPY --from=rancher/kubectl:v1.34.2@sha256:9151f97db412884ac7e7fa2a7e0869f9f74db91f940903bde6254f4c748396d7 /bin/kubectl /usr/local/bin/kubectl
COPY --from=alpine/helm:4.0.4@sha256:adb87b125214fd356ecc1a24a1e86e4afed0ee03de5d4391de4925777de7fd42 /usr/bin/helm /usr/local/bin/helm

# Create non-root user for security
RUN addgroup -g 10001 -S appgroup && \
    adduser -u 10001 -S appuser -G appgroup

# Copy pre-built JavaScript and production dependencies from CI
COPY package.json ./
COPY dist/ ./dist/
COPY node_modules/ ./node_modules/

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Default port (configurable via PORT env var)
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
