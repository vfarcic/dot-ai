import { describe, it, expect } from 'vitest';
import {
  extractJsonFromAIResponse,
  findBalancedObjectEnd,
  findShapedJsonObject,
  scanJsonObjectExtents,
} from '../../../src/core/platform-utils';

interface Analysis {
  issueStatus: string;
  rootCause: string;
}

function isAnalysis(parsed: unknown): parsed is Analysis {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const candidate = parsed as Partial<Analysis>;
  return Boolean(candidate.issueStatus && candidate.rootCause);
}

const ANALYSIS = '{"issueStatus":"active","rootCause":"bad image tag"}';

describe('extractJsonFromAIResponse', () => {
  it('parses a JSON object inside a ```json code fence', () => {
    const response =
      '```json\n{"analysis": "ok", "commands": ["kubectl get pods"]}\n```';
    expect(extractJsonFromAIResponse(response)).toEqual({
      analysis: 'ok',
      commands: ['kubectl get pods'],
    });
  });

  it('tolerates trailing prose after the JSON inside the fence (operate flake regression)', () => {
    // Regression for the intermittent operate failure: the model appended an
    // explanatory sentence after the JSON object but still inside the ```json
    // fence, which made the previous naive JSON.parse throw
    // "Unexpected non-whitespace character after JSON at position N".
    const response =
      '```json\n{"analysis": "done", "commands": ["helm upgrade x"]}\nThis upgrade is safe to apply.\n```';
    expect(extractJsonFromAIResponse(response)).toMatchObject({
      analysis: 'done',
      commands: ['helm upgrade x'],
    });
  });

  it('parses a nested JSON object within a code fence', () => {
    const response =
      '```json\n{"risks": {"level": "low", "description": "none"}, "commands": []}\n```';
    expect(extractJsonFromAIResponse(response)).toEqual({
      risks: { level: 'low', description: 'none' },
      commands: [],
    });
  });

  it('parses a raw JSON object surrounded by prose (no code fence)', () => {
    const response = 'Here is the result:\n{"status": "ok"}\nHope that helps!';
    expect(extractJsonFromAIResponse(response)).toEqual({ status: 'ok' });
  });

  it('parses a bare JSON object', () => {
    expect(extractJsonFromAIResponse('{"a": 1}')).toEqual({ a: 1 });
  });

  it('throws a descriptive error when no JSON object is present', () => {
    expect(() => extractJsonFromAIResponse('no json here at all')).toThrow(
      /Failed to parse JSON from AI response/
    );
  });
});

describe('findShapedJsonObject', () => {
  it('takes the shaped object over an earlier one that merely parses', () => {
    const search = findShapedJsonObject(
      `The resource is {"resource":"pod/web"}.\n${ANALYSIS}`,
      isAnalysis
    );

    expect(search.value).toEqual({
      issueStatus: 'active',
      rootCause: 'bad image tag',
    });
    expect(search.candidateCount).toBe(2);
  });

  it('prefers a fenced block over a shaped object that precedes it', () => {
    const search = findShapedJsonObject(
      `Earlier: {"issueStatus":"resolved","rootCause":"stale"}\n\`\`\`json\n${ANALYSIS}\n\`\`\``,
      isAnalysis
    );

    expect(search.value).toMatchObject({ rootCause: 'bad image tag' });
  });

  it('reports no candidates when the text holds no object at all', () => {
    const search = findShapedJsonObject('nothing here', isAnalysis);

    expect(search.value).toBeNull();
    expect(search.candidateCount).toBe(0);
    expect(search.firstBraceError).toBeUndefined();
  });

  it('hands back the first brace parse error so callers can still explain themselves', () => {
    const search = findShapedJsonObject(
      'Analysis: {"issueStatus": ',
      isAnalysis
    );

    expect(search.value).toBeNull();
    expect(search.candidateCount).toBe(1);
    expect(search.firstBraceError?.message).toMatch(
      /Could not find complete JSON object/
    );
  });

  it('does not treat a brace inside a string as structure', () => {
    const search = findShapedJsonObject(
      '{"issueStatus":"active","rootCause":"the log said {\\"stop\\": true}"}',
      isAnalysis
    );

    expect(search.value).toMatchObject({
      rootCause: 'the log said {"stop": true}',
    });
  });
});

