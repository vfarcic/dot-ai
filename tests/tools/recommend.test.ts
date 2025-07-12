/**
 * Tests for Recommend Tool
 * 
 * Tests the workflow guidance improvements for the recommend tool
 */

import { 
  RECOMMEND_TOOL_NAME, 
  RECOMMEND_TOOL_DESCRIPTION, 
  RECOMMEND_TOOL_INPUT_SCHEMA,
  handleRecommendTool 
} from '../../src/tools/recommend';
import { DotAI } from '../../src/core';
import { ResourceRecommender } from '../../src/core/schema';

// Mock dependencies
jest.mock('../../src/core');
jest.mock('../../src/core/schema');
jest.mock('../../src/core/error-handling');
jest.mock('../../src/core/claude');

describe('Recommend Tool', () => {
  describe('Tool Metadata', () => {
    test('should have essential properties only', () => {
      expect(RECOMMEND_TOOL_NAME).toBe('recommend');
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Deploy, create, run, or setup applications');
      expect(RECOMMEND_TOOL_INPUT_SCHEMA).toBeDefined();
    });

    test('should have concise user-facing description', () => {
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Deploy, create, run, or setup applications');
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Ask the user to describe their application first');
      expect(RECOMMEND_TOOL_DESCRIPTION.length).toBeLessThan(200); // Should be concise
    });

    test('should have valid input schema', () => {
      expect(RECOMMEND_TOOL_INPUT_SCHEMA.intent).toBeDefined();
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
      expect(sourceCode).toContain('return await dotAI.discovery.discoverResources();');
      
      // Verify the function is passed to findBestSolutions (not raw data)
      expect(sourceCode).toContain('discoverResourcesFn,');
      expect(sourceCode).toContain('explainResourceFn');
      
      // Verify we're not passing raw data anymore (the old broken pattern)
      expect(sourceCode).not.toContain('await dotAI.discovery.discoverResources(),');
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
      expect(mcpCode).not.toContain('const availableResources = await dotAI.discovery.discoverResources();');
    });
  });

  describe('Response Structure Validation', () => {
    test('should include updated guidance text to prevent automatic solution selection', () => {
      // Read the source code to verify guidance text
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify the updated guidance text is present
      expect(sourceCode).toContain('🔴 CRITICAL: You MUST present these solutions to the user and ask them to choose');
      expect(sourceCode).toContain('DO NOT automatically call chooseSolution() without user input');
      expect(sourceCode).toContain('Stop here and wait for user selection');
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