# PRD: Global Annotations Support in Helm Chart

**Issue**: [#336](https://github.com/vfarcic/dot-ai/issues/336)
**Status**: In Progress
**Priority**: Low
**Created**: 2026-01-21

---

## Problem Statement

Helm charts in the dot-ai project family don't support custom annotations on all Kubernetes resources. Users cannot:

1. Use tools like [Reloader](https://github.com/stakater/Reloader) to trigger rolling updates when ConfigMaps/Secrets change
2. Add audit/compliance annotations required by organizational policies
3. Integrate with external-secrets-operator, sealed-secrets, or similar tools
4. Apply consistent metadata across all deployed resources

Currently, only some resources (e.g., Ingress, Gateway) support annotations, while core resources like Deployment, Service, ServiceAccount, and RBAC resources do not.

**Original Request**: [#333](https://github.com/vfarcic/dot-ai/issues/333)

## Solution Overview

Add a single global `annotations` entry in `values.yaml` that applies to **all** rendered Kubernetes resources. When a resource already has its own annotations (like `ingress.annotations`), the global annotations are merged with the resource-specific ones, with resource-specific annotations taking precedence.

### Values Configuration

```yaml
# Global annotations applied to ALL resources
annotations: {}
  # Example: Reloader integration
  # reloader.stakater.com/auto: "true"
  # Example: Compliance
  # company.com/managed-by: "platform-team"
```

### Merge Behavior

For resources with existing annotation support (Ingress, Gateway):
- Global annotations are applied first
- Resource-specific annotations override global ones if there's a key conflict

```yaml
# Example values.yaml
annotations:
  global-key: "global-value"
  shared-key: "from-global"

ingress:
  enabled: true
  annotations:
    shared-key: "from-ingress"  # This wins
    ingress-only: "specific"
```

Results in Ingress annotations:
```yaml
annotations:
  global-key: "global-value"      # From global
  shared-key: "from-ingress"      # Resource-specific wins
  ingress-only: "specific"        # From ingress
```

## User Journeys

### Journey 1: Enable Reloader for All Deployments

**Current State (Manual)**
```
User: "I want Reloader to restart pods when secrets change"
→ User must manually edit Deployment YAML after helm install
→ Or use post-renderer hooks
→ Annotation lost on next helm upgrade
```

**Target State (With This Feature)**
```yaml
# values.yaml
annotations:
  reloader.stakater.com/auto: "true"
```
→ All resources get the annotation
→ Persists across upgrades

### Journey 2: Compliance/Audit Annotations

**Current State**
```
User: "We need to tag all resources with our team ownership"
→ User must fork the chart or use kustomize overlays
→ Maintenance burden for chart updates
```

**Target State**
```yaml
annotations:
  company.com/owner: "platform-team"
  company.com/cost-center: "engineering"
```

## Technical Design

### Template Helper Function

Create a helper function in `_helpers.tpl` to merge global and resource-specific annotations:

```yaml
{{/*
Merge global annotations with resource-specific annotations.
Resource-specific annotations take precedence over global annotations.
Usage: {{ include "dot-ai.annotations" (dict "global" .Values.annotations "local" .Values.ingress.annotations) }}
*/}}
{{- define "dot-ai.annotations" -}}
{{- $merged := dict -}}
{{- if .global -}}
  {{- $merged = merge $merged .global -}}
{{- end -}}
{{- if .local -}}
  {{- $merged = merge $merged .local -}}
{{- end -}}
{{- if $merged -}}
  {{- toYaml $merged -}}
{{- end -}}
{{- end -}}
```

### Template Updates

Each template that creates a Kubernetes resource needs to include the global annotations. Example for Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "dot-ai.fullname" . }}
  labels:
    {{- include "dot-ai.labels" . | nindent 4 }}
  {{- with (include "dot-ai.annotations" (dict "global" .Values.annotations "local" nil) | fromYaml) }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
```

For Pod template (important for Reloader):

```yaml
template:
  metadata:
    labels:
      {{- include "dot-ai.selectorLabels" . | nindent 8 }}
    {{- with (include "dot-ai.annotations" (dict "global" .Values.annotations "local" nil) | fromYaml) }}
    annotations:
      {{- toYaml . | nindent 8 }}
    {{- end }}
```

### Resources to Update

All templates rendering Kubernetes resources:

| Template | Resource(s) | Notes |
|----------|------------|-------|
| `deployment.yaml` | Deployment, Pod template | Pod annotations critical for Reloader |
| `service.yaml` | Service | |
| `serviceaccount.yaml` | ServiceAccount | |
| `clusterrole.yaml` | ClusterRole | |
| `clusterrolebinding.yaml` | ClusterRoleBinding | |
| `secret.yaml` | Secret | |
| `mcpserver.yaml` | MCPServer, Pod template | ToolHive deployment mode |
| `httproute.yaml` | HTTPRoute | |
| `ingress.yaml` | Ingress | Merge with existing `ingress.annotations` |
| `gateway.yaml` | Gateway | Merge with existing `gateway.annotations` |

## Success Criteria

1. **Global Application**: Setting `annotations` in values.yaml applies annotations to all rendered resources
2. **Merge Behavior**: Resource-specific annotations override global ones on key conflict
3. **No Breaking Changes**: Existing configurations continue to work without modification
4. **Pod Annotations**: Reloader use case works (pod template annotations applied)
5. **Empty by Default**: `annotations: {}` produces no annotations (clean default output)

## Out of Scope

- **Per-resource annotation overrides**: Beyond what already exists (ingress, gateway)
- **Label management**: This PRD focuses on annotations only
- **Annotation validation**: No schema validation of annotation keys/values

## Applicability

This PRD applies to all dot-ai Helm charts:
- `dot-ai` (this repository)
- `dot-ai-ui`
- `dot-ai-controller`

The same pattern should be implemented consistently across all projects.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing deployments | Empty default `{}`, additive change only |
| Annotation key conflicts | Clear precedence: resource-specific > global |
| Template complexity | Single reusable helper function |

---

## Milestones

- [x] Create helper function for annotation merging in `_helpers.tpl`
- [x] Add `annotations: {}` to `values.yaml` with documentation comments
- [x] Update all templates to include global annotations
- [ ] ~~Add unit tests for annotation rendering~~ (deferred - not the right case to introduce Helm testing)
- [ ] Update chart documentation with examples (Reloader, compliance)
