/**
 * Integration Test: Documentation Validation Tool (PRD #388)
 *
 * Tests the validateDocs tool via REST API against a real test cluster.
 * Validates full lifecycle: validate call creates pod, clones repo, verifies page, cleans up.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('ValidateDocs Tool Integration (PRD #388)', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'dot-ai-docs-validation';

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  test('should complete full validate lifecycle: pod created → repo cloned → page verified → pod cleaned up', async () => {
    // Call validate with a known docs page in this repo
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'validate',
        repo: 'https://github.com/vfarcic/dot-ai',
        page: 'docs/GOVERNANCE.md',
      }
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId: expect.stringMatching(/^dvl-\d+-[a-f0-9]{8}$/),
          repo: 'https://github.com/vfarcic/dot-ai',
          page: 'docs/GOVERNANCE.md',
          status: 'completed',
        }),
      },
    });

    const sessionId = response.data.result.sessionId;

    // Wait for pod termination to complete, then verify no pods remain
    await integrationTest
      .kubectl(
        `wait --for=delete pod -l dot-ai/session-id=${sessionId} -n ${testNamespace} --timeout=60s`
      )
      .catch(() => {
        // Pod may already be gone
      });
    const pods = await integrationTest.kubectl(
      `get pods -n ${testNamespace} -l dot-ai/session-id=${sessionId} --ignore-not-found -o jsonpath="{.items[*].metadata.name}"`
    );
    expect(pods.replace(/"/g, '').trim()).toBe('');
  }, 600000);

  test('should return error for non-existent page and still clean up', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'validate',
        repo: 'https://github.com/vfarcic/dot-ai',
        page: 'does-not-exist/fake-page.md',
      }
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: false,
          sessionId: expect.stringMatching(/^dvl-\d+-[a-f0-9]{8}$/),
          error: expect.stringContaining('Page not found'),
        }),
      },
    });

    const sessionId = response.data.result.sessionId;

    // Wait for pod termination to complete, then verify no pods remain
    await integrationTest
      .kubectl(
        `wait --for=delete pod -l dot-ai/session-id=${sessionId} -n ${testNamespace} --timeout=60s`
      )
      .catch(() => {
        // Pod may already be gone
      });
    const pods = await integrationTest.kubectl(
      `get pods -n ${testNamespace} -l dot-ai/session-id=${sessionId} --ignore-not-found -o jsonpath="{.items[*].metadata.name}"`
    );
    expect(pods.replace(/"/g, '').trim()).toBe('');
  }, 600000);
});
