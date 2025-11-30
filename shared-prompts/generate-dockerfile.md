---
name: generate-dockerfile
description: Generate production-ready, secure, multi-stage Dockerfile and .dockerignore for any project
category: development
---

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
| **Non-root user** | Create and run as a dedicated user (UID 10001+), never run as root |
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

### Step 0: Check for Existing Dockerfile

**Before generating anything, check if the project already has a Dockerfile.**

1. Look for `Dockerfile` in the project root (also check for variants like `Dockerfile.prod`)
2. If found, read and store its contents for Step 2
3. Similarly, check for `.dockerignore` and read it if present

This determines whether Step 2 will generate new files or improve existing ones.

### Step 1: Analyze Project Structure

**Identify the project characteristics through exploration, not pattern matching.**

These are analysis goals, not lookup tables. The examples below are illustrative - apply the same analytical approach to ANY language, framework, or toolchain you encounter.

1. **Language Detection**: Explore the project to identify its programming language(s).
   - Look for dependency manifest files (e.g., `package.json`, `go.mod`, `requirements.txt`, `Cargo.toml`, `Gemfile`, `composer.json`, `mix.exs`, `build.sbt`, etc.)
   - Examine source file extensions
   - Read manifest contents to understand the ecosystem
   - **Principle**: Every language has some form of dependency declaration - find it and read it

2. **Version Detection**: Find the required language/runtime version.
   - Search manifest files for version constraints or engine requirements
   - Look for version files (e.g., `.node-version`, `.python-version`, `.ruby-version`, `.tool-versions`)
   - Check CI configuration files which often specify versions
   - **If project specifies a version** → use that exact version
   - **If no version specified** → search online for the current LTS/stable version of that language/runtime
   - **Principle**: Use the project's required version if specified, otherwise look up the current recommended version - never guess

3. **Framework Detection**: Identify frameworks from dependencies and project structure.
   - Read the dependency list in manifest files
   - Look for framework-specific configuration files
   - Examine the project structure for framework conventions
   - **Principle**: Frameworks leave fingerprints - configuration files, directory structures, dependencies

4. **Application Type**: Determine what kind of application this is by examining entry points and configuration.
   - Web server/API: Look for HTTP server setup, route definitions, port binding
   - CLI tool: Look for argument parsing, command definitions, bin entries
   - Worker/background job: Look for queue consumers, scheduled tasks
   - Static site: Look for build output configuration, no server code
   - **Principle**: The entry point and its imports reveal the application's purpose

5. **Port Detection**: Search for port configuration in source code and configuration files.
   - Look for environment variable usage (e.g., `PORT`, `HTTP_PORT`)
   - Search for hardcoded port numbers in server initialization
   - Check configuration files for port settings
   - **Only add EXPOSE if you find concrete evidence**

6. **Build Requirements**: Identify how the project is built.
   - Read the manifest file for build scripts/commands
   - Identify the build tool (could be language-standard or third-party)
   - Determine build outputs (compiled binaries, transpiled code, bundled assets)
   - **Principle**: Every project that needs building has build instructions - find them

7. **System Dependencies**: Critical step - missing runtime binaries cause silent failures.
   - Search the codebase for code that executes external commands or binaries
   - Common patterns: shell execution, subprocess calls, exec functions, system calls
   - For each binary found, verify it's needed at runtime (not just build time)
   - Consider what the application actually does - does it need CLI tools, database clients, image processors?
   - **When uncertain whether something is a runtime dependency, ask the user**

8. **Environment Variable Detection**: Critical step - missing env vars cause runtime failures.
   - Search the codebase for environment variable access (every language has a way to read env vars)
   - Look for `.env.example`, `.env.sample`, or similar files that document required variables
   - Check configuration and startup code for env var usage
   - Determine which vars are required (no default, app fails without) vs optional (has default)
   - For required vars, set sensible defaults in the Dockerfile
   - **Principle**: If the code reads an env var, the container probably needs it configured

### Step 2: Generate or Improve Dockerfile

