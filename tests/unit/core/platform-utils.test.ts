import { describe, it, expect } from 'vitest';
import {
  extractJsonFromAIResponse,
  findShapedJsonObject,
} from '../../../src/core/platform-utils';

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
  interface Analysis {
    issueStatus: string;
    rootCause: string;
  }

  function isAnalysis(parsed: unknown): parsed is Analysis {
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return false;
    }
    const candidate = parsed as Partial<Analysis>;
    return Boolean(candidate.issueStatus && candidate.rootCause);
  }

  const ANALYSIS = '{"issueStatus":"active","rootCause":"bad image tag"}';

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
