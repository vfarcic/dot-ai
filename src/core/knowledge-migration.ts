/**
 * Knowledge Base Migration Service
 *
 * PRD #375: Auto-migration — transparently migrate existing users' legacy
 * patterns and policies collections into the unified knowledge-base collection
 * on first server startup.
 *
 * Design decisions:
 * - Idempotent: safe to run multiple times (skips if legacy collections absent)
 * - Non-fatal: migration failures are logged but do not crash the server
 * - Verify-before-delete: legacy collection is only removed after verifying
 *   migrated point count matches the source
 * - Tags assigned by collection origin: patterns → ["pattern"], policies → ["policy"]
 */

import { Logger } from './error-handling';
import { invokePluginTool, isPluginInitialized } from './plugin-registry';
import { createHash } from 'crypto';
import { v5 as uuidv5 } from 'uuid';

const PLUGIN_NAME = 'agentic-tools';

/** Collections that existed before PRD #375 */
const LEGACY_COLLECTIONS: Array<{ name: string; tags: string[] }> = [
  { name: 'patterns', tags: ['pattern'] },
  { name: 'policies', tags: ['policy'] },
];

/** Target unified collection */
const KNOWLEDGE_COLLECTION = 'knowledge-base';

export const KNOWLEDGE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/**
 * Maximum number of points fetched from a legacy collection in a single
 * `vector_list` call.
 */
export const LEGACY_LIST_CAP = 100_000;

