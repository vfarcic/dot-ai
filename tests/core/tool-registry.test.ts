/**
 * Tests for Tool Registry System
 * 
 * Comprehensive tests for the dynamic tool registration functionality
 */

import { ToolRegistry, ToolDefinition, ToolHandler, ToolContext } from '../../src/core/tool-registry';
import { ConsoleLogger, LogLevel } from '../../src/core/error-handling';

describe('Tool Registry System', () => {
  let registry: ToolRegistry;
  let mockLogger: jest.Mocked<ConsoleLogger>;

  // Mock tool definitions
  const mockToolDefinition: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool for registry testing',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      },
      required: ['input']
    },
    outputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              text: { type: 'string' }
            }
          }
        }
      }
    },
    version: '1.0.0',
    category: 'test',
    tags: ['testing', 'mock']
  };

  const mockToolHandler: ToolHandler = jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Test result' }]
  });

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
      shouldLog: jest.fn().mockReturnValue(true),
      formatMessage: jest.fn(),
      serializeError: jest.fn()
    } as any;

    registry = new ToolRegistry({
      logger: mockLogger,
      enabledByDefault: true,
      validateSchemas: true
    });
  });

  describe('Tool Registration', () => {
    test('should register a tool successfully', () => {
      registry.registerTool(mockToolDefinition, mockToolHandler);

      const registeredTool = registry.getTool('test_tool');
      expect(registeredTool).toBeDefined();
      expect(registeredTool!.definition.name).toBe('test_tool');
      expect(registeredTool!.enabled).toBe(true);
      expect(registeredTool!.handler).toBe(mockToolHandler);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Registered tool: test_tool',
        expect.objectContaining({
          category: 'test',
          version: '1.0.0',
          enabled: true
        })
      );
    });

    test('should register tool as disabled when specified', () => {
      registry.registerTool(mockToolDefinition, mockToolHandler, { enabled: false });

      const registeredTool = registry.getTool('test_tool');
      expect(registeredTool!.enabled).toBe(false);
    });

    test('should warn when overwriting existing tool', () => {
      registry.registerTool(mockToolDefinition, mockToolHandler);
      registry.registerTool(mockToolDefinition, mockToolHandler);

      expect(mockLogger.warn).toHaveBeenCalledWith('Overwriting existing tool: test_tool');
    });

    test('should validate tool name format', () => {
      const invalidTool = { ...mockToolDefinition, name: '123invalid' };
      
      expect(() => {
        registry.registerTool(invalidTool, mockToolHandler);
      }).toThrow('Tool name must start with a letter');
    });

    test('should reject empty tool name', () => {
      const invalidTool = { ...mockToolDefinition, name: '' };
      
      expect(() => {
        registry.registerTool(invalidTool, mockToolHandler);
      }).toThrow('Tool name must be a non-empty string');
    });

    test('should validate input schema when validation enabled', () => {
      const invalidTool = { 
        ...mockToolDefinition, 
        inputSchema: null as any 
      };
      
      expect(() => {
        registry.registerTool(invalidTool, mockToolHandler);
      }).toThrow('Invalid schema for test_tool input schema');
    });
  });

  describe('Tool Management', () => {
    beforeEach(() => {
      registry.registerTool(mockToolDefinition, mockToolHandler);
    });

    test('should unregister tool successfully', () => {
      const result = registry.unregisterTool('test_tool');
      
      expect(result).toBe(true);
      expect(registry.getTool('test_tool')).toBeUndefined();
      expect(mockLogger.info).toHaveBeenCalledWith('Unregistered tool: test_tool');
    });

    test('should return false when unregistering non-existent tool', () => {
      const result = registry.unregisterTool('non_existent');
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Attempted to unregister unknown tool: non_existent');
    });

    test('should enable and disable tools', () => {
      expect(registry.setToolEnabled('test_tool', false)).toBe(true);
      expect(registry.isToolAvailable('test_tool')).toBe(false);
      
      expect(registry.setToolEnabled('test_tool', true)).toBe(true);
      expect(registry.isToolAvailable('test_tool')).toBe(true);
    });

    test('should return false when enabling non-existent tool', () => {
      expect(registry.setToolEnabled('non_existent', true)).toBe(false);
    });
  });

  describe('Tool Discovery', () => {
    beforeEach(() => {
      registry.registerTool(mockToolDefinition, mockToolHandler);
      registry.registerTool(
        { ...mockToolDefinition, name: 'disabled_tool' },
        mockToolHandler,
        { enabled: false }
      );
    });

    test('should get all tools', () => {
      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(2);
      expect(allTools.map(t => t.definition.name)).toContain('test_tool');
      expect(allTools.map(t => t.definition.name)).toContain('disabled_tool');
    });

    test('should get only enabled tools', () => {
      const enabledTools = registry.getEnabledTools();
      expect(enabledTools).toHaveLength(1);
      expect(enabledTools[0].definition.name).toBe('test_tool');
    });

    test('should get tool definitions for MCP', () => {
      const definitions = registry.getToolDefinitions();
      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('test_tool');
      expect(definitions[0].description).toBe('A test tool for registry testing');
    });

    test('should check tool availability correctly', () => {
      expect(registry.isToolAvailable('test_tool')).toBe(true);
      expect(registry.isToolAvailable('disabled_tool')).toBe(false);
      expect(registry.isToolAvailable('non_existent')).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    let mockContext: ToolContext;
    
    beforeEach(() => {
      mockContext = {
        requestId: 'test-request-123',
        logger: mockLogger,
        dotAI: {} as any
      };
    });

    beforeEach(() => {
      registry.registerTool(mockToolDefinition, mockToolHandler);
    });

    test('should execute tool successfully', async () => {
      const result = await registry.executeTool('test_tool', { input: 'test' }, mockContext);
      
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Test result' }]
      });
      expect(mockToolHandler).toHaveBeenCalledWith({ input: 'test' }, mockContext);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Executing tool: test_tool',
        expect.objectContaining({
          requestId: 'test-request-123',
          hasArgs: true
        })
      );
    });

    test('should throw error for unknown tool', async () => {
      await expect(
        registry.executeTool('unknown_tool', {}, mockContext)
      ).rejects.toThrow('Unknown tool: unknown_tool');
    });

    test('should throw error for disabled tool', async () => {
      registry.setToolEnabled('test_tool', false);
      
      await expect(
        registry.executeTool('test_tool', {}, mockContext)
      ).rejects.toThrow('Tool disabled: test_tool');
    });

    test('should handle tool execution errors', async () => {
      const errorHandler: ToolHandler = jest.fn().mockRejectedValue(new Error('Tool failed'));
      registry.registerTool(
        { ...mockToolDefinition, name: 'error_tool' },
        errorHandler
      );

      await expect(
        registry.executeTool('error_tool', {}, mockContext)
      ).rejects.toThrow('Tool failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Tool execution failed: error_tool',
        expect.any(Error),
        expect.objectContaining({
          requestId: 'test-request-123'
        })
      );
    });
  });

  describe('Registry Statistics', () => {
    test('should provide accurate statistics', () => {
      registry.registerTool(mockToolDefinition, mockToolHandler);
      registry.registerTool(
        { ...mockToolDefinition, name: 'tool2', category: 'other' },
        mockToolHandler,
        { enabled: false }
      );
      registry.registerTool(
        { ...mockToolDefinition, name: 'tool3', category: 'test' },
        mockToolHandler
      );

      const stats = registry.getStats();
      
      expect(stats.totalTools).toBe(3);
      expect(stats.enabledTools).toBe(2);
      expect(stats.disabledTools).toBe(1);
      expect(stats.categories).toEqual({
        test: 2,
        other: 1
      });
    });

    test('should handle uncategorized tools', () => {
      registry.registerTool(
        { ...mockToolDefinition, category: undefined },
        mockToolHandler
      );

      const stats = registry.getStats();
      expect(stats.categories.uncategorized).toBe(1);
    });
  });

  describe('Registry Management', () => {
    test('should clear all tools', () => {
      registry.registerTool(mockToolDefinition, mockToolHandler);
      registry.registerTool(
        { ...mockToolDefinition, name: 'tool2' },
        mockToolHandler
      );

      registry.clear();

      expect(registry.getAllTools()).toHaveLength(0);
      expect(mockLogger.info).toHaveBeenCalledWith('Cleared 2 tools from registry');
    });
  });

  describe('Schema Validation', () => {
    test('should skip schema validation when disabled', () => {
      const registryNoValidation = new ToolRegistry({
        validateSchemas: false,
        logger: mockLogger
      });

      const invalidTool = {
        ...mockToolDefinition,
        inputSchema: null as any
      };

      expect(() => {
        registryNoValidation.registerTool(invalidTool, mockToolHandler);
      }).not.toThrow();
    });

    test('should validate output schema if provided', () => {
      const invalidTool = {
        ...mockToolDefinition,
        outputSchema: { type: null as any } // Invalid schema structure
      };

      expect(() => {
        registry.registerTool(invalidTool, mockToolHandler);
      }).toThrow('Invalid schema for test_tool output schema');
    });
  });
});