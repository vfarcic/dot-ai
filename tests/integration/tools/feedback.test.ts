/**
 * Integration Test: User Feedback Collection
 * PRD #245 - User Feedback Collection via Google Forms
 *
 * Tests feedback message appearance in tool responses using statistical verification.
 * Uses the version tool as it's a single-stage tool (no multi-step workflow).
 */

import { describe, test, expect } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Feedback Collection Integration', () => {
  const integrationTest = new IntegrationTest();

  describe('Feedback Message Statistical Verification', () => {
    test('should show feedback message approximately 5% of the time with default settings', async () => {
      const iterations = 100;
      let feedbackCount = 0;

      // Call version tool multiple times and count feedback appearances
      for (let i = 0; i < iterations; i++) {
        const response = await integrationTest.httpClient.post('/api/v1/tools/version', {
          interaction_id: `feedback_test_${i}`
        });

        // Check if response contains feedback message
        if (response.success && response.data?.result) {
          const resultText = typeof response.data.result === 'string'
            ? response.data.result
            : JSON.stringify(response.data.result);

          if (resultText.includes('Help us improve dot-ai!') &&
              resultText.includes('forms.gle')) {
            feedbackCount++;
          }
        }
      }

      // With 100 iterations at 5% probability:
      // Expected: 5, StdDev: ~2.18
      // Allow range of 1-12 for statistical variance (~99% confidence)
      // P(X=0) ≈ 0.6% - acceptable false failure rate for CI
      const expectedMin = 1;
      const expectedMax = 12;
      const probability = feedbackCount / iterations;

      console.log(`Feedback appeared ${feedbackCount}/${iterations} times (${(probability * 100).toFixed(1)}%)`);

      expect(feedbackCount).toBeGreaterThanOrEqual(expectedMin);
      expect(feedbackCount).toBeLessThanOrEqual(expectedMax);
    }, 300000); // 5 minute timeout for 100 API calls
  });
});
