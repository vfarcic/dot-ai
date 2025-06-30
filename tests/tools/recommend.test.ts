/**
 * Tests for Recommend Tool
 * 
 * Tests the workflow guidance improvements for the recommend tool
 */

import { recommendToolDefinition, recommendToolHandler } from '../../src/tools/recommend';
import { ToolContext } from '../../src/tools';
import { AppAgent } from '../../src/core';
import { ResourceRecommender } from '../../src/core/schema';

// Mock dependencies
jest.mock('../../src/core');
jest.mock('../../src/core/schema');
jest.mock('../../src/core/error-handling');

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

  describe('Tool Handler - MCP Connectivity Fix Verification', () => {
    test('should verify the fix: function parameters passed correctly', () => {
      // This test verifies that our MCP connectivity fix is in place
      // The fix changed from passing raw data to passing functions
      
      // Read the source code to verify the fix
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify the fix: discoverResourcesFn should be defined as a function
      expect(sourceCode).toContain('const discoverResourcesFn = async () => {');
      expect(sourceCode).toContain('return await appAgent.discovery.discoverResources();');
      
      // Verify the function is passed to findBestSolutions (not raw data)
      expect(sourceCode).toContain('discoverResourcesFn,');
      expect(sourceCode).toContain('explainResourceFn');
      
      // Verify we're not passing raw data anymore (the old broken pattern)
      expect(sourceCode).not.toContain('await appAgent.discovery.discoverResources(),');
      expect(sourceCode).not.toContain('availableResources,'); // Old variable name
    });
    
    test('should confirm CLI and MCP patterns now match', () => {
      // Verify both CLI and MCP use the same pattern for calling ResourceRecommender
      const fs = require('fs');
      const path = require('path');
      
      const mcpCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      const cliCode = fs.readFileSync(
        path.join(__dirname, '../../src/interfaces/cli.ts'), 
        'utf8'
      );
      
      // Both should use function-based approach
      expect(mcpCode).toContain('const discoverResourcesFn = async () => {');
      expect(cliCode).toContain('findBestSolutions(intent, discoverResourcesFn, explainResourceFn)'); // CLI uses same pattern
      
      // MCP should no longer have the broken pattern
      expect(mcpCode).not.toContain('const availableResources = await appAgent.discovery.discoverResources();');
    });
  });
});