/**
 * Unit tests for the injection eval CLI (PRD #811, M1).
 *
 * Everything here is about the flags that can quietly produce a *wrong artifact*
 * rather than an error: a baseline overwritten by a one-sample run, a full
 * transcript written somewhere `.gitignore` does not cover, a path that escapes
 * `eval/datasets`, a count flag that becomes `NaN`.
 */

import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../../../src/evaluation/injection/run-injection-eval';

describe('parseArgs', () => {
  it('defaults to the whole corpus with the judge enabled', () => {
    expect(parseArgs([])).toMatchObject({
      corpus: 'injection-corpus-v1',
      judge: true,
      concurrency: 4,
      baseline: false,
      outDir: 'eval/analysis/injection',
    });
  });

  it('accepts the documented filters', () => {
    expect(
      parseArgs(['--ids', 'inj-012, inj-015', '--no-judge', '--limit', '2'])
    ).toMatchObject({
      ids: ['inj-012', 'inj-015'],
      judge: false,
      limit: 2,
    });
  });

  it('accepts --corpus injection-corpus-v2 without writing a baseline', () => {
    expect(parseArgs(['--corpus', 'injection-corpus-v2'])).toMatchObject({
      corpus: 'injection-corpus-v2',
      baseline: false,
      judge: true,
    });
  });
});

describe('--baseline guards', () => {
  /**
   * The guide teaches `--ids … --no-judge` two sections above `--baseline`, and
   * nothing used to couple them: a one-sample unjudged run overwrote the
   * committed baseline that later work is measured against.
   */
  it.each([
    ['--ids', ['--ids', 'inj-012']],
    ['--category', ['--category', 'exfiltration']],
    ['--channel', ['--channel', 'caller_field']],
    ['--vector', ['--vector', 'kubectl_logs']],
    ['--limit', ['--limit', '3']],
    ['--no-judge', ['--no-judge']],
    ['--corpus', ['--corpus', 'injection-corpus-v2']],
    // The baseline filename carries the subject provider and model only, so a
    // differently-judged run overwrites the committed baseline under its name.
    ['--judge-provider', ['--judge-provider', 'anthropic']],
  ])('refuses --baseline combined with %s', (flag, argv) => {
    expect(() => parseArgs([...argv, '--baseline'])).toThrow(
      new RegExp(
        `--baseline cannot be combined with .*${flag.replace(/-/g, '\\-')}`
      )
    );
  });

  it('allows --baseline on its own', () => {
    expect(parseArgs(['--baseline']).baseline).toBe(true);
  });
});

describe('--out containment', () => {
  it('accepts the report directory itself and a path inside it', () => {
    expect(parseArgs(['--out', 'eval/analysis/injection']).outDir).toBe(
      'eval/analysis/injection'
    );
  });

  it.each([
    'eval/analysis',
    'eval',
    '../somewhere-else',
    '/tmp/injection-reports',
  ])('refuses --out %s, which .gitignore does not cover', dir => {
    // A run report carries every prompt, tool result and final message.
    expect(() => parseArgs(['--out', dir])).toThrow(
      /--out must be inside eval\/analysis\/injection/
    );
  });
});

describe('path and count validation', () => {
  it('refuses a --corpus value that is a path rather than a dataset name', () => {
    expect(() => parseArgs(['--corpus', '../../../etc/passwd'])).toThrow(
      /--corpus must be a dataset name/
    );
  });

  it.each([
    ['--concurrency', 'abc'],
    ['--concurrency', '0'],
    ['--concurrency', '-1'],
    ['--limit', 'abc'],
    ['--limit', '2.5'],
  ])('refuses %s %s instead of silently producing NaN', (flag, value) => {
    expect(() => parseArgs([flag, value])).toThrow(
      new RegExp(`${flag.replace(/-/g, '\\-')} must be a positive integer`)
    );
  });
});

describe('--judge-provider', () => {
  it('refuses a provider with no API key configured', () => {
    expect(() =>
      parseArgs(['--judge-provider', 'not-a-real-provider'])
    ).toThrow(/has no API key configured/);
  });

  it('reports the flag combination before the missing key', () => {
    // Combination checks depend on argv alone, so the message is the same
    // whether or not a key for that provider happens to be configured.
    expect(() =>
      parseArgs(['--baseline', '--judge-provider', 'not-a-real-provider'])
    ).toThrow(/--baseline cannot be combined with --judge-provider/);
  });
});
