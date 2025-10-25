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
    test('should complete scope-based workflow - generate all files in scope at once', async () => {
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

      // Step 2: ReportScan with selectedScopes - get ALL questions for readme scope
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['readme'],
        interaction_id: `report_scan_${testId}`
      });

      const expectedReportScanResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            nextStep: 'generateScope',
            scope: 'readme',
            filesToGenerate: expect.arrayContaining(['README.md']),
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

      expect(reportScanResponse).toMatchObject(expectedReportScanResponse);

      // Step 3: GenerateScope - Generate README.md (all files in readme scope)
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'readme',
        answers: {
          projectName: `Test Project ${testId}`,
          projectDescription: 'Integration test project for validation',
          licenseName: 'MIT'
        },
        interaction_id: `generate_scope_${testId}`
      });

      const expectedGenerateScopeResponse = {
        success: true,
        data: {
          result: {
            success: true,
            sessionId: sessionId,
            scope: 'readme',
            files: expect.arrayContaining([
              expect.objectContaining({
                path: 'README.md',
                content: expect.stringContaining(`Test Project ${testId}`)
              })
            ]),
            instructions: expect.stringContaining('Write these files')
          },
          tool: 'projectSetup',
          executionTime: expect.any(Number)
        },
        meta: expect.objectContaining({
          version: 'v1'
        })
      };

      expect(generateScopeResponse).toMatchObject(expectedGenerateScopeResponse);

      // Verify README content
      const readmeFiles = generateScopeResponse.data.result.files;
      expect(readmeFiles).toHaveLength(1);
      const readmeFile = readmeFiles[0];
      expect(readmeFile.path).toBe('README.md');
      expect(readmeFile.content).toContain(`Test Project ${testId}`);
      expect(readmeFile.content).toContain('Integration test project for validation');
      expect(readmeFile.content).toContain('MIT');

      // Step 4: ReportScan with legal scope - get ALL questions for legal scope
      const reportScanLegalResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        selectedScopes: ['legal'],
        interaction_id: `report_scan_legal_${testId}`
      });

      expect(reportScanLegalResponse.data.result).toMatchObject({
        success: true,
        sessionId: sessionId,
        nextStep: 'generateScope',
        scope: 'legal',
        filesToGenerate: expect.arrayContaining(['LICENSE']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'licenseType', required: true }),
          expect.objectContaining({ id: 'year', required: true }),
          expect.objectContaining({ id: 'copyrightHolder', required: true })
        ])
      });

      // Step 5: GenerateScope - Generate LICENSE and NOTICE (all files in legal scope)
      const generateLegalResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'legal',
        answers: {
          licenseType: 'Apache-2.0',
          year: '2025',
          copyrightHolder: 'Test Suite',
          projectName: `Test Project ${testId}`,
          projectDescription: 'Integration test project',
          projectUrl: 'https://example.com'
        },
        interaction_id: `generate_legal_${testId}`
      });

      expect(generateLegalResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'legal'
      });

      // Verify both LICENSE and NOTICE were generated
      const legalFiles = generateLegalResponse.data.result.files;
      expect(legalFiles).toHaveLength(2); // LICENSE + NOTICE (conditional on Apache-2.0)

      const licenseFile = legalFiles.find((f: any) => f.path === 'LICENSE');
      expect(licenseFile).toBeDefined();
      expect(licenseFile.content).toContain('Apache License');
      expect(licenseFile.content).toContain('2025');

      const noticeFile = legalFiles.find((f: any) => f.path === 'NOTICE');
      expect(noticeFile).toBeDefined();
      expect(noticeFile.content).toContain(`Test Project ${testId}`);
      expect(noticeFile.content).toContain('2025');
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
        interaction_id: `report_scan_optional_${testId}`
      });

      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'readme',
        answers: {
          projectName: `Optional Test ${testId}`,
          projectDescription: 'Testing optional fields'
          // licenseName intentionally omitted
        },
        interaction_id: `generate_scope_optional_${testId}`
      });

      // Verify generation succeeded
      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'readme',
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'README.md' })
        ])
      });

      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(1);

      const content = files[0].content;

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
        availableScopes: expect.arrayContaining(['governance']),
        nextStep: 'reportScan'
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with governance scope - get ALL questions at once
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['governance'],
        interaction_id: `report_governance_${testId}`
      });

      expect(reportScanResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateScope',
        scope: 'governance',
        filesToGenerate: expect.arrayContaining(['CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs/MAINTAINERS.md', 'docs/GOVERNANCE.md', 'docs/ROADMAP.md']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'projectName', required: true }),
          expect.objectContaining({ id: 'enforcementEmail', required: true }),
          expect.objectContaining({ id: 'securityEmail', required: true }),
          expect.objectContaining({ id: 'maintainerName', required: true })
        ])
      });

      // Step 3: GenerateScope - Generate ALL 6 governance files at once
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'governance',
        answers: {
          projectName: `Governance Test ${testId}`,
          repositoryUrl: 'https://github.com/test/governance-test',
          repoName: 'governance-test',
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
        },
        interaction_id: `generate_scope_governance_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'governance',
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'CODE_OF_CONDUCT.md' }),
          expect.objectContaining({ path: 'CONTRIBUTING.md' }),
          expect.objectContaining({ path: 'SECURITY.md' }),
          expect.objectContaining({ path: 'docs/MAINTAINERS.md' }),
          expect.objectContaining({ path: 'docs/GOVERNANCE.md' }),
          expect.objectContaining({ path: 'docs/ROADMAP.md' })
        ]),
        instructions: expect.stringContaining('Write these files')
      });

      // Verify all 6 files were generated
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(6);

      // Verify CODE_OF_CONDUCT.md content
      const conductFile = files.find((f: any) => f.path === 'CODE_OF_CONDUCT.md');
      expect(conductFile).toBeDefined();
      expect(conductFile.content).toContain('Contributor Covenant Code of Conduct');
      expect(conductFile.content).toContain('conduct@test.com');

      // Verify CONTRIBUTING.md content
      const contributingFile = files.find((f: any) => f.path === 'CONTRIBUTING.md');
      expect(contributingFile).toBeDefined();
      expect(contributingFile.content).toContain(`Contributing to Governance Test ${testId}`);
      expect(contributingFile.content).toContain('https://github.com/test/governance-test');
      expect(contributingFile.content).toContain('npm install');
      expect(contributingFile.content).toContain('npm test');
      expect(contributingFile.content).toContain('git commit -s');
      // Verify git clone uses repoName, not projectName
      expect(contributingFile.content).toContain('git clone https://github.com/YOUR_USERNAME/governance-test.git');
      expect(contributingFile.content).toContain('cd governance-test');
      expect(contributingFile.content).not.toContain(`cd Governance Test ${testId}`);

      // Verify SECURITY.md content
      const securityFile = files.find((f: any) => f.path === 'SECURITY.md');
      expect(securityFile).toBeDefined();
      expect(securityFile.content).toContain('Security Policy');
      expect(securityFile.content).toContain('security@test.com');
      expect(securityFile.content).toContain(`Governance Test ${testId}`);

      // Verify docs/MAINTAINERS.md content
      const maintainersFile = files.find((f: any) => f.path === 'docs/MAINTAINERS.md');
      expect(maintainersFile).toBeDefined();
      expect(maintainersFile.content).toContain('Test Maintainer');
      expect(maintainersFile.content).toContain('maintainers@test.com');
      expect(maintainersFile.content).toContain('@testmaintainer');

      // Verify docs/GOVERNANCE.md content
      const governanceFile = files.find((f: any) => f.path === 'docs/GOVERNANCE.md');
      expect(governanceFile).toBeDefined();
      expect(governanceFile.content).toContain('Project Governance');
      expect(governanceFile.content).toContain(`Governance Test ${testId}`);
      expect(governanceFile.content).toContain('6 months');
      expect(governanceFile.content).toContain('1 year');

      // Verify docs/ROADMAP.md content
      const roadmapFile = files.find((f: any) => f.path === 'docs/ROADMAP.md');
      expect(roadmapFile).toBeDefined();
      expect(roadmapFile.content).toContain('Roadmap');
      expect(roadmapFile.content).toContain(`Governance Test ${testId}`);
      expect(roadmapFile.content).toContain('https://github.com/test/governance-test');
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
        filesToCheck: expect.arrayContaining(['SUPPORT.md', 'ADOPTERS.md']),
        nextStep: 'reportScan'
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with community scope - get ALL questions at once
      const reportResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['community'],
        interaction_id: `report_community_${testId}`
      });

      expect(reportResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateScope',
        scope: 'community',
        filesToGenerate: expect.arrayContaining(['SUPPORT.md', 'ADOPTERS.md']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'projectName', required: true }),
          expect.objectContaining({ id: 'maintainerEmail', required: true })
        ])
      });

      // Step 3: GenerateScope - Generate both SUPPORT.md and ADOPTERS.md at once
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'community',
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
          securityEmail: 'security@test.com',
          includeUseCase: 'yes',
          maintainerOrganization: 'Test Organization',
          maintainerUseCase: 'Using for testing and validation',
          maintainerWebsite: 'https://test-org.com',
          requiresDco: 'yes',
          requiresVerification: 'no',
          recognitionProgram: 'yes',
          maintainerEmail: 'maintainer@test.com'
        },
        interaction_id: `generate_scope_community_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'community',
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'SUPPORT.md' }),
          expect.objectContaining({ path: 'ADOPTERS.md' })
        ]),
        instructions: expect.stringContaining('Write these files')
      });

      // Verify both files were generated
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(2);

      // Verify SUPPORT.md content
      const supportFile = files.find((f: any) => f.path === 'SUPPORT.md');
      expect(supportFile).toBeDefined();
      expect(supportFile.content).toContain('# Support');
      expect(supportFile.content).toContain(`Community Test ${testId}`);
      expect(supportFile.content).toContain('https://github.com/test/community-test/discussions');
      expect(supportFile.content).toContain('community-test');
      expect(supportFile.content).toContain('https://slack.example.com');
      expect(supportFile.content).toContain('https://discord.gg/test');
      expect(supportFile.content).toContain('24 hours');
      expect(supportFile.content).toContain('Test Corp');
      expect(supportFile.content).toContain('security@test.com');

      // Verify ADOPTERS.md content
      const adoptersFile = files.find((f: any) => f.path === 'ADOPTERS.md');
      expect(adoptersFile).toBeDefined();
      expect(adoptersFile.content).toContain('# Adopters');
      expect(adoptersFile.content).toContain(`Community Test ${testId}`);
      expect(adoptersFile.content).toContain('Test Organization');
      expect(adoptersFile.content).toContain('Using for testing and validation');
      expect(adoptersFile.content).toContain('https://test-org.com');
      expect(adoptersFile.content).toContain('DCO');
      expect(adoptersFile.content).toContain('git commit --signoff');
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

    test('should handle missing scope for generateScope', async () => {
      const testId = Date.now();

      // Create a session first
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `error_setup_${testId}`
      });
      const sessionId = discoveryResponse.data.result.sessionId;

      const errorResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        answers: { projectName: 'Test' },
        interaction_id: `error_missing_scope_${testId}`
      });

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            success: false,
            error: {
              message: expect.stringContaining('scope')
            }
          },
          tool: 'projectSetup'
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });

    test('should handle missing answers for generateScope', async () => {
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
        step: 'generateScope',
        sessionId,
        scope: 'readme',
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

      // Step 2: ReportScan with github-issues scope - get ALL questions at once
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
        nextStep: 'generateScope',
        scope: 'github-issues',
        filesToGenerate: expect.arrayContaining([
          '.github/ISSUE_TEMPLATE/bug_report.yml',
          '.github/ISSUE_TEMPLATE/feature_request.yml',
          '.github/ISSUE_TEMPLATE/config.yml'
        ]),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'projectName', required: true }),
          expect.objectContaining({ id: 'githubOrg', required: true }),
          expect.objectContaining({ id: 'githubRepo', required: true })
        ])
      });

      // Step 3: GenerateScope - Generate all 3 files at once
      // Mix different truthy values: "yes", "true", boolean true, "no", boolean false
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'github-issues',
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
        interaction_id: `generate_scope_github_issues_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'github-issues',
        files: expect.arrayContaining([
          expect.objectContaining({ path: '.github/ISSUE_TEMPLATE/bug_report.yml' }),
          expect.objectContaining({ path: '.github/ISSUE_TEMPLATE/feature_request.yml' }),
          expect.objectContaining({ path: '.github/ISSUE_TEMPLATE/config.yml' })
        ]),
        instructions: expect.stringContaining('Write these files')
      });

      // Verify all 3 files were generated
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(3);

      // Verify bug_report.yml content
      const bugReportFile = files.find((f: any) => f.path === '.github/ISSUE_TEMPLATE/bug_report.yml');
      expect(bugReportFile).toBeDefined();
      expect(bugReportFile.content).toContain('name: Bug Report');
      expect(bugReportFile.content).toContain(`Test Project ${testId}`);
      expect(bugReportFile.content).toContain('Node.js Version');        // isNodeProject: 'yes'
      expect(bugReportFile.content).toContain('Kubernetes Version');     // isKubernetesProject: 'true'
      expect(bugReportFile.content).not.toContain('Python Version');     // isPythonProject: 'no'
      expect(bugReportFile.content).not.toContain('Go Version');         // isGoProject: false

      // Verify feature_request.yml content
      const featureRequestFile = files.find((f: any) => f.path === '.github/ISSUE_TEMPLATE/feature_request.yml');
      expect(featureRequestFile).toBeDefined();
      expect(featureRequestFile.content).toContain('name: Feature Request');
      expect(featureRequestFile.content).toContain(`Test Project ${testId}`);
      expect(featureRequestFile.content).toContain('github.com/test-org/test-repo/discussions');
      expect(featureRequestFile.content).toContain('docs/ROADMAP.md');

      // Verify config.yml content
      const configFile = files.find((f: any) => f.path === '.github/ISSUE_TEMPLATE/config.yml');
      expect(configFile).toBeDefined();
      expect(configFile.content).toContain('blank_issues_enabled: false');
      expect(configFile.content).toContain('GitHub Discussions');
      expect(configFile.content).toContain('github.com/test-org/test-repo/discussions');
      expect(configFile.content).toContain('Documentation');
      expect(configFile.content).toContain('https://docs.example.com');
      expect(configFile.content).toContain('SUPPORT.md');
      expect(configFile.content).toContain('SECURITY.md');
      expect(configFile.content).not.toContain('Slack Community');
      expect(configFile.content).not.toContain('Discord');
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

      // Step 2: ReportScan with pr-template scope - get ALL questions at once
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
        nextStep: 'generateScope',
        scope: 'pr-template',
        filesToGenerate: expect.arrayContaining(['.github/PULL_REQUEST_TEMPLATE.md']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'projectName', required: true }),
          expect.objectContaining({ id: 'requiresDco', required: false }),
          expect.objectContaining({ id: 'requiresConventionalCommits', required: false }),
          expect.objectContaining({ id: 'includesSecurityChecklist', required: false }),
          expect.objectContaining({ id: 'requiresScreenshots', required: false }),
          expect.objectContaining({ id: 'contributingPath', required: false })
        ])
      });

      // Step 3: GenerateScope - Generate PR template with conditional sections enabled
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'pr-template',
        answers: {
          projectName: `Test Project ${testId}`,
          requiresDco: 'yes',                    // String "yes"
          requiresConventionalCommits: true,     // Boolean true
          includesSecurityChecklist: 'yes',
          requiresScreenshots: true,
          contributingPath: 'CONTRIBUTING.md'
        },
        interaction_id: `generate_scope_pr_template_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'pr-template',
        files: expect.arrayContaining([
          expect.objectContaining({ path: '.github/PULL_REQUEST_TEMPLATE.md' })
        ]),
        instructions: expect.stringContaining('Write these files')
      });

      // Verify file was generated
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(1);

      const prTemplateFile = files[0];
      expect(prTemplateFile.path).toBe('.github/PULL_REQUEST_TEMPLATE.md');

      const content = prTemplateFile.content;

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
    }, 300000);

    test('should generate PR template without conditional sections', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_pr_template_minimal_${testId}`
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with pr-template scope
      await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['pr-template'],
        interaction_id: `report_scan_pr_template_minimal_${testId}`
      });

      // Step 3: GenerateScope - Generate PR template with all conditional sections disabled
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'pr-template',
        answers: {
          projectName: `Minimal Project ${testId}`,
          requiresDco: 'no',
          requiresConventionalCommits: false,
          includesSecurityChecklist: 'no',
          requiresScreenshots: false,
          contributingPath: ''
        },
        interaction_id: `generate_scope_pr_template_minimal_${testId}`
      });

      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(1);

      const content = files[0].content;

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

    test('should complete full github-community workflow with 3 files (Milestone 8)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_github_community_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        availableScopes: expect.arrayContaining(['github-community']),
        nextStep: 'reportScan'
      });

      // Discovery returns ALL files, we select scope in reportScan
      const allFiles = discoveryResponse.data.result.filesToCheck;
      expect(allFiles).toContain('.github/CODEOWNERS');
      expect(allFiles).toContain('.github/release.yml');

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with github-community scope - get ALL questions at once
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['github-community'],
        interaction_id: `report_scan_github_community_${testId}`
      });

      expect(reportScanResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateScope',
        scope: 'github-community',
        filesToGenerate: expect.arrayContaining(['.github/CODEOWNERS', '.github/release.yml']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'useTeams', required: false }),
          expect.objectContaining({ id: 'enableFunding', required: false })
        ])
      });

      // Step 3: GenerateScope - Generate all github-community files at once (with enableFunding: 'yes')
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'github-community',
        answers: {
          useTeams: 'no',
          githubOrg: '',
          defaultTeam: '',
          maintainerUsernames: 'octocat,torvalds,gvanrossum',
          enableFunding: 'yes',
          githubSponsors: 'octocat',
          openCollective: 'webpack',
          patreon: '',
          kofi: '',
          tidelift: '',
          customFunding: ''
        },
        interaction_id: `generate_scope_github_community_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'github-community',
        instructions: expect.stringContaining('Write these files')
      });

      // Verify all 3 files were generated (CODEOWNERS, FUNDING.yml, release.yml)
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(3);

      // Verify CODEOWNERS content
      const codeownersFile = files.find((f: any) => f.path === '.github/CODEOWNERS');
      expect(codeownersFile).toBeDefined();
      expect(codeownersFile.content).toContain('# CODEOWNERS');
      expect(codeownersFile.content).toContain('# Using individual maintainers for code ownership');
      expect(codeownersFile.content).toContain('* @octocat @torvalds @gvanrossum');

      // Verify FUNDING.yml content (conditionally generated because enableFunding: 'yes')
      const fundingFile = files.find((f: any) => f.path === '.github/FUNDING.yml');
      expect(fundingFile).toBeDefined();
      expect(fundingFile.content).toContain('# Funding links for this project');
      expect(fundingFile.content).toContain('github: octocat');
      expect(fundingFile.content).toContain('open_collective: webpack');
      expect(fundingFile.content).not.toContain('patreon:');  // Empty values should not generate lines
      expect(fundingFile.content).not.toContain('ko_fi:');
      expect(fundingFile.content).not.toContain('tidelift:');
      expect(fundingFile.content).not.toContain('custom:');

      // Verify release.yml content
      const releaseFile = files.find((f: any) => f.path === '.github/release.yml');
      expect(releaseFile).toBeDefined();
      expect(releaseFile.content).toContain('# Release notes configuration');
      expect(releaseFile.content).toContain('changelog:');
      expect(releaseFile.content).toContain('exclude:');
      expect(releaseFile.content).toContain('- renovate');
      expect(releaseFile.content).toContain('categories:');
      expect(releaseFile.content).toContain('- title: Breaking Changes');
      expect(releaseFile.content).toContain('- title: New Features');
      expect(releaseFile.content).toContain('- title: Bug Fixes');
      expect(releaseFile.content).toContain('- title: Documentation');
      expect(releaseFile.content).toContain('- title: Dependencies');
      expect(releaseFile.content).toContain('- title: Other Changes');
    }, 300000);

    test('should skip FUNDING.yml when enableFunding is false (Milestone 8 - conditional file)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_no_funding_${testId}`
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with github-community scope
      await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['github-community'],
        interaction_id: `report_scan_no_funding_${testId}`
      });

      // Step 3: GenerateScope - Generate github-community files with enableFunding: 'no'
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'github-community',
        answers: {
          useTeams: true,
          githubOrg: 'kubernetes',
          defaultTeam: 'maintainers',
          maintainerUsernames: '',
          enableFunding: 'no',  // Funding disabled - FUNDING.yml should be excluded
          githubSponsors: '',
          openCollective: '',
          patreon: '',
          kofi: '',
          tidelift: '',
          customFunding: ''
        },
        interaction_id: `generate_scope_no_funding_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'github-community',
        excludedFiles: expect.arrayContaining(['.github/FUNDING.yml']),
        instructions: expect.stringContaining('Write these files')
      });

      // Verify only 2 files were generated (CODEOWNERS and release.yml - NO FUNDING.yml)
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(2);

      // Verify FUNDING.yml was excluded
      const fundingFile = files.find((f: any) => f.path === '.github/FUNDING.yml');
      expect(fundingFile).toBeUndefined();

      // Verify CODEOWNERS content
      const codeownersFile = files.find((f: any) => f.path === '.github/CODEOWNERS');
      expect(codeownersFile).toBeDefined();
      expect(codeownersFile.content).toContain('# CODEOWNERS');
      expect(codeownersFile.content).toContain('# Using GitHub teams for code ownership');
      expect(codeownersFile.content).toContain('* @kubernetes/maintainers');

      // Verify release.yml content
      const releaseFile = files.find((f: any) => f.path === '.github/release.yml');
      expect(releaseFile).toBeDefined();
      expect(releaseFile.content).toContain('# Release notes configuration');
      expect(releaseFile.content).toContain('- title: Breaking Changes');
      expect(releaseFile.content).toContain('- renovate');
    }, 300000);

    test('should complete full github-security workflow with OpenSSF Scorecard (Milestone 12)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_github_security_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        availableScopes: expect.arrayContaining(['github-security']),
        nextStep: 'reportScan'
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with github-security scope
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['github-security'],
        interaction_id: `report_scan_github_security_${testId}`
      });

      expect(reportScanResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateScope',
        scope: 'github-security',
        filesToGenerate: expect.arrayContaining(['.github/workflows/scorecard.yml']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'githubOrg', required: true }),
          expect.objectContaining({ id: 'githubRepo', required: true }),
          expect.objectContaining({ id: 'defaultBranch', required: true }),
          expect.objectContaining({ id: 'scheduleCron', required: true }),
          expect.objectContaining({ id: 'scheduleDescription', required: true }),
          expect.objectContaining({ id: 'publishResults', required: true }),
          expect.objectContaining({ id: 'isPrivateRepo', required: true })
        ])
      });

      // Step 3: GenerateScope - Generate OpenSSF Scorecard workflow for public repo
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'github-security',
        answers: {
          githubOrg: 'kubernetes',
          githubRepo: 'kubernetes',
          defaultBranch: 'main',
          scheduleCron: '30 1 * * 6',
          scheduleDescription: 'Weekly on Saturdays at 1:30 AM UTC',
          publishResults: 'true',
          isPrivateRepo: 'no'
        },
        interaction_id: `generate_scope_github_security_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'github-security',
        files: expect.arrayContaining([
          expect.objectContaining({ path: '.github/workflows/scorecard.yml' })
        ]),
        instructions: expect.stringContaining('Write these files'),
        additionalInstructions: expect.stringContaining('OpenSSF Scorecard badge')
      });

      // Verify file was generated
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(1);

      const scorecardFile = files[0];
      expect(scorecardFile.path).toBe('.github/workflows/scorecard.yml');

      const content = scorecardFile.content;

      // Verify workflow structure
      expect(content).toContain('name: OpenSSF Scorecard');
      expect(content).toContain('branches:');
      expect(content).toContain('- main');
      expect(content).toContain('schedule:');
      expect(content).toContain("cron: '30 1 * * 6'");
      expect(content).toContain('Weekly on Saturdays at 1:30 AM UTC');
      expect(content).toContain('workflow_dispatch:');

      // Verify permissions
      expect(content).toContain('permissions: read-all');
      expect(content).toContain('security-events: write');
      expect(content).toContain('id-token: write');
      expect(content).toContain('contents: read');

      // Verify it's NOT a private repo (no extra permissions)
      expect(content).not.toContain('actions: read');
      expect(content).not.toContain('issues: read');
      expect(content).not.toContain('pull-requests: read');

      // Verify steps
      expect(content).toContain('uses: actions/checkout@');
      expect(content).toContain('persist-credentials: false');
      expect(content).toContain('uses: ossf/scorecard-action@');
      expect(content).toContain('results_file: results.sarif');
      expect(content).toContain('results_format: sarif');
      expect(content).toContain('publish_results: true');
      expect(content).toContain('uses: actions/upload-artifact@');
      expect(content).toContain('retention-days: 5');
      expect(content).toContain('uses: github/codeql-action/upload-sarif@');

      // Verify additionalInstructions includes badge markdown with correct org/repo
      const additionalInstructions = generateScopeResponse.data.result.additionalInstructions;
      expect(additionalInstructions).toContain('[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kubernetes/kubernetes/badge)]');
      expect(additionalInstructions).toContain('https://scorecard.dev/viewer/?uri=github.com/kubernetes/kubernetes');
    }, 300000);

    test('should complete full github-automation workflow with 4 files (Milestone 13)', async () => {
      const testId = Date.now();

      // Step 1: Discovery
      const discoveryResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'discover',
        interaction_id: `discovery_github_automation_${testId}`
      });

      expect(discoveryResponse.data.result).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^proj-\d+-[a-f0-9-]+$/),
        availableScopes: expect.arrayContaining(['github-automation']),
        nextStep: 'reportScan'
      });

      const sessionId = discoveryResponse.data.result.sessionId;

      // Step 2: ReportScan with github-automation scope
      const reportScanResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'reportScan',
        sessionId,
        existingFiles: [],
        selectedScopes: ['github-automation'],
        interaction_id: `report_scan_github_automation_${testId}`
      });

      expect(reportScanResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        nextStep: 'generateScope',
        scope: 'github-automation',
        filesToGenerate: expect.arrayContaining(['renovate.json', '.github/labeler.yml', '.github/workflows/labeler.yml', '.github/workflows/stale.yml']),
        questions: expect.arrayContaining([
          expect.objectContaining({ id: 'prConcurrentLimit', required: false }),
          expect.objectContaining({ id: 'schedule', required: false }),
          expect.objectContaining({ id: 'sourceDirectory', required: false }),
          expect.objectContaining({ id: 'staleBotSchedule', required: false })
        ])
      });

      // Step 3: GenerateScope - Generate all 3 automation files
      const generateScopeResponse = await integrationTest.httpClient.post('/api/v1/tools/projectSetup', {
        step: 'generateScope',
        sessionId,
        scope: 'github-automation',
        answers: {
          prConcurrentLimit: '5',
          prHourlyLimit: '2',
          enableDependencyDashboard: 'true',
          enableVulnerabilityAlerts: 'true',
          schedule: 'before 5am on monday',
          groupDependencies: 'true',
          automergeMinor: 'false',
          automergeSecurity: 'true',
          sourceDirectory: 'src',
          testDirectory: 'tests',
          infrastructureDirectory: 'infrastructure',
          staleBotSchedule: '0 0 * * *',
          daysBeforeIssueStale: '60',
          daysBeforeIssueClose: '7',
          daysBeforePrStale: '30',
          daysBeforePrClose: '7',
          exemptIssueLabels: 'pinned,security,bug',
          exemptPrLabels: 'pinned,security,work-in-progress',
          exemptMilestones: 'true',
          exemptAssignees: 'true'
        },
        interaction_id: `generate_scope_github_automation_${testId}`
      });

      expect(generateScopeResponse.data.result).toMatchObject({
        success: true,
        sessionId,
        scope: 'github-automation',
        files: expect.arrayContaining([
          expect.objectContaining({ path: 'renovate.json' }),
          expect.objectContaining({ path: '.github/labeler.yml' }),
          expect.objectContaining({ path: '.github/workflows/labeler.yml' }),
          expect.objectContaining({ path: '.github/workflows/stale.yml' })
        ]),
        instructions: expect.stringContaining('Write these files')
      });

      // Verify all 4 files were generated
      const files = generateScopeResponse.data.result.files;
      expect(files).toHaveLength(4);

      // Verify Renovate configuration
      const renovateFile = files.find((f: any) => f.path === 'renovate.json');
      expect(renovateFile).toBeDefined();
      const renovateContent = JSON.parse(renovateFile.content);
      expect(renovateContent).toMatchObject({
        extends: expect.arrayContaining(['config:recommended']),
        labels: expect.arrayContaining(['dependencies']),
        prConcurrentLimit: 5,
        prHourlyLimit: 2,
        dependencyDashboard: true,
        osvVulnerabilityAlerts: true,
        schedule: expect.arrayContaining(['before 5am on monday'])
      });
      expect(renovateContent.packageRules).toBeDefined();
      expect(renovateContent.packageRules.length).toBeGreaterThan(0);

      // Verify Labeler configuration
      const labelerConfigFile = files.find((f: any) => f.path === '.github/labeler.yml');
      expect(labelerConfigFile).toBeDefined();
      expect(labelerConfigFile.content).toContain('documentation:');
      expect(labelerConfigFile.content).toContain('source:');
      expect(labelerConfigFile.content).toContain('src/**/*');
      expect(labelerConfigFile.content).toContain('tests:');
      expect(labelerConfigFile.content).toContain('tests/**/*');
      expect(labelerConfigFile.content).toContain('infrastructure:');
      expect(labelerConfigFile.content).toContain('infrastructure/**/*');
      expect(labelerConfigFile.content).toContain('dependencies:');
      expect(labelerConfigFile.content).toContain('package.json');
      expect(labelerConfigFile.content).toContain('go.mod');
      expect(labelerConfigFile.content).toContain('Cargo.toml');

      // Verify Labeler workflow
      const labelerWorkflowFile = files.find((f: any) => f.path === '.github/workflows/labeler.yml');
      expect(labelerWorkflowFile).toBeDefined();
      expect(labelerWorkflowFile.content).toContain('name: "Pull Request Labeler"');
      expect(labelerWorkflowFile.content).toContain('pull_request_target');
      expect(labelerWorkflowFile.content).toContain('uses: actions/labeler@');
      expect(labelerWorkflowFile.content).toContain('configuration-path: .github/labeler.yml');

      // Verify Stale bot workflow
      const staleFile = files.find((f: any) => f.path === '.github/workflows/stale.yml');
      expect(staleFile).toBeDefined();
      expect(staleFile.content).toContain('name: Close Stale Issues and PRs');
      expect(staleFile.content).toContain('uses: actions/stale@');
      expect(staleFile.content).toContain('days-before-issue-stale: 60');
      expect(staleFile.content).toContain('days-before-issue-close: 7');
      expect(staleFile.content).toContain('days-before-pr-stale: 30');
      expect(staleFile.content).toContain('days-before-pr-close: 7');
      expect(staleFile.content).toContain('exempt-issue-labels:');
      expect(staleFile.content).toContain('pinned,security,bug');
      expect(staleFile.content).toContain('exempt-pr-labels:');
      expect(staleFile.content).toContain('pinned,security,work-in-progress');
      expect(staleFile.content).toContain('exempt-milestones: true');
      expect(staleFile.content).toContain('exempt-assignees: true');
    }, 300000);
  });
});
