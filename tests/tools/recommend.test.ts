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
jest.mock('../../src/core/claude');

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

  describe('Intent Validation', () => {
    test('should include intent validation in source code', () => {
      // Verify intent validation is implemented in the source
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Check that validation function exists
      expect(sourceCode).toContain('async function validateIntentWithAI');
      expect(sourceCode).toContain('intent-validation.md');
      
      // Check that validation is called in the handler
      expect(sourceCode).toContain('await validateIntentWithAI(args.intent, claudeIntegration)');
      expect(sourceCode).toContain('Intent needs more specificity');
    });

    test('should validate prompt file exists', () => {
      const fs = require('fs');
      const path = require('path');
      
      const promptPath = path.join(__dirname, '../../prompts/intent-validation.md');
      expect(fs.existsSync(promptPath)).toBe(true);
      
      const promptContent = fs.readFileSync(promptPath, 'utf8');
      expect(promptContent).toContain('Intent Validation for Kubernetes Deployment Recommendations');
      expect(promptContent).toContain('{intent}');
      expect(promptContent).toContain('isSpecific');
      expect(promptContent).toContain('suggestions');
    });

    test('should handle AI validation gracefully on service failures', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify error handling continues on AI service issues  
      expect(sourceCode).toContain('console.warn(\'Intent validation failed, continuing with original intent:\', error);');
      expect(sourceCode).toContain('logger.warn(\'Intent validation failed, continuing with recommendation\'');
    });

    test('should validate proper error structure for vague intents', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Check that validation errors are properly structured
      expect(sourceCode).toContain('ErrorCategory.VALIDATION');
      expect(sourceCode).toContain('ErrorSeverity.MEDIUM');
      expect(sourceCode).toContain('intent_validation');
      expect(sourceCode).toContain('Provide more specific details about your deployment');
    });

    test('should include ClaudeIntegration import', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      expect(sourceCode).toContain('import { ClaudeIntegration } from \'../core/claude\'');
    });

    test('should validate before expensive resource discovery', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Validation should happen before ResourceRecommender initialization
      const validationIndex = sourceCode.indexOf('await validateIntentWithAI');
      const recommenderIndex = sourceCode.indexOf('new ResourceRecommender');
      
      expect(validationIndex).toBeGreaterThan(-1);
      expect(recommenderIndex).toBeGreaterThan(-1);
      expect(validationIndex).toBeLessThan(recommenderIndex);
    });
  });
});