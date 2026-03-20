/**
 * Integration Test: Impact Analysis Tool
 *
 * Tests AI-powered dependency & blast radius analysis via REST API against a real test cluster.
 * Three input methods testing the AI's ability to parse different formats:
 * 1. kubectl command (destructive): delete CNPG Cluster — parent→children dependency discovery
 * 2. Plain text (destructive): delete CNPG-managed PVC — child→parent/sibling dependency discovery
 * 3. GitOps manifest change (update): scale down Argo CD-managed CNPG Cluster — HA impact
 *
 * PRD #405: Dependency & Impact Analysis
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import { execSync } from 'child_process';

describe.concurrent('Impact Analysis Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const testNamespace = 'impact-analysis-test';
  const argoNamespace = 'impact-analysis-gitops';
  const testRepoUrl = 'https://github.com/vfarcic/dot-ai.git';
  const fixturePath = 'tests/integration/fixtures/gitops/cnpg-cluster';

  beforeAll(async () => {
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');

    // Create test namespaces
    for (const ns of [testNamespace, argoNamespace]) {
      try {
        execSync(`kubectl create namespace ${ns}`, {
          env: { ...process.env, KUBECONFIG: kubeconfig },
          stdio: 'pipe'
        });
      } catch {
        // Ignore if already exists
      }
    }

    // Create CNPG PostgreSQL cluster directly (for kubectl and plain-text tests)
    const cnpgClusterYaml = `
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: test-pg
  namespace: ${testNamespace}
  labels:
    app: postgresql
    team: platform
spec:
  instances: 1
  storage:
    size: 1Gi
`;
    try {
      execSync(`echo '${cnpgClusterYaml}' | kubectl apply -f -`, {
        env: { ...process.env, KUBECONFIG: kubeconfig },
        stdio: 'pipe'
      });
    } catch {
      // Ignore if CNPG CRD not ready
    }

    // Deploy CNPG Cluster via Argo CD (for GitOps manifest change test)
    const argoAppYaml = `
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: impact-analysis-pg
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
`;
    try {
      execSync(`echo '${argoAppYaml}' | kubectl apply -f -`, {
        env: { ...process.env, KUBECONFIG: kubeconfig },
        stdio: 'pipe'
      });
    } catch {
      // Ignore if Argo CD not ready
    }

    // Wait for directly-created CNPG cluster to reconcile (Pod, PVC, Service)
    const maxWait = 120000;
    const interval = 5000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      try {
        const result = execSync(
          `kubectl get pods -n ${testNamespace} -l cnpg.io/cluster=test-pg -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true`,
          { env: { ...process.env, KUBECONFIG: kubeconfig }, encoding: 'utf8' }
        );
        if (result && result.trim() !== '' && result.trim() !== "''") break;
      } catch {
        // Resources may not exist yet
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    // Wait for Argo CD-managed CNPG cluster to reconcile
    const argoStart = Date.now();
    while (Date.now() - argoStart < maxWait) {
      try {
        const result = execSync(
          `kubectl get pods -n ${argoNamespace} -l cnpg.io/cluster=gitops-pg -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true`,
          { env: { ...process.env, KUBECONFIG: kubeconfig }, encoding: 'utf8' }
        );
        if (result && result.trim() !== '' && result.trim() !== "''") break;
      } catch {
        // Resources may not exist yet
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }, 300000); // 5 min for CNPG + Argo CD reconciliation

  // Test 1: kubectl command — delete CNPG Cluster (parent→children dependency discovery)
  test('should analyze impact of deleting CNPG Cluster via kubectl command', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/impact_analysis',
      {
        input: `kubectl delete cluster test-pg -n ${testNamespace}`,
        interaction_id: 'impact_kubectl_delete_cluster'
      }
    );

    // safe is non-deterministic — AI may reason "not safe" (data loss) or "safe"
    // (test environment, recoverable). The key validation is the dependency discovery.
    expect(response).toMatchObject({
      success: true,
      data: {
        tool: 'impact_analysis',
        executionTime: expect.any(Number),
        result: {
          success: true,
          safe: expect.any(Boolean),
          summary: expect.stringMatching(/test-pg/i),
          sessionId: expect.stringMatching(/^imp-\d+-[a-f0-9]+$/),
          agentInstructions: expect.any(String)
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Deleting parent Cluster should surface child resources
    const summary = response.data.result.summary.toLowerCase();
    expect(summary).toMatch(/pvc|persistentvolumeclaim|volume/);
    expect(summary).toMatch(/service|endpoint/);
    expect(summary).toMatch(/data loss|data|storage/);
  }, 600000);

  // Test 2: Plain text — delete CNPG-managed PVC (child→parent/sibling dependency discovery)
  test('should analyze impact of deleting CNPG-managed PVC via plain text description', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/impact_analysis',
      {
        input: `I want to delete the persistent volume claim used by the test-pg postgres database in the ${testNamespace} namespace`,
        interaction_id: 'impact_text_delete_pvc'
      }
    );

    expect(response).toMatchObject({
      success: true,
      data: {
        tool: 'impact_analysis',
        executionTime: expect.any(Number),
        result: {
          success: true,
          safe: expect.any(Boolean),
          summary: expect.stringMatching(/test-pg/i),
          sessionId: expect.stringMatching(/^imp-\d+-[a-f0-9]+$/),
          agentInstructions: expect.any(String)
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Deleting child PVC should trace upward to parent Cluster and sibling resources
    const summary = response.data.result.summary.toLowerCase();
    expect(summary).toMatch(/cluster|cnpg/);
    expect(summary).toMatch(/data loss|data|database/);
    expect(summary).toMatch(/service|pod/);
  }, 600000);

  // Test 3: GitOps manifest change — scale down Argo CD-managed CNPG Cluster from 2 to 1
  test('should analyze impact of scaling down CNPG Cluster via GitOps manifest change', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/impact_analysis',
      {
        input: `In repo ${testRepoUrl}, the file ${fixturePath}/cluster.yaml will be changed to set spec.instances from 2 to 1.`,
        interaction_id: 'impact_gitops_scale_down'
      }
    );

    // safe can be true or false — AI may consider it safe (reversible, no downstream deps)
    // or not safe (HA loss). Both are valid assessments.
    expect(response).toMatchObject({
      success: true,
      data: {
        tool: 'impact_analysis',
        executionTime: expect.any(Number),
        result: {
          success: true,
          safe: expect.any(Boolean),
          summary: expect.stringMatching(/gitops-pg/i),
          sessionId: expect.stringMatching(/^imp-\d+-[a-f0-9]+$/),
          agentInstructions: expect.any(String)
        }
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });

    // Scaling from 2→1 should mention replica/instance impact and HA considerations
    const summary = response.data.result.summary.toLowerCase();
    expect(summary).toMatch(/replica|instance|pod/);
    expect(summary).toMatch(/high availability|ha|failover|single/i);
  }, 600000);

  // Test 4: Error handling — missing input
  test('should return error for missing input parameter', async () => {
    const response = await integrationTest.httpClient.post(
      '/api/v1/tools/impact_analysis',
      {
        interaction_id: 'impact_error_missing_input'
      }
    );

    expect(response).toMatchObject({
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: expect.stringContaining('Input is required')
      },
      meta: {
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        requestId: expect.stringMatching(/^rest_\d+_\d+$/),
        version: 'v1'
      }
    });
  }, 30000);
});
