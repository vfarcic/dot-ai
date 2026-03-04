import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'Integration Tests',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    testTimeout: 1200000, // 20 minutes global timeout to override any defaults
    maxConcurrency: 10, // Allow up to 10 tests to run concurrently within same file
    hookTimeout: 60000, // 60 seconds for setup/teardown (30 parallel workers can saturate RPC)
    pool: 'forks', // Use separate processes for isolation
    poolOptions: {
      forks: {
        maxForks: 30 // Allow up to 30 parallel test workers for maximum parallelism
      }
    },
    reporters: ['verbose'],
    env: {
      KUBECONFIG: './kubeconfig-test.yaml',
      DEBUG_DOT_AI: 'true'
    }
  },
  esbuild: {
    target: 'node18'
  }
});