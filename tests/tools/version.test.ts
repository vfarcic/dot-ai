/**
 * Tests for Version Tool
 * 
 * Tests the version tool functionality including version info retrieval
 */

import { 
  VERSION_TOOL_NAME, 
  VERSION_TOOL_DESCRIPTION, 
  VERSION_TOOL_INPUT_SCHEMA,
  handleVersionTool,
  getVersionInfo 
} from '../../src/tools/version';
import { ConsoleLogger } from '../../src/core/error-handling';

describe('Version Tool', () => {
  let logger: ConsoleLogger;
  let requestId: string;

  beforeEach(() => {
    logger = new ConsoleLogger('version-test');
    requestId = 'test-request-123';
  });

  describe('Tool Metadata', () => {
    it('should have correct tool name', () => {
      expect(VERSION_TOOL_NAME).toBe('version');
    });

    it('should have proper description', () => {
      expect(VERSION_TOOL_DESCRIPTION).toBe('Get version information for the DevOps AI Toolkit MCP server');
    });

    it('should have valid input schema', () => {
      expect(VERSION_TOOL_INPUT_SCHEMA).toEqual({
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      });
    });
  });

  describe('getVersionInfo', () => {
    it('should return version information', () => {
      const versionInfo = getVersionInfo();

      expect(versionInfo).toHaveProperty('version');
      expect(versionInfo).toHaveProperty('buildTime');
      expect(versionInfo).toHaveProperty('nodeVersion');
      expect(versionInfo).toHaveProperty('platform');
      expect(versionInfo).toHaveProperty('arch');

      expect(typeof versionInfo.version).toBe('string');
      expect(typeof versionInfo.buildTime).toBe('string');
      expect(typeof versionInfo.nodeVersion).toBe('string');
      expect(typeof versionInfo.platform).toBe('string');
      expect(typeof versionInfo.arch).toBe('string');
    });

    it('should include git information when available', () => {
      const versionInfo = getVersionInfo();

      // Git info may or may not be available depending on environment
      if (versionInfo.gitCommit) {
        expect(typeof versionInfo.gitCommit).toBe('string');
        expect(versionInfo.gitCommit.length).toBeGreaterThan(0);
      }

      if (versionInfo.gitBranch) {
        expect(typeof versionInfo.gitBranch).toBe('string');
        expect(versionInfo.gitBranch.length).toBeGreaterThan(0);
      }
    });

    it('should return valid ISO timestamp for buildTime', () => {
      const versionInfo = getVersionInfo();
      
      expect(() => new Date(versionInfo.buildTime)).not.toThrow();
      expect(new Date(versionInfo.buildTime).toISOString()).toBe(versionInfo.buildTime);
    });
  });

  describe('handleVersionTool', () => {
    it('should handle version tool request successfully', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      expect(result).toHaveProperty('status', 'success');
      expect(result).toHaveProperty('versionInfo');
      expect(result).toHaveProperty('timestamp');

      expect(result.versionInfo).toHaveProperty('version');
      expect(result.versionInfo).toHaveProperty('buildTime');
      expect(result.versionInfo).toHaveProperty('nodeVersion');
      expect(result.versionInfo).toHaveProperty('platform');
      expect(result.versionInfo).toHaveProperty('arch');
    });

    it('should return valid timestamp in response', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should handle empty arguments', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      expect(result.status).toBe('success');
      expect(result.versionInfo).toBeDefined();
    });

    it('should handle null arguments', async () => {
      const args = null;
      const result = await handleVersionTool(args, logger, requestId);

      expect(result.status).toBe('success');
      expect(result.versionInfo).toBeDefined();
    });
  });
});