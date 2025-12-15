import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'Unit Tests',
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose'],
  },
  esbuild: {
    target: 'node18'
  }
});