**If no existing Dockerfile** → Generate a new multi-stage Dockerfile using the patterns below.

**If existing Dockerfile found** → Analyze it against the best practices and checklists below, then improve:

1. **Evaluate against checklists** - Check each item in the Builder and Runtime checklists
2. **Identify issues** - Security problems (running as root, :latest tags), missing optimizations (no multi-stage, COPY . .), maintainability issues
3. **Preserve intentional customizations** - Comments explaining decisions, custom configurations, environment-specific settings
4. **Edit to fix issues** - Apply best practices while keeping the existing structure where it's already correct
5. **Explain changes** - When presenting the improved Dockerfile, briefly note what was changed and why

Use the patterns and checklists below for both generation and validation.

**The examples below show structural patterns, not copy-paste templates.** Adapt the pattern to whatever language, package manager, and build tool the project uses.

#### Stage 1: Builder

```dockerfile
# Build stage - use an image with build tools for this language
FROM <language-image>:<version>-<variant> AS builder

WORKDIR /app

# PATTERN: Copy dependency manifests FIRST for layer caching
# Examples: package.json, go.mod, requirements.txt, Gemfile, Cargo.toml, pom.xml
COPY <dependency-manifest-files> ./

# PATTERN: Install dependencies, clean cache in same layer
# Use whatever package manager the project uses
RUN <install-dependencies-command> && \
    <clean-cache-command>

# PATTERN: Copy only the source files needed for build
# Never use "COPY . ." - be explicit about what's needed
COPY <source-directories> ./
COPY <config-files-needed-for-build> ./

# PATTERN: Run the project's build command
RUN <build-command>
```

**Builder stage checklist**:
- [ ] Named stage (`AS builder`)
- [ ] Base image appropriate for the language (with build tools)
- [ ] Version derived from project files (not assumed)
- [ ] Dependency manifests copied before source code
- [ ] Dependencies installed with cache cleanup in same RUN
- [ ] Only required files copied (never `COPY . .`)
- [ ] Build command matches what the project actually uses

#### Stage 2: Runtime

```dockerfile
# Runtime stage - use minimal image appropriate for the language
# Compiled languages: consider distroless, scratch, or alpine
# Interpreted languages: use slim or alpine variant with runtime only
FROM <minimal-runtime-image>:<version>

WORKDIR /app

# PATTERN: Create non-root user (syntax varies by base image)
# Alpine uses addgroup/adduser, Debian uses groupadd/useradd
RUN <create-group-command> && \
    <create-user-command>

# PATTERN: Copy ONLY runtime artifacts from builder
# What you copy depends on the language:
# - Compiled: just the binary
# - Interpreted: built output + runtime dependencies + minimal config
COPY --from=builder <build-outputs> ./
COPY --from=builder <runtime-dependencies> ./

# PATTERN: Set ownership to non-root user
RUN chown -R <user>:<group> /app

# Switch to non-root user BEFORE exposing ports or setting CMD
USER <non-root-user>

# Only if port was verified during analysis
EXPOSE <port>

# PATTERN: Use exec form for proper signal handling
# The command depends on how this application runs
CMD ["<executable>", "<args>"]
```

**Runtime stage checklist**:
- [ ] Minimal base image (alpine/slim/distroless/scratch as appropriate)
- [ ] Non-root user created (UID 10001+)
- [ ] Only runtime artifacts copied from builder
- [ ] No source code, tests, build tools, or dev dependencies
- [ ] Proper ownership set
- [ ] USER directive before CMD
- [ ] EXPOSE only if port was verified in analysis
- [ ] CMD in exec form (JSON array)

#### System Package Installation Pattern

When system packages are required, use the package manager appropriate for your base image. The principle is always the same: **install only what's needed and clean the cache in the same layer**.

