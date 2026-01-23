/**
 * Unit Tests: Error Handling with Exponential Backoff
 *
 * Tests the ErrorHandler.withErrorHandling() method, especially
 * exponential backoff behavior for retries.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ErrorHandler,
  BackoffConfig,
  AppError,
  ErrorCategory,
  ErrorSeverity
} from '../../../src/core/error-handling';

describe('ErrorHandler.withErrorHandling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('without backoff (backward compatibility)', () => {
    test('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');

      const result = await ErrorHandler.withErrorHandling(
        operation,
        { operation: 'test-op', component: 'test' }
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should fail immediately with no retries configured', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('test error'));

      await expect(
        ErrorHandler.withErrorHandling(
          operation,
          { operation: 'test-op', component: 'test' }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry without delay when no backoff configured', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');

      const promise = ErrorHandler.withErrorHandling(
        operation,
        { operation: 'test-op', component: 'test', isRetryable: true },
        { retryCount: 3 }
      );

      // Should complete immediately without waiting
      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should respect retryCount limit', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('always fails'));

      await expect(
        ErrorHandler.withErrorHandling(
          operation,
          { operation: 'test-op', component: 'test', isRetryable: true },
          { retryCount: 2 }
        )
      ).rejects.toBeInstanceOf(AppError);

      // Initial attempt + 2 retries = 3 calls
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('with exponential backoff', () => {
    test('should not delay first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const sleepSpy = vi.spyOn(ErrorHandler as any, 'sleep');

      const result = await ErrorHandler.withErrorHandling(
        operation,
        { operation: 'test-op', component: 'test' },
        { backoff: { initialDelayMs: 1000 } }
      );

      expect(result).toBe('success');
      expect(sleepSpy).not.toHaveBeenCalled();
    });

    test('should delay retries with exponential increase', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      const originalSleep = (ErrorHandler as any).sleep;
      vi.spyOn(ErrorHandler as any, 'sleep').mockImplementation(async (ms: number) => {
        delays.push(ms);
        // Don't actually wait, just record the delay
      });

      const promise = ErrorHandler.withErrorHandling(
        operation,
        { operation: 'test-op', component: 'test', isRetryable: true },
        {
          retryCount: 4,
          backoff: {
            initialDelayMs: 1000,
            multiplier: 2,
            maxDelayMs: 30000,
            jitter: 0
          }
        }
      );

      const result = await promise;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(4);
      // Delays: 1000ms (retry 1), 2000ms (retry 2), 4000ms (retry 3)
      expect(delays).toEqual([1000, 2000, 4000]);
    });

    test('should cap delay at maxDelayMs', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockRejectedValueOnce(new Error('fail 3'))
        .mockRejectedValueOnce(new Error('fail 4'))
        .mockRejectedValueOnce(new Error('fail 5'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      vi.spyOn(ErrorHandler as any, 'sleep').mockImplementation(async (ms: number) => {
        delays.push(ms);
      });

      await ErrorHandler.withErrorHandling(
        operation,
        { operation: 'test-op', component: 'test', isRetryable: true },
        {
          retryCount: 6,
          backoff: {
            initialDelayMs: 1000,
            multiplier: 2,
            maxDelayMs: 5000,
            jitter: 0
          }
        }
      );

      // Expected delays: 1000, 2000, 4000, 5000 (capped), 5000 (capped)
      expect(delays).toEqual([1000, 2000, 4000, 5000, 5000]);
    });

    test('should use default backoff values when partially configured', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      vi.spyOn(ErrorHandler as any, 'sleep').mockImplementation(async (ms: number) => {
        delays.push(ms);
      });

      await ErrorHandler.withErrorHandling(
        operation,
        { operation: 'test-op', component: 'test', isRetryable: true },
        {
          retryCount: 2,
          backoff: {} // All defaults
        }
      );

      // Default initialDelayMs is 1000
      expect(delays).toEqual([1000]);
    });
  });

  describe('calculateBackoffDelay', () => {
    test('should calculate exponential delays correctly', () => {
      const config = {
        initialDelayMs: 1000,
        multiplier: 2,
        maxDelayMs: 30000,
        jitter: 0
      };

      expect(ErrorHandler.calculateBackoffDelay(0, config)).toBe(1000);  // 1000 * 2^0
      expect(ErrorHandler.calculateBackoffDelay(1, config)).toBe(2000);  // 1000 * 2^1
      expect(ErrorHandler.calculateBackoffDelay(2, config)).toBe(4000);  // 1000 * 2^2
      expect(ErrorHandler.calculateBackoffDelay(3, config)).toBe(8000);  // 1000 * 2^3
      expect(ErrorHandler.calculateBackoffDelay(4, config)).toBe(16000); // 1000 * 2^4
    });

    test('should cap at maxDelayMs', () => {
      const config = {
        initialDelayMs: 1000,
        multiplier: 2,
        maxDelayMs: 5000,
        jitter: 0
      };

      expect(ErrorHandler.calculateBackoffDelay(0, config)).toBe(1000);
      expect(ErrorHandler.calculateBackoffDelay(1, config)).toBe(2000);
      expect(ErrorHandler.calculateBackoffDelay(2, config)).toBe(4000);
      expect(ErrorHandler.calculateBackoffDelay(3, config)).toBe(5000); // capped
      expect(ErrorHandler.calculateBackoffDelay(4, config)).toBe(5000); // capped
      expect(ErrorHandler.calculateBackoffDelay(10, config)).toBe(5000); // capped
    });

    test('should apply jitter when configured', () => {
      const config = {
        initialDelayMs: 1000,
        multiplier: 2,
        maxDelayMs: 30000,
        jitter: 0.5 // 50% jitter
      };

      // With 50% jitter on 1000ms base, result should be in [500, 1500]
      const results = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const delay = ErrorHandler.calculateBackoffDelay(0, config);
        results.add(delay);
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1500);
      }

      // With 100 iterations, we should see some variation (not all same value)
      expect(results.size).toBeGreaterThan(1);
    });

    test('should handle zero jitter', () => {
      const config = {
        initialDelayMs: 1000,
        multiplier: 2,
        maxDelayMs: 30000,
        jitter: 0
      };

      // Without jitter, result should always be exactly the calculated value
      for (let i = 0; i < 10; i++) {
        expect(ErrorHandler.calculateBackoffDelay(0, config)).toBe(1000);
        expect(ErrorHandler.calculateBackoffDelay(1, config)).toBe(2000);
      }
    });

    test('should work with non-2 multipliers', () => {
      const config = {
        initialDelayMs: 100,
        multiplier: 3,
        maxDelayMs: 30000,
        jitter: 0
      };

      expect(ErrorHandler.calculateBackoffDelay(0, config)).toBe(100);  // 100 * 3^0
      expect(ErrorHandler.calculateBackoffDelay(1, config)).toBe(300);  // 100 * 3^1
      expect(ErrorHandler.calculateBackoffDelay(2, config)).toBe(900);  // 100 * 3^2
      expect(ErrorHandler.calculateBackoffDelay(3, config)).toBe(2700); // 100 * 3^3
    });
  });

  describe('error handling during backoff', () => {
    test('should throw final error after all retries exhausted', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('persistent failure'));
      vi.spyOn(ErrorHandler as any, 'sleep').mockResolvedValue(undefined);

      await expect(
        ErrorHandler.withErrorHandling(
          operation,
          { operation: 'test-op', component: 'test', isRetryable: true },
          {
            retryCount: 2,
            backoff: { initialDelayMs: 100 }
          }
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should convert to MCP error when configured', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('mcp failure'));
      vi.spyOn(ErrorHandler as any, 'sleep').mockResolvedValue(undefined);

      await expect(
        ErrorHandler.withErrorHandling(
          operation,
          { operation: 'test-op', component: 'test', isRetryable: true },
          {
            retryCount: 1,
            convertToMcp: true,
            backoff: { initialDelayMs: 100 }
          }
        )
      ).rejects.toMatchObject({
        code: expect.any(Number)
      });
    });
  });
});
