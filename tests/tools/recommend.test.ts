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
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Deploy, create, setup, install, or run applications, infrastructure, and services');
      expect(RECOMMEND_TOOL_INPUT_SCHEMA).toBeDefined();
    });

    test('should have concise user-facing description', () => {
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Deploy, create, setup, install, or run applications, infrastructure, and services');
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Describe what you want to deploy');
      expect(RECOMMEND_TOOL_DESCRIPTION.length).toBeLessThan(200); // Should be concise
    });

    test('should have valid input schema', () => {
      expect(RECOMMEND_TOOL_INPUT_SCHEMA.intent).toBeDefined();
    });
  });

  describe('Tool Handler - Capability Pre-filtering Implementation', () => {
    test('should verify capability-based approach is implemented', () => {
      // This test verifies that capability pre-filtering is implemented
      // The new approach uses capability search instead of mass resource discovery
      
      // Read the source code to verify the implementation
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify capability-based approach: explainResourceFn is still used for schema fetching
      expect(sourceCode).toContain('explainResourceFn');
      expect(sourceCode).toContain('const explainResourceFn = async (resource: string) => {');
      
      // Verify findBestSolutions is called with the new 2-parameter signature
      expect(sourceCode).toContain('recommender.findBestSolutions(');
      expect(sourceCode).toContain('args.intent,');
      expect(sourceCode).toContain('explainResourceFn');
      
      // Verify we're no longer using discoverResourcesFn (old approach)
      expect(sourceCode).not.toContain('discoverResourcesFn');
      expect(sourceCode).not.toContain('await dotAI.discovery.discoverResources(),');
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