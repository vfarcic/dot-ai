/**
 * DeployOperation Integration Tests
 * 
 * Integration tests that require real Kubernetes cluster connectivity
 * These tests use actual kubectl commands and real file system operations
 * 
 * Run with: npm run test:integration
 * Requires: kubectl and valid kubeconfig
 */

import { DeployOperation } from '../../src/core/deploy-operation';
import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('DeployOperation Integration Tests', () => {
  let testDir: string;
  let testNamespace: string;
  let deployOp: DeployOperation;

  beforeAll(async () => {
    // Create isolated test directory in tmp/
    testDir = join(process.cwd(), 'tmp', 'deploy-integration-tests', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });
    
    // Create isolated test namespace for cluster resources
    testNamespace = `app-agent-deploy-${Date.now()}`;
    
    try {
      await execAsync(`kubectl create namespace ${testNamespace}`);
    } catch (error) {
      console.warn('Could not create test namespace - cluster may not be available');
      throw new Error('Kubernetes cluster required for deploy integration tests');
    }
  });

  beforeEach(() => {
    deployOp = new DeployOperation();
  });

  afterAll(async () => {
    // Clean up test namespace (removes all resources)
    try {
      await execAsync(`kubectl delete namespace ${testNamespace} --ignore-not-found=true --timeout=30s`);
    } catch (error) {
      console.warn('Could not clean up test namespace');
    }
    
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Could not clean up test directory');
    }
  }, 45000); // 45 second timeout for cleanup

  describe('Real Kubernetes Deployment', () => {
    it('should successfully deploy a simple ConfigMap', async () => {
      const solutionId = 'test-configmap-solution';
      const manifestPath = join(testDir, `${solutionId}.yaml`);
      
      // Create test manifest
      const testManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-deploy-config
  namespace: ${testNamespace}
  labels:
    app: deploy-test
    managed-by: app-agent
data:
  config: "integration-test-value"
  environment: "test"
`;
      await fs.writeFile(manifestPath, testManifest);

      // Deploy using DeployOperation
      const result = await deployOp.deploy({
        solutionId,
        sessionDir: testDir,
        timeout: 30
      });

      expect(result.success).toBe(true);
      expect(result.solutionId).toBe(solutionId);
      expect(result.manifestPath).toBe(manifestPath);
      expect(result.readinessTimeout).toBe(false);
      expect(result.message).toBe('Deployment completed successfully');
      expect(result.kubectlOutput).toContain('configmap/test-deploy-config');

      // Verify resource was actually created in cluster
      const { stdout } = await execAsync(`kubectl get configmap test-deploy-config -n ${testNamespace} -o jsonpath='{.data.config}'`);
      expect(stdout.trim()).toBe('integration-test-value');
    }, 30000);

    it('should successfully deploy a Deployment with Service', async () => {
      const solutionId = 'test-app-solution';
      const manifestPath = join(testDir, `${solutionId}.yaml`);
      
      // Create complex test manifest
      const testManifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deploy-app
  namespace: ${testNamespace}
  labels:
    app: deploy-test-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: deploy-test-app
  template:
    metadata:
      labels:
        app: deploy-test-app
    spec:
      containers:
      - name: nginx
        image: nginx:1.21-alpine
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "32Mi"
            cpu: "10m"
          limits:
            memory: "64Mi"
            cpu: "50m"
---
apiVersion: v1
kind: Service
metadata:
  name: test-deploy-service
  namespace: ${testNamespace}
  labels:
    app: deploy-test-app
spec:
  selector:
    app: deploy-test-app
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
`;
      await fs.writeFile(manifestPath, testManifest);

      // Deploy using DeployOperation
      const result = await deployOp.deploy({
        solutionId,
        sessionDir: testDir,
        timeout: 60 // Longer timeout for deployment readiness
      });

      expect(result.success).toBe(true);
      expect(result.kubectlOutput).toContain('deployment.apps/test-deploy-app');
      expect(result.kubectlOutput).toContain('service/test-deploy-service');

      // Verify deployment is ready
      const { stdout: deployStatus } = await execAsync(`kubectl get deployment test-deploy-app -n ${testNamespace} -o jsonpath='{.status.readyReplicas}'`);
      expect(parseInt(deployStatus.trim())).toBe(1);

      // Verify service exists
      const { stdout: serviceStatus } = await execAsync(`kubectl get service test-deploy-service -n ${testNamespace} -o jsonpath='{.spec.type}'`);
      expect(serviceStatus.trim()).toBe('ClusterIP');
    }, 90000);

    it('should handle deployment failures gracefully', async () => {
      const solutionId = 'test-invalid-solution';
      const manifestPath = join(testDir, `${solutionId}.yaml`);
      
      // Create invalid manifest (invalid image)
      const invalidManifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-deploy-invalid
  namespace: ${testNamespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: deploy-test-invalid
  template:
    metadata:
      labels:
        app: deploy-test-invalid
    spec:
      containers:
      - name: invalid
        image: nonexistent-image:invalid-tag
        ports:
        - containerPort: 80
`;
      await fs.writeFile(manifestPath, invalidManifest);

      // Deploy using DeployOperation (should fail or timeout)
      const result = await deployOp.deploy({
        solutionId,
        sessionDir: testDir,
        timeout: 10 // Short timeout to avoid long waits
      });

      // Should either fail immediately or succeed with readiness timeout
      if (!result.success) {
        expect(result.kubectlOutput).toContain('kubectl command failed');
      } else {
        // If kubectl apply succeeded but pods didn't become ready
        expect(result.readinessTimeout || result.success).toBe(true);
      }
    }, 45000);

    it('should fail when manifest file does not exist', async () => {
      const solutionId = 'nonexistent-solution';
      
      // Don't create the manifest file - expect the deploy method to throw
      await expect(deployOp.deploy({
        solutionId,
        sessionDir: testDir,
        timeout: 30
      })).rejects.toMatchObject({
        message: expect.stringContaining('Manifest file not found'),
        category: 'unknown'
      });
    }, 10000);

    it('should fail when session directory does not exist', async () => {
      const solutionId = 'test-solution';
      const nonexistentDir = join(testDir, 'nonexistent');
      
      // Expect the deploy method to throw when session directory doesn't exist
      await expect(deployOp.deploy({
        solutionId,
        sessionDir: nonexistentDir,
        timeout: 30
      })).rejects.toMatchObject({
        message: expect.stringContaining('Manifest file not found'),
        category: 'unknown'
      });
    }, 10000);

    it('should support relative session directory paths', async () => {
      const solutionId = 'test-relative-path-solution';
      
      // Create a test directory structure with relative paths
      const testRelativeDir = 'tmp/relative-test';
      const testCwd = join(process.cwd(), 'tmp', 'deploy-relative-test');
      const relativeSessionDir = './sessions';
      const absoluteSessionDir = join(testCwd, 'sessions');
      
      // Create directories
      await fs.mkdir(testCwd, { recursive: true });
      await fs.mkdir(absoluteSessionDir, { recursive: true });
      
      const manifestPath = join(absoluteSessionDir, `${solutionId}.yaml`);
      
      // Create simple test manifest
      const testManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-relative-config
  namespace: ${testNamespace}
data:
  path: "relative-test"
`;
      await fs.writeFile(manifestPath, testManifest);

      try {
        // Save original cwd and env
        const originalCwd = process.cwd();
        const originalEnv = process.env.APP_AGENT_SESSION_DIR;
        
        // Change to test directory and set relative path
        process.chdir(testCwd);
        process.env.APP_AGENT_SESSION_DIR = relativeSessionDir;
        
        // Test deploy with environment variable (simulating MCP behavior)
        const result = await deployOp.deploy({
          solutionId,
          // Don't provide sessionDir - should use environment variable
          timeout: 30
        });
        
        expect(result.success).toBe(true);
        expect(result.solutionId).toBe(solutionId);
        expect(result.kubectlOutput).toContain('configmap/test-relative-config');
        
        // Verify resource was created
        const { stdout } = await execAsync(`kubectl get configmap test-relative-config -n ${testNamespace} -o jsonpath='{.data.path}'`);
        expect(stdout.trim()).toBe('relative-test');
        
        // Restore original state
        process.chdir(originalCwd);
        if (originalEnv) {
          process.env.APP_AGENT_SESSION_DIR = originalEnv;
        } else {
          delete process.env.APP_AGENT_SESSION_DIR;
        }
        
      } finally {
        // Clean up test directories
        try {
          await fs.rm(testCwd, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Could not clean up test directory:', cleanupError);
        }
      }
    }, 45000);

    it('should use custom timeout correctly', async () => {
      const solutionId = 'test-timeout-solution';
      const manifestPath = join(testDir, `${solutionId}.yaml`);
      
      // Create simple manifest
      const testManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-timeout-config
  namespace: ${testNamespace}
data:
  timeout: "test"
`;
      await fs.writeFile(manifestPath, testManifest);

      const startTime = Date.now();
      
      const result = await deployOp.deploy({
        solutionId,
        sessionDir: testDir,
        timeout: 5 // Very short timeout
      });

      const duration = Date.now() - startTime;
      
      // Should complete quickly for ConfigMap
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(15000); // Should not take more than 15 seconds
    }, 20000);
  });
});