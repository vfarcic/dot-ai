/**
 * Tests for DocDiscovery class
 * 
 * Tests the documentation file discovery functionality with pattern matching
 * and priority ordering
 */

import { DocDiscovery, DiscoveredFile } from '../../src/core/doc-discovery';
import * as fs from 'fs';
import * as path from 'path';

// Mock glob
jest.mock('glob', () => ({
  glob: jest.fn()
}));

// Mock fs and path
jest.mock('fs');
jest.mock('path');

const mockGlob = require('glob').glob as jest.MockedFunction<typeof import('glob').glob>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('DocDiscovery', () => {
  let discovery: DocDiscovery;

  beforeEach(() => {
    discovery = new DocDiscovery();
    jest.clearAllMocks();
    
    // Setup path.join mock
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.basename.mockImplementation((filePath: string) => filePath.split('/').pop() || '');
  });

  describe('getFilePattern', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.DOT_AI_DOC_PATTERN;
    });

    test('should return CLI argument pattern when provided', () => {
      const args = { filePattern: '*.rst' };
      expect(discovery.getFilePattern(args)).toBe('*.rst');
    });

    test('should return environment variable pattern when CLI arg not provided', () => {
      process.env.DOT_AI_DOC_PATTERN = 'docs/**/*.md';
      const args = {};
      expect(discovery.getFilePattern(args)).toBe('docs/**/*.md');
    });

    test('should return default pattern when neither CLI arg nor env var provided', () => {
      const args = {};
      expect(discovery.getFilePattern(args)).toBe('**/*.md');
    });

    test('should prioritize CLI arg over environment variable', () => {
      process.env.DOT_AI_DOC_PATTERN = 'docs/**/*.md';
      const args = { filePattern: '*.rst' };
      expect(discovery.getFilePattern(args)).toBe('*.rst');
    });
  });

  describe('discoverFiles', () => {
    test('should discover files and return sorted results', async () => {
      const mockFiles = [
        'docs/API.md',
        'README.md',
        'CONTRIBUTING.md',
        'src/index.md'
      ];

      mockGlob.mockResolvedValue(mockFiles);

      const result = await discovery.discoverFiles('/test/dir', '**/*.md');

      expect(mockGlob).toHaveBeenCalledWith('**/*.md', {
        cwd: '/test/dir',
        ignore: expect.arrayContaining(['node_modules/**', '.git/**', 'dist/**']),
        nodir: true,
        dot: false
      });

      expect(result).toHaveLength(4);
      // README.md should be first (priority 1)
      expect(result[0].name).toBe('README.md');
      expect(result[0].priority).toBe(1);
      expect(result[0].category).toBe('readme');
    });

    test('should handle empty results gracefully', async () => {
      mockGlob.mockResolvedValue([]);

      const result = await discovery.discoverFiles('/test/dir', '**/*.md');

      expect(result).toHaveLength(0);
    });

    test('should handle glob errors gracefully', async () => {
      mockGlob.mockRejectedValue(new Error('Glob error'));

      const result = await discovery.discoverFiles('/test/dir', '**/*.md');

      expect(result).toHaveLength(0);
    });

    test('should use current directory as default', async () => {
      mockGlob.mockResolvedValue(['README.md']);

      await discovery.discoverFiles();

      expect(mockGlob).toHaveBeenCalledWith('**/*.md', {
        cwd: process.cwd(),
        ignore: expect.any(Array),
        nodir: true,
        dot: false
      });
    });

    test('should use provided pattern or default', async () => {
      mockGlob.mockResolvedValue(['README.md']);

      await discovery.discoverFiles('/test/dir');

      expect(mockGlob).toHaveBeenCalledWith('**/*.md', expect.any(Object));
    });
  });

  describe('priority calculation', () => {
    test('should assign highest priority to README.md', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('README.md', 'README.md');
      expect(priority).toBe(1);
    });

    test('should assign priority 2 to other README files', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('README.rst', 'README.rst');
      expect(priority).toBe(2);
    });

    test('should assign priority 10+ to common documentation files', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('CONTRIBUTING.md', 'CONTRIBUTING.md');
      expect(priority).toBe(10);
    });

    test('should assign priority 100 to docs directory files', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('docs/guide.md', 'guide.md');
      expect(priority).toBe(100);
    });

    test('should assign priority 200 to root level files', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('NOTES.md', 'NOTES.md');
      expect(priority).toBe(200); // NOTES.md is not in common docs, so gets root level priority
    });

    test('should assign priority 11 to CHANGELOG.md', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('CHANGELOG.md', 'CHANGELOG.md');
      expect(priority).toBe(11); // CHANGELOG.md is in the common docs list at index 1
    });

    test('should assign priority 1000 to other files', () => {
      const discovery = new DocDiscovery();
      const priority = (discovery as any).calculatePriority('some/deep/file.md', 'file.md');
      expect(priority).toBe(1000);
    });
  });

  describe('file categorization', () => {
    test('should categorize README files correctly', () => {
      const discovery = new DocDiscovery();
      const category = (discovery as any).categorizeFile('README.md', 'README.md');
      expect(category).toBe('readme');
    });

    test('should categorize common documentation files', () => {
      const discovery = new DocDiscovery();
      const category = (discovery as any).categorizeFile('CONTRIBUTING.md', 'CONTRIBUTING.md');
      expect(category).toBe('common');
    });

    test('should categorize docs directory files', () => {
      const discovery = new DocDiscovery();
      const category = (discovery as any).categorizeFile('docs/guide.md', 'guide.md');
      expect(category).toBe('docs');
    });

    test('should categorize other files', () => {
      const discovery = new DocDiscovery();
      const category = (discovery as any).categorizeFile('some/file.md', 'file.md');
      expect(category).toBe('other');
    });
  });

  describe('formatForDisplay', () => {
    test('should format empty results', () => {
      const files: DiscoveredFile[] = [];
      const result = discovery.formatForDisplay(files);
      expect(result).toBe('No documentation files found matching the pattern.');
    });

    test('should format single file', () => {
      const files: DiscoveredFile[] = [{
        path: '/test/README.md',
        name: 'README.md',
        priority: 1,
        category: 'readme',
        relativePath: 'README.md'
      }];
      
      const result = discovery.formatForDisplay(files);
      expect(result).toContain('Found 1 documentation file:');
      expect(result).toContain('README.md (default)');
      expect(result).toContain('Default selection: **README.md**');
    });

    test('should format multiple files with categories', () => {
      const files: DiscoveredFile[] = [
        {
          path: '/test/README.md',
          name: 'README.md',
          priority: 1,
          category: 'readme',
          relativePath: 'README.md'
        },
        {
          path: '/test/CONTRIBUTING.md',
          name: 'CONTRIBUTING.md',
          priority: 10,
          category: 'common',
          relativePath: 'CONTRIBUTING.md'
        },
        {
          path: '/test/docs/guide.md',
          name: 'guide.md',
          priority: 100,
          category: 'docs',
          relativePath: 'docs/guide.md'
        },
        {
          path: '/test/other.md',
          name: 'other.md',
          priority: 1000,
          category: 'other',
          relativePath: 'other.md'
        }
      ];
      
      const result = discovery.formatForDisplay(files);
      expect(result).toContain('Found 4 documentation files:');
      expect(result).toContain('**README Files:**');
      expect(result).toContain('**Common Documentation:**');
      expect(result).toContain('**Documentation Directory:**');
      expect(result).toContain('**Other Files:**');
      expect(result).toContain('README.md (default)');
      expect(result).toContain('Default selection: **README.md**');
    });
  });

  describe('ignored directories', () => {
    test('should ignore common directories', async () => {
      mockGlob.mockResolvedValue(['README.md']);

      await discovery.discoverFiles('/test/dir', '**/*.md');

      expect(mockGlob).toHaveBeenCalledWith('**/*.md', {
        cwd: '/test/dir',
        ignore: expect.arrayContaining([
          'node_modules/**',
          '.git/**',
          'dist/**',
          'build/**',
          '.next/**',
          'target/**'
        ]),
        nodir: true,
        dot: false
      });
    });
  });
});