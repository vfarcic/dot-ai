# PRD: Extend Solution Support Beyond Applications

**Created**: 2025-07-28
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-08-04

## Executive Summary
Update dot-ai's presentation and examples to clearly communicate its existing capability to recommend and deploy infrastructure resources, operators, networking, storage, and other Kubernetes resources beyond application deployments.

**Key Insight**: Code analysis revealed the system is already architecturally generic and can handle any Kubernetes resource type. The limitation is in application-focused messaging and examples, not core functionality.

## Documentation Changes

### Files Created/Updated
- **`src/tools/recommend.ts`** - Updated - Remove application-focused bias in tool descriptions
- **`prompts/*.md`** - Updated - Add infrastructure examples and broader terminology
- **`docs/mcp-guide.md`** - Updated - Add infrastructure deployment examples to existing MCP tools
- **`README.md`** - Updated - Clarify infrastructure deployment capability in existing features
- **Testing validation** - New - Verify system works with infrastructure use cases

### Content Location Map
- **Tool Descriptions**: See `src/tools/recommend.ts` (Updated tool descriptions)
- **Prompt Examples**: See `prompts/` directory (Enhanced with infrastructure examples)
- **MCP Documentation**: See `docs/mcp-guide.md` (Infrastructure examples added to existing tools)
- **Capability Overview**: See `README.md` (Updated to clarify existing infrastructure support)
- **Validation Examples**: See test cases demonstrating infrastructure deployments

### User Journey Validation
- [ ] **Primary workflow** documented end-to-end: Describe infrastructure need → Get recommendations → Deploy resources
- [ ] **Secondary workflows** have complete coverage: Networking, storage, operator deployment
- [ ] **Cross-references** between app deployment and infrastructure deployment docs work correctly
- [ ] **Examples and commands** are testable via automated validation

## Implementation Requirements
- [ ] **Tool Description Updates**: Remove application-focused bias from MCP tool descriptions
- [ ] **Prompt Enhancement**: Add infrastructure examples to existing AI prompts
- [ ] **Documentation Clarity**: Update existing docs to highlight infrastructure deployment capability
- [ ] **Validation Testing**: Verify system works with infrastructure use cases (databases, operators, networking)

### Success Criteria
- [ ] **Resource coverage**: Support for major Kubernetes resource types beyond applications
- [ ] **Recommendation quality**: Accurate infrastructure recommendations based on cluster capabilities
- [ ] **Deployment success**: Successful deployment of infrastructure resources with proper configuration

## Implementation Progress

### Phase 1: Presentation Updates [Status: ⏳ PENDING]
**Target**: Clear communication of existing infrastructure deployment capabilities

**Documentation Changes:**
- [x] **`src/tools/recommend.ts`**: Update MCP tool descriptions to remove application bias
- [ ] **`prompts/intent-validation.md`**: Add infrastructure examples alongside application examples
- [ ] **`prompts/resource-selection.md`**: Enhance with database, networking, operator examples
- [ ] **`docs/mcp-guide.md`**: Document infrastructure deployment examples using existing tools
- [ ] **`README.md`**: Clarify that infrastructure deployment is already supported

**Validation Tasks:**
- [ ] Test PostgreSQL database deployment recommendation
- [ ] Test Redis cache deployment recommendation
- [ ] Test Ingress controller deployment recommendation
- [ ] Test monitoring operator deployment recommendation
- [ ] Document successful infrastructure deployment examples

## Work Log

### 2025-08-04: Major Strategic Decision - Architectural Simplification
**Decision**: After code analysis, determined the system is already architecturally generic and can handle infrastructure deployments. The issue is presentation/examples, not core functionality.
**Impact**: Simplified implementation from building new systems to updating existing prompts and descriptions.
**Evidence**: Core engine works with any Kubernetes resource type, discovery finds all resources, AI matching uses actual schemas.

### 2025-07-28: PRD Refactoring to Documentation-First Format
**Completed Work**: Refactored PRD #19 to follow new documentation-first guidelines with comprehensive infrastructure deployment features.

## Decision Log

### Decision #1: Architectural Simplification (2025-08-04)
**Decision**: Leverage existing generic architecture instead of building new core functionality
**Rationale**: Code analysis revealed that dot-ai is already architecturally generic:
- Core engine uses `kubectl explain` for ANY resource type
- Discovery finds ALL cluster resources (standard + CRDs)
- AI matching works against actual resource schemas, not predefined categories
- Examples already include infrastructure: "database cluster", "monitoring stack", "load balancer"
**Impact**: 
- **Scope**: Reduced from building new systems to updating existing presentation
- **Timeline**: Significantly faster implementation
- **Risk**: Lower risk since no architectural changes needed
- **Implementation**: Simple prompt/description updates vs. complex 3-phase development
**Owner**: Viktor Farcic
**Status**: Approved

---

## Appendix

### Resource Types Already Supported (Architecture Analysis)
**The system can already recommend and deploy these resource types:**
- **Networking**: Ingress, Service, NetworkPolicy, EndpointSlice
- **Storage**: PersistentVolumeClaim, StorageClass, Volume configurations  
- **Security**: RBAC roles, ServiceAccount, PodSecurityPolicy
- **Configuration**: ConfigMap, Secret management patterns
- **Operators**: Helm charts, Custom operators, CRD deployments
- **Databases**: PostgreSQL operators, MongoDB, Redis, MySQL
- **Monitoring**: Prometheus, Grafana, AlertManager operators
- **Any Custom Resources**: Automatically discovered via `kubectl api-resources`

**What's needed**: Update prompts and examples to communicate this existing capability clearly to users.