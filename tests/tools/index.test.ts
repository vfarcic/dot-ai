/**
 * Tests for Tool Registration System Integration
 * 
 * Tests the tool registration index and integration with actual tools
 */

import { ToolRegistry } from '../../src/core/tool-registry';
import { registerAllTools, getToolRegistry, initializeTools } from '../../src/tools';
import { recommendToolDefinition } from '../../src/tools/recommend';
// import { enhanceSolutionToolDefinition } from '../../src/tools/enhance-solution'; // MOVED TO LEGACY
import { canHelpToolDefinition } from '../../src/tools/can-help';
import { chooseSolutionToolDefinition } from '../../src/tools/choose-solution';
import { answerQuestionToolDefinition } from '../../src/tools/answer-question';
import { generateManifestsToolDefinition } from '../../src/tools/generate-manifests';

describe('Tool Registration Integration', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Tool Registration', () => {
    test('should register all available tools', () => {
      registerAllTools(registry);

      const allTools = registry.getAllTools();
      expect(allTools).toHaveLength(6); // Updated: added chooseSolution, answerQuestion, generateManifests, and deployManifests tools

      const toolNames = allTools.map(t => t.definition.name);
      expect(toolNames).toContain('recommend');
      expect(toolNames).toContain('can_help');
      expect(toolNames).toContain('chooseSolution');
      expect(toolNames).toContain('answerQuestion');
      expect(toolNames).toContain('generateManifests');
      expect(toolNames).toContain('deployManifests');
      // REMOVED: enhance_solution tool check - moved to legacy
    });

    test('should register recommend tool with correct definition', () => {
      registerAllTools(registry);

      const recommendTool = registry.getTool('recommend');
      expect(recommendTool).toBeDefined();
      expect(recommendTool!.definition).toEqual(recommendToolDefinition);
      expect(recommendTool!.enabled).toBe(true);
    });

    // REMOVED: enhance_solution tool registration test - moved to legacy

    test('should have tools in correct categories', () => {
      registerAllTools(registry);

      const stats = registry.getStats();
      expect(stats.categories).toEqual({
        'ai-recommendations': 4,  // recommend + chooseSolution + answerQuestion + generateManifests tools
        'discovery': 1,           // can_help tool
        'deployment': 1           // deployManifests tool
      });
      // REMOVED: solution-enhancement category - moved to legacy
    });
  });

  describe('Registry Initialization', () => {
    test('should initialize tools and return registry', () => {
      const initializedRegistry = initializeTools();
      
      expect(initializedRegistry).toBeInstanceOf(ToolRegistry);
      expect(initializedRegistry.getAllTools()).toHaveLength(6); // Updated: added chooseSolution, answerQuestion, generateManifests, and deployManifests tools
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

    // REMOVED: enhance_solution schema test - moved to legacy

    test('can_help tool should have valid schema structure', () => {
      expect(canHelpToolDefinition.name).toBe('can_help');
      expect(canHelpToolDefinition.description).toContain('Check if App-Agent');
      expect(canHelpToolDefinition.inputSchema).toBeDefined();
      expect(canHelpToolDefinition.inputSchema.type).toBe('object');
      expect(canHelpToolDefinition.version).toBe('1.0.0');
      expect(canHelpToolDefinition.category).toBe('discovery');
      expect(canHelpToolDefinition.tags).toContain('help');
    });

    test('chooseSolution tool should have valid schema structure', () => {
      expect(chooseSolutionToolDefinition.name).toBe('chooseSolution');
      expect(chooseSolutionToolDefinition.description).toContain('Select a solution');
      expect(chooseSolutionToolDefinition.inputSchema).toBeDefined();
      expect(chooseSolutionToolDefinition.inputSchema.type).toBe('object');
      expect(chooseSolutionToolDefinition.version).toBe('1.0.0');
      expect(chooseSolutionToolDefinition.category).toBe('ai-recommendations');
      expect(chooseSolutionToolDefinition.tags).toContain('kubernetes');
    });

    test('answerQuestion tool should have valid schema structure', () => {
      expect(answerQuestionToolDefinition.name).toBe('answerQuestion');
      expect(answerQuestionToolDefinition.description).toContain('Process user answers');
      expect(answerQuestionToolDefinition.inputSchema).toBeDefined();
      expect(answerQuestionToolDefinition.inputSchema.type).toBe('object');
      expect(answerQuestionToolDefinition.version).toBe('1.0.0');
      expect(answerQuestionToolDefinition.category).toBe('ai-recommendations');
      expect(answerQuestionToolDefinition.tags).toContain('kubernetes');
      expect(answerQuestionToolDefinition.inputSchema.required).toContain('solutionId');
      expect(answerQuestionToolDefinition.inputSchema.required).toContain('answers');
    });

    test('generateManifests tool should have valid schema structure', () => {
      expect(generateManifestsToolDefinition.name).toBe('generateManifests');
      expect(generateManifestsToolDefinition.description).toContain('Generate final Kubernetes manifests');
      expect(generateManifestsToolDefinition.inputSchema).toBeDefined();
      expect(generateManifestsToolDefinition.inputSchema.type).toBe('object');
      expect(generateManifestsToolDefinition.version).toBe('1.0.0');
      expect(generateManifestsToolDefinition.category).toBe('ai-recommendations');
      expect(generateManifestsToolDefinition.tags).toContain('kubernetes');
      expect(generateManifestsToolDefinition.tags).toContain('manifests');
      expect(generateManifestsToolDefinition.tags).toContain('ai');
      expect(generateManifestsToolDefinition.inputSchema.required).toContain('solutionId');
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