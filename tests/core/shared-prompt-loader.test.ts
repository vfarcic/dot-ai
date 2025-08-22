/**
 * Test suite for shared prompt loader
 * 
 * Tests file-based prompt loading and template variable substitution
 * following CLAUDE.md guidelines for file-based prompts
 */

import { loadPrompt } from '../../src/core/shared-prompt-loader';
import * as fs from 'fs';
import * as path from 'path';

// Create test prompt file for testing
const TEST_PROMPT_CONTENT = `# Test Prompt

Resource: {resourceName}
Definition: {resourceDefinition}
Optional: {optionalVar}

This is a test prompt with variables.`;

const TEST_PROMPT_PATH = path.join(process.cwd(), 'prompts', 'test-prompt.md');

describe('shared-prompt-loader', () => {
  beforeAll(() => {
    // Ensure prompts directory exists
    const promptsDir = path.dirname(TEST_PROMPT_PATH);
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }
    
    // Create test prompt file
    fs.writeFileSync(TEST_PROMPT_PATH, TEST_PROMPT_CONTENT);
  });

  afterAll(() => {
    // Clean up test prompt file
    if (fs.existsSync(TEST_PROMPT_PATH)) {
      fs.unlinkSync(TEST_PROMPT_PATH);
    }
  });

  describe('loadPrompt', () => {
    it('should load prompt file and return content', () => {
      const result = loadPrompt('test-prompt');
      
      expect(result).toContain('# Test Prompt');
      expect(result).toContain('Resource: {resourceName}');
      expect(result).toContain('This is a test prompt with variables.');
    });

    it('should substitute template variables correctly', () => {
      const variables = {
        resourceName: 'MyResource',
        resourceDefinition: 'apiVersion: v1\nkind: Pod',
        optionalVar: 'test-value'
      };
      
      const result = loadPrompt('test-prompt', variables);
      
      expect(result).toContain('Resource: MyResource');
      expect(result).toContain('Definition: apiVersion: v1\nkind: Pod');
      expect(result).toContain('Optional: test-value');
      
      // Ensure variables are fully substituted
      expect(result).not.toContain('{resourceName}');
      expect(result).not.toContain('{resourceDefinition}');
      expect(result).not.toContain('{optionalVar}');
    });

    it('should handle missing variables gracefully', () => {
      const variables = {
        resourceName: 'MyResource'
        // resourceDefinition and optionalVar missing
      };
      
      const result = loadPrompt('test-prompt', variables);
      
      expect(result).toContain('Resource: MyResource');
      // Variables that weren't provided should remain as placeholders
      expect(result).toContain('{resourceDefinition}');
      expect(result).toContain('{optionalVar}');
    });

    it('should handle empty variables object', () => {
      const result = loadPrompt('test-prompt', {});
      
      // All variables should remain as placeholders
      expect(result).toContain('{resourceName}');
      expect(result).toContain('{resourceDefinition}');
      expect(result).toContain('{optionalVar}');
    });

    it('should handle missing variables parameter', () => {
      const result = loadPrompt('test-prompt');
      
      // All variables should remain as placeholders
      expect(result).toContain('{resourceName}');
      expect(result).toContain('{resourceDefinition}');
      expect(result).toContain('{optionalVar}');
    });

    it('should handle non-existent prompt file', () => {
      const result = loadPrompt('non-existent-prompt');
      
      expect(result).toContain('Error loading prompt: non-existent-prompt');
    });

    it('should handle multiple occurrences of same variable', () => {
      // Create test file with repeated variables
      const repeatedVarContent = `{resourceName} is a {resourceName} resource.`;
      const repeatedVarPath = path.join(process.cwd(), 'prompts', 'repeated-var-test.md');
      
      fs.writeFileSync(repeatedVarPath, repeatedVarContent);
      
      try {
        const result = loadPrompt('repeated-var-test', { resourceName: 'TestResource' });
        
        expect(result).toBe('TestResource is a TestResource resource.');
        expect(result).not.toContain('{resourceName}');
      } finally {
        // Clean up
        if (fs.existsSync(repeatedVarPath)) {
          fs.unlinkSync(repeatedVarPath);
        }
      }
    });

    it('should handle special characters in variable values', () => {
      const variables = {
        resourceName: 'Test$pecial-Resource_123',
        resourceDefinition: 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: "test-pod"'
      };
      
      const result = loadPrompt('test-prompt', variables);
      
      expect(result).toContain('Resource: Test$pecial-Resource_123');
      expect(result).toContain('Definition: apiVersion: v1\nkind: Pod\nmetadata:\n  name: "test-pod"');
    });
  });
});