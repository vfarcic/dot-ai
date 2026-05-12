# Agentic Tools Plugin
# Pre-built artifacts (dist/ and node_modules/) are created by the CI workflow
# on native amd64, avoiding QEMU arm64 emulation issues with npm ci.
# All dependencies are pure JavaScript, so pre-built artifacts work on both architectures.

FROM node:24-alpine

WORKDIR /app

# Copy kubectl and helm binaries from official images (Renovate auto-updates these)
COPY --from=rancher/kubectl:v1.36.0@sha256:05d2b313e2f397e0ade252136aed47abd72d56ead11d1b027ac70f66362c8495 /bin/kubectl /usr/local/bin/kubectl
COPY --from=alpine/helm:4.1.4@sha256:4b0bdd2cf18ff6bca12aba0b2c5671384dab5035c19c57f0c58b854a0baf65be /usr/bin/helm /usr/local/bin/helm

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
