# Generate Production-Ready Dockerfile

Generate an optimized, secure, multi-stage Dockerfile and .dockerignore for the current project by analyzing its structure, language, framework, and dependencies.

## Instructions

You are helping a developer containerize their application for production deployment. Your task is to analyze the project structure and generate two files:

1. **Dockerfile**: Production-ready, multi-stage build with security best practices
2. **.dockerignore**: Optimized build context configuration

## Critical Principles

### Verify Everything Before Adding It

**ABSOLUTE RULE**: Before adding ANY instruction, configuration, or feature to the Dockerfile, verify it by examining the actual codebase.

**Required Process**:
1. **Identify** what you think should be added
2. **Search the codebase** to verify it exists or is actually needed
3. **Only add if verified** - if you can't find evidence in the code, don't add it
4. **When uncertain, ask the user** - if you cannot deduce something from the codebase analysis, ask the user rather than guessing

**Never assume. Always verify. Ask when uncertain. Evidence-based Dockerfiles only.**

### Multi-Architecture Support

**REQUIREMENT**: Ensure all Dockerfile instructions support multiple architectures (amd64, arm64, etc.).

**Apply to**:
- Base image selection: Use multi-arch official images
- Binary downloads: Detect architecture dynamically, never hardcode (amd64, x86_64, etc.)
- System package installation: Use package manager (automatically handles architecture)
- Build commands: Ensure cross-platform compatibility

**The Dockerfile must build successfully on different CPU architectures without modification.**

### NEVER Add HEALTHCHECK

**ABSOLUTE PROHIBITION**: DO NOT add HEALTHCHECK instruction under ANY circumstances.

**Why**:
- Health endpoints are application-specific and cannot be verified from codebase analysis
- Adding unverified health checks will cause containers to be marked unhealthy incorrectly
- Users will add their own HEALTHCHECK if their application has health endpoints

**If you add HEALTHCHECK, you are violating the "verify everything" principle.**

## Process

### Step 1: Analyze Project Structure

**Identify the project characteristics:**

1. **Language Detection**: Examine files to determine the programming language:
   - `package.json` → Node.js/JavaScript/TypeScript
   - `go.mod` or `*.go` files → Go
   - `requirements.txt`, `pyproject.toml`, `setup.py` → Python
   - `pom.xml`, `build.gradle` → Java
   - `Cargo.toml` → Rust
   - `*.csproj` → .NET/C#
   - And so on for other languages

2. **Framework Detection**: Identify framework from dependencies or project structure:
   - Express, Fastify, NestJS, Next.js, Nuxt, etc. (Node.js)
   - Gin, Echo, Fiber, Chi (Go)
   - Flask, Django, FastAPI (Python)
   - Spring Boot, Quarkus, Micronaut (Java)

3. **Application Type**: Determine what kind of application this is:
   - Web server/API
   - CLI tool
   - Worker/background job
   - Static site
   - Microservice

4. **Port Detection**: Identify exposed ports:
   - Search for port configuration in source code and configuration files
   - Look for environment variable usage related to ports
   - Only add EXPOSE if you find evidence of what port the application uses

5. **Build Requirements**: Identify what's needed to build the application:
   - Compiled languages (Go, Rust, Java): Build tools + compiler
   - Interpreted languages (Node.js, Python): Package manager + runtime
   - Build scripts or commands in package manifests

6. **System-Level Runtime Dependencies**: Search for external binaries the application executes:
   - Search for shell execution patterns in the codebase
   - Identify what binary commands are being executed
   - These must be installed in the runtime Docker image as system packages

### Step 2: Select Appropriate Base Images

**Choose base images following these patterns:**

#### Base Image Selection Principles

1. **Use Official Images**: Prefer official images from trusted sources (node, golang, python, etc.)

2. **Pin Specific Versions**: NEVER use `:latest` tag
   - Good: `node:20-alpine`, `golang:1.21-alpine`, `python:3.11-slim`
   - Bad: `node:latest`, `golang:alpine`, `python`

3. **Prefer Minimal Variants**:
   - **Alpine**: Very small, suitable for most applications (`-alpine` suffix)
   - **Slim**: Smaller than full, more compatible than alpine (`-slim` suffix)
   - **Distroless**: Minimal runtime, no shell (for compiled binaries)
   - **Scratch**: Empty image (for fully static binaries)

4. **Match Language Characteristics**:
   - **Compiled languages** (Go, Rust): Use full image for build, minimal/distroless/scratch for runtime
   - **Interpreted languages** (Node.js, Python): Use slim/alpine for both build and runtime

#### Image Selection Examples (Guidelines, Not Templates)

