/**
 * Answer Question Tool Tests - Stage-Based Implementation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ANSWERQUESTION_TOOL_NAME, 
  ANSWERQUESTION_TOOL_DESCRIPTION, 
  ANSWERQUESTION_TOOL_INPUT_SCHEMA,
  handleAnswerQuestionTool 
} from '../../src/tools/answer-question';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Test constants
const TEST_SESSION_DIR = '/test/session';
const TEST_SOLUTION_ID = 'sol_2025-01-01T123456_abcdef';
const TEST_SOLUTION_PATH = path.join(TEST_SESSION_DIR, `${TEST_SOLUTION_ID}.json`);

// Test data
const TEST_SOLUTION = {
  solutionId: TEST_SOLUTION_ID,
  intent: 'deploy a web application',
  type: 'single',
  questions: {
    required: [
      {
        id: 'name',
        question: 'What name would you like to give to your application?',
        type: 'text',
        validation: {
          required: true,
          pattern: '^[a-z0-9-]+$',
          message: 'Name must consist of lowercase letters, numbers, and hyphens'
        }
      },
      {
        id: 'port',
        question: 'What port does your application listen on?',
        type: 'number',
        validation: {
          min: 1,
          max: 65535
        }
      }
    ],
    basic: [
      {
        id: 'replicas',
        question: 'How many replicas do you need?',
        type: 'number',
        default: 3,
        validation: {
          min: 1
        }
      }
    ],
    advanced: [
      {
        id: 'scaling-enabled',
        question: 'Enable auto-scaling?',
        type: 'boolean',
        default: false
      }
    ],
    open: {
      question: 'Any additional requirements?',
      placeholder: 'e.g., specific security requirements...'
    }
  }
};

const createMockToolContext = () => ({
  requestId: 'test-request-123',
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn()
  },
  dotAI: {} as any // Mock DotAI object
});

// Helper to create solution with answers
const createSolutionWithAnswers = (answers: Record<string, any> = {}) => {
  const solution = JSON.parse(JSON.stringify(TEST_SOLUTION));
  
  // Apply answers to questions
  const allQuestions = [
    ...solution.questions.required,
    ...solution.questions.basic,
    ...solution.questions.advanced
  ];
  
  for (const [questionId, answer] of Object.entries(answers)) {
    const question = allQuestions.find(q => q.id === questionId);
    if (question) {
      question.answer = answer;
    }
  }
  
  return solution;
};

describe('Answer Question Tool Metadata', () => {
  test('should have correct tool metadata', () => {
    expect(ANSWERQUESTION_TOOL_NAME).toBe('answerQuestion');
    expect(ANSWERQUESTION_TOOL_DESCRIPTION).toContain('Process user answers');
    expect(ANSWERQUESTION_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
    expect(ANSWERQUESTION_TOOL_INPUT_SCHEMA.stage).toBeDefined();
    expect(ANSWERQUESTION_TOOL_INPUT_SCHEMA.answers).toBeDefined();
  });
});

describe('Answer Question Tool Handler - Stage-Based Implementation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default fs mocks - set up for successful operation by default
    mockFs.existsSync.mockImplementation((filePath) => {
      if (typeof filePath === 'string') {
        if (filePath === TEST_SESSION_DIR) return true;
        if (filePath === TEST_SOLUTION_PATH) return true;
        return false;
      }
      return false;
    });
    mockFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.unlinkSync.mockImplementation(() => {});
    mockFs.renameSync.mockImplementation(() => {});
    
    // Default solution file mock
    mockFs.readFileSync.mockReturnValue(JSON.stringify(TEST_SOLUTION));
    
    // Reset environment
    process.env.DOT_AI_SESSION_DIR = TEST_SESSION_DIR;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Stage-Based Workflow Tests - Core validation for new implementation
  describe('Stage-Based Workflow Validation', () => {
    test('should handle required stage correctly', async () => {
      const context = createMockToolContext();
      
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'required',
        answers: {
          name: 'my-app',
          port: 8080  // Both required questions need to be answered
        }
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('basic'); // Should progress to basic stage after completing required
      expect(response.solutionId).toBe(TEST_SOLUTION_ID);
    });

    test('should reject invalid stage transition', async () => {
      const context = createMockToolContext();
      
      // Try to jump directly to advanced stage without completing required
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'advanced',
        answers: {
          'scaling-enabled': true
        }
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stage_error');
      expect(response.error).toBe('invalid_transition');
      expect(response.expected).toBe('required');
      expect(response.received).toBe('advanced');
    });

    test('should handle open stage completion', async () => {
      const context = createMockToolContext();
      
      // Mock solution with all previous stages complete
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080,
        replicas: 3,
        'scaling-enabled': false
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'open',
        answers: {
          open: 'N/A'
        }
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.solutionData.userAnswers).toMatchObject({
        name: 'my-app',
        port: 8080,
        replicas: 3,
        'scaling-enabled': false,
        open: 'N/A'
      });
    });

    test('should validate answers against current stage questions only', async () => {
      const context = createMockToolContext();
      
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'required',
        answers: {
          replicas: 3 // Wrong stage - replicas is basic, not required  
        }
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stage_error');
      expect(response.error).toBe('validation_failed');
      expect(response.validationErrors[0]).toContain("Unknown question ID 'replicas' for stage 'required'");
    });

    test('should include nextAction: answerQuestion for intermediate stages', async () => {
      const context = createMockToolContext();
      
      // Test required stage with some answers
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'required',
        answers: {
          name: 'my-app',
          port: 8080
        }
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('basic');
      expect(response.nextAction).toBe('answerQuestion');
      expect(response.nextAction).not.toBe('generateManifests');
    });

    test('should only mention generateManifests when workflow complete', async () => {
      const context = createMockToolContext();
      
      // Mock solution with all previous stages complete
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080,
        replicas: 3,
        'scaling-enabled': false
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'open',
        answers: {
          open: 'N/A'
        }
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
    });

    test('should advance stage when empty answers provided for basic stage', async () => {
      const context = createMockToolContext();
      
      // Mock solution with required questions answered but basic questions unanswered
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'basic',
        answers: {} // Empty answers = skip stage
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('advanced'); // Should advance to next stage
      expect(response.nextAction).toBe('answerQuestion');
    });

    test('should advance stage when empty answers provided for advanced stage', async () => {
      const context = createMockToolContext();
      
      // Mock solution with required and basic questions answered but advanced questions unanswered
      const solutionWithBasic = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080,
        replicas: 3
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithBasic));
      
      const result = await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'advanced',
        answers: {} // Empty answers = skip stage
      }, context.dotAI, context.logger, context.requestId);

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('open'); // Should advance to open stage
      expect(response.nextAction).toBe('answerQuestion');
    });

    test('should mark skipped questions with null answers', async () => {
      const context = createMockToolContext();
      
      // Mock solution with required questions answered
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      // Capture what gets written to the file
      let savedSolution: any;
      mockFs.writeFileSync.mockImplementation((filePath, data) => {
        if (typeof filePath === 'string' && (filePath === TEST_SOLUTION_PATH || filePath.includes('.tmp'))) {
          if (typeof data === 'string' && data.includes('"solutionId"')) {
            savedSolution = JSON.parse(data);
          }
        }
      });
      
      await handleAnswerQuestionTool({
        solutionId: TEST_SOLUTION_ID,
        stage: 'basic',
        answers: {} // Empty answers = skip stage
      }, context.dotAI, context.logger, context.requestId);

      // Check that writeFileSync was called for the solution file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(TEST_SOLUTION_ID), 
        expect.any(String),
        expect.any(String)
      );
      
      // Verify all basic questions have null answers (marked as skipped)
      expect(savedSolution).toBeDefined();
      for (const question of savedSolution.questions.basic) {
        expect(question.answer).toBe(null);
      }
    });
  });
});