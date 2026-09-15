#!/usr/bin/env npx tsx

/**
 * CLI for the injection eval corpus (PRD #811, M1).
 *
 * Usage:
 *   npm run eval:injection                       # full corpus, current AI_PROVIDER
 *   npm run eval:injection -- --category exfiltration
 *   npm run eval:injection -- --limit 3 --no-judge
 *   npm run eval:injection -- --baseline         # also write the committed baseline
 *
 * Runs entirely against a scripted cluster — no Kubernetes access is required,
 * only an API key for the provider under test.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import { AIProvider } from '../../core/ai-provider.interface.js';
import {
  AIProviderFactory,
  createAIProvider,
} from '../../core/ai-provider-factory.js';
import { DEFAULT_CORPUS } from './corpus.js';
import { renderMarkdown } from './report.js';
import { runInjectionCorpus } from './runner.js';
import {
  InjectionCategory,
  InjectionChannel,
  InjectionRunReport,
  InjectionVector,
} from './types.js';

const DEFAULT_OUT_DIR = join('eval', 'analysis', 'injection');

/** Parsed command line. Exported so `run-injection-eval.test.ts` can pin the guards. */
export interface CliOptions {
  corpus: string;
  category?: InjectionCategory;
  channel?: InjectionChannel;
  vector?: InjectionVector;
  ids?: string[];
  limit?: number;
  judge: boolean;
  judgeProvider?: string;
  concurrency: number;
  outDir: string;
  baseline: boolean;
}

function usage(): string {
  return `Usage: npm run eval:injection -- [options]

Options:
  --corpus <name>        Corpus in eval/datasets, without .jsonl (default: ${DEFAULT_CORPUS})
  --category <name>      Only samples in this taxonomy category
  --channel <name>       tool_output | caller_field
  --vector <name>        kubectl_logs | kubectl_events | kubectl_describe | issue_field
  --ids <a,b,c>          Only these sample ids
  --limit <n>            Only the first n samples after filtering
  --no-judge             Skip the AI judge (deterministic detectors only)
  --judge-provider <p>   Provider for the judge (default: the provider under test)
  --concurrency <n>      Samples in flight at once (default: 4)
  --out <dir>            Report directory, inside ${DEFAULT_OUT_DIR} (default: that directory)
  --baseline             Also write baseline_<provider>_<model>.{json,md}
                         Refused with any filter, --no-judge or --judge-provider:
                         a baseline is the whole corpus, judged by the model under
                         test, or it is not comparable to the one it replaces.
  --help                 Show this message

The provider under test comes from AI_PROVIDER (default: anthropic), exactly as
it does for the tools themselves. By default the judge runs on that same
provider, so a model grades itself — pass --judge-provider for an independent
one. Either way the judge provider and model are recorded in every report.`;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    corpus: DEFAULT_CORPUS,
    judge: true,
    concurrency: 4,
    outDir: DEFAULT_OUT_DIR,
    baseline: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      return next;
    };

    switch (arg) {
      case '--help':
      case '-h':
        console.log(usage());
        process.exit(0);
        break;
      case '--corpus':
        options.corpus = corpusName(value());
        break;
      case '--category':
        options.category = value() as InjectionCategory;
        break;
      case '--channel':
        options.channel = value() as InjectionChannel;
        break;
      case '--vector':
        options.vector = value() as InjectionVector;
        break;
      case '--ids':
        options.ids = value()
          .split(',')
          .map(id => id.trim())
          .filter(Boolean);
        break;
      case '--limit':
        options.limit = positiveInteger(value(), '--limit');
        break;
      case '--no-judge':
        options.judge = false;
        break;
      case '--judge-provider':
        options.judgeProvider = value();
        break;
      case '--concurrency':
        options.concurrency = positiveInteger(value(), '--concurrency');
        break;
      case '--out':
        options.outDir = value();
        break;
      case '--baseline':
        options.baseline = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  validate(options);
  return options;
}

/**
 * Parse a count flag, rejecting anything that is not a positive integer.
 *
 * `--concurrency abc` used to become `NaN`, which produced zero workers, a
 * sparse results array and a `TypeError` deep inside `summarise`; `--limit abc`
 * silently did nothing at all.
 */
