# PRD #248: Helm/Kustomize Packaging for Recommendations

**Status**: In Progress
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
- [ ] Create Helm chart structure generator
- [ ] Implement values.yaml generation from user answers
- [ ] Convert manifests to Helm templates with value references
- [ ] Generate Chart.yaml with solution metadata
- [ ] Add helm lint validation (nice to have)

### Phase 3: Kustomize Generation
- [ ] Create Kustomize structure generator
- [ ] Implement base manifest generation
- [ ] Generate kustomization.yaml with patches from user answers
- [ ] Add kustomize build validation (nice to have)

### Phase 4: Integration & Testing
- [ ] Integration tests for all three output formats
- [ ] Test with various solution types (simple deployments, stateful apps, etc.)
- [ ] Ensure raw YAML maintains exact current behavior
- [ ] Update documentation

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
- [ ] **M2**: Helm chart generation working with values.yaml from answers
- [ ] **M3**: Kustomize generation working with patches from answers
- [ ] **M4**: All three formats tested and documented
- [ ] **M5**: PRD #202 unblocked and can proceed with GitOps integration

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
