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
2. **Default-off for backward compatibility**: `localEmbeddings.enabled` defaults to `false` to protect existing users on upgrade (switching from 1536-dim OpenAI to 384-dim local would break existing Qdrant collections). Quickstart and setup docs in both `dot-ai` and `dot-ai-stack` set `localEmbeddings.enabled: true` so new users get the zero-config experience
3. **Transparent to existing users**: Users with `EMBEDDINGS_PROVIDER` or embedding API keys configured continue using their existing setup — no behavior change
4. **Uses existing `CUSTOM_EMBEDDINGS_BASE_URL` mechanism**: No changes to the dot-ai server code required

### Fallback Logic (Helm Template Level)

Since OpenAI is the hardcoded default embedding provider in the server code (`EMBEDDINGS_PROVIDER` defaults to `openai`), only `OPENAI_API_KEY` and `CUSTOM_EMBEDDINGS_API_KEY` are relevant for Helm-level detection. Other provider keys (Anthropic, Google, xAI) are LLM-only unless the user explicitly sets `EMBEDDINGS_PROVIDER` at runtime.

```
1. customEndpoint.enabled → use custom endpoint (existing behavior)
2. secrets.openai.apiKey set → OpenAI embeddings (existing default behavior)
3. secrets.customEmbeddings.apiKey set → custom embeddings (existing behavior)
4. None of the above + localEmbeddings.enabled → use in-cluster local embedding service
```

## Key Details

| Property | Value |
|----------|-------|
| **Embedding service** | HuggingFace Text Embeddings Inference (TEI) |
| **Default model** | `all-MiniLM-L6-v2` (384 dimensions, ~23 MB quantized) |
| **Resource footprint** | ~128 MB RAM, 0.5 CPU (request), no GPU required |
| **Container image** | `ghcr.io/huggingface/text-embeddings-inference:cpu-latest` |
| **Helm toggle** | `localEmbeddings.enabled` (default: `false`, set `true` in quickstart docs) |
| **Server code changes** | None — uses existing `CUSTOM_EMBEDDINGS_BASE_URL` |

## Success Criteria

- Local embedding service deploys by default and dot-ai connects to it automatically when no embedding keys are configured
- Existing users with embedding API keys see no behavior change
- Semantic search (patterns, policies, capabilities, knowledge base) works without any embedding API keys
- Service can be disabled via `localEmbeddings.enabled: false`

## Milestones

### Phase 1: Helm Chart Changes + Backward Compatibility

- [x] Add local embedding Deployment and Service templates to Helm chart (gated by `localEmbeddings.enabled`)
- [x] Add auto-fallback logic in deployment.yaml: set `CUSTOM_EMBEDDINGS_BASE_URL` to in-cluster service when `localEmbeddings.enabled: true`
- [x] Configure correct dimensions (`EMBEDDINGS_DIMENSIONS: "384"`) for the local model
- [x] Run existing integration tests as-is (still using OpenAI embeddings) to confirm the local embedding service deployment doesn't break anything

### Phase 2: Embedding Migration Endpoint

- [ ] Add REST API endpoint (not an MCP tool) for re-embedding collections when switching providers (e.g., `POST /api/v1/embeddings/migrate`)
- [ ] Migration reads all points from a collection, extracts stored `searchText` from payloads, re-embeds with the current provider, and writes to a new collection with correct dimensions
- [ ] Support migrating individual collections or all collections in one call
- [ ] Report progress (total points, processed, failed) in the response
- [ ] The endpoint is automatically picked up by the auto-generated CLI (`dot-ai-cli`) via the OpenAPI spec — no CLI changes needed

### Phase 3: Switch CI Tests to Local Embeddings

