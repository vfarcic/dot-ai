/**
 * Unit tests for `VercelProvider.toolLoop` using the Vercel AI SDK's mock model.
 *
 * Issue #464, followup to PR #493 (sendMessage happy-path) and PR #572
 * (sendMessage error paths). Covers the multi-step tool-call flow:
 *   1. Happy path: a single `tool-call` content part, executor invoked
 *      with the parsed input, final text step closes the loop.
 *   2. Multi-step: two sequential tool calls in distinct steps, recorded
 *      in order on `toolCallsExecuted`, with `iterations` reflecting the
 *      total number of model calls.
 *   3. Graceful recovery: when the model emits a tool-call referencing an
 *      unknown tool, the SDK skips execution rather than throwing; the
 *      provider must continue the loop and return the final text without
 *      invoking the user-supplied executor.
 *
 * Strategy mirrors `vercel-provider.test.ts`: stub `@ai-sdk/anthropic`'s
 * `createAnthropic` to hand back a `MockLanguageModelV3` whose
 * `doGenerate` returns a scripted sequence of responses. The real
 * `generateText` from the `ai` package drives the loop end-to-end against
 * the mock, exercising the provider's tool wiring and executor capture
 * without any network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3 } from '@ai-sdk/provider';

const { mockCreateAnthropic } = vi.hoisted(() => ({
  mockCreateAnthropic: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mockCreateAnthropic,
}));

vi.mock('../../../../src/core/tracing/ai-tracing', () => ({
  withAITracing: vi.fn((_config, fn) => fn()),
}));

// The provider hands the final AgenticResult shape to
// `createAndLogAgenticResult`; in unit tests we just echo the structural
// fields back so assertions can target `finalMessage`, `status`,
// `toolCallsExecuted`, etc. without pulling in real telemetry plumbing.
vi.mock('../../../../src/core/providers/provider-debug-utils', () => ({
  generateDebugId: vi.fn(() => 'debug-id'),
  debugLogInteraction: vi.fn(),
  debugLogPromptOnly: vi.fn(),
  logEvaluationDataset: vi.fn(),
  createAndLogAgenticResult: vi.fn((config: Record<string, unknown>) => ({
    finalMessage: config.finalMessage,
    iterations: config.iterations,
    toolCallsExecuted: config.toolCallsExecuted,
    totalTokens: config.totalTokens,
    status: config.status,
    completionReason: config.completionReason,
    modelVersion: config.modelVersion,
  })),
}));

import { VercelProvider } from '../../../../src/core/providers/vercel-provider';
import type { AITool } from '../../../../src/core/ai-provider.interface';

type GenerateResult = Awaited<ReturnType<LanguageModelV3['doGenerate']>>;

/**
 * Build a `MockLanguageModelV3` that walks through a scripted sequence of
 * `doGenerate` results. The N-th `doGenerate` call returns the N-th entry;
 * the script must contain at least one entry, and a final `stop` step is
 * what terminates the loop. Calls past the script length reuse the last
 * entry as a safety net so a buggy assertion does not hang the test.
 */
function createScriptedModel(results: GenerateResult[]): MockLanguageModelV3 {
  let call = 0;
  return new MockLanguageModelV3({
    provider: 'mock-provider',
    modelId: 'mock-model',
    doGenerate: async () => {
      const index = Math.min(call, results.length - 1);
      call += 1;
      return results[index];
    },
  });
}

function usage(input: number, output: number): GenerateResult['usage'] {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: undefined },
    outputTokens: { total: output, reasoning: undefined },
    totalTokens: input + output,
  };
}

/**
 * Minimal `AITool` matching the codebase's interface. The schema accepts
 * a single `query` string so we can assert the executor receives the
 * parsed input the model emitted.
 */
const echoTool: AITool = {
  name: 'echo',
  description: 'Echo the query back to the caller.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
};

const addTool: AITool = {
  name: 'add',
  description: 'Add two numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number' },
      b: { type: 'number' },
    },
    required: ['a', 'b'],
  },
};

