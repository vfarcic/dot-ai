/**
 * Unit tests for ai-retry-config: per-operation maxRetries resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  getMaxRetries,
  __defaults,
  type AIOperation,
} from '../../../src/core/ai-retry-config';

const ALL_OPS: AIOperation[] = ['embeddings', 'chat', 'tool_loop', 'wrap_up'];

describe('ai-retry-config: getMaxRetries', () => {
  it('returns built-in defaults when no env vars are set', () => {
    for (const op of ALL_OPS) {
      expect(getMaxRetries(op, {})).toBe(__defaults[op]);
    }
  });

  it('exposes the expected baseline defaults', () => {
    // Sanity check so accidental changes to the defaults are loud.
    expect(__defaults).toEqual({
      embeddings: 4,
      chat: 2,
      tool_loop: 2,
      wrap_up: 1,
    });
  });

  it('uses the global DOT_AI_AI_MAX_RETRIES override for every operation', () => {
    const env = { DOT_AI_AI_MAX_RETRIES: '7' };
    for (const op of ALL_OPS) {
      expect(getMaxRetries(op, env)).toBe(7);
    }
  });

  it('uses a per-operation override when present', () => {
    expect(
      getMaxRetries('embeddings', { DOT_AI_AI_MAX_RETRIES_EMBEDDINGS: '9' })
    ).toBe(9);
    expect(getMaxRetries('chat', { DOT_AI_AI_MAX_RETRIES_CHAT: '0' })).toBe(0);
    expect(
      getMaxRetries('tool_loop', { DOT_AI_AI_MAX_RETRIES_TOOL_LOOP: '5' })
    ).toBe(5);
    expect(
      getMaxRetries('wrap_up', { DOT_AI_AI_MAX_RETRIES_WRAP_UP: '3' })
    ).toBe(3);
  });

  it('prefers per-operation override over global override', () => {
    const env = {
      DOT_AI_AI_MAX_RETRIES: '7',
      DOT_AI_AI_MAX_RETRIES_EMBEDDINGS: '2',
    };
    expect(getMaxRetries('embeddings', env)).toBe(2);
    // Other operations still take the global value.
    expect(getMaxRetries('chat', env)).toBe(7);
    expect(getMaxRetries('tool_loop', env)).toBe(7);
    expect(getMaxRetries('wrap_up', env)).toBe(7);
  });

  it('allows explicit zero overrides (no retries) and does not fall through', () => {
    const env = { DOT_AI_AI_MAX_RETRIES: '5', DOT_AI_AI_MAX_RETRIES_CHAT: '0' };
    expect(getMaxRetries('chat', env)).toBe(0);
  });

  it('ignores invalid per-operation values and falls back to the global', () => {
    expect(
      getMaxRetries('embeddings', {
        DOT_AI_AI_MAX_RETRIES_EMBEDDINGS: 'not-a-number',
        DOT_AI_AI_MAX_RETRIES: '6',
      })
    ).toBe(6);
    expect(
      getMaxRetries('embeddings', {
        DOT_AI_AI_MAX_RETRIES_EMBEDDINGS: '-1',
        DOT_AI_AI_MAX_RETRIES: '6',
      })
    ).toBe(6);
    expect(
      getMaxRetries('embeddings', {
        DOT_AI_AI_MAX_RETRIES_EMBEDDINGS: '2.5',
        DOT_AI_AI_MAX_RETRIES: '6',
      })
    ).toBe(6);
  });

  it('ignores invalid global values and falls back to the per-op default', () => {
    expect(
      getMaxRetries('embeddings', { DOT_AI_AI_MAX_RETRIES: 'abc' })
    ).toBe(__defaults.embeddings);
    expect(
      getMaxRetries('chat', { DOT_AI_AI_MAX_RETRIES: '   ' })
    ).toBe(__defaults.chat);
    expect(
      getMaxRetries('tool_loop', { DOT_AI_AI_MAX_RETRIES: '' })
    ).toBe(__defaults.tool_loop);
  });

  it('trims whitespace around valid values', () => {
    expect(
      getMaxRetries('chat', { DOT_AI_AI_MAX_RETRIES_CHAT: '  3  ' })
    ).toBe(3);
  });

  it('reads from process.env by default', () => {
    const KEY = 'DOT_AI_AI_MAX_RETRIES_CHAT';
    const previous = process.env[KEY];
    process.env[KEY] = '11';
    try {
      expect(getMaxRetries('chat')).toBe(11);
    } finally {
      if (previous === undefined) {
        delete process.env[KEY];
      } else {
        process.env[KEY] = previous;
      }
    }
  });
});
