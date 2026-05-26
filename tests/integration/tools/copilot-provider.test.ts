/**
 * Integration Test: GitHub Copilot Provider
 *
 * Opt-in test suite that exercises the full stack with AI_PROVIDER=copilot.
 * Skipped automatically unless both env vars are set:
 *   AI_PROVIDER=copilot
 *   GITHUB_COPILOT_TOKEN=gho_... (or GH_TOKEN / GITHUB_TOKEN)
 *
 * Run with:
 *   AI_PROVIDER=copilot GITHUB_COPILOT_TOKEN=gho_... npm run test:integration copilot-provider
 *
 * PRD #587: GitHub Copilot Provider
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

const COPILOT_TOKEN =
  process.env.GITHUB_COPILOT_TOKEN ||
  process.env.GH_TOKEN ||
  process.env.GITHUB_TOKEN;

const isCopilotProvider = process.env.AI_PROVIDER === 'copilot';
const hasToken = Boolean(COPILOT_TOKEN);
const shouldRun = isCopilotProvider && hasToken;

// Emit a clear skip reason so CI logs are searchable
if (!shouldRun) {
  const reasons: string[] = [];
  if (!isCopilotProvider)
    reasons.push('AI_PROVIDER is not "copilot"');
  if (!hasToken)
    reasons.push(
      'no token in GITHUB_COPILOT_TOKEN / GH_TOKEN / GITHUB_TOKEN'
    );
  console.info(
    `[copilot-provider] Skipping Copilot integration tests: ${reasons.join(', ')}`
  );
}

describe.concurrent('GitHub Copilot Provider Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    if (!shouldRun) return;
  });

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
