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

  test('should validate fixture doc with known issues: find issues, apply fixes, clean up', async () => {
    // Fixture: tests/integration/fixtures/broken-doc.md contains known issues:
    // - Run-on sentence (60+ words) in Prerequisites
    // - Code block missing language tag
    // - Heading level skip (h3 → h5)
    // - Broken internal link (docs/nonexistent-config-guide.md)
    // - Broken external URL (https://httpstat.us/404)
    // - Passive voice in Usage and Troubleshooting sections
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'validate',
        repo: 'https://github.com/vfarcic/dot-ai',
        page: 'tests/integration/fixtures/broken-doc.md',
      }
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId: expect.stringMatching(/^dvl-\d+-[a-f0-9]{8}$/),
          repo: 'https://github.com/vfarcic/dot-ai',
          page: 'tests/integration/fixtures/broken-doc.md',
          status: 'completed',
          pageStatus: 'fixed',
          summary: expect.any(String),
          issuesFound: expect.any(Array),
          fixesApplied: expect.any(Array),
          iterations: expect.any(Number),
          toolCalls: expect.any(Number),
        }),
      },
    });

    const result = response.data.result;

    // AI should have made at least 2 tool calls (read file + at least one fix)
    expect(result.toolCalls).toBeGreaterThanOrEqual(2);
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.summary.length).toBeGreaterThan(0);

    // Should find multiple issues in the fixture doc
    expect(result.issuesFound.length).toBeGreaterThanOrEqual(3);

    // Validate issue structure
    for (const issue of result.issuesFound) {
      expect(issue).toMatchObject({
        page: 'tests/integration/fixtures/broken-doc.md',
        type: expect.stringMatching(
          /^(readability|syntax|runtime|broken-link)$/
        ),
        severity: expect.stringMatching(/^(low|medium|high)$/),
        description: expect.any(String),
        fixed: expect.any(Boolean),
      });
    }

    // Should have applied at least one fix
    expect(result.fixesApplied.length).toBeGreaterThanOrEqual(1);

    // Validate fix structure
    for (const fix of result.fixesApplied) {
      expect(fix).toMatchObject({
        page: 'tests/integration/fixtures/broken-doc.md',
        description: expect.any(String),
        reasoning: expect.any(String),
      });
    }

    // Should detect the broken external URL (httpstat.us/404)
    const brokenLinkIssues = result.issuesFound.filter(
      (i: { type: string }) => i.type === 'broken-link'
    );
    expect(brokenLinkIssues.length).toBeGreaterThanOrEqual(1);

    const sessionId = result.sessionId;

    // Verify pod was cleaned up
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
  }, 900000);

  test('should validate fixture doc with broken code blocks: find runtime issues, apply fixes', async () => {
    // Fixture: tests/integration/fixtures/broken-code-doc.md contains known code errors:
    // - Python: missing colon after `for item in items` → SyntaxError
    // - JSON: missing comma after `"port": 8080` → parse error
    // - YAML: bad indentation (nested under scalar value) → structure error
    // - Node.js: `npm run lint` requires installing Node.js runtime (not in base image)
    // - Bash: valid script (should not be flagged)
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/validateDocs',
      {
        action: 'validate',
        repo: 'https://github.com/vfarcic/dot-ai',
        page: 'tests/integration/fixtures/broken-code-doc.md',
      }
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        result: expect.objectContaining({
          success: true,
          sessionId: expect.stringMatching(/^dvl-\d+-[a-f0-9]{8}$/),
          repo: 'https://github.com/vfarcic/dot-ai',
          page: 'tests/integration/fixtures/broken-code-doc.md',
          status: 'completed',
          pageStatus: 'fixed',
          summary: expect.any(String),
          issuesFound: expect.any(Array),
          fixesApplied: expect.any(Array),
          iterations: expect.any(Number),
          toolCalls: expect.any(Number),
        }),
      },
    });

    const result = response.data.result;

    // AI should have made multiple tool calls: read file, execute code blocks, patch fixes
    expect(result.toolCalls).toBeGreaterThanOrEqual(4);

    // Should find runtime issues (broken Python, JSON, YAML blocks)
    const runtimeIssues = result.issuesFound.filter(
      (i: { type: string }) => i.type === 'runtime'
    );
    expect(runtimeIssues.length).toBeGreaterThanOrEqual(2);

    // Validate runtime issue structure
    for (const issue of runtimeIssues) {
      expect(issue).toMatchObject({
        page: 'tests/integration/fixtures/broken-code-doc.md',
        type: 'runtime',
        severity: expect.stringMatching(/^(low|medium|high)$/),
        description: expect.any(String),
        fixed: expect.any(Boolean),
      });
    }

    // Should have applied fixes for the broken code blocks
    expect(result.fixesApplied.length).toBeGreaterThanOrEqual(2);

    for (const fix of result.fixesApplied) {
      expect(fix).toMatchObject({
        page: 'tests/integration/fixtures/broken-code-doc.md',
        description: expect.any(String),
        reasoning: expect.any(String),
      });
    }

    // Verify pod cleanup
    const sessionId = result.sessionId;
    await integrationTest
      .kubectl(
        `wait --for=delete pod -l dot-ai/session-id=${sessionId} -n ${testNamespace} --timeout=60s`
      )
      .catch(() => {});
    const pods = await integrationTest.kubectl(
      `get pods -n ${testNamespace} -l dot-ai/session-id=${sessionId} --ignore-not-found -o jsonpath="{.items[*].metadata.name}"`
    );
    expect(pods.replace(/"/g, '').trim()).toBe('');
  }, 900000);

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
