/**
 * Unit Tests: Internal Agentic-Loop Tools (PRD #407, PRD #408)
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

describe('Internal Tools - git_create_pr Validation', () => {
  const executor = createInternalToolExecutor('test-session');

  const traversalPaths = [
    '../../../etc/passwd',
    '../../..',
    'session/../../../etc/passwd',
    '%2e%2e/%2e%2e/%2e%2e/etc/passwd',
  ];

  for (const maliciousPath of traversalPaths) {
    test(`git_create_pr rejects repoPath traversal: ${maliciousPath}`, async () => {
      const result = await executor('git_create_pr', {
        repoPath: maliciousPath,
        files: [{ path: 'test.yaml', content: 'test' }],
        title: 'Test PR',
        branchName: 'test-branch',
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid repo path'),
      });
    });

    test(`git_create_pr rejects files path traversal: ${maliciousPath}`, async () => {
      const result = await executor('git_create_pr', {
        repoPath: 'valid-repo',
        files: [{ path: maliciousPath, content: 'test' }],
        title: 'Test PR',
        branchName: 'test-branch',
      });
      expect(result).toMatchObject({
        success: false,
        error: expect.stringContaining('Repository not found'),
      });
    });
  }
});

describe('Internal Tools - git_create_pr Input Validation', () => {
  const executor = createInternalToolExecutor('test-session');

  test('git_create_pr requires repoPath', async () => {
    const result = await executor('git_create_pr', {
      files: [{ path: 'test.yaml', content: 'test' }],
      title: 'Test PR',
      branchName: 'test-branch',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('repoPath'),
    });
  });

  test('git_create_pr requires files array', async () => {
    const result = await executor('git_create_pr', {
      repoPath: 'session/repo',
      title: 'Test PR',
      branchName: 'test-branch',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('files'),
    });
  });

  test('git_create_pr requires title', async () => {
    const result = await executor('git_create_pr', {
      repoPath: 'session/repo',
      files: [{ path: 'test.yaml', content: 'test' }],
      branchName: 'test-branch',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('title'),
    });
  });

  test('git_create_pr requires branchName', async () => {
    const result = await executor('git_create_pr', {
      repoPath: 'session/repo',
      files: [{ path: 'test.yaml', content: 'test' }],
      title: 'Test PR',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('branchName'),
    });
  });

  test('git_create_pr rejects empty files array', async () => {
    const result = await executor('git_create_pr', {
      repoPath: 'session/repo',
      files: [],
      title: 'Test PR',
      branchName: 'test-branch',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('files'),
    });
  });

  test('git_create_pr rejects path traversal in repoPath', async () => {
    const result = await executor('git_create_pr', {
      repoPath: '../../../etc',
      files: [{ path: 'test.yaml', content: 'test' }],
      title: 'Test PR',
      branchName: 'test-branch',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid repo path'),
    });
  });

  test('git_create_pr fails for non-existent repo', async () => {
    const result = await executor('git_create_pr', {
      repoPath: 'nonexistent/repo',
      files: [{ path: 'test.yaml', content: 'test' }],
      title: 'Test PR',
      branchName: 'test-branch',
    });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Repository not found'),
    });
  });
});
