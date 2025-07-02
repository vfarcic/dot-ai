/**
 * Answer Question Tool Tests
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { answerQuestionToolHandler, answerQuestionToolDefinition, answerQuestionCLIDefinition } from '../../src/tools/answer-question';
import { ToolContext } from '../../src/core/tool-registry';

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

const createMockToolContext = (): ToolContext => ({
  requestId: 'test-request-123',
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn()
  },
  appAgent: null
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

describe('Answer Question Tool Definition', () => {
  test('should have correct MCP tool definition', () => {
    expect(answerQuestionToolDefinition.name).toBe('answerQuestion');
    expect(answerQuestionToolDefinition.description).toContain('Process user answers');
    expect(answerQuestionToolDefinition.inputSchema.required).toEqual(['solutionId', 'answers']);
    expect(answerQuestionToolDefinition.inputSchema.properties?.solutionId?.pattern).toBeDefined();
  });

  test('should have correct CLI tool definition', () => {
    expect(answerQuestionCLIDefinition.name).toBe('answerQuestion');
    expect(answerQuestionCLIDefinition.inputSchema.required).toEqual(['solutionId', 'sessionDir', 'answers']);
    expect(answerQuestionCLIDefinition.inputSchema.properties?.sessionDir).toBeDefined();
  });
});

describe('Answer Question Tool Handler', () => {
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
    process.env.APP_AGENT_SESSION_DIR = TEST_SESSION_DIR;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Input Validation', () => {
    test('should validate required parameters for MCP interface', async () => {
      const context = createMockToolContext();
      process.env.APP_AGENT_SESSION_DIR = TEST_SESSION_DIR;
      
      await expect(answerQuestionToolHandler({}, context)).rejects.toMatchObject({
        message: expect.stringContaining('Invalid input parameters')
      });
    });

    test('should validate required parameters for CLI interface', async () => {
      const context = createMockToolContext();
      delete process.env.APP_AGENT_SESSION_DIR; // Force CLI interface
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        answers: {}
        // Missing sessionDir for CLI - should trigger session directory not configured error
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Session directory not configured')
      });
    });

    test('should validate solution ID format', async () => {
      const context = createMockToolContext();
      delete process.env.APP_AGENT_SESSION_DIR; // Force CLI interface for explicit sessionDir
      
      await expect(answerQuestionToolHandler({
        solutionId: 'invalid-format',
        sessionDir: TEST_SESSION_DIR,
        answers: {}
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Invalid input parameters')
      });
    });

    test('should validate session directory exists', async () => {
      const context = createMockToolContext();
      mockFs.existsSync.mockReturnValue(false);
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {}
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Session directory does not exist')
      });
    });

    test('should validate solution file exists', async () => {
      const context = createMockToolContext();
      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === TEST_SESSION_DIR; // Directory exists, but not solution file
      });
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {}
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Solution file not found')
      });
    });
  });

  describe('Answer Validation', () => {
    test('should validate required answers', async () => {
      const context = createMockToolContext();
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: '', // Empty required field
          port: 8080
        }
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Answer validation failed')
      });
    });

    test('should validate answer types', async () => {
      const context = createMockToolContext();
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app',
          port: 'not-a-number' // Invalid type
        }
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Answer validation failed')
      });
    });

    test('should validate pattern constraints', async () => {
      const context = createMockToolContext();
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'My App!', // Invalid pattern (uppercase, space, exclamation)
          port: 8080
        }
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Answer validation failed')
      });
    });

    test('should validate range constraints', async () => {
      const context = createMockToolContext();
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app',
          port: 99999 // Above max range
        }
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Answer validation failed')
      });
    });

    test('should accept valid answers', async () => {
      const context = createMockToolContext();
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app',
          port: 8080
        }
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('group_questions');
      expect(response.solutionId).toBe(TEST_SOLUTION_ID);
    });
  });

  describe('Question Flow Logic', () => {
    test('should return open question on first call', async () => {
      const context = createMockToolContext();
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {}
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('group_questions');
      expect(response.questions || response.open).toBeDefined();
      expect(response.currentGroup).toBeDefined();
    });

    test('should show open question after only required questions are answered', async () => {
      const context = createMockToolContext();
      const solutionWithPartialAnswers = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080  // Both required questions answered, but basic/advanced remain
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithPartialAnswers));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {}
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('group_questions');
      expect(response.currentGroup).toBeDefined();
      expect(response.progress).toBeDefined();
      expect(response.message).toBeDefined();
      expect(response.guidance).toBeDefined();
    });

    test('should return remaining questions on subsequent calls', async () => {
      const context = createMockToolContext();
      const solutionWithSomeAnswers = createSolutionWithAnswers({
        name: 'my-app'
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithSomeAnswers));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          port: 8080
        }
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('group_questions');
      expect(response.currentGroup).toBeDefined();
      expect(response.questions).toBeDefined();
    });

    test('should return only open question when all structured questions answered', async () => {
      const context = createMockToolContext();
      const solutionWithAllAnswers = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080,
        replicas: 3,
        'scaling-enabled': false
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithAllAnswers));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {}
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('group_questions');
      expect(response.currentGroup).toBe('open');
      expect(response.open || response.questions).toBeDefined();
      expect(response.message).toBeDefined();
    });
  });

  describe('Completion Flow', () => {
    test('should return validation error when skipping required questions', async () => {
      const context = createMockToolContext();
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          replicas: 3,  // Trying to answer basic question without required questions
          open: 'N/A'
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('validation_error');
      expect(response.error).toContain('Must complete required questions before proceeding');
      expect(response.currentStage).toBe('required');
      expect(response.nextStage).toBe('basic');
      expect(response.guidance).toContain('Answer at least one required question');
    });

    test('should return validation error when skipping basic questions for advanced', async () => {
      const context = createMockToolContext();
      
      // First answer required questions
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app'
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          'scaling-enabled': true,  // Trying to answer advanced question without basic questions
          open: 'N/A'
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('validation_error');
      expect(response.error).toContain('Must address basic questions before proceeding to advanced');
      expect(response.currentStage).toBe('basic');
      expect(response.nextStage).toBe('advanced');
      expect(response.guidance).toContain('Answer at least one basic question');
    });

    test('should return validation error when done=true without addressing required questions', async () => {
      const context = createMockToolContext();
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'N/A'  // Trying to complete without required questions
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('validation_error');
      expect(response.error).toContain('Required questions must be addressed before completion');
      expect(response.currentStage).toBe('required');
      expect(response.nextStage).toBe('basic');
      expect(response.guidance).toContain('Answer at least one required question');
    });

    test('should allow completion when done=true with N/A for basic questions', async () => {
      const context = createMockToolContext();
      
      // Solution with answered required questions
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app'
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'N/A'  // Explicit skip - should allow completion with defaults
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.solutionData).toBeDefined();
    });

    test('should allow completion when done=true with N/A for advanced questions', async () => {
      const context = createMockToolContext();
      
      // Solution with answered required and basic questions
      const solutionWithBasic = createSolutionWithAnswers({
        name: 'my-app',
        replicas: 3
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithBasic));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'N/A'  // Explicit skip - should allow completion with defaults
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.solutionData).toBeDefined();
    });

    test('should allow completion with any open answer after required questions', async () => {
      const context = createMockToolContext();
      
      // Solution with answered required questions only
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app'
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'I need SSL certificates'  // Real requirement - should allow completion
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.solutionData).toBeDefined();
    });

    test('should allow completion with open answer even when skipping optional groups', async () => {
      const context = createMockToolContext();
      
      // Solution with answered required and basic questions
      const solutionWithBasic = createSolutionWithAnswers({
        name: 'my-app',
        replicas: 3
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithBasic));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'I need monitoring setup'  // Real requirement - should allow completion
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.solutionData).toBeDefined();
    });

    test('should return validation error with questions when done=true but no open answer', async () => {
      const context = createMockToolContext();
      
      // Solution with all groups answered
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',
        replicas: 3,
        'scaling-enabled': true
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {},  // No open answer provided
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('validation_error');
      expect(response.error).toContain('Open question must be answered before completion');
      expect(response.questions.open).toBeDefined();
      expect(response.guidance).toContain('Provide an answer to the open question');
      expect(response.currentStage).toBe('open');
      expect(response.nextStage).toBe('completion');
      expect(response.solutionId).toBe(TEST_SOLUTION_ID);
    });

    test('should successfully complete with staged progression', async () => {
      const context = createMockToolContext();
      
      // Solution with all question groups answered
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',      // Required
        replicas: 3,         // Basic
        'scaling-enabled': true        // Advanced
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'N/A'  // Required by staged validation
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.guidance).toContain('Ready to generate');
      expect(response.solutionData).toBeDefined();
      expect(response.solutionData.hasOpenRequirements).toBe(true);  // N/A counts as an open answer
      expect(response.solutionData.userAnswers).toBeDefined();
    });

    test('should complete without open answer when done=true', async () => {
      const context = createMockToolContext();
      
      // Solution with all question groups answered
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',      // Required
        replicas: 3,         // Basic  
        'scaling-enabled': true        // Advanced
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'N/A'  // Required by new validation - use N/A for no additional requirements
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.guidance).toContain('Ready to generate');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.solutionData).toBeDefined();
      expect(response.solutionData.hasOpenRequirements).toBe(true);  // N/A counts as an open answer
      expect(response.solutionData.userAnswers).toBeDefined();
    });

    test('should complete with open answer when done=true', async () => {
      const context = createMockToolContext();
      
      // Solution with all required questions answered to allow completion
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'I need high availability with load balancing'
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.guidance).toContain('Ready to generate');
      expect(response.solutionData).toBeDefined();
      expect(response.solutionData.hasOpenRequirements).toBe(true);
      expect(response.solutionData.userAnswers.open).toBe('I need high availability with load balancing');
    });

    test('should support openResponse as alternative to open', async () => {
      const context = createMockToolContext();
      
      // Solution with required questions answered
      const completeSolution = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(completeSolution));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          openResponse: 'I need Redis caching'
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.solutionData.hasOpenRequirements).toBe(true);
      expect(response.solutionData.userAnswers.open).toBe('I need Redis caching');
    });

    test('should assemble all user answers from all question categories', async () => {
      const context = createMockToolContext();
      
      // Set up solution with answers in different categories
      const solutionWithAnswers = {
        ...TEST_SOLUTION,
        questions: {
          ...TEST_SOLUTION.questions,
          required: [
            {
              id: 'name',
              question: 'App name?',
              type: 'text',
              answer: 'my-app'
            },
            {
              id: 'image',
              question: 'Container image?',
              type: 'text',
              answer: 'nginx:latest'
            }
          ],
          basic: [
            {
              id: 'port',
              question: 'Port?',
              type: 'number',
              answer: 8080
            }
          ],
          advanced: [
            {
              id: 'replicas',
              question: 'Replicas?',
              type: 'number',
              answer: 3
            }
          ]
        }
      };
      
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithAnswers));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'make it scalable'
        },
        done: true
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      // Verify all answers are assembled correctly
      expect(response.solutionData.userAnswers.name).toBe('my-app');
      expect(response.solutionData.userAnswers.image).toBe('nginx:latest');
      expect(response.solutionData.userAnswers.port).toBe(8080);
      expect(response.solutionData.userAnswers.replicas).toBe(3);
      expect(response.solutionData.userAnswers.open).toBe('make it scalable');
      
      // Verify solution metadata is included
      expect(response.solutionData.primaryResources).toBeDefined();
      expect(response.solutionData.type).toBe('single');
      expect(response.solutionData.description).toBeDefined();
    });
  });

  describe('File Operations', () => {
    test('should save answers to solution file', async () => {
      const context = createMockToolContext();
      
      await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app',
          port: 8080
        }
      }, context);
      
      // Verify file write operations
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockFs.renameSync).toHaveBeenCalled();
      
      // Check that atomic file operations were used
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockFs.renameSync).toHaveBeenCalled();
      
      // Check that solution file was eventually written
      const renameCall = mockFs.renameSync.mock.calls[0];
      expect(renameCall[1]).toContain(TEST_SOLUTION_ID);
    });

    test('should handle file write errors gracefully', async () => {
      const context = createMockToolContext();
      
      // Mock writeFileSync to throw on temp file write
      mockFs.writeFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('.tmp')) {
          throw new Error('Disk full');
        }
      });
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app'
        },
        done: true  // Need done=true to trigger saveSolutionFile
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Failed to save solution file')
      });
    });

    test('should clean up temp file on write failure', async () => {
      const context = createMockToolContext();
      
      // Mock writeFileSync to throw on temp file write
      mockFs.writeFileSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string' && filePath.includes('.tmp')) {
          throw new Error('Write failed');
        }
      });
      
      // Mock existsSync to return true for temp file so cleanup is attempted
      mockFs.existsSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string') {
          if (filePath === TEST_SESSION_DIR) return true;
          if (filePath === TEST_SOLUTION_PATH) return true;
          if (filePath.includes('.tmp')) return true; // Temp file exists for cleanup
          return false;
        }
        return false;
      });
      
      try {
        await answerQuestionToolHandler({
          solutionId: TEST_SOLUTION_ID,
          sessionDir: TEST_SESSION_DIR,
          answers: {
            name: 'my-app'
          },
          done: true  // Need done=true to trigger saveSolutionFile
        }, context);
        
        // If we get here, the test should fail because we expected an error
        fail('Expected answerQuestionToolHandler to throw an error');
      } catch (error) {
        // Error was thrown as expected
        expect(error).toBeDefined();
      }
      
      // Should attempt to clean up temp file
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('Environment Configuration', () => {
    test('should use APP_AGENT_SESSION_DIR for MCP interface', async () => {
      const context = createMockToolContext();
      const mcpSessionDir = '/mcp/session/dir';
      process.env.APP_AGENT_SESSION_DIR = mcpSessionDir;
      
      // Update mock to handle MCP session directory
      mockFs.existsSync.mockImplementation((filePath) => {
        if (typeof filePath === 'string') {
          if (filePath === mcpSessionDir) return true;
          if (filePath === path.join(mcpSessionDir, `${TEST_SOLUTION_ID}.json`)) return true;
          return false;
        }
        return false;
      });
      
      await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        answers: {
          name: 'my-app'
        }
      }, context);
      
      // Should have attempted to read from environment directory
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        path.join(mcpSessionDir, `${TEST_SOLUTION_ID}.json`),
        'utf8'
      );
    });

    test('should require sessionDir parameter for CLI interface', async () => {
      const context = createMockToolContext();
      delete process.env.APP_AGENT_SESSION_DIR;
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        answers: {
          name: 'my-app'
        }
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Session directory not configured')
      });
    });
  });

  describe('Response Format', () => {
    test('should include question statistics', async () => {
      const context = createMockToolContext();
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app'
        }
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.progress).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });

    test('should include solutionId for workflow continuity', async () => {
      const context = createMockToolContext();
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app'
        }
      }, context);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.solutionId).toBe(TEST_SOLUTION_ID);
    });
  });

  describe('Unknown Question Handling', () => {
    test('should reject unknown question IDs', async () => {
      const context = createMockToolContext();
      
      await expect(answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          name: 'my-app',
          unknownQuestion: 'some value'
        }
      }, context)).rejects.toMatchObject({
        message: expect.stringContaining('Answer validation failed')
      });
    });
  });

  describe('AI Enhancement Functionality', () => {
    test('should trigger enhancement workflow with done=true and open answer', async () => {
      const context = createMockToolContext();
      
      // Required questions already answered
      const solutionWithRequiredAnswers = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequiredAnswers));

      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'Make it scalable and production-ready'
        },
        done: true
      }, context);

      const response = JSON.parse(result.content[0].text);
      
      // Should reach completion status
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.solutionData.userAnswers).toHaveProperty('open', 'Make it scalable and production-ready');
      expect(response.nextAction).toBe('generateManifests');
      
      // Should log enhancement attempt (even if it fails due to mock limitations)
      expect(context.logger.info).toHaveBeenCalledWith(
        'Starting AI enhancement based on open question',
        expect.objectContaining({
          solutionId: TEST_SOLUTION_ID,
          openAnswer: 'Make it scalable and production-ready'
        })
      );
    });

    test('should process structured answers before AI enhancement attempt', async () => {
      const context = createMockToolContext();
      
      // Solution with required questions answered
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      // Track writeFileSync calls to verify order
      const writeFileCalls: Array<{ path: string; content: string }> = [];
      mockFs.writeFileSync.mockImplementation((filePath, content) => {
        writeFileCalls.push({
          path: filePath as string,
          content: content as string
        });
      });

      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          replicas: 5, // Structured answer
          open: 'Make it production-ready' // Open answer
        },
        done: true
      }, context);

      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.solutionData.userAnswers).toHaveProperty('replicas', 5);
      expect(response.solutionData.userAnswers).toHaveProperty('open', 'Make it production-ready');
      
      // Verify solution was saved at least once (after structured answers)
      expect(writeFileCalls.length).toBeGreaterThanOrEqual(1);
      expect(context.logger.info).toHaveBeenCalledWith(
        'Solution updated with structured answers',
        expect.objectContaining({
          solutionId: TEST_SOLUTION_ID,
          structuredAnswers: ['replicas']
        })
      );
    });

    test('should handle AI enhancement errors gracefully', async () => {
      const context = createMockToolContext();
      
      // Solution with required questions answered
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      
      // Mock prompt file reading to fail (simulating AI service unavailable)
      mockFs.readFileSync.mockImplementation((filePath: any, options?: any): any => {
        if (typeof filePath === 'string' && filePath.includes('resource-analysis.md')) {
          throw new Error('Prompt file not found');
        }
        return JSON.stringify(solutionWithRequired);
      });

      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'Make it production-ready'
        },
        done: true
      }, context);

      const response = JSON.parse(result.content[0].text);
      
      // Should continue with original solution despite AI failure
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.solutionData.userAnswers).toHaveProperty('open', 'Make it production-ready');
      
      // Should log the AI enhancement failure
      expect(context.logger.error).toHaveBeenCalledWith(
        'AI enhancement failed due to service issue, continuing with original solution',
        expect.any(Error)
      );
    });

    test('should save solution with open answer regardless of AI enhancement result', async () => {
      const context = createMockToolContext();
      
      // Mock solution file
      const originalSolution = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(originalSolution));

      // Track what gets written to solution file
      let savedSolution: any;
      mockFs.writeFileSync.mockImplementation((filePath, content) => {
        if (typeof filePath === 'string' && filePath.includes(TEST_SOLUTION_ID) && typeof content === 'string' && content.startsWith('{')) {
          savedSolution = JSON.parse(content);
        }
      });

      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'Add monitoring capabilities'
        },
        done: true
      }, context);

      // Verify the solution was saved with the open answer
      expect(savedSolution).toBeDefined();
      expect(savedSolution.questions.open.answer).toBe('Add monitoring capabilities');
      
      // Verify the response indicates completion and contains the open answer
      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('ready_for_manifest_generation');
      expect(response.solutionData.userAnswers.open).toBe('Add monitoring capabilities');
    });

    test('should include enhancement workflow guidance in completion response', async () => {
      const context = createMockToolContext();
      
      // Solution with required questions answered
      const solutionWithRequired = createSolutionWithAnswers({
        name: 'my-app',
        port: 8080
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(solutionWithRequired));
      
      const result = await answerQuestionToolHandler({
        solutionId: TEST_SOLUTION_ID,
        sessionDir: TEST_SESSION_DIR,
        answers: {
          open: 'Make it highly available'
        },
        done: true
      }, context);

      const response = JSON.parse(result.content[0].text);
      
      expect(response.guidance).toContain('Ready to generate');
      expect(response.nextAction).toBe('generateManifests');
      expect(response.nextAction).toBe('generateManifests');
    });
  });
});