/**
 * Circuit Breaker Implementation
 *
 * Provides resilience for external service calls by preventing cascading failures.
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Failure threshold reached, requests are blocked
 * - HALF_OPEN: Testing recovery, limited requests allowed
 */

import { Logger, ConsoleLogger } from './error-handling';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

/**
 * Configuration options for circuit breaker
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 3) */
  failureThreshold?: number;
  /** Time in milliseconds to wait before transitioning from OPEN to HALF_OPEN (default: 30000) */
  cooldownPeriodMs?: number;
  /** Number of requests to allow in HALF_OPEN state before deciding (default: 1) */
  halfOpenMaxAttempts?: number;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

/**
 * Statistics about circuit breaker state
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  totalFailures: number;
  totalSuccesses: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  openedAt?: Date;
  halfOpenAttempts: number;
}

/**
 * Error thrown when circuit is open and blocking requests
 */
export class CircuitOpenError extends Error {
  public readonly circuitName: string;
  public readonly remainingCooldownMs: number;
  public readonly state: CircuitState;

  constructor(circuitName: string, remainingCooldownMs: number) {
    super(`Circuit '${circuitName}' is open. Retry after ${Math.ceil(remainingCooldownMs)}ms`);
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.remainingCooldownMs = remainingCooldownMs;
    this.state = CircuitState.OPEN;
  }
}

/**
 * Circuit Breaker implementation
 *
 * Usage:
 * ```typescript
 * const breaker = new CircuitBreaker('embedding-api', { failureThreshold: 3 });
 *
 * try {
 *   const result = await breaker.execute(() => fetchFromAPI());
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Circuit is open, handle gracefully
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private readonly name: string;
  private readonly config: Required<Omit<CircuitBreakerConfig, 'onStateChange'>> & Pick<CircuitBreakerConfig, 'onStateChange'>;
  private readonly logger: Logger;

  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private openedAt?: Date;
  private halfOpenAttempts: number = 0;
  private lastCircuitOpenLogTime?: Date;

  constructor(name: string, config?: CircuitBreakerConfig, logger?: Logger) {
    this.name = name;
    this.config = {
      failureThreshold: config?.failureThreshold ?? 3,
      cooldownPeriodMs: config?.cooldownPeriodMs ?? 30000,
      halfOpenMaxAttempts: config?.halfOpenMaxAttempts ?? 1,
      onStateChange: config?.onStateChange
    };
    this.logger = logger ?? new ConsoleLogger('CircuitBreaker');
  }

  /**
   * Execute an operation through the circuit breaker
   * @throws CircuitOpenError if circuit is open
   * @throws Original error if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should allow the request
    if (!this.canExecute()) {
      const remainingCooldown = this.getRemainingCooldown();

      // Only log once per circuit open period to avoid log spam
      if (!this.lastCircuitOpenLogTime ||
          this.lastCircuitOpenLogTime < this.openedAt!) {
        this.logger.warn(`Circuit '${this.name}' is open, blocking requests`, {
          remainingCooldownMs: remainingCooldown,
          willRetryAt: new Date(Date.now() + remainingCooldown).toISOString()
        });
        this.lastCircuitOpenLogTime = new Date();
      }

      throw new CircuitOpenError(this.name, remainingCooldown);
    }

    // Track half-open attempts
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenAttempts++;
      this.logger.info(`Circuit '${this.name}' attempting request in half-open state`, {
        attempt: this.halfOpenAttempts,
        maxAttempts: this.config.halfOpenMaxAttempts
      });
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.totalSuccesses++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // Success in half-open state closes the circuit
      this.transitionTo(CircuitState.CLOSED);
      this.halfOpenAttempts = 0;
      this.logger.info(`Circuit '${this.name}' recovered, transitioning to closed`, {
        totalSuccesses: this.totalSuccesses
      });
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(error?: Error): void {
    this.consecutiveFailures++;
    this.totalFailures++;
    this.lastFailureTime = new Date();

    this.logger.warn(`Circuit '${this.name}' recorded failure`, {
      consecutiveFailures: this.consecutiveFailures,
      threshold: this.config.failureThreshold,
      error: error?.message
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Failure in half-open state opens the circuit again
      this.transitionTo(CircuitState.OPEN);
      this.openedAt = new Date();
      this.halfOpenAttempts = 0;
      this.logger.warn(`Circuit '${this.name}' failed in half-open state, reopening`);
    } else if (this.state === CircuitState.CLOSED && this.consecutiveFailures >= this.config.failureThreshold) {
      // Threshold reached, open the circuit
      this.transitionTo(CircuitState.OPEN);
      this.openedAt = new Date();
      this.logger.error(`Circuit '${this.name}' opened after ${this.consecutiveFailures} consecutive failures`);
    }
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.consecutiveFailures = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = undefined;
    this.lastCircuitOpenLogTime = undefined;

    if (previousState !== CircuitState.CLOSED) {
      this.logger.info(`Circuit '${this.name}' manually reset to closed`);
      this.config.onStateChange?.(previousState, CircuitState.CLOSED, this.name);
    }
  }

  /**
   * Get the current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN && this.shouldTransitionToHalfOpen()) {
      this.transitionTo(CircuitState.HALF_OPEN);
      this.halfOpenAttempts = 0;
      this.logger.info(`Circuit '${this.name}' cooldown elapsed, transitioning to half-open`);
    }

    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      openedAt: this.openedAt,
      halfOpenAttempts: this.halfOpenAttempts
    };
  }

  /**
   * Check if circuit is currently open (blocking requests)
   */
  isOpen(): boolean {
    return this.getState() === CircuitState.OPEN;
  }

  /**
   * Get the circuit breaker name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if a request can be executed
   */
  private canExecute(): boolean {
    const currentState = this.getState();

    switch (currentState) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        return false;
      case CircuitState.HALF_OPEN:
        // Allow limited requests in half-open state
        return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
      default:
        return false;
    }
  }

  /**
   * Check if cooldown period has elapsed
   */
  private shouldTransitionToHalfOpen(): boolean {
    if (!this.openedAt) {
      return false;
    }

    const elapsed = Date.now() - this.openedAt.getTime();
    return elapsed >= this.config.cooldownPeriodMs;
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  private getRemainingCooldown(): number {
    if (!this.openedAt) {
      return 0;
    }

    const elapsed = Date.now() - this.openedAt.getTime();
    const remaining = this.config.cooldownPeriodMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;
    this.config.onStateChange?.(previousState, newState, this.name);
  }
}

/**
 * Factory for creating circuit breakers with shared configuration
 */
export class CircuitBreakerFactory {
  private readonly defaultConfig: CircuitBreakerConfig;
  private readonly logger: Logger;
  private readonly breakers: Map<string, CircuitBreaker> = new Map();

  constructor(defaultConfig?: CircuitBreakerConfig, logger?: Logger) {
    this.defaultConfig = defaultConfig ?? {};
    this.logger = logger ?? new ConsoleLogger('CircuitBreakerFactory');
  }

  /**
   * Get or create a circuit breaker by name
   */
  getOrCreate(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(name);

    if (!breaker) {
      breaker = new CircuitBreaker(
        name,
        { ...this.defaultConfig, ...config },
        this.logger
      );
      this.breakers.set(name, breaker);
    }

    return breaker;
  }

  /**
   * Get a circuit breaker by name (returns undefined if not exists)
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get stats for all circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }
}
