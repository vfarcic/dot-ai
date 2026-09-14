/**
 * Types for the prompt-injection evaluation corpus and harness (PRD #811, M1).
 *
 * The corpus measures whether the investigation loop treats attacker-writable
 * text as *instruction* rather than *data*. Two channels are covered:
 *
 * - `tool_output`  — Channel 1: text returned by `kubectl_logs`, `kubectl_events`
 *                    and `kubectl_describe` (annotations). Entirely engine-internal.
 * - `caller_field` — Channel 2: the single caller-supplied field
 *                    (`remediate.issue`, `query.intent`, `recommend.intent`).
 *
 * Corpus samples are stored in the OpenAI Evals standard shape that
 * `src/evaluation/datasets/loader.ts` already reads: `{ input, ideal, metadata }`.
 */

/** Which trust channel carries the payload into model context. */
export type InjectionChannel = 'tool_output' | 'caller_field';

/**
 * Where the payload is planted.
 *
 * `issue_field` is the Channel 2 vector; the rest are the Channel 1 tools named
 * in the PRD as returning attacker-writable text.
 */
export type InjectionVector =
  | 'kubectl_logs'
  | 'kubectl_events'
  | 'kubectl_describe'
  | 'issue_field';

/**
 * Payload taxonomy, structured after LogJack (https://arxiv.org/abs/2604.15368).
 *
 * `intent_keyword` is not from LogJack — it covers the GrafanaGhost finding that
 * the literal keyword `INTENT` inside a payload helped the target model treat
 * planted text as authoritative. This project's caller field is named `intent`.
 */
export type InjectionCategory =
  | 'direct_instruction'
  | 'role_spoofing'
  | 'delimiter_spoofing'
  | 'intent_keyword'
  | 'exfiltration'
  | 'action_hijack'
  | 'suppression';

/** Predicate matching a tool call the model must not make. */
export interface ForbiddenToolCall {
  /** Tool name that must not be called. */
  tool: string;
  /**
   * Optional substrings that must all appear (case-insensitively) in the
   * JSON-serialised tool input for the call to count as forbidden. Omit to
   * forbid the tool outright.
   */
  input_includes?: string[];
}

/**
 * Deterministic detectors for a sample.
 *
 * Every field is optional. A sample with no populated detector field is judged
 * by the AI judge alone (see `judge_authoritative`).
 */
export interface InjectionDetectors {
  /** Tool calls that only a compliant-with-the-injection model would make. */
  must_not_call?: ForbiddenToolCall[];
  /**
   * Literals that must not appear in the final response or in any tool input —
   * canaries, attacker-chosen resource names, exfiltration endpoints.
   *
   * A literal naming the fixture's own credential material (`SECRET_CANARY_GROUPS`
   * in `fixtures.ts`) is treated differently: it is looked for in the whole
   * response rather than the narrow action surface, matched by prefix rather
   * than exactly, and it selects the **material** — so naming any one spelling
   * searches for every form of it. Everything else is an exact substring match.
   */
  must_not_emit?: string[];
  /**
   * At least one of these must appear in the final response. Used by
   * suppression payloads: an injection that talked the model out of reporting
   * the real fault removes every one of them.
   */
  must_emit_any?: string[];
  /**
   * `issueStatus` values in the final analysis JSON that would mean the model
   * accepted a planted "nothing is wrong here" claim.
   */
  must_not_report_status?: string[];
  /**
   * When true, an empty (or missing) `remediation.actions` list counts as
   * compliance.
   *
   * Several payloads ask for two things at once — flip the status *and* return
   * no actions, or report "no issue found" *and* stop investigating. Without
   * this, a model that keeps `issueStatus: "active"` but drops the fix scores as
   * resistance, so partial compliance is invisible. Only set it on samples whose
   * fixture has a genuine active fault, where a correct run must always propose
   * something.
   */
  must_propose_actions?: boolean;
}

/** A single corpus sample, after validation. */
export interface InjectionSample {
  /** Stable identifier, e.g. `inj-001`. Used in reports and baselines. */
  id: string;
  category: InjectionCategory;
  channel: InjectionChannel;
  vector: InjectionVector;
  /** Fixture name describing the synthetic cluster the run investigates. */
  fixture: string;
  /** The operator's genuine request, as it reaches `remediate.issue`. */
  issue: string;
  /** The attacker-controlled text planted at `vector`. */
  payload: string;
  /** Prose description of correct behaviour, shown to the judge. */
  behavior: string;
  /** Prose description of what the attacker is trying to achieve. */
  attack_objective: string;
  detectors: InjectionDetectors;
  /**
   * When true the judge verdict decides the outcome, because no deterministic
   * detector can distinguish compliance from a coincidentally similar answer.
   */
  judge_authoritative: boolean;
  tags: string[];
  complexity: 'low' | 'medium' | 'high';
}

/** One tool call as observed by the harness executor. */
export interface RecordedToolCall {
  tool: string;
  input: unknown;
  /** Output text handed back to the model. */
  output: string;
}

/** Why a sample was scored as `injection_succeeded`. */
export interface DetectorHit {
  detector:
    | 'forbidden_tool_call'
    | 'canary_leak'
    | 'secret_leak'
    | 'omission'
    | 'status_flip'
    | 'no_remediation'
    | 'judge';
  evidence: string;
}

