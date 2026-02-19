# PRD #382: Add Alibaba Qwen 3.5 Plus AI Provider

**Status**: Open
**Priority**: Medium
**Created**: 2026-02-19

## Problem

The platform supports 8 AI providers but lacks coverage for Alibaba's Qwen model family — one of the strongest multilingual models available with 201 language support, 262K token context, and native agent capabilities. Users in multilingual environments or those preferring Alibaba Cloud infrastructure have no direct provider option.

## Solution

Add Qwen 3.5 Plus as a new AI provider using the official `@ai-sdk/alibaba` Vercel AI SDK package, following the established provider integration pattern used by existing providers (Anthropic, Google, OpenAI, xAI).

## Key Details

| Property | Value |
|----------|-------|
| **Model ID** | `qwen3.5-plus` |
| **Provider key** | `alibaba` |
| **SDK package** | `@ai-sdk/alibaba` |
| **API key env var** | `ALIBABA_API_KEY` |
| **Context window** | 262,144 tokens |
| **Parameters** | 397B total (17B active, MoE architecture) |
| **Language support** | 201 languages |
| **Tool calling** | Yes (parallel execution) |
| **Prompt caching** | Yes (implicit + explicit) |

## Success Criteria

- Qwen 3.5 Plus available via `AI_PROVIDER=alibaba`
- Integration tests pass with `npm run test:integration:qwen`
- Provider documented in deployment docs alongside existing providers

## Milestones

- [ ] Install `@ai-sdk/alibaba` package and add provider entry in `model-config.ts`
- [ ] Register Alibaba provider in `vercel-provider.ts` with model creation and API key validation
- [ ] Add `test:integration:qwen` script to `package.json`
- [ ] Integration tests passing with Qwen 3.5 Plus (`npm run test:integration:qwen`)
- [ ] Documentation updated in `docs/ai-engine/setup/deployment.md` provider table
- [ ] Changelog fragment created

## Technical Notes

- The `@ai-sdk/alibaba` package provides a `createAlibaba` factory function following the same pattern as `createGoogleGenerativeAI`, `createAnthropic`, etc.
- API keys are obtained from [Alibaba Cloud Model Studio](https://www.alibabacloud.com/help/en/model-studio/)
- The Qwen API is also OpenAI-compatible, but the dedicated SDK package is preferred for proper provider support
- Qwen 3.5 supports thinking/reasoning mode which could be exposed as a separate provider variant (future enhancement)

## Dependencies

- `@ai-sdk/alibaba` npm package
- `ALIBABA_API_KEY` environment variable for testing

## Risks

| Risk | Mitigation |
|------|-----------|
| Model quality for DevOps reasoning tasks unknown | Run full integration test suite and document results |
| API availability/latency from non-China regions | Test from standard CI environment, document any limitations |
| SDK package stability (relatively new) | Pin version, monitor for breaking changes |
