# PRD #480: Refresh Pinned AI Model Versions Across Providers

**Status: In Progress**
**GitHub Issue**: [#480](https://github.com/vfarcic/dot-ai/issues/480)
**Priority**: Medium

## Problem Statement

Several model pins in `src/core/model-config.ts` lag behind their providers' currently available models, and a few comparison/documentation references contain even older versions. Specifically (as of May 2026):

| Provider key | Current pin | Latest available |
|---|---|---|
| `anthropic_opus` | `claude-opus-4-6` | **Opus 4.7** (Apr 16, 2026) |
| `openai` | `gpt-5.4` | **GPT-5.5** (Apr 23, 2026) |
| `custom` | `gpt-5.4` | **GPT-5.5** (default fallback) |
| `kimi` | `kimi-k2.5` | **Kimi K2.6** (Apr 20, 2026) |
| `alibaba` | `qwen3.5-plus` | **Qwen 3.6-Plus** |
| `google_flash` | `gemini-3-flash-preview` | **Gemini 3.1 Flash / Flash-Lite** (preview) |
| `google` | `gemini-3.1-pro-preview` | Gemini 3.1 Pro (still preview) — verify ID |
| `xai` | `grok-4` | Grok 4.3 (beta) / Grok 5 (training) — decision needed |

Other references that still cite older versions:

- `src/evaluation/model-metadata.json` — comparison set (`claude-sonnet-4-5-20250929`, `gpt-5`, `gpt-5-pro`, `gemini-2.5-pro`, `gemini-2.5-flash`, `grok-4`)
- `docs/ai-engine/setup/deployment.md:396` — OpenRouter example shows `anthropic/claude-3.5-sonnet`
- `src/core/ai-provider.interface.ts:219,235` — JSDoc examples (`claude-sonnet-4-5`, `gpt-4o`)
- `src/core/tracing/ai-tracing.ts:24` — comment example (`claude-3-5-sonnet`, `gpt-4o`)

Pins that remain current and should not change:

- `anthropic` → `claude-sonnet-4-6` (still flagship Sonnet)
- `anthropic_haiku` → `claude-haiku-4-5-20251001` (still current Haiku)
- `openrouter` → `anthropic/claude-haiku-4.5` (tracks Haiku)
- `amazon_bedrock` → `global.anthropic.claude-sonnet-4-6` (tracks Sonnet)

## Solution Overview

Update each behind-the-curve pin to its provider's latest stable version. The change is mechanically simple — the pins are centralized in `src/core/model-config.ts` — but requires:

1. Per-provider integration test validation to confirm the new model name is recognized by the API and behaves correctly under existing tool flows.
2. Resolution of three open decisions (Grok strategy, Gemini Pro preview ID, Flash variant choice).
3. Refresh of the eval comparison metadata so benchmark runs reflect the current model set.
4. Cleanup of stale illustrative references in docs and JSDoc.

## Open Decisions — Resolved

### D1. Grok upgrade strategy — **Resolved: hold at `grok-4`**
- Grok 4.3 remains beta (instability risk under long agentic loops in capability/remediate); Grok 5 GA timeline still unconfirmed.
- Action: no pin change for `xai`. Open a follow-up PRD when Grok 4.x stable or Grok 5 ships.

### D2. Gemini 3.1 Pro model ID — **Resolved: `gemini-3.1-pro-preview` (no change)**
- Verified against Vertex AI / Google AI Studio model lists (May 2026): the model is still in preview and the API ID has not been promoted.
- Sources: [Vertex AI docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro), [Google blog announcement](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/), [DeepMind model card](https://deepmind.google/models/model-cards/gemini-3-1-pro/).
- Action: no pin change for `google` — current value is correct. Re-verify after Google I/O 2026 (May 19–20) in case of GA promotion.

### D3. Gemini Flash variant — **Resolved: `gemini-3.1-flash-preview` (full Flash)**
- Stay on the full Flash tier to preserve capability parity with the prior pin (`gemini-3-flash-preview`). Flash-Lite reserved for a future cost-driven decision if benchmarks justify it.
- Action: pin `google_flash` to `gemini-3.1-flash-preview`.

### D4. Eval-set scope — **Resolved: in scope**
- `src/evaluation/model-metadata.json` already references a `/update-model-metadata` slash command and is meant to be refreshed alongside production pins. Milestone 8 covers this.

### D5. OpenAI / custom upgrade strategy — **Resolved: hold at `gpt-5.4`**
- GPT-5.5 reproducibly fails `tests/integration/tools/recommend.test.ts > Helm Chart Discovery > should complete Helm workflow` (3 of 3 attempts) by selecting `combination`-type solutions instead of taking the documented Helm-fallback path when no matching CRDs exist in-cluster. The intent under test is "Install Prometheus for monitoring" with no Prometheus CRDs installed.
- Baseline rerun of the same test under `gpt-5.4` passes cleanly: 105s vs 228–256s on `gpt-5.5` — also a ~2× per-test latency hit on this workflow.
- Diagnosis: behavioral drift in solution-type selection, not a wire-format change. Fix likely requires tightening the recommend-tool prompt's Helm-trigger criteria, which is out of scope for a version-refresh PRD.
- Action: no pin change for `openai` or `custom`. Open a follow-up PRD to either harden the recommend prompt for GPT-5.5 behavior or revisit when a later GPT-5.x ships.

## Success Criteria

1. All current-with-provider pins in `src/core/model-config.ts` reflect the latest stable version (per decisions above).
2. **Each provider upgrade validated in isolation**: integration tests pass for that provider before moving to the next pin. No bulk pin update followed by a single test run — one provider at a time, with `npm run test:integration` green at each step.
3. `src/evaluation/model-metadata.json` reflects the updated production set plus any newly relevant comparison models.
4. Stale doc/JSDoc examples updated to current model names.
5. `version` tool reports the upgraded model name when running with each upgraded provider.
6. All open decisions (D1–D5) explicitly resolved and recorded in this PRD before close-out.

## Technical Details

### Files to Update

**Production runtime:**
- `src/core/model-config.ts` — bump pins per the table above
- `src/evaluation/model-metadata.json` — refresh pricing/context entries to current set

**Documentation / examples (low priority cleanup):**
- `docs/ai-engine/setup/deployment.md:396` — OpenRouter example
- `src/core/ai-provider.interface.ts:219,235` — JSDoc examples
- `src/core/tracing/ai-tracing.ts:24` — code comment example

**No changes required:**
- `ai-provider-factory.ts`, `vercel-provider.ts` — same env vars, same SDK
- API endpoints unchanged for any provider

### Pin Changes (Final, post D1–D5 resolution)

```typescript
// src/core/model-config.ts
export const CURRENT_MODELS = {
  anthropic: 'claude-sonnet-4-6',                              // unchanged
  anthropic_opus: 'claude-opus-4-7',                           // ← was 4-6
  anthropic_haiku: 'claude-haiku-4-5-20251001',                // unchanged
  openai: 'gpt-5.4',                                           // unchanged (D5: hold)
  google: 'gemini-3.1-pro-preview',                            // unchanged (D2 verified)
  google_flash: 'gemini-3.1-flash-preview',                    // ← was gemini-3-flash-preview
  kimi: 'kimi-k2.6',                                           // ← was k2.5
  alibaba: 'qwen3.6-plus',                                     // ← was qwen3.5-plus
  xai: 'grok-4',                                               // unchanged (D1: hold)
  host: 'host',                                                // unchanged
  openrouter: 'anthropic/claude-haiku-4.5',                    // unchanged
  custom: 'gpt-5.4',                                           // unchanged (D5: hold)
  amazon_bedrock: 'global.anthropic.claude-sonnet-4-6',        // unchanged
} as const;
```

## Milestones

Per-provider validation: each upgrade below requires `npm run test:integration` (provider-relevant suite) to pass before moving to the next milestone. If a provider's tests fail, fix or revert that pin before proceeding.

- [x] **Milestone 1**: Resolve open decisions D1 (Grok), D2 (Gemini Pro ID), D3 (Flash variant); record resolutions in this PRD
- [x] **Milestone 2**: Upgrade `anthropic_opus` → `claude-opus-4-7` → integration tests pass
- [x] **Milestone 3**: Apply OpenAI/custom decision (D5) — hold at `gpt-5.4` (GPT-5.5 fails Helm-fallback test; behavioral regression deferred to follow-up PRD)
- [ ] **Milestone 4**: Upgrade `kimi` → `kimi-k2.6` → integration tests pass
- [ ] **Milestone 5**: Upgrade `alibaba` → `qwen3.6-plus` → integration tests pass
- [ ] **Milestone 6**: Upgrade `google_flash` (and `google` per D2 if applicable) → integration tests pass
- [ ] **Milestone 7**: Apply Grok decision (D1) — upgrade or hold; if upgraded, integration tests pass
- [ ] **Milestone 8**: Refresh `src/evaluation/model-metadata.json` to current model set
- [ ] **Milestone 9**: Clean up stale model references in docs and JSDoc examples
- [ ] **Milestone 10**: Verify `version` tool reports correct model names per upgraded provider

## Risk Assessment

**Low risk overall** — version bumps within stable provider model families with no API surface change.

**Specific risks:**

- **Grok 4.3 (if pinned)**: beta status; may exhibit instability under long agentic loops (capability tool, remediate). Hold at 4 unless beta proves stable.
- **Gemini preview model IDs**: Google occasionally renames preview IDs at GA promotion. The current pin must be verified against the live model list to avoid 404s.
- **Pricing shifts**: GPT-5.5, Opus 4.7, Qwen 3.6-Plus, and Kimi K2.6 may have different cost profiles than the prior pins. No code change needed, but worth flagging in the changelog so users running large agentic workflows are aware.
- **Output formatting drift**: Newer models occasionally produce slightly different output structures (e.g., reasoning verbosity, JSON wrapping). Integration tests are the safety net.

## References

- [Anthropic Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic pricing 2026 (Opus 4.7, Sonnet 4.6, Haiku 4.5)](https://www.aipricing.guru/anthropic-pricing/)
- [Introducing GPT-5.5 — OpenAI](https://openai.com/index/introducing-gpt-5-5/)
- [Gemini 3.1 Pro — Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/)
- [Gemini 3.1 Flash-Lite — Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/)
- [Kimi K2.6 — Moonshot blog](https://kimi-k2.org/blog/23-kimi-k2-6-code-preview)
- [Qwen 3.6-Plus — Alibaba blog](https://www.alibabacloud.com/blog/qwen3-6-plus-towards-real-world-agents_603005)
- [Grok 5 status — Grokipedia](https://grokipedia.com/page/Grok_5)
- Prior model-update PRDs: #237 (AI model support update), #294 (Gemini 3 variants), #353 (Kimi K2.5), #369 (GPT-5.4), #370 (Opus 4.6), #382 (Qwen 3.5-Plus)