Common examples (adapt to your base image's package manager):

```dockerfile
# apt-get (Debian, Ubuntu)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        package1 \
        package2 && \
    rm -rf /var/lib/apt/lists/*

# apk (Alpine)
RUN apk add --no-cache \
        package1 \
        package2

# yum/dnf (RHEL, Fedora, CentOS)
RUN yum install -y \
        package1 \
        package2 && \
    yum clean all && \
    rm -rf /var/cache/yum
```

**Package installation checklist**:
- [ ] Used the correct package manager for the base image
- [ ] Used flags to skip optional/recommended packages where available
- [ ] Packages sorted alphabetically for maintainability
- [ ] Cache cleaned in same RUN command
- [ ] Only packages actually required by the application

### Step 3: Create or Improve .dockerignore

**If no existing .dockerignore** → Generate a minimal one based on the Dockerfile.

**If existing .dockerignore found** → Review it against the Dockerfile's COPY commands:
1. Remove redundant exclusions (directories not copied by Dockerfile anyway)
2. Add missing security exclusions (secrets inside copied directories)
3. Keep it minimal (~10-15 lines)

**Generate a MINIMAL .dockerignore file based on the Dockerfile.**

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

### Step 4: Build, Test, and Iterate

**Purpose**: Verify the Dockerfile works before presenting to user. A Dockerfile isn't done until it's validated.

#### 4.1 Build

Build the image to verify the Dockerfile syntax and instructions are correct:

```bash
docker build -t [project-name]-validation .
```

- If build succeeds → proceed to run
- If build fails → analyze the error, fix Dockerfile, retry

#### 4.2 Run

Start a container to verify the application runs:

```bash
docker run -d --name [project-name]-test [project-name]-validation
sleep 5  # Allow startup time
```

Check container state:

```bash
docker inspect --format='{{.State.Status}}' [project-name]-test
docker inspect --format='{{.State.ExitCode}}' [project-name]-test
```

**Expected behavior depends on application type** (determined in Step 1):
- **Services** (web servers, APIs, workers): Container should still be running
- **CLI tools / one-shot commands**: Container should have exited with code 0

If container crashed or exited unexpectedly → proceed to log analysis to understand why.

#### 4.3 Log Analysis

Capture and analyze container logs:

```bash
docker logs [project-name]-test 2>&1
```

**Analyze logs using your knowledge of the project from Step 1.** You know:
- What language and framework this is
- What the application is supposed to do
- What dependencies it requires
- What a successful startup looks like for this type of application

Use this context to determine if the logs indicate:
- The application started correctly, OR
- Something is wrong (errors, crashes, missing dependencies, permission issues, etc.)

If logs indicate a problem → identify root cause, fix Dockerfile or .dockerignore, retry.

#### 4.4 Linting (if available)

If `hadolint` is installed, run it to catch Dockerfile best practice issues:

```bash
hadolint Dockerfile
```

- If hadolint is not installed → skip this check
- If hadolint reports issues → evaluate each issue, fix if appropriate, retry
- Some hadolint warnings may be intentional (use judgment based on project context)

#### 4.5 Security Scan (if available)

If `trivy` is installed, scan the built image for vulnerabilities:

```bash
trivy image --severity HIGH,CRITICAL [project-name]-validation
```

- If trivy is not installed → skip this check
- If trivy reports HIGH/CRITICAL vulnerabilities in the base image → consider if a different base image version or variant would help
- If vulnerabilities are in application dependencies → note them for the user but don't block (dependency updates are outside Dockerfile scope)

#### 4.6 Iterate

If any validation step fails:

1. **Analyze** the specific error message or behavior
2. **Identify root cause** - common issues include:
   - Missing file → incorrect COPY command or overly aggressive .dockerignore
   - Missing dependency → system package not installed
   - Permission denied → ownership or USER directive issue
   - Module not found → build step incomplete or wrong files copied
   - Hadolint warning → Dockerfile best practice issue
3. **Fix** the appropriate file (Dockerfile or .dockerignore)
4. **Retry** from step 4.1

**Maximum 5 iterations.** If still failing after 5 attempts:
- Stop and present current state to user
- Explain what's failing and what fixes were attempted
- Ask for guidance

#### 4.7 Cleanup

**Always clean up after validation**, whether successful or not:

```bash
docker stop [project-name]-test 2>/dev/null || true
docker rm [project-name]-test 2>/dev/null || true
docker rmi [project-name]-validation 2>/dev/null || true
```

Only proceed to present the Dockerfile to user after:
- All validation steps pass, AND
- Cleanup is complete

---

## Output Format

### For New Dockerfiles (no existing file)

**Present both files to the user:**

1. **Dockerfile** with clear comments explaining each section
2. **.dockerignore** with organized sections

**After generating, provide:**
- Brief explanation of design choices (base images, build stages, security measures)
- Build command: `docker build -t [project-name] .`
- Run command: `docker run -p [port]:[port] [project-name]`
- Image size expectations

### For Improved Dockerfiles (existing file found)

**Present the improved files with a summary of changes:**

1. **Dockerfile** - the improved version
2. **Changes made** - brief list of what was changed and why:
   - Security fixes (e.g., "Added non-root user - was running as root")
   - Optimization improvements (e.g., "Added multi-stage build to reduce image size")
   - Best practice updates (e.g., "Changed CMD to exec form for signal handling")
3. **Preserved** - note any intentional customizations that were kept
4. **.dockerignore** - improved version if changes were needed

### For Both Cases

**Recommended next steps** (the Dockerfile has already been validated):
- Integrate into CI/CD pipeline
- Commit to version control

---

## Success Criteria

### Dockerfile Checklist

- [ ] Builds successfully without errors
- [ ] Uses multi-stage build (builder → runtime)
- [ ] Runs as non-root user (UID 10001+)
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

### Validation Checklist (Step 4)

- [ ] Image builds successfully
- [ ] Container starts without crashing
- [ ] Logs show no errors indicating application failure
- [ ] Hadolint passes (if installed)
- [ ] Trivy shows no critical base image vulnerabilities (if installed)
- [ ] Test container and image cleaned up

**Do not present Dockerfile to user until all validation checks pass.**

---

## Example Workflows

### New Dockerfile (no existing file)

1. **Check**: "No existing Dockerfile found. Will generate new one."
2. **Explore**: "Let me find the dependency manifest... found `<manifest-file>`. Reading it to understand the ecosystem."
3. **Identify**: "This is a `<language>` project using `<framework/tool>`. The manifest indicates version `<X>`."
4. **Trace**: "The entry point is `<file>`. Following imports to understand runtime needs."
5. **Structure**: "Multi-stage build: builder stage needs `<build-tools>`, runtime stage needs only `<runtime-artifacts>`."
6. **Dependencies**: "Searching for external binary usage... found `<binary>`. This needs to be in the runtime image."
7. **Generate**: "Create Dockerfile and .dockerignore. Check against best practices checklists."
8. **Build & Test**: "Building image... Running container... Checking logs..."
9. **Iterate** (if needed): "Build failed due to missing package. Adding to Dockerfile and retrying..."
10. **Cleanup & Present**: "Validation passed. Removing test artifacts. Here's your Dockerfile."

### Improving Existing Dockerfile

1. **Check**: "Found existing Dockerfile. Reading it to analyze..."
2. **Analyze project**: Same exploration as above to understand what the Dockerfile should do.
3. **Evaluate**: "Checking existing Dockerfile against best practices checklists..."
   - "❌ Running as root - no USER directive"
   - "❌ Using :latest tag instead of pinned version"
   - "✅ Multi-stage build already in place"
   - "✅ Dependency manifests copied first"
4. **Preserve**: "Keeping custom ENV variables and the specific port configuration - these appear intentional."
5. **Improve**: "Adding non-root user, pinning image version to match project requirements."
6. **Build & Test**: "Building improved image... Running container... Checking logs..."
7. **Iterate** (if needed): "Container crashed - logs show permission error. Fixing ownership and retrying..."
8. **Cleanup & Present**: "Validation passed. Removing test artifacts. Here are the improvements."

**Key mindset**: Investigate the actual project rather than matching against templates. Every project is unique. Don't present until validated.
