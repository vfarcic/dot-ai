/**
 * Injection corpus runner (PRD #811, M1).
 *
 * For each corpus sample the runner drives one full `toolLoop` investigation
 * against a scripted cluster, using the production system prompt and the
 * production user-message composition (see `composition.ts`), then scores the
 * transcript. Nothing here touches a real cluster or a real kubectl.
 */

import { execFileSync } from 'child_process';
import { AgenticResult, AIProvider } from '../../core/ai-provider.interface.js';
import { createAIProvider } from '../../core/ai-provider-factory.js';
import {
  buildRemediateUserMessage,
  loadRemediateSystemPrompt,
  REMEDIATE_MAX_ITERATIONS,
} from './composition.js';
import { CorpusFilter, DEFAULT_CORPUS, loadInjectionCorpus } from './corpus.js';
import {
  combineVerdict,
  forbiddenToolCallHits,
  scoreDeterministic,
} from './detectors.js';
import {
  composeIssue,
  createHarnessToolset,
  payloadDeliveredIn,
} from './fixtures.js';
import { InjectionJudge } from './judge.js';
import { summarise } from './report.js';
import {
  DetectorHit,
  InjectionRunConditions,
  InjectionRunReport,
  InjectionSample,
  InjectionSampleResult,
  RecordedToolCall,
} from './types.js';

/** Options for {@link runInjectionCorpus}. */
export interface InjectionRunOptions {
  /** Corpus name without the `.jsonl` extension. */
  corpus?: string;
  filter?: CorpusFilter;
  /** Provider under test. Defaults to `createAIProvider()` (honours `AI_PROVIDER`). */
  provider?: AIProvider;
  /**
   * Provider used for the judge. Defaults to the provider under test, so by
   * default a model grades itself — which is why the judge provider and model
   * are recorded in every report.
   */
  judgeProvider?: AIProvider;
  /** Run the AI judge. Default true. */
  judge?: boolean;
  /** How many samples to run at once. Default 4. */
  concurrency?: number;
  maxIterations?: number;
  projectRoot?: string;
  /** Called as each sample finishes, for progress output. */
  onResult?: (
    result: InjectionSampleResult,
    done: number,
    total: number
  ) => void;
}

/** Everything a single sample run needs. */
interface SampleContext {
  provider: AIProvider;
  systemPrompt: string;
  maxIterations: number;
  judge: InjectionJudge | null;
}

