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

    // Initialize HTTP client for REST API calls
    this.httpClient = new HttpRestApiClient();
  }

  /**
   * Setup test environment with unique namespace
   * @param testName - Base name for the test (will be sanitized)
   */
  async setup(testName?: string): Promise<void> {
    const sanitizedName = this.sanitizeName(testName || 'test');
    const timestamp = Date.now();
    const workerId = process.env.JEST_WORKER_ID || '1';

    // Create unique namespace: test-{workerId}-{name}-{timestamp}
    // Add UUID to prevent namespace collisions in concurrent tests
    const uuid = crypto.randomUUID().slice(0, 8); // First 8 chars of UUID
    this.namespace = `test-${workerId}-${sanitizedName}-${timestamp}-${uuid}`;

    try {
      // Create namespace
      const namespace = {
        metadata: {
          name: this.namespace,
          labels: {
            'dot-ai/test': 'true',
            'dot-ai/worker': workerId,
            'dot-ai/test-name': sanitizedName,
          },
        },
      };

      await this.k8sApi.createNamespace({ body: namespace });

      console.log(`Created test namespace: ${this.namespace}`);
    } catch (error) {
      throw new Error(`Failed to create test namespace ${this.namespace}: ${error}`);
    }
  }

  /**
   * Cleanup test environment by deleting namespace
   * Uses --wait=false for async deletion to avoid blocking
   */
  async cleanup(): Promise<void> {
    if (!this.namespace) {
      return; // Nothing to clean up
    }

    try {
      // Delete namespace without waiting for completion (async deletion)
      await this.k8sApi.deleteNamespace({
        name: this.namespace,
        body: {
          propagationPolicy: 'Background'
        }
      });
      console.log(`Initiated deletion of test namespace: ${this.namespace} (async)`);
    } catch (error) {
      // Log warning but don't fail tests due to cleanup issues
      console.warn(`Warning: Failed to delete test namespace ${this.namespace}: ${error}`);
    }
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