TEI images are amd64 only (no ARM64 support — see [TEI issue #769](https://github.com/huggingface/text-embeddings-inference/issues/769)). Tests use a dual-path strategy:

- **CI/CD (amd64 GitHub Actions)**: Deploy TEI with `localEmbeddings.enabled: true`, test local embeddings with 384-dim vectors
- **Local dev (ARM/Apple Silicon)**: Continue using OpenAI embeddings as today

This gives test coverage for both embedding paths.

#### Qdrant Test Image Rebuild

The pre-populated Qdrant test image needs 384-dim vectors for CI. Since TEI is amd64 only, generate vectors locally on Mac using [FastEmbed](https://github.com/qdrant/fastembed) (ONNX-based, runs natively on ARM). Same model weights (`all-MiniLM-L6-v2`) = identical vectors to what TEI produces at runtime in CI.

```python
from fastembed import TextEmbedding
model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
vectors = list(model.embed(["test texts..."]))
# populate Qdrant → build image → push to ghcr.io
```

#### Tasks

- [ ] Rebuild pre-populated Qdrant test image (`Dockerfile-qdrant`) with 384-dimension vectors generated locally via FastEmbed (replaces current 1536-dimension OpenAI vectors in `capabilities-policies` collection)
- [ ] Update test infrastructure (`run-integration-tests.sh`) to detect architecture and conditionally deploy TEI (amd64) or use OpenAI embeddings (arm64)
- [ ] CI tests passing with local embeddings (no external embedding API keys required for CI)
- [ ] Local tests still passing with OpenAI embeddings

### Phase 4: Documentation + Release

- [ ] Documentation updated in `docs/ai-engine/setup/deployment.md` covering local embeddings, disabling, switching providers, and running the migration endpoint
- [ ] Quickstart and setup docs in `dot-ai` updated to include `localEmbeddings.enabled: true` in example Helm values so new users get zero-config semantic search
- [ ] Quickstart and setup docs in `dot-ai-stack` updated to include `localEmbeddings.enabled: true` in example Helm values
- [ ] Changelog fragment created

## Technical Notes

- HuggingFace TEI exposes an OpenAI-compatible `/v1/embeddings` endpoint, which is what `CUSTOM_EMBEDDINGS_BASE_URL` expects
- The `all-MiniLM-L6-v2` model produces 384-dimensional embeddings vs 1536 for OpenAI. Switching providers on an existing deployment requires re-embedding all data (vector dimensions must match). The migration endpoint handles this automatically
- TEI supports model preloading at container startup — no runtime download needed if the image bundles the model or uses an init container
- The Helm chart already has a pattern for optional deployments (see `plugins` in `plugin-deployment.yaml` and `qdrant` subchart)

### Helm Values Structure

```yaml
localEmbeddings:
  enabled: false    # Default off for backward compat; quickstart docs set true
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

Since `localEmbeddings.enabled` defaults to `false` and is explicitly set by the user, it serves as the sole gate — no key detection needed. When enabled, the template injects the env vars; the user has declared their intent.

The `CUSTOM_EMBEDDINGS_BASE_URL` must include the `/v1` suffix because TEI's OpenAI-compatible endpoint is at `/v1/embeddings` and the OpenAI SDK appends `/embeddings` to the base URL.

A dummy `CUSTOM_EMBEDDINGS_API_KEY` is required because the server code (`src/core/embedding-service.ts:97-100`) marks the embedding provider as unavailable when no API key is set. TEI ignores the Authorization header, so this is safe. It is placed **before** the secretKeyRef entries so that if a real key exists in an external Kubernetes Secret, it overrides the dummy (Kubernetes last-entry-wins).

```yaml
{{- if .Values.localEmbeddings.enabled }}
        - name: CUSTOM_EMBEDDINGS_API_KEY
          value: "local-embeddings-no-key-required"
        - name: CUSTOM_EMBEDDINGS_BASE_URL
          value: "http://{{ .Release.Name }}-local-embeddings.{{ .Release.Namespace }}.svc.cluster.local:80/v1"
        - name: EMBEDDINGS_DIMENSIONS
          value: {{ .Values.localEmbeddings.dimensions | quote }}
{{- end }}
```

## Dependencies

- HuggingFace TEI container image (public, open-source, Apache 2.0)
- No new npm dependencies in dot-ai server

## Risks

| Risk | Mitigation |
|------|-----------|
| Dimension mismatch when switching between local and cloud embeddings | Migration REST endpoint re-embeds all data with the new provider; CLI command auto-generated from OpenAPI spec |
| Lower embedding quality vs OpenAI models | Document tradeoff; position local as "good enough for most use cases" with cloud as upgrade path |
| TEI image size (~500 MB) increases total chart footprint | Acceptable tradeoff; image only pulled when enabled; document disabling for minimal installs |
| Model download on first startup adds cold-start latency | Use TEI's model preloading or init container to download model before readiness probe passes |
| TEI image is amd64 only — no ARM64/Apple Silicon support | Document limitation; local dev uses OpenAI embeddings; CI tests on amd64 runners use TEI |
| Existing users upgrading with `enabled: true` default would silently switch from OpenAI (1536-dim) to local (384-dim), breaking Qdrant collections | Default `enabled: false`; new users opt in via quickstart docs |

## Related

- Addresses [#383](https://github.com/vfarcic/dot-ai/issues/383) with a cleaner architecture (separate service vs in-process)
