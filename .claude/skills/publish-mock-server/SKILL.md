---
name: publish-mock-server
description: Build and publish the mock-server Docker image to GitHub Container Registry. Use when mock server fixtures or code have changed and need to be published.
---

# Publish Mock Server

Build and publish the mock-server Docker image to `ghcr.io/vfarcic/dot-ai-mock-server:latest`.

## Prerequisites

- Docker is installed and running (use `sudo docker` if your user is not in the `docker` group)
- Authenticated to ghcr.io. The simplest path is to reuse the `gh` token (needs `write:packages` scope):
  ```bash
  gh auth token | docker login ghcr.io -u vfarcic --password-stdin
  ```

## Steps

> Run all commands from the repository root. The build context is the
> `mock-server/` directory (relative — do NOT hardcode an absolute path).

1. **Set up a multi-arch builder (one-time per machine)**

   The default `docker` driver cannot push a multi-platform manifest, and
   building `arm64` on an `amd64` host needs QEMU. Register the emulator and
   create a container-driver builder:
   ```bash
   docker run --privileged --rm tonistiigi/binfmt --install arm64
   docker buildx create --name mockbuilder --driver docker-container --use --bootstrap
   ```

2. **Build and push multi-arch Docker image**

   Tag both `latest` and the current dot-ai release version (so downstream
   repos can pin to a contract version instead of a digest). Derive the version
   from the root `package.json`:
   ```bash
   VERSION=$(node -p "require('./package.json').version")
   docker buildx build --builder mockbuilder \
     --platform linux/amd64,linux/arm64 \
     -t ghcr.io/vfarcic/dot-ai-mock-server:latest \
     -t ghcr.io/vfarcic/dot-ai-mock-server:$VERSION \
     --push mock-server
   ```

3. **Verify the push**

   Confirm both tags resolve to the same digest and carry both platforms:
   ```bash
   docker buildx imagetools inspect ghcr.io/vfarcic/dot-ai-mock-server:latest
   ```
   Note the manifest-list digest (`sha256:…`) — downstream repos pin to it.

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

- Publishes `latest` plus an immutable version tag matching the dot-ai release
  (e.g. `1.22.0`). `latest` is mutable; downstream repos should pin to the
  version tag or the digest for reproducible tests.
- Publishing is manual (not wired into CI/release), so **re-run this skill after
  merging any change that affects the mock contract** — cutting a dot-ai release
  does NOT rebuild the image.
- Image is ~230MB (Node.js alpine + fixtures)
