/**
 * Unit Tests: parseAIFinalAnalysis() candidate selection (PRD #811)
 *
 * The parser used to start at `aiResponse.indexOf('{')` and brace-match from
 * there. Models do not cooperate with that: when the investigation finds nothing
 * wrong it pads the answer with a best-practices list, and a line such as
 *
 *   > Missing Resource Requests/Limits: ... defined (`"resources": {}`)
 *
 * put an empty object ahead of the real fenced block. Depth went 1 -> 0 at once,
 * `JSON.parse("{}")` succeeded, the required-field check rejected it, and the
 * analysis further down was never read — surfacing as
 * "Invalid AI final analysis response structure" on a response that contained a
 * perfectly good analysis. It cost four separate diagnoses during this PRD,
 * the last of them a reproducible red integration test.
 *
 * So: candidates are tried in order, a fenced ```json block first, and the first
 * one that both parses AND satisfies the same required-field check the parser
 * always applied is the analysis. Everything here runs on a string — no cluster,
 * no AI call — which is why this bug belongs in a unit test and not in the
 * integration run where it kept being rediscovered.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseAIFinalAnalysis } from '../../../src/tools/remediate';

const VALID_ANALYSIS = {
  issueStatus: 'active',
  rootCause: 'The deployment references an image tag that was never pushed',
  confidence: 0.9,
  factors: [
    'All replicas report ImagePullBackOff',
    'The registry has no such tag',
  ],
  remediation: {
    summary: 'Point the deployment at an image tag that exists',
    actions: [
      {
        description: 'Set the image to nginx:1.27',
        command: 'kubectl set image deployment/web web=nginx:1.27',
        risk: 'low',
        rationale: 'The tag currently referenced does not exist',
      },
    ],
    risk: 'low',
  },
};

const VALID_JSON = JSON.stringify(VALID_ANALYSIS, null, 2);

/** The line from the reproduction: prose braces ahead of the real block. */
const RESOURCES_PROSE = [
  'I checked the deployment and it is healthy — nothing is failing.',
  '',
  'Best practices worth noting anyway:',
  '',
  '> Missing Resource Requests/Limits: the container has no CPU or memory',
  '> requests/limits defined (`"resources": {}`)',
].join('\n');

function fenced(json: string): string {
  return ['```json', json, '```'].join('\n');
}

describe('parseAIFinalAnalysis - choosing the right object', () => {
  beforeEach(() => {
    // The parser console.errors the whole response before throwing; the
    // failure cases below would otherwise bury the test output.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('reads the fenced block past prose containing "resources": {}', () => {
    const response = [RESOURCES_PROSE, '', fenced(VALID_JSON)].join('\n');

    // The trap, pinned: the first brace in this response opens an empty object
    const firstBrace = response.indexOf('{');
    expect(response.substring(firstBrace, firstBrace + 2)).toBe('{}');

    const parsed = parseAIFinalAnalysis(response);

    expect(parsed).toMatchObject({
      issueStatus: 'active',
      rootCause: VALID_ANALYSIS.rootCause,
      confidence: 0.9,
    });
    expect(parsed.remediation.actions).toHaveLength(1);
  });

  test('reads a fenced block with prose both before and after it', () => {
    const response = [
      'Here is what I found after looking at the events.',
      '',
      fenced(VALID_JSON),
      '',
      'Let me know if you would like me to apply this — the change is reversible.',
    ].join('\n');

    expect(parseAIFinalAnalysis(response)).toMatchObject({
      rootCause: VALID_ANALYSIS.rootCause,
      remediation: { risk: 'low' },
    });
  });

  test('still reads a bare JSON object with no fence and no prose', () => {
    expect(parseAIFinalAnalysis(VALID_JSON)).toMatchObject({
      issueStatus: 'active',
      rootCause: VALID_ANALYSIS.rootCause,
      factors: VALID_ANALYSIS.factors,
    });
  });

  test('skips a complete but wrong JSON object that precedes the real one', () => {
    // Parses cleanly, is not an analysis: no rootCause, no factors, no remediation
    const decoy = JSON.stringify({
      issueStatus: 'active',
      resources: { limits: { cpu: '100m', memory: '128Mi' } },
    });

    const response = [
      'For reference, the container spec I would recommend looks like this:',
      '',
      decoy,
      '',
      'And the analysis itself:',
      '',
      fenced(VALID_JSON),
    ].join('\n');

    expect(parseAIFinalAnalysis(response)).toMatchObject({
      rootCause: VALID_ANALYSIS.rootCause,
    });
  });

  test('skips a complete but wrong object even when nothing is fenced', () => {
    const decoy = JSON.stringify({ issueStatus: 'active', note: 'unrelated' });
    const response = [decoy, VALID_JSON].join('\n\n');

    expect(parseAIFinalAnalysis(response)).toMatchObject({
      rootCause: VALID_ANALYSIS.rootCause,
    });
  });
});

describe('parseAIFinalAnalysis - failures keep reporting what they did', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('throws when the response contains no analysis and no braces', () => {
    expect(() =>
      parseAIFinalAnalysis('I was unable to complete the investigation.')
    ).toThrow(
      /Failed to parse AI final analysis response: No JSON found in AI final analysis response/
    );
  });

  test('throws when the only objects present are not an analysis', () => {
    expect(() => parseAIFinalAnalysis(RESOURCES_PROSE)).toThrow(
      /Failed to parse AI final analysis response: Invalid AI final analysis response structure/
    );
  });

  test('reports an unterminated object the way it always did', () => {
    expect(() =>
      parseAIFinalAnalysis('Analysis: {"issueStatus": "active", "rootCause": ')
    ).toThrow(
      /Failed to parse AI final analysis response: Could not find complete JSON object in AI response/
    );
  });

  test('keeps the specific field-level error for a malformed analysis', () => {
    const badRisk = JSON.stringify({
      ...VALID_ANALYSIS,
      remediation: { ...VALID_ANALYSIS.remediation, risk: 'catastrophic' },
    });

    expect(() => parseAIFinalAnalysis(fenced(badRisk))).toThrow(
      /Invalid overall risk level: catastrophic/
    );
  });
});

describe('parseAIFinalAnalysis - cost on adversarial input', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('reads the analysis out of a response built to be quadratic', () => {
    // Every `{` is a candidate, and each one used to be brace-matched to the
    // end of the response: 4.1 s of blocked event loop for this input, on a
    // runtime that is single-threaded and serving other requests at the time.
    // Tool output is attacker-writable and the model's response is shaped by
    // it, so this is reachable, not theoretical.
    //
    // Unfenced deliberately — a fenced block is tried first, so fencing it
    // would let the search finish before it ever touched the braces.
    const response = ['{'.repeat(64000), VALID_JSON].join('\n');

    const started = Date.now();
    expect(parseAIFinalAnalysis(response)).toMatchObject({
      rootCause: VALID_ANALYSIS.rootCause,
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('explains a response it could not scan in full instead of blaming its structure', () => {
    // 32 000 nested valid objects: the candidates are all parseable and their
    // lengths sum quadratically, so the scan stops at the parse budget with
    // candidates left. "Invalid structure" would be a lie — the analysis may
    // be in there — so the failure says what actually happened.
    const response = `${'{"a":'.repeat(32000)}1${'}'.repeat(32000)}`;

    expect(() => parseAIFinalAnalysis(response)).toThrow(
      /nests too deeply to scan: 32000 candidate objects in \d+ characters exhausted the JSON parse budget/
    );
  });
});
