/**
 * Unit tests for the /readyz readiness signal (PRD #714 M4).
 *
 * getCapabilityReadiness() reports ready when Qdrant is reachable and — only in semantic
 * mode (embeddings configured) — embeddings actually serve. Collection existence and
 * storedCount are informational, never gates. Results are cached for a short TTL so a
 * burst of probes collapses to one backend round-trip.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { healthCheck, collectionExists, getCapabilitiesCount } = vi.hoisted(() => ({
  healthCheck: vi.fn(),
  collectionExists: vi.fn(),
  getCapabilitiesCount: vi.fn(),
}));

const { generateEmbedding, getEmbeddingStatus, isAvailable } = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  getEmbeddingStatus: vi.fn(),
  isAvailable: vi.fn(),
}));

vi.mock('../../../src/core/capability-vector-service', () => ({
  // Normal function, not an arrow — Reflect.construct rejects arrow constructors.
  CapabilityVectorService: vi.fn(function () {
    return { healthCheck, collectionExists, getCapabilitiesCount };
  }),
}));

vi.mock('../../../src/core/embedding-service', () => ({
  EmbeddingService: vi.fn(function () {
    return {
      generateEmbedding,
      getStatus: getEmbeddingStatus,
      isAvailable,
      getDimensions: () => 1536,
    };
  }),
}));

import {
  getCapabilityReadiness,
  resetCapabilityReadinessCache,
} from '../../../src/tools/version';

const validEmbedding = () => new Array(1536).fill(0.1);

describe('getCapabilityReadiness (PRD #714 M4)', () => {
  beforeEach(() => {
    resetCapabilityReadinessCache();
    healthCheck.mockReset();
    collectionExists.mockReset().mockResolvedValue(true);
    getCapabilitiesCount.mockReset();
    getEmbeddingStatus.mockReset().mockReturnValue({ dimensions: 1536 });
    generateEmbedding.mockReset().mockResolvedValue(validEmbedding());
    // Semantic mode by default — embeddings configured.
    isAvailable.mockReset().mockReturnValue(true);
  });

  it('is ready when Qdrant is healthy, the collection is accessible, and embeddings work', async () => {
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(42);

    const readiness = await getCapabilityReadiness(() => 1000);

    expect(readiness).toMatchObject({
      ready: true,
      vectorDBHealthy: true,
      collectionAccessible: true,
      embeddingsRequired: true,
      embeddingHealthy: true,
      storedCount: 42,
    });
    expect(collectionExists).toHaveBeenCalledTimes(1);
  });

  it('is read-only: the probe never creates the collection', async () => {
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(0);

    await getCapabilityReadiness(() => 1000);

    // initialize() creates the collection if absent; a probe must not.
    expect(collectionExists).toHaveBeenCalledTimes(1);
  });

  it('is ready on a fresh install: Qdrant up, collection absent, embeddings serving', async () => {
    healthCheck.mockResolvedValue(true);
    collectionExists.mockResolvedValue(false);

    const readiness = await getCapabilityReadiness(() => 1000);

    // An absent collection is a healthy fresh-install state, not a not-ready signal.
    expect(readiness).toMatchObject({
      ready: true,
      vectorDBHealthy: true,
      collectionAccessible: false,
      embeddingsRequired: true,
      embeddingHealthy: true,
      storedCount: 0,
    });
    // storedCount is informational — no count needed when the collection is absent.
    expect(getCapabilitiesCount).not.toHaveBeenCalled();
  });

  it('stays ready when the collection check fails transiently after Qdrant is confirmed up', async () => {
    healthCheck.mockResolvedValue(true);
    collectionExists.mockRejectedValue(new Error('collection_stats timed out'));

    const readiness = await getCapabilityReadiness(() => 1000);

    // A transient collection hiccup must not be misattributed to the vector DB, which
    // healthCheck just confirmed up. Collection state is informational.
    expect(readiness).toMatchObject({
      ready: true,
      vectorDBHealthy: true,
      collectionAccessible: false,
      embeddingsRequired: true,
      embeddingHealthy: true,
    });
    expect(readiness.storedCount).toBeUndefined();
  });

  it('is not ready when Qdrant is unreachable', async () => {
    healthCheck.mockResolvedValue(false);

    const readiness = await getCapabilityReadiness(() => 1000);

    expect(readiness).toMatchObject({
      ready: false,
      vectorDBHealthy: false,
      collectionAccessible: false,
      embeddingHealthy: false,
    });
    // The collection is never touched once the DB is down.
    expect(collectionExists).not.toHaveBeenCalled();
    expect(getCapabilitiesCount).not.toHaveBeenCalled();
  });

  it('is not ready when the embedding backend is unavailable even though Qdrant is up (#709)', async () => {
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(42);
    generateEmbedding.mockRejectedValue(new Error('TEI unreachable'));

    const readiness = await getCapabilityReadiness(() => 1000);

    expect(readiness).toMatchObject({
      ready: false,
      vectorDBHealthy: true,
      collectionAccessible: true,
      embeddingsRequired: true,
      embeddingHealthy: false,
    });
  });

  it('keyword-only deployment is ready without probing embeddings (absent collection)', async () => {
    isAvailable.mockReturnValue(false);
    healthCheck.mockResolvedValue(true);
    collectionExists.mockResolvedValue(false);

    const readiness = await getCapabilityReadiness(() => 1000);

    expect(readiness).toMatchObject({
      ready: true,
      vectorDBHealthy: true,
      collectionAccessible: false,
      embeddingsRequired: false,
      embeddingHealthy: true,
    });
    // No embeddings configured — the probe must never generate one.
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it('keyword-only deployment is ready without probing embeddings (populated collection)', async () => {
    isAvailable.mockReturnValue(false);
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(5);

    const readiness = await getCapabilityReadiness(() => 1000);

    expect(readiness).toMatchObject({
      ready: true,
      vectorDBHealthy: true,
      collectionAccessible: true,
      embeddingsRequired: false,
      embeddingHealthy: true,
      storedCount: 5,
    });
    expect(generateEmbedding).not.toHaveBeenCalled();
  });

  it('is not ready and reports a generic error when a check throws', async () => {
    healthCheck.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:6333'));

    const readiness = await getCapabilityReadiness(() => 1000);

    expect(readiness).toMatchObject({
      ready: false,
      vectorDBHealthy: false,
      collectionAccessible: false,
      embeddingHealthy: false,
      // /readyz is unauthenticated: the raw backend error must not leak.
      error: 'capability readiness check failed',
    });
    expect(readiness.error).not.toContain('ECONNREFUSED');
    expect(readiness.error).not.toContain('10.0.0.5');
  });

  it('coalesces concurrent probes onto a single backend check', async () => {
    let resolveHealth!: (value: boolean) => void;
    healthCheck.mockReturnValue(
      new Promise<boolean>(resolve => {
        resolveHealth = resolve;
      })
    );
    getCapabilitiesCount.mockResolvedValue(7);

    // Three probes race before the first backend call resolves.
    const p1 = getCapabilityReadiness(() => 1000);
    const p2 = getCapabilityReadiness(() => 1000);
    const p3 = getCapabilityReadiness(() => 1000);
    resolveHealth(true);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(getCapabilitiesCount).toHaveBeenCalledTimes(1);
    expect(r1).toMatchObject({ ready: true, storedCount: 7 });
    // All concurrent callers share the one resolved value.
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
  });

  it('serves a cached result within the TTL, then refreshes after it expires', async () => {
    healthCheck.mockResolvedValue(true);
    getCapabilitiesCount.mockResolvedValue(1);

    let now = 1000;
    const clock = () => now;

    await getCapabilityReadiness(clock);
    // A second probe inside the 2.5s TTL must not hit the backend again.
    now = 2000;
    await getCapabilityReadiness(clock);
    expect(healthCheck).toHaveBeenCalledTimes(1);

    // Once the TTL has elapsed the next probe recomputes.
    now = 4000;
    await getCapabilityReadiness(clock);
    expect(healthCheck).toHaveBeenCalledTimes(2);
  });
});
