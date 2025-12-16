import { describe, it, expect } from 'vitest';
import { extractToolCalls } from '../../../../src/core/providers/tool-utils';

describe('extractToolCalls', () => {
  it('should extract a simple tool call', () => {
    const content = `
Here is a tool call:
\`\`\`json
{
  "tool": "test_tool",
  "arguments": {
    "arg1": "value1"
  }
}
\`\`\`
`;
    const result = extractToolCalls(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      tool: 'test_tool',
      arguments: {
        arg1: 'value1',
      },
    });
  });

  it('should extract a tool call with nested objects', () => {
    const content = `
\`\`\`json
{
  "tool": "complex_tool",
  "arguments": {
    "nested": {
      "level2": {
        "level3": "value"
      }
    },
    "array": [1, 2, 3]
  }
}
\`\`\`
`;
    const result = extractToolCalls(content);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      tool: 'complex_tool',
      arguments: {
        nested: {
          level2: {
            level3: 'value',
          },
        },
        array: [1, 2, 3],
      },
    });
  });

  it('should handle multiple tool calls', () => {
    const content = `
First call:
\`\`\`json
{ "tool": "tool1", "arguments": {} }
\`\`\`

Second call:
\`\`\`json
{ "tool": "tool2", "arguments": {} }
\`\`\`
`;
    const result = extractToolCalls(content);
    expect(result).toHaveLength(2);
    expect(result[0].tool).toBe('tool1');
    expect(result[1].tool).toBe('tool2');
  });

  it('should ignore invalid JSON', () => {
    const content = `
\`\`\`json
{ "tool": "broken", "arguments": {
\`\`\`
`;
    const result = extractToolCalls(content);
    expect(result).toHaveLength(0);
  });

  it('should ignore blocks without "tool" key', () => {
    const content = `
  \`\`\`json
  { "not_a_tool": "value" }
  \`\`\`
  `;
    const result = extractToolCalls(content);
    expect(result).toHaveLength(0);
  });

  it('should extract tool calls from a JSON array', () => {
    const content = `
\`\`\`json
[
  { "tool": "tool1", "arguments": {} },
  { "tool": "tool2", "arguments": {} }
]
\`\`\`
`;
    const result = extractToolCalls(content);
    expect(result).toHaveLength(2);
    expect(result[0].tool).toBe('tool1');
    expect(result[1].tool).toBe('tool2');
  });
});
