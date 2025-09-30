/**
 * Integration Test: Remediate Tool
 *
 * Tests the complete remediation workflow via REST API against a real test cluster.
 * Validates AI-powered investigation, root cause analysis, remediation execution,
 * and actual cluster state fixes.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Remediate Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'remediate-test';

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  afterAll(async () => {
    // Cleanup test namespace
    try {
      await integrationTest.kubectl(`delete namespace ${testNamespace} --wait=false`);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Manual Mode Workflow', () => {
    test('should complete full workflow: setup broken pod → investigate → execute → verify cluster fix', async () => {
      // SETUP: Create namespace
      await integrationTest.kubectl(`create namespace ${testNamespace}`);

      // SETUP: Create pod with insufficient memory (will OOMKill)
      await integrationTest.kubectl(`apply -n ${testNamespace} -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: test-pod
  namespace: ${testNamespace}
spec:
  containers:
  - name: stress
    image: polinux/stress
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "250M", "--vm-hang", "1"]
    resources:
      limits:
        memory: "128Mi"
EOF`);

      // Wait for pod to start and crash at least once (30 seconds should be enough)
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Verify pod exists and is in crashed/crashing state
      const podInfo = await integrationTest.kubectl(
        `get pod test-pod -n ${testNamespace} -o json`
      );
      const podData = JSON.parse(podInfo);

      // Verify pod is in a problematic state (CrashLoopBackOff, Running but will crash, or Pending)
      expect(podData.status.phase).toMatch(/Running|Pending/);

      // Verify pod has restarted at least once (indicating OOM crashes)
      const restartCount = podData.status.containerStatuses[0].restartCount;
      expect(restartCount).toBeGreaterThan(0); // Should have crashed at least once

      // PHASE 1: AI Investigation
      const investigationResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        { issue: `test-pod in ${testNamespace} namespace is crashing` }
      );

      // Validate investigation response (based on actual curl inspection)
      const expectedInvestigationResponse = {
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^rem_\d{4}-\d{2}-\d{2}T\d{4}_[a-f0-9]{16}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.arrayContaining([
                expect.stringContaining('Analyzed')
              ])
            },
            analysis: {
              rootCause: expect.stringContaining('OOM'),
              confidence: expect.any(Number),
              factors: expect.any(Array)
            },
            remediation: {
              summary: expect.stringContaining('memory'),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  command: expect.stringContaining('kubectl'),
                  risk: expect.stringMatching(/^(low|medium|high)$/),
                  rationale: expect.any(String)
                })
              ]),
              risk: expect.stringMatching(/^(low|medium|high)$/)
            },
            validationIntent: expect.any(String),
            executed: false,
            mode: 'manual',
            guidance: expect.stringContaining('CRITICAL'),
            agentInstructions: expect.stringContaining('Show the user'),
            nextAction: 'remediate',
            message: expect.any(String),
            executionChoices: [
              expect.objectContaining({
                id: 1,
                label: 'Execute automatically via MCP',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/)
              }),
              expect.objectContaining({
                id: 2,
                label: 'Execute via agent',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/)
              })
            ]
          },
          tool: 'remediate',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(investigationResponse).toMatchObject(expectedInvestigationResponse);

      // Extract sessionId for execution
      const sessionId = investigationResponse.data.result.sessionId;
      const remediationActions = investigationResponse.data.result.remediation.actions;

      // Verify AI found OOM issue and memory-related remediation
      expect(investigationResponse.data.result.analysis.rootCause.toLowerCase()).toMatch(/oom|memory/);
      expect(investigationResponse.data.result.analysis.confidence).toBeGreaterThan(0.8);
      expect(remediationActions.length).toBeGreaterThan(0);

      // PHASE 2: Execute remediation via MCP (choice 1)
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        { executeChoice: 1, sessionId, mode: 'manual' }
      );

      // Validate execution response (based on actual curl inspection)
      const expectedExecutionResponse = {
        success: true,
        data: {
          result: {
            status: 'success',
            sessionId: sessionId,
            executed: true,
            results: expect.arrayContaining([
              expect.objectContaining({
                action: expect.any(String),
                success: true,
                timestamp: expect.any(String)
              })
            ]),
            executedCommands: expect.any(Array),
            analysis: expect.objectContaining({
              rootCause: expect.any(String),
              confidence: expect.any(Number)
            }),
            remediation: expect.objectContaining({
              summary: expect.any(String),
              actions: expect.any(Array),
              risk: expect.stringMatching(/^(low|medium|high)$/)
            }),
            investigation: expect.objectContaining({
              iterations: expect.any(Number)
            }),
            validation: expect.objectContaining({
              success: true // Validation should confirm the fix worked
            }),
            guidance: expect.stringContaining('REMEDIATION COMPLETE'),
            message: expect.stringContaining('resolved')
          },
          tool: 'remediate',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(executionResponse).toMatchObject(expectedExecutionResponse);

      // Verify all remediation commands succeeded
      const results = executionResponse.data.result.results;
      results.forEach((result: any) => {
        expect(result.success).toBe(true);
      });

      // PHASE 3: Verify ACTUAL cluster remediation ✅ KEY VALIDATION

      // Wait for pod to be recreated and stabilize
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verify pod is now running (not crashing)
      const afterStatus = await integrationTest.kubectl(
        `get pod test-pod -n ${testNamespace} -o jsonpath='{.status.phase}'`
      );
      expect(afterStatus).toBe('Running');

      // Verify pod has not restarted since fix (restart count should be 0 for new pod)
      const afterRestartCount = await integrationTest.kubectl(
        `get pod test-pod -n ${testNamespace} -o jsonpath='{.status.containerStatuses[0].restartCount}'`
      );
      expect(parseInt(afterRestartCount)).toBe(0); // New pod should have no restarts

      // Verify pod is actually healthy (Ready condition)
      const readyCondition = await integrationTest.kubectl(
        `get pod test-pod -n ${testNamespace} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`
      );
      expect(readyCondition).toBe('True');

      // Verify memory limit was increased (should be higher than original 128Mi)
      const memoryLimit = await integrationTest.kubectl(
        `get pod test-pod -n ${testNamespace} -o jsonpath='{.spec.containers[0].resources.limits.memory}'`
      );
      // Parse memory value and verify it's greater than 128Mi
      const memValue = parseInt(memoryLimit.replace(/Mi|Gi/, ''));
      const isGi = memoryLimit.includes('Gi');
      const actualMi = isGi ? memValue * 1024 : memValue;
      expect(actualMi).toBeGreaterThan(128); // AI should have increased from 128Mi

    }, 300000); // 5 minute timeout for AI investigation + execution + validation
  });

  describe('Automatic Mode Workflow', () => {
    test('should auto-execute remediation when confidence and risk thresholds are met', async () => {
      const autoNamespace = 'remediate-auto-test';

      // SETUP: Create namespace
      await integrationTest.kubectl(`create namespace ${autoNamespace}`);

      // SETUP: Create pod with insufficient memory (same OOM scenario, but automatic mode)
      await integrationTest.kubectl(`apply -n ${autoNamespace} -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: auto-test-pod
  namespace: ${autoNamespace}
spec:
  containers:
  - name: stress
    image: polinux/stress
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "250M", "--vm-hang", "1"]
    resources:
      limits:
        memory: "128Mi"
EOF`);

      // Wait for pod to start and crash
      await new Promise(resolve => setTimeout(resolve, 30000));

      // Verify pod is crashing
      const podInfo = await integrationTest.kubectl(
        `get pod auto-test-pod -n ${autoNamespace} -o json`
      );
      const podData = JSON.parse(podInfo);
      expect(podData.status.containerStatuses[0].restartCount).toBeGreaterThan(0);

      // PHASE 1: Call remediate with automatic mode (single call auto-executes everything)
      const autoResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `auto-test-pod in ${autoNamespace} namespace is crashing`,
          mode: 'automatic',
          confidenceThreshold: 0.8,
          maxRiskLevel: 'medium' // Allow medium risk for auto-execution
        }
      );

      // Validate automatic execution response
      const expectedAutoResponse = {
        success: true,
        data: {
          result: {
            status: 'success',
            executed: true, // KEY: Should auto-execute without user approval
            results: expect.arrayContaining([
              expect.objectContaining({
                success: true
              })
            ]),
            validation: {
              success: true // Validation should confirm the fix worked
            }
          }
        }
      };

      expect(autoResponse).toMatchObject(expectedAutoResponse);

      // Verify execution was automatic (no executionChoices)
      expect(autoResponse.data.result.executionChoices).toBeUndefined();

      // Verify all remediation commands succeeded
      const results = autoResponse.data.result.results;
      results.forEach((result: any) => {
        expect(result.success).toBe(true);
      });

      // PHASE 2: Verify ACTUAL cluster remediation
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verify pod is now running
      const afterStatus = await integrationTest.kubectl(
        `get pod auto-test-pod -n ${autoNamespace} -o jsonpath='{.status.phase}'`
      );
      expect(afterStatus).toBe('Running');

      // Verify pod has no restarts (new healthy pod)
      const afterRestartCount = await integrationTest.kubectl(
        `get pod auto-test-pod -n ${autoNamespace} -o jsonpath='{.status.containerStatuses[0].restartCount}'`
      );
      expect(parseInt(afterRestartCount)).toBe(0);

      // Cleanup
      await integrationTest.kubectl(`delete namespace ${autoNamespace} --wait=false`);

    }, 300000); // 5 minute timeout for automatic mode
  });
});