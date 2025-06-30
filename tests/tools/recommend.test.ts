/**
 * Tests for Recommend Tool
 * 
 * Tests the workflow guidance improvements for the recommend tool
 */

import { recommendToolDefinition } from '../../src/tools/recommend';

describe('Recommend Tool', () => {
  describe('Tool Definition', () => {
    test('should have correct basic properties', () => {
      expect(recommendToolDefinition.name).toBe('recommend');
      expect(recommendToolDefinition.description).toContain('Deploy, create, run, or setup applications');
      expect(recommendToolDefinition.category).toBe('ai-recommendations');
      expect(recommendToolDefinition.version).toBe('1.0.0');
    });

    test('should have concise user-facing description', () => {
      expect(recommendToolDefinition.description).toContain('Deploy, create, run, or setup applications');
      expect(recommendToolDefinition.description).toContain('Ask the user to describe their application first');
      expect(recommendToolDefinition.description.length).toBeLessThan(200); // Should be concise
    });

    test('should provide detailed workflow guidance in instructions', () => {
      expect(recommendToolDefinition.instructions).toContain('MANDATORY USER INTERACTION REQUIRED');
      expect(recommendToolDefinition.instructions).toContain('ask the user to describe');
      expect(recommendToolDefinition.instructions).toContain('What type of application do you want to deploy');
      expect(recommendToolDefinition.instructions).toContain('Use their exact description as the "intent" parameter');
    });

    test('should have examples in instructions', () => {
      expect(recommendToolDefinition.instructions).toContain('Node.js REST API');
      expect(recommendToolDefinition.instructions).toContain('React frontend');
      expect(recommendToolDefinition.instructions).toContain('PostgreSQL');
    });

    test('should include relevant tags', () => {
      expect(recommendToolDefinition.tags).toContain('kubernetes');
      expect(recommendToolDefinition.tags).toContain('ai');
      expect(recommendToolDefinition.tags).toContain('deployment');
      expect(recommendToolDefinition.tags).toContain('recommendations');
      expect(recommendToolDefinition.tags).toContain('deploy');
      expect(recommendToolDefinition.tags).toContain('create');
      expect(recommendToolDefinition.tags).toContain('app');
    });

    test('should have valid input schema', () => {
      expect(recommendToolDefinition.inputSchema.type).toBe('object');
      expect(recommendToolDefinition.inputSchema.properties?.intent).toBeDefined();
      expect(recommendToolDefinition.inputSchema.required).toContain('intent');
    });
  });
});