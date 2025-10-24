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
            filesToCheck: expect.arrayContaining(['README.md', 'LICENSE']),
            availableScopes: expect.arrayContaining(['readme', 'legal']),
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
            nextStep: 'generateFile',
            instructions: expect.stringContaining('scope status report')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(reportResponse).toMatchObject(expectedReportResponse);

      // Step 2b: ReportScan with selectedScopes - Initialize workflow with BOTH scopes
      const initWorkflowResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        selectedScopes: ['readme', 'legal'],
        interaction_id: `init_workflow_${testId}`
      });

      const expectedInitResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
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

      // Step 3a: GenerateFile with answers - Generate README.md content
      const generateReadmeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: 'README.md',
        answers: {
          projectName: `Test Project ${testId}`,
          projectDescription: 'Integration test project for validation',
          licenseName: 'MIT'
        },
        interaction_id: `generate_readme_${testId}`
      });

      // Verify README content and nextFile preview for LICENSE
      const expectedReadmeResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            fileName: 'README.md',
            content: expect.stringContaining(`Test Project ${testId}`),
            nextFile: expect.objectContaining({
              fileName: 'LICENSE',
              scope: 'legal',
              questions: expect.arrayContaining([
                expect.objectContaining({
                  id: 'licenseType',
                  question: expect.stringContaining('license type')
                }),
                expect.objectContaining({
                  id: 'year',
                  question: expect.stringContaining('year')
                }),
                expect.objectContaining({
                  id: 'copyrightHolder',
                  question: expect.stringContaining('copyright holder')
                })
              ])
            }),
            instructions: expect.stringContaining('completedFileName')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(generateReadmeResponse).toMatchObject(expectedReadmeResponse);

      // Verify README content
      const readmeContent = generateReadmeResponse.data.result.content;
      expect(readmeContent).toContain(`Test Project ${testId}`);
      expect(readmeContent).toContain('Integration test project for validation');
      expect(readmeContent).toContain('MIT');

      // Step 3b: Use round-trip optimization - Confirm README + provide LICENSE answers
      const generateLicenseResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'README.md',
        nextFileAnswers: {
          licenseType: 'Apache-2.0',
          year: '2025',
          copyrightHolder: 'Test Suite',
          projectName: `Test Project ${testId}`,
          projectDescription: 'Integration test project',
          projectUrl: 'https://example.com'
        },
        interaction_id: `generate_license_${testId}`
      });

      // Verify LICENSE content and nextFile preview for NOTICE
      const expectedLicenseResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            fileName: 'LICENSE',
            content: expect.stringContaining('Apache License'),
            nextFile: expect.objectContaining({
              fileName: 'NOTICE',
              scope: 'legal',
              questions: expect.arrayContaining([
                expect.objectContaining({
                  id: 'projectName'
                })
              ])
            }),
            instructions: expect.stringContaining('completedFileName')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(generateLicenseResponse).toMatchObject(expectedLicenseResponse);

      // Verify LICENSE content
      const licenseContent = generateLicenseResponse.data.result.content;
      expect(licenseContent).toContain('Apache License');
      expect(licenseContent).toContain('2025');
      expect(licenseContent).toContain('Test Suite');

      // Step 3c: Use round-trip optimization again - Confirm LICENSE + provide NOTICE answers
      const generateNoticeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'LICENSE',
        nextFileAnswers: {
          licenseType: 'Apache-2.0',
          year: '2025',
          copyrightHolder: 'Test Suite',
          projectName: `Test Project ${testId}`,
          projectUrl: 'https://example.com'
        },
        interaction_id: `generate_notice_${testId}`
      });

      // Verify NOTICE content and completion
      const expectedNoticeResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            fileName: 'NOTICE',
            content: expect.stringContaining(`Test Project ${testId}`),
            instructions: expect.stringContaining('Write this content')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(generateNoticeResponse).toMatchObject(expectedNoticeResponse);

      // Verify NOTICE content
      const noticeContent = generateNoticeResponse.data.result.content;
      expect(noticeContent).toContain(`Test Project ${testId}`);
      expect(noticeContent).toContain('2025');
      expect(noticeContent).toContain('Test Suite');
      expect(noticeContent).toContain('https://example.com');

      // Step 3d: Complete workflow by confirming NOTICE
      const completeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'NOTICE',
        interaction_id: `complete_${testId}`
      });

      const expectedCompleteResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            fileName: 'NOTICE',
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

      // Verify session file exists with correct structure for all 3 files
      const fs = await import('fs');
      const path = await import('path');
      const sessionPath = path.join(process.cwd(), 'tmp', 'sessions', 'proj-sessions', `${sessionId}.json`);
      expect(fs.existsSync(sessionPath)).toBe(true);

      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(sessionData).toMatchObject({
        sessionId: sessionId,
        data: {
          currentStep: 'complete',
          selectedScopes: ['readme', 'legal'],
          files: {
            'README.md': {
              status: 'done',
              scope: 'readme',
              answers: expect.objectContaining({
                projectName: `Test Project ${testId}`,
                projectDescription: 'Integration test project for validation'
              })
            },
            'LICENSE': {
              status: 'done',
              scope: 'legal',
              answers: expect.objectContaining({
                licenseType: 'Apache-2.0',
                year: '2025',
                copyrightHolder: 'Test Suite'
              })
            },
            'NOTICE': {
              status: 'done',
              scope: 'legal',
              answers: expect.objectContaining({
                projectName: `Test Project ${testId}`,
                year: '2025',
                copyrightHolder: 'Test Suite'
              })
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
        selectedScopes: ['readme'],
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

      // Verify generation succeeded
      expect(generateResponse.data.result).toMatchObject({
        success: true,
        sessionId: sessionId,
        fileName: 'README.md',
        content: expect.stringContaining(`Optional Test ${testId}`)
      });

      const content = generateResponse.data.result.content;

      // Should have required fields
      expect(content).toContain(`Optional Test ${testId}`);
      expect(content).toContain('Testing optional fields');

      // Optional license section should not appear when licenseName is missing
      expect(content).not.toContain('## License');
    }, 300000);

    test('should complete full governance workflow with 6 files', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_governance_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        filesToCheck: expect.arrayContaining(['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/MAINTAINERS.md', 'docs/GOVERNANCE.md', 'docs/ROADMAP.md']),
        availableScopes: expect.arrayContaining(['governance'])
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with governance scope selected
      await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        interaction_id: `report_governance_${testId}`
      });

      const initWorkflowResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        selectedScopes: ['governance'],
        interaction_id: `init_governance_${testId}`
      });

      expect(initWorkflowResponse.data.result).toMatchObject({
        success: true,
        nextStep: 'generateFile',
        currentFile: 'CODE_OF_CONDUCT.md'
      });

      // Step 3: Generate all 6 governance files with shared answers
      const sharedAnswers = {
        projectName: `Governance Test ${testId}`,
        repositoryUrl: 'https://github.com/test/governance-test',
        enforcementEmail: 'conduct@test.com',
        securityEmail: 'security@test.com',
        maintainerEmail: 'maintainers@test.com',
        maintainerName: 'Test Maintainer',
        maintainerGithub: 'testmaintainer',
        setupCommand: 'npm install',
        testCommand: 'npm test',
        lintCommand: 'npm run lint',
        requiresDco: 'yes',
        maintainerPeriod: '6 months',
        inactivityPeriod: '1 year'
      };

      // 3a: Generate CODE_OF_CONDUCT.md
      const conductResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: 'CODE_OF_CONDUCT.md',
        answers: sharedAnswers,
        interaction_id: `generate_conduct_${testId}`
      });

      expect(conductResponse.data.result).toMatchObject({
        success: true,
        fileName: 'CODE_OF_CONDUCT.md',
        content: expect.stringContaining('conduct@test.com'),
        nextFile: expect.objectContaining({
          fileName: 'CONTRIBUTING.md'
        })
      });

      const conductContent = conductResponse.data.result.content;
      expect(conductContent).toContain('Contributor Covenant Code of Conduct');
      expect(conductContent).toContain('conduct@test.com');

      // 3b: Generate CONTRIBUTING.md
      const contributingResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'CODE_OF_CONDUCT.md',
        nextFileAnswers: sharedAnswers,
        interaction_id: `generate_contributing_${testId}`
      });

      expect(contributingResponse.data.result).toMatchObject({
        success: true,
        fileName: 'CONTRIBUTING.md',
        content: expect.stringContaining(`Governance Test ${testId}`)
      });

      const contributingContent = contributingResponse.data.result.content;
      expect(contributingContent).toContain(`Contributing to Governance Test ${testId}`);
      expect(contributingContent).toContain('https://github.com/test/governance-test');
      expect(contributingContent).toContain('npm install');
      expect(contributingContent).toContain('npm test');
      expect(contributingContent).toContain('git commit -s');

      // 3c: Generate SECURITY.md
      const securityResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'CONTRIBUTING.md',
        nextFileAnswers: sharedAnswers,
        interaction_id: `generate_security_${testId}`
      });

      expect(securityResponse.data.result).toMatchObject({
        success: true,
        fileName: 'SECURITY.md',
        content: expect.stringContaining('security@test.com')
      });

      const securityContent = securityResponse.data.result.content;
      expect(securityContent).toContain('Security Policy');
      expect(securityContent).toContain('security@test.com');
      expect(securityContent).toContain(`Governance Test ${testId}`);

      // 3d: Generate docs/MAINTAINERS.md
      const maintainersResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'SECURITY.md',
        nextFileAnswers: sharedAnswers,
        interaction_id: `generate_maintainers_${testId}`
      });

      expect(maintainersResponse.data.result).toMatchObject({
        success: true,
        fileName: 'docs/MAINTAINERS.md',
        content: expect.stringContaining('Test Maintainer')
      });

      const maintainersContent = maintainersResponse.data.result.content;
      expect(maintainersContent).toContain('Test Maintainer');
      expect(maintainersContent).toContain('maintainers@test.com');
      expect(maintainersContent).toContain('@testmaintainer');

      // 3e: Generate docs/GOVERNANCE.md
      const governanceResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'docs/MAINTAINERS.md',
        nextFileAnswers: sharedAnswers,
        interaction_id: `generate_governance_${testId}`
      });

      expect(governanceResponse.data.result).toMatchObject({
        success: true,
        fileName: 'docs/GOVERNANCE.md',
        content: expect.stringContaining('Project Governance')
      });

      const governanceContent = governanceResponse.data.result.content;
      expect(governanceContent).toContain('Project Governance');
      expect(governanceContent).toContain(`Governance Test ${testId}`);
      expect(governanceContent).toContain('6 months');
      expect(governanceContent).toContain('1 year');

      // 3f: Generate docs/ROADMAP.md (final file)
      const roadmapResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'docs/GOVERNANCE.md',
        nextFileAnswers: sharedAnswers,
        interaction_id: `generate_roadmap_${testId}`
      });

      expect(roadmapResponse.data.result).toMatchObject({
        success: true,
        fileName: 'docs/ROADMAP.md',
        content: expect.stringContaining('Roadmap')
      });

      const roadmapContent = roadmapResponse.data.result.content;
      expect(roadmapContent).toContain('Roadmap');
      expect(roadmapContent).toContain(`Governance Test ${testId}`);
      expect(roadmapContent).toContain('https://github.com/test/governance-test');

      // Step 4: Complete workflow
      const completeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'docs/ROADMAP.md',
        interaction_id: `complete_governance_${testId}`
      });

      expect(completeResponse.data.result).toMatchObject({
        success: true,
        instructions: expect.stringContaining('All files generated successfully')
      });

      // Verify session contains all 6 files
      const fs = await import('fs');
      const path = await import('path');
      const sessionPath = path.join(process.cwd(), 'tmp', 'sessions', 'proj-sessions', `${sessionId}.json`);
      expect(fs.existsSync(sessionPath)).toBe(true);

      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(sessionData.data.files).toMatchObject({
        'CODE_OF_CONDUCT.md': { status: 'done', scope: 'governance' },
        'CONTRIBUTING.md': { status: 'done', scope: 'governance' },
        'SECURITY.md': { status: 'done', scope: 'governance' },
        'docs/MAINTAINERS.md': { status: 'done', scope: 'governance' },
        'docs/GOVERNANCE.md': { status: 'done', scope: 'governance' },
        'docs/ROADMAP.md': { status: 'done', scope: 'governance' }
      });
    }, 300000);

    test('should complete full community artifacts workflow (SUPPORT.md + ADOPTERS.md)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discover_community_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        availableScopes: expect.arrayContaining(['community']),
        filesToCheck: expect.arrayContaining(['SUPPORT.md', 'ADOPTERS.md'])
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with community scope selected
      const reportResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['community'],
        interaction_id: `report_community_${testId}`
      });

      expect(reportResponse.data.result).toMatchObject({
        success: true,
        nextStep: 'generateFile',
        currentFile: 'SUPPORT.md'
      });

      // Step 3a: Generate SUPPORT.md
      const generateSupportResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: 'SUPPORT.md',
        answers: {
          projectName: `Community Test ${testId}`,
          projectDescription: 'A test project for community artifacts',
          projectUrl: 'https://github.com/test/community-test',
          docsUrl: 'https://docs.example.com',
          discussionsUrl: 'https://github.com/test/community-test/discussions',
          stackOverflowTag: 'community-test',
          slackUrl: 'https://slack.example.com',
          discordUrl: 'https://discord.gg/test',
          maintainerCount: '3',
          criticalResponseTime: '24 hours',
          featureResponseTime: '1 week',
          questionResponseTime: '48 hours',
          commercialSupportAvailable: 'yes',
          commercialSupportProvider: 'Test Corp',
          commercialSupportEmail: 'support@test.com',
          securityEmail: 'security@test.com'
        },
        interaction_id: `generate_support_${testId}`
      });

      expect(generateSupportResponse.data.result).toMatchObject({
        success: true,
        fileName: 'SUPPORT.md',
        content: expect.stringContaining('# Support'),
        nextFile: expect.objectContaining({
          fileName: 'ADOPTERS.md',
          scope: 'community'
        })
      });

      const supportContent = generateSupportResponse.data.result.content;
      expect(supportContent).toContain(`Community Test ${testId}`);
      expect(supportContent).toContain('https://github.com/test/community-test/discussions');
      expect(supportContent).toContain('community-test');
      expect(supportContent).toContain('https://slack.example.com');
      expect(supportContent).toContain('https://discord.gg/test');
      expect(supportContent).toContain('24 hours');
      expect(supportContent).toContain('Test Corp');
      expect(supportContent).toContain('security@test.com');

      // Step 3b: Generate ADOPTERS.md using round-trip optimization
      const generateAdoptersResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'SUPPORT.md',
        nextFileAnswers: {
          projectName: `Community Test ${testId}`,
          projectDescription: 'A test project for community artifacts',
          projectUrl: 'https://github.com/test/community-test',
          includeUseCase: 'yes',
          maintainerOrganization: 'Test Organization',
          maintainerUseCase: 'Using for testing and validation',
          maintainerWebsite: 'https://test-org.com',
          requiresDco: 'yes',
          requiresVerification: 'no',
          recognitionProgram: 'yes',
          maintainerEmail: 'maintainer@test.com'
        },
        interaction_id: `generate_adopters_${testId}`
      });

      expect(generateAdoptersResponse.data.result).toMatchObject({
        success: true,
        fileName: 'ADOPTERS.md',
        content: expect.stringContaining('# Adopters')
      });

      const adoptersContent = generateAdoptersResponse.data.result.content;
      expect(adoptersContent).toContain('# Adopters');
      expect(adoptersContent).toContain(`Community Test ${testId}`);
      expect(adoptersContent).toContain('Test Organization');
      expect(adoptersContent).toContain('Using for testing and validation');
      expect(adoptersContent).toContain('https://test-org.com');
      expect(adoptersContent).toContain('DCO');
      expect(adoptersContent).toContain('git commit --signoff');

      // Step 4: Complete workflow
      const completeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: 'ADOPTERS.md',
        interaction_id: `complete_community_${testId}`
      });

      expect(completeResponse.data.result).toMatchObject({
        success: true,
        instructions: expect.stringContaining('All files generated successfully')
      });

      // Verify session contains both files
      const fs = await import('fs');
      const path = await import('path');
      const sessionPath = path.join(process.cwd(), 'tmp', 'sessions', 'proj-sessions', `${sessionId}.json`);
      expect(fs.existsSync(sessionPath)).toBe(true);

      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      expect(sessionData.data.files).toMatchObject({
        'SUPPORT.md': { status: 'done', scope: 'community' },
        'ADOPTERS.md': { status: 'done', scope: 'community' }
      });
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

    test('should handle missing existingFiles for first reportScan', async () => {
      const testId = Date.now();

      // Create a valid session first
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `error_setup_existingfiles_${testId}`
      });
      const sessionId = discoveryResponse.data.result.sessionId;

      // Try reportScan without existingFiles on first call
      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId: sessionId,
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
        selectedScopes: ['readme'],
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

    test('should complete full github-issues workflow with 3 files (Milestone 6)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_github_issues_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        filesToCheck: expect.arrayContaining([
          '.github/ISSUE_TEMPLATE/bug_report.yml',
          '.github/ISSUE_TEMPLATE/feature_request.yml',
          '.github/ISSUE_TEMPLATE/config.yml'
        ]),
        availableScopes: expect.arrayContaining(['github-issues']),
        nextStep: 'reportScan'
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with selectedScopes
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['github-issues'],
        interaction_id: `report_scan_github_issues_${testId}`
      });

      expect(reportScanResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateFile',
        currentFile: '.github/ISSUE_TEMPLATE/bug_report.yml',
        questions: expect.arrayContaining([
          expect.objectContaining({
            id: 'projectName',
            required: true
          }),
          expect.objectContaining({
            id: 'githubOrg',
            required: true
          }),
          expect.objectContaining({
            id: 'githubRepo',
            required: true
          })
        ])
      });

      // Step 3: Generate bug_report.yml
      // Mix different truthy values: "yes", "true", boolean true, "no", boolean false
      const bugReportResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: '.github/ISSUE_TEMPLATE/bug_report.yml',
        answers: {
          projectName: `Test Project ${testId}`,
          githubOrg: 'test-org',
          githubRepo: 'test-repo',
          isNodeProject: 'yes',        // String "yes"
          isPythonProject: 'no',       // String "no"
          isGoProject: false,          // Boolean false
          isKubernetesProject: 'true', // String "true"
          hasDiscussions: true,        // Boolean true
          blankIssuesEnabled: 'false',
          docsSiteUrl: 'https://docs.example.com',
          slackInviteUrl: '',
          discordInviteUrl: '',
          supportFilePath: 'SUPPORT.md',
          securityFilePath: 'SECURITY.md',
          roadmapPath: 'docs/ROADMAP.md'
        },
        interaction_id: `generate_bug_report_${testId}`
      });

      expect(bugReportResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        fileName: '.github/ISSUE_TEMPLATE/bug_report.yml',
        content: expect.stringContaining('name: Bug Report'),
        nextFile: expect.objectContaining({
          fileName: '.github/ISSUE_TEMPLATE/feature_request.yml'
        })
      });

      const bugReportContent = bugReportResponse.data.result.content;
      expect(bugReportContent).toContain(`Test Project ${testId}`);

      // Verify conditional sections based on mixed truthy values
      expect(bugReportContent).toContain('Node.js Version');        // isNodeProject: 'yes'
      expect(bugReportContent).toContain('Kubernetes Version');     // isKubernetesProject: 'true'
      expect(bugReportContent).not.toContain('Python Version');     // isPythonProject: 'no'
      expect(bugReportContent).not.toContain('Go Version');         // isGoProject: false

      // Step 4: Mark bug_report.yml complete and generate feature_request.yml
      // Use boolean true for hasDiscussions to test different truthy value
      const featureRequestResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: '.github/ISSUE_TEMPLATE/bug_report.yml',
        nextFileAnswers: {
          projectName: `Test Project ${testId}`,
          githubOrg: 'test-org',
          githubRepo: 'test-repo',
          hasDiscussions: true,  // Boolean true (different from bug_report's boolean true)
          roadmapPath: 'docs/ROADMAP.md'
        },
        interaction_id: `generate_feature_request_${testId}`
      });

      expect(featureRequestResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        fileName: '.github/ISSUE_TEMPLATE/feature_request.yml',
        content: expect.stringContaining('name: Feature Request'),
        nextFile: expect.objectContaining({
          fileName: '.github/ISSUE_TEMPLATE/config.yml'
        })
      });

      const featureRequestContent = featureRequestResponse.data.result.content;
      expect(featureRequestContent).toContain(`Test Project ${testId}`);
      expect(featureRequestContent).toContain('github.com/test-org/test-repo/discussions');
      expect(featureRequestContent).toContain('docs/ROADMAP.md');

      // Step 5: Mark feature_request.yml complete and generate config.yml
      // Use string 'yes' for hasDiscussions to test third variation
      const configResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: '.github/ISSUE_TEMPLATE/feature_request.yml',
        nextFileAnswers: {
          blankIssuesEnabled: 'false',
          hasDiscussions: 'yes',  // String 'yes' (different from boolean true used earlier)
          githubOrg: 'test-org',
          githubRepo: 'test-repo',
          docsSiteUrl: 'https://docs.example.com',
          slackInviteUrl: '',
          discordInviteUrl: '',
          supportFilePath: 'SUPPORT.md',
          securityFilePath: 'SECURITY.md'
        },
        interaction_id: `generate_config_${testId}`
      });

      expect(configResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        fileName: '.github/ISSUE_TEMPLATE/config.yml',
        content: expect.stringContaining('blank_issues_enabled: false')
      });

      const configContent = configResponse.data.result.content;
      expect(configContent).toContain('blank_issues_enabled: false');
      expect(configContent).toContain('GitHub Discussions');
      expect(configContent).toContain('github.com/test-org/test-repo/discussions');
      expect(configContent).toContain('Documentation');
      expect(configContent).toContain('https://docs.example.com');
      expect(configContent).toContain('SUPPORT.md');
      expect(configContent).toContain('SECURITY.md');
      expect(configContent).not.toContain('Slack Community');
      expect(configContent).not.toContain('Discord');

      // Step 6: Mark config.yml complete - workflow should complete
      const completeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: '.github/ISSUE_TEMPLATE/config.yml',
        interaction_id: `complete_github_issues_${testId}`
      });

      expect(completeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        fileName: '.github/ISSUE_TEMPLATE/config.yml',
        instructions: expect.stringContaining('All files generated successfully')
      });
    }, 300000);

    test('should complete full pr-template workflow (Milestone 7)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_pr_template_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        filesToCheck: expect.arrayContaining([
          '.github/PULL_REQUEST_TEMPLATE.md'
        ]),
        availableScopes: expect.arrayContaining(['pr-template']),
        nextStep: 'reportScan'
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with selectedScopes
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['pr-template'],
        interaction_id: `report_scan_pr_template_${testId}`
      });

      expect(reportScanResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateFile',
        currentFile: '.github/PULL_REQUEST_TEMPLATE.md',
        questions: expect.arrayContaining([
          expect.objectContaining({
            id: 'projectName',
            required: true
          }),
          expect.objectContaining({
            id: 'requiresDco',
            required: false
          }),
          expect.objectContaining({
            id: 'requiresConventionalCommits',
            required: false
          }),
          expect.objectContaining({
            id: 'includesSecurityChecklist',
            required: false
          }),
          expect.objectContaining({
            id: 'requiresScreenshots',
            required: false
          }),
          expect.objectContaining({
            id: 'contributingPath',
            required: false
          })
        ])
      });

      // Step 3: Generate PR template with conditional sections enabled
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: '.github/PULL_REQUEST_TEMPLATE.md',
        answers: {
          projectName: `Test Project ${testId}`,
          requiresDco: 'yes',                    // String "yes"
          requiresConventionalCommits: true,     // Boolean true
          includesSecurityChecklist: 'yes',
          requiresScreenshots: true,
          contributingPath: 'CONTRIBUTING.md'
        },
        interaction_id: `generate_pr_template_${testId}`
      });

      expect(generateResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        fileName: '.github/PULL_REQUEST_TEMPLATE.md',
        content: expect.stringContaining('Thank you for contributing')
      });

      const content = generateResponse.data.result.content;

      // Verify core sections (always present)
      expect(content).toContain(`Thank you for contributing to Test Project ${testId}`);
      expect(content).toContain('## Description');
      expect(content).toContain('## Related Issues');
      expect(content).toContain('## Type of Change');
      expect(content).toContain('## Testing Checklist');
      expect(content).toContain('## Documentation Checklist');
      expect(content).toContain('## Breaking Changes');
      expect(content).toContain('## Checklist');
      expect(content).toContain('## Additional Context');

      // Verify conditional sections (based on answers)
      expect(content).toContain('## Conventional Commit Format');
      expect(content).toContain('feat(auth): add OAuth2 authentication support');
      expect(content).toContain('## Security Checklist');
      expect(content).toContain('No secrets or credentials committed');
      expect(content).toContain('## Screenshots / Recordings');
      expect(content).toContain('**Before:**');
      expect(content).toContain('**After:**');
      expect(content).toContain('## Developer Certificate of Origin');
      expect(content).toContain('Signed-off-by');
      expect(content).toContain('[CONTRIBUTING.md](CONTRIBUTING.md)');

      // Verify final checklist includes conditional items
      expect(content).toContain('All commits are signed off (DCO)');
      expect(content).toContain('PR title follows Conventional Commits format');

      // Step 4: Mark file as complete
      const completeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        completedFileName: '.github/PULL_REQUEST_TEMPLATE.md',
        interaction_id: `complete_pr_template_${testId}`
      });

      expect(completeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        fileName: '.github/PULL_REQUEST_TEMPLATE.md',
        instructions: expect.stringContaining('All files generated successfully')
      });
    }, 300000);

    test('should generate PR template without conditional sections', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_pr_template_minimal_${testId}`
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with selectedScopes
      await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['pr-template'],
        interaction_id: `report_scan_pr_template_minimal_${testId}`
      });

      // Step 3: Generate PR template with all conditional sections disabled
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateFile',
        sessionId,
        fileName: '.github/PULL_REQUEST_TEMPLATE.md',
        answers: {
          projectName: `Minimal Project ${testId}`,
          requiresDco: 'no',
          requiresConventionalCommits: false,
          includesSecurityChecklist: 'no',
          requiresScreenshots: false,
          contributingPath: ''
        },
        interaction_id: `generate_pr_template_minimal_${testId}`
      });

      const content = generateResponse.data.result.content;

      // Verify core sections are present
      expect(content).toContain(`Thank you for contributing to Minimal Project ${testId}`);
      expect(content).toContain('## Description');
      expect(content).toContain('## Testing Checklist');

      // Verify conditional sections are NOT present
      expect(content).not.toContain('## Conventional Commit Format');
      expect(content).not.toContain('## Security Checklist');
      expect(content).not.toContain('## Screenshots / Recordings');
      expect(content).not.toContain('## Developer Certificate of Origin');
      expect(content).not.toContain('[CONTRIBUTING.md]');
      expect(content).not.toContain('All commits are signed off (DCO)');
      expect(content).not.toContain('PR title follows Conventional Commits format');
    }, 300000);
  });
});
