# PRD: Third-party Application Installation

**Issue**: [#250](https://github.com/vfarcic/dot-ai/issues/250)
**Status**: Draft
**Priority**: High
**Created**: 2025-12-04

---

## Problem Statement

Users cannot install third-party applications (Argo CD, Crossplane, Prometheus, Cert-Manager, etc.) through the MCP. Currently, they must:

1. Manually search for the appropriate Helm chart and repository
2. Understand complex values.yaml files (often 500+ configurable options)
3. Determine which values are important for their use case
4. Run helm install commands separately

This creates a fragmented experience where deploying workloads uses the intelligent `recommend` tool, but installing platform tooling requires manual effort outside the system.

## Solution Overview

Extend the `recommend` tool to handle third-party application installation via Helm charts. When users express intent to install a third-party tool (e.g., "Install Argo CD", "Set up Crossplane"), the system will:

1. Detect the intent as a third-party installation (vs. deploying with existing capabilities)
2. Search ArtifactHub API to find the official or commonly-used Helm chart
3. Analyze chart values and documentation to generate intelligent questions
4. Provide cluster-aware defaults (e.g., suggest available IngressClasses, StorageClasses)
5. Validate installation via Helm dry-run
6. Execute Helm install upon user confirmation

The user experience remains identical to existing `recommend` workflows: specify intent → answer questions → review → deploy.

## User Journey

### Current State (Manual Process)
```
User: "I need Argo CD for GitOps"
→ User searches Google for "Argo CD Helm chart"
→ User finds chart, adds repo: helm repo add argo https://argoproj.github.io/argo-helm
→ User reads values.yaml (500+ lines) trying to understand options
→ User guesses at important values
→ User runs: helm install argocd argo/argo-cd -n argocd --create-namespace
→ User hopes it works
```

### Target State (With This Feature)
```
User: "Install Argo CD"
→ recommend tool detects third-party installation intent
→ System queries ArtifactHub API, finds official argo/argo-cd chart
→ AI analyzes values.yaml + README, generates smart questions:
   - Required: (none for this chart)
   - Basic: Namespace? HA mode? Ingress enabled?
   - Advanced: Redis configuration? Resource limits?
→ AI checks cluster: "I see nginx IngressClass available, using that as default"
→ User answers questions (or accepts defaults)
→ AI generates helm command, runs dry-run validation
→ User reviews and confirms
→ Helm install executes
```

## Technical Design

### Intent Detection and Routing

The `recommend` tool's initial stage will be enhanced to classify intents:

1. **Existing capability match**: Intent matches discovered cluster CRDs/operators → current flow
2. **Third-party installation**: Intent is to install infrastructure tooling → new Helm flow
3. **Ambiguous**: Could be either → AI asks for clarification

Detection signals for third-party installation:
- Keywords: "install", "set up", "add to cluster", "deploy [tool name]"
- Known tool names: Argo CD, Crossplane, Prometheus, Grafana, Cert-Manager, etc.
- No matching cluster capability found

### Helm Chart Discovery

**Primary: ArtifactHub API**

When third-party installation is detected, query the ArtifactHub API:

```bash
# Search for charts
curl "https://artifacthub.io/api/v1/packages/search?ts_query_web=argo+cd&kind=0"

# Get chart details (includes values schema, README, repo URL)
curl "https://artifacthub.io/api/v1/packages/helm/{repo}/{chart}"
```

ArtifactHub provides:
- Repository URL and chart name
- Available versions
- Values schema (JSON Schema format when available)
- README content
- Maintainer information (helps identify official charts)

**Fallback: AI Client Web Search**

If ArtifactHub search returns no results:
```json
{
  "status": "chart_search_required",
  "searchQuery": "[tool name] official helm chart repository",
  "instruction": "Search for this chart and provide: repository URL, chart name, and version. Then call recommend again with chartInfo parameter."
}
```

### Question Generation

AI analyzes values.yaml (via `helm show values`) and README (from ArtifactHub or `helm show readme`) to categorize questions:

**Required**: Values explicitly marked required or that cause chart failure if missing
- Often none for well-designed charts

**Basic**: Common configuration choices most users care about
- Namespace (AI suggests, user can change)
- Release name (AI suggests based on chart name, user can change)
- High availability mode
- Ingress/exposure settings
- Persistence settings

**Advanced**: Fine-tuning options for specific needs
- Resource limits/requests
- Node selectors/tolerations
- Authentication/SSO configuration
- Backup settings

**No "Open" question**: Unlike existing `recommend` flow, third-party installs don't need free-text enhancement (the chart defines what's possible)

### Cluster-Aware Defaults

Before presenting questions, AI queries cluster state to provide intelligent defaults:

