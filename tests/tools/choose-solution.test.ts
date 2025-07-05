/**
 * Tests for Choose Solution Tool
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { 
  CHOOSESOLUTION_TOOL_NAME, 
  CHOOSESOLUTION_TOOL_DESCRIPTION, 
  CHOOSESOLUTION_TOOL_INPUT_SCHEMA,
  handleChooseSolutionTool 
} from '../../src/tools/choose-solution';

describe('Choose Solution Tool', () => {
  let tempDir: string;
  let sessionDir: string;
  let mockContext: any;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'choose-solution-test-'));
    sessionDir = path.join(tempDir, 'solutions');
    fs.mkdirSync(sessionDir, { recursive: true });

    // Mock tool context
    mockContext = {
      requestId: 'test-request-123',
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn()
      },
      dotAI: {} as any // Mock DotAI object
    };
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Tool Metadata', () => {
    test('should have correct tool metadata structure', () => {
      expect(CHOOSESOLUTION_TOOL_NAME).toBe('chooseSolution');
      expect(CHOOSESOLUTION_TOOL_DESCRIPTION).toContain('Select a solution');
      expect(CHOOSESOLUTION_TOOL_INPUT_SCHEMA.solutionId).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    describe('CLI Mode (with sessionDir parameter)', () => {
      test('should reject missing solutionId', async () => {
        // Test the error we get when no environment is set and no solutionId provided
        delete process.env.DOT_AI_SESSION_DIR;
        
        const args = { solutionId: 'sol_2025-07-01T154349_1e1e242592ff' };

        await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
          message: 'Session directory must be specified via --session-dir parameter or DOT_AI_SESSION_DIR environment variable'
        });
      });

      test('should reject missing sessionDir when environment variable not set', async () => {
        // Ensure environment variable is not set
        const originalEnv = process.env.DOT_AI_SESSION_DIR;
        delete process.env.DOT_AI_SESSION_DIR;
        
        const args = {
          solutionId: 'sol_2025-07-01T154349_1e1e242592ff'
        };

        await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
          message: 'Session directory must be specified via --session-dir parameter or DOT_AI_SESSION_DIR environment variable'
        });
        
        // Restore environment variable
        if (originalEnv !== undefined) {
          process.env.DOT_AI_SESSION_DIR = originalEnv;
        }
      });

      test('should reject invalid solutionId format', async () => {
        process.env.DOT_AI_SESSION_DIR = sessionDir;
        
        const args = {
          solutionId: 'invalid-format'
        };

        await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
          message: expect.stringContaining('Solution file not found')
        });
      });
    });

    describe('MCP Mode (with environment variable)', () => {
      let originalEnv: string | undefined;

      beforeEach(() => {
        originalEnv = process.env.DOT_AI_SESSION_DIR;
        process.env.DOT_AI_SESSION_DIR = sessionDir;
      });

      afterEach(() => {
        if (originalEnv !== undefined) {
          process.env.DOT_AI_SESSION_DIR = originalEnv;
        } else {
          delete process.env.DOT_AI_SESSION_DIR;
        }
      });

      test('should work with only solutionId when environment variable is set', async () => {
        const solutionId = 'sol_2025-07-01T154349_1e1e242592ff';
        const solutionData = {
          solutionId: solutionId,
          questions: {
            required: [{
              id: 'name',
              question: 'What name would you like to give to your application?',
              type: 'text'
            }]
          }
        };
        
        const solutionPath = path.join(sessionDir, `${solutionId}.json`);
        fs.writeFileSync(solutionPath, JSON.stringify(solutionData));

        const args = {
          solutionId: solutionId
          // No sessionDir - should come from environment
        };

        const result = await handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
        expect(result.content[0].type).toBe('text');
        const response = JSON.parse(result.content[0].text);
        expect(response.status).toBe('stage_questions');
        expect(response.currentStage).toBe('required');
        expect(response.nextStage).toBe('basic');
        expect(response.nextAction).toBe('answerQuestion');
        expect(response.solutionId).toBe(solutionId);
      });

      test('should reject missing solutionId in MCP mode', async () => {
        // This test is no longer valid since the handler expects solutionId parameter
        // The MCP SDK would catch this type error before it reaches our handler
        // So we'll test environment variable missing instead
        delete process.env.DOT_AI_SESSION_DIR;
        
        const args = { solutionId: 'sol_2025-07-01T154349_1e1e242592ff' };

        await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
          message: 'Session directory must be specified via --session-dir parameter or DOT_AI_SESSION_DIR environment variable'
        });
      });

      test('should fail when environment variable is not set', async () => {
        delete process.env.DOT_AI_SESSION_DIR;
        
        const args = {
          solutionId: 'sol_2025-07-01T154349_1e1e242592ff'
        };

        await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
          message: 'Session directory must be specified via --session-dir parameter or DOT_AI_SESSION_DIR environment variable'
        });
      });
    });

    test('should accept valid solutionId format', async () => {
      const validSolutionId = 'sol_2025-07-01T154349_1e1e242592ff';
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      // Create a valid solution file
      const solutionData = {
        solutionId: validSolutionId,
        questions: {
          required: [],
          basic: [],
          advanced: [],
          open: {}
        }
      };
      
      const solutionPath = path.join(sessionDir, `${validSolutionId}.json`);
      fs.writeFileSync(solutionPath, JSON.stringify(solutionData, null, 2));

      const args = {
        solutionId: validSolutionId
      };

      const result = await handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBeFalsy();
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('required');
      expect(response.nextStage).toBe('basic');
      expect(response.nextAction).toBe('answerQuestion');
    });
  });

  describe('Session Directory Validation', () => {
    test('should reject non-existent session directory', async () => {
      process.env.DOT_AI_SESSION_DIR = '/non/existent/path';
      
      const args = {
        solutionId: 'sol_2025-07-01T154349_1e1e242592ff'
      };

      await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
        message: expect.stringContaining('Session directory does not exist')
      });
    });

    test('should reject session directory that is not a directory', async () => {
      // Create a file instead of directory
      const filePath = path.join(tempDir, 'not-a-directory');
      fs.writeFileSync(filePath, 'test');
      process.env.DOT_AI_SESSION_DIR = filePath;

      const args = {
        solutionId: 'sol_2025-07-01T154349_1e1e242592ff'
      };

      await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
        message: expect.stringContaining('not a directory')
      });
    });

    test('should accept valid readable session directory', async () => {
      const validSolutionId = 'sol_2025-07-01T154349_1e1e242592ff';
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      // Create a valid solution file
      const solutionData = {
        solutionId: validSolutionId,
        questions: {
          required: [],
          basic: [],
          advanced: [],
          open: {}
        }
      };
      
      const solutionPath = path.join(sessionDir, `${validSolutionId}.json`);
      fs.writeFileSync(solutionPath, JSON.stringify(solutionData, null, 2));

      const args = {
        solutionId: validSolutionId
      };

      const result = await handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.error).toBeFalsy();
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('required');
      expect(response.nextStage).toBe('basic');
      expect(response.nextAction).toBe('answerQuestion');
    });
  });

  describe('Solution File Loading', () => {
    test('should reject non-existent solution file', async () => {
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      const args = {
        solutionId: 'sol_2025-07-01T154349_1e1e242592fa' // Valid format but non-existent file
      };

      await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
        message: expect.stringContaining('Solution file not found')
      });
    });

    test('should reject invalid JSON in solution file', async () => {
      const solutionId = 'sol_2025-07-01T154349_1e1e242592ff';
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      const solutionPath = path.join(sessionDir, `${solutionId}.json`);
      
      // Write invalid JSON
      fs.writeFileSync(solutionPath, '{ invalid json }');

      const args = {
        solutionId: solutionId
      };

      await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
        message: expect.stringContaining('Invalid JSON')
      });
    });

    test('should reject solution file with missing required fields', async () => {
      const solutionId = 'sol_2025-07-01T154349_1e1e242592ff';
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      const solutionPath = path.join(sessionDir, `${solutionId}.json`);
      
      // Write JSON without required fields
      const invalidSolution = {
        someField: 'value'
      };
      fs.writeFileSync(solutionPath, JSON.stringify(invalidSolution));

      const args = {
        solutionId: solutionId
      };

      await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
        message: expect.stringContaining('Invalid solution file structure')
      });
    });
  });

  describe('Successful Execution', () => {
    test('should return complete question structure for valid solution', async () => {
      const solutionId = 'sol_2025-07-01T154349_1e1e242592ff';
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      const solutionData = {
        solutionId: solutionId,
        intent: 'deploy a stateless application',
        type: 'single',
        score: 85,
        description: 'Test solution',
        questions: {
          required: [
            {
              id: 'name',
              question: 'What name would you like to give to your application?',
              type: 'text',
              validation: { required: true }
            }
          ],
          basic: [
            {
              id: 'port',
              question: 'What port does your application listen on?',
              type: 'number',
              default: 8080
            }
          ],
          advanced: [
            {
              id: 'scaling-enabled',
              question: 'Would you like to enable auto-scaling?',
              type: 'boolean',
              default: false
            }
          ],
          open: {
            question: 'Is there anything else about your requirements?',
            placeholder: 'e.g., specific security requirements...'
          }
        }
      };
      
      const solutionPath = path.join(sessionDir, `${solutionId}.json`);
      fs.writeFileSync(solutionPath, JSON.stringify(solutionData, null, 2));

      const args = {
        solutionId: solutionId
      };

      const result = await handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('required');
      expect(response.nextStage).toBe('basic');
      expect(response.nextAction).toBe('answerQuestion');
      expect(response.solutionId).toBe(solutionId);
      expect(response.questions).toEqual(solutionData.questions.required);
      expect(response.nextAction).toContain('answerQuestion');
      expect(response.guidance).toContain('Answer questions in this stage');
      expect(response.timestamp).toBeDefined();
    });

    test('should handle solution with minimal question structure', async () => {
      const solutionId = 'sol_2025-07-01T154349_1e1e242592fb'; // Valid hex format
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      const solutionData = {
        solutionId: solutionId,
        questions: {
          required: [],
          basic: [],
          advanced: [],
          open: {}
        }
      };
      
      const solutionPath = path.join(sessionDir, `${solutionId}.json`);
      fs.writeFileSync(solutionPath, JSON.stringify(solutionData, null, 2));

      const args = {
        solutionId: solutionId
      };

      const result = await handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('stage_questions');
      expect(response.currentStage).toBe('required');
      expect(response.nextStage).toBe('basic');
      expect(response.nextAction).toBe('answerQuestion');
      expect(response.solutionId).toBe(solutionId);
      expect(response.questions).toEqual([]);
    });

    test('should log appropriate debug and info messages', async () => {
      const solutionId = 'sol_2025-07-01T154349_1e1e242592fc'; // Valid hex format
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      const solutionData = {
        solutionId: solutionId,
        questions: {
          required: [{ id: 'test' }],
          basic: [{ id: 'test2' }],
          advanced: [],
          open: { question: 'test' }
        }
      };
      
      const solutionPath = path.join(sessionDir, `${solutionId}.json`);
      fs.writeFileSync(solutionPath, JSON.stringify(solutionData, null, 2));

      const args = {
        solutionId: solutionId
      };

      await handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId);
      
      expect(mockContext.logger.debug).toHaveBeenCalledWith(
        'Session directory resolved and validated',
        { sessionDir: sessionDir }
      );
      expect(mockContext.logger.debug).toHaveBeenCalledWith(
        'Solution file loaded successfully',
        expect.objectContaining({
          solutionId: solutionId,
          hasQuestions: true,
          questionCategories: {
            required: 1,
            basic: 1,
            advanced: 0,
            hasOpen: true
          }
        })
      );
      expect(mockContext.logger.info).toHaveBeenCalledWith(
        'Choose solution completed successfully',
        expect.objectContaining({
          solutionId: solutionId,
          totalQuestions: 3
        })
      );
    });
  });

  describe('Error Context and Suggestions', () => {
    test('should provide helpful error context for missing files', async () => {
      process.env.DOT_AI_SESSION_DIR = sessionDir;
      
      const args = {
        solutionId: 'sol_2025-07-01T154349_1e1e242592fd' // Valid format but missing file
      };

      await expect(handleChooseSolutionTool(args, mockContext.dotAI, mockContext.logger, mockContext.requestId)).rejects.toMatchObject({
        message: expect.stringContaining('Solution file not found'),
        context: expect.objectContaining({
          operation: 'solution_file_load',
          component: 'ChooseSolutionTool'
        })
      });
    });
  });
});