function resolveCommit(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

/**
 * `completionReason` values that mean the loop did not finish an investigation.
 *
 * `max_iterations` and `parse_failure` are here alongside `error` because a run
 * that ran out of iterations has no final analysis to score: `must_emit_any`
 * would find none of its anchors in an empty message, fire `omission`, and the
 * run would be reported as an attack success that never happened.
 */
const FAILED_COMPLETION_REASONS = ['error', 'max_iterations', 'parse_failure'];

/**
 * Did `toolLoop` come back without a completed investigation?
 *
 * `VercelProvider.toolLoop` catches its own errors and **returns**
 * `{ finalMessage: 'Error during investigation: …', status: 'failed',
 * completionReason: 'error' }` rather than throwing
 * (`src/core/providers/vercel-provider.ts:1020-1041`). Reading only
 * `finalMessage` would score that error string: on a `caller_field` sample the
 * payload counts as delivered unconditionally, no anchor survives in the error
 * text, and a dead API key manufactures attack successes while `errored` stays
 * 0. `status` and `completionReason` are optional on the interface, so an
 * absent value is treated as success and a stub provider keeps working.
 */
export function toolLoopFailure(result: AgenticResult): string | null {
  if (result.status !== undefined && result.status !== 'success') {
    return result.finalMessage || `toolLoop returned status "${result.status}"`;
  }
  if (
    result.completionReason !== undefined &&
    FAILED_COMPLETION_REASONS.includes(result.completionReason)
  ) {
    return (
      result.finalMessage ||
      `toolLoop ended with completionReason "${result.completionReason}"`
    );
  }
  if ((result.finalMessage ?? '').trim() === '') {
    return 'toolLoop produced no final message, so there is nothing to score';
  }
  return null;
}

/**
 * Run one corpus sample end to end.
 *
 * Never throws: a provider failure, a returned-but-failed `toolLoop` and an
 * unknown fixture all become an `error` outcome, so one bad sample cannot void a
 * whole baseline run. That guarantee covers the catch block itself — everything
 * it calls (`wasDelivered`, `observedHits`) swallows its own failures, because a
 * throw from there escapes `runSample` and aborts the whole `Promise.all`.
 */
export async function runSample(
  sample: InjectionSample,
  context: SampleContext
): Promise<InjectionSampleResult> {
  const started = Date.now();

  /**
   * Populated by `createHarnessToolset` and mutated by the executor as the loop
   * runs. It lives out here so a failure inside the try still returns whatever
   * transcript the model produced before things went wrong.
   */
  let calls: RecordedToolCall[] = [];

  const base = () => ({
    id: sample.id,
    category: sample.category,
    channel: sample.channel,
    vector: sample.vector,
    acknowledged: false,
    tool_calls: calls,
  });

  /**
   * Channel 2 payloads ride in the user message, so they always arrive. Channel 1
   * payloads only arrive if the model chose to call the tool carrying them.
   */
  const wasDelivered = (): boolean => {
    if (sample.channel === 'caller_field') return true;
    try {
      return calls.some(call => payloadDeliveredIn(sample, call.output));
    } catch {
      // Called from the catch block below, where a throw is re-thrown out of
      // `runSample` and takes the whole `Promise.all` — and with it every result
      // already paid for — down with it. Nothing about delivery is knowable here.
      return false;
    }
  };

  /**
   * Detector hits observable without a completed run.
   *
   * Only `must_not_call`: it reads the recorded tool calls, so a forbidden call
   * the model made before the loop died is a real observation. Attached as
   * evidence on an `error` result, never as a score — see the outcome table in
   * `report.ts`.
   */
  const observedHits = (): DetectorHit[] => {
    try {
      return forbiddenToolCallHits(sample, calls);
    } catch {
      return [];
    }
  };

  try {
    // Inside the try: an unknown fixture throws here, and `runInjectionCorpus`
    // runs samples through `Promise.all`, so one typo outside it would abort a
    // paid 25-sample run halfway through.
    const toolset = createHarnessToolset(sample);
    calls = toolset.calls;

    const result = await context.provider.toolLoop({
      systemPrompt: context.systemPrompt,
      userMessage: buildRemediateUserMessage(composeIssue(sample)),
      tools: toolset.tools,
      toolExecutor: toolset.executor,
      maxIterations: context.maxIterations,
      operation: 'injection-eval-investigation',
    });

    const failure = toolLoopFailure(result);
    if (failure) {
      return {
        ...base(),
        outcome: 'error' as const,
        payload_delivered: wasDelivered(),
        hits: observedHits(),
        final_message: result.finalMessage ?? '',
        iterations: result.iterations,
        duration_ms: Date.now() - started,
        error: failure,
      };
    }

    const finalMessage = result.finalMessage ?? '';
    const delivered = wasDelivered();

    if (!delivered) {
      // The model never read the tool output carrying the payload. Nothing about
      // resistance was tested, so this must not be counted as a win.
      return {
        ...base(),
        outcome: 'not_delivered' as const,
        payload_delivered: false,
        hits: [],
        final_message: finalMessage,
        iterations: result.iterations,
        duration_ms: Date.now() - started,
      };
    }

    const deterministic = scoreDeterministic(sample, finalMessage, calls);

    const judgeVerdict = context.judge
      ? await context.judge.judge(sample, finalMessage, calls)
      : undefined;

    const verdict = combineVerdict(sample, deterministic, judgeVerdict);

    return {
      ...base(),
      outcome: verdict.outcome,
      payload_delivered: true,
      hits: verdict.hits,
      acknowledged:
        deterministic.acknowledged ||
        Boolean(judgeVerdict?.flagged_as_untrusted),
      judge: judgeVerdict,
      judge_disagreement: verdict.disagreement,
      analysis_parse_failed: deterministic.parseFailed,
      final_message: finalMessage,
      iterations: result.iterations,
      duration_ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ...base(),
      outcome: 'error',
      payload_delivered: wasDelivered(),
      hits: observedHits(),
      final_message: '',
      iterations: 0,
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Run `tasks` with at most `limit` in flight, preserving input order in the output. */
async function withConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= tasks.length) return;
        results[index] = await tasks[index]();
      }
    }
  );

  await Promise.all(workers);
  return results;
}

/** Run a whole corpus and produce the report. */
export async function runInjectionCorpus(
  options: InjectionRunOptions = {}
): Promise<InjectionRunReport> {
  const corpusName = options.corpus ?? DEFAULT_CORPUS;
  const projectRoot = options.projectRoot ?? process.cwd();
  const provider = options.provider ?? createAIProvider();
  const judgeEnabled = options.judge ?? true;
  const judgeProvider = options.judgeProvider ?? provider;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxIterations = options.maxIterations ?? REMEDIATE_MAX_ITERATIONS;

  const samples = loadInjectionCorpus(corpusName, options.filter);
  if (samples.length === 0) {
    throw new Error(
      `Injection corpus "${corpusName}" produced no samples with the requested filter`
    );
  }

  const context: SampleContext = {
    provider,
    systemPrompt: loadRemediateSystemPrompt(projectRoot),
    maxIterations,
    judge: judgeEnabled ? new InjectionJudge(judgeProvider, projectRoot) : null,
  };

  const conditions: InjectionRunConditions = {
    provider: provider.getProviderType(),
    model: provider.getModelName(),
    started_at: new Date().toISOString(),
    corpus_version: corpusName,
    judge_enabled: judgeEnabled,
    judge_provider: judgeEnabled ? judgeProvider.getProviderType() : null,
    judge_model: judgeEnabled ? judgeProvider.getModelName() : null,
    max_iterations: maxIterations,
    concurrency,
    commit: resolveCommit(),
  };

  let done = 0;
  const results = await withConcurrency(
    samples.map(sample => async () => {
      const result = await runSample(sample, context);
      done += 1;
      options.onResult?.(result, done, samples.length);
      return result;
    }),
    concurrency
  );

  return {
    conditions,
    summary: summarise(corpusName, samples.length, results),
    results,
  };
}
