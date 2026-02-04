/**
 * Integration Test: ManageKnowledge Tool
 *
 * Tests the knowledge base functionality via REST API with a comprehensive
 * workflow test covering ingest, search, re-ingest (upsert), and deleteByUri.
 *
 * PRD #356: Knowledge Base System
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { v5 as uuidv5 } from 'uuid';

// Same namespace used by the plugin for deterministic chunk IDs
const KNOWLEDGE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe.concurrent('ManageKnowledge Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Complete Knowledge Base Workflow', () => {
    test('should complete full ingest → search → re-ingest → delete workflow', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/workflow-${testId}.md`;

      // Multi-chunk content (2 chunks) - each paragraph ~600 chars, total ~1200+ chars
      // With chunkSize=1000 and overlap=200, this produces 2 chunks
      const originalParagraph1 = `Narwhal deployment patterns ${testId} enable seamless container orchestration across enterprise environments.
The narwhal controller reconciles desired state with actual state using sophisticated rolling update strategies.
Narwhal manages replica sets automatically for zero-downtime deployments in production systems worldwide.
This unique narwhal-based orchestration pattern provides self-healing capabilities for mission-critical applications.
The narwhal system integrates with various container runtimes seamlessly including Docker and containerd.
Teams using narwhal achieve consistent deployments across all environments from development to production.
Narwhal deployment configurations support advanced features like pod affinity, resource quotas, and priority classes.
The narwhal scheduler optimizes pod placement based on resource availability and custom scheduling policies.`;

      const originalParagraph2 = `Narwhal scaling strategies ${testId} improve application availability dramatically in cloud environments.
The narwhal autoscaler adjusts replicas based on CPU, memory metrics, and custom application metrics.
Narwhal supports both horizontal pod autoscaling and vertical pod autoscaling configurations natively.
Distributed narwhal deployments synchronize across cluster nodes automatically using leader election.
The narwhal scaling feature handles traffic spikes gracefully in production with configurable thresholds.
Applications using narwhal scaling see improved reliability under load with automatic failover support.
Narwhal scaling policies can be customized per workload type including batch jobs and long-running services.
The narwhal metrics server collects and aggregates resource utilization data for intelligent scaling decisions.`;

      const originalContent = `${originalParagraph1}\n\n${originalParagraph2}`;
      const originalMetadata = { version: 1, testId };

      // Updated content for re-ingest (upsert) - different metadata, similar structure
      const updatedParagraph1 = `Narwhal deployment patterns ${testId} enable seamless container orchestration across enterprise environments.
The narwhal controller reconciles desired state with actual state using sophisticated rolling update strategies.
Narwhal manages replica sets automatically for zero-downtime deployments in production systems worldwide.
This unique narwhal-based orchestration pattern provides self-healing capabilities for mission-critical applications.
UPDATED: The narwhal system now supports canary deployments natively with traffic splitting capabilities.
Teams using narwhal achieve consistent deployments across all environments from development to production.
Narwhal deployment configurations support advanced features like pod affinity, resource quotas, and priority classes.
The narwhal scheduler optimizes pod placement based on resource availability and custom scheduling policies.`;

      const updatedParagraph2 = `Narwhal scaling strategies ${testId} improve application availability dramatically in cloud environments.
The narwhal autoscaler adjusts replicas based on CPU, memory metrics, and custom application metrics.
Narwhal supports both horizontal pod autoscaling and vertical pod autoscaling configurations natively.
UPDATED: Narwhal now includes predictive scaling based on historical patterns and machine learning models.
The narwhal scaling feature handles traffic spikes gracefully in production with configurable thresholds.
Applications using narwhal scaling see improved reliability under load with automatic failover support.
Narwhal scaling policies can be customized per workload type including batch jobs and long-running services.
The narwhal metrics server collects and aggregates resource utilization data for intelligent scaling decisions.`;

      const updatedContent = `${updatedParagraph1}\n\n${updatedParagraph2}`;
      const updatedMetadata = { version: 2, testId };

      // Pre-calculate expected chunk IDs (deterministic from URI + index)
      const expectedChunk0Id = uuidv5(`${testUri}#0`, KNOWLEDGE_NAMESPACE);
      const expectedChunk1Id = uuidv5(`${testUri}#1`, KNOWLEDGE_NAMESPACE);

      // ============ STEP 1: INGEST multi-chunk document ============
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: originalContent,
        metadata: originalMetadata,
        interaction_id: `workflow_ingest_${testId}`,
      });

      expect(ingestResponse, `Ingest: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
            chunksCreated: 2,
            chunkIds: [expectedChunk0Id, expectedChunk1Id],
            message: 'Successfully ingested document into 2 chunks',
          },
        },
      });

      // ============ STEP 2: SEARCH - verify semantic search works ============
      // First test with semantically related terms (NOT exact keywords)
      // Content: "narwhal deployment patterns", "container orchestration", "rolling updates"
      // Query: "container management application deployment" (related concepts)
      const semanticSearchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: 'container management application deployment orchestration',
        limit: 10,
        interaction_id: `workflow_search_semantic_${testId}`,
      });

      expect(semanticSearchResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
          },
        },
      });

      const semanticResult = semanticSearchResponse.data.result;
      expect(semanticResult.chunks.length).toBeGreaterThan(0);
      expect(semanticResult.chunks[0].matchType).toBe('semantic');
      expect(semanticResult.chunks[0].score).toBeGreaterThanOrEqual(0.5);

      // Verify our test document appears in results (may not be first due to other test data)
      const ourChunks = semanticResult.chunks.filter((c: { uri: string }) => c.uri === testUri);
      expect(ourChunks.length).toBeGreaterThan(0);

      // Test with uriFilter for exact document isolation
      const filteredSearchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: 'deployment scaling orchestration',
        limit: 10,
        uriFilter: testUri,
        interaction_id: `workflow_search_filtered_${testId}`,
      });

      expect(filteredSearchResponse.data.result.chunks.length).toBeGreaterThan(0);
      // All results should be from our test URI
      filteredSearchResponse.data.result.chunks.forEach((chunk: { uri: string }) => {
        expect(chunk.uri).toBe(testUri);
      });

      // Search with limit=1 should respect the limit
      const limitedSearch = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: 'deployment scaling',
        limit: 1,
        uriFilter: testUri,
        interaction_id: `workflow_search_limit_${testId}`,
      });
      expect(limitedSearch.data.result.chunks.length).toBeLessThanOrEqual(1);

      // ============ STEP 4: RE-INGEST (upsert) - update with new content ============
      const reIngestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: updatedContent,
        metadata: updatedMetadata,
        interaction_id: `workflow_reingest_${testId}`,
      });

      expect(reIngestResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
            chunksCreated: 2,
            chunkIds: [expectedChunk0Id, expectedChunk1Id], // Same deterministic IDs
          },
        },
      });

      // ============ STEP 5: DELETE BY URI - remove all chunks ============
      const deleteResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `workflow_delete_${testId}`,
      });

      expect(deleteResponse, `Delete: ${JSON.stringify(deleteResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'deleteByUri',
            uri: testUri,
            chunksDeleted: 2,
            message: 'Successfully deleted 2 chunks for URI',
          },
        },
      });

      // ============ STEP 6: VERIFY DELETION via uriFilter search ============
      // Search with uriFilter targeting deleted URI should return empty results
      // This is reliable because testUri includes unique testId, so no interference from concurrent tests
      const searchAfterDelete = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: 'deployment scaling orchestration',
        limit: 10,
        uriFilter: testUri,
        interaction_id: `workflow_search_deleted_${testId}`,
      });

      // CRITICAL: Verify the specific chunks we deleted are actually gone
      // If this fails, it means delete reported success but chunks are still in the index
      expect(
        searchAfterDelete.data.result.chunks,
        `Delete bug: Expected 0 chunks for deleted URI, but found ${searchAfterDelete.data.result.chunks.length}. ` +
        `Delete reported ${deleteResponse.data.result.chunksDeleted} chunks deleted but they still exist. ` +
        `Chunk IDs found: ${JSON.stringify(searchAfterDelete.data.result.chunks.map((c: { id: string }) => c.id))}`
      ).toHaveLength(0);

      // ============ STEP 7: DELETE non-existent URI returns 0 ============
      const nonExistentUri = `https://github.com/test-org/test-repo/blob/main/docs/never-existed-${testId}.md`;
      const deleteNonExistent = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: nonExistentUri,
        interaction_id: `workflow_delete_nonexistent_${testId}`,
      });

      expect(deleteNonExistent).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'deleteByUri',
            uri: nonExistentUri,
            chunksDeleted: 0,
            message: 'No chunks found for URI',
          },
        },
      });
    }, 300000);
  });

  describe('Edge Cases', () => {
    test('should handle empty content with zero chunks', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/empty-${testId}.md`;

      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: '   \n\n   ',
        interaction_id: `edge_empty_${testId}`,
      });

      expect(ingestResponse).toMatchObject({
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

    test('should respect limit and return results ordered by relevance', async () => {
      const testId = Date.now();

      // Ingest 3 documents with varying relevance to "kubernetes deployment"
      // Doc 1: Highly relevant (kubernetes deployment focused)
      const doc1Uri = `https://github.com/test-org/test-repo/blob/main/docs/k8s-deploy-${testId}.md`;
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: doc1Uri,
        content: `Kubernetes deployment strategies ${testId} enable rolling updates and blue-green deployments.
The deployment controller manages replica sets for zero-downtime updates in Kubernetes clusters.
Pod scheduling and resource allocation are handled automatically by the Kubernetes deployment system.`,
        metadata: { relevance: 'high', testId },
        interaction_id: `limit_doc1_${testId}`,
      });

      // Doc 2: Moderately relevant (mentions kubernetes but different topic)
      const doc2Uri = `https://github.com/test-org/test-repo/blob/main/docs/k8s-monitor-${testId}.md`;
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: doc2Uri,
        content: `Kubernetes monitoring ${testId} with Prometheus collects metrics from all cluster components.
Grafana dashboards visualize Kubernetes cluster health and application performance metrics.
Alerting rules notify teams when Kubernetes resource utilization exceeds thresholds.`,
        metadata: { relevance: 'medium', testId },
        interaction_id: `limit_doc2_${testId}`,
      });

      // Doc 3: Low relevance (unrelated topic - cooking recipes)
      const doc3Uri = `https://github.com/test-org/test-repo/blob/main/docs/recipes-${testId}.md`;
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: doc3Uri,
        content: `Italian pasta recipes ${testId} for family dinners include carbonara and bolognese.
Fresh ingredients like tomatoes, basil, and olive oil enhance Mediterranean cooking flavors.
Homemade bread baking requires proper yeast activation and dough proofing techniques.`,
        metadata: { relevance: 'low', testId },
        interaction_id: `limit_doc3_${testId}`,
      });

      // Search with limit=2 - should return top 2 most relevant, exclude recipes
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: 'kubernetes deployment strategies',
        limit: 2,
        interaction_id: `limit_search_${testId}`,
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

      const result = searchResponse.data.result;

      // Should return exactly 2 results (respecting limit)
      expect(result.chunks.length).toBe(2);

      // Results should be ordered by score (descending)
      expect(result.chunks[0].score).toBeGreaterThanOrEqual(result.chunks[1].score);

      // The recipes document (low relevance) should NOT be in top 2 results
      const resultUris = result.chunks.map((c: { uri: string }) => c.uri);
      expect(resultUris).not.toContain(doc3Uri);

      // Cleanup: delete all 3 test documents
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: doc1Uri,
        interaction_id: `limit_cleanup1_${testId}`,
      });
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: doc2Uri,
        interaction_id: `limit_cleanup2_${testId}`,
      });
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: doc3Uri,
        interaction_id: `limit_cleanup3_${testId}`,
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    test('should return error for ingest without content', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: `https://github.com/test-org/test-repo/blob/main/docs/test-${testId}.md`,
        interaction_id: `error_no_content_${testId}`,
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
        interaction_id: `error_no_uri_${testId}`,
      });

      expect(errorResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: 'Missing required parameter: uri',
              operation: 'ingest',
              hint: 'Provide the full URL identifying the document (e.g., https://github.com/org/repo/blob/main/docs/guide.md)',
            },
          },
        },
      });
    }, 60000);

    test('should return error for search without query', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        interaction_id: `error_no_query_${testId}`,
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

    test('should return error for deleteByUri without uri', async () => {
      const testId = Date.now();

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        interaction_id: `error_delete_no_uri_${testId}`,
      });

      expect(errorResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: 'Missing required parameter: uri',
              operation: 'deleteByUri',
              hint: 'Provide the URI of the document to delete all chunks for',
            },
          },
        },
      });
    }, 60000);
  });
});
