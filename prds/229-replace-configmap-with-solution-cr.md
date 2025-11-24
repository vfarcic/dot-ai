# PRD: Replace ConfigMap with Solution CR in Recommend Tool

**Created**: 2025-11-23
**Status**: In Progress (Milestone 1 Complete)
**Owner**: TBD
**Last Updated**: 2025-11-24
**Issue**: #229
**Priority**: High

## Executive Summary

Replace ConfigMap-based solution storage in the `recommend` tool with Solution Custom Resource (CR) generation, enabling persistent tracking, health monitoring, and lifecycle management through the Solution controller from dot-ai-controller.

**✅ PREREQUISITE COMPLETE**: dot-ai-controller Solution CRD implementation is complete. Ready to begin implementation.

## Problem Statement

### Current Challenges
- **Ephemeral Storage**: ConfigMaps provide temporary, session-based solution storage
- **No Lifecycle Management**: ConfigMaps don't track resource health or deployment state
- **Limited Metadata**: ConfigMaps can't capture rich context (rationale, patterns, policies)
- **No Controller Integration**: ConfigMaps aren't managed by controllers for automated operations
- **Blocks Future Features**: PRD #228 (documentation & learning) requires CRD infrastructure

### User Impact
- **Lost Context**: Solution information disappears when sessions end
- **No Health Tracking**: Users can't see if deployed solutions are healthy
- **Manual Cleanup**: No automatic garbage collection when solutions are deleted
- **Inconsistent State**: No single source of truth for deployment state

## Goals

### Primary Goals

1. **Replace ConfigMap with Solution CR Generation**
   - Generate Solution CR manifest alongside application manifests
   - Include all required metadata (intent, resources, context)
   - Maintain current user workflow (save locally or apply via MCP)

2. **Remove ConfigMap Storage Completely**
   - Clean removal of all ConfigMap-related code
   - No migration path needed (clean break)
   - Simplify codebase by removing legacy storage

3. **Enable Persistent Tracking**
   - Solution CRs persist beyond session lifecycle
   - Controller tracks resource health automatically
   - Users can query solution state at any time

4. **Maintain Workflow Consistency**
   - User experience remains the same
   - Generate all manifests together (including Solution CR)
   - User chooses to save locally or apply via MCP
   - Solution CR works whether created before or after application resources

5. **Comprehensive Testing**
   - Integration tests verify Solution CR generation
   - Tests validate controller picks up and tracks resources
   - Health status validation in test suite

## Solution Overview

### High-Level Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Completes Recommendation Workflow                   │
│    - Provides intent                                        │
│    - Answers configuration questions                       │
│    - Chooses solution                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 2. Generate Manifests (INCLUDING Solution CR)               │
│    - Application manifests (Deployments, Services, etc.)    │
│    - Solution CR manifest with:                             │
│      * spec.intent: User's original intent                  │
│      * spec.resources[]: List of deployed resources         │
│      * spec.context: Rationale, patterns, policies          │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 3. User Chooses Deployment Method                           │
│    Option A: Save manifests to local filesystem             │
│    Option B: Let MCP apply manifests to cluster             │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ 4. Solution Controller Takes Over                           │
│    - Discovers resources listed in Solution CR              │
│    - Adds ownerReferences for garbage collection            │
│    - Monitors resource health                               │
│    - Updates Solution status continuously                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Changes

**Before (ConfigMap Approach)**:
```typescript
// Generate manifests
const manifests = generateKubernetesManifests(solution);

// Store in ConfigMap
await createConfigMap({
  name: `solution-${solutionId}`,
  data: {
    intent: solution.intent,
    manifests: JSON.stringify(manifests)
  }
});

return { manifests, solutionId };
```

**After (Solution CR Approach)**:
```typescript
// Generate application manifests
const manifests = generateKubernetesManifests(solution);

// Generate Solution CR manifest
const solutionCR = {
  apiVersion: 'dot-ai.io/v1alpha1',
  kind: 'Solution',
  metadata: {
    name: `solution-${solutionId}`,
    namespace: solution.namespace
  },
  spec: {
    intent: solution.intent,
    resources: extractResourceReferences(manifests),
    context: {
      createdBy: 'dot-ai-mcp',
      rationale: solution.rationale,
      patterns: solution.patterns,
      policies: solution.policies
    }
  }
};

// Return all manifests together
return {
  manifests: [...manifests, solutionCR],
  solutionId
};
```

