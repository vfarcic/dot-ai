#!/usr/bin/env node
/**
 * Shared seed step for the PRD #375 migration integration test
 * (tests/integration/tools/unified-knowledge-base.test.ts).
 *
 * Seeds a single legacy `patterns` collection document into Qdrant using a REAL
 * embedding produced by whatever embedding provider the server is configured
 * with. Because the server's semantic search is dense-vector only (BM25 is
 * deferred), the seed vector MUST live in the same embedding space as the
 * server — so this script always calls the *active* provider's
 * OpenAI-compatible `/embeddings` endpoint rather than fabricating a vector.
 *
 * The server's startup auto-migration (src/core/knowledge-migration.ts) then
 * moves this document into the unified `knowledge-base` collection. The test
 * asserts the migrated chunk is searchable with populated content/uri/tags and
 * that the legacy `patterns` collection has been removed.
 *
 * This script is provider-agnostic: it works for OpenAI, in-cluster local TEI
 * embeddings, or any other OpenAI-compatible endpoint (e.g. a corporate LLM
 * gateway). The caller supplies the endpoint via environment variables, so no
 * provider-specific logic lives here.
 *
 * Required environment variables:
 *   QDRANT_URL            e.g. http://localhost:6333 (port-forwarded cluster Qdrant)
 *   EMBEDDINGS_URL        OpenAI-compatible base URL, `/embeddings` is appended
 *                         (e.g. https://api.openai.com/v1, http://localhost:8080/v1)
 *   EMBEDDINGS_MODEL      embedding model name (ignored by single-model TEI, but
 *                         required by OpenAI — e.g. text-embedding-3-small)
 *   MIGRATION_SEED_ID     UUID used as the legacy point id (becomes legacy://patterns/<id>)
 *   MIGRATION_SEED_MARKER unique marker string embedded in the document content
 *
 * Optional environment variables:
 *   EMBEDDINGS_API_KEY    Bearer token for the embeddings endpoint. Omit for
 *                         keyless endpoints such as local TEI.
 */

const QDRANT_URL = requireEnv('QDRANT_URL').replace(/\/+$/, '');
const EMBEDDINGS_URL = requireEnv('EMBEDDINGS_URL').replace(/\/+$/, '');
const EMBEDDINGS_MODEL = requireEnv('EMBEDDINGS_MODEL');
const EMBEDDINGS_API_KEY = (process.env.EMBEDDINGS_API_KEY || '').trim();
const SEED_ID = requireEnv('MIGRATION_SEED_ID');
const SEED_MARKER = requireEnv('MIGRATION_SEED_MARKER');
const COLLECTION = 'patterns';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.error(`[seed] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value.trim();
}

/**
 * Legacy `patterns` payload shape (pre-PRD #375). The migration service
 * (src/core/knowledge-migration.ts > buildLegacyContent) derives the searchable
 * content from: description, triggers, suggestedResources, rationale.
 * The marker is placed in the description so it ends up in the migrated content.
 */
const seedPayload = {
  description:
    `${SEED_MARKER} — Horizontal Pod Autoscaler scaling pattern. ` +
    `Automatically scale a Deployment based on CPU and memory utilisation so the ` +
    `workload handles variable load without manual intervention.`,
  triggers: ['autoscaling', 'horizontal pod autoscaler', 'scaling', 'high load'],
  suggestedResources: ['HorizontalPodAutoscaler', 'Deployment'],
  rationale:
    'HPA provides automatic, metrics-driven scaling which improves resilience and ' +
    'cost efficiency compared to static replica counts.',
  createdAt: new Date().toISOString(),
  createdBy: 'integration-seed',
};

async function embed(text) {
  const headers = { 'Content-Type': 'application/json' };
  if (EMBEDDINGS_API_KEY) {
    headers.Authorization = `Bearer ${EMBEDDINGS_API_KEY}`;
  }
  const res = await fetch(`${EMBEDDINGS_URL}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: EMBEDDINGS_MODEL, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embeddings request failed: HTTP ${res.status} ${body.slice(0, 500)}`);
  }
  const json = await res.json();
  const vector = json?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error('Embeddings response did not contain an embedding vector');
  }
  return vector;
}

async function qdrant(method, path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Qdrant ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  // Build the content exactly as the migration would, then embed it so the
  // stored vector is semantically aligned with the document text.
  const content = [
    seedPayload.description,
    `Triggers: ${seedPayload.triggers.join(', ')}`,
    `Suggested resources: ${seedPayload.suggestedResources.join(', ')}`,
    `Rationale: ${seedPayload.rationale}`,
  ].join('\n\n');

  console.error('[seed] Requesting embedding from configured provider...');
  const vector = await embed(content);
  console.error(`[seed] Got embedding with ${vector.length} dimensions`);

  // Recreate the legacy collection cleanly so reruns are deterministic.
  console.error(`[seed] (Re)creating legacy '${COLLECTION}' collection (size ${vector.length}, Cosine)...`);
  await qdrant('DELETE', `/collections/${COLLECTION}`).catch(() => {});
  await qdrant('PUT', `/collections/${COLLECTION}`, {
    vectors: { size: vector.length, distance: 'Cosine' },
  });

  console.error(`[seed] Upserting seed point id=${SEED_ID}...`);
  await qdrant('PUT', `/collections/${COLLECTION}/points?wait=true`, {
    points: [{ id: SEED_ID, vector, payload: seedPayload }],
  });

  // Verify
  const point = await qdrant('GET', `/collections/${COLLECTION}/points/${SEED_ID}`);
  if (!point?.result) {
    throw new Error('Seed point was not found after upsert');
  }
  console.error(`[seed] Seed complete. Legacy '${COLLECTION}' collection has 1 point.`);
}

main().catch((err) => {
  console.error(`[seed] FAILED: ${err.message}`);
  process.exit(1);
});