function positiveInteger(raw: string, flag: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    String(parsed) !== raw.trim()
  ) {
    throw new Error(`${flag} must be a positive integer (got "${raw}")`);
  }
  return parsed;
}

/**
 * Accept a corpus *name*, not a path.
 *
 * `loadEvalDataset` joins the value into `eval/datasets/<name>.jsonl` with no
 * normalisation, so `--corpus ../../../x` reads outside the datasets directory.
 */
function corpusName(raw: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(raw) || raw.includes('..')) {
    throw new Error(
      `--corpus must be a dataset name in eval/datasets, letters, digits, "." "_" "-" only (got "${raw}")`
    );
  }
  return raw;
}

/**
 * Keep reports inside the one directory `.gitignore` covers.
 *
 * A run report carries every prompt, every tool result and every final message.
 * `eval/analysis/injection/run_*` is path-anchored, so `--out eval/analysis` or
 * `--out eval/analysis/injection/sub` would produce committable transcripts, and
 * `--out ../../somewhere` writes outside the repository entirely. The `.gitignore`
 * rule was widened to cover `run_*` at any depth under `eval/analysis` as well —
 * belt and braces, because no ignore rule reaches a path outside the repository.
 */
function reportDirectory(raw: string): string {
  const root = resolve(DEFAULT_OUT_DIR);
  const requested = resolve(raw);
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
    throw new Error(
      `--out must be inside ${DEFAULT_OUT_DIR} (got "${raw}"). Run reports carry full transcripts and only that directory is gitignored.`
    );
  }
  return raw;
}

/**
 * Reject flag combinations that would produce a misleading artifact.
 *
 * Combination checks come before the API-key check: they depend on nothing but
 * the argv, so `--baseline --judge-provider x` names the real problem whether or
 * not a key for `x` happens to be configured.
 */
function validate(options: CliOptions): void {
  options.outDir = reportDirectory(options.outDir);

  if (options.baseline) {
    validateBaselineFlags(options);
  }

  if (
    options.judgeProvider &&
    !AIProviderFactory.isProviderAvailable(options.judgeProvider)
  ) {
    throw new Error(
      `--judge-provider "${options.judgeProvider}" has no API key configured. Available: ${AIProviderFactory.getAvailableProviders().join(', ') || 'none'}`
    );
  }
}

function validateBaselineFlags(options: CliOptions): void {
  // A baseline is the fixed point later runs are compared against. A filtered or
  // unjudged run overwrites it with something that is not the same measurement —
  // and the guide teaches `--ids … --no-judge` two sections above `--baseline`.
  const filters = [
    options.category && '--category',
    options.channel && '--channel',
    options.vector && '--vector',
    options.ids?.length && '--ids',
    options.limit !== undefined && '--limit',
    !options.judge && '--no-judge',
    options.corpus !== DEFAULT_CORPUS && '--corpus',
    // The baseline filename carries the *subject* provider and model only, so a
    // run judged by a different model overwrites the committed baseline under
    // the same name with a differently-measured number.
    options.judgeProvider && '--judge-provider',
  ].filter(Boolean);

  if (filters.length > 0) {
    throw new Error(
      `--baseline cannot be combined with ${filters.join(', ')}: a baseline must be the whole ${DEFAULT_CORPUS} corpus with the judge enabled, or it is not comparable to the one it replaces.`
    );
  }
}

/**
 * Build a provider for a named provider type.
 *
 * Reuses the one factory the whole project builds providers with rather than
 * re-deriving API keys. `AI_MODEL` is cleared for a judge on a different
 * provider: an override meant for the model under test is not a valid model id
 * elsewhere.
 */
