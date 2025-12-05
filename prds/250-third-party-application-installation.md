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

## Design Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-04 | **Helm detection after capability analysis**: Detection happens after AI analyzes available capabilities, not as upfront intent classification | AI needs full context (capabilities + intent) to determine if Helm is needed. "Deploy PostgreSQL" could use CNPG if installed or need Helm if not - can't know without checking capabilities first |
| 2025-12-04 | **Unified solutions response format**: Helm solutions use same `solutions` array with `type: "helm"` and `chart` info instead of `resources` | User workflow stays identical for both flows. Client agents don't need special handling. Simpler architecture |
| 2025-12-04 | **Presence-based detection**: `helmRecommendation` object presence indicates Helm needed (no boolean flag) | Simpler logic - mutually exclusive: either `solutions` has items OR `helmRecommendation` is present |
| 2025-12-04 | **Automatic ArtifactHub search**: When Helm detected, system automatically searches ArtifactHub and returns chart solutions - no intermediate "Helm recommended" state | Seamless UX - user always sees actionable solutions, internal detection is invisible |
| 2025-12-05 | **Cluster-aware defaults implemented**: Both capability and Helm question generation flows include cluster context (IngressClass, StorageClass with defaults marked, namespaces, node labels) to inform suggested answers | Unified approach for both flows. Enables intelligent defaults like suggesting the default IngressClass for ingress-related questions |
| 2025-12-05 | **Simple ArtifactHub search queries**: AI generates single tool name search queries (e.g., "prometheus") not compound queries (e.g., "prometheus alertmanager helm chart") | ArtifactHub search doesn't handle complex queries well - compound queries return irrelevant results |
| 2025-12-05 | **Bundle preference for multi-tool intents**: When user intent mentions multiple tools (e.g., "prometheus with alertmanager"), chart selection prefers bundle charts (e.g., kube-prometheus-stack) | Avoids need for multi-chart solutions while still fulfilling compound intents |

---

## Milestones

- [x] Intent detection: Enhance `recommend` tool to classify third-party installation intents and route appropriately
- [x] Helm chart discovery: Implement ArtifactHub API integration with fallback to AI client web search
- [x] Question generation: AI analyzes chart values and README to generate categorized questions with cluster-aware defaults (IngressClass, StorageClass, etc.)
- [x] Question generation tests: Add integration tests for Helm question generation flow
- [x] Validation flow: Implement Helm dry-run validation and user confirmation step
- [x] Helm execution: Implement helm upgrade --install with proper error handling and status reporting
- [x] Integration tests: Comprehensive tests covering the full workflow
- [ ] Follow-up PRD: Create PRD for `operate` tool Helm support (upgrades, rollbacks, uninstalls)

---

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-04 | PRD created |
| 2025-12-04 | Intent detection foundation: Added Helm fallback detection to resource-selection prompt, HelmRecommendation/SolutionResult types in schema.ts, updated findBestSolutions to return SolutionResult, added Helm branch placeholder in recommend.ts |
| 2025-12-04 | Helm chart discovery complete: Created `src/core/artifacthub.ts` (ArtifactHub API client), `src/core/helm-types.ts` (type definitions), `prompts/helm-chart-selection.md` (AI chart selection prompt). Updated `recommend.ts` with full Helm flow: ArtifactHub search → AI analysis/scoring → session creation → solutions response. Added "no charts found" fallback with GitHub issue link. Removed unused `analysis` field from ResourceSolution. Added integration tests for Helm discovery (existing chart + non-existing chart). All 3 recommend tests pass. |
| 2025-12-05 | Question generation complete: Refactored `prompts/question-generation.md` to use `{{source_material}}` template variable (works for both capabilities and Helm). Added `generateQuestionsForHelmChart()` and `fetchHelmChartContent()` methods to `src/core/schema.ts` - fetches values.yaml and README via helm CLI. Updated `src/tools/choose-solution.ts` to generate questions when Helm solution is chosen (lazy generation). Exposed new method in `src/core/index.ts`. Improved Helm discovery test to use specific hard-coded values for prometheus-community chart. |
| 2025-12-05 | Cluster-aware defaults implemented: Updated `prompts/question-generation.md` with "Cluster Context" header and "Determining Suggested Answers" section. Enhanced `discoverClusterOptions()` in `src/core/schema.ts` to mark default IngressClass/StorageClass with new `ClusterResourceInfo` interface. Created shared `formatClusterOptionsText()` method. Wired cluster context into both capability and Helm question generation flows. |
| 2025-12-05 | ArtifactHub search improvements: Updated `prompts/resource-selection.md` with searchQuery construction rules (simple tool names only, no compound queries). Updated `prompts/helm-chart-selection.md` to prefer bundle charts when intent mentions multiple tools. Fixed issue where "prometheus with alertmanager" returned irrelevant results. |
| 2025-12-05 | Question generation tests complete: Extended existing Helm discovery test in `tests/integration/tools/recommend.test.ts` to cover full Helm workflow (discovery → chooseSolution → question generation through all stages). Test validates: questions have proper structure with `suggestedAnswer` fields, namespace question exists (fundamental for Helm). Increased infrastructure timeouts (CNPG/Kyverno from 180s to 480s) for slower environments. All 3 recommend tests passing. |
| 2025-12-05 | Validation and execution flow complete: Renamed `prompts/manifest-generation.md` to `prompts/capabilities-generation.md`. Created `prompts/helm-generation.md` for AI values.yaml generation. Created `src/core/helm-utils.ts` with shared utilities (buildHelmCommand, validateHelmDryRun, deployHelmRelease, etc.). Updated `src/tools/generate-manifests.ts` with Helm branch: fetches chart values → AI generates values.yaml → saves to file → validates via `helm --dry-run` with 10-attempt retry loop. Updated `src/tools/deploy-manifests.ts` with Helm execution: adds repo → runs `helm upgrade --install --wait`. Fixed `src/tools/answer-question.ts` to return `ready_for_manifest_generation` when Helm completes advanced stage (skips 'open' stage). Updated Dockerfile: added Helm binary and ca-certificates for TLS verification. Extended integration test to cover full Helm workflow through generateManifests stage. All 3 tests passing. |
