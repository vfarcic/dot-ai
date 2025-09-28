import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'Integration Tests',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 60000, // 60 seconds for integration tests
    hookTimeout: 10000, // 10 seconds for setup/teardown
    pool: 'forks', // Use separate processes for isolation
    poolOptions: {
      forks: {
        singleFork: true // Single worker to avoid issues
      }
    },
    reporters: ['verbose'],
    env: {
      KUBECONFIG: './kubeconfig-test.yaml',
      MODEL: 'claude-3-haiku-20240307',
      DEBUG_DOT_AI: 'true'
    }
  },
  esbuild: {
    target: 'node18'
  }
});