import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'Unit Tests',
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose'],
    testTimeout: 30000, // 30s for tests that run external commands (helm template)
  },
  esbuild: {
    target: 'node18'
  }
});