- **Node.js**: `node:20-alpine` (both stages) or `node:20` (build) + `node:20-alpine` (runtime)
- **Go**: `golang:1.21-alpine` (build) + `alpine:3.18` or `gcr.io/distroless/static` (runtime)
- **Python**: `python:3.11-slim` (both stages)
- **Java**: `maven:3.9-eclipse-temurin-17` (build) + `eclipse-temurin:17-jre-alpine` (runtime)
- **Rust**: `rust:1.74-alpine` (build) + `alpine:3.18` or `scratch` (runtime for static binaries)

### Step 3: Generate Multi-Stage Dockerfile

**Create a multi-stage Dockerfile following these patterns:**

#### Stage 1: Builder Stage

The builder stage installs dependencies and builds the application.

**Principles to Apply**:

1. **Name the stage** for clarity: `FROM <base-image> AS builder`

2. **Set working directory**: `WORKDIR /app`

3. **Copy dependency manifests FIRST** (for Docker layer caching):
   - Identify the dependency manifest files from your project analysis (package.json, go.mod, requirements.txt, pom.xml, Cargo.toml, etc.)
   - Copy ONLY these manifest files before copying source code
   - This ensures dependency installation is cached unless dependencies change

4. **Install dependencies**:
   - Determine the correct dependency installation command from the project structure
   - Look for scripts in manifest files (package.json scripts, Makefile targets, etc.)
   - Use commands that provide deterministic builds (lock files, version pinning)
   - **Keep security scanning enabled** - don't add flags that disable vulnerability checks unless there's evidence the project intentionally skips them
   - Use production-only dependencies if the manifest supports it

5. **Copy ONLY what's needed for the build** (after dependencies are installed):
   - **DO NOT use `COPY . .`** - be explicit about what to copy
   - Copy source code directories (src/, lib/, etc.)
   - Copy build configuration files (tsconfig.json, build.gradle, Cargo.toml, etc.)
   - Copy any other files required for the build process
   - This selective copying means .dockerignore can be minimal

6. **Build/compile the application** (if needed):
   - Identify build commands from manifest files (package.json scripts, Makefile, build.gradle tasks, etc.)
   - Look for common build outputs (dist/, build/, target/, binary names)
   - For interpreted languages, check if there's a compilation/transpilation step
   - For compiled languages, identify the compiler and build flags needed

#### Stage 2: Runtime Stage

The runtime stage creates the final, minimal production image.

**Key Patterns**:

1. **Start from minimal base image**: `FROM node:20-alpine` or `FROM alpine:3.18` or `FROM gcr.io/distroless/static`

2. **Set working directory**: `WORKDIR /app`

3. **Create non-root user and group**:
   ```dockerfile
   RUN addgroup -g 1000 appgroup && \
       adduser -u 1000 -G appgroup -s /bin/sh -D appuser
   ```
   (For distroless, use `USER 1000:1000` directly)

4. **Analyze runtime requirements before copying**:
   - **Identify the entry point**: What file/binary does the CMD/ENTRYPOINT execute?
   - **Trace dependencies**: What does that entry point import/require/load at runtime?
   - **Check for runtime file reads**: Does the app read files from disk (configs, templates, static assets)?

5. **Copy ONLY what's required to run**:
   - **For compiled languages**: Only the compiled binary
   - **For interpreted languages**: Only the built/compiled output directory (dist/, build/) if there is one
   - **Runtime dependencies**: The dependency directory (node_modules/, vendor/, site-packages/) that was installed
   - **Static assets**: ONLY if the application serves them at runtime (check if app references public/, static/, assets/)
   - **Runtime configs**: ONLY config files the application reads at startup or runtime

6. **Do NOT copy directories just because they exist**:
   - ❌ NO source code directories (src/, lib/ containing source files)
   - ❌ NO development directories (prompts/, scripts/, examples/, templates/, fixtures/)
   - ❌ NO build tooling (.claude/, tools/, utilities/)
   - ❌ NO test directories (test/, tests/, spec/)
   - ❌ NO documentation (docs/, README.md)
   - **Rule**: If it's not imported/loaded by the runtime entry point, don't copy it

7. **Copy minimal runtime metadata** (only if required):
   - Node.js might need package.json for version metadata
   - Configuration files that the application reads at runtime

8. **Set ownership** (if using non-distroless):
   ```dockerfile
   RUN chown -R appuser:appgroup /app
   ```

9. **Set environment variables** (if needed):
   - **Search the codebase** for environment variable usage (look for env access patterns)
   - **Check for source code defaults**: Look for patterns like `process.env.VAR || 'default'` or `getenv("VAR", "default")`
   - **DO NOT set ENV if source code has defaults** - this duplicates defaults and can override intended behavior
   - **ONLY set ENV if**:
     - No default exists in source code AND a reasonable default is needed
     - The default needs to be different for Docker (e.g., file paths like `/app/tmp/sessions`)
   - **Document required variables** in comments (secrets, external URLs, etc.) but don't set them
   - If no environment variables need defaults, skip this step entirely

