# PRD: Docker and Kubernetes Deployment Support for MCP

**GitHub Issue:** [#64](https://github.com/vfarcic/dot-ai/issues/64)

## Problem Statement

Currently, the DevOps AI Toolkit MCP server can only be run via `npx`, which creates several limitations:

### Current Limitations
1. **Development Environment Dependency** - Requires Node.js runtime and npm/npx on client machines
2. **No Containerized Deployment** - Cannot leverage Docker for consistent, isolated environments
3. **Limited Kubernetes Integration** - No native support for running in Kubernetes clusters
4. **Manual Configuration Management** - Secrets and configuration must be managed locally
5. **No Scalability Options** - Cannot scale horizontally or leverage Kubernetes orchestration features
6. **Production Deployment Gaps** - Lacks enterprise deployment patterns for production environments

### User Impact
- **Developers** struggle with local environment setup and dependency management
- **Platform Engineers** cannot integrate MCP into existing Kubernetes-based infrastructure
- **Enterprise Users** lack secure, scalable deployment options for production use
- **CI/CD Pipelines** cannot easily incorporate MCP functionality into automated workflows

## Solution Overview

Implement comprehensive containerization and Kubernetes deployment support through:

1. **Enhanced Docker Deployment** - Improve existing Docker images with comprehensive documentation
2. **Kubernetes Deployment Options** - Research and document multiple deployment patterns
3. **Helm Chart Automation** - Automated Helm chart builds and OCI registry storage
4. **Production-Ready Documentation** - Complete deployment guides for all supported methods

## Success Metrics

### Technical Success
- [x] Docker Compose setup working with MCP + Qdrant in <5 minutes
- [x] Docker Compose configurations for development and production
- [x] Configurable Docker images via environment variables
- [x] MCP client connection configuration working
- [ ] Docker MCP Catalog submission approved and listed (focus on MCP clients, not Gordon)
- [ ] Kubernetes deployment successful across chosen orchestration patterns
- [ ] Helm chart automated build and deployment via CI/CD
- [ ] All deployment methods documented with working examples

### User Success  
- [ ] 90% reduction in setup time for containerized deployments
- [ ] Support for enterprise Kubernetes environments (RBAC, security policies, etc.)
- [ ] Zero-dependency deployment (no local Node.js/npm required)
- [ ] Automated secret management and configuration templating

## Detailed Solution Design

### Phase 1: Enhanced Docker Support

#### 1.1 Docker Deployment Documentation
<!-- PRD-64 -->
**New Documentation Files:**
- `docs/docker-deployment-guide.md` - Complete Docker deployment guide
- Update `docs/mcp-setup.md` to make Docker primary deployment method (restructure to lead with Docker)
- Update main `README.md` with Docker deployment overview

**Docker Deployment Scenarios:**
- **Single Container**: MCP server only (external Qdrant)
- **Docker Compose**: MCP + Qdrant together
- **Docker Desktop Integration**: One-click deployment via Docker MCP Catalog
- **Gordon MCP Format**: `gordon-mcp.yml` configuration pattern alignment
- **Development Setup**: Hot-reload and debugging support
- **Production Setup**: Multi-stage builds, security hardening

#### 1.2 Docker Compose Configuration
**File:** `docker-compose.yml` (new)
- MCP server container with proper environment configuration
- Qdrant container with persistent storage
- Network configuration for service discovery
- Volume mounts for session persistence and configuration

**File:** `gordon-mcp.yml` (new)
- Docker's official MCP configuration format
- Aligned with Docker MCP Catalog patterns
- Docker Desktop integration compatibility
- Simplified deployment configuration

**File:** `docker-compose.dev.yml` (new)
- Development-focused overrides
- Source code mounting for development
- Debug port exposure
- Comprehensive logging

### Phase 2: Kubernetes Deployment Options Research & Implementation

#### 2.1 Kubernetes Orchestration Options Investigation
<!-- PRD-64 -->
**Research and evaluate the following approaches:**

**Option 1: Toolhive Operator**
- Purpose-built for MCP server deployments
- Enterprise security and operator-managed lifecycle
- Custom MCPServer CRD with built-in security profiles
- Pros: Security-first design, MCP-specific features, simplified management
- Cons: Additional operator dependency, newer ecosystem

**Option 2: Direct Kubernetes Manifests**
- Traditional StatefulSet + Service + ConfigMap + Secret approach
- Direct control over all Kubernetes resources
- Pros: No operator dependencies, full control, widely understood
- Cons: More complex configuration, manual security hardening required

**Option 3: Existing MCP Kubernetes Operators**
- `containers/kubernetes-mcp-server`: Kubernetes and OpenShift focused
- `alexei-led/k8s-mcp-server`: Multi-tool CLI operations (kubectl, helm, istioctl, argocd)
- `Flux159/mcp-server-kubernetes`: Cluster management operations
- Pros: Purpose-built for MCP, existing community solutions
- Cons: May not fit our specific use case, different feature sets

**Option 4: Sidecar Container Pattern**
- Deploy MCP as sidecar alongside application containers
- Shared lifecycle and networking with main application
- Pros: Co-location benefits, application-specific configuration
- Cons: Increased resource overhead per pod, complex networking

**Decision Criteria:**
- Ease of setup and maintenance
- Security and enterprise readiness
- Community adoption and support
- Compatibility with existing infrastructure

#### 2.2 Kubernetes Documentation Structure
<!-- PRD-64 -->
**New Documentation Files:**
- `docs/kubernetes-deployment-guide.md` - Master Kubernetes deployment guide
- Additional specific guides based on chosen deployment patterns

### Phase 3: Helm Chart Development

#### 3.1 Helm Chart Structure
**Directory:** `charts/dot-ai/` (new)
```
charts/dot-ai/
├── Chart.yaml              # Chart metadata and dependencies
├── values.yaml             # Default configuration values  
├── templates/
│   ├── deployment.yaml     # MCP server deployment
│   ├── service.yaml        # Service definition
│   ├── configmap.yaml      # Configuration management
│   ├── secret.yaml         # Secret templates
│   ├── ingress.yaml        # Optional ingress
│   ├── rbac.yaml           # RBAC configuration
│   └── qdrant/             # Qdrant sub-chart components
│       ├── deployment.yaml
│       ├── service.yaml  
│       └── pvc.yaml        # Persistent volume claim
├── crds/                   # Custom Resource Definitions (if needed)
└── tests/                  # Helm test templates
```

#### 3.2 Chart Configuration Strategy
**Deployment Mode Support:**
- Support chosen Kubernetes deployment pattern(s) from Phase 2 research
- Configurable Qdrant integration (bundled vs external)
- Security configuration templates
- Resource management and scaling options

#### 3.3 CI/CD Integration
**File:** `.github/workflows/ci.yml` (update existing)
- Build Helm chart on every release
- Package chart as OCI artifact
- Push to GHCR alongside Docker images
- Version alignment with Docker tags

**Helm OCI Registry Structure:**
```
ghcr.io/vfarcic/dot-ai-chart:0.1.4
ghcr.io/vfarcic/dot-ai-chart:latest
```

### Phase 4: Documentation and Examples

#### 4.1 Updated Documentation Architecture
<!-- PRD-64 -->
**Updated Files:**
- `README.md` - Add Docker and Kubernetes deployment sections  
- `docs/mcp-setup.md` - Restructure to make Docker primary deployment method (lead with Docker section)
- `docs/mcp-recommendation-guide.md` - Update for containerized environments

**Cross-Reference Updates:**
- All deployment guides reference each other appropriately
- Troubleshooting sections cover containerized deployments
- Security considerations for each deployment method

#### 4.2 Working Examples Repository
**Directory:** `examples/deployments/` (new)
```
examples/deployments/
├── docker/
│   ├── docker-compose.yml           # Basic setup
│   ├── docker-compose.prod.yml      # Production setup
│   └── .env.example                 # Environment template
├── kubernetes/
│   └── [specific directories based on chosen deployment patterns]
└── helm/
    ├── values.dev.yaml              # Development values
    ├── values.prod.yaml             # Production values
    └── [additional values files based on deployment patterns]
```

## Implementation Plan

### Milestone 1: Enhanced Docker Documentation and Examples
**Timeline:** 2 weeks  
**Status:** 🟢 Implementation Complete - Documentation Architecture Foundation Complete
**Deliverables:**
- [x] **Documentation Architecture Design** - Hub-and-spoke pattern implemented with `docs/setup/` directory structure
- [x] **Method Comparison Framework** - Comprehensive decision tree and comparison table completed  
- [x] **Docker Positioning Strategy** - Docker correctly positioned as recommended method (not quick trial)
- [x] **Setup Approach Simplification** - Removed dev Docker complexity, clarified to 3 methods (NPX, Docker, Development)
- [x] **Individual Setup Guides Creation** (following established documentation patterns):
  - [x] `docs/setup/docker-setup.md` - Comprehensive Docker deployment guide (pattern established)
  - [x] `docs/setup/npx-setup.md` - Complete NPX setup guide following Docker patterns
  - [x] `docs/setup/development-setup.md` - Development setup guide (apply Docker patterns)
- [x] Docker Compose configurations for development and production
- [x] MCP client connection configuration (`.mcp-docker.json`) with container lifecycle management
- [x] Configurable Docker images via environment variables
- [x] Multi-stage Docker builds for development workflow
- [x] kubectl CLI tool integration in containers
- [x] Host networking configuration for KinD cluster connectivity
- [x] Enhanced version tool with Kubernetes connectivity checking
- [ ] **Alternative MCP Registry Publications**
  - [ ] **Official ModelContextProtocol/servers Registry** (Anthropic-backed)
    - [ ] Create PR to add dot-ai reference in README.md (alphabetical order)
    - [ ] Ensure unique functionality and security best practices documentation
  - [ ] **PulseMCP Directory** (5,560+ servers, largest directory)
    - [ ] Submit via online form for directory inclusion
  - [ ] **MCP.so Community Platform** (Community engagement)
    - [ ] Submit via platform form or GitHub issue
- [x] **Tools and Features Overview Created** - Comprehensive `docs/mcp-tools-overview.md` serving as navigation hub for all available tools
- [x] **Documentation Cross-References Updated** - All setup guides and tool guides updated with consistent "See Also" sections
- [x] **Version References Corrected** - Fixed version pinning examples with actual published versions and added helpful links
- [ ] Updated `README.md` with Docker deployment overview
- [x] Restructured `docs/mcp-setup.md` as hub with method comparison and Docker as recommended method
- [x] All individual setup method guides created and linked from hub (3/3 complete: Docker ✅, NPX ✅, Development ✅)
- [ ] Working examples in `examples/deployments/docker/`

### Milestone 2: Kubernetes Deployment Research and Decision
**Timeline:** 2 weeks  
**Deliverables:**
- [ ] Complete evaluation of all Kubernetes deployment options
- [ ] Decision on primary deployment pattern(s) to support
- [ ] Technical feasibility analysis and architecture documentation
- [ ] Initial proof-of-concept implementations

### Milestone 3: Kubernetes Implementation and Documentation
**Timeline:** 3 weeks
**Deliverables:**
- [ ] `docs/kubernetes-deployment-guide.md` master guide
- [ ] Working Kubernetes manifests and/or operator configurations
- [ ] Security hardening and production readiness validation
- [ ] Complete examples in `examples/deployments/kubernetes/`

### Milestone 4: Helm Chart Development
**Timeline:** 3 weeks
**Deliverables:**
- [ ] Complete Helm chart supporting chosen deployment mode(s)
- [ ] Qdrant integration (bundled and external options)
- [ ] Helm chart automated build and OCI publishing in CI/CD
- [ ] Helm deployment examples and documentation

### Milestone 5: Integration and Documentation Finalization  
**Timeline:** 1 week
**Deliverables:**
- [ ] All documentation cross-references updated
- [ ] Complete end-to-end testing of all deployment methods
- [ ] Final documentation review and polish
- [ ] Release announcement and migration guides

## Technical Considerations

### Security Requirements
- **Secret Management**: Support for external secret management (Vault, AWS Secrets Manager, etc.)
- **RBAC**: Proper role-based access control for Kubernetes deployments
- **Network Policies**: Optional network segmentation and traffic control
- **Security Contexts**: Non-root containers, read-only root filesystem where possible

### Compatibility Matrix
- **Kubernetes Versions**: 1.24+ (current support matrix)
- **Container Runtimes**: Docker, containerd, CRI-O  
- **Architectures**: linux/amd64, linux/arm64 (already supported in Docker builds)
- **Cloud Providers**: AWS EKS, Google GKE, Azure AKS, on-premises

### Performance Considerations
- **Resource Limits**: Documented resource requirements for each deployment mode
- **Scaling**: Horizontal pod autoscaling considerations for high-traffic scenarios
- **Storage**: Persistent volume considerations for session data and Qdrant storage

## Success Criteria

### Documentation Quality
- [ ] All deployment methods have working examples
- [ ] Setup time reduced from 30+ minutes to <5 minutes for containerized deployments
- [ ] Zero external dependencies (Node.js/npm) required for deployment
- [ ] Complete troubleshooting guides for common deployment issues
- [ ] **MCP Workflow Alignment**: All documentation follows actual user workflow (no manual server commands)
- [ ] **Client-Centric Approach**: Documentation focuses on MCP client interaction patterns only
- [ ] **Diagnostic Consistency**: Primary troubleshooting uses `"Show dot-ai status"` command

### Feature Completeness  
- [ ] Docker Compose deployment working end-to-end
- [ ] Chosen Kubernetes deployment pattern(s) documented and tested
- [ ] Helm chart supports primary deployment scenarios
- [ ] CI/CD automatically builds and publishes Helm charts

### User Adoption
- [ ] Documentation feedback indicates improved setup experience
- [ ] GitHub issues related to deployment complexity are resolved
- [ ] Community adoption of containerized deployment methods

## Decision Log

### Decision: Integrate with Docker's Official MCP Ecosystem
**Date**: 2025-01-16  
**Decision**: Align Docker deployment approach with Docker's official MCP Catalog and Toolkit patterns  
**Rationale**: Docker provides official MCP support through MCP Catalog (100+ verified servers) and MCP Toolkit (one-click deployment). This provides enterprise validation, broader discoverability, and simplified user experience.  
**Impact**: 
- **Requirements**: Added Docker Desktop integration and Docker MCP Catalog submission
- **Implementation**: Added `gordon-mcp.yml` configuration and Docker Desktop documentation
- **Code**: No MCP server code changes required - existing implementation compatible
- **Timeline**: Minimal impact - leverages existing Docker approach
- **Risk**: Low - additive improvements with fallback to standard Docker Compose

**Owner**: Implementation Team

### Decision: Simplify Docker Compose for Development Use Case
**Date**: 2025-01-16  
**Decision**: Remove unnecessary complexity from Docker Compose configuration for development and testing use case  
**Rationale**: Docker Compose is primarily for development/testing, not production (Kubernetes handles production). Removing arbitrary resource limits, complex health checks, and unused environment variables improves usability and reduces maintenance overhead.  
**Impact**:
- **Requirements**: Removed production-oriented Docker Compose features
- **Implementation**: Simplified environment variables, removed resource constraints, fixed health checks
- **Code**: Working Docker Compose implementation with `docker-compose.yml` completed
- **Timeline**: Accelerated - reduced complexity speeds up implementation
- **Risk**: Low - focuses on primary use case without compromising functionality

**Owner**: Implementation Team

### Decision: Reject Gordon MCP Integration
**Date**: 2025-01-16  
**Decision**: Do not create `gordon-mcp.yml` configuration for Docker's Gordon AI assistant  
**Rationale**: Target audience mismatch - Gordon users are Docker-focused beginners/intermediates, while our MCP targets Kubernetes practitioners. The complexity gap and workflow mismatch would create poor user experience without clear value.  
**Impact**:
- **Requirements**: Removed Gordon integration from success metrics and deliverables
- **Scope**: Narrowed focus to MCP clients used by Kubernetes practitioners (Claude Code, Cursor)
- **Implementation**: Removed `gordon-mcp.yml` from Milestone 1 deliverables
- **Timeline**: Minor reduction - eliminates non-aligned work
- **Risk**: Low - focuses resources on aligned target audience

**Owner**: Implementation Team

### Decision: Make Docker Primary Deployment Method Over npx
**Date**: 2025-01-16  
**Decision**: Position Docker as the primary deployment method rather than alternative to npx  
**Rationale**: Docker provides superior isolation, consistency, and enterprise readiness compared to npx-based deployment. Users prefer containerized deployments for production and development environments.  
**Impact**:
- **Requirements**: Documentation architecture restructured to present Docker first
- **Implementation**: Update `docs/mcp-setup.md` to lead with Docker deployment section
- **Scope**: Docker becomes primary focus with comprehensive examples and troubleshooting
- **Timeline**: Documentation restructuring required in Milestone 1
- **Risk**: Low - improves user experience by leading with preferred deployment method

**Owner**: Implementation Team

### Decision: Container Lifecycle Management with MCP Protocol Compatibility  
**Date**: 2025-01-16  
**Decision**: Use `docker compose run --rm --remove-orphans` instead of `docker compose up --abort-on-container-exit`  
**Rationale**: MCP protocol requires direct stdin/stdout communication. `docker compose up` adds log prefixes (`dot-ai |`) that break MCP protocol communication, while `docker compose run` provides clean stdio interface required by MCP clients.  
**Impact**:
- **Requirements**: MCP client configuration must use `run` command for protocol compatibility
- **Implementation**: Updated `.mcp.json` and `.mcp-docker.json` with working configuration
- **Code**: Container cleanup handled by `--remove-orphans` flag
- **Timeline**: Resolved in current implementation session
- **Risk**: Low - maintains MCP functionality while providing container cleanup

**Owner**: Implementation Team

### Decision: Rename Docker Compose File to Avoid Project Conflicts
**Date**: 2025-08-16  
**Decision**: Rename `docker-compose.yml` to `docker-compose-dot-ai.yaml` and update MCP configuration to use `-f` flag  
**Rationale**: Users often have existing `docker-compose.yml` files in their projects for other purposes. Using a specific filename prevents conflicts and makes it clear the file is for dot-ai deployment.  
**Impact**:
- **Requirements**: Added requirement for non-conflicting file naming in setup process
- **Implementation**: File renamed and `.mcp-docker.json` updated with `-f docker-compose-dot-ai.yaml` flag
- **Code**: MCP client configuration now includes explicit file reference
- **User Experience**: Simplified setup instructions with clear file purpose
- **Timeline**: Immediate implementation - completed in current session
- **Risk**: Low - improves usability without compromising functionality

**Owner**: Implementation Team

### Decision: Simplify Docker Setup with Download Instructions Over Remote URLs
**Date**: 2025-08-16  
**Decision**: Provide curl-based download instructions instead of exploring complex remote Docker Compose URL approaches  
**Rationale**: Docker Compose cannot directly reference remote files via URL. Rather than using complex workarounds, simple curl download instructions provide clean, understandable setup for users.  
**Impact**:
- **Requirements**: Documentation must include clear download instructions using curl commands
- **Implementation**: Two-step setup process: download compose file, download MCP config
- **User Experience**: Standard developer workflow (curl download) that's familiar and reliable
- **Code**: No code changes required - leverages existing Docker infrastructure
- **Timeline**: Documentation update required in current milestone
- **Risk**: Low - follows standard community practices

**Owner**: Implementation Team

### Decision: Accelerate Docker MCP Catalog Submission to High Priority
**Date**: 2025-08-16  
**Decision**: Immediately prioritize Docker MCP Catalog submission using Docker-built tier for enhanced security and discoverability  
**Rationale**: With Docker infrastructure complete and tested, Docker MCP Catalog submission provides immediate high-value benefits: access to 20+ million developers, enhanced security with cryptographic signatures and SBOMs, and automatic maintenance by Docker. The submission process is well-defined and dot-ai meets all prerequisites.  
**Impact**:
- **Requirements**: Docker MCP Catalog submission moved from pending to active high-priority task
- **Implementation**: Use Docker-built tier for maximum security and trust (mcp/dot-ai namespace)
- **Process**: Fork docker/mcp-registry, use Task CLI wizard, generate server.yaml configuration
- **Timeline**: 24-hour turnaround after approval for catalog listing
- **Benefits**: Cryptographic signatures, provenance tracking, automatic security updates, broader discoverability
- **Prerequisites Met**: Docker image exists, Dockerfile ready, documentation comprehensive, license compatible

**Owner**: Implementation Team

### Decision: Comprehensive MCP Registry Publication Strategy
**Date**: 2025-08-16  
**Decision**: Target multiple high-value MCP registries for maximum discoverability and community reach  
**Rationale**: MCP ecosystem has rapidly expanded since November 2024 launch with multiple major registries emerging. Comprehensive publication strategy maximizes discoverability across developer communities while establishing dot-ai as a recognized Kubernetes deployment solution.  
**Impact**:
- **Requirements**: Multi-registry publication plan for broader market penetration
- **Target Registries**: Docker MCP Catalog (20M+ developers), Official ModelContextProtocol/servers, PulseMCP (5560+ servers), MCP.so community platform
- **Publication Benefits**: Official recognition, community engagement, enterprise discoverability, security validation
- **Timeline**: Parallel submissions after Docker MCP Catalog completion
- **Validation Strategy**: Each registry provides different audience and validation (enterprise, community, official)

**Owner**: Implementation Team

### Decision: Remove Docker MCP Catalog from Project Scope
**Date**: 2025-08-16  
**Decision**: Remove Docker MCP Catalog submission from PRD scope due to integration limitations  
**Rationale**: Research revealed Claude Code has documented timeout issues (120-second tool timeouts) with Docker MCP Gateway integration, while same functionality works in Claude Desktop. Integration problems make Docker MCP Catalog unsuitable for Claude Code users, which are our primary target audience.  
**Impact**:
- **Scope**: Docker MCP Catalog work removed from Milestone 1 deliverables
- **Focus**: Concentrate on alternative MCP registries (Official, PulseMCP, MCP.so) that work reliably with Claude Code
- **Resources**: Redirect effort to documentation creation and other registry submissions
- **Timeline**: Milestone 1 completion accelerated by removing blocked Docker MCP Catalog work
- **Future**: Can revisit when Claude Code + Docker Desktop integration issues are resolved

**Owner**: Implementation Team

### Decision: Hub-and-Spoke Documentation Architecture Pattern
**Date**: 2025-08-17  
**Decision**: Establish centralized hub documentation pattern with method-specific spokes for all setup documentation  
**Rationale**: Docker setup documentation revealed that duplicating common concepts (environment variables, troubleshooting, security) across method guides creates maintenance overhead and inconsistent user experience. Hub-and-spoke pattern provides single source of truth for shared concepts while allowing method-specific details.  
**Impact**:
- **Architecture**: `docs/mcp-setup.md` as hub, `docs/setup/[method]-setup.md` as spokes
- **Content Strategy**: Shared concepts (env vars, troubleshooting, security) centralized in hub
- **Method Guides**: Focus purely on method-specific setup steps and configurations
- **Maintenance**: Single update point for shared concepts, reduced duplication
- **User Experience**: Consistent guidance with clear method-specific instructions
- **Applied To**: All setup methods (NPX, Docker, Development) must follow this pattern

**Code Impact**: Documentation structure standardized across all setup methods
**Owner**: Implementation Team

### Decision: Environment Variable Management Centralization
**Date**: 2025-08-17  
**Decision**: Centralize generic `.env` file concepts and security practices in hub, keep only method-specific variables in individual setup guides  
**Rationale**: Environment variable management is universal across all setup methods. Docker guide initially duplicated `.env` creation, security practices, and usage patterns that apply equally to NPX and development setups. Centralization eliminates duplication and ensures consistency.  
**Impact**:
- **Hub Content**: Generic `.env` creation, security best practices, usage patterns
- **Method-Specific Content**: Only variables unique to that setup method (e.g., Docker image names)
- **Reference Pattern**: Individual guides reference hub for general `.env` guidance
- **Consistency**: All setup methods use same environment variable security practices
- **Applied To**: NPX and development setup guides must follow this centralization pattern

**Code Impact**: Documentation references standardized for environment variable management
**Owner**: Implementation Team

### Decision: MCP Client Workflow-Focused Documentation
**Date**: 2025-08-17  
**Decision**: Eliminate manual commands that users won't run in actual MCP client workflow from all setup documentation  
**Rationale**: Docker documentation initially included manual Docker Compose commands (service management, health checks, performance monitoring) that users never run because MCP clients handle container lifecycle automatically. This pattern applies to all setup methods.  
**Impact**:
- **Content Focus**: Document only commands users actually run in MCP workflow
- **Elimination Strategy**: Remove manual service management, debugging, and diagnostic commands
- **MCP Client Integration**: Focus on MCP configuration and client-based diagnostics (`"Show dot-ai status"`)
- **Applied To**: NPX setup should not include manual npm/node commands users won't run
- **Applied To**: Development setup should focus on contributor workflow, not user workflow
- **User Experience**: Documentation matches actual usage patterns

**Code Impact**: All setup guides must align with MCP client interaction patterns
**Owner**: Implementation Team

### Decision: Centralized Troubleshooting with Status Tool Priority
**Date**: 2025-08-17  
**Decision**: Establish `"Show dot-ai status"` as primary diagnostic approach across all setup methods, centralize generic troubleshooting in hub  
**Rationale**: Docker documentation initially duplicated troubleshooting guidance that applies universally (connection issues, environment variables, basic diagnostics). The version tool provides comprehensive diagnostics that work regardless of setup method.  
**Impact**:
- **Primary Diagnostic**: `"Show dot-ai status"` command established as first troubleshooting step
- **Hub Troubleshooting**: Generic issues (API keys, connectivity) documented centrally
- **Method-Specific**: Only setup-method-specific issues documented in individual guides
- **Tool Integration**: Version tool provides consistent diagnostics across all deployment methods
- **Applied To**: NPX and development guides should reference hub troubleshooting
- **User Experience**: Consistent diagnostic approach regardless of setup method

**Code Impact**: Troubleshooting approach standardized across all documentation
**Owner**: Implementation Team

### Decision: Content Deduplication and Reference Strategy
**Date**: 2025-08-17  
**Decision**: Establish strict deduplication strategy where individual setup guides reference hub content instead of repeating information  
**Rationale**: Docker guide initially repeated MCP client configuration, Next Steps, Security Considerations, and other content already covered elsewhere. This creates maintenance overhead and version drift between duplicated sections.  
**Impact**:
- **Reference Pattern**: "See [Section](../hub-guide.md#section)" instead of content duplication
- **Hub Expansion**: Hub contains all shared concepts (security, next steps, client integration)
- **Method Focus**: Individual guides focus purely on setup mechanics specific to that method
- **Maintenance Efficiency**: Single update point for shared concepts
- **Applied To**: NPX and development guides must follow same reference strategy
- **Quality Control**: No content should appear in multiple places unless method-specific

**Code Impact**: Documentation cross-referencing standardized to prevent duplication
**Owner**: Implementation Team

### Work Log

#### 2025-01-16: Docker Infrastructure Implementation Complete
**Duration**: ~8 hours (comprehensive implementation session)
**Commits**: Multiple commits with Docker deployment infrastructure
**Primary Focus**: Complete Docker containerization with MCP client connectivity and Kubernetes integration

**Core Implementation Achievements**:
- [x] **Working Docker Compose Setup** - Evidence: `docker-compose.yml` successfully tested with Claude Code
- [x] **Development Docker Environment** - Evidence: `docker-compose.dev.yml` with multi-stage builds (`Dockerfile.dev`)
- [x] **MCP Client Connectivity** - Evidence: `.mcp-docker.json` and `.mcp-dev.json` configurations working
- [x] **Container Environment Configuration** - Evidence: `${DOT_AI_IMAGE}`, `${QDRANT_IMAGE}` variables working
- [x] **Kubernetes Integration** - Evidence: `KUBECONFIG` mounting and host networking for KinD clusters
- [x] **CLI Tool Management** - Evidence: kubectl installed in both production and development containers

**Technical Problem Solving**:
- ✅ **Qdrant Health Check Issue**: Fixed using bash TCP approach instead of curl dependency
- ✅ **MCP Protocol Communication**: Resolved log prefix pollution with `docker compose run` approach
- ✅ **Container Lifecycle Management**: Implemented `--remove-orphans` for proper cleanup
- ✅ **KinD Cluster Connectivity**: Added `network_mode: "host"` for localhost cluster access
- ✅ **Missing Runtime Dependencies**: Added kubectl to containers, confirmed no other CLIs needed
- ✅ **Development Build Process**: Created proper multi-stage build mirroring npm package structure

**Enhanced Infrastructure**:
- [x] **Version Tool Enhancement** - Evidence: `src/tools/version.ts:getKubernetesStatus()` with cluster connectivity checking
- [x] **Docker Build Context Optimization** - Evidence: `.dockerignore` preventing KinD storage issues
- [x] **Container Architecture Alignment** - Evidence: Both dev and production images have identical CLI tools

**Validated Strategic Decisions**:
- ✅ **Docker Compose Simplification**: Removing production complexity improved development usability
- ✅ **Gordon MCP Rejection**: Focus on Kubernetes practitioners confirmed as correct approach
- ✅ **Standard Environment Variables**: `KUBECONFIG` pattern works seamlessly across environments
- ✅ **Docker as Primary Method**: Container approach superior to npx for target users

**Next Phase Priorities**:
- 📝 **Documentation Creation**: Docker deployment guide, README updates, mcp-setup restructuring
- 🔬 **Kubernetes Research**: Evaluate deployment patterns (Toolhive, native manifests, operators)
- ⚙️ **Examples Repository**: Create working examples in `examples/deployments/`

#### 2025-01-16: Milestone 1 Implementation Complete - Docker Deployment Working
**Duration**: ~6 hours (across implementation session)
**Commits**: Multiple commits with Docker Compose implementation and testing
**Primary Focus**: Docker containerization with MCP client connectivity

**Completed PRD Items**:
- [x] Docker Compose setup with MCP + Qdrant - Evidence: Working deployment tested with Claude Code
- [x] Configurable images via environment variables - Evidence: `${DOT_AI_IMAGE}` and `${QDRANT_IMAGE}` 
- [x] Standard Kubernetes environment patterns - Evidence: `KUBECONFIG` mounting working
- [x] Client connectivity mechanism - Evidence: `.mcp-docker.json` tested successfully

**Technical Achievements**:
- Resolved Qdrant health check using bash TCP approach (no curl dependency)
- Implemented consistent naming across all components (`dot-ai` service name)
- Validated container-to-container networking and volume mounting
- Confirmed MCP server starts successfully and connects to Qdrant

**Strategic Decisions Validated**:
- ✅ Docker Compose simplification - Removing complexity worked perfectly
- ✅ Rejecting Gordon MCP integration - Focus on Kubernetes practitioners confirmed
- ✅ Standard environment variables - `KUBECONFIG` pattern works seamlessly

**Next Session Priorities**:
- Create documentation for Docker deployment (`.env.example`, deployment guide)
- Research and decide on Kubernetes deployment patterns (Milestone 2)

#### 2025-08-16: Docker Setup Simplification and Conflict Resolution
**Duration**: ~1 hour (focused file management and user experience improvements)
**Commits**: Docker Compose file renaming and MCP configuration updates
**Primary Focus**: Eliminate setup conflicts and simplify user experience

**Setup Simplification Achievements**:
- [x] **File Conflict Resolution** - Evidence: Renamed to `docker-compose-dot-ai.yaml` to avoid project conflicts
- [x] **MCP Configuration Update** - Evidence: Updated `.mcp-docker.json` with `-f` flag for explicit file reference
- [x] **Download Instructions Created** - Evidence: Simple two-step curl commands for file download
- [x] **Configuration Validation** - Evidence: Tested compose file syntax and MCP command structure

**User Experience Improvements**:
- ✅ **Eliminated File Conflicts**: Users can now use dot-ai alongside existing Docker Compose projects
- ✅ **Clear File Purpose**: Naming makes it obvious which file is for dot-ai deployment
- ✅ **Standard Download Pattern**: Follows familiar curl-based setup workflows
- ✅ **Maintained Functionality**: All Docker deployment capabilities preserved

**Strategic Validation**:
- ✅ **Simple Over Complex**: Chose curl downloads over complex remote URL workarounds
- ✅ **Developer-Friendly**: Used standard patterns developers expect (curl, explicit filenames)
- ✅ **Conflict Avoidance**: Proactive approach to prevent common setup issues

**Docker MCP Catalog Research and Planning**:
- ✅ **Submission Requirements Research** - Evidence: Docker MCP Catalog process, requirements, and timeline documented
- ✅ **Prerequisites Assessment** - Evidence: Confirmed dot-ai meets all submission requirements (Docker image, Dockerfile, docs, license)
- ✅ **Strategic Decision Made** - Evidence: Docker-built tier chosen for maximum security and trust benefits
- ✅ **Action Plan Created** - Evidence: Detailed 6-step submission process with Task CLI workflow defined

**Strategic Validation**:
- ✅ **High-Value Opportunity**: Access to 20+ million developers with 24-hour turnaround
- ✅ **Security Enhancement**: Cryptographic signatures, SBOMs, provenance tracking via Docker-built tier
- ✅ **Maintenance Benefits**: Docker handles image building and security updates automatically
- ✅ **Prerequisites Met**: All technical requirements satisfied with existing Docker infrastructure

**Next Session Priorities**:
- **HIGH PRIORITY**: Execute Docker MCP Catalog submission (Task CLI setup → submission)
- Continue with Docker-first documentation creation (Milestone 1)
- Begin Kubernetes deployment pattern research (Milestone 2)

#### 2025-08-16: Documentation Architecture Foundation and Hub Restructuring
**Duration**: ~3 hours (documentation restructuring and architecture decisions)
**Commits**: Documentation architecture improvements with hub-and-spoke pattern
**Primary Focus**: Complete documentation structure overhaul and method positioning

**Documentation Architecture Achievements**:
- [x] **Hub-and-Spoke Pattern Implemented** - Evidence: `docs/mcp-setup.md` restructured as central hub with method comparison
- [x] **Method Comparison Framework** - Evidence: Comprehensive decision tree and comparison table completed
- [x] **Docker Positioning Corrected** - Evidence: Docker positioned as recommended method (not "quick trial")
- [x] **Setup Approach Simplified** - Evidence: Removed `docker-compose.dev.yml` and `.mcp-dev.json`, clarified 3 methods
- [x] **Requirements Clarification** - Evidence: Qdrant positioned as required (not "advanced"), version tool as primary diagnostic

**Strategic Decisions Validated**:
- ✅ **Docker as Primary Method**: Positioned as recommended due to complete stack inclusion (Qdrant bundled)
- ✅ **Hub Documentation Pattern**: Central setup guide linking to method-specific detailed guides
- ✅ **Diagnostic-First Troubleshooting**: Version tool replaces generic troubleshooting documentation
- ✅ **MCP Client Agnostic**: Documentation clarified to work with any MCP client, not just Claude Code

**Critical Architecture Decision**: Documentation split into hub (method selection) + spokes (detailed setup) for better user experience and maintainability.

**Next Session Priorities**:
- **HIGH PRIORITY**: Create all individual setup guides (`docs/setup/docker-setup.md`, `npx-setup.md`, `development-setup.md`)
- Create Docker examples directory (`examples/deployments/docker/`)
- Update README.md with new documentation structure

#### 2025-08-16: Docker Infrastructure Completion and Scope Refinement
**Duration**: ~4 hours (Docker MCP Catalog research, testing, and strategic scope refinement)
**Commits**: 1 commit (PRD updates and strategic decisions)
**Primary Focus**: Complete Docker infrastructure validation and finalize project scope

**Docker MCP Catalog Research and Testing**:
- [x] **Docker MCP Catalog Process Mastery** - Evidence: Complete submission workflow researched and documented
- [x] **Task CLI Integration** - Evidence: go-task@3.44.1 installed via DevBox and working
- [x] **Repository Fork and Setup** - Evidence: docker/mcp-registry forked, cloned, and configured
- [x] **Server Configuration Creation** - Evidence: server.yaml generated using task wizard and optimized
- [x] **Local Build and Validation** - Evidence: `task build` and `task catalog` successful
- [x] **Docker Desktop Integration Testing** - Evidence: MCP Toolkit showing DevOps AI Toolkit with proper configuration

**Strategic Scope Decisions**:
- ✅ **Integration Issues Identified**: Claude Code has documented 120-second timeout issues with Docker MCP Gateway
- ✅ **Target Audience Alignment**: Claude Code users are primary audience, Docker Desktop integration unreliable
- ✅ **Scope Refinement**: Removed Docker MCP Catalog from deliverables to focus on working solutions
- ✅ **Alternative Strategy**: Prioritized ModelContextProtocol/servers, PulseMCP, and MCP.so registries

**Technical Achievements**:
- ✅ **Complete Docker Infrastructure**: All 5 core Docker implementation items validated and working
- ✅ **File Management Optimization**: Resolved project conflicts with `docker-compose-dot-ai.yaml` naming
- ✅ **MCP Client Integration**: Validated `.mcp-docker.json` configuration works with Claude Code

**Next Session Priorities**:
- **HIGH PRIORITY**: Create comprehensive Docker documentation (`docs/docker-deployment-guide.md`)
- Update `README.md` with Docker deployment overview
- Restructure `docs/mcp-setup.md` to make Docker primary deployment method
- Create working examples in `examples/deployments/docker/`

#### 2025-08-17: Documentation Pattern Establishment and Docker Setup Guide Completion
**Duration**: ~3 hours (documentation pattern refinement and content optimization)
**Commits**: 1 commit (Docker setup guide completion and pattern establishment)
**Primary Focus**: Establish reusable documentation patterns and complete Docker setup guide

**Documentation Pattern Achievements**:
- [x] **Hub-and-Spoke Architecture Validated** - Evidence: Docker setup guide follows centralized pattern
- [x] **Environment Variable Centralization** - Evidence: Generic `.env` concepts moved to hub, Docker-specific variables kept in guide
- [x] **MCP Client Workflow Alignment** - Evidence: Removed all manual Docker commands users don't run
- [x] **Troubleshooting Centralization** - Evidence: Generic troubleshooting referenced from hub
- [x] **Content Deduplication Strategy** - Evidence: Eliminated repeated security, next steps, and integration content

**Strategic Pattern Establishment**:
- ✅ **Workflow-Focused Documentation**: Only document commands users actually run in MCP workflow
- ✅ **Reference Over Repetition**: Link to hub content instead of duplicating information
- ✅ **Method-Specific Focus**: Individual guides cover only setup mechanics unique to that method
- ✅ **Centralized Shared Concepts**: Environment variables, troubleshooting, security in hub
- ✅ **Primary Diagnostic Approach**: `"Show dot-ai status"` established as first troubleshooting step

**Docker Setup Guide Completion**:
- ✅ **Clean Architecture**: Quick Start → Configuration Reference → Advanced Configuration → References
- ✅ **MCP Integration**: Proper `--env-file .env` configuration for automatic environment loading
- ✅ **External Qdrant Support**: Clear instructions for removing bundled Qdrant and using external
- ✅ **Container Lifecycle Management**: MCP client handles all Docker operations automatically

**Established Patterns for NPX and Development Guides**:
- **Environment Variables**: Reference hub for `.env` concepts, document method-specific variables only
- **Troubleshooting**: Reference hub troubleshooting, document method-specific issues only
- **Security**: Reference hub security practices, document method-specific security considerations only
- **Client Integration**: Reference hub MCP client integration, show method-specific configuration only
- **Content Strategy**: Focus on setup mechanics, eliminate manual commands users won't run

#### 2025-08-17: NPX Setup Guide and Documentation Architecture Completion
**Duration**: ~3 hours (documentation creation and architecture refinement)
**Primary Focus**: Complete NPX setup guide and establish comprehensive documentation navigation

**Completed PRD Items**:
- [x] NPX Setup Guide Created - Evidence: `docs/setup/npx-setup.md` with MCP configuration, environment variables, Qdrant integration
- [x] Tools Overview Document - Evidence: `docs/mcp-tools-overview.md` serving as comprehensive tool index
- [x] Documentation Cross-References - Evidence: Updated 9 documentation files with consistent "See Also" sections  
- [x] Documentation Architecture - Evidence: Hub-and-spoke pattern, content deduplication, MCP workflow alignment
- [x] Version References Corrected - Evidence: Fixed npm package and container image versions with helpful discovery links

**Additional Work Done**:
- Fixed OpenAI API key documentation inconsistencies (marked as required vs optional)
- Corrected version pinning examples with actual published versions (0.69.0 npm, 0.68.0 container)
- Added helpful links to npm packages and GitHub container registry for version discovery
- Established reusable documentation patterns for future setup guides

**Next Session Priorities**:
- Update `README.md` with Docker deployment overview  
- Create `examples/deployments/` directory structure
- Consider MCP registry publication strategy

#### 2025-08-17: Development Setup Guide Completion and Documentation Architecture Finalization
**Duration**: ~3 hours (development guide creation and package.json refinement)
**Commits**: Implementation in progress (1 new file, 1 modified file)
**Primary Focus**: Complete all 3 setup method guides and finalize Milestone 1 documentation foundation

**Completed PRD Items**:
- [x] Development setup guide created following hub-and-spoke pattern - Evidence: `docs/setup/development-setup.md` with complete development workflow
- [x] All individual setup method guides created and linked from hub (3/3 complete) - Evidence: Docker, NPX, and Development guides all following consistent patterns
- [x] Individual Setup Guides Creation section - Evidence: All three method-specific guides completed

**Implementation Details**:
- Created comprehensive development setup guide with hot-reload workflow, testing integration, and contributor guidelines
- Established consistent documentation patterns across all setup methods (environment variables, troubleshooting, cross-references)
- Refined package.json scripts for better development experience (removed unhelpful pretest:watch hook)
- Validated MCP configuration patterns using relative paths matching existing `.mcp-node.json`
- Applied hub-and-spoke architecture with proper content deduplication and cross-referencing

**Documentation Architecture Achievements**:
- Complete 3-method setup approach: Docker (recommended), NPX (Node.js), Development (contributors)
- Consistent cross-reference patterns with centralized shared concepts (environment variables, troubleshooting, security)
- MCP client workflow alignment (no manual commands users don't run)
- Primary diagnostic approach established (`"Show dot-ai status"` as first troubleshooting step)

**Next Session Priorities**:
- **HIGH PRIORITY**: Update main README.md with Docker deployment overview
- Create working examples in `examples/deployments/docker/` directory
- Begin Kubernetes deployment research (Milestone 2)

## Risk Assessment

### Technical Risks
- **Kubernetes Pattern Selection**: Choosing deployment patterns that don't fit all user environments
  - *Mitigation*: Thorough research phase with community feedback before committing

- **Security Complexity**: Managing secrets and RBAC across multiple deployment methods
  - *Mitigation*: Comprehensive security documentation and tested examples

- **Version Synchronization**: Keeping Docker images, Helm charts, and npm packages aligned
  - *Mitigation*: Automated CI/CD with unified versioning strategy

### User Experience Risks  
- **Documentation Fragmentation**: Multiple deployment options may confuse users
  - *Mitigation*: Clear decision tree and recommended deployment paths

- **Complexity Creep**: Advanced Kubernetes features may overwhelm simple use cases
  - *Mitigation*: Progressive complexity model - simple examples first, advanced options clearly marked

## Reference Materials

### Experimental Toolhive Configuration
The following experimental configurations demonstrate a working Toolhive-based deployment and serve as reference for implementation decisions:

**MCPServer Configuration** (reference from experimental setup):
```yaml
apiVersion: toolhive.stacklok.dev/v1alpha1
kind: MCPServer
metadata:
  name: dot-ai
  namespace: toolhive-system
spec:
  image: ghcr.io/vfarcic/dot-ai:0.1.4
  env:
    - name: KUBECONFIG
      value: "/etc/kubeconfig/config"
  permissionProfile:
    type: builtin
    name: network
  podTemplateSpec:
    spec:
      containers:
        - name: mcp
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: dot-ai-secrets
                  key: anthropic-api-key
          volumeMounts:
            - name: kubeconfig
              mountPath: "/etc/kubeconfig"
              readOnly: true
            - name: sessions
              mountPath: "/app/sessions"
          resources:
            limits:
              cpu: 200m
              memory: 256Mi
            requests:
              cpu: 100m
              memory: 128Mi
      volumes:
        - name: kubeconfig
          secret:
            secretName: dot-ai-kubeconfig
        - name: sessions
          emptyDir: {}
```

**Key Patterns Demonstrated:**
- Secret management for API keys and kubeconfig
- Resource limits and requests
- Volume mounts for configuration and session persistence
- Security contexts and permission profiles
- Ingress configuration for external access

*Note: These configurations are experimental reference material. Final implementation may differ based on Phase 2 research and architectural decisions.*

## Future Considerations

### Advanced Features (Out of Scope)
- **Multi-cluster Deployments**: Cross-cluster MCP orchestration
- **Advanced Monitoring**: Prometheus/Grafana integration for MCP metrics
- **Auto-scaling**: Advanced scaling based on MCP server usage patterns
- **Service Mesh Integration**: Istio/Linkerd integration for advanced networking

### Maintenance Strategy
- **Automated Testing**: CI/CD testing of all deployment methods
- **Version Compatibility**: Maintain compatibility matrix as Kubernetes evolves  
- **Community Support**: Enable community contributions for additional deployment patterns

---

**Implementation Status**: Phase 1 Complete - Docker Infrastructure Working ✅  
**Current Phase**: Phase 1 Documentation + Phase 2 Kubernetes Research  
**Priority**: High  
**Dependencies**: Docker images already exist, CI/CD pipeline already builds images  
**Owner**: Implementation Team