/**
 * Integration Test: Project Setup Tool
 * PRD #177 - Milestone 1: Core Tool Infrastructure
 *
 * Tests the project setup workflow via REST API.
 * Validates discovery, file scanning, and iterative file generation.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Project Setup Tool Integration', () => {
  const integrationTest = new IntegrationTest();

  describe('Project Setup Workflow', () => {
    test('should complete full project setup workflow with file generation', async () => {
      const testId = Date.now();

      // Step 1: Discovery - Get list of files to check
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_${testId}`
      });

      const expectedDiscoveryResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
            filesToCheck: expect.arrayContaining(['README.md']),
            nextStep: 'reportScan',
            instructions: expect.stringContaining('Scan the repository')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(discoveryResponse).toMatchObject(expectedDiscoveryResponse);
      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2a: ReportScan without selectedFiles - Get report
      const reportResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        interaction_id: `report_scan_${testId}`
      });

      const expectedReportResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            existingFiles: [],
            missingFiles: expect.arrayContaining(['README.md']),
            nextStep: 'generateFile',
            instructions: expect.stringContaining('Present this report to the user')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(reportResponse).toMatchObject(expectedReportResponse);

      // Step 2b: ReportScan with selectedFiles - Initialize workflow
      const initWorkflowResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedFiles: ['README.md'],
        interaction_id: `init_workflow_${testId}`
      });

      const expectedInitResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            existingFiles: [],
            missingFiles: expect.arrayContaining(['README.md']),
            nextStep: 'generateFile',
            currentFile: 'README.md',
            questions: expect.arrayContaining([
              expect.objectContaining({
                id: 'projectName',
                question: expect.stringContaining('project name'),
                required: true
              }),
              expect.objectContaining({
                id: 'projectDescription',
                question: expect.stringContaining('project do'),
                required: true
              }),
              expect.objectContaining({
                id: 'licenseName',
                question: expect.stringContaining('license'),
                required: false
              })
            ]),
            instructions: expect.stringContaining('Analyze the repository')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(initWorkflowResponse).toMatchObject(expectedInitResponse);

      // Step 3a: GenerateFile with answers - Generate content
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: 'README.md',
        answers: {
          projectName: `Test Project ${testId}`,
          projectDescription: 'Integration test project for validation',
          licenseName: 'MIT'
        },
        interaction_id: `generate_file_${testId}`
      });

      const expectedGenerateResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            fileName: 'README.md',
            content: expect.stringContaining(`Test Project ${testId}`),
            instructions: expect.stringContaining('Write this content to the file')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(generateResponse).toMatchObject(expectedGenerateResponse);

      // Verify content has interpolated values
      const content = generateResponse.data.result.content;
      expect(content).toContain(`Test Project ${testId}`);
      expect(content).toContain('Integration test project for validation');
      expect(content).toContain('MIT');

      // Step 3b: GenerateFile with completedFileName - Mark done and complete workflow
      const completeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'README.md',
        interaction_id: `complete_${testId}`
      });

      const expectedCompleteResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            fileName: 'README.md',
            content: '',
            instructions: expect.stringContaining('All files generated successfully')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(completeResponse).toMatchObject(expectedCompleteResponse);

      // Verify session file exists with correct structure
      const fs = await import('fs');
      const path = await import('path');
      const sessionPath = path.join(process.cwd(), 'tmp', 'sessions', 'proj-sessions', `${sessionId}.json`);
      expect(fs.existsSync(sessionPath)).toBe(true);

      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(sessionData).toMatchObject({
        sessionId: sessionId,
        data: {
          currentStep: 'complete',
          files: {
            'README.md': {
              status: 'done',
              answers: {
                projectName: `Test Project ${testId}`,
                projectDescription: 'Integration test project for validation',
                licenseName: 'MIT'
              }
            }
          }
        }
      });
    }, 300000);

    test('should handle optional template fields correctly', async () => {
      const testId = Date.now();

      // Create workflow without optional licenseName
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_optional_${testId}`
      });
      const sessionId = discoveryResponse.data.result.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedFiles: ['README.md'],
        interaction_id: `init_optional_${testId}`
      });

      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: 'README.md',
        answers: {
          projectName: `Optional Test ${testId}`,
          projectDescription: 'Testing optional fields'
          // licenseName intentionally omitted
        },
        interaction_id: `generate_optional_${testId}`
      });

      const content = generateResponse.data.result.content;

      // Should have required fields
      expect(content).toContain(`Optional Test ${testId}`);
      expect(content).toContain('Testing optional fields');

      // Optional license section should not appear when licenseName is missing
      expect(content).not.toContain('## License');
    }, 300000);
  });

  describe('Error Handling', () => {
    test('should handle missing sessionId for reportScan', async () => {
      const testId = Date.now();
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        existingFiles: [],
        interaction_id: `error_missing_session_${testId}`
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('sessionId is required')
            }
          },
          tool: 'projectSetup'
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing existingFiles for reportScan', async () => {
      const testId = Date.now();
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId: 'proj-test-invalid',
        interaction_id: `error_missing_files_${testId}`
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('existingFiles is required')
            }
          },
          tool: 'projectSetup'
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle invalid sessionId', async () => {
      const testId = Date.now();
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId: `proj-test-nonexistent-${testId}`,
        existingFiles: [],
        interaction_id: `error_invalid_session_${testId}`
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('Session')
            }
          },
          tool: 'projectSetup'
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing fileName for generateFile', async () => {
      const testId = Date.now();

      // Create a session first
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `error_setup_${testId}`
      });
      const sessionId = discoveryResponse.data.result.sessionId;

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        answers: { projectName: 'Test' },
        interaction_id: `error_missing_filename_${testId}`
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('fileName')
            }
          },
          tool: 'projectSetup'
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing answers for generateFile', async () => {
      const testId = Date.now();

      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `error_setup2_${testId}`
      });
      const sessionId = discoveryResponse.data.result.sessionId;

      await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedFiles: ['README.md'],
        interaction_id: `error_init_${testId}`
      });

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: 'README.md',
        interaction_id: `error_missing_answers_${testId}`
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('answers')
            }
          },
          tool: 'projectSetup'
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });
  });
});