describe('VercelProvider.toolLoop (with MockLanguageModelV3)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DEBUG_DOT_AI;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('executes a tool-call step and returns the final text on the next step', async () => {
    // Step 1: model asks to call `echo` with {"query":"hello"}.
    // Step 2: model returns a plain text final answer.
    const model = createScriptedModel([
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'echo',
            input: JSON.stringify({ query: 'hello' }),
          },
        ],
        finishReason: 'tool-calls',
        usage: usage(12, 4),
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'done: hello' }],
        finishReason: 'stop',
        usage: usage(8, 6),
        warnings: [],
      },
    ]);
    mockCreateAnthropic.mockReturnValue(() => model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    const executor = vi.fn(async (_name: string, input: unknown) => {
      const typed = input as { query: string };
      return { echoed: typed.query };
    });

    const result = await provider.toolLoop({
      systemPrompt: 'sys',
      userMessage: 'please echo hello',
      tools: [echoTool],
      toolExecutor: executor,
    });

    // Executor saw the parsed JSON object, not the SDK's raw input string.
    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith('echo', { query: 'hello' });

    expect(result.status).toBe('success');
    expect(result.completionReason).toBe('investigation_complete');
    expect(result.finalMessage).toBe('done: hello');
    expect(result.iterations).toBe(2);
    expect(result.toolCallsExecuted).toEqual([
      {
        tool: 'echo',
        input: { query: 'hello' },
        output: { echoed: 'hello' },
      },
    ]);

    // The SDK called the model twice: once for the tool request, once
    // for the final text response after the tool result was injected.
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('records multiple tool calls across steps in execution order', async () => {
    // Step 1: call `echo`. Step 2: call `add`. Step 3: final text. The
    // provider should capture both tool invocations in the order they
    // were executed, and `iterations` should reflect all three steps.
    const model = createScriptedModel([
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-echo',
            toolName: 'echo',
            input: JSON.stringify({ query: 'first' }),
          },
        ],
        finishReason: 'tool-calls',
        usage: usage(10, 3),
        warnings: [],
      },
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-add',
            toolName: 'add',
            input: JSON.stringify({ a: 2, b: 3 }),
          },
        ],
        finishReason: 'tool-calls',
        usage: usage(5, 2),
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'all done' }],
        finishReason: 'stop',
        usage: usage(4, 5),
        warnings: [],
      },
    ]);
    mockCreateAnthropic.mockReturnValue(() => model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    const executor = vi.fn(async (name: string, input: unknown) => {
      if (name === 'echo') {
        const typed = input as { query: string };
        return { echoed: typed.query };
      }
      if (name === 'add') {
        const typed = input as { a: number; b: number };
        return { sum: typed.a + typed.b };
      }
      throw new Error(`unexpected tool: ${name}`);
    });

    const result = await provider.toolLoop({
      systemPrompt: 'sys',
      userMessage: 'call two tools then summarise',
      tools: [echoTool, addTool],
      toolExecutor: executor,
    });

    expect(executor).toHaveBeenCalledTimes(2);
    expect(executor).toHaveBeenNthCalledWith(1, 'echo', { query: 'first' });
    expect(executor).toHaveBeenNthCalledWith(2, 'add', { a: 2, b: 3 });

    expect(result.status).toBe('success');
    expect(result.finalMessage).toBe('all done');
    expect(result.iterations).toBe(3);
    expect(result.toolCallsExecuted).toEqual([
      { tool: 'echo', input: { query: 'first' }, output: { echoed: 'first' } },
      { tool: 'add', input: { a: 2, b: 3 }, output: { sum: 5 } },
    ]);
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it('skips an unknown tool gracefully and still returns the final text', async () => {
    // Step 1: model asks for a tool that was never registered. The SDK
    // does not throw; it skips execution and the loop continues.
    // Step 2: model produces the final text. The provider must surface
    // a successful AgenticResult and must NOT invoke the executor.
    const model = createScriptedModel([
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-unknown',
            toolName: 'not_a_real_tool',
            input: JSON.stringify({ anything: true }),
          },
        ],
        finishReason: 'tool-calls',
        usage: usage(2, 1),
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'recovered without tool' }],
        finishReason: 'stop',
        usage: usage(3, 2),
        warnings: [],
      },
    ]);
    mockCreateAnthropic.mockReturnValue(() => model);

    const provider = new VercelProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      debugMode: false,
    });

    const executor = vi.fn(async () => ({ never: 'called' }));

    const result = await provider.toolLoop({
      systemPrompt: 'sys',
      userMessage: 'try a nonexistent tool',
      tools: [echoTool],
      toolExecutor: executor,
    });

    // Executor must not run for a tool the provider never registered.
    expect(executor).not.toHaveBeenCalled();

    // `toolCallsExecuted` is populated inside the wrapped `execute()` we
    // hand the SDK, so an unrun tool leaves the array empty. The loop
    // itself still completes successfully because `generateText` did not
    // reject.
    expect(result.status).toBe('success');
    expect(result.toolCallsExecuted).toEqual([]);
    expect(result.finalMessage).toBe('recovered without tool');
    expect(result.iterations).toBe(2);
  });
});
