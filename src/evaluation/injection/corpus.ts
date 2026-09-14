/**
 * Injection corpus loading and validation (PRD #811, M1).
 *
 * The corpus is hand-authored JSONL living in `eval/datasets`, the home the PRD
 * names. It is read with the existing OpenAI Evals standard loader
 * (`src/evaluation/datasets/loader.ts`) rather than a second loader; this module
 * only adds the injection-specific validation on top, so a malformed sample
 * fails loudly at load time instead of silently scoring as "resisted".
 *
 * Note on `eval/datasets`: `.gitignore` excludes `eval/datasets/*.jsonl` because
 * that directory is also where `DEBUG_DOT_AI=true` integration runs drop captured
 * model artifacts. The hand-authored corpora are re-included by an explicit
 * `!eval/datasets/injection-corpus-*.jsonl` negation so they stay under version
 * control. The negation is deliberately narrower than `injection-*.jsonl`: no
 * captured artifact can begin `injection-corpus-`, so nothing a debug run writes
 * can be un-ignored by it.
 */

import { loadEvalDataset, StandardEvalSample } from '../datasets/loader.js';
import { KNOWN_FIXTURES } from './fixtures.js';
import {
  InjectionCategory,
  InjectionChannel,
  InjectionDetectors,
  InjectionSample,
  InjectionVector,
} from './types.js';

/** Default corpus name (without the `.jsonl` extension). */
export const DEFAULT_CORPUS = 'injection-corpus-v1';

const CATEGORIES: readonly InjectionCategory[] = [
  'direct_instruction',
  'role_spoofing',
  'delimiter_spoofing',
  'intent_keyword',
  'exfiltration',
  'action_hijack',
  'suppression',
];

const CHANNELS: readonly InjectionChannel[] = ['tool_output', 'caller_field'];

const VECTORS: readonly InjectionVector[] = [
  'kubectl_logs',
  'kubectl_events',
  'kubectl_describe',
  'issue_field',
];

/**
 * Vectors legal for each channel.
 *
 * Channel 2 is the caller-supplied field and nothing else; Channel 1 is the
 * three tools the PRD names as returning attacker-writable text.
 */
const VECTORS_BY_CHANNEL: Record<InjectionChannel, readonly InjectionVector[]> =
  {
    caller_field: ['issue_field'],
    tool_output: ['kubectl_logs', 'kubectl_events', 'kubectl_describe'],
  };

/**
 * Shape a sample id is allowed to take.
 *
 * Not cosmetic: the id is passed to the provider as `interaction_id`, and under
 * `DEBUG_DOT_AI=true` it is interpolated straight into a capture filename
 * (`src/core/providers/provider-debug-utils.ts:143-146`), so an id containing a
 * path separator writes outside `eval/datasets`. It also keeps an id from
 * breaking the markdown report tables.
 */
const ID_PATTERN = /^inj-\d{3,}$/;

function fail(index: number, message: string): never {
  throw new Error(`Injection corpus sample #${index + 1}: ${message}`);
}

function requireString(value: unknown, index: number, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(index, `"${field}" must be a non-empty string`);
  }
  return value;
}

function requireStringArray(
  value: unknown,
  index: number,
  field: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some(entry => typeof entry !== 'string' || entry.trim() === '')
  ) {
    fail(index, `"${field}" must be an array of non-empty strings`);
  }
  return value as string[];
}

function requireBoolean(
  value: unknown,
  index: number,
  field: string
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    fail(index, `"${field}" must be a boolean`);
  }
  return value;
}

function parseDetectors(raw: unknown, index: number): InjectionDetectors {
  if (raw === undefined) return {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(index, '"ideal.detectors" must be an object');
  }
  const source = raw as Record<string, unknown>;

  let mustNotCall: InjectionDetectors['must_not_call'];
  if (source.must_not_call !== undefined) {
    if (!Array.isArray(source.must_not_call)) {
      fail(index, '"ideal.detectors.must_not_call" must be an array');
    }
    mustNotCall = source.must_not_call.map((entry, entryIndex) => {
      if (typeof entry !== 'object' || entry === null) {
        fail(
          index,
          `"ideal.detectors.must_not_call[${entryIndex}]" must be an object`
        );
      }
      const record = entry as Record<string, unknown>;
      return {
        tool: requireString(
          record.tool,
          index,
          `ideal.detectors.must_not_call[${entryIndex}].tool`
        ),
        input_includes: requireStringArray(
          record.input_includes,
          index,
          `ideal.detectors.must_not_call[${entryIndex}].input_includes`
        ),
      };
    });
  }

  return {
    must_not_call: mustNotCall,
    must_not_emit: requireStringArray(
      source.must_not_emit,
      index,
      'ideal.detectors.must_not_emit'
    ),
    must_emit_any: requireStringArray(
      source.must_emit_any,
      index,
      'ideal.detectors.must_emit_any'
    ),
    must_not_report_status: requireStringArray(
      source.must_not_report_status,
      index,
      'ideal.detectors.must_not_report_status'
    ),
    must_propose_actions: requireBoolean(
      source.must_propose_actions,
      index,
      'ideal.detectors.must_propose_actions'
    ),
  };
}

/** True when at least one deterministic detector is populated. */
export function hasDeterministicDetectors(
  detectors: InjectionDetectors
): boolean {
  return Boolean(
    detectors.must_not_call?.length ||
    detectors.must_not_emit?.length ||
    detectors.must_emit_any?.length ||
    detectors.must_not_report_status?.length ||
    detectors.must_propose_actions
  );
}

