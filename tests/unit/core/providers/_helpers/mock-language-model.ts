/**
 * Test helpers for unit-testing AI provider logic without real API calls.
 *
 * Wraps the Vercel AI SDK's `MockLanguageModelV3` (exported from `ai/test`)
 * with sane defaults that match this codebase's expectations: a text-only
 * response, a stop finish reason, and a usage shape compatible with
 * `LanguageModelV3Usage`.
 *
 * Note on naming: PRD #464 references `MockLanguageModelV1`, which is the
 * historical name from earlier `ai` SDK releases. In `ai ^6.x` the model
 * specification was bumped and the export is now `MockLanguageModelV3`.
 * The intent of the PRD is preserved — this helper exposes the same kind
 * of deterministic, in-process model.
 */

import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3 } from '@ai-sdk/provider';

/**
 * Options for {@link createMockLanguageModel}.
 */
export interface MockLanguageModelOptions {
  /** Provider id reported by the model. Defaults to `'mock-provider'`. */
  provider?: string;
  /** Model id reported by the model. Defaults to `'mock-model'`. */
  modelId?: string;
  /** Text the model should return for `doGenerate`. Defaults to `'mock response'`. */
  text?: string;
  /** Input tokens to report. Defaults to `10`. */
  inputTokens?: number;
  /** Output tokens to report. Defaults to `5`. */
  outputTokens?: number;
}

/**
 * Build a `LanguageModelV3GenerateResult` for a plain text response.
 *
 * Exposed separately so tests that need richer fixtures (multi-part content,
 * tool calls, custom finish reasons) can build their own result and pass it
 * straight to `MockLanguageModelV3`'s `doGenerate` option.
 */
export function buildTextGenerateResult(options: {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}): Awaited<ReturnType<LanguageModelV3['doGenerate']>> {
  const inputTokens = options.inputTokens ?? 10;
  const outputTokens = options.outputTokens ?? 5;

  return {
    content: [{ type: 'text', text: options.text }],
    finishReason: 'stop',
    usage: {
      inputTokens: {
        total: inputTokens,
        noCache: inputTokens,
        cacheRead: undefined,
      },
      outputTokens: {
        total: outputTokens,
        reasoning: undefined,
      },
      totalTokens: inputTokens + outputTokens,
    },
    warnings: [],
  };
}

/**
 * Create a deterministic `MockLanguageModelV3` returning a single text response.
 *
 * Intended for happy-path tests of `VercelProvider.sendMessage` and similar
 * generator-style call sites. For tool-loop or streaming scenarios construct
 * `MockLanguageModelV3` directly with custom `doGenerate` / `doStream`.
 */
export function createMockLanguageModel(
  options: MockLanguageModelOptions = {}
): MockLanguageModelV3 {
  const text = options.text ?? 'mock response';
  const inputTokens = options.inputTokens ?? 10;
  const outputTokens = options.outputTokens ?? 5;

  return new MockLanguageModelV3({
    provider: options.provider ?? 'mock-provider',
    modelId: options.modelId ?? 'mock-model',
    doGenerate: async () =>
      buildTextGenerateResult({ text, inputTokens, outputTokens }),
  });
}
