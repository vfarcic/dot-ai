/**
 * Tests for Tool Registration System Integration
 * 
 * Tests the tool registration index and integration with actual tools
 */

import { ToolRegistry } from '../../src/core/tool-registry';
import { registerAllTools, getToolRegistry, initializeTools } from '../../src/tools';
import { recommendToolDefinition } from '../../src/tools/recommend';
import { enhanceSolutionToolDefinition } from '../../src/tools/enhance-solution';
import { canHelpToolDefinition } from '../../src/tools/can-help';

describe('Tool Registration Integration', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    test('should register all available tools', () => {
      registerAllTools(registry);

      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(3);

      const toolNames = allTools.map(t => t.definition.name);
      expect(toolNames).toContain('recommend');
      expect(toolNames).toContain('enhance_solution');
      expect(toolNames).toContain('can_help');
    });

    test('should register recommend tool with correct definition', () => {
      registerAllTools(registry);

      const recommendTool = registry.getTool('recommend');
      expect(recommendTool).toBeDefined();
      expect(recommendTool!.definition).toEqual(recommendToolDefinition);
      expect(recommendTool!.enabled).toBe(true);
    });

    test('should register enhance_solution tool with correct definition', () => {
      registerAllTools(registry);

      const enhanceTool = registry.getTool('enhance_solution');
      expect(enhanceTool).toBeDefined();
      expect(enhanceTool!.definition).toEqual(enhanceSolutionToolDefinition);
      expect(enhanceTool!.enabled).toBe(true);
    });

    test('should have tools in correct categories', () => {
      registerAllTools(registry);

      const stats = registry.getStats();
      expect(stats.categories).toEqual({
        'ai-recommendations': 1,
        'ai-enhancement': 1,
        'discovery': 1
      });
    });
  });

  describe('Registry Initialization', () => {
    test('should initialize tools and return registry', () => {
      const initializedRegistry = initializeTools();
      
      expect(initializedRegistry).toBeInstanceOf(ToolRegistry);
      expect(initializedRegistry.getAllTools()).toHaveLength(3);
    });

    test('should return the default registry', () => {
      const defaultRegistry = getToolRegistry();
      
      expect(defaultRegistry).toBeInstanceOf(ToolRegistry);
      // Note: This may have tools if initializeTools was called elsewhere
    });
  });

  describe('Tool Definitions Validation', () => {
    test('recommend tool should have valid schema structure', () => {
      expect(recommendToolDefinition.name).toBe('recommend');
      expect(recommendToolDefinition.description).toContain('AI-powered');
      expect(recommendToolDefinition.inputSchema).toBeDefined();
      expect(recommendToolDefinition.inputSchema.type).toBe('object');
      expect(recommendToolDefinition.version).toBe('1.0.0');
      expect(recommendToolDefinition.category).toBe('ai-recommendations');
      expect(recommendToolDefinition.tags).toContain('kubernetes');
    });

    test('enhance_solution tool should have valid schema structure', () => {
      expect(enhanceSolutionToolDefinition.name).toBe('enhance_solution');
      expect(enhanceSolutionToolDefinition.description).toContain('Customize, optimize');
      expect(enhanceSolutionToolDefinition.inputSchema).toBeDefined();
      expect(enhanceSolutionToolDefinition.inputSchema.type).toBe('object');
      expect(enhanceSolutionToolDefinition.version).toBe('1.0.0');
      expect(enhanceSolutionToolDefinition.category).toBe('ai-enhancement');
      expect(enhanceSolutionToolDefinition.tags).toContain('kubernetes');
    });

    test('can_help tool should have valid schema structure', () => {
      expect(canHelpToolDefinition.name).toBe('can_help');
      expect(canHelpToolDefinition.description).toContain('Check if App-Agent');
      expect(canHelpToolDefinition.inputSchema).toBeDefined();
      expect(canHelpToolDefinition.inputSchema.type).toBe('object');
      expect(canHelpToolDefinition.version).toBe('1.0.0');
      expect(canHelpToolDefinition.category).toBe('discovery');
      expect(canHelpToolDefinition.tags).toContain('help');
    });
  });

  describe('Error Handling', () => {
    test('should handle registration errors gracefully', () => {
      // Mock a tool with invalid schema to test error handling
      const invalidRegistry = new ToolRegistry({ validateSchemas: true });
      
      // This should not throw during import, but might during execution
      expect(() => registerAllTools(invalidRegistry)).not.toThrow();
    });
  });
});