/**
 * Validate one raw dataset line into an `InjectionSample`.
 *
 * Exported for unit testing; `loadInjectionCorpus` maps it over the file.
 */
export function parseInjectionSample(
  sample: StandardEvalSample,
  index: number
): InjectionSample {
  const input = (sample.input ?? {}) as Record<string, unknown>;
  const ideal = (sample.ideal ?? {}) as Record<string, unknown>;
  const metadata = (sample.metadata ?? {}) as unknown as Record<
    string,
    unknown
  >;

  const id = requireString(metadata.id, index, 'metadata.id');
  if (!ID_PATTERN.test(id)) {
    fail(index, `"metadata.id" must match ${ID_PATTERN} (got "${id}")`);
  }
  const category = requireString(
    metadata.category,
    index,
    'metadata.category'
  ) as InjectionCategory;
  if (!CATEGORIES.includes(category)) {
    fail(
      index,
      `"metadata.category" must be one of: ${CATEGORIES.join(', ')} (got "${category}")`
    );
  }

  const channel = requireString(
    input.channel,
    index,
    'input.channel'
  ) as InjectionChannel;
  if (!CHANNELS.includes(channel)) {
    fail(
      index,
      `"input.channel" must be one of: ${CHANNELS.join(', ')} (got "${channel}")`
    );
  }

  const vector = requireString(
    input.vector,
    index,
    'input.vector'
  ) as InjectionVector;
  if (!VECTORS.includes(vector)) {
    fail(
      index,
      `"input.vector" must be one of: ${VECTORS.join(', ')} (got "${vector}")`
    );
  }
  if (!VECTORS_BY_CHANNEL[channel].includes(vector)) {
    fail(
      index,
      `channel "${channel}" cannot carry vector "${vector}" (allowed: ${VECTORS_BY_CHANNEL[channel].join(', ')})`
    );
  }

  const complexity = (metadata.complexity ?? 'medium') as
    | 'low'
    | 'medium'
    | 'high';
  if (!['low', 'medium', 'high'].includes(complexity)) {
    fail(index, '"metadata.complexity" must be low, medium or high');
  }

  const detectors = parseDetectors(ideal.detectors, index);
  const judgeAuthoritative = ideal.judge_authoritative === true;

  if (!judgeAuthoritative && !hasDeterministicDetectors(detectors)) {
    fail(
      index,
      'sample has no deterministic detector and is not marked "ideal.judge_authoritative": nothing would score it'
    );
  }

  const tags = requireStringArray(metadata.tags, index, 'metadata.tags') ?? [];

  return {
    id,
    category,
    channel,
    vector,
    fixture: requireFixture(input.fixture, index),
    issue: requireString(input.issue, index, 'input.issue'),
    payload: requireString(input.payload, index, 'input.payload'),
    behavior: requireString(ideal.behavior, index, 'ideal.behavior'),
    attack_objective: requireString(
      ideal.attack_objective,
      index,
      'ideal.attack_objective'
    ),
    detectors,
    judge_authoritative: judgeAuthoritative,
    tags,
    complexity,
  };
}

/**
 * Validate `input.fixture` against the fixtures that actually exist.
 *
 * `createHarnessToolset` throws on an unknown fixture, and that throw happens
 * mid-run inside a `Promise.all` over the whole corpus. Catching a typo at load
 * time — which `npm run test:unit` does, because it loads the committed corpus —
 * keeps it from surfacing halfway through a paid 25-sample run.
 */
function requireFixture(value: unknown, index: number): string {
  const fixture = requireString(value, index, 'input.fixture');
  if (!KNOWN_FIXTURES.includes(fixture as (typeof KNOWN_FIXTURES)[number])) {
    fail(
      index,
      `"input.fixture" must be one of: ${KNOWN_FIXTURES.join(', ')} (got "${fixture}")`
    );
  }
  return fixture;
}

/** Options accepted by `loadInjectionCorpus`. */
export interface CorpusFilter {
  category?: InjectionCategory;
  channel?: InjectionChannel;
  vector?: InjectionVector;
  /** Keep only the first N samples after filtering. */
  limit?: number;
  /** Keep only these sample ids. */
  ids?: string[];
}

/**
 * Load and validate an injection corpus from `eval/datasets`.
 *
 * @param corpusName Dataset name without the `.jsonl` extension
 * @param filter Optional narrowing for focused runs
 * @throws when a sample is malformed or two samples share an id
 */
export function loadInjectionCorpus(
  corpusName: string = DEFAULT_CORPUS,
  filter?: CorpusFilter
): InjectionSample[] {
  const raw = loadEvalDataset(corpusName);
  const samples = raw.map(parseInjectionSample);

  const seen = new Set<string>();
  for (const sample of samples) {
    if (seen.has(sample.id)) {
      throw new Error(
        `Injection corpus "${corpusName}" has duplicate sample id "${sample.id}"`
      );
    }
    seen.add(sample.id);
  }

  let filtered = samples;
  if (filter?.category) {
    filtered = filtered.filter(s => s.category === filter.category);
  }
  if (filter?.channel) {
    filtered = filtered.filter(s => s.channel === filter.channel);
  }
  if (filter?.vector) {
    filtered = filtered.filter(s => s.vector === filter.vector);
  }
  if (filter?.ids?.length) {
    const wanted = new Set(filter.ids);
    filtered = filtered.filter(s => wanted.has(s.id));
  }
  if (filter?.limit !== undefined && filter.limit >= 0) {
    filtered = filtered.slice(0, filter.limit);
  }

  return filtered;
}
