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
});