/**
 * Session Utils Tests
 * Tests for shared session directory utilities including relative path support
 */

import { getSessionDirectory, validateSessionDirectory, getAndValidateSessionDirectory } from '../../src/core/session-utils';
import * as fs from 'fs';
import * as path from 'path';

describe('Session Utils', () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Create test directory
    testDir = path.join(process.cwd(), 'tmp', 'session-utils-test', Date.now().toString());
    fs.mkdirSync(testDir, { recursive: true });
    
    // Save original state
    originalCwd = process.cwd();
    originalEnv = process.env.APP_AGENT_SESSION_DIR;
  });

  afterEach(() => {
    // Restore original state
    process.chdir(originalCwd);
    if (originalEnv) {
      process.env.APP_AGENT_SESSION_DIR = originalEnv;
    } else {
      delete process.env.APP_AGENT_SESSION_DIR;
    }
    
    // Clean up test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Could not clean up test directory:', error);
    }
  });

  describe('getSessionDirectory', () => {
    it('should prefer CLI args over environment variable', () => {
      process.env.APP_AGENT_SESSION_DIR = '/env/path';
      const args = { sessionDir: '/cli/path' };
      
      const result = getSessionDirectory(args);
      
      expect(result).toBe('/cli/path');
    });

    it('should use environment variable when CLI args not provided', () => {
      process.env.APP_AGENT_SESSION_DIR = '/env/path';
      const args = {};
      
      const result = getSessionDirectory(args);
      
      expect(result).toBe('/env/path');
    });

    it('should throw error when neither CLI args nor environment variable provided', () => {
      delete process.env.APP_AGENT_SESSION_DIR;
      const args = {};
      
      expect(() => getSessionDirectory(args)).toThrow(
        'Session directory must be specified via --session-dir parameter or APP_AGENT_SESSION_DIR environment variable'
      );
    });

    it('should work with relative paths from environment variable', () => {
      process.env.APP_AGENT_SESSION_DIR = './relative/path';
      const args = {};
      
      const result = getSessionDirectory(args);
      
      expect(result).toBe('./relative/path');
    });
  });

  describe('validateSessionDirectory', () => {
    it('should validate existing absolute directory', () => {
      expect(() => validateSessionDirectory(testDir)).not.toThrow();
    });

    it('should validate existing relative directory', () => {
      // Create relative directory structure
      const relativeTestDir = path.join(testDir, 'relative-test');
      const relativeSessionDir = path.join(relativeTestDir, 'sessions');
      fs.mkdirSync(relativeSessionDir, { recursive: true });
      
      // Change to test directory and validate relative path
      process.chdir(relativeTestDir);
      
      expect(() => validateSessionDirectory('./sessions')).not.toThrow();
    });

    it('should throw error for non-existent directory', () => {
      const nonExistentDir = path.join(testDir, 'does-not-exist');
      
      expect(() => validateSessionDirectory(nonExistentDir)).toThrow(
        `Session directory does not exist: ${nonExistentDir}`
      );
    });

    it('should throw error when path is not a directory', () => {
      const filePath = path.join(testDir, 'test-file.txt');
      fs.writeFileSync(filePath, 'test');
      
      expect(() => validateSessionDirectory(filePath)).toThrow(
        `Session directory path is not a directory: ${filePath}`
      );
    });

    it('should test write permissions when required', () => {
      expect(() => validateSessionDirectory(testDir, true)).not.toThrow();
    });

    it('should throw error when directory is not writable', () => {
      // Create read-only directory (only works on Unix systems)
      const readOnlyDir = path.join(testDir, 'readonly');
      fs.mkdirSync(readOnlyDir);
      
      // Make directory read-only
      try {
        fs.chmodSync(readOnlyDir, 0o444);
        
        expect(() => validateSessionDirectory(readOnlyDir, true)).toThrow();
        
        // Restore permissions for cleanup
        fs.chmodSync(readOnlyDir, 0o755);
      } catch (error) {
        // Skip this test on systems where chmod doesn't work (e.g., Windows)
        console.warn('Skipping write permission test - chmod not supported');
      }
    });
  });

  describe('getAndValidateSessionDirectory', () => {
    it('should get and validate session directory from environment variable', () => {
      process.env.APP_AGENT_SESSION_DIR = testDir;
      const args = {};
      
      const result = getAndValidateSessionDirectory(args, undefined, false);
      
      expect(result).toBe(testDir);
    });

    it('should get and validate session directory with write permissions', () => {
      process.env.APP_AGENT_SESSION_DIR = testDir;
      const args = {};
      
      const result = getAndValidateSessionDirectory(args, undefined, true);
      
      expect(result).toBe(testDir);
    });

    it('should work with relative paths when cwd is set', () => {
      // Create test directory structure
      const testCwd = path.join(testDir, 'cwd-test');
      const relativeSessionDir = './sessions';
      const absoluteSessionDir = path.join(testCwd, 'sessions');
      
      fs.mkdirSync(testCwd, { recursive: true });
      fs.mkdirSync(absoluteSessionDir, { recursive: true });
      
      // Change to test directory and set relative path
      process.chdir(testCwd);
      process.env.APP_AGENT_SESSION_DIR = relativeSessionDir;
      
      const args = {};
      const result = getAndValidateSessionDirectory(args, undefined, true);
      
      expect(result).toBe('./sessions');
      
      // Verify the relative path actually resolves to the correct absolute path
      expect(path.resolve(result)).toBe(absoluteSessionDir);
    });

    it('should throw error when session directory not configured', () => {
      delete process.env.APP_AGENT_SESSION_DIR;
      const args = {};
      
      expect(() => getAndValidateSessionDirectory(args)).toThrow(
        'Session directory must be specified via --session-dir parameter or APP_AGENT_SESSION_DIR environment variable'
      );
    });

    it('should throw error when session directory does not exist', () => {
      const nonExistentDir = path.join(testDir, 'does-not-exist');
      process.env.APP_AGENT_SESSION_DIR = nonExistentDir;
      const args = {};
      
      expect(() => getAndValidateSessionDirectory(args)).toThrow(
        `Session directory does not exist: ${nonExistentDir}`
      );
    });
  });

  describe('MCP cwd simulation', () => {
    it('should work exactly like MCP server with cwd and relative APP_AGENT_SESSION_DIR', () => {
      // Simulate MCP configuration:
      // {
      //   "mcpServers": {
      //     "app-agent": {
      //       "command": "npm",
      //       "args": ["run", "mcp:start"],
      //       "cwd": "/path/to/app-agent",
      //       "env": {
      //         "APP_AGENT_SESSION_DIR": "./tmp/sessions"
      //       }
      //     }
      //   }
      // }
      
      const mcpCwd = path.join(testDir, 'mcp-simulation');
      const relativeSessionDir = './tmp/sessions';
      const absoluteSessionDir = path.join(mcpCwd, 'tmp', 'sessions');
      
      // Create directories
      fs.mkdirSync(mcpCwd, { recursive: true });
      fs.mkdirSync(absoluteSessionDir, { recursive: true });
      
      // Change to MCP cwd and set relative environment variable
      process.chdir(mcpCwd);
      process.env.APP_AGENT_SESSION_DIR = relativeSessionDir;
      
      // This simulates what happens when MCP tools are called
      const args = {}; // MCP tools don't get sessionDir as args
      const context = { requestId: 'mcp-test-123' };
      
      const result = getAndValidateSessionDirectory(args, context, true);
      
      // Should return the relative path as configured
      expect(result).toBe('./tmp/sessions');
      
      // But should resolve to the correct absolute path
      expect(path.resolve(result)).toBe(absoluteSessionDir);
      
      // Should be able to write to it
      const testFile = path.join(result, 'test-solution.json');
      fs.writeFileSync(testFile, JSON.stringify({ test: 'data' }));
      expect(fs.existsSync(testFile)).toBe(true);
    });
  });
});