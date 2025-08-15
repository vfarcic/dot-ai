FROM node:20

# Install dot-ai globally
RUN npm install -g @vfarcic/dot-ai@latest

# Set working directory
WORKDIR /app

# Create sessions directory
RUN mkdir -p /app/sessions

# Set default environment variables
ENV DOT_AI_SESSION_DIR=/app/sessions
ENV NODE_ENV=production

# Default command to run dot-ai-mcp
CMD ["dot-ai-mcp"]