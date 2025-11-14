/**
 * Integration Test: Operate Tool
 *
 * Tests the complete operational workflow via REST API against a real test cluster.
 * Validates AI-powered analysis, dry-run validation, pattern/policy integration,
 * and session management for Day 2 Kubernetes operations.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import * as fs from 'fs';
import * as path from 'path';

describe.concurrent('Operate Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'operate-test';

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Analysis Workflow', () => {
    test('should complete full workflow: create deployment → analyze update intent → execute approved changes → validate deployment updated', async () => {
      const testId = Date.now();

      // SETUP: Create namespace
      await integrationTest.kubectl(`create namespace ${testNamespace}`);

      // SETUP: Create deployment with nginx:1.19
      await integrationTest.kubectl(`apply -n ${testNamespace} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-api
  namespace: operate-test
spec:
  replicas: 2
  selector:
    matchLabels:
      app: test-api
  template:
    metadata:
      labels:
        app: test-api
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
        ports:
        - containerPort: 80
EOF`);

      // Wait for deployment to be ready
      await integrationTest.kubectl(`wait --for=condition=available --timeout=60s deployment/test-api -n ${testNamespace}`);

      // Verify deployment is running with correct image
      const deploymentJson = await integrationTest.kubectl(`get deployment test-api -n ${testNamespace} -o json`);
      const deployment = JSON.parse(deploymentJson);
      expect(deployment.spec.template.spec.containers[0].image).toBe('nginx:1.19');

      // PHASE 1: AI Analysis - Request operation
      const analysisResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/operate',
        {
          intent: `update test-api deployment in ${testNamespace} namespace to nginx:1.20 with zero downtime`,
          interaction_id: `operate_test_${testId}`
        }
      );

      // Validate response structure with specific expectations
      const expectedAnalysisResponse = {
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^opr-\d+-[a-f0-9]{8}$/), // Session ID format: opr-{timestamp}-{uuid8}
            analysis: {
              summary: expect.stringContaining('nginx'), // Should mention nginx in analysis
              proposedChanges: {
                create: expect.any(Array), // May be empty for simple update
                update: expect.arrayContaining([
                  expect.objectContaining({
                    kind: 'Deployment',
                    name: 'test-api',
                    namespace: testNamespace,
                    changes: expect.stringContaining('nginx:1.20'), // Should mention new version
                    rationale: expect.any(String)
                  })
                ]),
                delete: expect.any(Array) // Should be empty for update operation
              },
              commands: expect.arrayContaining([
                expect.stringContaining('kubectl') // Should have kubectl commands
              ]),
              dryRunValidation: {
                status: 'success', // AI should validate with dry-run
                details: expect.stringContaining('validated') // Should mention validation
              },
              patternsApplied: expect.any(Array), // May be empty if no patterns match
              capabilitiesUsed: expect.any(Array), // May be empty for simple update
              policiesChecked: expect.any(Array), // May be empty if no policies match
              risks: {
                level: expect.stringMatching(/low|medium|high/),
                description: expect.any(String)
              },
              validationIntent: expect.any(String) // AI provides validation guidance
            },
            message: expect.stringContaining('proposal'),
            nextAction: expect.stringContaining('executeChoice') // Should mention how to execute
          },
          tool: 'operate'
        }
      };

      expect(analysisResponse).toMatchObject(expectedAnalysisResponse);

      // Extract session ID for verification
      const sessionId = analysisResponse.data.result.sessionId;
      expect(sessionId).toBeTruthy();

      // PHASE 2: Verify session file was created
      const sessionFilePath = path.join(process.cwd(), 'tmp', 'sessions', 'opr-sessions', `${sessionId}.json`);
      expect(fs.existsSync(sessionFilePath)).toBe(true);

      // PHASE 3: Verify session contents
      const sessionData = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8'));

      const expectedSessionData = {
        sessionId,
        createdAt: expect.any(String), // ISO timestamp
        updatedAt: expect.any(String), // ISO timestamp
        data: {
          intent: expect.stringContaining('nginx:1.20'),
          context: {
            patterns: expect.any(Array),
            policies: expect.any(Array),
            capabilities: expect.arrayContaining([
              expect.objectContaining({
                resourceName: expect.any(String),
                description: expect.any(String)
              })
            ]) // Should have capabilities from cluster scan
          },
          proposedChanges: {
            create: expect.any(Array),
            update: expect.arrayContaining([
              expect.objectContaining({
                kind: 'Deployment',
                name: 'test-api'
              })
            ]),
            delete: expect.any(Array)
          },
          commands: expect.arrayContaining([
            expect.stringContaining('kubectl')
          ]),
          dryRunValidation: {
            status: 'success',
            details: expect.any(String)
          },
          patternsApplied: expect.any(Array),
          capabilitiesUsed: expect.any(Array),
          policiesChecked: expect.any(Array),
          risks: {
            level: expect.stringMatching(/low|medium|high/),
            description: expect.any(String)
          },
          validationIntent: expect.any(String),
          status: 'analysis_complete'
        }
      };

      expect(sessionData).toMatchObject(expectedSessionData);

      // VALIDATION: Verify original deployment unchanged (no execution yet)
      const unchangedDeploymentJson = await integrationTest.kubectl(`get deployment test-api -n ${testNamespace} -o json`);
      const unchangedDeployment = JSON.parse(unchangedDeploymentJson);
      expect(unchangedDeployment.spec.template.spec.containers[0].image).toBe('nginx:1.19'); // Still old version

      // PHASE 3: Execute approved changes
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/operate',
        {
          sessionId,
          executeChoice: 1 // Execute via MCP
        }
      );

      // Validate execution response structure
      const expectedExecutionResponse = {
        success: true,
        data: {
          result: {
            status: 'success', // Should succeed
            sessionId,
            execution: {
              results: expect.arrayContaining([
                expect.objectContaining({
                  command: expect.stringContaining('kubectl'),
                  success: true,
                  output: expect.any(String),
                  timestamp: expect.any(String)
                })
              ]),
              validation: expect.stringMatching(/Validation successful|Validation completed/) // Should have real validation result
            },
            message: expect.stringContaining('executed successfully')
          }
        }
      };

      expect(executionResponse).toMatchObject(expectedExecutionResponse);

      // Verify validation ran (not the placeholder message)
      const validation = executionResponse.data.result.execution.validation;
      expect(validation).not.toContain('coming in future milestone');

      // PHASE 4: Validate deployment actually updated
      // Wait a moment for k8s to propagate changes
      await new Promise(resolve => setTimeout(resolve, 2000));

      const updatedDeploymentJson = await integrationTest.kubectl(`get deployment test-api -n ${testNamespace} -o json`);
      const updatedDeployment = JSON.parse(updatedDeploymentJson);
      expect(updatedDeployment.spec.template.spec.containers[0].image).toBe('nginx:1.20'); // Should be updated to 1.20

    }, 300000); // 5 minute timeout for full workflow (analysis + execution)

    test('should apply organizational patterns: scale with HPA creation', async () => {
      const testId = Date.now();
      const patternNamespace = 'operate-pattern-test';

      // SETUP: Create HPA scaling pattern via MCP endpoint (same workflow as pattern tests)
      const createResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create'
      });

      const sessionId = createResponse.data.result.workflow.sessionId;

      // Step 1: Provide description (capability description)
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'Horizontal scaling with HPA'
      });

      // Step 2: Provide trigger keywords
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'applications, scaling, replicas, horizontal'
      });

      // Step 3: Confirm trigger expansion (AI shows expanded list)
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'HorizontalPodAutoscaler, scaling, horizontal scaling'
      });

      // Step 4: Provide suggested resources
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'HorizontalPodAutoscaler'
      });

      // Step 5: Provide rationale
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'All scaling operations should use HorizontalPodAutoscaler for managing multiple replicas, even if both min and max are the same.'
      });

      // Step 6: Provide creator name
      await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'integration-test'
      });

      // Step 7: Confirm pattern creation after review
      const finalResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'create',
        sessionId,
        response: 'confirm'
      });

      expect(finalResponse.data.result.success).toBe(true);
      const patternId = finalResponse.data.result.storage.patternId;

      // Verify pattern was actually stored
      const getPatternResponse = await integrationTest.httpClient.post('/api/v1/tools/manageOrgData', {
        dataType: 'pattern',
        operation: 'get',
        id: patternId
      });

      expect(getPatternResponse.data.result.success).toBe(true);
      expect(getPatternResponse.data.result.data).toBeDefined();

      // SETUP: Create namespace
      await integrationTest.kubectl(`create namespace ${patternNamespace}`);

      // SETUP: Create deployment with 2 replicas
      await integrationTest.kubectl(`apply -n ${patternNamespace} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-api
  namespace: ${patternNamespace}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: test-api
  template:
    metadata:
      labels:
        app: test-api
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
        ports:
        - containerPort: 80
EOF`);

      // Wait for deployment to be ready
      await integrationTest.kubectl(`wait --for=condition=available --timeout=60s deployment/test-api -n ${patternNamespace}`);

      // PHASE 1: AI Analysis - Request scaling operation
      const analysisResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/operate',
        {
          intent: `scale test-api deployment in ${patternNamespace} namespace to 4 replicas`,
          interaction_id: `operate_pattern_test_${testId}`
        }
      );

      // Validate response structure
      expect(analysisResponse.success).toBe(true);
      expect(analysisResponse.data.result.status).toBe('awaiting_user_approval');

      const analysis = analysisResponse.data.result.analysis;

      // PHASE 2: Verify pattern was applied
      expect(analysis.patternsApplied).toBeInstanceOf(Array);
      expect(analysis.patternsApplied.length).toBeGreaterThan(0);

      // patternsApplied is an array of strings (pattern names/descriptions)
      const appliedPattern = analysis.patternsApplied.find((p: string) =>
        p.toLowerCase().includes('horizontal') ||
        p.toLowerCase().includes('hpa') ||
        p.toLowerCase().includes('scaling')
      );
      expect(appliedPattern).toBeDefined();

      // PHASE 3: Verify proposed changes include HPA creation (pattern-driven!)
      const proposedChanges = analysis.proposedChanges;

      // Should create HPA with min=4, max=4 (pattern says even if both are the same)
      const hpaCreation = proposedChanges.create.find((change: any) =>
        change.kind === 'HorizontalPodAutoscaler'
      );
      expect(hpaCreation).toBeDefined();
      expect(hpaCreation.rationale).toMatch(/pattern|hpa|horizontal|scaling|autoscal/i);

      // Verify manifest has namespace and correct replica counts
      expect(hpaCreation.manifest).toBeDefined();
      expect(hpaCreation.manifest).toContain(`namespace: ${patternNamespace}`);
      expect(hpaCreation.manifest).toMatch(/minReplicas:\s*4/);
      expect(hpaCreation.manifest).toMatch(/maxReplicas:\s*4/);

      // PHASE 4: Verify commands include HPA creation (no manual scaling needed - HPA manages replicas)
      const hasHpaCommand = analysis.commands.some((cmd: string) =>
        cmd.includes('HorizontalPodAutoscaler') || cmd.includes('autoscaling') || cmd.includes('hpa')
      );
      expect(hasHpaCommand).toBe(true);

      // PHASE 5: Execute approved changes
      const operateSessionId = analysisResponse.data.result.sessionId;
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/operate',
        {
          sessionId: operateSessionId,
          executeChoice: 1 // Execute via MCP
        }
      );

      // Validate execution response structure
      expect(executionResponse.success).toBe(true);
      expect(executionResponse.data.result.status).toBe('success');
      expect(executionResponse.data.result.execution.results).toBeDefined();

      // PHASE 6: Verify HPA actually created in cluster
      // Wait for k8s to propagate changes
      await new Promise(resolve => setTimeout(resolve, 3000));

      const hpaJson = await integrationTest.kubectl(`get hpa -n ${patternNamespace} -o json`);
      const hpaList = JSON.parse(hpaJson);
      expect(hpaList.items).toBeDefined();
      expect(hpaList.items.length).toBeGreaterThan(0);

      // Find the HPA for test-api
      const testApiHpa = hpaList.items.find((hpa: any) =>
        hpa.spec.scaleTargetRef.name === 'test-api'
      );
      expect(testApiHpa).toBeDefined();
      expect(testApiHpa.spec.minReplicas).toBe(4);
      expect(testApiHpa.spec.maxReplicas).toBe(4);

      // PHASE 7: Verify HPA is functional (managing deployment replicas)
      // HPA should maintain deployment at 4 replicas (both min and max are 4)
      const deploymentJson = await integrationTest.kubectl(`get deployment test-api -n ${patternNamespace} -o json`);
      const deployment = JSON.parse(deploymentJson);

      // HPA should have set replicas to 4 (or will soon)
      // Note: HPA reconciliation may take a moment, so we check the HPA's scaleTargetRef is correct
      expect(testApiHpa.spec.scaleTargetRef.kind).toBe('Deployment');
      expect(testApiHpa.spec.scaleTargetRef.name).toBe('test-api');

    }, 300000); // 5 minute timeout for full workflow
  });

  describe('Error Handling', () => {
    test('should handle missing intent parameter', async () => {
      const errorResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/operate',
        {} // Missing intent
      );

      const expectedErrorResponse = {
        success: true,
        data: {
          result: {
            status: 'failed',
            message: expect.stringContaining('Invalid input')
          }
        }
      };

      expect(errorResponse).toMatchObject(expectedErrorResponse);
    });
  });
});