interface VectorDocument {
  id: string;
  payload: Record<string, unknown>;
  vector?: number[];
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function buildLegacyContent(payload: Record<string, unknown>, legacyName: string): string {
  const description = toStringValue(payload.description);
  const triggers = toStringArray(payload.triggers);
  const rationale = toStringValue(payload.rationale);

  const lines: string[] = [];
  if (description) {
    lines.push(description);
  }
  if (triggers.length > 0) {
    lines.push(`Triggers: ${triggers.join(', ')}`);
  }

  if (legacyName === 'patterns') {
    const suggestedResources = toStringArray(payload.suggestedResources);
    if (suggestedResources.length > 0) {
      lines.push(`Suggested resources: ${suggestedResources.join(', ')}`);
    }
  }

  if (legacyName === 'policies') {
    const deployedPolicies = Array.isArray(payload.deployedPolicies)
      ? payload.deployedPolicies
          .map(item => {
            if (typeof item === 'string') {
              return item;
            }
            if (item && typeof item === 'object' && 'name' in item) {
              const name = (item as { name?: unknown }).name;
              return typeof name === 'string' ? name : '';
            }
            return '';
          })
          .filter(Boolean)
      : [];

    if (deployedPolicies.length > 0) {
      lines.push(`Deployed policies: ${deployedPolicies.join(', ')}`);
    }
  }

  if (rationale) {
    lines.push(`Rationale: ${rationale}`);
  }

  if (lines.length === 0) {
    return JSON.stringify(payload);
  }

  return lines.join('\n\n');
}

function buildMigratedPayload(
  doc: VectorDocument,
  legacyName: string,
  tags: string[]
): Record<string, unknown> {
  const content = buildLegacyContent(doc.payload, legacyName);
  const ingestedAt = new Date().toISOString();

  return {
    content,
    uri: `legacy://${legacyName}/${doc.id}`,
    metadata: {
      migratedFrom: legacyName,
      originalId: doc.id,
      originalPayload: doc.payload,
    },
    checksum: createHash('sha256').update(content).digest('hex'),
    ingestedAt,
    chunkIndex: 0,
    totalChunks: 1,
    tags,
    extractedPolicyIds: [],
  };
}

/**
 * Invoke a plugin tool and return its data payload, or throw on failure.
 */
async function pluginCall<T>(
  tool: string,
  args: Record<string, unknown>
): Promise<T> {
  const response = await invokePluginTool(PLUGIN_NAME, tool, args);
  if (!response.success) {
    const err = response.error as { message?: string } | string | undefined;
    const msg =
      typeof err === 'object' && err?.message
        ? err.message
        : String(err ?? `Plugin tool ${tool} failed`);
    throw new Error(msg);
  }
  const result = response.result as { success?: boolean; data?: T; error?: string } | null;
  if (!result || typeof result !== 'object') {
    throw new Error(`Plugin tool ${tool} returned invalid result`);
  }
  if (result.success === false) {
    throw new Error(result.error ?? `Plugin tool ${tool} reported failure`);
  }
  return result.data as T;
}

/**
 * Check whether a collection exists in the vector database.
 */
async function collectionExists(name: string): Promise<boolean> {
  const names = await pluginCall<string[]>('collection_list', {});
  return names.includes(name);
}

/**
 * List all documents in a collection, including vectors so migration can
 * reuse existing embeddings without per-document lookups.
 */
async function listAll(collection: string): Promise<VectorDocument[]> {
  return pluginCall<VectorDocument[]>('vector_list', {
    collection,
    limit: LEGACY_LIST_CAP,
    includeVector: true,
  });
}

/**
 * Migrate one legacy collection into the unified knowledge-base.
 *
 * Steps:
 * 1. List all points in the legacy collection
 * 2. For each point, store in knowledge-base with tags set to the origin tags
 * 3. Verify the migrated count equals the source count
 * 4. Delete the legacy collection
 */
async function migrateLegacyCollection(
  legacyName: string,
  tags: string[],
  logger: Logger
): Promise<void> {
  logger.info(`[migration] Starting migration from '${legacyName}' → '${KNOWLEDGE_COLLECTION}'`);

  const documents = await listAll(legacyName);
  if (documents.length === 0) {
    logger.info(`[migration] '${legacyName}' is empty — deleting collection and skipping`);
    await pluginCall('collection_delete', { collection: legacyName });
    return;
  }

  // A full page (>= the list cap) means the listing may be truncated. Migration
  // deletes the legacy collection once its points are stored, so proceeding here
  // could silently drop the unread remainder.
  if (documents.length >= LEGACY_LIST_CAP) {
    logger.error(
      `[migration] '${legacyName}' returned ${documents.length} point(s), reaching the ` +
        `${LEGACY_LIST_CAP} list cap — the page may be truncated. Refusing to migrate-and-delete ` +
        `to avoid data loss; legacy collection preserved. Please migrate '${legacyName}' manually.`
    );
    return;
  }

  logger.info(`[migration] Migrating ${documents.length} point(s) from '${legacyName}'`);

  // vector_store does not auto-create the target collection. At server startup
  // the unified knowledge-base collection may not exist yet (no ingest has run),
  // so initialize it before storing. Legacy embeddings were produced by the same
  // embedding model, so their dimensionality is the correct vector size.
  const vectorSize = documents.find(
    (d) => Array.isArray(d.vector) && d.vector.length > 0
  )?.vector?.length;
  if (!vectorSize) {
    logger.warn(
      `[migration] No documents in '${legacyName}' have embeddings — skipping migration (legacy collection preserved)`
    );
    return;
  }

  if (!(await collectionExists(KNOWLEDGE_COLLECTION))) {
    await pluginCall('collection_initialize', {
      collection: KNOWLEDGE_COLLECTION,
      vectorSize,
      createTextIndex: true,
    });
  } else {
    const target = await pluginCall<{ vectorSize?: number }>('collection_stats', {
      collection: KNOWLEDGE_COLLECTION,
    });
    if (target?.vectorSize !== vectorSize) {
      logger.error(
        `[migration] Target '${KNOWLEDGE_COLLECTION}' exists with vector size ${target?.vectorSize}, ` +
          `but legacy '${legacyName}' vectors are ${vectorSize}-dimensional. Skipping migration to avoid ` +
          `recreating (and dropping) the existing knowledge base; legacy collection preserved.`
      );
      return;
    }
  }

  let successCount = 0;
  let failCount = 0;

  for (const doc of documents) {
    try {
      // Convert legacy pattern/policy payloads into canonical knowledge chunk payload shape.
      const mergedPayload = buildMigratedPayload(doc, legacyName, tags);

      // vector_store requires a pre-computed embedding vector.
      // Legacy documents were stored with embeddings — reuse the stored vector.
      // If no vector is present (edge case), skip and log.
      if (!doc.vector || doc.vector.length === 0) {
        logger.warn(`[migration] Document ${doc.id} has no vector — skipping (source: ${legacyName})`);
        failCount++;
        continue;
      }

      await pluginCall('vector_store', {
        collection: KNOWLEDGE_COLLECTION,
        id: uuidv5(`legacy://${legacyName}/${doc.id}#0`, KNOWLEDGE_NAMESPACE),
        embedding: doc.vector,
        payload: mergedPayload,
      });
      successCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[migration] Failed to migrate document ${doc.id} from ${legacyName}: ${msg}`);
      failCount++;
    }
  }

  logger.info(`[migration] Migrated ${successCount}/${documents.length} point(s) (${failCount} failed)`, {
    legacyName,
    successCount,
    failCount,
  });

  if (failCount > 0) {
    logger.warn(`[migration] ${failCount} document(s) failed to migrate from '${legacyName}' — legacy collection preserved for manual inspection`);
    return;
  }

  // All points migrated — delete the legacy collection
  await pluginCall('collection_delete', { collection: legacyName });
  logger.info(`[migration] Deleted legacy collection '${legacyName}'`);
}

/**
 * Run the auto-migration check at server startup.
 *
 * Safe to call even when the plugin is not initialised (skips silently).
 * Non-fatal: any error is caught and logged; the server continues normally.
 */
export async function runKnowledgeMigration(logger: Logger): Promise<void> {
  if (!isPluginInitialized()) {
    // Plugin not available (e.g. no plugins.json) — skip migration
    logger.info('[migration] Plugin not initialised — skipping legacy knowledge migration');
    return;
  }

  try {
    for (const { name, tags } of LEGACY_COLLECTIONS) {
      const exists = await collectionExists(name);
      if (!exists) {
        logger.info(`[migration] Legacy collection '${name}' not found — nothing to migrate`);
        continue;
      }

      await migrateLegacyCollection(name, tags, logger);
    }

    logger.info('[migration] Knowledge base migration check complete');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[migration] Migration failed — server continues normally: ${msg}`);
  }
}
