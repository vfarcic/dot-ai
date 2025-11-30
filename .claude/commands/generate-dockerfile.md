# Generate Production-Ready Dockerfile

Generate an optimized, secure, multi-stage Dockerfile and .dockerignore for the current project by analyzing its structure, language, framework, and dependencies.

## Instructions

You are helping a developer containerize their application for production deployment. Your task is to analyze the project structure and generate two files:

1. **Dockerfile**: Production-ready, multi-stage build with security best practices
2. **.dockerignore**: Optimized build context configuration

## Critical Principles

These are non-negotiable rules that override all other guidance.

### Verify Everything Before Adding It

**ABSOLUTE RULE**: Before adding ANY instruction, configuration, or feature to the Dockerfile, verify it by examining the actual codebase.

**Required Process**:
1. **Identify** what you think should be added
2. **Search the codebase** to verify it exists or is actually needed
3. **Only add if verified** - if you can't find evidence in the code, don't add it
4. **When uncertain, ask the user** - if you cannot deduce something from the codebase analysis, ask the user rather than guessing

**Never assume. Always verify. Ask when uncertain. Evidence-based Dockerfiles only.**

**Thoroughness over speed**: Shallow analysis leads to broken Dockerfiles. Before generating anything:
- Read the actual source files, not just file names or directory listings
- Search for patterns multiple times with different queries if needed
- Trace the application entry point through its imports and dependencies
- Don't stop at the first search result - investigate thoroughly
- If analysis feels quick, you probably missed something

A correct Dockerfile that took longer to generate is far better than a fast but broken one. Spend the time upfront.

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

---

## Best Practices Reference

These are best practices to consider when generating the Dockerfile. **Apply them when relevant to the project** - not every practice applies to every situation:

- Package manager flags depend on which package manager is used (apt-get vs apk vs others)
- Language-specific guidance applies only to that language
- The "verify everything" principle overrides all: if a practice doesn't fit the project, skip it

Use this section as guidance during generation and a reference for validation.

### Security

| Practice | Description |
|----------|-------------|
| **Non-root user** | Create and run as a dedicated user (UID 1000+), never run as root |
| **Pin image versions** | Use specific tags like `node:20-alpine`, never `:latest` |
| **Official images** | Prefer Docker Official Images or Verified Publishers from trusted sources |
| **No secrets in image** | Never embed credentials, API keys, or passwords in Dockerfile or ENV instructions |
| **No sudo** | Don't use sudo in containers; switch USER explicitly when root access is needed |
| **Minimal packages** | Only install packages that are actually required for the application |
| **--no-install-recommends** | Use this flag with apt-get to prevent installing optional packages |
| **COPY over ADD** | Always use COPY unless you specifically need ADD's tar extraction; never use ADD with URLs |
| **No debugging tools** | Avoid installing curl, wget, vim, netcat in production images unless required by the application |
| **Clean in same layer** | Remove package manager caches in the same RUN command as installation |
| **Executables owned by root** | Application binaries should be owned by root but executed by non-root user |

### Image Selection

| Practice | Description |
|----------|-------------|
| **Minimal base images** | Prefer alpine, slim, distroless, or scratch over full distribution images |
| **Multi-stage builds** | Always separate build dependencies from runtime; build stage → runtime stage |
| **Match language needs** | Compiled languages → distroless/scratch; Interpreted → slim/alpine with runtime |
| **Derive version from project** | Get language version from project files (package.json engines, go.mod, etc.) |

### Build Optimization

| Practice | Description |
|----------|-------------|
| **Layer caching** | Copy dependency manifests (package.json, go.mod) before source code |
| **Combine RUN commands** | Chain related commands with `&&` to reduce layers and enable cleanup |
| **Explicit COPY** | Never use `COPY . .`; explicitly copy only required files and directories |
| **Order by change frequency** | Place stable instructions first (base image, deps) and volatile ones last (source code) |
| **Production dependencies only** | Install only production dependencies, not devDependencies |

### Maintainability

| Practice | Description |
|----------|-------------|
| **Sort arguments** | Alphabetize multi-line package lists for easier maintenance and review |
| **Use WORKDIR** | Always use WORKDIR to change directories, never `RUN cd` |
| **Exec form for CMD** | Use JSON array format: `CMD ["executable", "arg1"]` for proper signal handling |
| **Comment non-obvious decisions** | Explain why certain choices were made, not what the command does |
| **OCI labels** (optional) | Add metadata labels for image management (org.opencontainers.image.*) |

---

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

2. **Version Detection**: Get the language/runtime version from project files:
   - Node.js: `package.json` → `engines.node`
   - Go: `go.mod` → `go` directive
   - Python: `pyproject.toml` → `requires-python` or `.python-version`
   - Java: `pom.xml` → `maven.compiler.source` or `build.gradle`

3. **Framework Detection**: Identify framework from dependencies or project structure

4. **Application Type**: Determine what kind of application this is:
   - Web server/API
   - CLI tool
   - Worker/background job
   - Static site

5. **Port Detection**: Search for port configuration in source code and configuration files. Only add EXPOSE if you find evidence.

6. **Build Requirements**: Identify build tools, commands, and outputs from manifest files

7. **System Dependencies**: This is a critical step - missing runtime binaries will cause the container to fail silently or crash.
   - Search the codebase thoroughly for any code that executes external commands or binaries
   - Use your knowledge of the detected language/framework to identify the relevant patterns
   - For each binary found, verify it's needed at runtime (not just build time)
   - If you find external binary usage, those binaries must be installed in the runtime image
   - When uncertain whether something is a runtime dependency, ask the user

