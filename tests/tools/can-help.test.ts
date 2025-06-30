/**
 * Tests for Can Help Tool
 * 
 * Tests the discovery/routing functionality to determine if App-Agent can help
 */

import { canHelpToolDefinition, canHelpToolHandler } from '../../src/tools/can-help';
import { ToolContext } from '../../src/core/tool-registry';
import { ConsoleLogger } from '../../src/core/error-handling';
import { AppAgent } from '../../src/core';

describe('Can Help Tool', () => {
  let mockContext: ToolContext;
  let mockAppAgent: AppAgent;

  beforeEach(() => {
    mockAppAgent = {
      getAnthropicApiKey: jest.fn().mockReturnValue('test-key')
    } as any;

    mockContext = {
      requestId: 'test-request-123',
      logger: new ConsoleLogger('CanHelpTest'),
      appAgent: mockAppAgent
    };
  });

  describe('Tool Definition', () => {
    test('should have correct basic properties', () => {
      expect(canHelpToolDefinition.name).toBe('can_help');
      expect(canHelpToolDefinition.description).toContain('Check if App-Agent');
      expect(canHelpToolDefinition.category).toBe('discovery');
      expect(canHelpToolDefinition.version).toBe('1.0.0');
    });

    test('should have valid input schema', () => {
      expect(canHelpToolDefinition.inputSchema.type).toBe('object');
      expect(canHelpToolDefinition.inputSchema.properties?.request).toBeDefined();
      expect(canHelpToolDefinition.inputSchema.required).toContain('request');
    });

    test('should include discovery and routing tags', () => {
      expect(canHelpToolDefinition.tags).toContain('help');
      expect(canHelpToolDefinition.tags).toContain('discovery');
      expect(canHelpToolDefinition.tags).toContain('routing');
      expect(canHelpToolDefinition.tags).toContain('deploy');
      expect(canHelpToolDefinition.tags).toContain('create');
    });

    test('should provide workflow guidance in description', () => {
      expect(canHelpToolDefinition.description).toContain('Use this when unsure');
      expect(canHelpToolDefinition.description).toContain('deploying apps');
      expect(canHelpToolDefinition.description).toContain('Kubernetes-related');
    });
  });

  describe('Tool Handler', () => {
    test('should identify deployment requests as helpful', async () => {
      const args = { request: 'deploy a web application' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Yes, App-Agent can help');
      expect(result.content[0].text).toContain('recommend');
    });

    test('should identify database setup requests as helpful', async () => {
      const args = { request: 'setup a MongoDB database' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Yes, App-Agent can help');
    });

    test('should identify container requests as helpful', async () => {
      const args = { request: 'run a docker container' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Yes, App-Agent can help');
    });

    test('should identify app creation requests as helpful', async () => {
      const args = { request: 'create an app' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Yes, App-Agent can help');
    });

    test('should suggest alternatives for non-deployment requests', async () => {
      const args = { request: 'write a poem' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('might not be the best fit');
      expect(result.content[0].text).toContain('App-Agent specializes in');
    });

    test('should suggest alternatives for file editing requests', async () => {
      const args = { request: 'edit a text file' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('might not be the best fit');
    });

    test('should handle edge cases gracefully', async () => {
      const args = { request: '' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBeDefined();
    });

    test('should handle mixed case and variations', async () => {
      const args = { request: 'DEPLOY MY APPLICATION' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Yes, App-Agent can help');
    });

    test('should provide workflow guidance for deployment requests', async () => {
      const args = { request: 'create an app' };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toContain('Recommended Workflow');
      expect(result.content[0].text).toContain('First**, ask the user to describe');
      expect(result.content[0].text).toContain('Then**, use the `recommend` tool');
      expect(result.content[0].text).toContain('What type of application would you like');
      expect(result.content[0].text).toContain('Node.js API with Redis cache');
    });
  });

  describe('Keyword Detection', () => {
    const deploymentKeywords = [
      'deploy', 'create', 'run', 'setup', 'launch', 'build',
      'app', 'application', 'service', 'api', 'database',
      'kubernetes', 'container', 'infrastructure'
    ];

    test.each(deploymentKeywords)('should detect "%s" as deployment-related', async (keyword) => {
      const args = { request: `I want to ${keyword} something` };
      
      const result = await canHelpToolHandler(args, mockContext);
      
      expect(result.content[0].text).toContain('Yes, App-Agent can help');
    });
  });
});