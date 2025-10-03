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

# Install Nushell (required for platform operations)
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "amd64" ]; then \
        NU_ARCH="x86_64-unknown-linux-gnu"; \
    elif [ "$ARCH" = "arm64" ]; then \
        NU_ARCH="aarch64-unknown-linux-gnu"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    NU_VERSION=$(curl -s https://api.github.com/repos/nushell/nushell/releases/latest | grep '"tag_name"' | cut -d'"' -f4) && \
    curl -LO "https://github.com/nushell/nushell/releases/download/${NU_VERSION}/nu-${NU_VERSION}-${NU_ARCH}.tar.gz" && \
    tar xzf "nu-${NU_VERSION}-${NU_ARCH}.tar.gz" && \
    mv "nu-${NU_VERSION}-${NU_ARCH}/nu" /usr/local/bin/ && \
    rm -rf "nu-${NU_VERSION}-${NU_ARCH}" "nu-${NU_VERSION}-${NU_ARCH}.tar.gz"

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