describe('scanJsonObjectExtents', () => {
  /**
   * Deterministic LCG, so a failure is a seed and not a coin toss.
   */
  function lcg(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  const ALPHABET = ['{', '}', '"', '\\', 'a', ':', ',', ' ', '\n', '1', '`'];

  function randomText(rng: () => number, length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) {
      out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
    }
    return out;
  }

  /**
   * The one-pass scan has to agree with the per-candidate scan on every `{`,
   * not just on the shapes a human thinks to write down. The alphabet is the
   * characters the scan actually reasons about — braces, quotes, backslashes —
   * at a density no real response reaches, which is the point.
   */
  function expectAgreesWithReference(text: string): void {
    const extents = scanJsonObjectExtents(text);

    const braces: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') braces.push(i);
    }

    expect(extents.map(extent => extent.start)).toEqual(braces);
    expect(extents.map(extent => extent.end)).toEqual(
      braces.map(brace => findBalancedObjectEnd(text, brace))
    );
  }

  it('agrees with findBalancedObjectEnd on hand-picked shapes', () => {
    const cases = [
      '',
      '{',
      '{}',
      '{"a":{"b":1}}',
      '{"x": "{ }"}',
      // An unbalanced quote in prose puts the real object "inside a string" for
      // anyone reading the document from the start — but not for a scan that
      // starts at the object, which is the scan being reproduced.
      'He said "hello { world" and then {"issueStatus":"a","rootCause":"b"}',
      '{"a":"{\\"b\\":1}"}',
      // An escaped `{` is invisible to every other scan, so two candidates end
      // at the same `}` and no stack discipline would produce that.
      '{ \\{ }',
      '\\{\\{\\{}}}',
      '"{"{"{"}"}"}',
      '```json\n{"a":1}\n```',
      '{{{}}}',
      '}}}{{{',
      '{\\\\{}',
    ];

    for (const text of cases) expectAgreesWithReference(text);
  });

  it('agrees with findBalancedObjectEnd across a generated corpus', () => {
    const rng = lcg(20260915);

    for (let trial = 0; trial < 4000; trial++) {
      expectAgreesWithReference(randomText(rng, 1 + Math.floor(rng() * 24)));
    }
    for (let trial = 0; trial < 60; trial++) {
      expectAgreesWithReference(randomText(rng, 400));
    }
  });
});

describe('findShapedJsonObject - cost on adversarial input', () => {
  /**
   * CWE-400, found by review on the commit that consolidated this scan: every
   * `{` was a candidate and every candidate was brace-matched to the end of the
   * response, so unmatched braces cost O(n²) of uninterruptible work on the
   * runtime that serves every other request at the same time. Measured on the
   * quadratic version: 5.5 s for the 64 000 braces below, 3.4 s for the nested
   * object, 0.6 s for the deep valid one. All three are single-digit
   * milliseconds now, so this budget is slack, not a race.
   */
  it('stays bounded on responses built to make it quadratic', () => {
    const started = Date.now();

    findShapedJsonObject('{'.repeat(64000), isAnalysis);
    findShapedJsonObject('{'.repeat(8000) + '}'.repeat(8000), isAnalysis);
    findShapedJsonObject(
      '{"a":'.repeat(8000) + '1' + '}'.repeat(8000),
      isAnalysis
    );
    findShapedJsonObject('"' + '{'.repeat(16000), isAnalysis);
    findShapedJsonObject('\\{'.repeat(16000), isAnalysis);
    findShapedJsonObject('```json\n{\n'.repeat(4000), isAnalysis);
    findShapedJsonObject('```json\n{}\n```\n'.repeat(4000), isAnalysis);

    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('still finds the analysis buried behind the pathological input', () => {
    // Unfenced on purpose: fenced candidates come first, so a fence here would
    // let the search win without ever touching the 64 000 unbalanced braces.
    // This way every one of them is considered first, which is 4.9 s of the
    // quadratic version and 6 ms of this one — and the answer is the same.
    const started = Date.now();

    const search = findShapedJsonObject(
      `${'{'.repeat(64000)}\n${ANALYSIS}`,
      isAnalysis
    );

    expect(search.value).toEqual({
      issueStatus: 'active',
      rootCause: 'bad image tag',
    });
    expect(search.candidateCount).toBe(64001);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('keeps fenced candidates ahead of unfenced ones across many fences', () => {
    const decoy = '{"issueStatus":"resolved","rootCause":"decoy"}';
    const response = [
      decoy,
      '```json\n{"note":"not an analysis"}\n```\n'.repeat(4000),
      `\`\`\`json\n${ANALYSIS}\n\`\`\``,
    ].join('\n');

    expect(findShapedJsonObject(response, isAnalysis).value).toMatchObject({
      rootCause: 'bad image tag',
    });
  });

  it('says so when the parse budget stopped it, rather than reporting absence', () => {
    // Deep enough that the candidate extents sum past the budget: every one of
    // the 32 000 candidates is valid JSON averaging half the response.
    const search = findShapedJsonObject(
      `${'{"a":'.repeat(32000)}1${'}'.repeat(32000)}\n${ANALYSIS}`,
      isAnalysis
    );

    expect(search.value).toBeNull();
    expect(search.budgetExhausted).toBe(true);
  });

  it('does not touch the budget on a response of ordinary shape', () => {
    const search = findShapedJsonObject(
      `Nothing is wrong. Note the empty \`"resources": {}\`.\n\`\`\`json\n${ANALYSIS}\n\`\`\``,
      isAnalysis
    );

    expect(search.value).toMatchObject({ rootCause: 'bad image tag' });
    expect(search.budgetExhausted).toBeUndefined();
  });
});
