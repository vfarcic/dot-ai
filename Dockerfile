FROM node:22-slim

# Build argument for package version
ARG PACKAGE_VERSION=latest

# Install kubectl (required for Kubernetes operations)
RUN apt-get update && \
    apt-get install -y curl && \
    ARCH=$(dpkg --print-architecture) && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install dot-ai globally
RUN npm install -g @vfarcic/dot-ai@${PACKAGE_VERSION}

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