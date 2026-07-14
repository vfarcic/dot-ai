/**
 * Unit Tests: Knowledge Migration (PRD #375)
 *
 * Verifies that legacy pattern/policy documents are transformed into the
 * canonical KnowledgeChunk payload shape during migration so consumers that
 * read `content`, `uri`, `chunkIndex`, and `totalChunks` never receive
 * undefined values.
 *
 * Scope: buildMigratedPayload transformation and full runKnowledgeMigration
 * flow, exercised via mocked invokePluginTool calls.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { v5 as uuidv5 } from 'uuid';

// Must be hoisted before the import that depends on it.
vi.mock('../../../src/core/plugin-registry', () => ({
  isPluginInitialized: vi.fn(),
  invokePluginTool: vi.fn(),
}));

import { runKnowledgeMigration, LEGACY_LIST_CAP, KNOWLEDGE_NAMESPACE } from '../../../src/core/knowledge-migration.js';
import { isPluginInitialized, invokePluginTool } from '../../../src/core/plugin-registry.js';
import type { Logger } from '../../../src/core/error-handling.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_VECTOR = Array.from({ length: 4 }, (_, i) => i * 0.1);

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

/**
 * Build the mocked invokePluginTool implementation for a single migration run.
 *
 * Call sequence the migration makes per legacy collection:
 *   1. collection_list  → returns collection names
 *   2. vector_list      → returns legacy documents
 *   3. vector_store     → called once per document (we capture args here)
 *   4. collection_delete → deletes legacy collection
 */
