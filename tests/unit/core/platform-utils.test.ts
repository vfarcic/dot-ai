import { describe, it, expect } from 'vitest';
import { extractJsonFromAIResponse } from '../../../src/core/platform-utils';

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