- `kubectl get ingressclass` → suggest available ingress classes
- `kubectl get storageclass` → suggest available storage classes
- `kubectl get nodes --show-labels` → inform node selector options
- `kubectl get namespaces` → check if target namespace exists

### Validation and Deployment

1. **Generate Helm command**: Based on user answers, construct `helm upgrade --install` with appropriate `--set` flags or values file
2. **Dry-run validation**: `helm upgrade --install --dry-run` to validate before execution
3. **User confirmation**: Present what will be installed, ask for confirmation (same pattern as existing `deployManifests` stage)
4. **Execution**: Run actual `helm upgrade --install`
5. **Status reporting**: Return installation status, any warnings, next steps

### Session Data Structure

New session type for Helm installations (prefix: `helm-`):

```typescript
interface HelmInstallationData {
  intent: string;
  chartInfo: {
    repository: string;      // e.g., "https://argoproj.github.io/argo-helm"
    repositoryName: string;  // e.g., "argo"
    chartName: string;       // e.g., "argo-cd"
    version?: string;        // e.g., "5.46.0"
    appVersion?: string;     // e.g., "2.8.0"
  };
  questions: {
    required?: Question[];
    basic?: Question[];
    advanced?: Question[];
  };
  answers: Record<string, any>;
  generatedValues: Record<string, any>;
  helmCommand: string;
  namespace: string;
  releaseName: string;
  timestamp: string;
}
```

### Integration with Existing Stages

The workflow reuses existing `recommend` tool stages with internal routing:

| Stage | Existing Behavior | Helm Installation Behavior |
|-------|------------------|---------------------------|
| recommend | Analyze intent, find cluster capabilities | Analyze intent, search ArtifactHub for Helm chart |
| chooseSolution | Select from multiple solutions | Select chart version or alternative charts (if multiple found) |
| answerQuestion:required | Configure required values | Configure required Helm values |
| answerQuestion:basic | Configure basic values | Configure basic Helm values (namespace, release name, HA, etc.) |
| answerQuestion:advanced | Configure advanced values | Configure advanced Helm values |
| generateManifests | Generate YAML, kubectl dry-run | Generate Helm command, helm dry-run |
| deployManifests | kubectl apply | helm upgrade --install |

### New Tool Parameters

Extend `recommend` tool input schema:

```typescript
// Existing parameters remain unchanged
// Add optional chartInfo for fallback scenario:
chartInfo: z.object({
  repository: z.string(),
  chartName: z.string(),
  version: z.string().optional()
}).optional().describe('Manual chart specification when ArtifactHub search fails')
```

## Success Criteria

1. **Unified Experience**: Users can install third-party tools using the same "intent → questions → deploy" flow as existing `recommend` functionality
2. **Intelligent Defaults**: System provides cluster-aware suggestions that reduce configuration effort
3. **Validation**: All installations are validated via Helm dry-run before execution
4. **Any Helm Chart**: System can handle arbitrary Helm charts via ArtifactHub, not just a curated list
5. **Documentation Awareness**: AI uses chart README to generate meaningful questions, not just raw values

## Out of Scope

- **Upgrades/uninstalls**: Handled by `operate` tool (follow-up PRD required)
- **OLM/Operator Lifecycle Manager**: Only Helm charts for initial implementation
- **Private chart repositories**: Only public repos initially (authentication not supported)
- **Capabilities/patterns/policies**: Not used for third-party installations

## Dependencies

- ArtifactHub API availability (public, no auth required)
- Helm CLI available in execution environment
- Cluster connectivity for capability detection and deployment

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| ArtifactHub search returns wrong chart | AI validates chart matches intent; present alternatives; user confirms before install |
| Complex values.yaml overwhelms AI | Focus on README + common patterns; fall back to sensible defaults |
| Chart installation fails | Dry-run validation catches most issues; clear error reporting |
| Security concerns with arbitrary charts | Note in response that user should verify chart source; consider future blocklist |
| ArtifactHub API unavailable | Fallback to AI client web search |

## Follow-up Work

After completing this PRD, create a new PRD for:
- **Operate tool Helm support**: Enable `operate` tool to upgrade, rollback, and uninstall Helm releases installed via this feature

---

## Milestones

- [ ] Intent detection: Enhance `recommend` tool to classify third-party installation intents and route appropriately
- [ ] Helm chart discovery: Implement ArtifactHub API integration with fallback to AI client web search
- [ ] Question generation: AI analyzes chart values and README to generate categorized questions with cluster-aware defaults
- [ ] Validation flow: Implement Helm dry-run validation and user confirmation step
- [ ] Helm execution: Implement helm upgrade --install with proper error handling and status reporting
- [ ] Integration tests: Comprehensive tests covering the full workflow
- [ ] Follow-up PRD: Create PRD for `operate` tool Helm support (upgrades, rollbacks, uninstalls)

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-04 | PRD created |
