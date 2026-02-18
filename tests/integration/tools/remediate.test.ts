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
      // Memory limit of 128Mi with stress requesting 250M causes intentional OOM crashes
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
        image: polinux/stress:1.0.4
        command: ["stress"]
        args: ["--vm", "1", "--vm-bytes", "250M", "--vm-hang", "1"]
        resources:
          limits:
            memory: "128Mi"
          requests:
            memory: "64Mi"
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
            sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.arrayContaining([
                expect.stringMatching(/^kubectl_\w+ \(call \d+\)$/)
              ])
            },
            analysis: {
              rootCause: expect.any(String),  // AI describes OOM/memory issue in various ways
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
            // PRD #320: Remediate tool returns visualizationUrl
            visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/rem-\d+-[a-f0-9]+$/),
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

      // PRD #320: Verify visualization URL is present in response (not embedded in message)
      expect(investigationResponse.data.result.visualizationUrl).toBeTruthy();
      expect(investigationResponse.data.result.visualizationUrl).toMatch(/^https?:\/\//);

      // Extract sessionId for execution
      const sessionId = investigationResponse.data.result.sessionId;
      const remediationActions = investigationResponse.data.result.remediation.actions;

      // Verify AI found OOM issue and memory-related remediation
      expect(investigationResponse.data.result.analysis.rootCause.toLowerCase()).toMatch(/oom|memory/);
      expect(investigationResponse.data.result.analysis.confidence).toBeGreaterThan(0.8);
      expect(remediationActions.length).toBeGreaterThan(0);

      // SESSION RETRIEVAL: Test GET /api/v1/sessions/{sessionId} for URL sharing/refresh support
      const sessionStartTime = Date.now();
      const sessionResponse = await integrationTest.httpClient.get(`/api/v1/sessions/${sessionId}`);
      const sessionRetrievalTime = Date.now() - sessionStartTime;

      // Should be fast (no AI call - just file read)
      expect(sessionRetrievalTime).toBeLessThan(1000); // Under 1 second

      // Validate session response structure
      const expectedSessionResponse = {
        success: true,
        data: {
          sessionId: sessionId,
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          data: {
            toolName: 'remediate',
            issue: expect.stringContaining(testNamespace),
            mode: 'manual',
            status: 'analysis_complete',
            finalAnalysis: {
              status: 'awaiting_user_approval',
              sessionId: sessionId,
              analysis: {
                rootCause: expect.any(String),
                confidence: expect.any(Number),
                factors: expect.any(Array)
              },
              remediation: {
                summary: expect.stringContaining('memory'),
                actions: expect.any(Array),
                risk: expect.stringMatching(/^(low|medium|high)$/)
              }
            }
          }
        },
        meta: {
          timestamp: expect.any(String),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(sessionResponse).toMatchObject(expectedSessionResponse);

      // NOTE: Visualization endpoint is tested in version.test.ts (fastest tool)

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

      // Validate execution response - commands were executed successfully
      // Note: Post-execution validation AI may return 'success' or 'awaiting_user_approval'
      // depending on its assessment. Both are valid when commands executed successfully.
      // Phase 3 below validates actual cluster state regardless.
      const expectedExecutionResponse = {
        success: true,
        data: {
          result: {
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
            })
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

      // Status: 'success' when validation confirms fix, 'awaiting_user_approval' when AI wants more investigation
      expect(['success', 'awaiting_user_approval']).toContain(executionResponse.data.result.status);

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

      // SETUP: Create deployment with insufficient memory (OOM scenario for automatic mode)
      // Using Deployment instead of Pod because Pods have immutable container specs
      // Memory limit of 128Mi with stress requesting 250M causes intentional OOM crashes
      await integrationTest.kubectl(`apply -n ${autoNamespace} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auto-test-app
  namespace: ${autoNamespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: auto-test-app
  template:
    metadata:
      labels:
        app: auto-test-app
    spec:
      containers:
      - name: stress
        image: polinux/stress:1.0.4
        command: ["stress"]
        args: ["--vm", "1", "--vm-bytes", "250M", "--vm-hang", "1"]
        resources:
          limits:
            memory: "128Mi"
          requests:
            memory: "64Mi"
EOF`);

      // Wait for pod to start and crash (with retry loop)
      let podData: any;
      let restartCount = 0;
      const maxWaitTime = 90000; // 90 seconds max
      const checkInterval = 5000; // Check every 5 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const podsJson = await integrationTest.kubectl(
          `get pods -n ${autoNamespace} -l app=auto-test-app -o json`
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
            restartCount = podData.status.containerStatuses[0].restartCount;
            if (restartCount > 0) {
              break; // Pod has crashed and restarted
            }
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
          issue: `auto-test-app deployment in ${autoNamespace} namespace is crashing`,
          mode: 'automatic',
          confidenceThreshold: 0.1, // Very low threshold ensures auto-execution - we're testing the mechanism, not AI confidence
          maxRiskLevel: 'high', // Allow any risk level - we're testing auto-execution works when thresholds are met
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
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for new pods to stabilize

      // Get all pods in namespace - deployment controller will create new pods after patch
      const afterPodsJson = await integrationTest.kubectl(`get pods -n ${autoNamespace} -l app=auto-test-app -o json`);
      const afterPodsData = JSON.parse(afterPodsJson);

      // Should have at least one running stress workload pod
      const runningPods = afterPodsData.items.filter((pod: any) =>
        pod.status.phase === 'Running' &&
        pod.spec.containers.some((container: any) => container.image === 'polinux/stress:1.0.4')
      );
      expect(runningPods.length).toBeGreaterThan(0);

      // Should have no crashing pods (restart count = 0 means stable with new memory limits)
      const stablePod = runningPods[0];
      expect(stablePod.status.containerStatuses[0].restartCount).toBe(0);


    }, 1800000); // 30 minute timeout for automatic mode (accommodates slower AI models like OpenAI)
  });

  describe('Helm Release Remediation', () => {
    const helmNamespace = 'remediate-helm-test';

    test('should detect Helm release issues using Helm investigation tools and remediate', async () => {
      const { execSync } = await import('child_process');
      const kubeconfig = process.env.KUBECONFIG || './kubeconfig-test.yaml';

      const runHelm = (cmd: string): string => {
        try {
          return execSync(`helm --kubeconfig=${kubeconfig} ${cmd}`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 180000
          });
        } catch (error: any) {
          return error.stdout || '';
        }
      };

      // SETUP: Create namespace and a test Helm chart
      await integrationTest.kubectl(`create namespace ${helmNamespace}`);
      execSync('rm -rf ./tmp/helm-remediate-test-chart');
      execSync('helm create ./tmp/helm-remediate-test-chart', { encoding: 'utf8', timeout: 30000 });

      // Install chart with known-good nginx image
      execSync(
        `helm --kubeconfig=${kubeconfig} install test-nginx ./tmp/helm-remediate-test-chart -n ${helmNamespace} --set image.tag=alpine --wait --timeout=120s`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 180000 }
      );

      // Verify initial deployment is healthy
      const initialPodsJson = await integrationTest.kubectl(
        `get pods -n ${helmNamespace} -l app.kubernetes.io/instance=test-nginx -o json`
      );
      const initialPodsData = JSON.parse(initialPodsJson);
      expect(initialPodsData.items.length).toBeGreaterThan(0);
      expect(initialPodsData.items[0].status.phase).toBe('Running');

      // BREAK: Upgrade with non-existent image (--wait fails, marking release as "failed")
      runHelm(
        `upgrade test-nginx ./tmp/helm-remediate-test-chart -n ${helmNamespace} --set image.repository=nonexistent-registry.invalid/nginx --set image.tag=doesnotexist --wait --timeout=60s`
      );

      // Wait for pods to be in ImagePullBackOff
      let podInErrorState = false;
      const maxWaitTime = 90000;
      const checkInterval = 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const podsJson = await integrationTest.kubectl(`get pods -n ${helmNamespace} -o json`);
        if (podsJson && podsJson.trim() !== '') {
          const podsData = JSON.parse(podsJson);
          for (const pod of podsData.items) {
            for (const cs of (pod.status?.containerStatuses || [])) {
              const waitReason = cs.state?.waiting?.reason;
              if (waitReason === 'ImagePullBackOff' || waitReason === 'ErrImagePull') {
                podInErrorState = true;
                break;
              }
            }
            if (podInErrorState) break;
          }
        }
        if (podInErrorState) break;
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      expect(podInErrorState).toBe(true);

      // PHASE 1: AI Investigation (manual mode to inspect Helm tool usage)
      const investigationResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `helm release test-nginx in ${helmNamespace} namespace was upgraded and is now failing`,
          interaction_id: 'helm_investigate'
        }
      );

      expect(investigationResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.arrayContaining([
                expect.stringMatching(/^(kubectl_|helm_)\w+ \(call \d+\)$/)
              ])
            },
            analysis: {
              rootCause: expect.any(String),
              confidence: expect.any(Number),
              factors: expect.arrayContaining([expect.any(String)])
            },
            remediation: {
              summary: expect.any(String),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  command: expect.any(String),
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
            visualizationUrl: expect.stringMatching(/^https:\/\/dot-ai-ui\.test\.local\/v\/rem-\d+-[a-f0-9]+$/),
            executionChoices: [
              {
                id: 1,
                label: 'Execute automatically via MCP',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/)
              },
              {
                id: 2,
                label: 'Execute via agent',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/)
              }
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
      });

      // KEY VALIDATION: AI used at least one Helm investigation tool
      const dataGathered: string[] = investigationResponse.data.result.investigation.dataGathered;
      const helmToolCalls = dataGathered.filter((entry: string) => entry.startsWith('helm_'));
      expect(helmToolCalls.length).toBeGreaterThan(0);

      // Verify AI identified the issue with reasonable confidence
      expect(investigationResponse.data.result.analysis.confidence).toBeGreaterThanOrEqual(0.7);
      expect(investigationResponse.data.result.analysis.rootCause.toLowerCase()).toMatch(/image|pull|helm|upgrade|fail/);
      expect(investigationResponse.data.result.remediation.actions.length).toBeGreaterThan(0);

      // PHASE 2: Execute remediation via MCP (choice 1)
      const sessionId = investigationResponse.data.result.sessionId;
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          executeChoice: 1,
          sessionId,
          mode: 'manual',
          interaction_id: 'helm_execute'
        }
      );

      expect(executionResponse).toMatchObject({
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
            executedCommands: expect.arrayContaining([expect.any(String)]),
            guidance: expect.stringContaining('REMEDIATION COMPLETE'),
            message: expect.stringContaining('resolved')
          },
          tool: 'remediate',
          executionTime: expect.any(Number)
        }
      });

      const results = executionResponse.data.result.results;
      results.forEach((result: any) => {
        expect(result.success).toBe(true);
      });

      // PHASE 3: Verify cluster recovery
      await new Promise(resolve => setTimeout(resolve, 15000));

      const afterPodsJson = await integrationTest.kubectl(
        `get pods -n ${helmNamespace} -l app.kubernetes.io/instance=test-nginx -o json`
      );
      const afterPodsData = JSON.parse(afterPodsJson);
      expect(afterPodsData.items.length).toBeGreaterThan(0);

      // At least one pod should be running and ready (recovered from bad image)
      const healthyPods = afterPodsData.items.filter((pod: any) =>
        pod.status.phase === 'Running' &&
        pod.status.containerStatuses?.[0]?.ready === true
      );
      expect(healthyPods.length).toBeGreaterThan(0);

      // Recovered pod should have zero restarts (fresh pod after rollback/fix)
      expect(healthyPods[0].status.containerStatuses[0].restartCount).toBe(0);

    }, 1200000); // 20 minute timeout
  });
});