## Requirements

### Functional Requirements

1. **Solution CR Generation**
   - Generate valid Solution CR manifest from solution data
   - Extract resource references (apiVersion, kind, name, namespace) from manifests
   - Populate spec.intent with user's original intent
   - Populate spec.context with rationale, patterns, policies
   - Generate unique solution name/ID

2. **ConfigMap Removal**
   - Remove all ConfigMap creation code from recommend tool
   - Remove ConfigMap storage utilities
   - Clean up imports and dependencies
   - No backward compatibility needed

3. **CRD Availability Detection**
   - Check if Solution CRD is available in cluster
   - Cache check result globally (check once, reuse result)
   - Skip Solution CR generation if CRD not available
   - Modify AI prompts based on CRD availability:
     - Remove Solution CR instructions from prompts if CRD unavailable
     - Include Solution CR instructions if CRD available
   - Graceful degradation (tool works without controller)

4. **Manifest Output**
   - Return Solution CR as part of manifest array (if CRD available)
   - Maintain YAML formatting consistency
   - Support both local save and MCP apply workflows
   - Solution CR conditionally included based on CRD availability

5. **Integration Testing**
   - Test Solution CR is generated correctly
   - Test CR includes all required fields
   - Test resource references are accurate
   - Test controller picks up and tracks resources
   - Test health status is properly reflected

### Non-Functional Requirements

- **Compatibility**: Works with dot-ai-controller Solution CRD v1alpha1
- **Performance**: No performance degradation from ConfigMap approach
- **Reliability**: Manifest generation never fails due to CR creation
- **Maintainability**: Clean code without ConfigMap legacy
- **Documentation**: Clear examples of Solution CR structure

## Dependencies

### Prerequisites (COMPLETE)
- **dot-ai-controller Solution CRD**: ✅ **COMPLETE**
  - Provides Solution CRD schema
  - Implements Solution controller
  - Available in dot-ai-controller repository

### Integration Points
- **Recommend tool**: Core manifest generation logic
- **MCP server**: Manifest deployment functionality
- **Integration tests**: Test framework for validation
- **Documentation**: User-facing guides and examples

### Dependent PRDs (UNBLOCKED BY THIS PRD)
- **PRD #228**: Deployment Documentation & Example-Based Learning
  - Requires Solution CR infrastructure to be in place
  - Builds on Solution CR with documentation references
  - Cannot begin until this PRD is complete

## Implementation Milestones

**✅ READY TO START**: dot-ai-controller is complete. All milestones are now unblocked.

### Milestone 1: Helm Chart Integration & Controller Deployment ✅
**Goal**: Ensure dot-ai-controller is operational and dot-ai deployment tracked by Solution CR

**Success Criteria:**
- dot-ai Helm chart includes dot-ai-controller as dependency
- Controller CRD and deployment available in test clusters
- Solution CR created by dot-ai chart that tracks all chart resources
- Solution CR lists all resources deployed by dot-ai chart (MCP server, services, etc.)
- Controller establishes Solution CR as parent of all dot-ai resources
- Controller operational and ready for testing
- Integration test setup includes controller

**Implementation Tasks:**
- Add dot-ai-controller chart as Helm dependency in charts/dot-ai/Chart.yaml
- Configure dependency version and repository location
- Create Solution CR template in charts/dot-ai/templates/solution.yaml
- Populate Solution CR spec.resources with all chart-deployed resources:
  - MCP server Deployment
  - Services
  - ConfigMaps
  - Any other resources deployed by the chart
- Configure Solution CR spec.intent describing dot-ai MCP deployment
- Configure Solution CR spec.context with deployment metadata
- Update integration test setup to deploy controller
- Verify controller establishes parent-child relationships
- Verify Solution CR status reflects dot-ai deployment health
- Test CRD is available and accessible

**Estimated Duration**: TBD during planning

**Rationale**:
1. Controller must be operational before we can test Solution CR generation
2. Dogfooding: dot-ai's own deployment should be tracked by Solution CR
3. Provides real production example of Solution CR usage
4. Demonstrates parent-child resource relationships in practice
5. Ensures infrastructure is in place for subsequent milestones

