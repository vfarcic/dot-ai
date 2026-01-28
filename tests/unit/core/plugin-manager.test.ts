/**
 * Unit Tests: Plugin Manager
 *
 * Tests state management and configuration parsing.
 * Background retry timing is tested via integration tests.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { PluginManager } from '../../../src/core/plugin-manager.js';
import { Logger } from '../../../src/core/error-handling.js';

// Mock logger
const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('PluginManager', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pluginManager = new PluginManager(mockLogger);
  });

  describe('Initial State', () => {
    test('should start with no discovered plugins', () => {
      expect(pluginManager.getDiscoveredPluginNames()).toHaveLength(0);
      expect(pluginManager.getPendingPlugins()).toHaveLength(0);
      expect(pluginManager.isBackgroundDiscoveryActive()).toBe(false);
    });

    test('should return empty stats initially', () => {
      const stats = pluginManager.getStats();

      expect(stats).toEqual({
        pluginCount: 0,
        toolCount: 0,
        plugins: [],
        pendingDiscovery: [],
        backgroundDiscoveryActive: false,
      });
    });
  });

  describe('discoverPlugins with empty config', () => {
    test('should return quickly when no plugins configured', async () => {
      await pluginManager.discoverPlugins([]);

      expect(mockLogger.debug).toHaveBeenCalledWith('No plugins configured for discovery');
      expect(pluginManager.getPendingPlugins()).toHaveLength(0);
    });
  });

  describe('Background Discovery Control', () => {
    test('should not start if no pending plugins', () => {
      pluginManager.startBackgroundDiscovery();

      expect(pluginManager.isBackgroundDiscoveryActive()).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No pending plugins for background discovery'
      );
    });

    test('should allow setting callback', () => {
      const callback = vi.fn();

      // Should not throw
      pluginManager.setOnPluginDiscovered(callback);
    });

    test('should stop cleanly even when not started', () => {
      // Should not throw
      pluginManager.stopBackgroundDiscovery();

      expect(pluginManager.isBackgroundDiscoveryActive()).toBe(false);
    });
  });

  describe('Tool Routing', () => {
    test('should return false for unknown tools', () => {
      expect(pluginManager.isPluginTool('unknown_tool')).toBe(false);
    });

    test('should return undefined for unknown tool plugin', () => {
      expect(pluginManager.getToolPlugin('unknown_tool')).toBeUndefined();
    });

    test('should return empty array for unknown plugin tools', () => {
      expect(pluginManager.getPluginTools('unknown_plugin')).toHaveLength(0);
    });
  });

  describe('invokeTool error handling', () => {
    test('should return error for unknown tool', async () => {
      const result = await pluginManager.invokeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOOL_NOT_FOUND');
      expect(result.error?.message).toContain('unknown_tool');
    });
  });
});
