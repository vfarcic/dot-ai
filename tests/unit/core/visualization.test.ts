/**
 * Unit Tests: Visualization Utilities
 *
 * Tests for shared visualization utilities (PRD #320)
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  getVisualizationUrl,
  getPromptForTool,
  extractPrefixFromSessionId,
  getToolNameFromPrefix,
  TOOL_SESSION_PREFIXES
} from '../../../src/core/visualization';

describe('Visualization Utilities', () => {
  describe('getVisualizationUrl', () => {
    const originalEnv = process.env.WEB_UI_BASE_URL;

    afterEach(() => {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.WEB_UI_BASE_URL = originalEnv;
      } else {
        delete process.env.WEB_UI_BASE_URL;
      }
    });

    test('should return undefined when WEB_UI_BASE_URL is not set', () => {
      delete process.env.WEB_UI_BASE_URL;
      const result = getVisualizationUrl('qry-123-abc');
      expect(result).toBeUndefined();
    });

    test('should return correct URL when WEB_UI_BASE_URL is set', () => {
      process.env.WEB_UI_BASE_URL = 'https://example.com';
      const result = getVisualizationUrl('qry-123-abc');
      expect(result).toBe('https://example.com/v/qry-123-abc');
    });

    test('should handle trailing slash in WEB_UI_BASE_URL', () => {
      process.env.WEB_UI_BASE_URL = 'https://example.com/';
      const result = getVisualizationUrl('qry-123-abc');
      expect(result).toBe('https://example.com/v/qry-123-abc');
    });

    test('should work with different session prefixes', () => {
      process.env.WEB_UI_BASE_URL = 'https://viz.example.com';

      expect(getVisualizationUrl('sol-123-abc')).toBe('https://viz.example.com/v/sol-123-abc');
      expect(getVisualizationUrl('rem-456-def')).toBe('https://viz.example.com/v/rem-456-def');
      expect(getVisualizationUrl('opr-789-ghi')).toBe('https://viz.example.com/v/opr-789-ghi');
    });
  });

  describe('getPromptForTool', () => {
    test('should return correct prompt for query tool', () => {
      expect(getPromptForTool('query')).toBe('visualize-query');
    });

    test('should return correct prompt for recommend tool', () => {
      expect(getPromptForTool('recommend')).toBe('visualize-recommend');
    });

    test('should return correct prompt for remediate tool', () => {
      expect(getPromptForTool('remediate')).toBe('visualize-remediate');
    });

    test('should return correct prompt for operate tool', () => {
      expect(getPromptForTool('operate')).toBe('visualize-operate');
    });

    test('should return correct prompt for capabilities', () => {
      expect(getPromptForTool('capabilities')).toBe('visualize-capabilities');
    });

    test('should return correct prompt for version tool', () => {
      expect(getPromptForTool('version')).toBe('visualize-version');
    });

    test('should return correct prompt for projectSetup tool', () => {
      expect(getPromptForTool('projectSetup')).toBe('visualize-project-setup');
    });

    test('should fallback to visualize-query for unknown tools', () => {
      expect(getPromptForTool('unknown')).toBe('visualize-query');
      expect(getPromptForTool('')).toBe('visualize-query');
    });
  });

  describe('extractPrefixFromSessionId', () => {
    test('should extract qry prefix', () => {
      expect(extractPrefixFromSessionId('qry-1704067200000-a1b2c3d4')).toBe('qry');
    });

    test('should extract sol prefix (recommend tool)', () => {
      expect(extractPrefixFromSessionId('sol-1704067200000-a1b2c3d4')).toBe('sol');
    });

    test('should extract rem prefix (remediate tool)', () => {
      expect(extractPrefixFromSessionId('rem-1704067200000-a1b2c3d4')).toBe('rem');
    });

    test('should extract opr prefix (operate tool)', () => {
      expect(extractPrefixFromSessionId('opr-1704067200000-a1b2c3d4')).toBe('opr');
    });

    test('should extract cap prefix (capabilities)', () => {
      expect(extractPrefixFromSessionId('cap-1704067200000-a1b2c3d4')).toBe('cap');
    });

    test('should extract ver prefix (version tool)', () => {
      expect(extractPrefixFromSessionId('ver-1704067200000-a1b2c3d4')).toBe('ver');
    });

    test('should extract prj prefix (projectSetup tool)', () => {
      expect(extractPrefixFromSessionId('prj-1704067200000-a1b2c3d4')).toBe('prj');
    });

    test('should default to qry for invalid sessionId', () => {
      expect(extractPrefixFromSessionId('')).toBe('qry');
    });

    test('should handle sessionId with only prefix', () => {
      expect(extractPrefixFromSessionId('test')).toBe('test');
    });
  });

  describe('getToolNameFromPrefix', () => {
    test('should return query for qry prefix', () => {
      expect(getToolNameFromPrefix('qry')).toBe('query');
    });

    test('should return recommend for sol prefix', () => {
      expect(getToolNameFromPrefix('sol')).toBe('recommend');
    });

    test('should return remediate for rem prefix', () => {
      expect(getToolNameFromPrefix('rem')).toBe('remediate');
    });

    test('should return operate for opr prefix', () => {
      expect(getToolNameFromPrefix('opr')).toBe('operate');
    });

    test('should return capabilities for cap prefix', () => {
      expect(getToolNameFromPrefix('cap')).toBe('capabilities');
    });

    test('should return version for ver prefix', () => {
      expect(getToolNameFromPrefix('ver')).toBe('version');
    });

    test('should return projectSetup for prj prefix', () => {
      expect(getToolNameFromPrefix('prj')).toBe('projectSetup');
    });

    test('should return undefined for unknown prefix', () => {
      expect(getToolNameFromPrefix('xyz')).toBeUndefined();
      expect(getToolNameFromPrefix('')).toBeUndefined();
    });
  });

  describe('TOOL_SESSION_PREFIXES', () => {
    test('should have correct prefix for each tool', () => {
      expect(TOOL_SESSION_PREFIXES.query).toBe('qry');
      expect(TOOL_SESSION_PREFIXES.recommend).toBe('sol');
      expect(TOOL_SESSION_PREFIXES.remediate).toBe('rem');
      expect(TOOL_SESSION_PREFIXES.operate).toBe('opr');
      expect(TOOL_SESSION_PREFIXES.capabilities).toBe('cap');
      expect(TOOL_SESSION_PREFIXES.version).toBe('ver');
      expect(TOOL_SESSION_PREFIXES.projectSetup).toBe('prj');
    });
  });
});
