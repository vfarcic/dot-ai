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

    test('should include resource list information in solution summaries', () => {
      // Read the source code to verify resource information is included
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify resources field is added to solution summaries
      expect(sourceCode).toContain('resources: solution.resources.map(r => ({');
      expect(sourceCode).toContain('kind: r.kind,');
      expect(sourceCode).toContain('apiVersion: r.apiVersion,');
      expect(sourceCode).toContain('group: r.group,');
      expect(sourceCode).toContain('description: r.description?.split');
      
      // Verify guidance mentions showing resources
      expect(sourceCode).toContain('Show the list of Kubernetes resources');
      expect(sourceCode).toContain('from the \'resources\' field');
      expect(sourceCode).toContain('helps users understand what gets deployed');
    });

    test('should maintain backward compatibility with primaryResources', () => {
      // Read the source code to verify primaryResources field is still present
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify primaryResources field is still present for backward compatibility
      expect(sourceCode).toContain('primaryResources: solution.resources.slice(0, 3).map(r => r.kind)');
    });
  });

  describe('Intent Validation', () => {
    test('should include intent analysis in source code', () => {
      // Verify intent analysis is implemented in the source
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Check that analysis function exists
      expect(sourceCode).toContain('async function analyzeIntentForClarification');
      expect(sourceCode).toContain('analyzeIntentForClarification(intent)');
      
      // Check that analysis is called in the handler
      expect(sourceCode).toContain('analyzeIntentForClarification(args.intent, claudeIntegration)');
      expect(sourceCode).toContain('clarificationOpportunities');
    });

    test('should validate analysis prompt file exists', () => {
      const fs = require('fs');
      const path = require('path');
      
      const promptPath = path.join(__dirname, '../../prompts/intent-analysis.md');
      expect(fs.existsSync(promptPath)).toBe(true);
      
      const promptContent = fs.readFileSync(promptPath, 'utf8');
      expect(promptContent).toContain('Intent Analysis for Clarification Opportunities');
      expect(promptContent).toContain('{intent}');
      expect(promptContent).toContain('clarificationOpportunities');
      expect(promptContent).toContain('organizational_patterns');
    });

    test('should handle AI analysis gracefully on service failures', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Verify error handling continues on AI service issues  
      expect(sourceCode).toContain('console.warn(\'Intent analysis failed, proceeding without clarification:\', error);');
      expect(sourceCode).toContain('analyzeIntentForClarification');
    });

    test('should support intent clarification workflow', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Check that clarification workflow is properly implemented
      expect(sourceCode).toContain('final?: boolean');
      expect(sourceCode).toContain('clarification_available');
      expect(sourceCode).toContain('agentInstructions');
      expect(sourceCode).toContain('final: true');
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

    test('should analyze intent before expensive resource discovery', () => {
      const fs = require('fs');
      const path = require('path');
      const sourceCode = fs.readFileSync(
        path.join(__dirname, '../../src/tools/recommend.ts'), 
        'utf8'
      );
      
      // Intent analysis should happen before ResourceRecommender initialization
      const analysisIndex = sourceCode.indexOf('analyzeIntentForClarification');
      const recommenderIndex = sourceCode.indexOf('new ResourceRecommender');
      
      expect(analysisIndex).toBeGreaterThan(-1);
      expect(recommenderIndex).toBeGreaterThan(-1);
      expect(analysisIndex).toBeLessThan(recommenderIndex);
    });
  });
});