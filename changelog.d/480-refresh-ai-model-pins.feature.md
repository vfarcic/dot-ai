## Refreshed Pinned AI Model Versions

Two provider pins have been upgraded to their latest stable versions:

- **Anthropic Opus**: `claude-opus-4-6` → `claude-opus-4-7` (released April 16, 2026). Activated when `AI_PROVIDER=anthropic_opus`.
- **Alibaba Qwen**: `qwen3.5-plus` → `qwen3.6-plus`. Activated when `AI_PROVIDER=alibaba`.

No configuration changes are required — the same `ANTHROPIC_API_KEY` and `DASHSCOPE_API_KEY` environment variables continue to work. Users can override the model with `AI_MODEL` if needed.

The remaining provider pins (`openai`, `custom`, `google`, `google_flash`, `kimi`, `xai`) were evaluated against newer candidate versions but held at their current pins after baseline-vs-new integration testing. See PRD #480 for per-provider rationale and follow-up items. Stale model references in `docs/ai-engine/setup/deployment.md` (OpenRouter example), `src/core/ai-provider.interface.ts` (JSDoc examples), and `src/core/tracing/ai-tracing.ts` (comment examples) have also been refreshed to current pins.
