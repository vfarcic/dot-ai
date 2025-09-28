/**
 * Integration Test Setup
 *
 * Global setup and configuration for integration tests.
 * Sets environment variables and validates test cluster connection.
 */

import * as fs from 'fs';
import * as path from 'path';
import { beforeAll } from 'vitest';

// Ensure we're using the test kubeconfig
const testKubeconfig = path.join(process.cwd(), 'kubeconfig-test.yaml');
process.env.KUBECONFIG = testKubeconfig;

// Use Claude Haiku (latest version) for all integration tests
process.env.MODEL = 'claude-3-haiku-20240307';

// Enable debug mode for better test diagnostics
process.env.DEBUG_DOT_AI = 'true';

// Verify test kubeconfig exists before running tests
beforeAll(() => {
  if (!fs.existsSync(testKubeconfig)) {
    throw new Error(
      `Test kubeconfig not found at ${testKubeconfig}.\n` +
      'Run "npm run test:integration:setup" to create the test cluster first.'
    );
  }

  console.log(`Integration tests using kubeconfig: ${testKubeconfig}`);
  console.log(`Integration tests using Claude model: ${process.env.MODEL}`);
});