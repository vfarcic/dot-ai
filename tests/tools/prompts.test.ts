/**
 * Tests for MCP Prompts Handler
 */

import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { 
  loadPromptFile, 
  loadAllPrompts, 
  handlePromptsListRequest, 
  handlePromptsGetRequest,
  Prompt 
} from '../../src/tools/prompts';
import { ConsoleLogger } from '../../src/core/error-handling';

describe('MCP Prompts Handler', () => {
  const testPromptsDir = path.join(process.cwd(), 'test-prompts');
  const logger = new ConsoleLogger('PromptsTest');
  
  beforeAll(() => {
    // Create test prompts directory and files
    if (!fs.existsSync(testPromptsDir)) {
      fs.mkdirSync(testPromptsDir);
    }
    
    // Create test prompt file
    const testPromptContent = `---
name: test-prompt
description: A test prompt for unit testing
category: testing
---

# Test Prompt

This is a test prompt content used for unit testing the MCP prompts functionality.

## Instructions

1. Test the prompt loading system
2. Validate YAML frontmatter parsing
3. Ensure proper MCP response format`;

    fs.writeFileSync(path.join(testPromptsDir, 'test-prompt.md'), testPromptContent);
    
    // Create another test prompt
    const testPrompt2Content = `---
name: test-prompt-2
description: A second test prompt
category: development
---

# Second Test Prompt

Another test prompt for validation.`;

    fs.writeFileSync(path.join(testPromptsDir, 'test-prompt-2.md'), testPrompt2Content);
  });
  
  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testPromptsDir)) {
      fs.rmSync(testPromptsDir, { recursive: true });
    }
  });

  describe('loadPromptFile', () => {
    it('should load and parse a prompt file correctly', () => {
      const promptPath = path.join(testPromptsDir, 'test-prompt.md');
      const prompt = loadPromptFile(promptPath);
      
      expect(prompt.name).toBe('test-prompt');
      expect(prompt.description).toBe('A test prompt for unit testing');
      expect(prompt.content).toContain('# Test Prompt');
      expect(prompt.content).toContain('This is a test prompt content');
    });
    
    it('should throw error for invalid file format', () => {
      const invalidPath = path.join(testPromptsDir, 'invalid.md');
      fs.writeFileSync(invalidPath, 'No frontmatter content');
      
      expect(() => loadPromptFile(invalidPath)).toThrow('Invalid prompt file format');
      
      fs.unlinkSync(invalidPath);
    });
    
    it('should throw error for missing metadata', () => {
      const incompletePath = path.join(testPromptsDir, 'incomplete.md');
      const incompleteContent = `---
name: incomplete
---

Content without description`;
      
      fs.writeFileSync(incompletePath, incompleteContent);
      
      expect(() => loadPromptFile(incompletePath)).toThrow('Missing required metadata');
      
      fs.unlinkSync(incompletePath);
    });
  });

  describe('loadAllPrompts', () => {
    it('should load all prompts from directory', () => {
      // Create a temporary isolated directory for this test
      const isolatedTestDir = path.join(testPromptsDir, 'isolated-test');
      if (!fs.existsSync(isolatedTestDir)) {
        fs.mkdirSync(isolatedTestDir);
      }
      
      // Temporarily change working directory for this test
      const originalCwd = process.cwd();
      process.chdir(isolatedTestDir);
      
      // Create shared-prompts directory in isolated location
      const sharedPromptsDir = path.join(isolatedTestDir, 'shared-prompts');
      if (!fs.existsSync(sharedPromptsDir)) {
        fs.mkdirSync(sharedPromptsDir);
      }
      
      // Copy test files to shared-prompts
      fs.copyFileSync(
        path.join(testPromptsDir, 'test-prompt.md'),
        path.join(sharedPromptsDir, 'test-prompt.md')
      );
      fs.copyFileSync(
        path.join(testPromptsDir, 'test-prompt-2.md'),
        path.join(sharedPromptsDir, 'test-prompt-2.md')
      );
      
      const prompts = loadAllPrompts(logger);
      
      expect(prompts).toHaveLength(2);
      expect(prompts.find(p => p.name === 'test-prompt')).toBeDefined();
      expect(prompts.find(p => p.name === 'test-prompt-2')).toBeDefined();
      
      // Clean up
      process.chdir(originalCwd);
      fs.rmSync(isolatedTestDir, { recursive: true });
    });
    
    it('should return empty array when directory does not exist', () => {
      // Create a temporary isolated directory for this test
      const isolatedTestDir = path.join(testPromptsDir, 'no-prompts-test');
      if (!fs.existsSync(isolatedTestDir)) {
        fs.mkdirSync(isolatedTestDir);
      }
      
      const originalCwd = process.cwd();
      process.chdir(isolatedTestDir);
      
      const prompts = loadAllPrompts(logger);
      expect(prompts).toEqual([]);
      
      // Clean up
      process.chdir(originalCwd);
      fs.rmSync(isolatedTestDir, { recursive: true });
    });
  });

  describe('handlePromptsListRequest', () => {
    let originalCwd: string;
    let isolatedTestDir: string;
    let sharedPromptsDir: string;
    
    beforeAll(() => {
      originalCwd = process.cwd();
      isolatedTestDir = path.join(testPromptsDir, 'list-request-test');
      
      if (!fs.existsSync(isolatedTestDir)) {
        fs.mkdirSync(isolatedTestDir);
      }
      
      process.chdir(isolatedTestDir);
      
      sharedPromptsDir = path.join(isolatedTestDir, 'shared-prompts');
      if (!fs.existsSync(sharedPromptsDir)) {
        fs.mkdirSync(sharedPromptsDir);
      }
      
      fs.copyFileSync(
        path.join(testPromptsDir, 'test-prompt.md'),
        path.join(sharedPromptsDir, 'test-prompt.md')
      );
    });
    
    afterAll(() => {
      process.chdir(originalCwd);
      if (fs.existsSync(isolatedTestDir)) {
        fs.rmSync(isolatedTestDir, { recursive: true });
      }
    });
    
    it('should return list of available prompts', async () => {
      const result = await handlePromptsListRequest({}, logger, 'test-req-1');
      
      expect(result).toHaveProperty('prompts');
      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0]).toHaveProperty('name', 'test-prompt');
      expect(result.prompts[0]).toHaveProperty('description', 'A test prompt for unit testing');
    });
  });

  describe('handlePromptsGetRequest', () => {
    let originalCwd: string;
    let isolatedTestDir: string;
    let sharedPromptsDir: string;
    
    beforeAll(() => {
      originalCwd = process.cwd();
      isolatedTestDir = path.join(testPromptsDir, 'get-request-test');
      
      if (!fs.existsSync(isolatedTestDir)) {
        fs.mkdirSync(isolatedTestDir);
      }
      
      process.chdir(isolatedTestDir);
      
      sharedPromptsDir = path.join(isolatedTestDir, 'shared-prompts');
      if (!fs.existsSync(sharedPromptsDir)) {
        fs.mkdirSync(sharedPromptsDir);
      }
      
      fs.copyFileSync(
        path.join(testPromptsDir, 'test-prompt.md'),
        path.join(sharedPromptsDir, 'test-prompt.md')
      );
    });
    
    afterAll(() => {
      process.chdir(originalCwd);
      if (fs.existsSync(isolatedTestDir)) {
        fs.rmSync(isolatedTestDir, { recursive: true });
      }
    });
    
    it('should return specific prompt when found', async () => {
      const result = await handlePromptsGetRequest(
        { name: 'test-prompt' }, 
        logger, 
        'test-req-2'
      );
      
      expect(result).toHaveProperty('description', 'A test prompt for unit testing');
      expect(result).toHaveProperty('messages');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toHaveProperty('role', 'user');
      expect(result.messages[0].content).toHaveProperty('type', 'text');
      expect(result.messages[0].content).toHaveProperty('text');
      expect(result.messages[0].content.text).toContain('# Test Prompt');
    });
    
    it('should throw error when prompt not found', async () => {
      await expect(
        handlePromptsGetRequest({ name: 'nonexistent-prompt' }, logger, 'test-req-3')
      ).rejects.toThrow('Prompt not found: nonexistent-prompt');
    });
    
    it('should throw error when name parameter is missing', async () => {
      await expect(
        handlePromptsGetRequest({}, logger, 'test-req-4')
      ).rejects.toThrow('Missing required parameter: name');
    });
  });

  describe('YAML frontmatter parsing', () => {
    it('should handle various YAML formats correctly', () => {
      const testCases = [
        {
          content: `---
name: simple-test
description: Simple description
category: test
---
Content`,
          expected: {
            name: 'simple-test',
            description: 'Simple description'
          }
        },
        {
          content: `---
name: quoted-test
description: "Description with quotes"
category: test
---
Content`,
          expected: {
            name: 'quoted-test',
            description: 'Description with quotes'
          }
        }
      ];
      
      testCases.forEach((testCase, index) => {
        const testFile = path.join(testPromptsDir, `yaml-test-${index}.md`);
        fs.writeFileSync(testFile, testCase.content);
        
        const prompt = loadPromptFile(testFile);
        expect(prompt.name).toBe(testCase.expected.name);
        expect(prompt.description).toBe(testCase.expected.description);
        
        fs.unlinkSync(testFile);
      });
    });
  });
});