### Milestone 2: Solution CR Generation ⬜
**Goal**: Generate valid Solution CR manifests in recommend tool

**Success Criteria:**
- CRD availability check implemented with global caching
- Solution CR generated from solution data (when CRD available)
- All required fields populated (intent, resources, context)
- Resource references extracted from manifests accurately
- CR included in manifest output array (when CRD available)
- YAML formatting is correct and valid
- Graceful degradation when CRD unavailable
- AI prompts dynamically adjusted based on CRD availability

**Implementation Tasks:**
- Implement CRD availability check utility:
  - Check for `solutions.dot-ai.io` CRD in cluster
  - Cache result in global variable (e.g., singleton or module-level cache)
  - Return cached result on subsequent calls
- Create Solution CR generation utility function
- Implement resource reference extraction logic
- Add conditional Solution CR to manifest generation pipeline:
  - Check CRD availability before generating
  - Skip Solution CR generation if CRD unavailable
- Implement dynamic AI prompt modification:
  - Load base prompt template
  - Conditionally include/exclude Solution CR instructions
  - Pass modified prompt to AI based on CRD availability
- Validate CR schema against CRD definition
- Handle namespace scoping correctly

**Estimated Duration**: TBD during planning

### Milestone 3: ConfigMap Removal ⬜
**Goal**: Complete removal of ConfigMap storage code

**Success Criteria:**
- All ConfigMap creation code removed
- No references to ConfigMap storage utilities
- Build passes without ConfigMap dependencies
- No ConfigMap-related code in recommend tool
- Codebase simplified and cleaner

**Implementation Tasks:**
- Remove ConfigMap creation functions
- Remove ConfigMap storage utilities
- Clean up imports and dependencies
- Remove ConfigMap-related constants/types
- Update any affected code paths

**Estimated Duration**: TBD during planning

### Milestone 4: Integration Testing ⬜
**Goal**: Comprehensive test coverage for Solution CR integration

**Success Criteria:**
- Integration tests verify Solution CR generation (when CRD available)
- Integration tests verify graceful degradation (when CRD unavailable)
- Tests validate CR structure and content
- Tests confirm controller picks up CR
- Health status validation working
- CRD availability check caching validated
- AI prompt modification tested for both scenarios
- All integration tests passing

**Implementation Tasks:**
- Write integration test for CRD availability check and caching:
  - Test first check queries cluster
  - Test subsequent checks use cached result
  - Test behavior with CRD present
  - Test behavior with CRD absent
- Write integration test for Solution CR generation (CRD available)
- Write integration test for workflow without CRD (graceful degradation)
- Test resource reference extraction accuracy
- Test controller integration (CR → resource tracking)
- Test health status updates
- Test AI prompt includes/excludes Solution CR instructions correctly
- Test deployment workflow end-to-end (both scenarios)

**Estimated Duration**: TBD during planning

### Milestone 5: Documentation Updates ⬜
**Goal**: User-facing documentation reflects Solution CR approach

**Success Criteria:**
- docs/mcp-guide.md updated with Solution CR examples
- README.md updated to mention persistent tracking
- Example manifests include Solution CR
- User workflow documentation is accurate
- Migration notes explain changes (if needed)

**Implementation Tasks:**
- Update MCP tool documentation
- Add Solution CR examples to guides
- Update README with new capabilities
- Create example Solution CR manifests
- Document user-facing changes

**Estimated Duration**: TBD during planning

### Milestone 6: Feature Complete and Validated ⬜
**Goal**: Solution CR integration production-ready

**Success Criteria:**
- All tests passing (unit + integration)
- Documentation complete and reviewed
- Code reviewed and approved
- Feature tested with real deployments
- Ready for production use

**Implementation Tasks:**
- Run full test suite
- Perform end-to-end testing with real cluster
- Code review and approval
- Documentation review
- Performance validation

**Estimated Duration**: TBD during planning

## Success Criteria

