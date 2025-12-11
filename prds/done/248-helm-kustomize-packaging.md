# PRD #248: Helm/Kustomize Packaging for Recommendations

**Status**: Complete
**Created**: 2025-12-03
**Priority**: High
**Issue**: [#248](https://github.com/vfarcic/dot-ai/issues/248)
**Dependencies**: None
**Enables**: #202 (GitOps Integration) - this PRD is a prerequisite along with #226 (GitHub Actions CI/CD)

---

## Problem Statement

The `recommend` tool currently outputs plain Kubernetes YAML manifests. This approach has several limitations:

1. **Not GitOps-Ready**: Raw YAML files don't follow GitOps conventions where applications are typically packaged as Helm charts or Kustomize overlays
2. **No Configuration Separation**: All values are hardcoded in manifests rather than externalized for environment-specific customization
3. **Manual Packaging Required**: Users must manually organize and package manifests before storing in Git repositories
4. **Blocks GitOps Integration**: PRD #202 (GitOps Integration) cannot effectively push manifests to Git without proper packaging

Users following GitOps practices need recommendations output in a format ready for version control and GitOps tool consumption.

---

## Solution Overview

Enhance the recommendation workflow to:

1. **Add Required Question**: Ask users to choose output format (Helm, Kustomize, or raw YAML) as part of the required questions stage
2. **Generate Packaged Output**: Based on selection, output properly structured Helm chart or Kustomize overlay
3. **Externalize Configuration**: Extract user-provided answers (non-skipped) into `values.yaml` (Helm) or patches/configMapGenerator (Kustomize)
4. **Prompt for Save Location**: Ask users where they want to save the packaged output

This enables the natural flow: **Choose format → Generate package → Save to Git → Deploy via GitOps**

---

## User Stories

### As a Platform Engineer
- I want recommendations packaged as Helm charts so they integrate with our Helm-based GitOps workflow
- I want configuration values externalized so I can customize per environment

### As a Developer Using Kustomize
- I want recommendations as Kustomize overlays so they fit our existing Kustomize structure
- I want base manifests with patches so I can layer environment-specific changes

### As a User Who Prefers Raw YAML
- I want the option to get raw manifests (current behavior) when I don't need packaging
- I don't want to be forced into Helm/Kustomize if my workflow doesn't require it

---

## Success Criteria

### Must Have
- [ ] New required question: "Output format" with options: Helm, Kustomize, Raw YAML
- [ ] Helm output: Complete chart structure with Chart.yaml, values.yaml, templates/
- [ ] Kustomize output: Base manifests with kustomization.yaml
- [ ] values.yaml / patches populated from user-provided answers (non-skipped only)
- [ ] Raw YAML option maintains current behavior (no breaking changes)
- [ ] Question asking where to save the output (path/directory)

### Nice to Have
- [ ] Helm chart includes helpful comments in values.yaml explaining each value
- [ ] Kustomize output includes example overlay structure
- [ ] Validation that generated Helm chart passes `helm lint`
- [ ] Validation that Kustomize output passes `kustomize build`

### Out of Scope
- Auto-detection of Flux/ArgoCD (handled by #202)
- Git push operations (handled by #202)
- Multi-environment generation (future enhancement)
- Helm repository publishing

---

## Technical Approach

### Question Integration

Add to required questions stage in recommend workflow:

```typescript
// New required question
{
  id: 'outputFormat',
  question: 'How would you like the manifests packaged?',
  options: [
    { value: 'helm', label: 'Helm Chart', description: 'Complete Helm chart with values.yaml' },
    { value: 'kustomize', label: 'Kustomize', description: 'Base manifests with kustomization.yaml' },
    { value: 'raw', label: 'Raw YAML', description: 'Plain Kubernetes manifests (current behavior)' }
  ],
  default: 'raw'
}

// Save location question (shown after format selection)
{
  id: 'outputPath',
  question: 'Where would you like to save the output?',
  type: 'text',
  placeholder: './my-app' // or appropriate default
}
```

### Helm Chart Structure

When `outputFormat: 'helm'` is selected:

```
<outputPath>/
├── Chart.yaml
├── values.yaml          # Populated from user answers
├── templates/
│   ├── deployment.yaml  # With {{ .Values.xxx }} references
│   ├── service.yaml
│   ├── configmap.yaml
│   └── ...
└── .helmignore
```

**values.yaml Generation**:
- Each non-skipped user answer becomes a value
- Manifests reference these values using Helm templating
- Comments explain what each value controls

Example:
```yaml
# values.yaml
replicaCount: 3           # From answer: "How many replicas?"
image:
  repository: nginx       # From answer: "Container image?"
  tag: "1.21"
resources:
  limits:
    cpu: "500m"          # From answer: "CPU limit?"
    memory: "512Mi"      # From answer: "Memory limit?"
```

### Kustomize Structure

When `outputFormat: 'kustomize'` is selected:

```
<outputPath>/
├── kustomization.yaml
├── base/
│   ├── deployment.yaml   # Base manifests
│   ├── service.yaml
│   └── kustomization.yaml
└── README.md             # Instructions for creating overlays
```

**kustomization.yaml Generation**:
- Uses patches or configMapGenerator for user-provided values
- Base manifests contain defaults
- Clear structure for adding environment overlays

Example:
```yaml
# kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - base/

patches:
  - patch: |-
      - op: replace
        path: /spec/replicas
        value: 3
    target:
      kind: Deployment
      name: my-app

configMapGenerator:
  - name: app-config
    literals:
      - LOG_LEVEL=info    # From user answer
```

### Raw YAML (Current Behavior)

When `outputFormat: 'raw'` is selected:
- Maintain existing behavior exactly
- No changes to current manifest generation
- Ensures backward compatibility

---

## Architecture Decisions

### Decision 1: Raw Manifests Generated First (Always)

**Decision**: Raw YAML manifests are always generated and validated first, regardless of output format. Helm/Kustomize packaging is a post-processing step applied to validated manifests.

**Rationale**:
- `kubectl dry-run` validation catches errors in generated YAML - this validation is critical for all formats
- Helm/Kustomize don't generate new manifests; they package existing ones
- AI generates Kubernetes resource content; packaging is a transformation layer
- Allows same validation retry loop for all formats

**Flow**:
```
User answers → AI generates raw YAML → kubectl dry-run validates → Retry if needed
                                                                        ↓
                                                              Valid raw manifests
                                                                        ↓
                                              ┌─────────────────────────┼─────────────────────────┐
                                              ↓                         ↓                         ↓
                                         raw: return as-is    helm: package as chart    kustomize: package as overlay
```

### Decision 2: AI-Driven Packaging (Not Deterministic Code)

**Decision**: Use AI to convert raw manifests + user answers into Helm charts or Kustomize overlays, rather than deterministic code transformation.

**Rationale**:
- No programmatic way to map question/answer to manifest field (e.g., `replicas: 3` could match multiple places in YAML)
- AI has semantic understanding - it generated both the questions and the manifests, so it knows the relationship
- Deterministic approach would require explicit metadata mapping that doesn't exist in current architecture

**Constraints for AI**:
1. AI chooses which answers should become variables (not all should - e.g., `protocol: TCP` is static)
2. AI may ONLY use provided user answers as variables - no inventing new variables
3. AI receives: raw manifests, questions/answers, user intent, solution description

### Decision 3: Single Prompt Template with Format Placeholder

**Decision**: Use one prompt template for both Helm and Kustomize packaging, with placeholders for format-specific instructions.

**Template Structure**:
```markdown
## User Intent
{INTENT}

## Solution Description
{SOLUTION_DESCRIPTION}

## Raw Manifests (Validated)
{RAW_MANIFESTS}

## User Configuration (Questions and Answers)
{QUESTIONS_AND_ANSWERS}

## Instructions
Generate a {OUTPUT_FORMAT} package...
{FORMAT_SPECIFIC_INSTRUCTIONS}
```

### Decision 4: New Response Structure (Files Array)

**Decision**: Change `generateManifests` response from single `manifests` string to `files` array with `relativePath` and `content` for each file.

**Rationale**:
- Helm/Kustomize require multiple files (Chart.yaml, values.yaml, templates/, etc.)
- MCP tools return JSON; client agent handles file writing
- Unified structure works for all formats (raw is just single file)

**New Structure**:
```typescript
{
  success: true,
  status: 'manifests_generated',
  solutionId: 'sol-xxx',
  outputFormat: 'helm',  // 'raw' | 'helm' | 'kustomize'
  outputPath: './my-app',
  files: [
    { relativePath: 'Chart.yaml', content: '...' },
    { relativePath: 'values.yaml', content: '...' },
    { relativePath: 'templates/deployment.yaml', content: '...' }
  ],
  validationAttempts: 1,
  timestamp: '...'
}
```

**No Backward Compatibility Needed**: `deployManifests` stage reads from session storage and disk, not from `generateManifests` response.

### Decision 5: Validation Strategy Per Format

| Format | Validation Method |
|--------|-------------------|
| Raw YAML | `kubectl apply --dry-run=server` (current) |
| Helm Chart | `helm template ./chart \| kubectl apply --dry-run=server -f -` |
| Kustomize | `kustomize build ./dir \| kubectl apply --dry-run=server -f -` |

All formats ultimately validate rendered YAML through kubectl dry-run.

---

## Implementation Phases

### Phase 1: Question Integration
- [x] Add `outputFormat` to required questions schema
- [x] Add `outputPath` question (text input)
- [x] Update recommend workflow to collect these answers
- [x] Pass format selection to manifest generation stage
- [x] Update `generateManifests` response to use `files` array structure
- [x] Add `agentInstructions` for client agent file writing guidance

### Phase 2: Helm Chart Generation
- [x] Create Helm chart structure generator
- [x] Implement values.yaml generation from user answers
- [x] Convert manifests to Helm templates with value references
- [x] Generate Chart.yaml with solution metadata
- [x] Add helm lint validation (nice to have)

### Phase 3: Kustomize Generation
- [x] Create Kustomize structure generator
- [x] Implement base manifest generation
- [x] Generate kustomization.yaml with patches from user answers
- [x] Add kustomize build validation (nice to have)

### Phase 4: Integration & Testing
- [x] Integration tests for Helm output format
- [x] Integration tests for Kustomize output format
- [x] Test with various solution types (simple deployments, stateful apps, etc.)
- [x] Ensure raw YAML maintains exact current behavior
- [x] Update documentation

---

## Dependencies

### This PRD Enables
- **#202 (GitOps Integration)**: Requires packaged output before Git push makes sense
- **#228 (Deployment Documentation)**: May affect documentation format considerations

### External Dependencies
- None - uses standard Helm/Kustomize formats

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex manifests may not template cleanly | Medium | Start with common patterns, iterate based on feedback |
| User answers may not map cleanly to values | Medium | Define clear mapping rules, handle edge cases gracefully |
| Breaking changes to existing workflow | High | Raw YAML option ensures backward compatibility |
| Helm/Kustomize versions compatibility | Low | Target widely-supported versions (Helm 3, Kustomize v4+) |

---

## Open Questions

1. ~~**Default Format**: Should `raw` remain the default, or should we encourage Helm/Kustomize?~~ **RESOLVED**: `raw` remains default for backward compatibility
2. **Chart Naming**: How to derive chart name - from solution name, user input, or app name answer?
3. **Kustomize Overlay Examples**: Should we generate example overlay directories (dev/staging/prod)?
4. ~~**Save Behavior**: Should saving be automatic or require explicit user confirmation?~~ **RESOLVED**: MCP returns files array; client agent handles file writing based on `outputPath`

---

## Milestones

- [x] **M1**: Required questions for format and path integrated into workflow
- [x] **M2**: Helm chart generation working with values.yaml from answers
- [x] **M3**: Kustomize generation working with patches from answers
- [x] **M4**: All three formats tested and documented
- [x] **M5**: PRD #202 unblocked and can proceed with GitOps integration

---

## Progress Log

### 2025-12-03: PRD Created
- PRD created based on discussion about GitOps-ready output formats
- Identified as prerequisite for #202 (GitOps Integration)
- Defined three output options: Helm, Kustomize, Raw YAML
- Established approach for extracting user answers into values/patches

### 2025-12-10: Phase 1 Question Integration (Partial)
**Completed PRD Items**:
- [x] Add `outputFormat` to required questions schema
- [x] Add `outputPath` question (text input)

**Implementation Details**:
- Added `OUTPUT_FORMAT_QUESTION` and `OUTPUT_PATH_QUESTION` constants in `src/core/schema.ts`
- Created `injectPackagingQuestions()` function to programmatically inject these questions into capability-based solutions (not Helm chart solutions)
- Questions are injected after AI generates questions, ensuring consistent presence
- `outputFormat` options: `raw`, `helm`, `kustomize` (default: `raw`)
- `outputPath` default: `./manifests`

**Testing Updates**:
- Updated `tests/integration/tools/recommend.test.ts` to validate:
  - Capability-based solutions HAVE `outputFormat` and `outputPath` questions
  - Helm chart solutions do NOT have these questions (format is implicitly Helm)

**Design Decision**:
- Packaging questions only apply to capability-based solutions (raw K8s manifests)
- Helm chart solutions already have an implicit format - no need to ask

**Next Steps**:
- Implement routing in `generate-manifests` based on `outputFormat` answer
- Implement Helm chart structure generation (Phase 2)
- Implement Kustomize structure generation (Phase 3)

### 2025-12-10: Architecture Decisions Finalized

**Key Design Decisions Made**:

1. **Raw manifests always generated first**: Helm/Kustomize packaging is post-processing on validated YAML
   - Enables consistent validation via `kubectl dry-run` for all formats
   - Packaging is a transformation layer, not a generation step

2. **AI-driven packaging**: Cannot programmatically map question/answer to manifest fields
   - AI has semantic understanding of what it generated
   - AI decides which answers should become variables (not all should)
   - AI constrained to ONLY use provided user answers as variables

3. **Single prompt template**: One prompt for both Helm/Kustomize with format placeholder
   - Reduces duplication
   - Includes intent and solution description for context

4. **New response structure**: `files` array replaces `manifests` string
   - `files: [{ relativePath, content }, ...]` works for all formats
   - No backward compatibility needed (`deployManifests` reads from session/disk)
   - Client agent handles file writing based on response

5. **Incremental implementation strategy**:
   - Step 1: Update raw manifest generation to new `files` array structure
   - Step 2: Run all integration tests to validate
   - Step 3: Add Helm/Kustomize packaging on stable foundation

**Implementation Approach**:
- Update `generate-manifests.ts` response structure first (raw format)
- Validate with existing tests before adding packaging complexity
- Create `prompts/packaging-generation.md` for AI packaging prompt

### 2025-12-10: Phase 1 Step 1 - New Response Structure Implemented

**Completed Items**:
- [x] Updated `generateManifests` response structure to use `files` array
- [x] Added `outputFormat` and `outputPath` fields extracted from user answers
- [x] Added `agentInstructions` field to guide client agent on file writing
- [x] Updated integration tests to validate new structure
- [x] All integration tests passing

**Response Structure Change** (`src/tools/generate-manifests.ts:677-694`):

Old structure:
```typescript
{
  manifests: string,      // Single YAML string
  yamlPath: string        // Informational path
}
```

New structure:
```typescript
{
  outputFormat: 'raw',    // From user answer (default: 'raw')
  outputPath: './manifests',  // From user answer (default: './manifests')
  files: [
    { relativePath: 'manifests.yaml', content: '<yaml>' }
  ],
  agentInstructions: 'Write the files to "./manifests". If immediate deployment is desired, call the recommend tool with stage: "deployManifests".'
}
```

**Key Design Points**:
- `yamlPath` removed from response (was purely informational, `deployManifests` constructs path from `solutionId`)
- Internal tmp file still written for `deployManifests` compatibility
- `files` array ready for multi-file output (Helm charts, Kustomize overlays)
- `agentInstructions` tells client to write files to user's chosen location

**Prompt Improvements** (unrelated but fixed during testing):
- `prompts/intent-analysis.md`: Made `enhancementPotential` enum stricter with `<ENUM: HIGH | MEDIUM | LOW>`
- `prompts/question-generation.md`: Added CRITICAL note that `suggestedAnswer` is required

**Next Steps**:
- Phase 2: Implement Helm chart packaging (detect `outputFormat: 'helm'`, call AI packaging prompt, return multi-file structure)
- Phase 3: Implement Kustomize packaging

### 2025-12-10: Phase 2 - Helm Chart Generation Complete

**Completed PRD Items**:
- [x] Create Helm chart structure generator
- [x] Implement values.yaml generation from user answers
- [x] Convert manifests to Helm templates with value references
- [x] Generate Chart.yaml with solution metadata
- [x] Integration tests for Helm output format
- [x] **M2**: Helm chart generation working with values.yaml from answers

**Implementation Details**:

1. **New Files Created**:
   - `prompts/packaging-generation.md` - AI prompt template supporting both Helm and Kustomize with format-specific placeholders
   - `src/core/packaging.ts` - Packaging module with:
     - `packageManifests()` function for AI-driven packaging
     - Format-specific instructions for Helm (HELM_FORMAT_INSTRUCTIONS, HELM_FORMAT_EXAMPLE)
     - Format-specific instructions for Kustomize (ready for Phase 3)
     - JSON response parsing for files array

2. **Modified Files**:
   - `src/tools/generate-manifests.ts`:
     - Added `renderPackageToYaml()` - Renders Helm chart to raw YAML via `helm template`
     - Added `writePackageFiles()` - Writes package files to temp directory
     - Added `packageAndValidate()` - Packaging with validation retry loop (max 5 attempts)
     - Updated validation success block to route based on `outputFormat` from user answers
   - `tests/integration/tools/recommend.test.ts`:
     - Added "Helm Packaging (outputFormat: helm)" test suite
     - Test validates Chart.yaml, values.yaml, and templates/*.yaml structure
     - Test verifies Helm templating syntax ({{ .Values.xxx }})

3. **Architecture Implementation**:
   - Raw manifests are generated and validated first (Decision 1)
   - AI packaging transforms validated manifests into Helm chart (Decision 2)
   - Single prompt template with format placeholders (Decision 3)
   - Files array response structure (Decision 4)
   - Validation via `helm template | kubectl dry-run` (Decision 5)

**Flow**:
```
Raw manifests validated → Check outputFormat →
  If 'helm': AI packaging → helm template → validateManifests() → Return files array
  If 'raw': Return as-is (existing behavior)
```

**Test Results**:
```
✓ should return no_charts_found when chart does not exist on ArtifactHub (4459ms)
✓ should complete Helm workflow: discovery → choose solution → question generation (89180ms)
✓ should generate Helm chart structure when outputFormat is helm (92574ms)
✓ should complete full workflow: clarification → solutions → choose → answer → generate → deploy (114733ms)
4 passed
```

**Next Steps**:
- Phase 3: Implement Kustomize packaging (structure already prepared in packaging.ts)
- ~~Add helm lint validation (nice to have)~~ ✅ Done
- Update documentation

### 2025-12-10: Phase 2 Enhancements - Helm Lint & JSON Parsing Fix

**Completed PRD Items**:
- [x] Add helm lint validation (nice to have)

**Implementation Details**:

1. **Helm Lint Validation** (`src/tools/generate-manifests.ts:131-180`):
   - Added `helmLint()` function that runs `helm lint` on chart directory
   - Integrated into `packageAndValidate()` after writing files, before `helm template`
   - Lint failures trigger AI retry loop with error context
   - Warnings are logged but don't fail validation
   - Catches structural issues like hyphenated keys in label references

2. **Bug Fix - JSON Parsing Regex** (`src/core/packaging.ts:204`):
   - **Problem**: AI-generated README files with nested code blocks (e.g., `bash` examples) caused JSON parsing failures
   - **Root Cause**: Lazy regex `*?` matched first closing ``` inside README content instead of actual JSON end
   - **Fix**: Changed to greedy `*` with `$` anchor: `/```(?:json)?\s*([\s\S]*)```\s*$/`
   - **Impact**: Reduced packaging retries from ~17 attempts to 1-2 attempts
   - **Performance**: Helm packaging test improved from 303s to 79s (3.8x faster)

**Validation Flow**:
```
Raw manifests validated → Check outputFormat →
  If 'helm': AI packaging → writePackageFiles → helm lint → helm template → kubectl dry-run
```

**Test Results** (after fixes):
```
✓ should return no_charts_found when chart does not exist on ArtifactHub (4635ms)
✓ should generate Helm chart structure when outputFormat is helm (79411ms)  ← Was 303141ms
✓ should complete Helm workflow: discovery → choose solution → question generation (95597ms)
✓ should complete full workflow: clarification → solutions → choose → answer → generate → deploy (118768ms)
4 passed - Duration: 119.32s (was 303.69s)
```

**Next Steps**:
- ~~Phase 3: Implement Kustomize packaging~~ ✅ Done

### 2025-12-10: Phase 3 - Kustomize Generation Complete

**Completed PRD Items**:
- [x] Create Kustomize structure generator
- [x] Implement base manifest generation
- [x] Generate kustomization.yaml with patches from user answers
- [x] Add kustomize build validation (via kubectl kustomize)
- [x] Integration tests for Kustomize output format
- [x] **M3**: Kustomize generation working with patches from answers

**Implementation Details**:

1. **Kustomize Format Instructions** (`src/core/packaging.ts`):
   - Production-ready structure with `base/` directory for environment extensibility
   - `base/kustomization.yaml` - Lists all base resource files
   - `base/*.yaml` - Base Kubernetes manifests (deployment.yaml, service.yaml, etc.)
   - Root `kustomization.yaml` - Default overlay referencing base with user customizations
   - JSON patch format for customizations based on user answers

2. **Validation via kubectl** (`src/tools/generate-manifests.ts:576`):
   - Changed from `kustomize build` to `kubectl kustomize` (kubectl has kustomize built-in)
   - Docker image only had kubectl and helm binaries, not standalone kustomize
   - Same validation flow: render to YAML → kubectl dry-run validation

3. **Terminal Error Fast-Fail** (`src/tools/generate-manifests.ts`):
   - Added `isTerminalError` flag to `renderPackageToYaml()` return type
   - Detects infrastructure errors (e.g., "command not found", "ENOENT")
   - `packageAndValidate()` throws immediately on terminal errors instead of retrying
   - Prevents 100+ retry iterations on unrecoverable errors

4. **Integration Test** (`tests/integration/tools/recommend.test.ts`):
   - Added "Kustomize Packaging (outputFormat: kustomize)" test suite
   - Validates production structure: root kustomization.yaml, base/kustomization.yaml, base resources
   - Verifies base resources have proper Kind (Deployment, Service)
   - Test passes in ~134 seconds

**Kustomize Structure Generated**:
```
<outputPath>/
├── kustomization.yaml       # Root overlay with namespace & patches
├── base/
│   ├── kustomization.yaml   # Lists resources
│   ├── deployment.yaml      # Base deployment manifest
│   └── service.yaml         # Base service manifest
```

**Test Results**:
```
✓ should return no_charts_found when chart does not exist on ArtifactHub (4549ms)
✓ should generate Helm chart structure when outputFormat is helm (73746ms)
✓ should complete Helm workflow: discovery → choose solution → question generation (81946ms)
✓ should complete full workflow: clarification → solutions → choose → answer → generate → deploy (80773ms)
✓ should generate Kustomize structure when outputFormat is kustomize (86044ms)
5 passed - Duration: 134.25s
```

**Additional Fixes**:
- Updated `tests/integration/CLAUDE.md` with correct test filtering syntax (`-- -t` instead of `--testNamePattern`)
- Fixed `tests/integration/infrastructure/teardown-cluster.sh` to handle malformed user kubeconfig

**Next Steps**:
- Phase 4 remaining: Test with various solution types, ensure raw YAML maintains current behavior, update documentation

### 2025-12-11: Phase 4 Complete - Integration & Testing

**Completed PRD Items**:
- [x] Test with various solution types (simple deployments, stateful apps, etc.)
- [x] Ensure raw YAML maintains exact current behavior
- [x] Update documentation
- [x] **M4**: All three formats tested and documented
- [x] **M5**: PRD #202 unblocked and can proceed with GitOps integration

**Implementation Details**:

1. **Documentation Updates** (`docs/guides/mcp-recommendation-guide.md`):
   - Updated Example 1 with new response structures (5 database solutions instead of 3)
   - Added `outputFormat` and `outputPath` questions to required configuration
   - Added database configuration questions (provider, size, version)
   - Updated generateManifests output to show Kustomize overlays structure
   - Added overlay customization instructions (`image:` and `patches:`)

2. **Kustomize Structure Enhancement** (`src/core/packaging.ts`):
   - Updated structure to generate `overlays/production/` directory
   - Base manifests now have images WITHOUT tags (tag set in overlay)
   - Production overlay uses `images:` transformer for tag customization
   - Similar to Helm's `values.yaml` pattern for easy upgrades

3. **Integration Test Updates** (`tests/integration/tools/recommend.test.ts`):
   - Updated Kustomize test to validate overlays/production structure
   - Validates `images:` transformer in production overlay
   - Verifies base deployment image has no tag (tag in overlay)
   - Validates root kustomization.yaml points to overlays/production

4. **Verification**:
   - Confirmed Helm chart solutions do NOT get packaging questions (correct behavior)
   - `generateQuestionsForHelmChart()` does not call `injectPackagingQuestions()`
   - Packaging questions only apply to capability-based solutions

**Kustomize Structure Generated**:
```
<outputPath>/
├── kustomization.yaml              # Points to overlays/production
├── README.md
├── overlays/
│   └── production/
│       └── kustomization.yaml      # ← Edit this file to customize (images:, patches:)
└── base/
    ├── kustomization.yaml
    ├── deployment.yaml             # Image without tag (tag set in overlay)
    ├── service.yaml
    └── ...
```

**PRD Status**: COMPLETE - All phases and milestones achieved