function setupMigrationMocks(
  legacyCollections: string[],
  docsPerCollection: Map<string, { id: string; payload: Record<string, unknown> }[]>
) {
  const capturedStoreCalls: Array<Record<string, unknown>> = [];

  vi.mocked(invokePluginTool).mockImplementation(
    async (_plugin: string, tool: string, args: Record<string, unknown>) => {
      const ok = (data: unknown) => ({
        success: true,
        result: { success: true, data },
      });

      if (tool === 'collection_list') {
        return ok(legacyCollections);
      }

      if (tool === 'vector_list') {
        const docs = (docsPerCollection.get(args.collection as string) ?? []).map(
          doc => ({ ...doc, vector: FAKE_VECTOR })
        );
        return ok(docs);
      }

      if (tool === 'collection_initialize') {
        return ok(null);
      }

      if (tool === 'vector_store') {
        capturedStoreCalls.push({ ...args });
        return ok(null);
      }

      if (tool === 'collection_delete') {
        return ok(null);
      }

      return { success: false, result: null };
    }
  );

  return capturedStoreCalls;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runKnowledgeMigration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isPluginInitialized).mockReturnValue(true);
  });

  test('skips silently when plugin is not initialised', async () => {
    vi.mocked(isPluginInitialized).mockReturnValue(false);
    const logger = makeLogger();

    await runKnowledgeMigration(logger);

    expect(invokePluginTool).not.toHaveBeenCalled();
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringContaining('Plugin not initialised')
    );
  });

  test('skips when no legacy collections exist', async () => {
    setupMigrationMocks([], new Map());
    const logger = makeLogger();

    await runKnowledgeMigration(logger);

    // vector_list and vector_store must never be called
    const toolCalls = vi.mocked(invokePluginTool).mock.calls;
    const nonListCalls = toolCalls.filter(([, tool]) => tool !== 'collection_list');
    expect(nonListCalls).toHaveLength(0);
  });

  test('migrated pattern payload has canonical KnowledgeChunk fields', async () => {
    const patternDoc = {
      id: 'pattern-abc',
      payload: {
        description: 'Blue-Green deployment pattern for zero-downtime releases.',
        triggers: ['blue-green', 'zero-downtime'],
        suggestedResources: ['Deployment', 'Service'],
        rationale: 'Decouples deployment from release enabling instant rollback.',
        createdAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'platform-team',
      },
    };

    const captured = setupMigrationMocks(
      ['patterns'],
      new Map([['patterns', [patternDoc]]])
    );
    const logger = makeLogger();

    await runKnowledgeMigration(logger);

    expect(captured).toHaveLength(1);

    expect(captured[0]).toMatchObject({
      collection: 'knowledge-base',
      id: uuidv5('legacy://patterns/pattern-abc#0', KNOWLEDGE_NAMESPACE),
      embedding: FAKE_VECTOR,
    });
    expect(captured[0]).not.toHaveProperty('vector');

    const { payload } = captured[0] as { payload: Record<string, unknown> };

    // --- mandatory chunk fields ---
    expect(typeof payload.content).toBe('string');
    expect((payload.content as string).length).toBeGreaterThan(0);

    expect(typeof payload.uri).toBe('string');
    expect(payload.uri as string).toMatch(/^legacy:\/\/patterns\/pattern-abc$/);

    expect(payload.chunkIndex).toBe(0);
    expect(payload.totalChunks).toBe(1);

    // --- classification tag ---
    expect(payload.tags).toEqual(['pattern']);

    // --- content includes key legacy fields ---
    const content = payload.content as string;
    expect(content).toContain('Blue-Green deployment pattern');
    expect(content).toContain('blue-green');
    expect(content).toContain('Deployment');
    expect(content).toContain('Decouples deployment');

    // --- metadata preserves origin for auditability ---
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.migratedFrom).toBe('patterns');
    expect(metadata.originalId).toBe('pattern-abc');

    // --- checksum is a non-empty hex string ---
    expect(typeof payload.checksum).toBe('string');
    expect(payload.checksum as string).toMatch(/^[0-9a-f]{64}$/);
  });

  test('migrated policy payload has canonical KnowledgeChunk fields', async () => {
    const policyDoc = {
      id: 'policy-xyz',
      payload: {
        description: 'All containers must run as non-root.',
        triggers: ['security', 'pod-security'],
        rationale: 'Prevents container breakout privilege escalation.',
        createdAt: '2024-06-01T00:00:00.000Z',
        createdBy: 'security-team',
        deployedPolicies: [{ name: 'require-non-root', appliedAt: '2024-06-01T00:00:00.000Z' }],
      },
    };

    const captured = setupMigrationMocks(
      ['policies'],
      new Map([['policies', [policyDoc]]])
    );
    const logger = makeLogger();

    await runKnowledgeMigration(logger);

    expect(captured).toHaveLength(1);

    const { payload } = captured[0] as { payload: Record<string, unknown> };

    expect(typeof payload.content).toBe('string');
    expect((payload.content as string).length).toBeGreaterThan(0);

    expect(payload.uri as string).toMatch(/^legacy:\/\/policies\/policy-xyz$/);
    expect(payload.chunkIndex).toBe(0);
    expect(payload.totalChunks).toBe(1);
    expect(payload.tags).toEqual(['policy']);

    const content = payload.content as string;
    expect(content).toContain('All containers must run as non-root');
    expect(content).toContain('require-non-root');
    expect(content).toContain('Prevents container breakout');

    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.migratedFrom).toBe('policies');
    expect(metadata.originalId).toBe('policy-xyz');
  });

  test('migrates both patterns and policies collections in one run', async () => {
    const patternDoc = {
      id: 'p1',
      payload: { description: 'Canary release', triggers: ['canary'], rationale: 'Safe rollout.' },
    };
    const policyDoc = {
      id: 'pol1',
      payload: { description: 'Resource limits required', triggers: ['limits'], rationale: 'Prevent noisy neighbour.' },
    };

    const captured = setupMigrationMocks(
      ['patterns', 'policies'],
      new Map([
        ['patterns', [patternDoc]],
        ['policies', [policyDoc]],
      ])
    );
    const logger = makeLogger();

    await runKnowledgeMigration(logger);

    expect(captured).toHaveLength(2);

    const payloads = captured.map(c => (c as { payload: Record<string, unknown> }).payload);
    const tags = payloads.map(p => (p.tags as string[])[0]);
    expect(tags).toContain('pattern');
    expect(tags).toContain('policy');
  });

  test('skips document with no vector and logs warning', async () => {
    const docWithoutVector = {
      id: 'no-vector-doc',
      payload: { description: 'Something', triggers: [], rationale: 'r' },
    };

    const captured = setupMigrationMocks(
      ['patterns'],
      new Map([['patterns', [docWithoutVector]]])
    );

    // Override: return doc WITHOUT a vector so migration should skip it
    vi.mocked(invokePluginTool).mockImplementation(
      async (_plugin: string, tool: string, args: Record<string, unknown>) => {
        const ok = (data: unknown) => ({ success: true, result: { success: true, data } });
        if (tool === 'collection_list') return ok(['patterns']);
        if (tool === 'vector_list') return ok([{ ...docWithoutVector, vector: [] }]);
        if (tool === 'collection_delete') return ok(null);
        // vector_store should NOT be called
        if (tool === 'vector_store') {
          captured.push({ ...args });
          return ok(null);
        }
        return { success: false, result: null };
      }
    );

    const logger = makeLogger();
    await runKnowledgeMigration(logger);

    expect(captured).toHaveLength(0);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining('have embeddings')
    );
  });

  test('initializes the unified collection before storing migrated documents', async () => {
    const doc = {
      id: 'init-doc',
      payload: { description: 'A pattern', triggers: [], rationale: 'r' },
    };

    const orderedTools: string[] = [];
    let initArgs: Record<string, unknown> | undefined;

    vi.mocked(invokePluginTool).mockImplementation(
      async (_plugin: string, tool: string, args: Record<string, unknown>) => {
        const ok = (data: unknown) => ({ success: true, result: { success: true, data } });
        orderedTools.push(tool);
        if (tool === 'collection_list') return ok(['patterns']);
        if (tool === 'vector_list') return ok([{ ...doc, vector: FAKE_VECTOR }]);
        if (tool === 'collection_initialize') {
          initArgs = { ...args };
          return ok(null);
        }
        if (tool === 'vector_store') return ok(null);
        if (tool === 'collection_delete') return ok(null);
        return { success: false, result: null };
      }
    );

    await runKnowledgeMigration(makeLogger());

    // The unified collection must be initialized with the legacy vector
    // dimensionality before any document is stored (vector_store does not
    // auto-create collections).
    expect(initArgs).toMatchObject({
      collection: 'knowledge-base',
      vectorSize: FAKE_VECTOR.length,
      createTextIndex: true,
    });
    expect(orderedTools.indexOf('collection_initialize')).toBeLessThan(
      orderedTools.indexOf('vector_store')
    );
  });

  test('legacy collection is deleted after successful migration', async () => {
    const doc = {
      id: 'd1',
      payload: { description: 'A pattern', triggers: [], rationale: 'r' },
    };

    const deletedCollections: string[] = [];

    vi.mocked(invokePluginTool).mockImplementation(
      async (_plugin: string, tool: string, args: Record<string, unknown>) => {
        const ok = (data: unknown) => ({ success: true, result: { success: true, data } });
        if (tool === 'collection_list') return ok(['patterns']);
        if (tool === 'vector_list') return ok([{ ...doc, vector: FAKE_VECTOR }]);
        if (tool === 'collection_initialize') return ok(null);
        if (tool === 'vector_store') return ok(null);
        if (tool === 'collection_delete') {
          deletedCollections.push(args.collection as string);
          return ok(null);
        }
        return { success: false, result: null };
      }
    );

    await runKnowledgeMigration(makeLogger());

    expect(deletedCollections).toContain('patterns');
  });

  test('preserves the legacy collection when the list reaches the cap (possible truncation)', async () => {
    // A full page (>= cap) means the listing may be truncated. Migration must
    // NOT delete the source, or the unread remainder would be lost.
    const doc = {
      id: 'd1',
      vector: FAKE_VECTOR,
      payload: { description: 'A pattern', triggers: [], rationale: 'r' },
    };
    const cappedDocs = new Array(LEGACY_LIST_CAP).fill(doc);

    const deletedCollections: string[] = [];
    let storeCalls = 0;

    vi.mocked(invokePluginTool).mockImplementation(
      async (_plugin: string, tool: string, args: Record<string, unknown>) => {
        const ok = (data: unknown) => ({ success: true, result: { success: true, data } });
        if (tool === 'collection_list') return ok(['patterns']);
        if (tool === 'vector_list') return ok(cappedDocs);
        if (tool === 'collection_initialize') return ok(null);
        if (tool === 'vector_store') {
          storeCalls++;
          return ok(null);
        }
        if (tool === 'collection_delete') {
          deletedCollections.push(args.collection as string);
          return ok(null);
        }
        return { success: false, result: null };
      }
    );

    const logger = makeLogger();
    await runKnowledgeMigration(logger);

    // Source preserved, nothing stored, and the risk is logged loudly.
    expect(deletedCollections).not.toContain('patterns');
    expect(storeCalls).toBe(0);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.stringContaining('list cap')
    );
  });

  test('skips migration when the target knowledge-base exists at a different dimension (no recreate)', async () => {
    // knowledge-base already exists at a different vector size (embedding model
    // changed). Migration must NOT recreate it (which would drop existing data)
    // and must preserve the legacy collection.
    const doc = {
      id: 'd1',
      vector: FAKE_VECTOR, // length 4
      payload: { description: 'A pattern', triggers: [], rationale: 'r' },
    };

    const initializedCollections: string[] = [];
    const deletedCollections: string[] = [];
    let storeCalls = 0;

    vi.mocked(invokePluginTool).mockImplementation(
      async (_plugin: string, tool: string, args: Record<string, unknown>) => {
        const ok = (data: unknown) => ({ success: true, result: { success: true, data } });
        if (tool === 'collection_list') return ok(['patterns', 'knowledge-base']);
        if (tool === 'vector_list') return ok([doc]);
        if (tool === 'collection_stats') return ok({ exists: true, vectorSize: FAKE_VECTOR.length + 1 });
        if (tool === 'collection_initialize') {
          initializedCollections.push(args.collection as string);
          return ok(null);
        }
        if (tool === 'vector_store') {
          storeCalls++;
          return ok(null);
        }
        if (tool === 'collection_delete') {
          deletedCollections.push(args.collection as string);
          return ok(null);
        }
        return { success: false, result: null };
      }
    );

    const logger = makeLogger();
    await runKnowledgeMigration(logger);

    // No recreate, no store, legacy preserved, and the mismatch is logged.
    expect(initializedCollections).not.toContain('knowledge-base');
    expect(storeCalls).toBe(0);
    expect(deletedCollections).not.toContain('patterns');
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.stringContaining('vector size')
    );
  });
});
