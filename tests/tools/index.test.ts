/**
 * Tests for Tool Metadata and Integration
 * 
 * Tests the tool metadata exports and their availability
 */

import { 
  RECOMMEND_TOOL_NAME, 
  RECOMMEND_TOOL_DESCRIPTION, 
  RECOMMEND_TOOL_INPUT_SCHEMA,
  handleRecommendTool 
} from '../../src/tools/recommend';

import { 
  CHOOSESOLUTION_TOOL_NAME, 
  CHOOSESOLUTION_TOOL_DESCRIPTION, 
  CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
  handleChooseSolutionTool 
} from '../../src/tools/choose-solution';

import { 
  ANSWERQUESTION_TOOL_NAME, 
  ANSWERQUESTION_TOOL_DESCRIPTION, 
  ANSWERQUESTION_TOOL_INPUT_SCHEMA,
  handleAnswerQuestionTool 
} from '../../src/tools/answer-question';

import { 
  GENERATEMANIFESTS_TOOL_NAME, 
  GENERATEMANIFESTS_TOOL_DESCRIPTION, 
  GENERATEMANIFESTS_TOOL_INPUT_SCHEMA,
  handleGenerateManifestsTool 
} from '../../src/tools/generate-manifests';

import { 
  DEPLOYMANIFESTS_TOOL_NAME, 
  DEPLOYMANIFESTS_TOOL_DESCRIPTION, 
  DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA,
  handleDeployManifestsTool 
} from '../../src/tools/deploy-manifests';

describe('Tool Integration', () => {

  describe('Tool Metadata Availability', () => {
    test('should have all required tool metadata available', () => {
      const toolNames = [
        RECOMMEND_TOOL_NAME,
        CHOOSESOLUTION_TOOL_NAME,
        ANSWERQUESTION_TOOL_NAME,
        GENERATEMANIFESTS_TOOL_NAME,
        DEPLOYMANIFESTS_TOOL_NAME
      ];

      expect(toolNames).toHaveLength(5);
      expect(toolNames).toContain('recommend');
      expect(toolNames).toContain('chooseSolution');
      expect(toolNames).toContain('answerQuestion');
      expect(toolNames).toContain('generateManifests');
      expect(toolNames).toContain('deployManifests');
    });

    test('should have all tool handlers available', () => {
      const handlers = [
        handleRecommendTool,
        handleChooseSolutionTool,
        handleAnswerQuestionTool,
        handleGenerateManifestsTool,
        handleDeployManifestsTool
      ];

      handlers.forEach(handler => {
        expect(typeof handler).toBe('function');
      });
    });
  });

  describe('Tool Metadata Structure', () => {
    test('recommend tool should have valid metadata', () => {
      expect(RECOMMEND_TOOL_NAME).toBe('recommend');
      expect(RECOMMEND_TOOL_DESCRIPTION).toContain('Deploy, create, run, or setup applications');
      expect(RECOMMEND_TOOL_INPUT_SCHEMA.intent).toBeDefined();
    });

    test('chooseSolution tool should have valid metadata', () => {
      expect(CHOOSESOLUTION_TOOL_NAME).toBe('chooseSolution');
      expect(CHOOSESOLUTION_TOOL_DESCRIPTION).toContain('Select a solution');
      expect(CHOOSESOLUTION_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
    });

    test('answerQuestion tool should have valid metadata', () => {
      expect(ANSWERQUESTION_TOOL_NAME).toBe('answerQuestion');
      expect(ANSWERQUESTION_TOOL_DESCRIPTION).toContain('Process user answers');
      expect(ANSWERQUESTION_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
      expect(ANSWERQUESTION_TOOL_INPUT_SCHEMA.stage).toBeDefined();
      expect(ANSWERQUESTION_TOOL_INPUT_SCHEMA.answers).toBeDefined();
    });

    test('generateManifests tool should have valid metadata', () => {
      expect(GENERATEMANIFESTS_TOOL_NAME).toBe('generateManifests');
      expect(GENERATEMANIFESTS_TOOL_DESCRIPTION).toContain('Generate final Kubernetes manifests');
      expect(GENERATEMANIFESTS_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
    });

    test('deployManifests tool should have valid metadata', () => {
      expect(DEPLOYMANIFESTS_TOOL_NAME).toBe('deployManifests');
      expect(DEPLOYMANIFESTS_TOOL_DESCRIPTION).toContain('Deploy Kubernetes manifests');
      expect(DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
      expect(DEPLOYMANIFESTS_TOOL_INPUT_SCHEMA.timeout).toBeDefined();
    });
  });
});