10. **Switch to non-root user**:
   ```dockerfile
   USER appuser
   ```

11. **Expose port** (if web application):
   - Identify the port from code analysis or configuration
   ```dockerfile
   EXPOSE <port>
   ```

12. **Set entrypoint and command**:
   - Identify how the application is started from manifest files or documentation
   - For compiled binaries: Execute the binary directly
   - For interpreted languages: Use the runtime command identified from analysis (check package.json scripts, README, or common patterns)
   - Use exec form (JSON array) for proper signal handling: `CMD ["executable", "param1", "param2"]`

### Step 4: Apply Security Hardening

**Implement these security patterns:**

1. **Pin All Versions**:
   - Base images: Use specific version tags
   - System packages: Pin versions where possible

2. **Run as Non-Root**:
   - Create dedicated user with UID/GID 1000
   - Switch to non-root user before CMD/ENTRYPOINT
   - Set proper file ownership

3. **Minimize Attack Surface**:
   - Use minimal base images (alpine, slim, distroless)
   - Don't install unnecessary packages
   - Remove build tools from runtime image

4. **Separate Build from Runtime**:
   - Build tools, compilers, dev dependencies stay in builder stage
   - Only copy runtime artifacts to final image

5. **Use .dockerignore**:
   - Exclude sensitive files (.env, credentials, keys)
   - Reduce build context size

### Step 5: Create .dockerignore File

**Generate a MINIMAL .dockerignore file based on the Dockerfile you just created.**

#### The Key Insight

Since the Dockerfile uses **explicit COPY commands** (not `COPY . .`), .dockerignore serves a very limited purpose:

1. **Security** - Exclude secret patterns that could exist INSIDE directories being copied
2. **Performance** - Exclude large directories that slow down build context transfer

#### Process

1. **Review your Dockerfile's COPY commands** - What directories/files does it copy?
2. **Identify security risks inside those directories** - What secret files could accidentally exist inside the copied directories?
3. **Identify large directories in the project** - What directories >1MB would slow down context transfer?
4. **Exclude ONLY those items** - Nothing else

#### What NOT To Exclude

**DO NOT exclude directories that aren't copied by your Dockerfile!**

If your Dockerfile doesn't copy a directory, excluding it in .dockerignore is pointless redundancy. The Dockerfile already ignores it.

Ask yourself: "Does my Dockerfile copy this?" If no, don't add it to .dockerignore.

#### Target Size

**~10-15 lines maximum.** If your .dockerignore exceeds 20 lines, you're likely adding unnecessary exclusions. Review each line and ask: "Is this a security risk inside a copied directory, or a large directory slowing context transfer?" If neither, remove it.

## Output Format

**Present both files to the user:**

1. **Dockerfile** with clear comments explaining each section
2. **.dockerignore** with organized sections

**After generating, provide:**
- Brief explanation of design choices (base images, build stages, security measures)
- Build command: `docker build -t [project-name] .`
- Run command: `docker run -p [port]:[port] [project-name]`
- Image size expectations
- Next steps for testing

## Success Criteria

The generated Dockerfile must:
- ✅ Build successfully without errors
- ✅ Use multi-stage build (separate builder from runtime)
- ✅ Run as non-root user (UID 1000)
- ✅ Use pinned version tags (no :latest)
- ✅ Use minimal appropriate base images
- ✅ Optimize Docker layer caching (dependencies before source)
- ✅ Produce reasonably sized final image

The generated .dockerignore must:
- ✅ Be minimal (~10-15 lines) - only exclude what's necessary
- ✅ Exclude large directories that slow build context transfer
- ✅ Exclude secret patterns that could exist inside copied directories
- ✅ NOT exclude directories that aren't copied by the Dockerfile (redundant)

## Important Notes

- **Language-Agnostic Approach**: These are patterns and principles, not rigid templates. Adapt based on the specific project's needs.
- **Security First**: When in doubt, prioritize security (non-root, minimal images, pinned versions).
- **Cache Optimization**: Order Dockerfile instructions from least to most frequently changing.
- **Testing**: Always validate the generated Dockerfile builds and runs successfully.
- **Documentation**: Include helpful comments in the Dockerfile explaining key decisions.

## Example Project Analysis Workflow

When invoked, follow this thought process:

1. "I see a package.json with express dependency - this is a Node.js web server"
2. "The package.json shows Node.js 20 in engines - I'll use node:20-alpine"
3. "This is an Express API, likely listens on port 3000 by default"
4. "I'll use multi-stage: builder (install deps + build) + runtime (minimal production image)"
5. "Create non-root user, copy only necessary runtime artifacts"
6. "My Dockerfile copies src/, package.json - what secrets could be inside src/? What large directories exist? Generate minimal .dockerignore for those only"
