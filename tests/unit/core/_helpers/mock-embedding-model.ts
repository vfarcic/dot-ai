/**
 * Test helpers for unit-testing embedding logic without real API calls.
 *
 * Wraps the Vercel AI SDK's `MockEmbeddingModelV3` (exported from `ai/test`)
 * with sane defaults that match this codebase's expectations: a deterministic
 * embedding vector per input value plus a token-count usage shape.
 *
 * Mirrors `tests/unit/core/providers/_helpers/mock-language-model.ts`. PRD
 * #464 referenced `MockEmbeddingModelV1`; in `ai ^6.x` the spec was bumped
 * and the export is now `MockEmbeddingModelV3`. The intent (a deterministic,
 * in-process embedding model) is preserved.
 */

import { MockEmbeddingModelV3 } from 'ai/test';

/**
 * Options for {@link createMockEmbeddingModel}.
 */
export interface MockEmbeddingModelOptions {
  /** Provider id reported by the model. Defaults to `'mock-provider'`. */
  provider?: string;
  /** Model id reported by the model. Defaults to `'mock-model'`. */
  modelId?: string;
  /** Embedding vector dimensionality. Defaults to `4`. */
  dimensions?: number;
  /** Tokens to report. Defaults to `values.length`. */
  tokens?: number;
  /**
   * Max embeddings per call. Defaults to `Infinity` so `embedMany` batches
   * all values into a single `doEmbed` call (closer to production providers
   * than the SDK mock's default of `1`, which would split every value).
   */
  maxEmbeddingsPerCall?: number;
}

/**
 * Build a deterministic embedding vector for a value.
 *
 * The first dimension encodes the value's character count, remaining
 * dimensions are set to zero, so tests can assert vector content without
 * hard-coding floating point literals.
 */
export function buildEmbeddingVector(
  value: string,
  dimensions: number
): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  vec[0] = value.length;
  return vec;
}

/**
 * Create a deterministic `MockEmbeddingModelV3` returning one embedding per
 * input value, in the same order, with the shape produced by
 * {@link buildEmbeddingVector}.
 *
 * Intended for happy-path tests of `embedMany` call sites. Construct
 * `MockEmbeddingModelV3` directly when a test needs a thrown error or a
 * custom embedding payload.
 */
export function createMockEmbeddingModel(
  options: MockEmbeddingModelOptions = {}
): MockEmbeddingModelV3 {
  const dimensions = options.dimensions ?? 4;

  return new MockEmbeddingModelV3({
    provider: options.provider ?? 'mock-provider',
    modelId: options.modelId ?? 'mock-model',
    maxEmbeddingsPerCall: options.maxEmbeddingsPerCall ?? Infinity,
    doEmbed: async ({ values }) => ({
      embeddings: values.map((v) => buildEmbeddingVector(v, dimensions)),
      usage: { tokens: options.tokens ?? values.length },
      warnings: [],
    }),
  });
}
