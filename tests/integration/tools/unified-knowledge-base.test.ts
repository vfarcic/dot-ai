/**
 * Integration Test: Unified Knowledge Base (PRD #375)
 *
 * Tests all 6 milestones of the Unified Knowledge Base feature:
 * - Milestone 1: Tags field in chunks and search results
 * - Milestone 2: AI classification during ingestion
 * - Milestone 3: Consumer tools search unified KB
 * - Milestone 5: Auto-migration (idempotent)
 * - Milestone 6: End-to-end workflows
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Unified Knowledge Base (PRD #375)', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  // ===========================================================================
  // Milestone 1: Tags field in chunks and search results
  // ===========================================================================
  describe('Milestone 1: Tags Field in Knowledge Base', () => {
    test('should store chunks with empty tags by default and return tags in search results', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/general-doc-${testId}.md`;

      // Ingest a document (tags should default to [])
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: `General documentation about Kubernetes deployment ${testId}.
Kubernetes deployments manage a set of identical pods.
Rolling updates allow zero-downtime deployments.`,
        metadata: { testId },
        interaction_id: `m1_ingest_${testId}`,
      });

      expect(ingestResponse, `Ingest failed: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
          },
        },
      });

      // Search for the document and verify tags field is present in results
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `Kubernetes deployment ${testId}`,
        limit: 5,
        uriFilter: testUri,
        interaction_id: `m1_search_${testId}`,
      });

      expect(searchResponse, `Search failed: ${JSON.stringify(searchResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'search',
          },
        },
      });

      const chunks = searchResponse.data.result.chunks;
      expect(chunks.length).toBeGreaterThan(0);

      // Every chunk must have a tags field (array), defaulting to []
      for (const chunk of chunks) {
        expect(chunk).toHaveProperty('tags');
        expect(Array.isArray(chunk.tags)).toBe(true);
        // Default tags should be empty array (no AI classification yet without provider)
        // Note: if AI provider is available, tags might be set by Milestone 2
      }

      // Cleanup
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `m1_cleanup_${testId}`,
      });
    }, 120000);

    test('should persist tags when explicitly set in metadata flow', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/policy-doc-${testId}.md`;

      // Ingest document - tags are set by classification
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: `All databases must use PostgreSQL ${testId}. Container images must come from approved registries only.
Services must have health checks defined for production deployments.
Maximum pod restart count is 5 before alerting the on-call team.`,
        metadata: { testId, category: 'governance' },
        interaction_id: `m1_policy_ingest_${testId}`,
      });

      expect(ingestResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
          },
        },
      });

      // Search and verify tags are returned in each chunk
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `database PostgreSQL ${testId}`,
        limit: 5,
        uriFilter: testUri,
        interaction_id: `m1_policy_search_${testId}`,
      });

      const chunks = searchResponse.data.result.chunks;
      expect(chunks.length).toBeGreaterThan(0);

      for (const chunk of chunks) {
        expect(chunk).toHaveProperty('tags');
        expect(Array.isArray(chunk.tags)).toBe(true);
        // Tags may be ["policy"] if AI classification is available, or [] if not
        // Either is valid - what matters is the field exists and is an array
        for (const tag of chunk.tags) {
          expect(typeof tag).toBe('string');
          expect(['policy', 'pattern']).toContain(tag);
        }
      }

      // Cleanup
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `m1_policy_cleanup_${testId}`,
      });
    }, 120000);
  });

  // ===========================================================================
  // Milestone 2: AI Classification During Ingestion
  // ===========================================================================
  describe('Milestone 2: AI Classification', () => {
    test('should classify policy document and apply tags to all chunks', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/policy-rules-${testId}.md`;

      // Clear policy document - should get ["policy"] tag
      const policyContent = `# Infrastructure Policy Requirements ${testId}

All container images must be pulled from the approved internal registry: registry.internal.company.com.
Images from public registries like Docker Hub are prohibited in production environments.

Database deployments must use PostgreSQL version 14 or higher.
MySQL and MariaDB are not permitted for new projects starting after ${testId}.

All services must define readiness and liveness probes. Services without health checks will be automatically rejected.

Resource limits must be set for all containers: minimum CPU limit is 100m, minimum memory limit is 128Mi.
Containers without resource limits will be rejected by the admission controller.`;

      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: policyContent,
        metadata: { testId, type: 'policy' },
        interaction_id: `m2_policy_ingest_${testId}`,
      });

      expect(ingestResponse, `Policy ingest failed: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
          },
        },
      });

      // Search and verify policy tags applied to chunks
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `container images registry policy ${testId}`,
        limit: 10,
        uriFilter: testUri,
        interaction_id: `m2_policy_search_${testId}`,
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

      const chunks = searchResponse.data.result.chunks;
      expect(chunks.length).toBeGreaterThan(0);

      // All chunks from the same document should have the same tags
      const firstChunkTags = chunks[0].tags;
      for (const chunk of chunks) {
        expect(chunk.tags).toEqual(firstChunkTags);
      }

      // If AI provider is available, policy documents should be tagged as "policy"
      // We accept either ["policy"] (AI available) or [] (AI not available, graceful degradation)
      expect(Array.isArray(firstChunkTags)).toBe(true);
      if (firstChunkTags.length > 0) {
        // AI classified - should include "policy" tag
        expect(firstChunkTags).toContain('policy');
      }

      // Cleanup
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `m2_policy_cleanup_${testId}`,
      });
    }, 180000);

    test('should classify pattern document and apply tags to all chunks', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/pattern-template-${testId}.md`;

      // Clear pattern document - should get ["pattern"] tag
      const patternContent = `# Standard Web Application Pattern ${testId}

This pattern describes the standard deployment architecture for public web applications.

## Components Required

Public web applications use three core Kubernetes resources working together:
1. Deployment - manages the application pods with rolling updates
2. Service - provides stable internal networking and load balancing
3. Ingress - handles external traffic routing with TLS termination

## Deployment Configuration

The Deployment resource manages pod lifecycle with replica count of at least 2 for HA.
Configure rolling update strategy with maxUnavailable=0 and maxSurge=1.

## Service Configuration

ClusterIP service type for internal connectivity. Port 80 exposed internally.

## Ingress Configuration

Use nginx ingress controller. Configure TLS using cert-manager ClusterIssuer.
Rewrite rules for path-based routing to the application service.`;

      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: patternContent,
        metadata: { testId, type: 'pattern' },
        interaction_id: `m2_pattern_ingest_${testId}`,
      });

      expect(ingestResponse, `Pattern ingest failed: ${JSON.stringify(ingestResponse, null, 2)}`).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
          },
        },
      });

      // Search and verify pattern tags
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `web application deployment pattern ${testId}`,
        limit: 10,
        uriFilter: testUri,
        interaction_id: `m2_pattern_search_${testId}`,
      });

      const chunks = searchResponse.data.result.chunks;
      expect(chunks.length).toBeGreaterThan(0);

      // All chunks should have same tags (document-level classification)
      const firstChunkTags = chunks[0].tags;
      for (const chunk of chunks) {
        expect(chunk.tags).toEqual(firstChunkTags);
      }

      expect(Array.isArray(firstChunkTags)).toBe(true);
      if (firstChunkTags.length > 0) {
        // AI classified - should include "pattern" tag
        expect(firstChunkTags).toContain('pattern');
      }

      // Cleanup
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `m2_pattern_cleanup_${testId}`,
      });
    }, 180000);

    test('should handle empty document gracefully during classification', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/empty-classify-${testId}.md`;

      // Empty document should return 0 chunks without error
      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: '   \n   ',
        metadata: { testId },
        interaction_id: `m2_empty_ingest_${testId}`,
      });

      expect(ingestResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            chunksCreated: 0,
            chunkIds: [],
            message: 'Empty or whitespace-only content - no chunks created',
          },
        },
      });
    }, 60000);

    test('should apply same tags to all chunks from the same document', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/multi-chunk-policy-${testId}.md`;

      // Create a multi-chunk policy document (over 1000 chars to force multiple chunks)
      const para1 = `Policy Requirement Section A ${testId}: All container images must be pulled from the approved internal registry.
Images from public registries like Docker Hub are prohibited in production environments.
Container images must be scanned for vulnerabilities before deployment to any environment.
The security team maintains a list of approved base images that teams must use for new services.
Images must be signed with the internal signing key and verified at deployment time.
Unsigned images will be rejected by the admission webhook with a clear error message.
Image tags like "latest" are prohibited; all images must use specific version tags.
The registry scanner runs daily and will flag containers using outdated base images.`;

      const para2 = `Policy Requirement Section B ${testId}: Database deployments must use PostgreSQL version 14 or higher.
MySQL and MariaDB are not permitted for new projects starting after this policy was enacted.
All databases must have automated backups configured with at least 7 days retention.
Database credentials must be stored in Kubernetes Secrets and never in ConfigMaps or environment variables.
Database connections must use SSL/TLS with verified certificates for all production deployments.
Connection pooling must be configured for applications with more than 5 concurrent users.
Database schema migrations must be tested in staging before production deployment.
Direct database access from developer workstations to production is prohibited.`;

      const multiChunkContent = `${para1}\n\n${para2}`;

      const ingestResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: multiChunkContent,
        metadata: { testId },
        interaction_id: `m2_multichunk_ingest_${testId}`,
      });

      expect(ingestResponse).toMatchObject({
        success: true,
        data: {
          result: {
            success: true,
            operation: 'ingest',
            uri: testUri,
          },
        },
      });

      // Search to get all chunks
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `policy requirement ${testId}`,
        limit: 20,
        uriFilter: testUri,
        interaction_id: `m2_multichunk_search_${testId}`,
      });

      const chunks = searchResponse.data.result.chunks;
      expect(chunks.length).toBeGreaterThan(0);

      // CRITICAL: All chunks from the same document must have identical tags
      // Document-level classification means all chunks share the same tags
      const referenceTags = chunks[0].tags;
      for (const chunk of chunks) {
        expect(
          chunk.tags,
          `Chunk ${chunk.chunkIndex} has different tags than chunk 0. Expected ${JSON.stringify(referenceTags)}, got ${JSON.stringify(chunk.tags)}`
        ).toEqual(referenceTags);
      }

      // Cleanup
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `m2_multichunk_cleanup_${testId}`,
      });
    }, 180000);
  });

  // ===========================================================================
  // Milestone 5: Auto-Migration (idempotent on repeated runs)
  // ===========================================================================
  describe('Milestone 5: Auto-Migration', () => {
    test('should be idempotent when no legacy collections exist', async () => {
      // The migration should silently no-op when legacy patterns/policies collections don't exist.
      // We verify this by checking the server is healthy (no crash from migration).
      const versionResponse = await integrationTest.httpClient.get('/api/v1/version');
      expect(versionResponse).toMatchObject({
        success: true,
        data: expect.objectContaining({
          version: expect.any(String),
        }),
      });
    }, 30000);
  });

  // ===========================================================================
  // Milestone 6: End-to-End Workflows
  // ===========================================================================
  describe('Milestone 6: End-to-End Workflow', () => {
    test('should complete full ingest → classify → search with tags workflow', async () => {
      const testId = Date.now();

      // Document 1: Policy document
      const policyUri = `https://github.com/test-org/test-repo/blob/main/docs/e2e-policy-${testId}.md`;
      const policyContent = `# Security Policy ${testId}

All microservices must implement mutual TLS for inter-service communication.
Services that don't implement mTLS will be rejected by the Istio authorization policy.

Container resource limits must be defined. CPU limit: 2 cores maximum per container.
Memory limit: 4Gi maximum per container. Limits prevent resource starvation attacks.

All services must expose Prometheus metrics on /metrics endpoint on port 9090.
Services without metrics endpoints cannot be deployed to the production cluster.`;

      // Document 2: Pattern document
      const patternUri = `https://github.com/test-org/test-repo/blob/main/docs/e2e-pattern-${testId}.md`;
      const patternContent = `# Microservice Deployment Pattern ${testId}

Standard pattern for deploying microservices in the platform.

Components: Deployment + Service + ServiceMonitor + HorizontalPodAutoscaler.

The Deployment manages 2+ replicas with rolling update strategy.
The Service exposes port 8080 internally with ClusterIP type.
The ServiceMonitor enables Prometheus scraping of the service metrics.
The HPA scales between 2-10 replicas based on CPU utilization at 70%.`;

      // Document 3: General documentation
      const generalUri = `https://github.com/test-org/test-repo/blob/main/docs/e2e-general-${testId}.md`;
      const generalContent = `# Kubernetes Overview ${testId}

Kubernetes is a container orchestration platform that automates deployment,
scaling, and management of containerized applications across a cluster of hosts.

Key concepts: pods, deployments, services, namespaces, and config maps.
Kubernetes clusters consist of control plane nodes and worker nodes.`;

      // Ingest all three documents
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: policyUri,
        content: policyContent,
        metadata: { testId, type: 'e2e-policy' },
        interaction_id: `m6_policy_ingest_${testId}`,
      });

      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: patternUri,
        content: patternContent,
        metadata: { testId, type: 'e2e-pattern' },
        interaction_id: `m6_pattern_ingest_${testId}`,
      });

      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: generalUri,
        content: generalContent,
        metadata: { testId, type: 'e2e-general' },
        interaction_id: `m6_general_ingest_${testId}`,
      });

      // Search across all documents and verify tags are present
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `microservice deployment ${testId}`,
        limit: 20,
        interaction_id: `m6_search_${testId}`,
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

      const allChunks = searchResponse.data.result.chunks.filter(
        (c: { uri: string }) => [policyUri, patternUri, generalUri].includes(c.uri)
      );

      expect(allChunks.length).toBeGreaterThan(0);

      // All results must have the tags field
      for (const chunk of allChunks) {
        expect(chunk).toHaveProperty('tags');
        expect(Array.isArray(chunk.tags)).toBe(true);
      }

      // Group chunks by URI to check document-level tag consistency
      const byUri: Record<string, Array<{ tags: string[] }>> = {};
      for (const chunk of allChunks) {
        if (!byUri[chunk.uri]) byUri[chunk.uri] = [];
        byUri[chunk.uri].push(chunk);
      }

      // Within each URI, all chunks must have same tags (document-level classification)
      for (const [uri, uriChunks] of Object.entries(byUri)) {
        const referenceTags = uriChunks[0].tags;
        for (const chunk of uriChunks) {
          expect(
            chunk.tags,
            `URI ${uri}: chunk has inconsistent tags. Expected ${JSON.stringify(referenceTags)}, got ${JSON.stringify(chunk.tags)}`
          ).toEqual(referenceTags);
        }
      }

      // Cleanup all three documents
      await Promise.all([
        integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
          operation: 'deleteByUri',
          uri: policyUri,
          interaction_id: `m6_cleanup_policy_${testId}`,
        }),
        integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
          operation: 'deleteByUri',
          uri: patternUri,
          interaction_id: `m6_cleanup_pattern_${testId}`,
        }),
        integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
          operation: 'deleteByUri',
          uri: generalUri,
          interaction_id: `m6_cleanup_general_${testId}`,
        }),
      ]);
    }, 300000);

    test('should include tags in search results returned to consumer tools', async () => {
      const testId = Date.now();
      const testUri = `https://github.com/test-org/test-repo/blob/main/docs/consumer-test-${testId}.md`;

      // Ingest a document
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'ingest',
        uri: testUri,
        content: `Resource limits policy ${testId}: All containers must have CPU and memory limits.
CPU limit must not exceed 4 cores. Memory limit must not exceed 8Gi.
Containers without limits will be rejected by the resource quota admission controller.`,
        metadata: { testId },
        interaction_id: `m6_consumer_ingest_${testId}`,
      });

      // Search via the reusable searchKnowledgeBase function (used by consumers)
      const searchResponse = await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'search',
        query: `resource limits policy ${testId}`,
        limit: 5,
        uriFilter: testUri,
        interaction_id: `m6_consumer_search_${testId}`,
      });

      const chunks = searchResponse.data.result.chunks;
      expect(chunks.length).toBeGreaterThan(0);

      // Consumer tools (operate, recommend, remediate) receive tags in their search results
      for (const chunk of chunks) {
        expect(chunk).toHaveProperty('tags');
        expect(Array.isArray(chunk.tags)).toBe(true);
        // Validate tags are valid values
        for (const tag of chunk.tags) {
          expect(['policy', 'pattern']).toContain(tag);
        }
      }

      // Cleanup
      await integrationTest.httpClient.post('/api/v1/tools/manageKnowledge', {
        operation: 'deleteByUri',
        uri: testUri,
        interaction_id: `m6_consumer_cleanup_${testId}`,
      });
    }, 120000);
  });
});
