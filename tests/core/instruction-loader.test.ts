/**
 * Tests for Instruction Loader
 * 
 * Tests the separation of user-facing descriptions and detailed agent instructions
 */

import { InstructionLoader } from '../../src/core/instruction-loader';

describe('InstructionLoader', () => {
  beforeEach(() => {
    // Clear cache before each test
    InstructionLoader.clearCache();
  });

  describe('loadDescription', () => {
    test('should return concise description for recommend tool', () => {
      const description = InstructionLoader.loadDescription('recommend');
      
      expect(description).toContain('Deploy, create, run, or setup applications');
      expect(description).toContain('Ask the user to describe their application first');
      expect(description.length).toBeLessThan(200); // Should be concise
      expect(description).not.toContain('MANDATORY USER INTERACTION REQUIRED'); // Not verbose
    });

    test('should return concise description for enhance_solution tool', () => {
      const description = InstructionLoader.loadDescription('enhance_solution');
      
      expect(description).toContain('Customize, optimize, modify, or enhance');
      expect(description).toContain('AI-powered improvements');
      expect(description.length).toBeLessThan(200); // Should be concise
    });

    test('should return concise description for can_help tool', () => {
      const description = InstructionLoader.loadDescription('can_help');
      
      expect(description).toContain('Check if App-Agent can help');
      expect(description).toContain('deployment, application creation, or infrastructure');
      expect(description.length).toBeLessThan(200); // Should be concise
    });

    test('should return fallback description for unknown tool', () => {
      const description = InstructionLoader.loadDescription('unknown_tool');
      
      expect(description).toContain('unknown_tool tool');
      expect(description).toContain('describe your requirements');
    });

    test('should cache descriptions', () => {
      const first = InstructionLoader.loadDescription('recommend');
      const second = InstructionLoader.loadDescription('recommend');
      
      expect(first).toBe(second); // Should be same reference (cached)
      
      const stats = InstructionLoader.getCacheStats();
      expect(stats.descriptions.size).toBe(1);
      expect(stats.descriptions.keys).toContain('recommend');
    });
  });

  describe('loadInstructions', () => {
    test('should return detailed instructions for recommend tool', () => {
      const instructions = InstructionLoader.loadInstructions('recommend');
      
      expect(instructions).toContain('MANDATORY USER INTERACTION REQUIRED');
      expect(instructions).toContain('What type of application do you want to deploy');
      expect(instructions).toContain('Node.js REST API with PostgreSQL database');
      expect(instructions.length).toBeGreaterThan(500); // Should be detailed
    });

    test('should return detailed instructions for enhance-solution tool', () => {
      const instructions = InstructionLoader.loadInstructions('enhance-solution');
      
      expect(instructions).toContain('Solution Enhancement with AI');
      expect(instructions).toContain('solution_data parameter must be a JSON string');
      expect(instructions.length).toBeGreaterThan(300); // Should be detailed
    });

    test('should return detailed instructions for can-help tool', () => {
      const instructions = InstructionLoader.loadInstructions('can-help');
      
      expect(instructions).toContain('Check if App-Agent Can Help');
      expect(instructions).toContain('WHEN TO USE THIS TOOL');
      expect(instructions.length).toBeGreaterThan(300); // Should be detailed
    });

    test('should throw error for missing instruction file', () => {
      expect(() => {
        InstructionLoader.loadInstructions('nonexistent-tool');
      }).toThrow('Missing instruction file for tool \'nonexistent-tool\': prompts/tool-instructions/nonexistent-tool.md');
    });

    test('should cache instructions separately from descriptions', () => {
      const instructions = InstructionLoader.loadInstructions('recommend');
      const description = InstructionLoader.loadDescription('recommend');
      
      expect(instructions).not.toBe(description); // Should be different content
      
      const stats = InstructionLoader.getCacheStats();
      expect(stats.instructions.size).toBe(1);
      expect(stats.descriptions.size).toBe(1);
      expect(stats.instructions.keys).toContain('recommend');
      expect(stats.descriptions.keys).toContain('recommend');
    });
  });

  describe('clearCache', () => {
    test('should clear both instruction and description caches', () => {
      InstructionLoader.loadInstructions('recommend');
      InstructionLoader.loadDescription('recommend');
      
      let stats = InstructionLoader.getCacheStats();
      expect(stats.instructions.size).toBe(1);
      expect(stats.descriptions.size).toBe(1);
      
      InstructionLoader.clearCache();
      
      stats = InstructionLoader.getCacheStats();
      expect(stats.instructions.size).toBe(0);
      expect(stats.descriptions.size).toBe(0);
    });
  });
});