- [ ] **Solution CR Generation**: Valid Solution CRs generated for all deployments
- [ ] **ConfigMap Removed**: No ConfigMap code remains in recommend tool
- [ ] **Persistent Tracking**: Solutions persist and are tracked by controller
- [ ] **Health Monitoring**: Solution status reflects resource health
- [ ] **Tests Passing**: All integration tests validate Solution CR functionality
- [ ] **Documentation Complete**: Users understand Solution CR approach
- [ ] **Workflow Maintained**: User experience remains consistent
- [ ] **PRD #228 Unblocked**: Documentation & learning PRD can begin implementation

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| dot-ai-controller PR #5 delayed | High | Medium | Monitor PR progress, prepare implementation in parallel |
| Solution CRD schema changes | Medium | Low | Follow PR #5 closely, coordinate with controller team |
| Integration issues with controller | Medium | Low | Comprehensive integration testing, early validation |
| User workflow confusion | Low | Low | Clear documentation, examples, and migration notes |
| Test coverage gaps | Medium | Low | Thorough integration test suite, real cluster testing |

## Open Questions

1. **Solution CR Naming**: Use session ID, timestamp, or user-provided name? (Discuss during implementation)
2. **Namespace Strategy**: Default namespace or require user specification?
3. **Error Handling**: What happens if Solution CR generation fails? Fail entire operation or skip?
4. **Validation**: Should we validate Solution CR against CRD schema before returning?
5. **Cache Invalidation**: Should CRD availability cache have TTL, or is one-time check sufficient for session lifetime?
6. **CRD Check Timing**: Check availability at MCP server startup, or on-demand during first recommend call?

## Future Enhancements

- **PRD #228 Integration**: Add documentation URL field to Solution CR
- **Solution Querying**: MCP tools to list and inspect existing Solution CRs
- **Solution Management**: MCP tools to update or delete Solution CRs
- **Health Notifications**: Alert users when solution health degrades
- **Solution Templates**: Pre-defined Solution patterns for common deployments
- **Cross-Cluster Tracking**: Track solutions across multiple clusters

## Work Log

### 2025-11-23: PRD Creation & Updates
**Duration**: ~1.5 hours
**Status**: Planning - Blocked by dot-ai-controller PR #5

**Completed Work**:
- Created PRD for ConfigMap → Solution CR migration
- Defined 6 major milestones with clear success criteria
- Established hard dependency on dot-ai-controller PR #5
- Documented Solution CR schema understanding
- Outlined integration testing requirements
- Added Milestone 1: Helm chart integration (dogfooding Solution CR for dot-ai deployment)
- Added CRD availability detection requirement
- Added graceful degradation strategy
- Added dynamic AI prompt modification based on CRD availability
- Added global caching for CRD availability check

**Key Decisions**:
- Complete ConfigMap removal (no migration path)
- Generate Solution CR alongside application manifests
- Maintain current user workflow (save locally or apply via MCP)
- Solution CR timing flexible (before/after resources)
- High priority to unblock PRD #228
- Helm chart includes controller as dependency
- dot-ai deployment tracked by Solution CR (dogfooding)
- CRD availability checked once and cached globally
- AI prompts modified dynamically based on CRD availability
- Graceful degradation when controller not installed

**Next Steps**:
- ✅ dot-ai-controller Solution CRD complete
- Ready to begin Milestone 1: Helm Chart Integration & Controller Deployment
- All prerequisites resolved, implementation can begin

### 2025-11-24: dot-ai-controller Solution CRD Complete
**Duration**: N/A (external dependency)
**Status**: ✅ **COMPLETE** - Blocking prerequisite resolved

**Completed Work**:
- dot-ai-controller Solution CRD implementation complete
- Solution controller operational and available
- CRD schema finalized and stable
- PRD #229 unblocked and ready to start

**Key Impact**:
- **Status Updated**: PRD moved from "Blocked" to "Ready to Start"
- **All Milestones Unblocked**: Can now begin Milestone 1 implementation
- **Integration Ready**: Solution CRD available for integration testing

**Next Steps**:
- Begin Milestone 1: Helm Chart Integration & Controller Deployment
- Implement CRD availability checking
- Create Solution CR template for dot-ai deployment

### 2025-11-23: In-Cluster Test Infrastructure Implementation
**Duration**: ~2-3 hours
**Status**: Infrastructure foundation complete, ready for Milestone 1

