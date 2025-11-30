# PRD: Dockerfile Generation System

**Created**: 2025-11-18
**Status**: In Progress
**Owner**: Viktor Farcic
**Last Updated**: 2025-11-30 (Milestone 5 complete)

## Executive Summary
Create an MCP prompt that generates production-ready, optimized Dockerfiles by analyzing local project directories. The prompt guides Claude Code to create language-agnostic Dockerfiles with multi-stage builds, security best practices, and build context optimization. This enables developers to containerize any application without deep Docker expertise.

## Problem Statement

Developers need to containerize applications for Kubernetes deployment but face significant challenges:

### Current Pain Points
- **Expertise gap**: Creating production-ready Dockerfiles requires deep knowledge of Docker best practices
- **Framework diversity**: Each language/framework has specific optimization patterns that must be learned
- **Security concerns**: Many Dockerfiles run as root, use bloated base images, expose vulnerabilities
- **Build efficiency**: Poor .dockerignore configuration leads to slow, large builds
- **Inconsistency**: Different developers create different Dockerfiles for similar projects

### Impact
- Slow deployment adoption (manual Docker setup is a barrier)
- Security vulnerabilities in production containers
- Large image sizes increase deployment time and storage costs
- Inconsistent environments across team members

## Solution Overview

Create `shared-prompts/generate-dockerfile.md` that instructs Claude Code to:

1. **Analyze project structure** - Detect language, framework, dependencies, application type
2. **Select base images** - Choose appropriate, minimal base images
3. **Generate multi-stage Dockerfile** - Build stage + production stage for minimal final image
4. **Apply security hardening** - Non-root user, minimal packages, security best practices
5. **Optimize build context** - Generate .dockerignore to exclude unnecessary files

### Key Principles

#### Language-Agnostic Design
The prompt should provide **guidance patterns** that work across languages, not hardcoded templates:
- Pattern: Separate dependency installation from source code copy (for caching)
- Pattern: Multi-stage builds (build tools vs runtime)
- Pattern: Minimal base images (alpine, slim, distroless where appropriate)
- Pattern: Security hardening (non-root, pinned versions)

The AI should figure out the specifics for any language/framework.

#### Testing Strategy
**Primary test projects:**
- This project (Node.js/TypeScript)
- A Go project

**Goal**: If it works for these two different languages, the pattern should generalize to others.

## User Workflows

### Primary Workflow: Generate Dockerfile for Project

**Steps**:
1. User is in project directory with source code
2. User invokes Dockerfile generation prompt
3. Claude Code analyzes project structure:
   - Identifies language/framework from files (package.json, go.mod, requirements.txt, etc.)
   - Determines application type (web server, API, CLI, worker)
   - Identifies dependencies and build requirements
4. Claude Code generates:
   - `Dockerfile` (multi-stage, optimized, secure)
   - `.dockerignore` (build context optimization)
