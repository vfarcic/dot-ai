# PRD #238: Remove Anthropic SDK - Consolidate on Vercel AI SDK

## Status: Done
## Priority: Low
## Created: 2025-11-27

---

## Problem Statement

The codebase currently maintains two AI SDKs for Anthropic models:
1. **Direct SDK**: `@anthropic-ai/sdk` (v0.65.0) with dedicated `AnthropicProvider` class (~574 lines)
2. **Vercel SDK**: `@ai-sdk/anthropic` (v2.0.23) used by `VercelProvider` class

This creates:
- **Maintenance overhead**: Two implementations to maintain for the same provider
- **Code duplication**: Similar streaming, caching, and tracing logic in both providers
- **Unused code**: The `AnthropicProvider.toolLoop()` method is explicitly marked as "NOT USED" in the codebase
- **Complexity**: `AI_PROVIDER_SDK` environment variable to switch between SDKs
- **Testing burden**: Need to validate both code paths

## Solution Overview

Remove the direct Anthropic SDK (`@anthropic-ai/sdk`) and consolidate all AI provider interactions through the Vercel AI SDK. The Vercel SDK already supports all required features:

- Claude Sonnet 4, Opus 4.5, Haiku models
- 1M token context window (via `anthropic-beta` header)
- Streaming support
- Tool calling / function calling
- Prompt caching with `cacheControl`
- Token usage reporting

## Success Criteria

1. **No feature regression**: All existing Anthropic functionality works via Vercel SDK
2. **Cleaner codebase**: ~600+ lines of code removed
3. **Simplified configuration**: No `AI_PROVIDER_SDK` environment variable needed
4. **All tests pass**: Integration tests continue to pass (already use Vercel SDK)
5. **Documentation updated**: Environment setup docs reflect simplified configuration

## Technical Analysis

### Current State

**Dependencies (package.json):**
```json
"@ai-sdk/anthropic": "^2.0.23",    // Vercel's Anthropic provider
"@anthropic-ai/sdk": "^0.65.0",    // Direct Anthropic SDK (TO BE REMOVED)
```

**Provider Selection (ai-provider-factory.ts:84-95):**
```typescript
switch (config.provider) {
  case 'anthropic':
  case 'anthropic_opus':
  case 'anthropic_haiku':
    return this.createAnthropicProvider(config);  // Uses direct SDK
  default:
    return new VercelProvider(config);  // Uses Vercel SDK
}
```

**SDK Override (ai-provider-factory.ts:184-192):**
```typescript
if (sdkPreference === 'vercel') {
  return new VercelProvider({...});  // Can force Vercel SDK
}
```

### Files to Modify

| File | Change |
|------|--------|
| `package.json` | Remove `@anthropic-ai/sdk` dependency |
| `src/core/providers/anthropic-provider.ts` | DELETE entire file (~574 lines) |
| `src/core/ai-provider-factory.ts` | Simplify to always use VercelProvider for Anthropic |
| `src/core/ai-provider.interface.ts` | Review if any Anthropic-specific types can be removed |
| `package-lock.json` | Auto-updated when dependency removed |

### Feature Parity Verification

| Feature | Anthropic SDK | Vercel SDK | Status |
|---------|--------------|------------|--------|
| Basic chat | `messages.create()` | `generateText()` | Supported |
| Streaming | `stream: true` | Built-in | Supported |
| 1M context | Beta header | Custom headers | Supported |
| Tool calling | Native | `tool()` helper | Supported |
| Prompt caching | `cache_control` | `providerOptions.anthropic.cacheControl` | Supported |
| Token reporting | Direct from response | Via `usage`/`totalUsage` | Supported |
| Multi-turn tool loop | `toolLoop()` method | `stepCountIs()` + `generateText()` | Supported |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing Vercel SDK feature | Low | Medium | Already validated in tests |
| Token reporting differences | Low | Low | Vercel SDK v5.0.60 includes fixes |
| Beta header issues | Low | Low | AI SDK v6 bug doesn't affect v5.x |

## Out of Scope

- Changes to other providers (OpenAI, Google, xAI, etc.)
- Adding new AI providers
- Changing the Vercel SDK version
- Modifications to embedding service (uses separate OpenAI integration)

## Dependencies

- None - this is a self-contained cleanup

## Milestones

### Milestone 1: Remove Anthropic SDK and Provider
- [x] Delete `src/core/providers/anthropic-provider.ts`
- [x] Remove `@anthropic-ai/sdk` from `package.json`
- [x] Update `ai-provider-factory.ts` to always use VercelProvider for Anthropic
- [x] Remove `AI_PROVIDER_SDK` environment variable handling
- [x] Run `npm install` to update lock file

### Milestone 2: Update Configuration and Documentation
- [x] Update `charts/values.yaml` if SDK configuration exists
- [x] Update `docs/` to remove references to SDK selection (N/A - no references found)
- [x] Update any environment variable documentation (N/A - no references found)

### Milestone 3: Validation
- [x] Run `npm run build` - verify no compilation errors
- [x] Run `npm run test:integration` - all tests pass
- [x] Run `npm run test:integration:sonnet` - Anthropic-specific tests pass
- [x] Manual verification of 1M context window feature (existing functionality unchanged)

### Milestone 4: Cleanup
- [x] Remove any unused imports across codebase
- [x] Update CLAUDE.md if architecture section mentions dual SDKs (N/A - no references)
- [x] Final code review for any remaining references

---

## Progress Log

### 2025-12-03 - Implementation Complete
- Deleted `src/core/providers/anthropic-provider.ts` (~574 lines removed)
- Removed `@anthropic-ai/sdk` dependency from package.json
- Simplified `ai-provider-factory.ts` to always use VercelProvider
- Removed `AI_PROVIDER_SDK` env var from test scripts, helm charts, and factory
- Removed unused `getSDKProvider()` method from interface and providers
- Fixed `getProviderType()` to return configured provider instead of hardcoded 'vercel'
- Updated stale `toolLoop` documentation in interface
- All integration tests pass

### 2025-11-27 - PRD Created
- Analyzed current codebase structure
- Confirmed Vercel SDK already supports 1M context window via custom headers
- Verified integration tests already use `AI_PROVIDER_SDK=vercel`
- Confirmed `AnthropicProvider.toolLoop()` is explicitly marked as unused
- Created GitHub issue #238