### Step 2: Generate Dockerfile

Generate a multi-stage Dockerfile applying the best practices from the reference section above.

#### Stage 1: Builder

```dockerfile
# Build stage
FROM <base-image>:<version>-<variant> AS builder

WORKDIR /app

# Copy dependency manifests first (layer caching - see Build Optimization)
COPY package.json package-lock.json ./

# Install dependencies with cache cleanup (see Security: clean in same layer)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source files explicitly (see Build Optimization: explicit COPY)
COPY src/ ./src/
COPY tsconfig.json ./

# Build the application
RUN npm run build
```

**Builder stage checklist**:
- [ ] Named stage (`AS builder`)
- [ ] Version derived from project files
- [ ] Dependency manifests copied before source
- [ ] Dependencies installed with cache cleanup
- [ ] Only required files copied (no `COPY . .`)
- [ ] Build command from project analysis

#### Stage 2: Runtime

```dockerfile
# Runtime stage
FROM <minimal-image>:<version>-<variant>

WORKDIR /app

# Create non-root user (see Security: non-root user)
RUN addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

# Copy only runtime artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port (only if verified from analysis)
EXPOSE <port>

# Use exec form (see Maintainability: exec form for CMD)
CMD ["node", "dist/index.js"]
```

**Runtime stage checklist**:
- [ ] Minimal base image (alpine/slim/distroless)
- [ ] Non-root user created (UID 1000)
- [ ] Only runtime artifacts copied from builder
- [ ] No source code, tests, or dev files
- [ ] Proper ownership set
- [ ] USER directive before CMD
- [ ] EXPOSE only if port verified
- [ ] CMD in exec form (JSON array)

#### System Package Installation Pattern

When system packages are required, follow this pattern:

```dockerfile
# For apt-get (Debian/Ubuntu)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        package1 \
        package2 \
        package3 && \
    rm -rf /var/lib/apt/lists/*

# For apk (Alpine)
RUN apk add --no-cache \
        package1 \
        package2 \
        package3
```

**Package installation checklist**:
- [ ] `--no-install-recommends` flag used (apt-get)
- [ ] `--no-cache` flag used (apk)
- [ ] Packages sorted alphabetically
- [ ] Cache cleaned in same RUN command
- [ ] Only required packages installed

### Step 3: Create .dockerignore

**Generate a MINIMAL .dockerignore file based on the Dockerfile you created.**

Since the Dockerfile uses **explicit COPY commands** (not `COPY . .`), .dockerignore serves a limited purpose:

1. **Security** - Exclude secret patterns that could exist INSIDE directories being copied
2. **Performance** - Exclude large directories that slow down build context transfer

#### Process

1. Review your Dockerfile's COPY commands - what directories does it copy?
2. Identify security risks inside those directories (secret files that could accidentally exist)
3. Identify large directories in the project (>1MB) that slow context transfer
4. Exclude ONLY those items

#### What NOT To Exclude

**DO NOT exclude directories that aren't copied by your Dockerfile!**

If your Dockerfile doesn't copy a directory, excluding it in .dockerignore is pointless redundancy.

#### Target Size

**~10-15 lines maximum.** If your .dockerignore exceeds 20 lines, you're likely adding unnecessary exclusions.

---

## Output Format

**Present both files to the user:**

1. **Dockerfile** with clear comments explaining each section
2. **.dockerignore** with organized sections

**After generating, provide:**
- Brief explanation of design choices (base images, build stages, security measures)
- Build command: `docker build -t [project-name] .`
- Run command: `docker run -p [port]:[port] [project-name]`
- Image size expectations
- Recommended next steps:
  - Test locally with the provided commands
  - Consider running `hadolint Dockerfile` for additional linting
  - Consider scanning with `trivy image [project-name]` for vulnerabilities

---

## Success Criteria

### Dockerfile Checklist

- [ ] Builds successfully without errors
- [ ] Uses multi-stage build (builder → runtime)
- [ ] Runs as non-root user (UID 1000)
- [ ] Uses pinned version tags (no `:latest`)
- [ ] Uses minimal base images (alpine/slim/distroless)
- [ ] Copies dependency manifests before source (layer caching)
- [ ] Uses explicit COPY (no `COPY . .`)
- [ ] Combines RUN commands with `&&`
- [ ] Cleans package manager caches in same layer
- [ ] Uses `--no-install-recommends` (if apt-get used)
- [ ] Uses exec form for CMD (`["executable", "arg"]`)
- [ ] No debugging tools unless required
- [ ] No secrets or credentials embedded

### .dockerignore Checklist

- [ ] Minimal size (~10-15 lines)
- [ ] Excludes secrets inside copied directories
- [ ] Excludes large unnecessary directories
- [ ] Does NOT exclude directories not copied by Dockerfile

---

## Example Workflow

When invoked, follow this thought process:

1. **Analyze**: "I see a package.json with express dependency - this is a Node.js web server"
2. **Version**: "The package.json shows `engines.node: 20` - I'll use `node:20-alpine`"
3. **Structure**: "Multi-stage build: builder (install deps + compile TypeScript) → runtime (minimal alpine)"
4. **Security**: "Create non-root user, copy only dist/ and node_modules/, no source code"
5. **Packages**: "The app uses kubectl - need to install it with `apk add --no-cache kubectl`"
6. **Validate**: "Check against Success Criteria checklist before presenting"