**Completed Work**:
- Implemented in-cluster deployment for integration tests
- Created multi-stage Dockerfile using npm pack workflow
- Added parallel operator installation to test script (30-60s speedup)
- Configured ingress-based testing with nip.io domains
- Updated version tests to support both host and in-cluster modes
- Added ai.sdk configuration to Helm chart
- Created v1.15.5-test-01 Qdrant test image tag
- Removed unused setup-cluster.sh script

**Key Technical Decisions**:
- Local dot-ai image: Built from npm pack, loaded into Kind (single-arch)
- Qdrant test image: Pulled from GHCR (multi-arch can't be pre-loaded)
- Test mode: Deploy via Helm with ingress instead of host-based server
- Parallel installations: CNPG, Kyverno, nginx install simultaneously

**Infrastructure Validated**:
- ✅ Dockerfile builds correctly with local package
- ✅ Helm deployment to Kind cluster works
- ✅ Ingress with nip.io domain accessible
- ✅ All version tests passing (4/4)
- ✅ MCP server responding correctly in-cluster

**Rationale**:
This infrastructure work enables testing the actual Helm chart deployment (exactly as users will deploy it) rather than testing host-based processes. Critical for Milestone 1's goal of dogfooding: dot-ai's deployment will be tracked by a Solution CR, which requires the chart to be deployed in-cluster.

**Next Steps**:
- Begin Milestone 1: Add dot-ai-controller as Helm dependency
- Create Solution CR template for dot-ai deployment
- Write integration tests for controller functionality

### 2025-11-24: Milestone 1 Complete - Helm Chart Integration & Controller Deployment
**Duration**: ~3 hours
**Status**: ✅ **COMPLETE** - Milestone 1 finished and validated

**Completed Work**:
- **Helm Chart Configuration**:
  - Removed dot-ai-controller as chart dependency (two-step install approach)
  - Set `controller.enabled: false` as default in `values.yaml` (backwards compatible)
  - Created Solution CR template in `charts/templates/solution.yaml`
  - Solution CR conditionally deployed when `controller.enabled=true`
  - Updated Helm dependencies (removed controller from `Chart.yaml`)

- **CI/CD Pipeline Updates**:
  - Added `helm dependency build` step to `.github/workflows/ci.yml`
  - Ensures dependencies bundled in published charts

- **Documentation**:
  - Updated `docs/setup/kubernetes-setup.md` with two-step installation
  - Added optional Step 2 for controller installation (v0.16.0+)
  - Documented `controller.enabled` flag usage
  - Created example Solution CR in `examples/solution-dot-ai.yaml`

- **Testing & Validation**:
  - Tested two-step installation: controller v0.16.0 + dot-ai
  - Verified Solution CR creation (6 resources tracked: ServiceAccount, ClusterRole, ClusterRoleBinding, Secret, Deployment, Service)
  - Verified controller reconciliation (state: deployed, all resources ready)
  - Verified ownerReferences added to all child resources
  - Verified garbage collection setup (blockOwnerDeletion: true)
  - Validated health monitoring in controller logs

**Key Technical Decisions**:
- **Two-step installation**: Removed controller as Helm dependency; users install separately when needed
- **Backwards compatible**: `controller.enabled: false` by default, existing users unaffected
- **Opt-in Solution CR**: Users must explicitly enable `controller.enabled=true` to get Solution CR tracking
- **Conditional rendering**: Solution CR template only renders when controller is enabled

**Architecture Evolution**:
- **Original plan**: Controller as Helm dependency with hooks to avoid CRD chicken-egg problem
- **Final implementation**: Separate controller installation, simpler chart templates, no hooks needed
- **Rationale**: Industry standard pattern (cert-manager, ArgoCD, etc.), cleaner templates, avoids Helm validation issues

**Validation Results**:
```bash
# Controller operational
$ kubectl get pods -n dot-ai
NAME                                        READY   STATUS    RESTARTS   AGE
dot-ai-controller-manager-cd4d58845-ppt58   1/1     Running   0          79s
dot-ai-6dc4dcfdf7-ps7t8                     1/1     Running   0          17s
dot-ai-qdrant-0                             1/1     Running   0          17s

# Solution CR tracking dot-ai deployment
$ kubectl get solution dot-ai -n dot-ai
NAME     INTENT                                                          STATE      RESOURCES   AGE
dot-ai   Deploy dot-ai MCP server for AI-powered Kubernetes operations   deployed   6           85s

# OwnerReferences established
$ kubectl get deployment dot-ai -n dot-ai -o jsonpath='{.metadata.ownerReferences}'
[{"apiVersion":"dot-ai.devopstoolkit.live/v1alpha1","kind":"Solution","name":"dot-ai",...}]
```

**Files Changed**:
- `charts/Chart.yaml` - Removed controller dependency
- `charts/values.yaml` - Added `controller.enabled: false`
- `charts/templates/solution.yaml` - Created Solution CR template
- `.github/workflows/ci.yml` - Added dependency build step
- `docs/setup/kubernetes-setup.md` - Added controller installation instructions
- `examples/solution-dot-ai.yaml` - Created example Solution CR

**Next Steps**:
- **Milestone 2**: Implement Solution CR generation in recommend tool
  - CRD availability checking with caching
  - Solution CR generation utility
  - Resource reference extraction
  - Dynamic AI prompt modification
- **Milestone 3**: Remove ConfigMap storage code
- **Milestone 4**: Integration testing for recommend tool

---

## Appendix

### Solution CR Example

**Example: Web Application with Database**

```yaml
apiVersion: dot-ai.io/v1alpha1
kind: Solution
metadata:
  name: solution-1732389847123-a4f3b2c1
  namespace: production
spec:
  intent: "Deploy Node.js web application with PostgreSQL database"

  resources:
    - apiVersion: apps/v1
      kind: Deployment
      name: web-app
      namespace: production
    - apiVersion: v1
      kind: Service
      name: web-app-svc
      namespace: production
    - apiVersion: apps/v1
      kind: StatefulSet
      name: postgresql
      namespace: production
    - apiVersion: v1
      kind: Service
      name: postgresql-svc
      namespace: production
    - apiVersion: v1
      kind: PersistentVolumeClaim
      name: postgresql-pvc
      namespace: production

  context:
    createdBy: dot-ai-mcp
    rationale: "StatefulSet for PostgreSQL ensures data persistence. Deployment for stateless web app with 3 replicas for high availability."
    patterns:
      - high-availability
      - stateful-storage
    policies:
      - minimum-3-replicas
      - resource-limits-required

  documentationURL: ""  # Populated by PRD #228 in future
```

### CRD Availability Check with Caching

```typescript
/**
 * Singleton cache for CRD availability check
 * Checks once per MCP server lifecycle, caches result globally
 */
class CRDAvailabilityCache {
  private static instance: CRDAvailabilityCache;
  private crdAvailable: boolean | null = null;

  private constructor() {}

  static getInstance(): CRDAvailabilityCache {
    if (!CRDAvailabilityCache.instance) {
      CRDAvailabilityCache.instance = new CRDAvailabilityCache();
    }
    return CRDAvailabilityCache.instance;
  }

  async isSolutionCRDAvailable(): Promise<boolean> {
    // Return cached result if available
    if (this.crdAvailable !== null) {
      return this.crdAvailable;
    }

    // Check cluster for Solution CRD
    try {
      const k8sApi = kubernetesClient.getApiExtensionsV1Api();
      const crdName = 'solutions.dot-ai.io';

      await k8sApi.readCustomResourceDefinition(crdName);

      // CRD exists, cache result
      this.crdAvailable = true;
      return true;
    } catch (error: any) {
      if (error.statusCode === 404) {
        // CRD not found, cache result
        this.crdAvailable = false;
        return false;
      }
      // Other errors (cluster unreachable, etc.) - don't cache
      throw error;
    }
  }

  // Optional: Reset cache (for testing or manual refresh)
  reset(): void {
    this.crdAvailable = null;
  }
}

/**
 * Helper function for checking CRD availability
 */
export async function isSolutionCRDAvailable(): Promise<boolean> {
  const cache = CRDAvailabilityCache.getInstance();
  return cache.isSolutionCRDAvailable();
}
```

### Dynamic AI Prompt Modification

```typescript
/**
 * Load and modify AI prompt based on CRD availability
 */
async function getRecommendationPrompt(
  basePromptPath: string,
  userIntent: string,
  clusterCapabilities: any
): Promise<string> {
  // Check if Solution CRD is available
  const solutionCRDAvailable = await isSolutionCRDAvailable();

  // Load base prompt template
  const fs = await import('fs');
  const template = fs.readFileSync(basePromptPath, 'utf8');

  // Conditionally include/exclude Solution CR instructions
  let finalPrompt = template
    .replace('{userIntent}', userIntent)
    .replace('{clusterCapabilities}', JSON.stringify(clusterCapabilities));

  if (solutionCRDAvailable) {
    // Include Solution CR generation instructions
    const solutionCRInstructions = `
## Solution Custom Resource

IMPORTANT: Generate a Solution CR alongside application manifests to enable tracking and lifecycle management.

The Solution CR should include:
- spec.intent: The user's original intent
- spec.resources: List of all deployed resources (apiVersion, kind, name, namespace)
- spec.context: Metadata including rationale, patterns, and policies

Example:
\`\`\`yaml
apiVersion: dot-ai.io/v1alpha1
kind: Solution
metadata:
  name: solution-{timestamp}-{id}
  namespace: {namespace}
spec:
  intent: "{userIntent}"
  resources:
    - apiVersion: apps/v1
      kind: Deployment
      name: my-app
      namespace: production
  context:
    createdBy: dot-ai-mcp
    rationale: "..."
    patterns: []
    policies: []
\`\`\`
`;
    finalPrompt += solutionCRInstructions;
  }

  return finalPrompt;
}
```

### Resource Reference Extraction Logic

```typescript
/**
 * Extract resource references from Kubernetes manifests
 * for inclusion in Solution CR spec.resources
 */
