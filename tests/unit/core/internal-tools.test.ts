/**
 * Unit Tests: Internal Agentic-Loop Tools (PRD #407)
 *
 * Tests path traversal security for fs_list and fs_read tools.
 * Validates that all filesystem operations are scoped to ./tmp/gitops-clones/.
 */

import { describe, test, expect } from 'vitest';
import { createInternalToolExecutor } from '../../../src/core/internal-tools.js';

describe('Internal Tools - Path Traversal Security', () => {
  const executor = createInternalToolExecutor('test-session');

  const traversalPaths = [
    '../../../etc/passwd',
    '../../..',
    'session/../../../etc/passwd',
    '/etc/passwd',
    'valid/../../..',
    '%2e%2e/%2e%2e/%2e%2e/etc/passwd',
    '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  ];

  for (const maliciousPath of traversalPaths) {
    test(`fs_list rejects traversal path: ${maliciousPath}`, async () => {
      const result = await executor('fs_list', { path: maliciousPath });
      expect(result).toMatch(/Error:/);
    });

    test(`fs_read rejects traversal path: ${maliciousPath}`, async () => {
      const result = await executor('fs_read', { path: maliciousPath });
      expect(result).toMatch(/Error:/);
    });
  }
});
