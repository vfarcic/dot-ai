/**
 * Integration Test: Documentation Validation Tool (PRD #388)
 *
 * Tests the validateDocs tool via REST API against a real test cluster.
 * Validates full lifecycle: start session → check status → list → finish → verify cleanup.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('ValidateDocs Tool Integration (PRD #388)', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'dot-ai-docs-validation';

  beforeAll(async () => {
    // Verify test cluster is accessible
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  test('should complete full lifecycle: start → status → list → finish → verify cleanup', async () => {
    // Step 1: START — create session and pod
    const startResponse = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'start',
        repo: 'https://github.com/vfarcic/dot-ai',
      }
    );

    expect(startResponse).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId: expect.stringMatching(/^dvl-\d+-[a-f0-9]{8}$/),
          podName: expect.stringMatching(/^dvl-[a-f0-9]{8}$/),
          namespace: testNamespace,
          repo: 'https://github.com/vfarcic/dot-ai',
          status: 'active',
        }),
      },
    });

    const sessionId = startResponse.data.result.sessionId;
    const podName = startResponse.data.result.podName;

    // Step 2: Verify pod is actually running in cluster
    const podPhase = await integrationTest.kubectl(
      `get pod ${podName} -n ${testNamespace} -o jsonpath="{.status.phase}"`
    );
    expect(podPhase.replace(/"/g, '')).toBe('Running');

    // Verify pod has correct labels
    const podLabels = await integrationTest.kubectl(
      `get pod ${podName} -n ${testNamespace} -o jsonpath="{.metadata.labels.dot-ai/tool}"`
    );
    expect(podLabels.replace(/"/g, '')).toBe('docs-validation');

    // Verify pod has TTL annotation
    const ttlAnnotation = await integrationTest.kubectl(
      `get pod ${podName} -n ${testNamespace} -o jsonpath="{.metadata.annotations.dot-ai/ttl-deadline}"`
    );
    expect(ttlAnnotation.replace(/"/g, '')).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Step 3: STATUS — check session status
    const statusResponse = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'status',
        sessionId,
      }
    );

    expect(statusResponse).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId,
          repo: 'https://github.com/vfarcic/dot-ai',
          status: 'active',
          podName,
          podNamespace: testNamespace,
          podStatus: 'Running',
        }),
      },
    });

    // Step 4: LIST — verify session appears in list
    const listResponse = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'list',
      }
    );

    expect(listResponse).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessions: expect.arrayContaining([
            expect.objectContaining({
              sessionId,
              repo: 'https://github.com/vfarcic/dot-ai',
              status: 'active',
              podName,
            }),
          ]),
        }),
      },
    });

    // Step 5: FINISH — end session and delete pod
    const finishResponse = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'finish',
        sessionId,
      }
    );

    expect(finishResponse).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId,
          status: 'finished',
          podDeleted: true,
        }),
      },
    });

    // Step 6: Verify pod is deleted from cluster (wait for termination to complete)
    await integrationTest
      .kubectl(
        `wait --for=delete pod/${podName} -n ${testNamespace} --timeout=60s`
      )
      .catch(() => {
        // Pod may already be gone, which is fine
      });
    const podAfterFinish = await integrationTest.kubectl(
      `get pod ${podName} -n ${testNamespace} --ignore-not-found -o jsonpath="{.metadata.name}"`
    );
    expect(podAfterFinish.replace(/"/g, '').trim()).toBe('');

    // Step 7: STATUS after finish — session persists, shows terminated
    const statusAfterFinish = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'status',
        sessionId,
      }
    );

    expect(statusAfterFinish).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId,
          status: 'finished',
        }),
      },
    });

    // Step 8: FINISH already-finished session — should be idempotent
    const finishAgainResponse = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'finish',
        sessionId,
      }
    );

    expect(finishAgainResponse).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId,
          status: 'finished',
          podDeleted: false,
        }),
      },
    });
  }, 300000);

  test('should support custom container image', async () => {
    const startResponse = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'start',
        repo: 'https://github.com/vfarcic/dot-ai',
        image: 'alpine:3.19',
      }
    );

    expect(startResponse).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          containerImage: 'alpine:3.19',
          status: 'active',
        }),
      },
    });

    const sessionId = startResponse.data.result.sessionId;
    const podName = startResponse.data.result.podName;

    // Verify the pod uses the custom image
    const podImage = await integrationTest.kubectl(
      `get pod ${podName} -n ${testNamespace} -o jsonpath="{.spec.containers[0].image}"`
    );
    expect(podImage.replace(/"/g, '')).toBe('alpine:3.19');

    // Cleanup
    await integrationTest.httpClient.post('/api/v1/tools/validateDocs', {
      action: 'finish',
      sessionId,
    });
  }, 300000);

  describe('Error Handling', () => {
    test('should return error for start without repo', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/validateDocs',
        {
          action: 'start',
        }
      );

      expect(response).toMatchObject({
        success: true,
        data: {
          result: expect.objectContaining({
            success: false,
            error: expect.stringContaining('repo'),
          }),
        },
      });
    });

    test('should return error for status with invalid session ID', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/validateDocs',
        {
          action: 'status',
          sessionId: 'dvl-nonexistent-12345678',
        }
      );

      expect(response).toMatchObject({
        success: true,
        data: {
          result: expect.objectContaining({
            success: false,
            error: expect.stringContaining('not found'),
          }),
        },
      });
    });

    test('should return error for finish without session ID', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/validateDocs',
        {
          action: 'finish',
        }
      );

      expect(response).toMatchObject({
        success: true,
        data: {
          result: expect.objectContaining({
            success: false,
            error: expect.stringContaining('sessionId'),
          }),
        },
      });
    });
  });
});
