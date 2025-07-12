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

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toHaveProperty('status', 'success');
      expect(responseData).toHaveProperty('versionInfo');
      expect(responseData).toHaveProperty('timestamp');

      expect(responseData.versionInfo).toHaveProperty('version');
      expect(responseData.versionInfo).toHaveProperty('nodeVersion');
      expect(responseData.versionInfo).toHaveProperty('platform');
      expect(responseData.versionInfo).toHaveProperty('arch');
    });

    it('should return valid timestamp in response', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      const responseData = JSON.parse(result.content[0].text);
      expect(() => new Date(responseData.timestamp)).not.toThrow();
      expect(new Date(responseData.timestamp).toISOString()).toBe(responseData.timestamp);
    });

    it('should handle empty arguments', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.status).toBe('success');
      expect(responseData.versionInfo).toBeDefined();
    });

    it('should handle null arguments', async () => {
      const args = null;
      const result = await handleVersionTool(args, logger, requestId);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.status).toBe('success');
      expect(responseData.versionInfo).toBeDefined();
    });
  });
});