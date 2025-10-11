/**
 * Integration Test: Remediate Tool
 *
 * Tests the complete remediation workflow via REST API against a real test cluster.
 * Validates AI-powered investigation, root cause analysis, remediation execution,
 * and actual cluster state fixes.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Remediate Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'remediate-test';

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Manual Mode Workflow', () => {
    test('should complete full workflow: setup broken deployment → investigate → execute → verify cluster fix', async () => {
      // SETUP: Create namespace
      await integrationTest.kubectl(`create namespace ${testNamespace}`);

      // SETUP: Create deployment with insufficient memory (will OOMKill)
      await integrationTest.kubectl(`apply -n ${testNamespace} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
  namespace: remediate-test
spec:
  replicas: 1
  selector:
    matchLabels:
      app: test-app
  template:
    metadata:
      labels:
        app: test-app
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

      // Wait for pod to start and crash at least once (with retry loop)
      let podData: any;
      let restartCountInitial = 0;
      const maxWaitTime = 90000; // 90 seconds max
      const checkInterval = 5000; // Check every 5 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const podsJson = await integrationTest.kubectl(
          `get pods -n ${testNamespace} -l app=test-app -o json`
        );

        // Skip if empty response (pods not ready yet)
        if (!podsJson || podsJson.trim() === '') {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }

        const podsData = JSON.parse(podsJson);
        if (podsData.items && podsData.items.length > 0) {
          podData = podsData.items[0];

          if (podData.status.containerStatuses && podData.status.containerStatuses[0]) {
            restartCountInitial = podData.status.containerStatuses[0].restartCount;
            if (restartCountInitial > 0) {
              break; // Pod has crashed and restarted
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      // Verify pod is in a problematic state (CrashLoopBackOff, Running but will crash, or Pending)
      expect(podData.status.phase).toMatch(/Running|Pending/);

      // Verify pod has restarted at least once (indicating OOM crashes)
      expect(restartCountInitial).toBeGreaterThan(0); // Should have crashed at least once

      // PHASE 1: AI Investigation
      const investigationResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        { 
          issue: `my app in ${testNamespace} namespace is crashing`,
          interaction_id: 'manual_analyze'
        }
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
                expect.stringMatching(/^kubectl_\w+ \(call \d+\)$/)
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
        { 
          executeChoice: 1, 
          sessionId, 
          mode: 'manual',
          interaction_id: 'manual_execute'
        }
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

      // Wait for deployment to rollout new pods with updated memory
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Get pod managed by deployment
      const afterPodsJson = await integrationTest.kubectl(
        `get pods -n ${testNamespace} -l app=test-app -o json`
      );
      const afterPodsData = JSON.parse(afterPodsJson);
      expect(afterPodsData.items.length).toBeGreaterThan(0);
      const afterPod = afterPodsData.items[0];

      // Verify pod is now running (not crashing)
      expect(afterPod.status.phase).toBe('Running');

      // Verify pod has not restarted since fix (restart count should be 0 for new pod)
      expect(afterPod.status.containerStatuses[0].restartCount).toBe(0);

      // Verify pod is actually healthy (Ready condition)
      const readyCondition = afterPod.status.conditions.find((c: any) => c.type === 'Ready');
      expect(readyCondition.status).toBe('True');

      // Verify deployment memory limit was increased (should be higher than original 128Mi)
      const deploymentJson = await integrationTest.kubectl(
        `get deployment test-app -n ${testNamespace} -o json`
      );
      const deploymentData = JSON.parse(deploymentJson);
      const memoryLimit = deploymentData.spec.template.spec.containers[0].resources.limits.memory;

      // Parse memory value and verify it's greater than 128Mi
      const memValue = parseInt(memoryLimit.replace(/Mi|Gi/, ''));
      const isGi = memoryLimit.includes('Gi');
      const actualMi = isGi ? memValue * 1024 : memValue;
      expect(actualMi).toBeGreaterThan(128); // AI should have increased from 128Mi


    }, 1200000); // 20 minute timeout for AI investigation + execution + validation (accommodates slower AI models like Gemini)
  });

  describe('Automatic Mode Workflow', () => {
    const autoNamespace = 'remediate-auto-test';

    test('should auto-execute remediation when confidence and risk thresholds are met', async () => {
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

      // Wait for pod to start and crash (with retry loop)
      let podData: any;
      let restartCount = 0;
      const maxWaitTime = 90000; // 90 seconds max
      const checkInterval = 5000; // Check every 5 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const podInfo = await integrationTest.kubectl(
          `get pod auto-test-pod -n ${autoNamespace} -o json`
        );

        // Skip if empty response (pod not ready yet)
        if (!podInfo || podInfo.trim() === '') {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }

        podData = JSON.parse(podInfo);

        if (podData.status.containerStatuses && podData.status.containerStatuses[0]) {
          restartCount = podData.status.containerStatuses[0].restartCount;
          if (restartCount > 0) {
            break; // Pod has crashed and restarted
          }
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      // Verify pod has crashed at least once
      expect(restartCount).toBeGreaterThan(0);

      // PHASE 1: Call remediate with automatic mode (single call auto-executes everything)
      const autoResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `auto-test-pod in ${autoNamespace} namespace is crashing`,
          mode: 'automatic',
          confidenceThreshold: 0.8,
          maxRiskLevel: 'high', // Allow high risk for auto-execution in test environment (different AI models assess risk differently)
          interaction_id: 'automatic_analyze_execute'
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

      // PHASE 2: Verify ACTUAL cluster remediation - outcome-based validation
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Get all pods in namespace - AI might create new pod or fix existing one
      const afterPodsJson = await integrationTest.kubectl(`get pods -n ${autoNamespace} -o json`);
      const afterPodsData = JSON.parse(afterPodsJson);

      // Should have at least one running stress workload pod
      const runningPods = afterPodsData.items.filter((pod: any) => 
        pod.status.phase === 'Running' &&
        pod.spec.containers.some((container: any) => container.image === 'polinux/stress')
      );
      expect(runningPods.length).toBeGreaterThan(0);

      // Should have no crashing pods (restart count = 0 means stable)
      const stablePod = runningPods[0];
      expect(stablePod.status.containerStatuses[0].restartCount).toBe(0);


    }, 1800000); // 30 minute timeout for automatic mode (accommodates slower AI models like OpenAI)
  });
});