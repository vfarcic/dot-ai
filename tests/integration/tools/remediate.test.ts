/**
 * Integration Test: Remediate Tool
 *
 * Tests the complete remediation workflow via REST API against a real test cluster.
 * Validates AI-powered investigation, root cause analysis, remediation execution,
 * and actual cluster state fixes.
 */

import { describe, test, expect, beforeAll, onTestFinished } from 'vitest';
import * as http from 'http';
import { IntegrationTest } from '../helpers/test-base.js';

const SSE_BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:3456';

/**
 * Open an SSE connection and collect raw chunks.
 */
function openSSE(path: string): {
  chunks: string[];
  response: Promise<http.IncomingMessage>;
  close: () => void;
} {
  const chunks: string[] = [];
  let resolveResponse: (res: http.IncomingMessage) => void;
  const response = new Promise<http.IncomingMessage>((resolve) => {
    resolveResponse = resolve;
  });

  const url = new URL(path, SSE_BASE_URL);
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  const authToken = process.env.DOT_AI_AUTH_TOKEN;
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const req = http.get(url, { headers }, (res) => {
    resolveResponse(res);
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      chunks.push(chunk);
    });
  });

  return {
    chunks,
    response,
    close: () => req.destroy(),
  };
}

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

          if (
            podData.status.containerStatuses &&
            podData.status.containerStatuses[0]
          ) {
            restartCountInitial =
              podData.status.containerStatuses[0].restartCount;
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

      // SSE: Open streaming connection BEFORE remediation to capture real-time events
      const sse = openSSE('/api/v1/events/remediations');
      onTestFinished(() => sse.close());
      const sseResponse = await sse.response;

      // Verify SSE headers immediately on connect
      expect(sseResponse.statusCode).toBe(200);
      expect(sseResponse.headers).toMatchObject({
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });

      // PHASE 1: AI Investigation
      const investigationResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `my app in ${testNamespace} namespace is crashing`,
          interaction_id: 'manual_analyze',
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
                expect.stringMatching(/^kubectl_\w+ \(call \d+\)$/),
              ]),
            },
            analysis: {
              rootCause: expect.any(String), // AI describes OOM/memory issue in various ways
              confidence: expect.any(Number),
              factors: expect.any(Array),
            },
            remediation: {
              summary: expect.stringContaining('memory'),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  command: expect.stringContaining('kubectl'),
                  risk: expect.stringMatching(/^(low|medium|high)$/),
                  rationale: expect.any(String),
                }),
              ]),
              risk: expect.stringMatching(/^(low|medium|high)$/),
            },
            validationIntent: expect.any(String),
            executed: false,
            mode: 'manual',
            guidance: expect.stringContaining('CRITICAL'),
            agentInstructions: expect.stringMatching(
              /Show the user.*impact_analysis/s
            ),
            nextAction: 'remediate',
            message: expect.any(String),
            // PRD #320: Remediate tool returns visualizationUrl
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/rem-\d+-[a-f0-9]+$/
            ),
            executionChoices: [
              expect.objectContaining({
                id: 1,
                label: 'Execute automatically via MCP',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/),
              }),
              expect.objectContaining({
                id: 2,
                label: 'Execute via agent',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/),
              }),
            ],
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(
        investigationResponse,
        `Manual mode investigation failed: ${JSON.stringify(investigationResponse.error || investigationResponse.data?.result?.error || 'no error field')}`
      ).toMatchObject(expectedInvestigationResponse);

      // PRD #320: Verify visualization URL is present in response (not embedded in message)
      expect(investigationResponse.data.result.visualizationUrl).toBeTruthy();
      expect(investigationResponse.data.result.visualizationUrl).toMatch(
        /^https?:\/\//
      );

      // Extract sessionId for execution
      const sessionId = investigationResponse.data.result.sessionId;
      const remediationActions =
        investigationResponse.data.result.remediation.actions;

      // Verify AI found OOM issue and memory-related remediation
      expect(
        investigationResponse.data.result.analysis.rootCause.toLowerCase()
      ).toMatch(/oom|memory/);
      expect(
        investigationResponse.data.result.analysis.confidence
      ).toBeGreaterThan(0.8);
      expect(remediationActions.length).toBeGreaterThan(0);

      // PRD #407: Non-GitOps resources should NOT have gitSource in remediation actions
      const gitSourceActions = remediationActions.filter(
        (a: any) => a.gitSource
      );
      expect(gitSourceActions.length).toBe(0);

      // SESSION RETRIEVAL: Test GET /api/v1/sessions/{sessionId} for URL sharing/refresh support
      const sessionStartTime = Date.now();
      const sessionResponse = await integrationTest.httpClient.get(
        `/api/v1/sessions/${sessionId}`
      );
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
                factors: expect.any(Array),
              },
              remediation: {
                summary: expect.stringContaining('memory'),
                actions: expect.any(Array),
                risk: expect.stringMatching(/^(low|medium|high)$/),
              },
            },
          },
        },
        meta: {
          timestamp: expect.any(String),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(sessionResponse).toMatchObject(expectedSessionResponse);

      // SESSION LIST: Test GET /api/v1/sessions (PRD #425)
      const listResponse = await integrationTest.httpClient.get(
        '/api/v1/sessions'
      );

      expect(listResponse).toMatchObject({
        success: true,
        data: {
          sessions: expect.any(Array),
          total: expect.any(Number),
          limit: 50,
          offset: 0,
        },
        meta: {
          timestamp: expect.any(String),
          requestId: expect.any(String),
          version: 'v1',
        },
      });

      // Verify our session appears in the list
      const sessions = listResponse.data.sessions as Array<Record<string, unknown>>;
      const ourSession = sessions.find((s) => s.sessionId === sessionId);
      expect(ourSession).toBeDefined();
      expect(ourSession).toMatchObject({
        sessionId: sessionId,
        status: 'analysis_complete',
        issue: expect.stringContaining(testNamespace),
        mode: 'manual',
        toolName: 'remediate',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      // Verify no finalAnalysis leakage in list response
      expect(ourSession).not.toHaveProperty('finalAnalysis');
      expect(ourSession).not.toHaveProperty('data');

      // Verify status filtering works
      const filteredResponse = await integrationTest.httpClient.get(
        '/api/v1/sessions?status=analysis_complete'
      );
      expect(filteredResponse.success).toBe(true);
      const filteredSessions = filteredResponse.data.sessions as Array<Record<string, unknown>>;
      for (const s of filteredSessions) {
        expect(s.status).toBe('analysis_complete');
      }
      expect(filteredSessions.some((s) => s.sessionId === sessionId)).toBe(true);

      // Verify pagination works
      const paginatedResponse = await integrationTest.httpClient.get(
        '/api/v1/sessions?limit=1&offset=0'
      );
      expect(paginatedResponse).toMatchObject({
        success: true,
        data: {
          sessions: expect.any(Array),
          limit: 1,
          offset: 0,
        },
      });
      expect(paginatedResponse.data.sessions.length).toBeLessThanOrEqual(1);

      // Verify empty filter returns no results
      const emptyResponse = await integrationTest.httpClient.get(
        '/api/v1/sessions?status=nonexistent_status_xyz'
      );
      expect(emptyResponse).toMatchObject({
        success: true,
        data: {
          sessions: [],
          total: 0,
        },
      });

      // NOTE: Visualization endpoint is tested in version.test.ts (fastest tool)

      // PHASE 2: Execute remediation via MCP (choice 1)
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          executeChoice: 1,
          sessionId,
          mode: 'manual',
          interaction_id: 'manual_execute',
        }
      );

      // Execution response status is either 'success' or 'awaiting_user_approval'.
      // Cluster state is verified directly in Phase 3 regardless of status.
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
                timestamp: expect.any(String),
              }),
            ]),
            executedCommands: expect.any(Array),
            analysis: expect.objectContaining({
              rootCause: expect.any(String),
              confidence: expect.any(Number),
            }),
            remediation: expect.objectContaining({
              summary: expect.any(String),
              actions: expect.any(Array),
              risk: expect.stringMatching(/^(low|medium|high)$/),
            }),
            investigation: expect.objectContaining({
              iterations: expect.any(Number),
            }),
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(executionResponse).toMatchObject(expectedExecutionResponse);

      // Status: 'success' when validation confirms fix, 'awaiting_user_approval' when AI wants more investigation
      expect(['success', 'awaiting_user_approval']).toContain(
        executionResponse.data.result.status
      );

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
      const readyCondition = afterPod.status.conditions.find(
        (c: any) => c.type === 'Ready'
      );
      expect(readyCondition.status).toBe('True');

      // Verify deployment memory limit was increased (should be higher than original 128Mi)
      const deploymentJson = await integrationTest.kubectl(
        `get deployment test-app -n ${testNamespace} -o json`
      );
      const deploymentData = JSON.parse(deploymentJson);
      const memoryLimit =
        deploymentData.spec.template.spec.containers[0].resources.limits.memory;

      // Parse memory value and verify it's greater than 128Mi
      const memValue = parseInt(memoryLimit.replace(/Mi|Gi/, ''));
      const isGi = memoryLimit.includes('Gi');
      const actualMi = isGi ? memValue * 1024 : memValue;
      expect(actualMi).toBeGreaterThan(128); // AI should have increased from 128Mi

      // PHASE 4: Verify SSE events received during remediation (PRD #425)
      const allSSEData = sse.chunks.join('');

      // Should have received session-created when investigation started
      expect(allSSEData).toContain('event: session-created');

      // Should have received session-updated as status changed
      expect(allSSEData).toContain('event: session-updated');

      // Verify events reference the correct session
      expect(allSSEData).toContain(`"sessionId":"${sessionId}"`);
      expect(allSSEData).toContain('"toolName":"remediate"');

      // Verify all SSE data lines are valid JSON with expected shape
      const dataLines = allSSEData
        .split('\n')
        .filter((line) => line.startsWith('data: '));
      expect(dataLines.length).toBeGreaterThanOrEqual(2); // At least created + updated

      for (const line of dataLines) {
        const parsed = JSON.parse(line.replace('data: ', ''));
        expect(parsed).toMatchObject({
          sessionId: expect.any(String),
          toolName: 'remediate',
          status: expect.any(String),
          issue: expect.any(String),
          timestamp: expect.any(String),
        });
      }

      // Verify server is still healthy after SSE disconnect
      const healthResponse = await integrationTest.httpClient.get('/api/v1/sessions');
      expect(healthResponse.success).toBe(true);
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

          if (
            podData.status.containerStatuses &&
            podData.status.containerStatuses[0]
          ) {
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
          interaction_id: 'automatic_analyze_execute',
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
                success: true,
              }),
            ]),
            validation: {
              success: true, // Validation should confirm the fix worked
            },
          },
        },
      };

      expect(
        autoResponse,
        `Auto mode failed: ${JSON.stringify(autoResponse.error || autoResponse.data?.result?.error || 'no error field')}`
      ).toMatchObject(expectedAutoResponse);

      // Verify execution was automatic (no executionChoices)
      expect(autoResponse.data.result.executionChoices).toBeUndefined();

      // Verify all remediation commands succeeded
      const results = autoResponse.data.result.results;
      results.forEach((result: any) => {
        expect(result.success).toBe(true);
      });

      // PRD #407: Non-GitOps resources should NOT have gitSource in remediation actions
      const autoActions = autoResponse.data.result.remediation?.actions || [];
      const autoGitSourceActions = autoActions.filter((a: any) => a.gitSource);
      expect(autoGitSourceActions.length).toBe(0);

      // PHASE 2: Verify ACTUAL cluster remediation - outcome-based validation
      await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for new pods to stabilize

      // Get all pods in namespace - deployment controller will create new pods after patch
      const afterPodsJson = await integrationTest.kubectl(
        `get pods -n ${autoNamespace} -l app=auto-test-app -o json`
      );
      const afterPodsData = JSON.parse(afterPodsJson);

      // Should have at least one running stress workload pod
      const runningPods = afterPodsData.items.filter(
        (pod: any) =>
          pod.status.phase === 'Running' &&
          pod.spec.containers.some(
            (container: any) => container.image === 'polinux/stress:1.0.4'
          )
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
            timeout: 180000,
          });
        } catch (error: unknown) {
          return (error as { stdout?: string }).stdout || '';
        }
      };

      // SETUP: Create namespace and a test Helm chart
      await integrationTest.kubectl(`create namespace ${helmNamespace}`);
      execSync('rm -rf ./tmp/helm-remediate-test-chart');
      execSync('helm create ./tmp/helm-remediate-test-chart', {
        encoding: 'utf8',
        timeout: 30000,
      });

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
        const podsJson = await integrationTest.kubectl(
          `get pods -n ${helmNamespace} -o json`
        );
        if (podsJson && podsJson.trim() !== '') {
          const podsData = JSON.parse(podsJson);
          for (const pod of podsData.items) {
            for (const cs of pod.status?.containerStatuses || []) {
              const waitReason = cs.state?.waiting?.reason;
              if (
                waitReason === 'ImagePullBackOff' ||
                waitReason === 'ErrImagePull'
              ) {
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
          interaction_id: 'helm_investigate',
        }
      );

      expect(
        investigationResponse,
        `Helm investigation failed: ${JSON.stringify(investigationResponse.error || investigationResponse.data?.result?.error || 'no error field')}`
      ).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.arrayContaining([
                expect.stringMatching(/^(kubectl_|helm_)\w+ \(call \d+\)$/),
              ]),
            },
            analysis: {
              rootCause: expect.any(String),
              confidence: expect.any(Number),
              factors: expect.arrayContaining([expect.any(String)]),
            },
            remediation: {
              summary: expect.any(String),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  command: expect.any(String),
                  risk: expect.stringMatching(/^(low|medium|high)$/),
                  rationale: expect.any(String),
                }),
              ]),
              risk: expect.stringMatching(/^(low|medium|high)$/),
            },
            validationIntent: expect.any(String),
            executed: false,
            mode: 'manual',
            guidance: expect.stringContaining('CRITICAL'),
            agentInstructions: expect.stringMatching(
              /Show the user.*impact_analysis/s
            ),
            nextAction: 'remediate',
            message: expect.any(String),
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/rem-\d+-[a-f0-9]+$/
            ),
            executionChoices: [
              {
                id: 1,
                label: 'Execute automatically via MCP',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/),
              },
              {
                id: 2,
                label: 'Execute via agent',
                description: expect.any(String),
                risk: expect.stringMatching(/^(low|medium|high)$/),
              },
            ],
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      });

      // KEY VALIDATION: AI used at least one Helm investigation tool
      const dataGathered: string[] =
        investigationResponse.data.result.investigation.dataGathered;
      const helmToolCalls = dataGathered.filter((entry: string) =>
        entry.startsWith('helm_')
      );
      expect(helmToolCalls.length).toBeGreaterThan(0);

      // Verify AI identified the issue with reasonable confidence
      expect(
        investigationResponse.data.result.analysis.confidence
      ).toBeGreaterThanOrEqual(0.7);
      expect(
        investigationResponse.data.result.analysis.rootCause.toLowerCase()
      ).toMatch(/image|pull|helm|upgrade|fail/);
      expect(
        investigationResponse.data.result.remediation.actions.length
      ).toBeGreaterThan(0);

      // PRD #407: Non-GitOps resources should NOT have gitSource in remediation actions
      const helmGitSourceActions =
        investigationResponse.data.result.remediation.actions.filter(
          (a: any) => a.gitSource
        );
      expect(helmGitSourceActions.length).toBe(0);

      // PHASE 2: Execute remediation via MCP (choice 1)
      const sessionId = investigationResponse.data.result.sessionId;
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          executeChoice: 1,
          sessionId,
          mode: 'manual',
          interaction_id: 'helm_execute',
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
                timestamp: expect.any(String),
              }),
            ]),
            executedCommands: expect.arrayContaining([expect.any(String)]),
            guidance: expect.stringContaining('REMEDIATION COMPLETE'),
            message: expect.stringContaining('resolved'),
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
      });

      const results = executionResponse.data.result.results;
      results.forEach((result: { success: boolean }) => {
        expect(result).toMatchObject({ success: true });
      });

      // PHASE 3: Verify cluster recovery
      await new Promise(resolve => setTimeout(resolve, 15000));

      const afterPodsJson = await integrationTest.kubectl(
        `get pods -n ${helmNamespace} -l app.kubernetes.io/instance=test-nginx -o json`
      );
      const afterPodsData = JSON.parse(afterPodsJson);
      expect(afterPodsData.items.length).toBeGreaterThan(0);

      // At least one pod should be running and ready (recovered from bad image)
      const healthyPods = afterPodsData.items.filter(
        (pod: {
          status: {
            phase: string;
            containerStatuses?: Array<{ ready: boolean; restartCount: number }>;
          };
        }) =>
          pod.status.phase === 'Running' &&
          pod.status.containerStatuses?.[0]?.ready === true
      );
      expect(healthyPods.length).toBeGreaterThan(0);

      // Recovered pod should have zero restarts (fresh pod after rollback/fix)
      expect(healthyPods[0].status.containerStatuses[0].restartCount).toBe(0);
    }, 1200000); // 20 minute timeout
  });

  describe('MCP Server Integration - Prometheus', () => {
    const mcpNamespace = 'remediate-mcp-test';

    test('should use Prometheus MCP tools during investigation when metrics data is relevant', async () => {
      // SETUP: Create namespace
      await integrationTest.kubectl(`create namespace ${mcpNamespace}`);

      // SETUP: Create deployment with insufficient memory (will OOMKill)
      // Lightweight OOM scenario to avoid overburdening KinD cluster:
      // stress requests 80M but limit is 48Mi, guaranteeing OOM crash
      await integrationTest.kubectl(`apply -n ${mcpNamespace} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-test-app
  namespace: ${mcpNamespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-test-app
  template:
    metadata:
      labels:
        app: mcp-test-app
    spec:
      containers:
      - name: stress
        image: polinux/stress:1.0.4
        command: ["stress"]
        args: ["--vm", "1", "--vm-bytes", "80M", "--vm-hang", "1"]
        resources:
          limits:
            memory: "48Mi"
          requests:
            memory: "24Mi"
EOF`);

      // Wait for pod to start and crash at least once (OOM)
      let restartCount = 0;
      const maxWaitTime = 90000;
      const checkInterval = 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        const podsJson = await integrationTest.kubectl(
          `get pods -n ${mcpNamespace} -l app=mcp-test-app -o json`
        );

        if (!podsJson || podsJson.trim() === '') {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }

        const podsData = JSON.parse(podsJson);
        if (podsData.items && podsData.items.length > 0) {
          const podData = podsData.items[0];
          if (
            podData.status.containerStatuses &&
            podData.status.containerStatuses[0]
          ) {
            restartCount = podData.status.containerStatuses[0].restartCount;
            if (restartCount > 0) {
              break;
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      // Verify pod has crashed at least once
      expect(restartCount).toBeGreaterThan(0);

      // Poll Prometheus until container metrics are available for the test namespace
      const prometheusUrl = 'http://dot-ai-prometheus-server.dot-ai.svc:80';
      const metricsQuery = `container_memory_usage_bytes{namespace="${mcpNamespace}"}`;
      const pollMaxWait = 90000;
      const pollInterval = 5000;
      const pollStart = Date.now();
      let metricsFound = false;

      while (Date.now() - pollStart < pollMaxWait) {
        const result = await integrationTest.kubectl(
          `run prom-poll-${Date.now()} --image=curlimages/curl:latest --restart=Never --rm -i --timeout=10s -- curl -sf "${prometheusUrl}/api/v1/query?query=${encodeURIComponent(metricsQuery)}" 2>/dev/null || true`
        );
        if (result.includes('"result":[{')) {
          metricsFound = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      expect(
        metricsFound,
        'Prometheus did not scrape container metrics within timeout'
      ).toBe(true);

      // INVESTIGATION: Call remediate with issue description that encourages metrics usage
      const investigationResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `Pods in ${mcpNamespace} namespace keep crashing. Check the memory metrics from prometheus to understand the actual memory usage trends before suggesting fixes.`,
          interaction_id: 'mcp_prometheus_investigate',
        }
      );

      // Validate standard investigation response structure
      const expectedResponse = {
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.any(Array),
            },
            analysis: {
              rootCause: expect.any(String),
              confidence: expect.any(Number),
              factors: expect.any(Array),
            },
            remediation: {
              summary: expect.any(String),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  command: expect.stringContaining('kubectl'),
                  risk: expect.stringMatching(/^(low|medium|high)$/),
                  rationale: expect.any(String),
                }),
              ]),
              risk: expect.stringMatching(/^(low|medium|high)$/),
            },
            executed: false,
            mode: 'manual',
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
      };

      expect(
        investigationResponse,
        `MCP investigation failed: ${JSON.stringify(investigationResponse.error || investigationResponse.data?.result?.error || 'no error field')}`
      ).toMatchObject(expectedResponse);

      // KEY VALIDATION: AI used at least one Prometheus MCP tool
      const dataGathered: string[] =
        investigationResponse.data.result.investigation.dataGathered;
      const prometheusToolCalls = dataGathered.filter((entry: string) =>
        entry.startsWith('prometheus__')
      );
      expect(prometheusToolCalls.length).toBeGreaterThan(0);

      // Verify kubectl tools were also used (combined investigation)
      const kubectlToolCalls = dataGathered.filter((entry: string) =>
        entry.startsWith('kubectl_')
      );
      expect(kubectlToolCalls.length).toBeGreaterThan(0);

      // Verify AI identified memory/OOM as root cause
      expect(
        investigationResponse.data.result.analysis.rootCause.toLowerCase()
      ).toMatch(/oom|memory/);
      expect(
        investigationResponse.data.result.analysis.confidence
      ).toBeGreaterThan(0.7);
      expect(
        investigationResponse.data.result.remediation.actions.length
      ).toBeGreaterThan(0);
    }, 1200000); // 20 minute timeout
  });

  describe('GitOps-Managed Resource: Argo CD', () => {
    const argoNamespace = 'remediate-gitops-argocd';
    const testRepoUrl = 'https://github.com/vfarcic/dot-ai.git';
    const fixturePath = 'tests/integration/fixtures/gitops/broken-app';

    test('should detect Argo CD management and return gitSource-based remediation', async () => {
      // SETUP: Create target namespace and Argo CD Application
      await integrationTest.kubectl(`create namespace ${argoNamespace}`);

      await integrationTest.kubectl(`apply -f - <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: gitops-test-argocd
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ${testRepoUrl}
    targetRevision: main
    path: ${fixturePath}
  destination:
    server: https://kubernetes.default.svc
    namespace: ${argoNamespace}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=false
EOF`);

      // Wait for Argo CD to sync the broken deployment into the namespace
      const maxWaitTime = 120000;
      const checkInterval = 5000;
      const startTime = Date.now();
      let deploymentExists = false;

      while (Date.now() - startTime < maxWaitTime) {
        const deployJson = await integrationTest.kubectl(
          `get deployment gitops-test-app -n ${argoNamespace} -o json 2>/dev/null`
        );
        if (deployJson && deployJson.trim() !== '') {
          deploymentExists = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      expect(deploymentExists).toBe(true);

      // Wait for pods to enter ImagePullBackOff (broken image: nginx:v999-nonexistent)
      let podInErrorState = false;
      const podStartTime = Date.now();

      while (Date.now() - podStartTime < maxWaitTime) {
        const podsJson = await integrationTest.kubectl(
          `get pods -n ${argoNamespace} -l app=gitops-test-app -o json`
        );
        if (podsJson && podsJson.trim() !== '') {
          const podsData = JSON.parse(podsJson);
          for (const pod of podsData.items) {
            for (const cs of pod.status?.containerStatuses || []) {
              const waitReason = cs.state?.waiting?.reason;
              if (
                waitReason === 'ImagePullBackOff' ||
                waitReason === 'ErrImagePull'
              ) {
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

      // PHASE 1: AI Investigation
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `deployment gitops-test-app in ${argoNamespace} namespace has pods failing with ImagePullBackOff`,
          interaction_id: 'gitops_argocd_investigate',
        }
      );

      expect(
        response,
        `Argo CD GitOps investigation failed: ${JSON.stringify(response.error || response.data?.result?.error || 'no error field')}`
      ).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.arrayContaining([expect.any(String)]),
            },
            analysis: {
              rootCause: expect.stringContaining('image'),
              confidence: expect.any(Number),
              factors: expect.arrayContaining([expect.any(String)]),
            },
            remediation: {
              summary: expect.any(String),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  risk: expect.stringMatching(/^(low|medium|high)$/),
                }),
              ]),
              risk: expect.stringMatching(/^(low|medium|high)$/),
            },
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
      });

      const { investigation, analysis, remediation } = response.data.result;
      expect(investigation.iterations).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0.5);
      expect(response.data.executionTime).toBeGreaterThan(0);

      // PRD #407: AI should detect Argo CD management and return gitSource
      const actions = remediation.actions;
      const gitSourceActions = actions.filter(
        (a: Record<string, unknown>) => a.gitSource
      );
      expect(
        gitSourceActions.length,
        `Expected gitSource in actions but got: ${JSON.stringify(actions, null, 2)}`
      ).toBeGreaterThan(0);

      // Verify gitSource points to the correct repo and file
      const gitAction = gitSourceActions[0];
      expect(gitAction.gitSource.repoURL).toContain('dot-ai');
      expect(gitAction.gitSource.files.length).toBeGreaterThan(0);
      expect(gitAction.gitSource.files[0]).toMatchObject({
        path: expect.stringContaining('deployment.yaml'),
        content: expect.any(String),
        description: expect.any(String),
      });

      // PRD #407: AI should have used git_clone and fs_read/fs_list during investigation
      const dataGathered: string[] =
        response.data.result.investigation.dataGathered;
      const gitToolCalls = dataGathered.filter((entry: string) =>
        entry.startsWith('git_clone')
      );
      expect(
        gitToolCalls.length,
        `Expected git_clone in dataGathered but got: ${JSON.stringify(dataGathered)}`
      ).toBeGreaterThan(0);

      const fsToolCalls = dataGathered.filter(
        (entry: string) =>
          entry.startsWith('fs_list') || entry.startsWith('fs_read')
      );
      expect(
        fsToolCalls.length,
        `Expected fs_list/fs_read in dataGathered but got: ${JSON.stringify(dataGathered)}`
      ).toBeGreaterThan(0);

      // PRD #408: Execute remediation — should create a PR instead of running kubectl
      const sessionId = response.data.result.sessionId;
      const executionResponse = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          sessionId,
          executeChoice: 1,
          interaction_id: 'gitops_argocd_execute',
        }
      );

      expect(executionResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'success',
            sessionId,
            executed: true,
            pullRequest: {
              url: expect.stringMatching(
                /^https:\/\/github\.com\/vfarcic\/dot-ai\/pull\/\d+$/
              ),
              number: expect.any(Number),
              branch: expect.stringMatching(/^remediate\//),
              baseBranch: 'main',
              filesChanged: expect.arrayContaining([
                expect.stringContaining('deployment.yaml'),
              ]),
            },
          },
        },
      });

      const execResult = executionResponse.data.result;

      // Verify results array contains PR creation entry
      const prCreatedResult = execResult.results.find((r: { action: string }) =>
        r.action.includes('PR created')
      );
      expect(
        prCreatedResult,
        `Expected a result with 'PR created' but got: ${JSON.stringify(execResult.results, null, 2)}`
      ).toBeDefined();
      expect(prCreatedResult.success).toBe(true);
      expect(prCreatedResult.output).toContain(
        `PR #${execResult.pullRequest.number}`
      );

      // PRD #408: GitOps should create PR *instead of* kubectl — no direct cluster commands
      const kubectlResults = execResult.results.filter(
        (r: { action: string }) =>
          !r.action.includes('PR created') &&
          !r.action.includes('gitSource') &&
          !r.action.includes('branch pushed')
      );
      expect(
        kubectlResults.length,
        `Expected no kubectl actions but found: ${JSON.stringify(kubectlResults, null, 2)}`
      ).toBe(0);

      // Verify PR exists on GitHub, file content is correct, then clean up
      const gitToken = process.env.DOT_AI_GIT_TOKEN;
      if (gitToken) {
        const prNumber = execResult.pullRequest.number;
        const prBranch = execResult.pullRequest.branch;

        try {
          // Verify PR metadata
          const prResponse = await fetch(
            `https://api.github.com/repos/vfarcic/dot-ai/pulls/${prNumber}`,
            {
              headers: {
                Authorization: `token ${gitToken}`,
                Accept: 'application/vnd.github+json',
              },
            }
          );
          expect(prResponse.ok).toBe(true);
          const prData = (await prResponse.json()) as {
            title: string;
            body: string;
            state: string;
            head: { ref: string };
          };
          expect(prData.state).toBe('open');
          expect(prData.title).toContain('fix:');
          expect(prData.body).toContain('Remediation');
          expect(prData.head.ref).toBe(prBranch);

          // Verify the deployment.yaml in the PR branch has the broken image fixed
          const fileResponse = await fetch(
            `https://api.github.com/repos/vfarcic/dot-ai/contents/${fixturePath}/deployment.yaml?ref=${prBranch}`,
            {
              headers: {
                Authorization: `token ${gitToken}`,
                Accept: 'application/vnd.github.v3+json',
              },
            }
          );
          expect(fileResponse.ok).toBe(true);
          const fileData = (await fileResponse.json()) as {
            content: string;
            encoding: string;
          };
          const fileContent = Buffer.from(fileData.content, 'base64').toString(
            'utf-8'
          );
          expect(fileContent).not.toContain('v999-nonexistent');
          expect(fileContent).toContain('image:');
        } finally {
          // Always cleanup: close PR and delete branch
          await fetch(
            `https://api.github.com/repos/vfarcic/dot-ai/pulls/${prNumber}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `token ${gitToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/vnd.github+json',
              },
              body: JSON.stringify({ state: 'closed' }),
            }
          );
          await fetch(
            `https://api.github.com/repos/vfarcic/dot-ai/git/refs/heads/${prBranch}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `token ${gitToken}`,
                Accept: 'application/vnd.github+json',
              },
            }
          );
        }
      }
    }, 1200000); // 20 minute timeout
  });

  describe('GitOps-Managed Resource: Flux', () => {
    const fluxNamespace = 'remediate-gitops-flux';
    const testRepoUrl = 'https://github.com/vfarcic/dot-ai.git';
    const fixturePath = './tests/integration/fixtures/gitops/broken-app';

    test('should detect Flux management and return gitSource-based remediation', async () => {
      // SETUP: Create target namespace
      await integrationTest.kubectl(`create namespace ${fluxNamespace}`);

      // Create Flux GitRepository pointing to the test repo
      await integrationTest.kubectl(`apply -f - <<'EOF'
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: gitops-test-flux
  namespace: flux-system
spec:
  interval: 1m
  url: ${testRepoUrl}
  ref:
    branch: main
EOF`);

      // Create Flux Kustomization pointing to the broken-app fixture path
      await integrationTest.kubectl(`apply -f - <<'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: gitops-test-flux
  namespace: flux-system
spec:
  interval: 1m
  sourceRef:
    kind: GitRepository
    name: gitops-test-flux
  path: ${fixturePath}
  prune: true
  targetNamespace: ${fluxNamespace}
EOF`);

      // Wait for Flux to reconcile the broken deployment into the namespace
      const maxWaitTime = 120000;
      const checkInterval = 5000;
      const startTime = Date.now();
      let deploymentExists = false;

      while (Date.now() - startTime < maxWaitTime) {
        const deployJson = await integrationTest.kubectl(
          `get deployment gitops-test-app -n ${fluxNamespace} -o json 2>/dev/null`
        );
        if (deployJson && deployJson.trim() !== '') {
          deploymentExists = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      expect(deploymentExists).toBe(true);

      // Wait for pods to enter ImagePullBackOff
      let podInErrorState = false;
      const podStartTime = Date.now();

      while (Date.now() - podStartTime < maxWaitTime) {
        const podsJson = await integrationTest.kubectl(
          `get pods -n ${fluxNamespace} -l app=gitops-test-app -o json`
        );
        if (podsJson && podsJson.trim() !== '') {
          const podsData = JSON.parse(podsJson);
          for (const pod of podsData.items) {
            for (const cs of pod.status?.containerStatuses || []) {
              const waitReason = cs.state?.waiting?.reason;
              if (
                waitReason === 'ImagePullBackOff' ||
                waitReason === 'ErrImagePull'
              ) {
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

      // PHASE 1: AI Investigation
      const response = await integrationTest.httpClient.post(
        '/api/v1/tools/remediate',
        {
          issue: `deployment gitops-test-app in ${fluxNamespace} namespace has pods failing with ImagePullBackOff`,
          interaction_id: 'gitops_flux_investigate',
        }
      );

      expect(
        response,
        `Flux GitOps investigation failed: ${JSON.stringify(response.error || response.data?.result?.error || 'no error field')}`
      ).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'awaiting_user_approval',
            sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
            investigation: {
              iterations: expect.any(Number),
              dataGathered: expect.arrayContaining([expect.any(String)]),
            },
            analysis: {
              rootCause: expect.stringContaining('image'),
              confidence: expect.any(Number),
              factors: expect.arrayContaining([expect.any(String)]),
            },
            remediation: {
              summary: expect.any(String),
              actions: expect.arrayContaining([
                expect.objectContaining({
                  description: expect.any(String),
                  risk: expect.stringMatching(/^(low|medium|high)$/),
                }),
              ]),
              risk: expect.stringMatching(/^(low|medium|high)$/),
            },
          },
          tool: 'remediate',
          executionTime: expect.any(Number),
        },
      });

      const { investigation, analysis, remediation } = response.data.result;
      expect(investigation.iterations).toBeGreaterThan(0);
      expect(analysis.confidence).toBeGreaterThanOrEqual(0.5);
      expect(response.data.executionTime).toBeGreaterThan(0);

      // PRD #407: AI should detect Flux management and return gitSource
      const actions = remediation.actions;
      const gitSourceActions = actions.filter(
        (a: Record<string, unknown>) => a.gitSource
      );
      expect(
        gitSourceActions.length,
        `Expected gitSource in actions but got: ${JSON.stringify(actions, null, 2)}`
      ).toBeGreaterThan(0);

      // Verify gitSource points to the correct repo and file
      const gitAction = gitSourceActions[0];
      expect(gitAction.gitSource.repoURL).toContain('dot-ai');
      expect(gitAction.gitSource.files.length).toBeGreaterThan(0);
      expect(gitAction.gitSource.files[0]).toMatchObject({
        path: expect.stringContaining('deployment.yaml'),
        content: expect.any(String),
        description: expect.any(String),
      });

      // PRD #407: AI should have used git_clone and fs_read/fs_list during investigation
      const dataGathered: string[] =
        response.data.result.investigation.dataGathered;
      const gitToolCalls = dataGathered.filter((entry: string) =>
        entry.startsWith('git_clone')
      );
      expect(
        gitToolCalls.length,
        `Expected git_clone in dataGathered but got: ${JSON.stringify(dataGathered)}`
      ).toBeGreaterThan(0);

      const fsToolCalls = dataGathered.filter(
        (entry: string) =>
          entry.startsWith('fs_list') || entry.startsWith('fs_read')
      );
      expect(
        fsToolCalls.length,
        `Expected fs_list/fs_read in dataGathered but got: ${JSON.stringify(dataGathered)}`
      ).toBeGreaterThan(0);
    }, 1200000); // 20 minute timeout
  });
});
