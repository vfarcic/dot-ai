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
  });
});
