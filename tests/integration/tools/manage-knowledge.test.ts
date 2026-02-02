/**
 * Integration Test: ManageKnowledge Tool
 *
 * Tests the knowledge base ingest and retrieval functionality via REST API.
 * Uses precise assertions with pre-calculated expected values.
 *
 * PRD #356: Knowledge Base System - Milestone 1
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { createHash } from 'crypto';
import { v5 as uuidv5 } from 'uuid';

// Same namespace used by the plugin for deterministic chunk IDs
const KNOWLEDGE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe.concurrent('ManageKnowledge Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Ingest and Retrieve Workflow', () => {
    test('should ingest single-chunk document and retrieve with exact values', async () => {
      const testId = Date.now();
      const testUri = `git://test/docs/single-chunk-${testId}.md`;

      // Content under 1000 chars = exactly 1 chunk
      const testContent = 'This is a short test document for the knowledge base integration test.';
      const testMetadata = { source: 'integration-test', testId };

      // Pre-calculate expected values
      const expectedChunkCount = 1;
      const expectedChunkContent = testContent;
      const expectedChecksum = createHash('sha256').update(testContent).digest('hex');
      const expectedChunkId = uuidv5(`${testUri}#0`, KNOWLEDGE_NAMESPACE);

      // Step 1: Ingest
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: testContent,
        metadata: testMetadata,
        interaction_id: `ingest_${testId}`,
      });

      expect(ingestResponse, `Ingest response: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
            chunksCreated: expectedChunkCount,
            chunkIds: [expectedChunkId],
            message: `Successfully ingested document into ${expectedChunkCount} chunks`,
          },
        },
      });

      // Step 2: Retrieve by URI
      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'getByUri',
        uri: testUri,
        interaction_id: `get_${testId}`,
      });

      expect(getResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'getByUri',
            uri: testUri,
            totalChunks: expectedChunkCount,
            chunks: [
              {
                id: expectedChunkId,
                content: expectedChunkContent,
                uri: testUri,
                checksum: expectedChecksum,
                chunkIndex: 0,
                totalChunks: expectedChunkCount,
                ingestedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
                metadata: testMetadata,
              },
            ],
            message: `Retrieved ${expectedChunkCount} chunks for URI`,
          },
        },
      });
    }, 120000);

    test('should ingest multi-chunk document and retrieve with exact values', async () => {
      const testId = Date.now();
      const testUri = `git://test/docs/multi-chunk-${testId}.md`;
      const testMetadata = { source: 'integration-test', testId };

      // Two meaningful paragraphs, each ~500 chars, separated by \n\n
      // Total ~1000+ chars will produce 2 chunks with chunkSize=1000, overlap=200
      const paragraph1 = `This is the first section of the document about Kubernetes deployments. It covers how to configure pods, services, and ingress resources. Deployments allow you to declaratively update applications. You describe a desired state in a Deployment, and the controller changes the actual state. StatefulSets are used for stateful applications that require stable network identifiers. Each pod in a StatefulSet has a persistent identifier maintained across rescheduling. ReplicaSets ensure a specified number of pod replicas are running at any given time.`;

      const paragraph2 = `The second section covers ConfigMaps and Secrets for configuration management. ConfigMaps allow you to decouple configuration from container images. Secrets are similar but designed for sensitive data like passwords and tokens. Both can be consumed as environment variables or mounted as files. This separation enables portable and reusable application configurations. Always use Secrets for sensitive data rather than storing them in ConfigMaps. You can also use external secret management tools like HashiCorp Vault for enhanced security.`;

      const testContent = `${paragraph1}\n\n${paragraph2}`;

      // Pre-calculate expected values
      const expectedChunkCount = 2;
      const expectedChunkId0 = uuidv5(`${testUri}#0`, KNOWLEDGE_NAMESPACE);
      const expectedChunkId1 = uuidv5(`${testUri}#1`, KNOWLEDGE_NAMESPACE);

      // Step 1: Ingest
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: testContent,
        metadata: testMetadata,
        interaction_id: `ingest_multi_${testId}`,
      });

      expect(ingestResponse, `Multi-chunk ingest response: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
            chunksCreated: expectedChunkCount,
            chunkIds: [expectedChunkId0, expectedChunkId1],
            message: `Successfully ingested document into ${expectedChunkCount} chunks`,
          },
        },
      });

      // Step 2: Retrieve by URI
      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'getByUri',
        uri: testUri,
        interaction_id: `get_multi_${testId}`,
      });

      expect(getResponse, `Multi-chunk get response: ${JSON.stringify(getResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'getByUri',
            uri: testUri,
            totalChunks: expectedChunkCount,
            message: `Retrieved ${expectedChunkCount} chunks for URI`,
          },
        },
      });

      const chunks = getResponse.data.result.chunks;
      expect(chunks).toHaveLength(expectedChunkCount);

      // Verify chunk 0
      const chunk0 = chunks[0];
      expect(chunk0.id).toBe(expectedChunkId0);
      expect(chunk0.chunkIndex).toBe(0);
      expect(chunk0.totalChunks).toBe(expectedChunkCount);
      expect(chunk0.uri).toBe(testUri);
      expect(chunk0.metadata).toEqual(testMetadata);
      expect(chunk0.content).toContain('Kubernetes deployments');
      expect(chunk0.checksum).toBe(createHash('sha256').update(chunk0.content).digest('hex'));

      // Verify chunk 1
      const chunk1 = chunks[1];
      expect(chunk1.id).toBe(expectedChunkId1);
      expect(chunk1.chunkIndex).toBe(1);
      expect(chunk1.totalChunks).toBe(expectedChunkCount);
      expect(chunk1.uri).toBe(testUri);
      expect(chunk1.metadata).toEqual(testMetadata);
      expect(chunk1.content).toContain('ConfigMaps and Secrets');
      expect(chunk1.checksum).toBe(createHash('sha256').update(chunk1.content).digest('hex'));
    }, 120000);

    test('should handle empty content with zero chunks', async () => {
      const testId = Date.now();
      const testUri = `git://test/docs/empty-${testId}.md`;

      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: '   \n\n   ',
        interaction_id: `ingest_empty_${testId}`,
      });

      expect(ingestResponse, `Empty content response: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
            chunksCreated: 0,
            chunkIds: [],
            message: 'Empty or whitespace-only content - no chunks created',
          },
        },
      });
    }, 60000);

    test('should return empty chunks array for non-existent URI', async () => {
      const testId = Date.now();
      const nonExistentUri = `git://test/docs/does-not-exist-${testId}.md`;

      const getResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'getByUri',
        uri: nonExistentUri,
        interaction_id: `get_nonexistent_${testId}`,
      });

      expect(getResponse, `Non-existent URI response: ${JSON.stringify(getResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'getByUri',
            uri: nonExistentUri,
            totalChunks: 0,
            chunks: [],
            message: 'No chunks found for URI',
          },
        },
      });
    }, 60000);
  });

  describe('Error Handling', () => {
    test('should return error for ingest without content', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: `git://test/docs/test-${testId}.md`,
        interaction_id: `ingest_no_content_${testId}`,
      });

      expect(errorResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: 'Missing required parameter: content',
              operation: 'ingest',
              hint: 'Provide the document content to ingest',
            },
          },
        },
      });
    }, 60000);

    test('should return error for ingest without uri', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        content: 'Some content',
        interaction_id: `ingest_no_uri_${testId}`,
      });

      expect(errorResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: 'Missing required parameter: uri',
              operation: 'ingest',
              hint: 'Provide the full URI identifying the document (e.g., git://org/repo/docs/guide.md)',
            },
          },
        },
      });
    }, 60000);

    test('should return error for getByUri without uri', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'getByUri',
        interaction_id: `get_no_uri_${testId}`,
      });

      expect(errorResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: 'Missing required parameter: uri',
              operation: 'getByUri',
              hint: 'Provide the URI of the document to retrieve chunks for',
            },
          },
        },
      });
    }, 60000);

    test('should return error for search without query', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        interaction_id: `search_no_query_${testId}`,
      });

      expect(errorResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: 'Missing required parameter: query',
              operation: 'search',
              hint: 'Provide a natural language search query',
            },
          },
        },
      });
    }, 60000);
  });

  describe('Search Operation', () => {
    test('should search and return only the matching chunk from multiple ingested docs', async () => {
      const testId = Date.now();

      // Create 3 documents with unique, distinct content (each under 1000 chars = 1 chunk)
      // Using testId in content to ensure uniqueness and avoid collision with other tests
      const k8sUri = `git://test/search/flamingo-deployment-${testId}.md`;
      const dbUri = `git://test/search/pelican-database-${testId}.md`;
      const netUri = `git://test/search/albatross-network-${testId}.md`;

      // Unique content with invented terms to avoid matching other ingested docs
      const k8sContent = `Flamingo orchestration system ${testId} enables declarative application updates.
The Flamingo controller reconciles desired state with actual state using rolling updates.
Flamingo manages replica sets automatically for zero-downtime deployments.
This unique flamingo-based orchestration pattern provides self-healing capabilities.`;

      const dbContent = `Pelican database system ${testId} provides relational data storage.
Pelican uses MVCC for concurrent transactions and supports ACID guarantees.
The pelican query optimizer handles complex joins efficiently.
This unique pelican-based storage engine excels at analytical workloads.`;

      const netContent = `Albatross networking protocol ${testId} handles packet routing.
Albatross uses BGP for autonomous system interconnection.
The albatross load balancer distributes traffic across backend servers.
This unique albatross-based protocol stack ensures reliable delivery.`;

      // Pre-calculate expected chunk IDs (each doc = 1 chunk at index 0)
      const expectedK8sChunkId = uuidv5(`${k8sUri}#0`, KNOWLEDGE_NAMESPACE);
      const expectedDbChunkId = uuidv5(`${dbUri}#0`, KNOWLEDGE_NAMESPACE);
      const expectedNetChunkId = uuidv5(`${netUri}#0`, KNOWLEDGE_NAMESPACE);

      // Step 1: Ingest all three documents
      for (const doc of [
        { uri: k8sUri, content: k8sContent, name: 'k8s' },
        { uri: dbUri, content: dbContent, name: 'db' },
        { uri: netUri, content: netContent, name: 'net' },
      ]) {
        const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
          operation: 'ingest',
          uri: doc.uri,
          content: doc.content,
          metadata: { testId, docType: doc.name },
          interaction_id: `ingest_search_${doc.name}_${testId}`,
        });

        expect(ingestResponse, `Ingest ${doc.name}: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              operation: 'ingest',
              chunksCreated: 1, // Each doc is under 1000 chars = 1 chunk
            },
          },
        });
      }

      // Step 2: Search for flamingo orchestration content (should match only k8s doc)
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `flamingo orchestration rolling updates ${testId}`,
        limit: 10,
        interaction_id: `search_flamingo_${testId}`,
      });

      expect(searchResponse, `Search response: ${JSON.stringify(searchResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
            query: `flamingo orchestration rolling updates ${testId}`,
          },
        },
      });

      const searchResult = searchResponse.data.result;

      // Step 3: Verify exactly 1 result - the flamingo/k8s chunk
      expect(searchResult.totalMatches).toBe(1);
      expect(searchResult.chunks).toHaveLength(1);

      // Step 4: Verify the exact chunk ID and content
      const returnedChunk = searchResult.chunks[0];
      expect(returnedChunk.id).toBe(expectedK8sChunkId);
      expect(returnedChunk.uri).toBe(k8sUri);
      expect(returnedChunk.content).toContain('Flamingo orchestration');
      expect(returnedChunk.content).toContain(String(testId));
      expect(returnedChunk.matchType).toBe('semantic');
      expect(returnedChunk.score).toBeGreaterThanOrEqual(0.5);
      expect(returnedChunk.chunkIndex).toBe(0);
      expect(returnedChunk.totalChunks).toBe(1);

      // Step 5: Verify pelican and albatross chunks are NOT returned
      const returnedIds = searchResult.chunks.map((c: { id: string }) => c.id);
      expect(returnedIds).not.toContain(expectedDbChunkId);
      expect(returnedIds).not.toContain(expectedNetChunkId);
    }, 180000);

    test('should search multi-chunk document and return the specific matching chunk', async () => {
      const testId = Date.now();
      const multiChunkUri = `git://test/search/phoenix-guide-${testId}.md`;

      // Create content that produces exactly 2 chunks (each ~600 chars, total ~1200 > 1000 chunk size)
      // Chunk 0: About phoenix migration patterns
      // Chunk 1: About phoenix caching strategies (distinct topic)
      const chunk0Content = `Phoenix migration patterns ${testId} enable seamless database schema evolution.
The phoenix migrator tracks schema versions using a dedicated migrations table.
Each phoenix migration runs in a transaction ensuring atomic changes.
Phoenix supports both forward migrations and rollback operations for safety.
The phoenix CLI generates timestamped migration files automatically.
Teams using phoenix migrations achieve zero-downtime schema deployments.`;

      const chunk1Content = `Phoenix caching strategies ${testId} improve application performance dramatically.
The phoenix cache layer supports multiple backends including Redis and Memcached.
Phoenix implements cache invalidation using tag-based expiration policies.
Distributed phoenix caches synchronize across cluster nodes automatically.
The phoenix cache warming feature preloads frequently accessed data on startup.
Applications using phoenix caching see response times drop significantly.`;

      const fullContent = `${chunk0Content}\n\n${chunk1Content}`;

      // Pre-calculate expected chunk IDs
      const expectedChunk0Id = uuidv5(`${multiChunkUri}#0`, KNOWLEDGE_NAMESPACE);
      const expectedChunk1Id = uuidv5(`${multiChunkUri}#1`, KNOWLEDGE_NAMESPACE);

      // Step 1: Ingest the multi-chunk document
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: multiChunkUri,
        content: fullContent,
        metadata: { testId, docType: 'multi-chunk' },
        interaction_id: `ingest_multichunk_${testId}`,
      });

      expect(ingestResponse, `Multi-chunk ingest: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            chunksCreated: 2,
            chunkIds: [expectedChunk0Id, expectedChunk1Id],
          },
        },
      });

      // Step 2: Search for caching content (should match chunk 1 specifically)
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `phoenix caching Redis Memcached cache invalidation ${testId}`,
        limit: 10,
        interaction_id: `search_chunk1_${testId}`,
      });

      expect(searchResponse, `Search chunk1: ${JSON.stringify(searchResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
          },
        },
      });

      const searchResult = searchResponse.data.result;
      expect(searchResult.chunks.length).toBeGreaterThan(0);

      // Step 3: Verify chunk 1 (caching) is the top result, not chunk 0 (migration)
      const topResult = searchResult.chunks[0];
      expect(topResult.id).toBe(expectedChunk1Id);
      expect(topResult.uri).toBe(multiChunkUri);
      expect(topResult.chunkIndex).toBe(1);
      expect(topResult.totalChunks).toBe(2);
      expect(topResult.content).toContain('phoenix caching');
      expect(topResult.content).toContain('Redis');

      // Step 4: If chunk 0 appears, it should have lower score
      const chunk0Result = searchResult.chunks.find((c: { id: string }) => c.id === expectedChunk0Id);
      if (chunk0Result) {
        expect(chunk0Result.score).toBeLessThan(topResult.score);
      }
    }, 180000);

    test('should respect limit parameter', async () => {
      const testId = Date.now();

      // Search with limit=1 using unique terms from previous tests
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: 'flamingo orchestration deployment',
        limit: 1,
        interaction_id: `search_limit_${testId}`,
      });

      expect(searchResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
          },
        },
      });

      // Verify limit is respected - at most 1 result
      expect(searchResponse.data.result.chunks.length).toBeLessThanOrEqual(1);
    }, 60000);

    test('should return empty results for completely unrelated query', async () => {
      const testId = Date.now();

      // Search for invented gibberish that matches nothing
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `zxqwvtyu${testId} plmkjnhb${testId} qazxswed${testId}`,
        interaction_id: `search_nomatch_${testId}`,
      });

      expect(searchResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
            chunks: [],
            totalMatches: 0,
            message: 'No matching documents found',
          },
        },
      });
    }, 60000);
  });
});
