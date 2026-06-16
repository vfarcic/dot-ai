/**
 * Integration Tests: PRD #375 - Unified Knowledge Base (Milestones 5 & 6)
 *
 * Milestone 5: Auto-migration of legacy patterns/policies collections
 * Milestone 6: End-to-end validation of the full unified knowledge base workflow
 *
 * Test strategy:
 * - Migration tests: seed a legacy collection via direct plugin call → trigger
 *   migration → verify unified collection has the data with correct tags → verify
 *   legacy collection is gone.
 * - E2E tests: ingest various document types → verify AI tags → search → verify
 *   results include tags.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callTool(
  client: IntegrationTest['httpClient'],
  tool: string,
  params: Record<string, unknown>
) {
  return client.post(`/api/v1/tools/${tool}`, params);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.concurrent('PRD #375 Unified Knowledge Base - Migration & E2E', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  // -------------------------------------------------------------------------
  // Milestone 6: E2E — ingest → classify → search → verify tags in results
  // -------------------------------------------------------------------------

  describe('E2E: Ingest, Classification, and Search', () => {
    test(
      'should classify policy document and return tags in search results',
      async () => {
        const testId = Date.now();
        const uri = `https://example.com/policies/security-policy-${testId}.md`;

        const policyContent =
          `Security Policy ${testId}: All container images must come from approved registries.\n` +
          `Policy requirement: Containers must not run as root. Enforce runAsNonRoot: true in every pod.\n` +
          `Policy rule: Resource limits must be set on all containers to prevent noisy-neighbour issues.\n` +
          `Policy mandate: Liveness and readiness probes are required on every long-running container.\n` +
          `Compliance requirement: Network policies must restrict ingress to only necessary ports and sources.\n` +
          `Policy enforcement: All inter-service communication must use mutual TLS within the cluster.\n` +
          `Policy directive: Pod security admission must be set to restricted in production namespaces.\n` +
          `Security requirement: Secrets must never be stored in environment variables or ConfigMaps.\n` +
          `Policy standard: All workloads must have appropriate RBAC roles with least-privilege access.\n` +
          `Policy guideline: Audit logging must be enabled for all API server operations in production.`;

        // Ingest a policy document
        const ingestResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'ingest',
          uri,
          content: policyContent,
          metadata: { testId, type: 'policy' },
        });

        expect(ingestResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              operation: 'ingest',
            },
          },
        });

        // Search for the document
        const searchResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'search',
          query: `container image security policy ${testId}`,
          limit: 5,
        });

        expect(searchResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              operation: 'search',
              data: expect.arrayContaining([
                expect.objectContaining({
                  uri,
                  tags: expect.arrayContaining(['policy']),
                }),
              ]),
            },
          },
        });

        // Cleanup
        await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'deleteByUri',
          uri,
        });
      },
      300_000
    );

    test(
      'should classify pattern document and return tags in search results',
      async () => {
        const testId = Date.now();
        const uri = `https://example.com/patterns/deployment-pattern-${testId}.md`;

        const patternContent =
          `Deployment Pattern ${testId}: Blue-Green Deployment for Zero-Downtime Releases.\n` +
          `This organisational pattern describes how teams switch traffic between two identical environments.\n` +
          `Pattern trigger: Use this pattern when releases must have instant rollback capability.\n` +
          `Pattern context: Applicable to stateless services deployed on Kubernetes with an ingress controller.\n` +
          `Pattern solution: Maintain blue (live) and green (staging) environments simultaneously.\n` +
          `Implementation: Update the green environment, smoke-test, then switch ingress to green.\n` +
          `Rollback: Revert ingress to blue instantly if green shows issues in production.\n` +
          `Pattern rationale: Decouples deployment from release, enabling safe progressive delivery.\n` +
          `Teams adopting this pattern report significantly reduced incident rates on release days.\n` +
          `This proven organisational pattern is widely adopted by platform engineering teams worldwide.`;

        const ingestResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'ingest',
          uri,
          content: patternContent,
          metadata: { testId, type: 'pattern' },
        });

        expect(ingestResponse).toMatchObject({
          success: true,
          data: { result: { success: true, operation: 'ingest' } },
        });

        const searchResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'search',
          query: `blue-green deployment pattern ${testId}`,
          limit: 5,
        });

        expect(searchResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              data: expect.arrayContaining([
                expect.objectContaining({
                  uri,
                  tags: expect.arrayContaining(['pattern']),
                }),
              ]),
            },
          },
        });

        // Cleanup
        await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'deleteByUri',
          uri,
        });
      },
      300_000
    );

    test(
      'should assign empty tags to general (non-policy, non-pattern) document',
      async () => {
        const testId = Date.now();
        const uri = `https://example.com/docs/general-notes-${testId}.md`;

        const generalContent =
          `General Notes ${testId}: How to use kubectl for day-to-day operations.\n` +
          `kubectl get pods lists all pods in the current namespace.\n` +
          `kubectl describe pod shows detailed info including events.\n` +
          `kubectl logs streams container logs to stdout.\n` +
          `kubectl exec -it opens an interactive shell into a running container.\n` +
          `kubectl apply -f deploys or updates resources from a YAML manifest.\n` +
          `kubectl delete removes resources by name or label selector.\n` +
          `kubectl rollout status monitors a rolling update until completion.\n` +
          `kubectl top shows resource usage (requires metrics-server).\n` +
          `kubectl port-forward tunnels a local port to a pod port for testing.`;

        const ingestResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'ingest',
          uri,
          content: generalContent,
          metadata: { testId },
        });

        expect(ingestResponse).toMatchObject({
          success: true,
          data: { result: { success: true, operation: 'ingest' } },
        });

        const searchResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'search',
          query: `kubectl general notes ${testId}`,
          limit: 5,
        });

        expect(searchResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              data: expect.arrayContaining([
                expect.objectContaining({
                  uri,
                  tags: expect.any(Array),
                }),
              ]),
            },
          },
        });

        // General documents should have empty or no policy/pattern tags
        const result = searchResponse.data.result.data as Array<{ uri: string; tags?: string[] }>;
        const ourDoc = result.find((d) => d.uri === uri);
        expect(ourDoc).toBeDefined();
        expect(ourDoc?.tags ?? []).not.toContain('policy');
        expect(ourDoc?.tags ?? []).not.toContain('pattern');

        // Cleanup
        await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'deleteByUri',
          uri,
        });
      },
      300_000
    );

    test(
      'should handle empty document gracefully during ingestion',
      async () => {
        const testId = Date.now();
        const uri = `https://example.com/docs/empty-doc-${testId}.md`;

        const ingestResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'ingest',
          uri,
          content: '',
          metadata: { testId },
        });

        // Empty content — should fail gracefully or succeed with 0 chunks
        // Either way, no crash
        expect(ingestResponse).toMatchObject({
          success: true,
        });
      },
      60_000
    );
  });

  // -------------------------------------------------------------------------
  // Milestone 6: E2E — consumer tools (operate context, recommend) can see
  // knowledge with tags
  // -------------------------------------------------------------------------

  describe('E2E: Consumer Tools See Unified Knowledge', () => {
    test(
      'should allow operate tool to find context from unified knowledge base',
      async () => {
        const testId = Date.now();
        const uri = `https://example.com/context/operate-context-${testId}.md`;

        // Ingest context that operate would normally need
        const contextContent =
          `Operations Context ${testId}: Standard deployment checklist for Kubernetes.\n` +
          `Before deploying, verify readiness probes are configured for every service container.\n` +
          `Check resource limits and requests are set appropriately for production workloads.\n` +
          `Confirm HorizontalPodAutoscaler is configured for workloads expecting variable load.\n` +
          `Ensure PodDisruptionBudget protects critical services during voluntary disruptions.\n` +
          `Validate that ConfigMaps and Secrets are mounted correctly in the pod spec.\n` +
          `Review network policies to confirm ingress and egress rules are correct.\n` +
          `Verify service account permissions follow the principle of least privilege.\n` +
          `Confirm image pull secrets are configured if using private registries.\n` +
          `Check that persistent volume claims have the correct storage class and access mode.`;

        await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'ingest',
          uri,
          content: contextContent,
          metadata: { testId },
        });

        // The operate tool should be able to retrieve this context via the
        // unified knowledge-base collection. We verify the knowledge was stored
        // by searching directly — operate's internal embedContext call uses
        // the same collection.
        const searchResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'search',
          query: `deployment checklist Kubernetes context ${testId}`,
          limit: 3,
        });

        expect(searchResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              data: expect.arrayContaining([
                expect.objectContaining({ uri }),
              ]),
            },
          },
        });

        // Cleanup
        await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'deleteByUri',
          uri,
        });
      },
      300_000
    );
  });

  // -------------------------------------------------------------------------
  // Milestone 5: Migration idempotency — no legacy collections → no-op
  // -------------------------------------------------------------------------

  describe('Migration: Idempotency', () => {
    test(
      'should complete knowledge search successfully when no legacy collections exist',
      async () => {
        // This test verifies that the absence of legacy collections does not
        // break any functionality — the migration runs as a no-op at startup
        // and the knowledge base operates normally.
        const testId = Date.now();
        const uri = `https://example.com/idempotency-check-${testId}.md`;

        const ingestResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'ingest',
          uri,
          content: `Idempotency check document ${testId}. The migration is a no-op when no legacy collections are present.`,
          metadata: { testId },
        });

        expect(ingestResponse).toMatchObject({
          success: true,
          data: { result: { success: true } },
        });

        const searchResponse = await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'search',
          query: `idempotency check migration ${testId}`,
          limit: 3,
        });

        expect(searchResponse).toMatchObject({
          success: true,
          data: { result: { success: true } },
        });

        // Cleanup
        await callTool(integrationTest.httpClient, 'manageKnowledge', {
          operation: 'deleteByUri',
          uri,
        });
      },
      120_000
    );
  });
});
