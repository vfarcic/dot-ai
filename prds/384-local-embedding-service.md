# PRD #384: Optional Local Embedding Service in Helm Chart

**Status**: Open
**Priority**: Medium
**Created**: 2026-02-25

## Problem

dot-ai requires external API keys for embedding generation (OpenAI, Google, or Amazon Bedrock). This creates friction for:

- **New users**: Must configure two sets of API keys (LLM + embeddings) before semantic search works
- **Air-gapped/on-premise deployments**: External API access is restricted or unavailable
- **Privacy-focused organizations**: Prefer to keep all data processing local
- **Cost-sensitive environments**: Want to avoid per-token embedding costs

## Solution

Add an optional local embedding service deployment to the Helm chart using [HuggingFace Text Embeddings Inference (TEI)](https://github.com/huggingface/text-embeddings-inference). When no embedding API keys are configured, dot-ai automatically connects to this in-cluster service via `CUSTOM_EMBEDDINGS_BASE_URL`.

### Key Design Decisions

1. **Separate deployment, not in-process**: The embedding model runs as its own pod, keeping dot-ai lightweight and allowing independent scaling
2. **Default-on when no keys configured**: New users get semantic search out of the box with zero extra configuration
3. **Transparent to existing users**: Users with `EMBEDDINGS_PROVIDER` or embedding API keys configured continue using their existing setup — no behavior change
4. **Uses existing `CUSTOM_EMBEDDINGS_BASE_URL` mechanism**: No changes to the dot-ai server code required

### Fallback Logic

```
1. EMBEDDINGS_PROVIDER explicitly set → use that provider (existing behavior)
2. Embedding API keys present (OPENAI_API_KEY, GOOGLE_API_KEY, etc.) → use those (existing behavior)
3. None of the above → use in-cluster local embedding service via CUSTOM_EMBEDDINGS_BASE_URL
```

## Key Details

| Property | Value |
|----------|-------|
| **Embedding service** | HuggingFace Text Embeddings Inference (TEI) |
| **Default model** | `all-MiniLM-L6-v2` (384 dimensions, ~23 MB quantized) |
| **Resource footprint** | ~128 MB RAM, 0.5 CPU (request), no GPU required |
| **Container image** | `ghcr.io/huggingface/text-embeddings-inference:cpu-latest` |
| **Helm toggle** | `localEmbeddings.enabled` (default: `true`) |
| **Server code changes** | None — uses existing `CUSTOM_EMBEDDINGS_BASE_URL` |

## Success Criteria

- Local embedding service deploys by default and dot-ai connects to it automatically when no embedding keys are configured
- Existing users with embedding API keys see no behavior change
- Semantic search (patterns, policies, capabilities, knowledge base) works without any embedding API keys
- Service can be disabled via `localEmbeddings.enabled: false`

## Milestones

- [ ] Add local embedding Deployment and Service templates to Helm chart (gated by `localEmbeddings.enabled`)
- [ ] Add auto-fallback logic in deployment.yaml: set `CUSTOM_EMBEDDINGS_BASE_URL` to in-cluster service when no embedding keys are configured
- [ ] Configure correct dimensions (`EMBEDDINGS_DIMENSIONS: "384"`) for the local model
- [ ] Integration tests passing with local embedding service (no external embedding keys)
- [ ] Documentation updated in `docs/ai-engine/setup/deployment.md` covering local embeddings, disabling, and switching providers
- [ ] Changelog fragment created

## Technical Notes

- HuggingFace TEI exposes an OpenAI-compatible `/v1/embeddings` endpoint, which is what `CUSTOM_EMBEDDINGS_BASE_URL` expects
- The `all-MiniLM-L6-v2` model produces 384-dimensional embeddings vs 1536 for OpenAI. Switching providers on an existing deployment requires re-creating Qdrant collections (vector dimensions must match). Documentation should clearly state this
- TEI supports model preloading at container startup — no runtime download needed if the image bundles the model or uses an init container
- The Helm chart already has a pattern for optional deployments (see `plugins` in `plugin-deployment.yaml` and `qdrant` subchart)

### Helm Values Structure

```yaml
localEmbeddings:
  enabled: true
  image:
    repository: ghcr.io/huggingface/text-embeddings-inference
    tag: "cpu-latest"
  model: "sentence-transformers/all-MiniLM-L6-v2"
  dimensions: 384
  resources:
    requests:
      cpu: "250m"
      memory: "256Mi"
    limits:
      cpu: "1"
      memory: "512Mi"
```

### Auto-Fallback Template Logic (deployment.yaml)

```yaml
{{- if not (or .Values.ai.customEndpoint.enabled (hasKey .Values.secrets "openai" | and .Values.secrets.openai.apiKey) ...) }}
  {{- if .Values.localEmbeddings.enabled }}
  - name: CUSTOM_EMBEDDINGS_BASE_URL
    value: "http://{{ .Release.Name }}-local-embeddings.{{ .Release.Namespace }}.svc.cluster.local:80"
  - name: EMBEDDINGS_DIMENSIONS
    value: {{ .Values.localEmbeddings.dimensions | quote }}
  {{- end }}
{{- end }}
```

## Dependencies

- HuggingFace TEI container image (public, open-source, Apache 2.0)
- No new npm dependencies in dot-ai server

## Risks

| Risk | Mitigation |
|------|-----------|
| Dimension mismatch when switching between local and cloud embeddings | Document clearly that switching requires re-indexing; consider adding a migration guide |
| Lower embedding quality vs OpenAI models | Document tradeoff; position local as "good enough for most use cases" with cloud as upgrade path |
| TEI image size (~500 MB) increases total chart footprint | Acceptable tradeoff; image only pulled when enabled; document disabling for minimal installs |
| Model download on first startup adds cold-start latency | Use TEI's model preloading or init container to download model before readiness probe passes |

## Related

- Addresses [#383](https://github.com/vfarcic/dot-ai/issues/383) with a cleaner architecture (separate service vs in-process)
