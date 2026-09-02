/**
 * Integration Test: GitHub Copilot Provider
 *
 * Opt-in test suite that exercises the full stack with AI_PROVIDER=copilot.
 * Skipped automatically unless both of these hold:
 *   AI_PROVIDER=copilot
 *   a token of a supported shape (gho_ or ghu_ prefixed) is in
 *   GITHUB_COPILOT_TOKEN, GH_TOKEN, or GITHUB_TOKEN
 *
 * Run with:
 *   AI_PROVIDER=copilot GITHUB_COPILOT_TOKEN=gho_... npm run test:integration copilot-provider
 *
 * The harness forwards the first supported token from that chain into the
 * deployed pod's GITHUB_COPILOT_TOKEN (#783), so the gate below and the pod
 * agree: if the gate opens, the server has the credential.
 *
 * Note this group has no entry in the ci.yml integration matrix — running it
 * would need a real gho_/ghu_ token as a repository secret — so it is a
 * local, opt-in suite only.
 *
 * PRD #587: GitHub Copilot Provider
 */

import { describe, test, expect } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { findSupportedCopilotTokenInEnv } from '../../../src/core/providers/copilot-token-exchanger.js';

const isCopilotProvider = process.env.AI_PROVIDER === 'copilot';
// Shared with the production resolver so the gate cannot drift from what
// resolve() would actually accept — first-supported-wins, not first-set-wins.
const hasUsableToken = !!findSupportedCopilotTokenInEnv();
const shouldRun = isCopilotProvider && hasUsableToken;

// Emit a clear skip reason so CI logs are searchable
if (!shouldRun) {
  const reasons: string[] = [];
  if (!isCopilotProvider) reasons.push('AI_PROVIDER is not "copilot"');
  if (!hasUsableToken)
    reasons.push(
      'no supported token in GITHUB_COPILOT_TOKEN / GH_TOKEN / GITHUB_TOKEN'
    );
  console.info(
    `[copilot-provider] Skipping Copilot integration tests: ${reasons.join(', ')}`
  );
}

describe.concurrent('GitHub Copilot Provider Integration', () => {
  const integrationTest = new IntegrationTest();

  test.skipIf(!shouldRun)(
    'should return a valid version response when using Copilot provider',
    async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/version',
        { interaction_id: `copilot_provider_test_${Date.now()}` }
      );

      expect(response).toMatchObject({
        success: true,
        data: {
          tool: 'version',
          result: {
            status: 'success',
            system: {
              aiProvider: {
                connected: true,
                keyConfigured: true,
                providerType: 'copilot',
              },
            },
          },
        },
      });
    },
    120000
  );

  test.skipIf(!shouldRun)(
    'should complete an AI-powered query using Copilot provider',
    async () => {
      // A simple query that requires the AI to reason — validates end-to-end Copilot routing
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/query',
        {
          interaction_id: `copilot_query_test_${Date.now()}`,
          intent: 'List all namespaces in the cluster',
        }
      );

      expect(response).toMatchObject({
        success: true,
        data: {
          tool: 'query',
          result: {
            success: true,
            summary: expect.stringMatching(/.+/),
          },
        },
      });
    },
    300000
  );
});
