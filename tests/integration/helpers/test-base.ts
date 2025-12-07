/**
 * Integration Test Base Class
 *
 * Provides common functionality for integration tests including:
 * - Automatic namespace lifecycle management
 * - Kubernetes client setup
 * - HTTP client for REST API calls
 * - Common utilities and wait conditions
 */

import { HttpRestApiClient } from './http-client.js';
import * as k8s from '@kubernetes/client-node';

export class IntegrationTest {
  public namespace: string = '';
  protected k8sApi: k8s.CoreV1Api;
  public httpClient: HttpRestApiClient;
  private kc: k8s.KubeConfig;

  constructor() {
    // Initialize Kubernetes client with test kubeconfig
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);

    // Initialize HTTP client for REST API calls with auth header if configured
    const authToken = process.env.DOT_AI_AUTH_TOKEN;
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    this.httpClient = new HttpRestApiClient({ headers });
  }

  /**
   * Create a pod in the test namespace
   */
  async createPod(name: string, spec: k8s.V1PodSpec): Promise<k8s.V1Pod> {
    const pod: k8s.V1Pod = {
      metadata: {
        name,
        namespace: this.namespace,
      },
      spec,
    };

    const response = await this.k8sApi.createNamespacedPod({
      namespace: this.namespace,
      body: pod
    });
    return response;
  }

  /**
   * Wait for a pod to reach a specific condition
   */
  async waitForPodCondition(
    podName: string,
    condition: 'Running' | 'Failed' | 'Succeeded',
    timeoutMs: number = 30000
  ): Promise<k8s.V1Pod> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const pod = await this.k8sApi.readNamespacedPod({
          name: podName,
          namespace: this.namespace
        });

        if (pod.status?.phase === condition) {
          return pod;
        }

        // Check for CrashLoopBackOff condition
        if (condition === 'Failed' && pod.status?.containerStatuses) {
          const crashLooping = pod.status.containerStatuses.some(
            (status: any) => status.state?.waiting?.reason === 'CrashLoopBackOff'
          );
          if (crashLooping) {
            return pod;
          }
        }
      } catch (error) {
        // Pod might not exist yet, continue waiting
      }

      await this.sleep(1000); // Wait 1 second before next check
    }

    throw new Error(`Timeout waiting for pod ${podName} to reach condition ${condition}`);
  }

  /**
   * Wait for a deployment to be ready
   */
  async waitForDeploymentReady(deploymentName: string, timeoutMs: number = 60000): Promise<void> {
    const appsV1Api = this.kc.makeApiClient(k8s.AppsV1Api);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const deployment = await appsV1Api.readNamespacedDeployment({
          name: deploymentName,
          namespace: this.namespace
        });

        if (deployment.status?.readyReplicas && deployment.status.readyReplicas > 0) {
          return;
        }
      } catch (error) {
        // Deployment might not exist yet, continue waiting
      }

      await this.sleep(2000); // Wait 2 seconds before next check
    }

    throw new Error(`Timeout waiting for deployment ${deploymentName} to be ready`);
  }

  /**
   * Create a pod with missing ConfigMap dependency for testing
   */
  async createPodWithMissingConfigMap(podName: string): Promise<k8s.V1Pod> {
    const spec: k8s.V1PodSpec = {
      containers: [
        {
          name: 'test-container',
          image: 'nginx:alpine',
          env: [
            {
              name: 'CONFIG_VALUE',
              valueFrom: {
                configMapKeyRef: {
                  name: 'missing-configmap',
                  key: 'config-key',
                },
              },
            },
          ],
        },
      ],
      restartPolicy: 'Always',
    };

    return this.createPod(podName, spec);
  }

  /**
   * Get all pods in the test namespace
   */
  async getPods(): Promise<k8s.V1Pod[]> {
    const response = await this.k8sApi.listNamespacedPod({
      namespace: this.namespace
    });
    return response.items || [];
  }

  /**
   * Execute kubectl command using the test kubeconfig
   * @param command - kubectl command without the "kubectl" prefix
   * @returns stdout from the kubectl command
   */
  async kubectl(command: string): Promise<string> {
    const { execSync } = await import('child_process');
    const kubeconfig = process.env.KUBECONFIG || './kubeconfig-test.yaml';

    try {
      const output = execSync(`kubectl --kubeconfig=${kubeconfig} ${command}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return output;
    } catch (error: any) {
      // Return empty string for errors (e.g., resources not found)
      // The --ignore-not-found flag handles most of these gracefully
      return error.stdout || '';
    }
  }

  /**
   * Helper to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sanitize test name for use in Kubernetes resource names
   */
  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20); // Limit length for namespace constraints
  }
}