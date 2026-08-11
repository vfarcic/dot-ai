/**
 * Unit tests for the /readyz readiness signal (PRD #714 M4).
 *
 * getCapabilityReadiness() reuses the capability diagnostics but must stay cheap enough
 * for a 5s probe: it caches its result for a short TTL and reports not-ready whenever
 * Qdrant is unreachable or the collection cannot be accessed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { healthCheck, initialize, getCapabilitiesCount } = vi.hoisted(() => ({
  healthCheck: vi.fn(),
  initialize: vi.fn(),
  getCapabilitiesCount: vi.fn(),
}));

vi.mock('../../../src/core/capability-vector-service', () => ({
  // Normal function, not an arrow — Reflect.construct rejects arrow constructors.
  CapabilityVectorService: vi.fn(function () {
    return { healthCheck, initialize, getCapabilitiesCount };
  }),
}));

import {
  getCapabilityReadiness,
  resetCapabilityReadinessCache,
} from '../../../src/tools/version';

describe('getCapabilityReadiness (PRD #714 M4)', () => {
  beforeEach(() => {
    resetCapabilityReadinessCache();
    healthCheck.mockReset();
    initialize.mockReset().mockResolvedValue(undefined);
    getCapabilitiesCount.mockReset();
  });

  it('is ready when Qdrant is healthy and the collection is accessible', async () => {
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(42);

    const readiness = await getCapabilityReadiness(1000);

    expect(readiness).toMatchObject({
      ready: true,
      vectorDBHealthy: true,
      collectionAccessible: true,
      storedCount: 42,
    });
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('is not ready when Qdrant is unreachable', async () => {
    healthCheck.mockResolvedValue(false);

    const readiness = await getCapabilityReadiness(1000);

    expect(readiness).toMatchObject({
      ready: false,
      vectorDBHealthy: false,
      collectionAccessible: false,
    });
    // The collection is never touched once the DB is down.
    expect(initialize).not.toHaveBeenCalled();
    expect(getCapabilitiesCount).not.toHaveBeenCalled();
  });

  it('is not ready and surfaces the error when a check throws', async () => {
    healthCheck.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const readiness = await getCapabilityReadiness(1000);

    expect(readiness).toMatchObject({
      ready: false,
      vectorDBHealthy: false,
      collectionAccessible: false,
      error: 'connect ECONNREFUSED',
    });
  });

  it('serves a cached result within the TTL, then refreshes after it expires', async () => {
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(1);

    await getCapabilityReadiness(1000);
    // A second probe inside the 5s TTL must not hit the backend again.
    await getCapabilityReadiness(3000);
    expect(healthCheck).toHaveBeenCalledTimes(1);

    // Once the TTL has elapsed the next probe recomputes.
    await getCapabilityReadiness(6001);
    expect(healthCheck).toHaveBeenCalledTimes(2);
  });
});
