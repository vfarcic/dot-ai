# PRD: AI-Powered Application Operations Tool

**GitHub Issue**: [#201](https://github.com/vfarcic/dot-ai/issues/201)
**Status**: Draft
**Priority**: High
**Created**: 2025-11-03
**Owner**: TBD
**Supersedes**: [PRD #4](https://github.com/vfarcic/dot-ai/issues/4)

---

## Overview

### Problem Statement

DevOps AI Toolkit currently excels at **initial deployment** (via `recommend` tool) and **troubleshooting** (via `remediate` tool), but lacks capabilities for **Day 2 operations** - the ongoing operational changes needed after deployment:

**Current Gaps:**
- ❌ No way to update existing deployments (version updates, config changes)
- ❌ No way to scale applications (manual or automated scaling)
- ❌ No way to enhance existing deployments (add HA, monitoring, backups)
- ❌ No way to rollback problematic changes
- ❌ No way to modify operational characteristics (resources, replicas, environment)

**User Impact:**
- Users deploy with `recommend`, but then must use raw kubectl for all operations
- No AI assistance for operational decisions (what's the safest update strategy?)
- No pattern/policy enforcement for operational changes
- No cluster-aware recommendations (e.g., use KEDA if available, otherwise HPA)

### Solution Overview

Create an **`operate` tool** that handles all post-deployment application operations through an intent-based workflow:

**Core Capabilities:**
1. **Update operations**: Version updates, configuration changes, resource modifications
2. **Scaling operations**: Manual scaling, automated scaling setup (HPA, KEDA, VPA)
3. **Enhancement operations**: Add HA, monitoring, backups, security, caching
4. **Rollback operations**: Revert problematic changes safely
5. **Deletion operations**: Safe removal with dependency checking

**Key Differentiators:**
- ✅ **Intent-based**: Natural language ("make postgres HA") vs commands
- ✅ **AI-powered**: Analyzes best strategy using patterns, policies, capabilities
- ✅ **Cluster-aware**: Recommends solutions based on installed operators/capabilities
- ✅ **Safe**: Dry-run validation before proposing, exact command execution
- ✅ **Pattern-driven**: Applies organizational patterns to operational changes
- ✅ **Policy-enforced**: Validates compliance before execution

### Success Criteria

- [ ] Users can update, scale, enhance, rollback, and delete applications via natural language intents
- [ ] AI analyzes intent and proposes solutions using patterns, policies, and cluster capabilities
- [ ] All proposed changes validated via dry-run before user review
- [ ] MCP executes exact approved commands (not interpreted by agent)
- [ ] Tool can create new resources (e.g., HPA) and update/delete existing resources
- [ ] Iterative validation loop confirms changes successfully applied
- [ ] Integration tests demonstrate complete workflows with various intents
- [ ] 90%+ of operational intents handled without requiring raw kubectl

---

## User Impact

### Target Users

**Primary**: DevOps engineers managing Kubernetes applications
- Need to update, scale, and enhance deployed applications
- Want AI-powered recommendations for operational changes
- Need pattern/policy enforcement for operational governance

**Secondary**: Platform engineers establishing operational standards
- Define patterns for operational best practices
- Enforce policies for production changes
- Ensure cluster capabilities are optimally utilized

**Tertiary**: Developers performing application operations
- Limited Kubernetes expertise
- Need guidance on safe operational practices
- Want to avoid breaking production

### User Journeys

#### Journey 1: Update Application Version

**Before (Current State):**
1. User wants to update app to new version
2. Must manually craft kubectl commands
3. No guidance on update strategy (rolling? blue-green?)
4. No validation before applying
5. Hope it works

**After (With `operate` tool):**
```typescript
User: operate(intent="update my-api to v2.0 with zero downtime")

AI analyzes:
- Checks current deployment state
- Applies "Zero-Downtime Update" pattern
- Validates cluster has metrics for rollout monitoring
- Generates rolling update strategy
- Dry-run validates changes

Returns: {
  analysis: "Rolling update strategy recommended for zero-downtime...",
  update: [{
    resource: "Deployment/my-api",
    changes: "image: my-api:v2.0, strategy: RollingUpdate, maxUnavailable: 0"
  }],
  commands: ["kubectl set image deployment/my-api..."],
  dryRunValidation: "✓ Validated successfully",
  patternApplied: "Zero-Downtime Rolling Update",
  sessionId: "xyz"
}

User: operate(sessionId="xyz", executeChoice=1)
→ MCP executes exact commands
→ Validates rollout completes successfully
→ Returns final status
```

#### Journey 2: Enable Auto-Scaling

**Before (Current State):**
1. User wants auto-scaling
2. Must determine: HPA? KEDA? VPA?
3. Must manually check if metrics-server installed
4. Must craft YAML for HPA/KEDA
5. Must ensure resource requests defined
6. Apply and hope it works

**After (With `operate` tool):**
```typescript
User: operate(intent="enable auto-scaling for my-api based on CPU")

AI analyzes:
- Checks cluster capabilities → finds KEDA installed
- Applies "Automated Scaling" pattern → recommends KEDA over HPA
- Checks deployment → missing resource requests
- Retrieves KEDA ScaledObject schema from cluster
- Generates manifests with correct schema
- Dry-run validates all changes

Returns: {
  analysis: "KEDA operator detected, using ScaledObject for advanced scaling...",
  create: [{
    kind: "ScaledObject",
    manifest: "..." // Generated from actual cluster schema
  }],
  update: [{
    resource: "Deployment/my-api",
    changes: "Add resource requests (required for KEDA)"
  }],
  commands: ["kubectl apply -f scaledObject.yaml", "kubectl patch..."],
  dryRunValidation: "✓ All resources validated",
  patternApplied: "KEDA-Based Autoscaling",
  capabilitiesUsed: ["KEDA Operator"],
  sessionId: "xyz"
}

User: operate(sessionId="xyz", executeChoice=1)
→ Creates ScaledObject
→ Updates Deployment with resource requests
→ Validates KEDA controller picks up ScaledObject
→ Returns final status
```

#### Journey 3: Make Database Highly Available

**Before (Current State):**
1. User wants database HA
2. Must research best practices
3. Must determine what resources needed (PDB? replicas? backups?)
4. Must check if backup operators available
5. Manually craft multiple YAMLs
6. Apply and hope dependencies work

**After (With `operate` tool):**
```typescript
User: operate(intent="make postgres highly available with backups")

AI analyzes:
- Checks current StatefulSet (1 replica, no PDB, no backups)
- Applies "Database High Availability" pattern
- Checks capabilities → finds Velero operator
- Retrieves schemas for StatefulSet, PodDisruptionBudget, Velero Backup
- Generates comprehensive solution
- Dry-run validates all changes

Returns: {
  analysis: "Implementing HA with 3 replicas, PDB, anti-affinity, and Velero backups...",
  update: [{
    resource: "StatefulSet/postgres",
    changes: "replicas: 3, add anti-affinity rules"
  }],
  create: [
    { kind: "PodDisruptionBudget", manifest: "..." },
    { kind: "Backup", manifest: "..." } // Velero CRD
  ],
  commands: ["kubectl scale...", "kubectl apply..."],
  dryRunValidation: "✓ All resources validated",
  patternApplied: "Database HA with Operator-Based Backups",
  capabilitiesUsed: ["Velero Operator"],
  sessionId: "xyz"
}

User: operate(sessionId="xyz", executeChoice=1)
→ Scales StatefulSet to 3 replicas
→ Creates PDB
→ Creates Velero Backup schedule
→ Validates all pods running, Velero backup scheduled
→ Returns final status
```

### Value Proposition

**For DevOps Engineers:**
- 🚀 **Faster operations**: Intent → AI analysis → validated solution in seconds
- 🎯 **Best practices**: Pattern-driven recommendations ensure operational excellence
- 🔒 **Safety**: Dry-run validation prevents failed deployments
- 🧠 **Cluster-aware**: AI recommends solutions based on installed capabilities

**For Platform Engineers:**
- 📋 **Governance**: Policies enforce operational standards
- 📚 **Knowledge capture**: Patterns codify operational best practices
- 🔄 **Consistency**: All teams follow same operational patterns
- 📊 **Learning**: System improves from operational outcomes

**For Developers:**
- 🎓 **Learning**: See best practices in action
- 🛡️ **Confidence**: Know changes are validated before applying
- ⚡ **Productivity**: Focus on features, not kubectl syntax
- 🤝 **Collaboration**: Speak intent, not commands

---

## Technical Scope

### Architecture Overview

The `operate` tool follows the established **tool-based agentic architecture** (PRD #136) with multi-stage session workflow similar to `recommend` and `remediate` tools.

```
┌─────────────────────────────────────────────────────────────┐
│                      OPERATE TOOL                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  STAGE 1: ANALYSIS (AI with Read-Only + Dry-Run Tools)    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Embed context in prompt:                          │  │
│  │    - Patterns (vector search by intent)              │  │
│  │    - Policies (search by intent keywords)            │  │
│  │    - Capabilities (cluster discovery)                │  │
│  │                                                       │  │
│  │ 2. AI uses tools autonomously:                       │  │
│  │    - kubectl_get (inspect resources)                 │  │
│  │    - kubectl_describe (detailed info)                │  │
│  │    - get_resource_schema (retrieve CRD schemas) ✨   │  │
│  │    - kubectl_dry_run (validate changes) ✨           │  │
│  │                                                       │  │
│  │ 3. AI generates solution:                            │  │
│  │    - Manifests with correct schemas                  │  │
│  │    - Commands to execute                             │  │
│  │    - Dry-run validation proof                        │  │
│  │                                                       │  │
│  │ 4. Return to user with sessionId                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  STAGE 2: USER REVIEW                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ User options:                                         │  │
│  │ - Accept (executeChoice=1) → Stage 3                 │  │
│  │ - Clarify (refined intent) → Stage 1 with more info │  │
│  │ - Reject                                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↓                                   │
│  STAGE 3: EXECUTION (MCP Code, No AI Tools)                │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Load session with approved commands               │  │
│  │ 2. MCP code executes EXACT commands                  │  │
│  │    (not agent - ensures what's approved is executed) │  │
│  │ 3. AI validates outcome with tools (iterative):      │  │
│  │    - kubectl_get (check status)                      │  │
│  │    - Loop if needed (e.g., ImagePullBackOff → retry)│  │
│  │ 4. Return final result                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

KEY PRINCIPLES:
✅ Reuse existing code (kubectl wrappers, discovery, pattern search)
✅ Dry-run validation BEFORE proposing to user
✅ MCP executes approved commands exactly (not agent interpretation)
✅ Iterative validation loop handles async operations
✅ Tools are read-only except dry-run (safe)
```

### Core Components

#### 1. MCP Tool Interface

```typescript
// Zod schema for MCP registration
const operateSchema = z.object({
  // Stage 1: Analysis
  intent: z.string().optional()
    .describe('User intent for operation: "update X to Y", "scale Z", "make W HA", etc.'),

  // Stage 2: Execution
  sessionId: z.string().optional()
    .describe('Session ID from previous operate call'),
  executeChoice: z.number().optional()
    .describe('Execute approved changes (1=execute)'),

  // Refinement
  refinedIntent: z.string().optional()
    .describe('Clarified intent if user wants to provide more details'),
});

// MCP tool handler
export async function operate(args: OperateArgs): Promise<OperateResult> {
  if (args.sessionId && args.executeChoice) {
    return executeOperations(args.sessionId);
  }

  if (args.sessionId && args.refinedIntent) {
    return analyzeIntent(args.refinedIntent, args.sessionId);
  }

  return analyzeIntent(args.intent);
}
```

#### 2. Context Embedding System

```typescript
async function embedContext(intent: string): Promise<EmbeddedContext> {
  // Extract keywords from intent
  const keywords = extractKeywords(intent);

  // Vector search patterns (reuse existing pattern search)
  const relevantPatterns = await searchPatterns(keywords, { limit: 5 });

  // Search policies (reuse existing policy search)
  const relevantPolicies = await searchPolicies(keywords);

  // Load cluster capabilities (reuse existing discovery)
  const capabilities = await getClusterCapabilities();

  return {
    patterns: relevantPatterns,
    policies: relevantPolicies,
    capabilities: capabilities
  };
}
```

#### 3. AI Tool Registration

```typescript
// Tools available to AI during analysis
const operateAnalysisTools = [
  // Resource inspection (read-only)
  {
    name: "kubectl_get",
    description: "Get Kubernetes resources (list or specific resource)",
    schema: {
      resource: "string (e.g., 'deployment', 'statefulset', 'hpa')",
      namespace: "string (optional)",
      name: "string (optional)"
    },
    handler: async (args) => {
      // Reuse existing kubectl wrapper
      return await kubernetesClient.get(args.resource, args.namespace, args.name);
    }
  },

  {
    name: "kubectl_describe",
    description: "Get detailed information about a Kubernetes resource",
    schema: {
      resource: "string",
      namespace: "string",
      name: "string"
    },
    handler: async (args) => {
      // Reuse existing kubectl wrapper
      return await kubernetesClient.describe(args.resource, args.namespace, args.name);
    }
  },

  // Schema retrieval (read-only) ✨ NEW
  {
    name: "get_resource_schema",
    description: "Get OpenAPI schema for a resource type. REQUIRED before creating or updating resources to ensure correct API version and required fields.",
    schema: {
      kind: "string (e.g., 'HorizontalPodAutoscaler', 'ScaledObject')",
      apiVersion: "string (e.g., 'autoscaling/v2', 'keda.sh/v1alpha1')"
    },
    handler: async (args) => {
      // New function to retrieve CRD schema
      return await getResourceSchema(args.kind, args.apiVersion);
    }
  },

  // Validation (safe write - dry-run only)
  {
    name: "kubectl_dry_run",
    description: "Validate resource changes without applying them. REQUIRED before proposing changes to user.",
    schema: {
      manifest: "string (YAML manifest)",
      operation: "string (create|update|delete)"
    },
    handler: async (args) => {
      // Reuse existing kubectl wrapper with --dry-run=server
      return await kubernetesClient.dryRun(args.manifest, args.operation);
    }
  }
];
```

#### 4. Analysis Workflow

```typescript
async function analyzeIntent(intent: string, sessionId?: string): Promise<OperateAnalysisResult> {
  // 1. Embed context
  const context = await embedContext(intent);

  // 2. Build AI prompt with embedded context
  const systemPrompt = `
You are analyzing an operational intent for a Kubernetes application.

User intent: "${intent}"

EMBEDDED CONTEXT:

Relevant Patterns:
${formatPatterns(context.patterns)}

Relevant Policies:
${formatPolicies(context.policies)}

Available Cluster Capabilities:
${formatCapabilities(context.capabilities)}

INSTRUCTIONS:
1. Use kubectl_get/kubectl_describe to inspect current state
2. Apply pattern recommendations based on intent
3. Check policy compliance requirements
4. For ANY resource you create or update:
   - First call get_resource_schema() to retrieve correct schema
   - Generate manifest matching the schema exactly
5. REQUIRED: Call kubectl_dry_run() for EVERY change before proposing
6. Return comprehensive solution with commands to execute

Your goal: Propose a safe, validated, pattern-driven solution that leverages available cluster capabilities.
`;

  // 3. AI tool loop
  const result = await aiProvider.toolLoop({
    systemPrompt,
    tools: operateAnalysisTools,
    maxIterations: 20
  });

  // 4. Parse AI response and create session
  const session = {
    sessionId: sessionId || generateSessionId(),
    intent,
    context,
    proposedChanges: result.changes,
    commands: result.commands,
    dryRunValidation: result.validation,
    patternsApplied: result.patterns,
    policiesChecked: result.policies,
    timestamp: Date.now()
  };

  await saveSession(session);

  return {
    analysis: result.analysis,
    update: result.updates,
    create: result.creates,
    delete: result.deletes,
    commands: result.commands,
    dryRunValidation: "✓ All changes validated via dry-run",
    patternsApplied: result.patterns,
    capabilitiesUsed: result.capabilities,
    policiesEnforced: result.policies,
    sessionId: session.sessionId,
    nextAction: "Review changes and call operate(sessionId, executeChoice=1) to execute, or provide refinedIntent for clarification"
  };
}
```

#### 5. Execution Workflow

```typescript
async function executeOperations(sessionId: string): Promise<OperateExecutionResult> {
  // 1. Load session with approved commands
  const session = await loadSession(sessionId);

  // 2. MCP code executes EXACT commands (not agent)
  const executionResults = [];
  for (const command of session.commands) {
    try {
      const result = await executeCommand(command);
      executionResults.push({ command, success: true, output: result });
    } catch (error) {
      executionResults.push({ command, success: false, error: error.message });
    }
  }

  // 3. AI validates outcome with iterative loop
  const validationPrompt = `
Validate that the operations completed successfully.

Executed commands:
${formatExecutionResults(executionResults)}

Use kubectl_get to check resource status. If resources are in transitional states
(e.g., ContainerCreating, ImagePullBackOff), you may need to check multiple times.
Return final validation status.
`;

  const validationTools = [
    { name: "kubectl_get", ... },
    { name: "kubectl_describe", ... }
  ];

  const validation = await aiProvider.toolLoop({
    systemPrompt: validationPrompt,
    tools: validationTools,
    maxIterations: 10 // Allow retries for async operations
  });

  // 4. Update session and return result
  await updateSession(sessionId, {
    executed: true,
    executionResults,
    validation: validation.result
  });

  return {
    success: validation.success,
    executionResults,
    validation: validation.result,
    sessionId
  };
}
```

### Tool Operations Mapping

| Operation Category | Example Intents | Resources Affected | Capabilities Used |
|-------------------|-----------------|-------------------|------------------|
| **Update** | "update X to v2.0", "change config" | Deployment, StatefulSet, ConfigMap | - |
| **Scale Manual** | "scale X to 5 replicas" | Deployment, StatefulSet | - |
| **Scale Auto** | "enable auto-scaling for X" | HPA, KEDA ScaledObject, VPA | KEDA, metrics-server, VPA |
| **Add HA** | "make X highly available" | Deployment/StatefulSet (replicas), PDB | - |
| **Add Monitoring** | "add monitoring to X" | ServiceMonitor, PodMonitor | Prometheus Operator |
| **Add Backups** | "enable backups for X" | Velero Backup, CronJob | Velero Operator |
| **Add Caching** | "add Redis caching to X" | Redis Deployment, ConfigMap | Redis Operator (optional) |
| **Add Security** | "secure X with mTLS" | NetworkPolicy, Certificate | cert-manager, service mesh |
| **Rollback** | "rollback X to previous version" | Deployment, StatefulSet | - |
| **Delete** | "delete X and cleanup" | All resources owned by app | - |

### Schema Retrieval Implementation

```typescript
// New function to retrieve resource schemas from cluster
async function getResourceSchema(kind: string, apiVersion: string): Promise<ResourceSchema> {
  // Use Kubernetes OpenAPI endpoint
  const openApiSpec = await kubernetesClient.getOpenAPISpec();

  // Find definition for this resource
  const resourcePath = `${apiVersion}/${kind}`;
  const definition = openApiSpec.definitions[resourcePath];

  if (!definition) {
    throw new Error(`Schema not found for ${kind} (${apiVersion})`);
  }

  // Extract key information
  return {
    apiVersion,
    kind,
    requiredFields: definition.required || [],
    properties: definition.properties,
    description: definition.description
  };
}
```

### Session Management

```typescript
interface OperateSession {
  sessionId: string;
  intent: string;
  context: {
    patterns: Pattern[];
    policies: Policy[];
    capabilities: Capability[];
  };
  proposedChanges: {
    create: Resource[];
    update: Resource[];
    delete: Resource[];
  };
  commands: string[];
  dryRunValidation: string;
  patternsApplied: string[];
  policiesChecked: string[];
  capabilitiesUsed: string[];
  executed?: boolean;
  executionResults?: ExecutionResult[];
  validation?: string;
  timestamp: number;
}

// Session storage (reuse existing session directory structure)
const SESSION_DIR = './sessions/operate';
```

---

## Implementation Milestones

### Milestone 1: Core Tool Infrastructure [Status: ⏳ PENDING]
**Target**: Basic operate tool with single operation type working end-to-end

**Completion Criteria:**
- [ ] MCP tool registered with schema
- [ ] Session management implemented
- [ ] Context embedding system working (patterns, policies, capabilities)
- [ ] AI tool registration with kubectl_get, kubectl_describe, kubectl_dry_run
- [ ] Basic analysis workflow (single operation: update)
- [ ] Basic execution workflow
- [ ] Integration test: update deployment version

**Success Validation:**
- Can execute: `operate(intent="update my-api to v2.0")`
- AI inspects deployment, generates update command, validates with dry-run
- User reviews and confirms
- MCP executes exact command
- Validation confirms deployment updated

**Estimated Effort**: 2-3 days

---

### Milestone 2: Schema Retrieval & Resource Creation [Status: ⏳ PENDING]
**Target**: Tool can create new resources with correct schemas

**Completion Criteria:**
- [ ] Implement get_resource_schema() function
- [ ] AI retrieves schemas before generating manifests
- [ ] Support resource creation operations
- [ ] Integration test: create HPA for existing deployment
- [ ] Integration test: create KEDA ScaledObject (if KEDA available)

**Success Validation:**
- Can execute: `operate(intent="enable auto-scaling for my-api")`
- AI checks if HPA/KEDA needed, retrieves schema, generates correct manifest
- Dry-run validates manifest
- User confirms, MCP creates resource
- Validation confirms HPA/ScaledObject created and functional

**Estimated Effort**: 1-2 days

---

### Milestone 3: Multi-Resource Operations [Status: ⏳ PENDING]
**Target**: Tool can create, update, and delete multiple resources in one operation

**Completion Criteria:**
- [ ] Support complex intents requiring multiple resource changes
- [ ] Atomic execution of multi-resource operations
- [ ] Proper ordering of resource creation/updates
- [ ] Integration test: make database HA (scale StatefulSet + create PDB + add anti-affinity)
- [ ] Integration test: add monitoring (create ServiceMonitor + update Service annotations)

**Success Validation:**
- Can execute: `operate(intent="make postgres highly available")`
- AI proposes scaling StatefulSet + creating PDB + updating anti-affinity
- All changes validated with dry-run
- User confirms, MCP executes all changes in correct order
- Validation confirms all resources updated/created

**Estimated Effort**: 2-3 days

---

### Milestone 4: Advanced Operations & Error Handling [Status: ⏳ PENDING]
**Target**: Comprehensive operation coverage with robust error handling

**Completion Criteria:**
- [ ] Support all operation categories (scale, enhance, rollback, delete)
- [ ] Iterative validation loop with retry logic
- [ ] Error recovery and rollback on failure
- [ ] Integration tests for all operation types
- [ ] Integration test: rollback deployment
- [ ] Integration test: delete application with cleanup

**Success Validation:**
- All operation categories work end-to-end
- Validation loop handles async operations (ImagePullBackOff → retry)
- Failed operations provide clear error messages
- Rollback works when execution fails

**Estimated Effort**: 2-3 days

---

### Milestone 5: Pattern & Policy Integration [Status: ⏳ PENDING]
**Target**: Operations fully leverage organizational patterns and policies

**Completion Criteria:**
- [ ] Pattern search integrated into context embedding
- [ ] Policy validation integrated into analysis
- [ ] AI applies pattern recommendations in proposals
- [ ] AI enforces policy requirements
- [ ] Create example patterns for common operations
- [ ] Integration test: operation uses pattern recommendation
- [ ] Integration test: operation blocked by policy violation

**Success Validation:**
- Patterns guide AI recommendations (e.g., "Zero-Downtime Update" pattern)
- Policies enforce requirements (e.g., "Production changes require approval")
- AI explains which patterns and policies were applied
- Users can see pattern/policy influence in proposals

**Estimated Effort**: 2-3 days

---

### Milestone 6: Documentation & Testing [Status: ⏳ PENDING]
**Target**: Complete documentation, comprehensive testing, production-ready

**Completion Criteria:**
- [ ] User guide with examples for all operation types
- [ ] Pattern guide for operational patterns
- [ ] Integration tests covering all workflows (>90% coverage)
- [ ] Error handling tests
- [ ] Performance validation (latency targets)
- [ ] Documentation in docs/operate-guide.md

**Success Validation:**
- Documentation covers all use cases with examples
- Integration tests pass consistently
- Performance meets targets (<5s analysis, <30s execution)
- Users can follow docs to perform operations successfully

**Estimated Effort**: 2-3 days

---

## Dependencies & Blockers

### Internal Dependencies
- ✅ **Kubernetes client utilities** - Available in `src/core/kubernetes.ts`
- ✅ **Pattern search** - Available in `src/tools/organizational-data.ts`
- ✅ **Policy management** - Available in `src/tools/organizational-data.ts`
- ✅ **Cluster capabilities discovery** - Available in `src/core/discovery.ts`
- ✅ **Session management patterns** - Established in recommend/remediate tools
- ✅ **AI tool-based architecture** - Established in PRD #136

### External Dependencies
- ✅ **Kubernetes cluster** - Required for all operations
- ✅ **OpenTelemetry tracing** - Available (PRD #137)
- ⚠️ **Kubernetes OpenAPI endpoint** - May need to implement schema retrieval

### Current Blockers
- None identified - all prerequisites satisfied

---

## Risk Management

### Identified Risks

**Risk: Dry-run validation doesn't catch all errors**
- **Likelihood**: Medium
- **Impact**: Medium (failed executions)
- **Mitigation**: Comprehensive validation loop after execution, clear error messages
- **Owner**: Developer

**Risk: Complex multi-resource operations fail partially**
- **Likelihood**: Medium
- **Impact**: High (inconsistent cluster state)
- **Mitigation**: Transaction-like execution with rollback on failure, dependency ordering
- **Owner**: Developer

**Risk: Schema retrieval fails for custom CRDs**
- **Likelihood**: Low
- **Impact**: Medium (can't create CRD resources)
- **Mitigation**: Fallback to template-based generation, clear error messages
- **Owner**: Developer

**Risk: AI generates incorrect kubectl commands**
- **Likelihood**: Low
- **Impact**: High (cluster damage)
- **Mitigation**: Dry-run validation (required), user review, MCP executes exact commands
- **Owner**: Developer

**Risk: Iterative validation loop times out**
- **Likelihood**: Low
- **Impact**: Low (unclear success status)
- **Mitigation**: Configurable timeout, clear status messages, manual verification option
- **Owner**: Developer

### Mitigation Actions
- [ ] Comprehensive error handling for all tool operations
- [ ] Transaction-like execution with rollback capability
- [ ] Extensive integration testing with various failure scenarios
- [ ] Clear documentation on limitations and edge cases

---

## Testing & Validation

### Test Coverage Requirements

**Unit Tests** (>90% coverage):
- [ ] Context embedding (pattern/policy/capability search)
- [ ] Tool handlers (kubectl wrappers, schema retrieval)
- [ ] Session management (create, load, update)
- [ ] Command generation and parsing
- [ ] Dry-run validation logic

**Integration Tests** (all workflows):
- [ ] Update deployment version
- [ ] Scale deployment manually
- [ ] Enable auto-scaling (HPA)
- [ ] Enable auto-scaling with KEDA (if available)
- [ ] Make application highly available (multi-resource)
- [ ] Add monitoring (ServiceMonitor)
- [ ] Add backups (Velero or CronJob)
- [ ] Rollback deployment
- [ ] Delete application with cleanup
- [ ] Intent clarification loop
- [ ] Dry-run validation failure handling
- [ ] Execution failure and recovery
- [ ] Iterative validation with retries

**User Acceptance Testing**:
- [ ] DevOps engineer performs common operations via natural language
- [ ] Platform engineer validates pattern/policy enforcement
- [ ] Developer with limited K8s knowledge successfully performs operations
- [ ] Operations complete faster than manual kubectl workflows
- [ ] Proposed solutions follow organizational best practices

### Validation Scenarios

#### Scenario 1: Update with Zero Downtime
```typescript
operate(intent="update my-api to v2.0 with zero downtime")
→ AI applies "Zero-Downtime Update" pattern
→ Proposes rolling update strategy with maxUnavailable: 0
→ Dry-run validates
→ User accepts
→ MCP executes rolling update
→ Validation confirms all pods updated, zero downtime
```

#### Scenario 2: Enable Auto-Scaling (Cluster Has KEDA)
```typescript
operate(intent="enable auto-scaling for my-api based on requests per second")
→ AI detects KEDA in capabilities
→ Retrieves KEDA ScaledObject schema
→ Proposes ScaledObject with Prometheus trigger
→ Updates Deployment to add resource requests
→ Dry-run validates both changes
→ User accepts
→ MCP creates ScaledObject and patches Deployment
→ Validation confirms KEDA controller picked up ScaledObject
```

#### Scenario 3: Make Database HA
```typescript
operate(intent="make postgres highly available")
→ AI applies "Database High Availability" pattern
→ Proposes: scale to 3 replicas + PDB + anti-affinity + backups
→ Retrieves schemas for StatefulSet, PDB, Backup (if Velero)
→ Dry-run validates all changes
→ User accepts
→ MCP scales StatefulSet, creates PDB, creates Backup
→ Validation loop monitors pod creation (may retry while ContainerCreating)
→ Final validation confirms 3 pods running, PDB active, backups scheduled
```

---

## Documentation

### Required Documentation

**User Guide** (`docs/operate-guide.md`):
- What is the operate tool?
- How to use it for common operations
- Examples for each operation category
- Understanding AI proposals
- Troubleshooting common issues

**Pattern Guide** (`docs/operational-patterns.md`):
- Creating operational patterns
- Example patterns (Zero-Downtime Update, Auto-Scaling, Database HA)
- Pattern format and structure
- Testing and validating patterns

**Policy Guide** (`docs/operational-policies.md`):
- Creating operational policies
- Example policies (Production Update Requirements, Scaling Constraints)
- Policy enforcement mechanism
- Policy compliance reporting

**API Reference** (`docs/api/operate-tool.md`):
- Tool schema and parameters
- Response format
- Session management
- Error codes and handling

### Documentation Validation
- [ ] All examples tested and verified working
- [ ] User journeys documented end-to-end
- [ ] Cross-references between docs resolve correctly
- [ ] Troubleshooting section covers common issues

---

## Success Metrics

### Quantitative Metrics
- [ ] **Operation coverage**: 90%+ of operational intents handled without kubectl
- [ ] **Dry-run success rate**: 95%+ of proposals validated successfully
- [ ] **Execution success rate**: 95%+ of approved operations complete successfully
- [ ] **Performance**: <5s for analysis, <30s for execution
- [ ] **Pattern utilization**: 70%+ of operations use organizational patterns
- [ ] **Test coverage**: >90% for unit tests, 100% for integration workflows

### Qualitative Metrics
- [ ] **User satisfaction**: Faster than manual kubectl workflows
- [ ] **Safety**: Users confident changes are validated
- [ ] **Learning**: Developers understand best practices from AI proposals
- [ ] **Governance**: Platform engineers confident patterns/policies enforced

---

## Launch Checklist

### Pre-Launch
- [ ] All 6 milestones completed
- [ ] Integration tests passing for all operation categories
- [ ] Documentation complete and validated
- [ ] Performance meets targets
- [ ] Security review complete

### Launch
- [ ] Deploy operate tool to staging
- [ ] Test with real operational workloads
- [ ] Monitor execution success rates and errors
- [ ] Collect user feedback

### Post-Launch
- [ ] Analyze usage patterns and popular intents
- [ ] Iterate on patterns based on outcomes
- [ ] Identify gaps in operation coverage
- [ ] Plan phase 2 enhancements (e.g., search tools for edge cases)

---

## Work Log

### 2025-11-03: Initial PRD Creation
**Duration**: ~2 hours
**Primary Focus**: Design intent-based operational tool architecture

**Completed Work**:
- Analyzed gaps in current tooling (deploy + remediate, missing operations)
- Designed tool-based agentic architecture following PRD #136 patterns
- Specified context embedding system (patterns, policies, capabilities)
- Designed schema retrieval for correct CRD handling
- Created comprehensive workflow with dry-run validation
- Defined 6 implementation milestones with clear success criteria

**Key Decisions**:
- **Intent-based workflow**: Natural language vs CLI commands
- **Embed context**: Patterns/policies/capabilities in prompt (no search tools initially)
- **Schema retrieval**: AI retrieves schemas before generating manifests
- **Dry-run required**: All changes validated before proposing
- **MCP executes**: Exact approved commands, not agent interpretation
- **Supersedes PRD #4**: New architecture aligns with current patterns

**Next Steps**: Ready for implementation starting with Milestone 1

---

## Appendix

### Supporting Materials
- [PRD #136: Tool-Based Agentic Architecture](./done/136-tool-based-agentic-architecture.md) - Architecture foundation
- [PRD #4: Application Lifecycle Management](./4-application-lifecycle-management.md) - Original (now superseded)
- [Kubernetes API Conventions](https://kubernetes.io/docs/reference/using-api/api-concepts/) - For schema retrieval
- [Existing recommend tool](../src/tools/recommend.ts) - Multi-stage workflow pattern
- [Existing remediate tool](../src/tools/remediate.ts) - Tool-based analysis pattern

### Example Operational Patterns

**Pattern: Zero-Downtime Rolling Update**
```yaml
id: zero-downtime-update
name: Zero-Downtime Rolling Update
triggers:
  - "zero downtime"
  - "no downtime"
  - "rolling update"
  - "production update"
recommendation:
  strategy: RollingUpdate
  maxUnavailable: 0
  maxSurge: 1
  verification:
    - Ensure readiness probes defined
    - Ensure resource requests defined
    - Monitor rollout status
rationale: |
  Rolling updates with maxUnavailable: 0 ensure at least one pod
  is always available during the update process, eliminating downtime.
```

**Pattern: KEDA-Based Autoscaling**
```yaml
id: keda-autoscaling
name: KEDA Event-Driven Autoscaling
triggers:
  - "auto-scaling"
  - "autoscale"
  - "scale automatically"
  - "event-driven scaling"
recommendation:
  checkCapabilities:
    - KEDA Operator
  create:
    - ScaledObject (if KEDA available)
    - HPA (fallback if KEDA not available)
  update:
    - Ensure resource requests defined (required for scaling)
rationale: |
  KEDA provides advanced event-driven autoscaling beyond CPU/memory metrics.
  Falls back to standard HPA if KEDA not installed.
```

**Pattern: Database High Availability**
```yaml
id: database-ha
name: Database High Availability
triggers:
  - "highly available"
  - "high availability"
  - "HA"
  - "database HA"
recommendation:
  update:
    - replicas: 3 (minimum for HA)
    - Add pod anti-affinity rules
    - Add topology spread constraints
  create:
    - PodDisruptionBudget (minAvailable: 1)
    - Backup schedule (Velero if available, else CronJob)
rationale: |
  Database HA requires multiple replicas, anti-affinity to spread across nodes,
  PDB to prevent all pods being evicted, and backups for disaster recovery.
```

### Example Operational Policies

**Policy: Production Update Approval**
```yaml
id: production-update-approval
name: Production Updates Require Approval
enforce:
  - namespace: production
  - operations: [update, delete]
  - requires: manual approval
  - dryRun: required
validation:
  - Zero-downtime strategy required for critical services
  - Rollback plan documented
rationale: |
  Production changes must be carefully reviewed to prevent outages.
```

**Policy: Scaling Constraints**
```yaml
id: scaling-constraints
name: Scaling Constraints
enforce:
  - minReplicas: 2 (for HA services)
  - maxReplicas: 100 (cost protection)
  - gradualScaleDown: max 50% at once
validation:
  - Resource requests defined
  - Readiness probes configured
rationale: |
  Enforces minimum redundancy and prevents runaway scaling costs.
```

### Research Findings
- Kubernetes OpenAPI provides schemas for all resources including CRDs
- Dry-run validation catches most issues (invalid fields, version mismatches, quota violations)
- Multi-resource operations should be ordered (dependencies first)
- Iterative validation handles async operations (pod creation, image pulls)
- Pattern-driven recommendations significantly improve operational quality

### Future Enhancements (Out of Scope for v1)
- [ ] Search tools for patterns/policies (if embedded context insufficient)
- [ ] GitOps integration (commit changes to repo instead of direct apply)
- [ ] Multi-cluster operations
- [ ] Cost optimization recommendations
- [ ] Compliance and security scanning
- [ ] Automated rollback on validation failure
- [ ] Integration with CI/CD pipelines
