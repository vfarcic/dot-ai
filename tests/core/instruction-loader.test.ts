/**
 * Tests for Instruction Loader
 * 
 * Tests loading detailed agent instructions from markdown files
 */

import { InstructionLoader } from '../../src/core/instruction-loader';

describe('InstructionLoader', () => {
  beforeEach(() => {
    // Clear cache before each test
    InstructionLoader.clearCache();
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

    test('should throw error for missing instruction file', () => {
      expect(() => {
        InstructionLoader.loadInstructions('nonexistent-tool');
      }).toThrow('Missing instruction file for tool \'nonexistent-tool\': prompts/tool-instructions/nonexistent-tool.md');
    });

    test('should cache instructions for performance', () => {
      const first = InstructionLoader.loadInstructions('recommend');
      const second = InstructionLoader.loadInstructions('recommend');
      
      expect(first).toBe(second);
      
      const stats = InstructionLoader.getCacheStats();
      expect(stats.instructions.size).toBe(1);
      expect(stats.instructions.keys).toContain('recommend');
    });
  });

  describe('clearCache', () => {
    test('should clear instruction cache', () => {
      InstructionLoader.loadInstructions('recommend');
      
      let stats = InstructionLoader.getCacheStats();
      expect(stats.instructions.size).toBe(1);
      
      InstructionLoader.clearCache();
      
      stats = InstructionLoader.getCacheStats();
      expect(stats.instructions.size).toBe(0);
    });
  });
});