5. User tests locally: `docker build -t myapp .`
6. User verifies: `docker run myapp`
7. Dockerfile ready for CI/CD pipeline (PRD #220)

**Success Criteria**:
- ✅ Dockerfile builds successfully without errors
- ✅ Final image is minimal (appropriate for language)
- ✅ Container runs as non-root user
- ✅ Build context excludes unnecessary files
- ✅ Multi-stage build separates build dependencies from runtime

## Technical Design

### Prompt Template Structure

**File**: `shared-prompts/generate-dockerfile.md`

**Input Requirements**:
- User is in project directory
- Project contains source code and dependency manifests

**Output Specifications**:
- `Dockerfile`: Production-ready multi-stage build
- `.dockerignore`: Build context optimization

**Prompt Guidance Areas**:

#### 1. Project Analysis
Guide the AI to:
- Identify language from manifest files (package.json, go.mod, requirements.txt, pom.xml, etc.)
- Determine framework from dependencies
- Identify application type from project structure
- Detect port requirements
- Identify build tools needed

#### 2. Base Image Selection Pattern
Guide the AI to select appropriate base images:
- Prefer minimal variants (alpine, slim) where possible
- Use official images from trusted sources
- Pin specific versions (not :latest)
- Consider compiled vs interpreted languages
- Use distroless or scratch for static binaries

#### 3. Multi-Stage Build Pattern
Guide the AI to structure:

**Stage 1 (builder)**:
- Start from image with build tools
- Copy dependency manifests first (cache optimization)
- Install dependencies
- Copy source code
- Build/compile application

**Stage 2 (runtime)**:
- Start from minimal runtime image
- Copy only runtime artifacts from builder
- Set non-root user
- Configure port exposure
- Set entrypoint/command

#### 4. Security Hardening Pattern
Guide the AI to apply:
- Use specific image versions (not :latest)
- Run as non-root user (USER 1000 or named user)
- Minimize installed packages
- Remove build tools from runtime image
- Consider distroless/scratch for compiled languages

#### 5. Build Context Optimization
Guide the AI to generate .dockerignore with:
- Version control directories (.git)
- Build artifacts (language-specific)
- Development files (.env.local, *.log)
- Documentation (README.md, docs/)
- Test files
- IDE configurations

## Implementation Milestones

### Milestone 1: Core Prompt Template Created
- [x] `shared-prompts/generate-dockerfile.md` created with language-agnostic guidance
- [x] Project analysis guidance documented
- [x] Base image selection patterns defined
- [x] Multi-stage build pattern documented
- [x] Security hardening guidance included

### Milestone 2: Tested with Node.js/TypeScript Project
- [x] Tested with this project (dot-ai)
- [x] Generated Dockerfile builds successfully
- [x] Generated image runs as non-root
- [x] Image size is reasonable
- [x] .dockerignore appropriately excludes files

### Milestone 3: Best Practices Enhancement
- [x] Identify and document Dockerfile best practices to incorporate
- [x] Update prompt template to include best practices guidance
- [x] Validate best practices with test projects

### Milestone 4: Existing Dockerfile Improvement
- [x] Detect when Dockerfile already exists in project
- [x] Read and analyze existing Dockerfile against best practices
- [x] Identify improvements (security, multi-stage, non-root, image size, etc.)
- [x] Preserve intentional customizations while fixing issues
- [x] Present diff/comparison showing proposed changes with rationale
- [x] Update .dockerignore if needed based on existing Dockerfile's COPY commands
- [x] Validate improved Dockerfile builds and runs successfully

### Milestone 5: Tested with Go Project
- [x] Tested with external Go project
- [x] Generated Dockerfile builds successfully
- [x] Generated image is minimal (distroless/scratch)
- [x] Multi-stage build properly separates build from runtime
- [x] Verifies pattern generalizes across languages

### Milestone 6: Documentation Complete
- [ ] `docs/mcp-guide.md` updated with Dockerfile generation guide
- [ ] Usage instructions documented
- [ ] README.md updated with containerization capabilities
- [ ] Troubleshooting guidance provided

## Success Criteria

### Functional Requirements
- ✅ Generated Dockerfiles build successfully without errors
- ✅ Generated images are minimal (appropriate for language)
- ✅ Containers run as non-root user
- ✅ Multi-stage builds separate build dependencies from runtime
- ✅ .dockerignore excludes unnecessary files (reduces build context)

### Quality Requirements
- ✅ Dockerfiles follow industry best practices
- ✅ Generated files are human-readable and maintainable
- ✅ Prompt works consistently across different languages (validated via Node.js and Go testing)

### Integration Requirements
- ✅ Outputs ready for CI/CD integration (PRD #220)
- ✅ Images work in local development (PRD #226)
- ✅ Works seamlessly in Claude Code workflow

### Performance Requirements
- ✅ Dockerfile generation completes in < 30 seconds
- ✅ Generated images build in reasonable time
- ✅ Multi-stage builds leverage caching effectively

## Risks & Mitigation

### Risk: Language-Specific Edge Cases
**Impact**: Medium - Some projects may have unusual configurations
**Probability**: Medium
**Mitigation**:
- Start with mainstream patterns
- Allow users to provide additional context
- Iterate based on real-world usage feedback
- Document known edge cases

### Risk: Generated Dockerfiles Don't Build
**Impact**: High - Breaks user workflow completely
**Probability**: Low (if tested properly)
**Mitigation**:
- Test prompt with real projects (Node.js + Go)
- Include validation guidance in prompt
- Provide troubleshooting guidance in documentation
- Iterate based on build failures

### Risk: Security Vulnerabilities in Generated Files
**Impact**: High - Defeats security goals
**Probability**: Low (with proper guidance)
**Mitigation**:
- Emphasize security patterns in prompt
- Document security best practices
- Consider adding vulnerability scanning recommendations

### Risk: Image Sizes Too Large
**Impact**: Medium - Increases deployment time and costs
**Probability**: Medium (depends on base image selection)
**Mitigation**:
- Emphasize multi-stage builds in prompt
- Guide toward minimal base images
- Test and validate image sizes in milestones

## Dependencies

### Prerequisites
- User has Docker installed locally (for testing)
- User is in project directory with source code

### External Dependencies
- Docker/container runtime for local testing
- Base images from Docker Hub or other registries
- Language-specific package managers (npm, pip, go mod, maven, etc.)

### Integration Dependencies
- PRD #220 (GitHub Actions) consumes generated Dockerfile
- PRD #226 (Local K8s) uses generated images for local development

## Future Enhancements

### Potential Phase 2 Features
- Platform-specific builds (ARM64, multi-arch)
- Advanced BuildKit features (cache mounts, secrets)
- Custom base image support (private registries)
- Integrated vulnerability scanning recommendations

## Work Log

### 2025-11-18: PRD Creation
**Completed Work**:
- Created PRD #225 for Dockerfile Generation System
- Defined language-agnostic approach (no hardcoded frameworks)
- Focused on core Dockerfile + .dockerignore generation
- Removed docker-compose (replaced by PRD #226 local K8s approach)
- Simplified to 4 major milestones
- Testing scope: Node.js/TypeScript (this project) + Go project

**Design Decisions**:
- Standalone prompt (no PRD #22 dependency)
- Language-agnostic patterns (not framework-specific templates)
- Local K8s development moved to separate PRD #226
- Examples and framework lists marked as TBD (to be determined during implementation)

**Next Steps**:
- Create PRD #220 (GitHub Actions CI/CD)
- Create PRD #226 (Local Kubernetes Development)
- Update PRD #22 to reflect focused analysis scope

### 2025-11-21: Milestone 1 & 2 Complete - Prompt Template Created and Node.js Testing
**Duration**: Full development session
**Primary Focus**: Create language-agnostic Dockerfile generation prompt and validate with dot-ai project

**Completed PRD Items**:
- [x] Created core prompt template at `.claude/commands/generate-dockerfile.md`
- [x] Documented comprehensive project analysis guidance (language/framework detection)
- [x] Defined base image selection patterns with multi-arch support
- [x] Documented multi-stage build patterns (builder + runtime)
- [x] Included security hardening guidance (non-root, minimal images, ENV handling)
- [x] Tested iteratively with dot-ai project (Node.js/TypeScript)
- [x] Generated Dockerfile builds successfully with kubectl, multi-stage, non-root
- [x] Verified reasonable image size and minimal .dockerignore

**Key Design Decisions**:
- **Verification-first approach**: Added "verify everything before adding" as Critical Principle
- **No assumptions**: Explicit prohibition on HEALTHCHECK, careful ENV variable handling
- **Language-agnostic patterns**: Removed all language-specific recipes, focus on analysis principles
- **Multi-arch requirement**: All instructions must support amd64, arm64, etc.
- **Minimal .dockerignore**: Security/performance essentials only, not exhaustive lists
- **Explicit COPY**: No `COPY . .`, only verified files/directories

**Testing Approach**:
- Iterative refinement through separate Claude Code instance
- Each iteration addressed specific issues (kubectl, ENV vars, HEALTHCHECK, scripts/, etc.)
- Final Dockerfile is production-ready for dot-ai project

**Next Session Priorities**:
- Test prompt with external Go project to validate language-agnostic approach
- Move `.claude/commands/generate-dockerfile.md` to `shared-prompts/generate-dockerfile.md`
- Update documentation (docs/mcp-guide.md, README.md)

### 2025-11-21: Design Decision - Add Validation & Testing Phase
**Decision**: Add comprehensive validation and testing instructions to the prompt

**Rationale**:
- Current prompt generates Dockerfile/dockerignore but doesn't validate they actually work
- Violates the "verify everything" principle - we generate but don't test
- Users might receive broken Dockerfiles without Claude catching errors first
- Manual testing in separate instance showed multiple iteration cycles needed to get it right
- Automated validation would catch errors before presenting to user

**Impact**:
- **Requirements**: Add new validation phase after generation
- **Prompt Enhancement**: Add Step 6: Build, Test, Fix, and Clean Up
- **Success Criteria**: Dockerfile must successfully build and run, not just be generated
- **User Experience**: Higher confidence - presented Dockerfiles are known to work

**Implementation Approach**:
After generating Dockerfile and .dockerignore, Claude should:
1. **Build the image**: `docker build -t [project-name]-test .`
2. **If build fails**: Analyze error, fix Dockerfile, retry (iterative)
3. **Run the container**: `docker run -d --name [project-name]-test [project-name]-test`
4. **Basic validation**: Check container is running, verify process started
5. **Clean up**: Remove container and image after validation
6. **Only then present to user**: With confidence it works

**Code Impact**: Added Step 4 (Build, Test, and Iterate) to generate-dockerfile.md prompt

**Owner**: Viktor Farcic
**Status**: Implemented (2025-11-30)

### 2025-11-30: .dockerignore Guidance Enhancement
**Duration**: Review and refinement session
**Primary Focus**: Improve .dockerignore generation to be principle-based, not template-based

**Completed Work**:
- Rewrote Step 5 (.dockerignore) from template-based to principle-based guidance
- Updated Success Criteria to reflect minimal .dockerignore approach (~10-15 lines)
- Updated Example Workflow to show reasoning process instead of literal template
- Validated prompt effectiveness: generated .dockerignore is 13 lines vs original 38 lines

**Key Design Decisions**:
- **.dockerignore derives from Dockerfile**: Only exclude what's relevant to COPY commands
- **Two categories only**: Security patterns (inside copied dirs) + large directories (performance)
- **No redundant exclusions**: Don't exclude directories the Dockerfile doesn't copy
- **Target size**: ~10-15 lines maximum

**Next Session Priorities**:
- Implement Step 6: Build, Test, Fix, and Clean Up (validation phase)
- Test with Go project (Milestone 5)

### 2025-11-30: Design Decision - Add Existing Dockerfile Improvement Milestone
**Decision**: Add Milestone 4 for improving existing Dockerfiles

**Rationale**:
- Current command assumes no Dockerfile exists and generates from scratch
- Many projects already have Dockerfiles that need improvement, not replacement
- Same best practices apply whether creating new or improving existing
- Should be done before testing with other languages (Go) to ensure the improvement flow works

**Impact**:
- **New Milestone 4**: Existing Dockerfile Improvement
- **Renumbered**: Go testing → Milestone 5, Documentation → Milestone 6
- **Removed from Future Enhancements**: "Dockerfile optimization for existing files" now in scope

**Implementation Approach**:
1. Detect if Dockerfile exists in project directory
2. If exists: read, analyze against best practices, propose improvements
3. Preserve intentional customizations (comments, special configurations)
4. Show diff/comparison with rationale for each change
5. Apply same validation (build, run, clean up) to improved Dockerfile

### 2025-11-30: Milestone 3 Complete - Best Practices Enhancement
**Duration**: Full development session
**Primary Focus**: Research, document, and integrate Dockerfile best practices into prompt

**Completed PRD Items**:
- [x] Researched best practices from Docker docs, OWASP, Sysdig, Hadolint, and industry sources
- [x] Created comprehensive research document (`tmp/best-practices.md`)
- [x] Restructured prompt with consolidated "Best Practices Reference" section
- [x] Validated with dot-ai project - kubectl detected, non-root user, proper .dockerignore

**Key Design Decisions**:
- **Consolidated best practices section**: Moved scattered practices into single reference section with 4 categories (Security, Image Selection, Build Optimization, Maintainability)
- **Table format**: Best practices presented as scannable tables with practice name and description
- **Contextual application**: Added guidance that practices apply "when relevant" - not rigid rules
- **Thoroughness over speed**: Added critical principle emphasizing deep analysis over quick generation
- **Principle-based system dependencies**: Enhanced guidance without prescribing specific patterns

**Prompt Structure Changes**:
- Reduced from 5 process steps to 3 cleaner steps (Analyze, Generate, .dockerignore)
- Added checklists for Builder stage, Runtime stage, and Package installation
- Added tooling recommendations (hadolint, trivy) in output section
- Enhanced Success Criteria with comprehensive Dockerfile and .dockerignore checklists

**Validation Results**:
- Generated Dockerfile correctly identified kubectl as runtime dependency
- Runs as non-root user (appuser, UID 1000)
- Installs kubectl with proper multi-arch detection
- .dockerignore reduced to 15 lines (within target of 10-15)
- Creates session directory with proper permissions
- Sets appropriate environment variables

**Next Session Priorities**:
- Implement Milestone 4: Existing Dockerfile Improvement
- Or proceed to Milestone 5: Go Project Testing

### 2025-11-30: Milestone 4 Complete - Existing Dockerfile Improvement
**Duration**: Development session
**Primary Focus**: Add ability to detect and improve existing Dockerfiles

**Completed PRD Items**:
- [x] Added Step 0 to detect existing Dockerfile and .dockerignore
- [x] Updated Step 2 to handle both generation and improvement flows
- [x] Added evaluation against best practices checklists for existing files
- [x] Added guidance to preserve intentional customizations (comments, ENV vars, configs)
- [x] Added "Changes made" output format showing what was changed and why
- [x] Updated Step 3 for .dockerignore improvement (remove redundant, add missing)
- [x] Validated with dot-ai project's original Dockerfile

**Additional Work - Language-Agnostic Refactoring**:
- Rewrote Step 1 (Analyze Project Structure) from lookup tables to analysis principles
- Changed Language Detection and Version Detection to be exploratory, not prescriptive
- Generalized Step 2 examples from Node.js-specific to pattern-based templates
- Added yum/dnf package manager examples alongside apt-get and apk
- Updated Example Workflows to show both new generation and improvement scenarios

**Validation Results** (tested with original tmp/Dockerfile):
| Original Issue | Result |
|---------------|--------|
| Running as root (no USER) | ✅ Added non-root user (dotai, UID 1000) |
| Missing `--no-install-recommends` | ✅ Added to apt-get install |
| Missing `ca-certificates` | ✅ Added for curl HTTPS |
| No session dir ownership | ✅ Added `chown -R dotai:dotai` |
| .dockerignore 38 lines | ✅ Reduced to 9 lines (minimal) |
| Preserved: multi-stage, kubectl, ENV vars, comments | ✅ All kept |

**Key Design Decisions**:
- **Unified flow**: Same process for new and existing, only Step 2 output differs
- **Checklists for validation**: Same checklists used for generation and improvement
- **Conservative preservation**: Keep anything that looks intentional (comments, custom configs)

**Next Session Priorities**:
- Test with Go project (Milestone 5) to validate language-agnostic approach
- Complete documentation (Milestone 6)

### 2025-11-30: Validation Phase Implementation
**Duration**: Development session
**Primary Focus**: Implement Step 4 (Build, Test, and Iterate) and prompt enhancements

**Completed Work**:
- Implemented Step 4: Build, Test, and Iterate (validation phase)
  - 4.1 Build validation
  - 4.2 Run validation (container state check based on application type)
  - 4.3 Log analysis (using project knowledge, language-agnostic)
  - 4.4 Linting with hadolint (if available, skip if not)
  - 4.5 Security scan with trivy (if available, skip if not)
  - 4.6 Iteration loop (max 5 attempts before asking user)
  - 4.7 Cleanup (always runs, success or failure)
- Added Environment Variable Detection to Step 1 (item 8)
- Changed UID recommendation from 1000+ to 10001+ (avoids base image user conflicts)
- Added online version lookup guidance to Version Detection
- Updated Example Workflows to include validation steps
- Added Validation Checklist to Success Criteria
- Moved hadolint/trivy from "recommended next steps" into automated validation

**Key Design Decisions**:
- **Language-agnostic log analysis**: AI uses project knowledge to interpret logs, no prescriptive error patterns
- **Optional tooling**: hadolint and trivy run if installed, skip gracefully if not
- **UID 10001+**: Avoids conflicts with common base image users (e.g., node user is often UID 1000)
- **Principle-based env var detection**: No language-specific patterns, let AI figure it out

**Validation Results** (tested with dot-ai project):

| Mode | Test | Result |
|------|------|--------|
| New generation | UID | ✅ 10001 from start (no validation fix needed) |
| New generation | ENV vars | ✅ 4 of 5 detected (TRANSPORT_TYPE, HOST, PORT, DOT_AI_SESSION_DIR) |
| Improvement | Non-root user | ✅ Added (dotai, UID 10001) |
| Improvement | --no-install-recommends | ✅ Added |
| Improvement | ca-certificates | ✅ Added |
| Improvement | Preserved customizations | ✅ All comments, ENV vars, .tgz approach kept |
| Improvement | .dockerignore | ✅ Reduced from 38 to 12 lines |

**Next Session Priorities**:
- Test with Go project (Milestone 5) to validate language-agnostic approach
- Complete documentation (Milestone 6)

### 2025-11-30: Milestone 5 Complete - Go Project Testing & CI Integration
**Duration**: Development session
**Primary Focus**: Validate language-agnostic approach with Go project and ensure CI integration

**Completed PRD Items**:
- [x] Tested with external Go project (silly-demo)
- [x] Generated Dockerfile builds successfully
- [x] Generated image is minimal (distroless/scratch)
- [x] Multi-stage build properly separates build from runtime
- [x] Verifies pattern generalizes across languages

**Go Project Testing Results** (silly-demo):

| Test | New Generation | Improvement Flow |
|------|----------------|------------------|
| Base image | `scratch` | `distroless/static:nonroot` |
| Non-root user | ✅ UID 10001 | ✅ `nonroot:nonroot` |
| Multi-arch | ✅ TARGETOS/TARGETARCH | ✅ Auto-detect |
| Static binary | ✅ CGO_ENABLED=0 | ✅ CGO_ENABLED=0 |
| CA certificates | ✅ Copied from builder | ✅ Built into distroless |
| Vendor support | ✅ `-mod=vendor` | ✅ Preserved |

**Key Improvements Over Original silly-demo Dockerfile**:
- Fixed security: Added non-root user (original ran as root)
- Fixed portability: Removed hardcoded amd64, now multi-arch
- Fixed HTTPS: Added CA certificates (original would fail HTTPS calls)
- Added build optimization: `-ldflags="-s -w"` for smaller binary
- Cleaned up redundant operations (mkdir, chmod, go mod download with vendor)

**dot-ai Project Testing** (Node.js):
- Generated new Dockerfile with multi-stage build, non-root user, kubectl
- Verified version tool reads from package.json correctly
- Confirmed CI will validate Dockerfile during PR checks

**CI Workflow Updates**:
- Removed obsolete `npm pack` step (no longer needed - builds from source)
- Removed unused `PACKAGE_VERSION` build-arg
- Verified integration tests build Docker image and deploy to Kind cluster

**Key Findings**:
- Language-agnostic approach works: Same prompt handles Node.js and Go correctly
- Prompt adapts base image selection: Alpine for Node.js, scratch/distroless for Go
- Improvement flow preserves intentional customizations while fixing issues

**Next Session Priorities**:
- Complete documentation (Milestone 6)
