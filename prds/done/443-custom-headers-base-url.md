# PRD: Custom Headers and Base URL Support for All AI Providers

**Issue**: [#443](https://github.com/vfarcic/dot-ai/issues/443)
**Status**: Complete (2026-03-30)
**Priority**: Medium
**Created**: 2026-03-29

**References**: [vfarcic/dot-ai-stack#5](https://github.com/vfarcic/dot-ai-stack/issues/5)

---

## Problem Statement

Enterprise users often access AI providers through custom gateways or proxy deployments (e.g., a corporate Anthropic proxy that requires authentication headers like `version: 2026-02-20`). The current implementation has two limitations that block these use cases:

1. **No custom headers support**: There is no mechanism to pass arbitrary HTTP headers to AI provider SDKs. The only headers set are hardcoded Anthropic beta headers in `vercel-provider.ts`.

2. **Custom base URL forces OpenAI-compatible mode**: Setting `CUSTOM_LLM_BASE_URL` in `ai-provider-factory.ts` overrides the provider type to `custom`, which routes through `createOpenAI()`. This means an Anthropic-compatible proxy with a custom URL loses all Anthropic-specific features (cache control, extended context, proper tool calling format).

These two issues together make it impossible to use dot-ai with enterprise LLM gateways that front Anthropic or other non-OpenAI providers.

---

## Solution Overview

### 1. Custom Headers via Environment Variable

Introduce `CUSTOM_LLM_HEADERS` environment variable that accepts a JSON string of key-value pairs:

```bash
CUSTOM_LLM_HEADERS='{"version": "2026-02-20", "x-custom-auth": "token123"}'
```

These headers are parsed in `ai-provider-factory.ts` and passed through to `vercel-provider.ts`, where they are merged with any provider-specific headers (e.g., the Anthropic beta header).

### 2. Base URL Without Provider Override

Allow `CUSTOM_LLM_BASE_URL` to work with the configured `AI_PROVIDER` instead of always forcing to OpenAI-compatible mode. The current auto-detection logic (OpenRouter detection, fallback to `custom`) becomes opt-in rather than the default:

- If `AI_PROVIDER=anthropic` and `CUSTOM_LLM_BASE_URL` is set, use `createAnthropic({ baseURL, headers })` — not `createOpenAI()`
- If `AI_PROVIDER=custom` (explicitly set), use `createOpenAI()` as today
- OpenRouter auto-detection remains for backward compatibility

### 3. Helm Chart Configuration

Add `ai.customEndpoint.headers` to `values.yaml` and wire it through the deployment template as `CUSTOM_LLM_HEADERS`.

---

## Technical Design

### Environment Variables

| Variable | Format | Example |
|----------|--------|---------|
| `CUSTOM_LLM_BASE_URL` | URL string | `https://proxy.example.com/api/providers/anthropic` |
| `CUSTOM_LLM_HEADERS` | JSON string | `{"version": "2026-02-20"}` |
| `AI_PROVIDER` | Provider name | `anthropic` (now preserved when base URL is set) |

### Changes by File

**`src/core/ai-provider-factory.ts`**:
- Parse `CUSTOM_LLM_HEADERS` env var into a headers object
- Pass `customHeaders` through `AIProviderConfig` to the provider
- Remove the logic that overrides `AI_PROVIDER` to `custom` when `CUSTOM_LLM_BASE_URL` is set (unless `AI_PROVIDER` is not explicitly configured or is already `custom`)
- Keep OpenRouter auto-detection as a special case

**`src/core/ai-provider.interface.ts`**:
- Add optional `customHeaders?: Record<string, string>` to `AIProviderConfig`
- Add optional `baseURL?: string` already exists — verify it's passed through

**`src/core/providers/vercel-provider.ts`**:
- Accept `customHeaders` in constructor
- In `initializeModel()`, merge custom headers with provider-specific headers for each provider case (Anthropic beta header, etc.)
- Pass `baseURL` to providers that support it (Anthropic, OpenAI, Google, etc.)

**`charts/values.yaml`**:
- Add `ai.customEndpoint.headers: ""` (JSON string)

**`charts/templates/deployment.yaml`**:
- Map `ai.customEndpoint.headers` to `CUSTOM_LLM_HEADERS` env var

### Header Merge Strategy

Custom headers are merged with provider-specific headers, with custom headers taking precedence:

```typescript
const mergedHeaders = {
  ...providerDefaultHeaders,  // e.g., { 'anthropic-beta': 'context-1m-2025-08-07' }
  ...customHeaders,           // e.g., { 'version': '2026-02-20' }
};
```

This allows users to override provider defaults if needed while preserving them by default.

### Provider Base URL Support

Each Vercel AI SDK provider factory already accepts `baseURL`:
- `createAnthropic({ baseURL })`
- `createOpenAI({ baseURL })`
- `createGoogleGenerativeAI({ baseURL })`
- `createXai({ baseURL })`

The change passes `this.baseURL` to all provider cases, not just the `custom` case.

---

## Backward Compatibility

- **No breaking changes**: All existing env vars and Helm values continue to work as before
- **Default behavior preserved**: If `AI_PROVIDER` is not explicitly set and `CUSTOM_LLM_BASE_URL` is provided, fall back to current behavior (OpenAI-compatible mode) to avoid breaking existing custom endpoint users
- **OpenRouter detection preserved**: URLs containing `openrouter.ai` still auto-select the OpenRouter provider

---

## Success Criteria

- Users can pass custom headers to any AI provider via `CUSTOM_LLM_HEADERS`
- Users can use `CUSTOM_LLM_BASE_URL` with `AI_PROVIDER=anthropic` without losing Anthropic-specific features
- Existing custom endpoint configurations continue to work without changes
- Helm chart supports custom headers configuration

---

## Milestones

- [x] Custom headers parsing and propagation through provider config (`CUSTOM_LLM_HEADERS` env var parsed in factory, passed through config interface to provider)
- [x] Header merging in vercel-provider for all provider types (custom headers merged with provider-specific defaults like Anthropic beta header)
- [x] Base URL passthrough for native providers (allow `CUSTOM_LLM_BASE_URL` with Anthropic/OpenAI/Google without forcing to OpenAI-compatible mode)
- [x] Backward compatibility safeguards (existing custom endpoint users unaffected, OpenRouter auto-detection preserved)
- [x] Helm chart support (`ai.customEndpoint.headers` in values.yaml and deployment template)
- [x] Integration tests covering custom headers and base URL combinations
- [x] Documentation for custom endpoint configuration with headers
- [x] Comment on vfarcic/dot-ai-stack#5 linking to this PRD (invited user to verify after next release)
