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
      expect(versionInfo).toHaveProperty('nodeVersion');
      expect(versionInfo).toHaveProperty('platform');
      expect(versionInfo).toHaveProperty('arch');

      expect(typeof versionInfo.version).toBe('string');
      expect(typeof versionInfo.nodeVersion).toBe('string');
      expect(typeof versionInfo.platform).toBe('string');
      expect(typeof versionInfo.arch).toBe('string');
    });

    it('should return valid version string', () => {
      const versionInfo = getVersionInfo();

      expect(versionInfo.version).toBeDefined();
      expect(versionInfo.version.length).toBeGreaterThan(0);
      expect(typeof versionInfo.version).toBe('string');
    });

    it('should return valid runtime information', () => {
      const versionInfo = getVersionInfo();
      
      expect(versionInfo.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
      expect(['darwin', 'linux', 'win32']).toContain(versionInfo.platform);
      expect(['arm64', 'x64', 'x86']).toContain(versionInfo.arch);
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