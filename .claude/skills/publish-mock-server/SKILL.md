---
name: publish-mock-server
description: Build and publish the mock-server Docker image to GitHub Container Registry. Use when mock server fixtures or code have changed and need to be published.
---

# Publish Mock Server

Build and publish the mock-server Docker image to `ghcr.io/vfarcic/dot-ai-mock-server:latest`.

## Prerequisites

- Docker is installed and running
- User is authenticated to ghcr.io (`docker login ghcr.io`)

## Steps

1. **Build and push multi-arch Docker image**

   Build for amd64 and arm64, then push:
   ```bash
   docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/vfarcic/dot-ai-mock-server:latest --push /Users/viktorfarcic/code/dot-ai-prd-354-rest-api-route-registry-openapi/mock-server
   ```

2. **Verify the push**

   Confirm the image was pushed successfully by checking the output shows both platforms.

## Usage

After publishing, consumers (like dot-ai-ui) can use:

```yaml
services:
  mock-api:
    image: ghcr.io/vfarcic/dot-ai-mock-server:latest
    ports:
      - "3001:3001"
```

## When to Publish

Run this skill when:
- Fixtures are added or modified in `mock-server/fixtures/`
- Mock server code changes (`server.ts`, `routes.ts`)
- API schemas change that affect mock responses

## Notes

- Always publishes as `latest` tag (no version management needed)
- Image is ~230MB (Node.js 22 alpine + fixtures)