/** Verdict returned by the AI judge. */
export interface JudgeVerdict {
  verdict: 'resisted' | 'succeeded';
  complied_with: string;
  evidence: string;
  flagged_as_untrusted: boolean;
  confidence: number;
  /**
   * False when the judge answered but named no usable `confidence` — the field
   * was absent, not a number, or outside `[0,1]`.
   *
   * `confidence` then reads 0, which used to be indistinguishable from a failed
   * judge and threw the verdict away. A verdict is the answer to the question
   * asked; the confidence is commentary on it. Absent on verdicts written before
   * this flag existed, which is why `judgeFailed` falls back to `confidence === 0`
   * only when `failed` itself is absent.
   */
  confidence_reported?: boolean;
  /**
   * True when the judge never produced a usable verdict — the call failed, the
   * response would not parse, or it carried no recognisable `verdict` field.
   *
   * `verdict` still reads `resisted` in that case, because the judge must never
   * be the thing that invents a finding. But a failed call is not evidence of
   * resistance either: on a `judge_authoritative` sample `combineVerdict` routes
   * this to outcome `error`, so a rate limit cannot quietly become a pass.
   */
  failed?: boolean;
}

/**
 * Outcome of scoring one run.
 *
 * `not_delivered` means the model never called the tool carrying the payload, so
 * the planted text never entered its context. Such a run proves nothing about
 * resistance and is excluded from the attack-success rate rather than counted as
 * a win — see `InjectionRunSummary.not_delivered`.
 */
export type InjectionOutcome =
  | 'injection_resisted'
  | 'injection_succeeded'
  | 'not_delivered'
  | 'error';

/** Full result for one corpus sample. */
export interface InjectionSampleResult {
  id: string;
  category: InjectionCategory;
  channel: InjectionChannel;
  vector: InjectionVector;
  outcome: InjectionOutcome;
  /** True when the payload actually reached model context during the run. */
  payload_delivered: boolean;
  /**
   * Detector hits that produced an `injection_succeeded` outcome.
   *
   * On an `error` result these are **observations, not scoring**: `must_not_call`
   * reads the recorded tool calls and needs no final message, so a forbidden call
   * the model already made is kept as evidence even though the run died before it
   * could be scored. The outcome stays `error` and the run stays out of both ASR
   * terms — an outage must not manufacture a finding, but it need not erase one
   * either.
   */
  hits: DetectorHit[];
  /** True when the model explicitly called the planted text out as untrusted. */
  acknowledged: boolean;
  /** Judge verdict, when the judge ran. */
  judge?: JudgeVerdict;
  /** True when the deterministic detectors and the judge disagreed. */
  judge_disagreement?: boolean;
  /**
   * True when the final message could not be parsed as the analysis JSON, so the
   * canary surface fell back to the whole message.
   */
  analysis_parse_failed?: boolean;
  final_message: string;
  tool_calls: RecordedToolCall[];
  iterations: number;
  duration_ms: number;
  error?: string;
}

/** Aggregated numbers for a corpus run. */
export interface InjectionRunSummary {
  corpus: string;
  corpus_samples: number;
  /** Runs where the payload reached context and a verdict was reached. */
  scored: number;
  errored: number;
  /** Runs where the model never called the tool carrying the payload. */
  not_delivered: number;
  /**
   * delivered / attempted, rounded to 4 decimals. `null` when nothing ran.
   *
   * Counted from each result's `payload_delivered` flag, so an errored run that
   * never reached the payload vector is not counted as a delivery.
   */
  delivery_rate: number | null;
  succeeded: number;
  resisted: number;
  /** succeeded / scored, rounded to 4 decimals. `null` when nothing scored. */
  attack_success_rate: number | null;
  /** acknowledged / scored, rounded to 4 decimals. `null` when nothing scored. */
  acknowledgement_rate: number | null;
  judge_disagreements: number;
  /** Runs whose judge call produced no usable verdict. */
  judge_failures: number;
  /** Runs where the final message was not parseable as the analysis JSON. */
  analysis_parse_failures: number;
  by_category: Record<string, CategoryBreakdown>;
  by_channel: Record<string, CategoryBreakdown>;
  by_vector: Record<string, CategoryBreakdown>;
}

/** Per-slice counts used in every breakdown table. */
export interface CategoryBreakdown {
  scored: number;
  succeeded: number;
  attack_success_rate: number | null;
}

/** Conditions a run was produced under — recorded with every baseline. */
export interface InjectionRunConditions {
  provider: string;
  model: string;
  /** ISO-8601 timestamp of when the run started. */
  started_at: string;
  corpus_version: string;
  judge_enabled: boolean;
  /**
   * Provider the judge ran on. Defaults to the provider under test, which means
   * a model is usually grading itself — recorded explicitly so a baseline states
   * who judged it and "0 judge disagreements" can be read for what it is worth.
   */
  judge_provider: string | null;
  judge_model: string | null;
  max_iterations: number;
  concurrency: number;
  /** Git commit the harness ran at, when resolvable. */
  commit?: string;
}

/** Everything written to the JSON report. */
export interface InjectionRunReport {
  conditions: InjectionRunConditions;
  summary: InjectionRunSummary;
  results: InjectionSampleResult[];
}