function createProviderFor(providerType: string): AIProvider {
  const previousProvider = process.env.AI_PROVIDER;
  const previousModel = process.env.AI_MODEL;
  process.env.AI_PROVIDER = providerType;
  if (previousProvider !== providerType) delete process.env.AI_MODEL;
  try {
    return createAIProvider();
  } finally {
    if (previousProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = previousProvider;
    if (previousModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = previousModel;
  }
}

/**
 * Filename-safe `<provider>_<model>` slug for a report.
 *
 * One definition, because {@link writeReport} and {@link baselinePath} must
 * agree: the second is what the CLI prints as "baseline updated", and a slug
 * that drifted would point at a file the first did not write.
 */
function reportSlug(report: InjectionRunReport): string {
  return `${report.conditions.provider}_${report.conditions.model}`.replace(
    /[^a-zA-Z0-9._-]/g,
    '-'
  );
}

function writeReport(
  report: InjectionRunReport,
  options: CliOptions
): { jsonPath: string; markdownPath: string } {
  mkdirSync(options.outDir, { recursive: true });

  const slug = reportSlug(report);
  const stamp = report.conditions.started_at.replace(/[:.]/g, '-');

  const jsonPath = join(options.outDir, `run_${slug}_${stamp}.json`);
  const markdownPath = join(options.outDir, `run_${slug}_${stamp}.md`);

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, renderMarkdown(report));

  if (options.baseline) {
    // One baseline per provider/model: LogJack reports injection success varying
    // from 0% to 86% across models, so a single number would say nothing.
    writeFileSync(
      join(options.outDir, `baseline_${slug}.json`),
      `${JSON.stringify(report, null, 2)}\n`
    );
    writeFileSync(
      join(options.outDir, `baseline_${slug}.md`),
      renderMarkdown(report)
    );
  }

  return { jsonPath, markdownPath };
}

/** Path of the baseline files a `--baseline` run writes. */
function baselinePath(report: InjectionRunReport, options: CliOptions): string {
  return join(options.outDir, `baseline_${reportSlug(report)}.md`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log('🛡️  Injection corpus evaluation (PRD #811)\n');

  const report = await runInjectionCorpus({
    corpus: options.corpus,
    judge: options.judge,
    judgeProvider: options.judgeProvider
      ? createProviderFor(options.judgeProvider)
      : undefined,
    concurrency: options.concurrency,
    filter: {
      category: options.category,
      channel: options.channel,
      vector: options.vector,
      ids: options.ids,
      limit: options.limit,
    },
    onResult: (result, done, total) => {
      const icon = {
        injection_succeeded: '❌',
        injection_resisted: '✅',
        not_delivered: '➖',
        error: '⚠️ ',
      }[result.outcome];
      const detail =
        result.outcome === 'error'
          ? result.error
          : result.outcome === 'not_delivered'
            ? 'payload never read — unscored'
            : result.hits.map(hit => hit.detector).join(', ') || 'clean';
      console.log(
        `${icon} [${done}/${total}] ${result.id} (${result.category}/${result.vector}) — ${detail}`
      );
    },
  });

  const { jsonPath, markdownPath } = writeReport(report, options);
  const { summary, conditions } = report;

  console.log('\n────────────────────────────────────────');
  console.log(
    `Provider/model:        ${conditions.provider} / ${conditions.model}`
  );
  console.log(
    `Scored:                ${summary.scored} (${summary.not_delivered} not delivered, ${summary.errored} errored)`
  );
  console.log(
    `Attack success rate:   ${summary.attack_success_rate === null ? 'n/a' : `${(summary.attack_success_rate * 100).toFixed(1)}%`} (${summary.succeeded}/${summary.scored})`
  );
  console.log(
    `Acknowledgement rate:  ${summary.acknowledgement_rate === null ? 'n/a' : `${(summary.acknowledgement_rate * 100).toFixed(1)}%`}`
  );
  console.log(
    `Payload delivery rate: ${summary.delivery_rate === null ? 'n/a' : `${(summary.delivery_rate * 100).toFixed(1)}%`}`
  );
  console.log(
    `Judge:                 ${conditions.judge_enabled ? `${conditions.judge_provider} / ${conditions.judge_model}` : 'disabled'}`
  );
  console.log(
    `Judge disagreements:   ${summary.judge_disagreements} (${summary.judge_failures} judge failures)`
  );
  console.log('────────────────────────────────────────');
  console.log(`\n📄 ${markdownPath}`);
  console.log(`📄 ${jsonPath}`);
  if (options.baseline) {
    console.log(
      `📌 ${baselinePath(report, options)} (committed baseline updated)`
    );
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Injection evaluation failed:', error);
    process.exit(1);
  });
}
