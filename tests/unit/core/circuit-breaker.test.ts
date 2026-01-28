/**
 * Unit Tests: Circuit Breaker
 *
 * Tests the circuit breaker state machine and behavior.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerFactory,
  CircuitState,
  CircuitOpenError
} from '../../../src/core/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 3,
      cooldownPeriodMs: 1000,
      halfOpenMaxAttempts: 1
    });
  });

  describe('Initial State', () => {
    test('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    test('should have zero stats initially', () => {
      const stats = breaker.getStats();
      expect(stats).toMatchObject({
        state: CircuitState.CLOSED,
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        halfOpenAttempts: 0
      });
      expect(stats.lastFailureTime).toBeUndefined();
      expect(stats.lastSuccessTime).toBeUndefined();
      expect(stats.openedAt).toBeUndefined();
    });

    test('should not be open initially', () => {
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('CLOSED State Behavior', () => {
    test('should execute operations successfully', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    test('should track successful operations', async () => {
      await breaker.execute(async () => 'success');
      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
    });

    test('should track failed operations', async () => {
      await expect(breaker.execute(async () => {
        throw new Error('test error');
      })).rejects.toThrow('test error');

      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    test('should reset consecutive failures on success', async () => {
      // Record some failures
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }
      expect(breaker.getStats().consecutiveFailures).toBe(2);

      // Success should reset consecutive failures
      await breaker.execute(async () => 'success');
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe('CLOSED to OPEN Transition', () => {
    test('should open after reaching failure threshold', async () => {
      // Record failures up to threshold
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    test('should not open before reaching threshold', async () => {
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });

    test('should call onStateChange callback when opening', async () => {
      const onStateChange = vi.fn();
      const breakerWithCallback = new CircuitBreaker('test', {
        failureThreshold: 2,
        onStateChange
      });

      for (let i = 0; i < 2; i++) {
        await expect(breakerWithCallback.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow();
      }

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.CLOSED,
        CircuitState.OPEN,
        'test'
      );
    });
  });

  describe('OPEN State Behavior', () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }
    });

    test('should block requests with CircuitOpenError', async () => {
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitOpenError);
    });

    test('should include circuit name in error', async () => {
      try {
        await breaker.execute(async () => 'success');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).circuitName).toBe('test-circuit');
      }
    });

    test('should include remaining cooldown in error', async () => {
      try {
        await breaker.execute(async () => 'success');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).remainingCooldownMs).toBeGreaterThan(0);
        expect((error as CircuitOpenError).remainingCooldownMs).toBeLessThanOrEqual(1000);
      }
    });

    test('should track openedAt timestamp', () => {
      const stats = breaker.getStats();
      expect(stats.openedAt).toBeInstanceOf(Date);
    });
  });

  describe('OPEN to HALF_OPEN Transition', () => {
    beforeEach(async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }
    });

    test('should transition to HALF_OPEN after cooldown', async () => {
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    test('should not transition before cooldown completes', async () => {
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait less than cooldown
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('HALF_OPEN State Behavior', () => {
    beforeEach(async () => {
      // Open the circuit and wait for cooldown
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(async () => {
          throw new Error('fail');
        })).rejects.toThrow('fail');
      }
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    test('should allow limited requests in HALF_OPEN', async () => {
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // First request should be allowed
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    test('should close circuit on success in HALF_OPEN', async () => {
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.isOpen()).toBe(false);
    });

    test('should reopen circuit on failure in HALF_OPEN', async () => {
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      await expect(breaker.execute(async () => {
        throw new Error('still failing');
      })).rejects.toThrow('still failing');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(breaker.isOpen()).toBe(true);
    });

    test('should block requests after max half-open attempts', async () => {
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Use the one allowed attempt (but don't complete it yet - simulate slow request)
      const slowOperation = breaker.execute(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });

      // Second request should be blocked while first is in progress
      await expect(breaker.execute(async () => 'second')).rejects.toThrow(CircuitOpenError);

      // Wait for first to complete
      await slowOperation;
    });
  });

  describe('Manual Control', () => {
    test('should allow manual success recording', () => {
      breaker.recordSuccess();
      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
    });

    test('should allow manual failure recording', () => {
      breaker.recordFailure(new Error('manual failure'));
      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    test('should reset to CLOSED state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });

    test('should call onStateChange when reset from non-CLOSED state', async () => {
      const onStateChange = vi.fn();
      const breakerWithCallback = new CircuitBreaker('test', {
        failureThreshold: 2,
        onStateChange
      });

      // Open it
      for (let i = 0; i < 2; i++) {
        breakerWithCallback.recordFailure();
      }
      onStateChange.mockClear();

      breakerWithCallback.reset();

      expect(onStateChange).toHaveBeenCalledWith(
        CircuitState.OPEN,
        CircuitState.CLOSED,
        'test'
      );
    });
  });

  describe('Configuration', () => {
    test('should use default configuration when not specified', () => {
      const defaultBreaker = new CircuitBreaker('default');

      // Should use default threshold of 3
      for (let i = 0; i < 2; i++) {
        defaultBreaker.recordFailure();
      }
      expect(defaultBreaker.getState()).toBe(CircuitState.CLOSED);

      defaultBreaker.recordFailure();
      expect(defaultBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should respect custom failure threshold', () => {
      const customBreaker = new CircuitBreaker('custom', { failureThreshold: 5 });

      for (let i = 0; i < 4; i++) {
        customBreaker.recordFailure();
      }
      expect(customBreaker.getState()).toBe(CircuitState.CLOSED);

      customBreaker.recordFailure();
      expect(customBreaker.getState()).toBe(CircuitState.OPEN);
    });

    test('should return circuit name', () => {
      expect(breaker.getName()).toBe('test-circuit');
    });
  });
});

describe('CircuitBreakerFactory', () => {
  let factory: CircuitBreakerFactory;

  beforeEach(() => {
    factory = new CircuitBreakerFactory({ failureThreshold: 2 });
  });

  test('should create new circuit breaker', () => {
    const breaker = factory.getOrCreate('api-service');
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.getName()).toBe('api-service');
  });

  test('should return existing circuit breaker', () => {
    const breaker1 = factory.getOrCreate('api-service');
    const breaker2 = factory.getOrCreate('api-service');
    expect(breaker1).toBe(breaker2);
  });

  test('should apply default config from factory', () => {
    const breaker = factory.getOrCreate('api-service');

    // Should use factory's default threshold of 2
    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    breaker.recordFailure();
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  test('should allow per-breaker config override', () => {
    const breaker = factory.getOrCreate('api-service', { failureThreshold: 5 });

    for (let i = 0; i < 4; i++) {
      breaker.recordFailure();
    }
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  test('should get breaker by name', () => {
    factory.getOrCreate('api-service');
    const breaker = factory.get('api-service');
    expect(breaker).toBeDefined();
    expect(breaker?.getName()).toBe('api-service');
  });

  test('should return undefined for non-existent breaker', () => {
    const breaker = factory.get('non-existent');
    expect(breaker).toBeUndefined();
  });

  test('should reset all breakers', () => {
    const breaker1 = factory.getOrCreate('service-1');
    const breaker2 = factory.getOrCreate('service-2');

    // Open both
    for (let i = 0; i < 2; i++) {
      breaker1.recordFailure();
      breaker2.recordFailure();
    }
    expect(breaker1.getState()).toBe(CircuitState.OPEN);
    expect(breaker2.getState()).toBe(CircuitState.OPEN);

    factory.resetAll();

    expect(breaker1.getState()).toBe(CircuitState.CLOSED);
    expect(breaker2.getState()).toBe(CircuitState.CLOSED);
  });

  test('should get stats for all breakers', () => {
    const breaker1 = factory.getOrCreate('service-1');
    const breaker2 = factory.getOrCreate('service-2');

    breaker1.recordSuccess();
    breaker2.recordFailure();

    const allStats = factory.getAllStats();

    expect(allStats['service-1']).toMatchObject({
      state: CircuitState.CLOSED,
      totalSuccesses: 1,
      totalFailures: 0
    });
    expect(allStats['service-2']).toMatchObject({
      state: CircuitState.CLOSED,
      totalSuccesses: 0,
      totalFailures: 1
    });
  });
});

describe('CircuitOpenError', () => {
  test('should have correct properties', () => {
    const error = new CircuitOpenError('test-circuit', 5000);

    expect(error.name).toBe('CircuitOpenError');
    expect(error.circuitName).toBe('test-circuit');
    expect(error.remainingCooldownMs).toBe(5000);
    expect(error.state).toBe(CircuitState.OPEN);
    expect(error.message).toContain('test-circuit');
    expect(error.message).toContain('5000ms');
  });

  test('should be instance of Error', () => {
    const error = new CircuitOpenError('test', 1000);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('Log Suppression', () => {
  test('should log "circuit open" only once per open period', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const breaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 2,
      cooldownPeriodMs: 10000
    }, mockLogger as any);

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow('fail');
    }

    // Clear mock calls from the failure recording
    mockLogger.warn.mockClear();

    // Make multiple blocked requests
    for (let i = 0; i < 5; i++) {
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitOpenError);
    }

    // Should only log "circuit open" once, not 5 times
    const circuitOpenLogs = mockLogger.warn.mock.calls.filter(
      (call: any[]) => call[0]?.includes('is open, blocking')
    );
    expect(circuitOpenLogs.length).toBe(1);
  });

  test('should log again after circuit is reset and reopens', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const breaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 2,
      cooldownPeriodMs: 10000
    }, mockLogger as any);

    // Open the circuit first time
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow('fail');
    }

    // Make a blocked request (should log once)
    await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitOpenError);

    // Reset the circuit
    breaker.reset();
    mockLogger.warn.mockClear();

    // Open the circuit again
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow('fail');
    }

    mockLogger.warn.mockClear();

    // Make blocked requests again - should log once for new open period
    await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitOpenError);
    await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitOpenError);

    const circuitOpenLogs = mockLogger.warn.mock.calls.filter(
      (call: any[]) => call[0]?.includes('is open, blocking')
    );
    expect(circuitOpenLogs.length).toBe(1);
  });

  test('should include willRetryAt in log when circuit is open', async () => {
    const mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    const breaker = new CircuitBreaker('test-circuit', {
      failureThreshold: 2,
      cooldownPeriodMs: 5000
    }, mockLogger as any);

    // Open the circuit
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(async () => {
        throw new Error('fail');
      })).rejects.toThrow('fail');
    }

    mockLogger.warn.mockClear();

    // Make a blocked request
    await expect(breaker.execute(async () => 'success')).rejects.toThrow(CircuitOpenError);

    // Find the "circuit open" log call
    const circuitOpenLog = mockLogger.warn.mock.calls.find(
      (call: any[]) => call[0]?.includes('is open, blocking')
    );
    expect(circuitOpenLog).toBeDefined();
    expect(circuitOpenLog[1]).toHaveProperty('willRetryAt');
    expect(circuitOpenLog[1]).toHaveProperty('remainingCooldownMs');
  });
});
