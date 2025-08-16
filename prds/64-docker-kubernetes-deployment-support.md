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
- [ ] Docker Compose setup working with MCP + Qdrant in <5 minutes
- [ ] Docker Desktop one-click deployment integration
- [ ] Docker MCP Catalog submission approved and listed
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
- Update `docs/mcp-setup.md` with Docker alternatives
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
- `docs/mcp-setup.md` - Include Docker and Kubernetes alternatives
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
**Deliverables:**
- [ ] `docs/docker-deployment-guide.md` with comprehensive Docker deployment instructions
- [ ] Docker Compose configurations for development and production
- [ ] `gordon-mcp.yml` configuration aligned with Docker's official MCP patterns
- [ ] Docker Desktop integration documentation and testing
- [ ] Docker MCP Catalog submission preparation
- [ ] Updated `README.md` with Docker deployment overview
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

**Implementation Status**: Not Started  
**Priority**: High  
**Dependencies**: Docker images already exist, CI/CD pipeline already builds images  
**Owner**: TBD