function extractResourceReferences(manifests: any[]): ResourceReference[] {
  return manifests
    .filter(manifest => manifest.kind && manifest.metadata?.name)
    .map(manifest => ({
      apiVersion: manifest.apiVersion,
      kind: manifest.kind,
      name: manifest.metadata.name,
      namespace: manifest.metadata.namespace || undefined
    }));
}

interface ResourceReference {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
}
```

### Integration Test Example

```typescript
describe('Solution CR Integration', () => {
  test('should generate Solution CR during recommend workflow', async () => {
    // Complete recommendation workflow
    const response = await recommendTool.execute({
      intent: 'Deploy Go API with Redis cache',
      // ... configuration answers
    });

    // Verify Solution CR is included in manifests
    const solutionCR = response.manifests.find(m => m.kind === 'Solution');
    expect(solutionCR).toBeDefined();

    // Verify Solution CR structure
    expect(solutionCR).toMatchObject({
      apiVersion: 'dot-ai.io/v1alpha1',
      kind: 'Solution',
      spec: {
        intent: 'Deploy Go API with Redis cache',
        resources: expect.arrayContaining([
          expect.objectContaining({ kind: 'Deployment' }),
          expect.objectContaining({ kind: 'Service' })
        ]),
        context: expect.objectContaining({
          createdBy: 'dot-ai-mcp'
        })
      }
    });
  });

  test('should allow controller to track Solution CR resources', async () => {
    // Deploy manifests including Solution CR
    await deployManifests(manifests);

    // Wait for controller to reconcile
    await waitForReconciliation();

    // Verify controller added ownerReferences
    const deployment = await k8s.apps.v1.deployments.get('api-deployment');
    expect(deployment.metadata.ownerReferences).toContainEqual(
      expect.objectContaining({
        kind: 'Solution',
        name: solutionCR.metadata.name
      })
    );

    // Verify Solution status is updated
    const solution = await k8s.getCustomResource(solutionCR);
    expect(solution.status.state).toBe('deployed');
    expect(solution.status.resources.ready).toBeGreaterThan(0);
  });
});
```

### Relationship to dot-ai-controller PR #5

**What dot-ai-controller PR #5 Provides** (PREREQUISITE):
- Solution CRD definition (v1alpha1)
- Solution controller implementation
- Resource tracking and health monitoring
- OwnerReference management
- Status updates and garbage collection
- See: https://github.com/vfarcic/dot-ai-controller/pull/5

**What This PRD Adds**:
- Solution CR generation in recommend tool
- ConfigMap removal and code cleanup
- Integration with recommend workflow
- Integration testing for CR generation
- User documentation and examples
