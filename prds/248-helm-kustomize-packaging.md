# PRD #248: Helm/Kustomize Packaging for Recommendations

**Status**: Draft
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

## Implementation Phases

### Phase 1: Question Integration
- [ ] Add `outputFormat` to required questions schema
- [ ] Add `outputPath` question (text input)
- [ ] Update recommend workflow to collect these answers
- [ ] Pass format selection to manifest generation stage

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

1. **Default Format**: Should `raw` remain the default, or should we encourage Helm/Kustomize?
2. **Chart Naming**: How to derive chart name - from solution name, user input, or app name answer?
3. **Kustomize Overlay Examples**: Should we generate example overlay directories (dev/staging/prod)?
4. **Save Behavior**: Should saving be automatic or require explicit user confirmation?

---

## Milestones

- [ ] **M1**: Required questions for format and path integrated into workflow
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
