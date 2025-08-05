# PRD: Extend Solution Support Beyond Applications

**Created**: 2025-07-28
**Status**: Complete
**Owner**: Viktor Farcic
**Last Updated**: 2025-08-05
**Completed**: 2025-08-05

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
- [x] **Tool Description Updates**: Remove application-focused bias from MCP tool descriptions ✅ **COMPLETE**
- [x] **Prompt Enhancement**: Add infrastructure examples to existing AI prompts ✅ **COMPLETE**
- [~] **Documentation Clarity**: Update existing docs to highlight infrastructure deployment capability ⚠️ **MOVED TO PRD #45**
- [~] **Validation Testing**: Verify system works with infrastructure use cases (databases, operators, networking) ⚠️ **MOVED TO PRD #45**

### Success Criteria
- [x] **Resource coverage**: Support for major Kubernetes resource types beyond applications ✅ **COMPLETE - Architecture already generic**
- [~] **Recommendation quality**: Accurate infrastructure recommendations based on cluster capabilities ⚠️ **REQUIRES PRDs #43/#44**
- [~] **Deployment success**: Successful deployment of infrastructure resources with proper configuration ⚠️ **MOVED TO PRD #45**

## Implementation Progress

### Phase 1: Core Technical Updates [Status: ✅ COMPLETE]
**Target**: Enable infrastructure deployment capabilities at the technical level

**Technical Changes (COMPLETE):**
- [x] **`src/tools/recommend.ts`**: Update MCP tool descriptions to remove application bias ✅
- [x] **`prompts/intent-validation.md`**: Add infrastructure examples alongside application examples ✅
- [x] **`prompts/resource-selection.md`**: Enhance with database, networking, operator examples ✅

**Moved to PRD #45 (Infrastructure Documentation):**
- [~] **`docs/mcp-guide.md`**: Document infrastructure deployment examples using existing tools → **PRD #45**
- [~] **`README.md`**: Clarify that infrastructure deployment is already supported → **PRD #45**

**Validation Tasks (Moved to PRD #45):**
- [~] Test PostgreSQL database deployment recommendation → **PRD #45**
- [~] Test Redis cache deployment recommendation → **PRD #45**
- [~] Test Ingress controller deployment recommendation → **PRD #45**
- [~] Test monitoring operator deployment recommendation → **PRD #45**
- [~] Document successful infrastructure deployment examples → **PRD #45**

## Work Log

### 2025-08-05: Strategic Completion - Documentation Work Moved to PRD #45
**Decision**: Complete PRD #19 with core technical improvements and move remaining documentation work to PRD #45.
**Rationale**: During implementation, discovered that recommendation engine needs enhancement (PRDs #43/#44) before documentation can be accurate. Rather than document suboptimal experiences, moved user-facing work to PRD #45 which depends on enhanced recommendation engine.
**Outcome**: 
- ✅ **Core technical work complete**: Tool descriptions and AI prompts enhanced for infrastructure
- 📋 **Documentation work strategically moved**: PRD #45 will provide complete user experience once recommendations are optimized
- 🎯 **Clear dependency path**: PRD #43 → PRD #44 → PRD #45 for complete infrastructure deployment experience
**Owner**: Viktor Farcic
**Status**: Strategic completion - foundational work done, user experience work properly sequenced

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