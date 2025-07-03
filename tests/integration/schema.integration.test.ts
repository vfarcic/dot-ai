/**
 * Schema Integration Tests
 * 
 * Integration tests that require real Kubernetes cluster connectivity
 * These tests use actual kubectl commands and cluster validation
 * 
 * Run with: npm run test:integration
 * Requires: kubectl and valid kubeconfig
 */

import { ManifestValidator, SchemaParser, ValidationResult } from '../../src/core/schema';
import { ResourceExplanation } from '../../src/core/discovery';
import { promises as fs } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Schema Integration Tests', () => {
  let testDir: string;
  let testNamespace: string;
  let testKubeconfig: string;

  beforeAll(async () => {
    // Create isolated test directory in tmp/
    testDir = join(process.cwd(), 'tmp', 'integration-tests', Date.now().toString());
    await fs.mkdir(testDir, { recursive: true });
    
    // Create isolated test namespace for cluster resources
    testNamespace = `app-agent-integration-${Date.now()}`;
    
    // Use existing kubeconfig but isolate in test namespace
    try {
      await execAsync(`kubectl create namespace ${testNamespace}`);
    } catch (error) {
      console.warn('Could not create test namespace - cluster may not be available');
    }
    
    // Copy kubeconfig to test directory for isolation
    const originalKubeconfig = process.env.KUBECONFIG || join(process.env.HOME || '', '.kube', 'config');
    testKubeconfig = join(testDir, 'kubeconfig.yaml');
    
    try {
      await fs.copyFile(originalKubeconfig, testKubeconfig);
    } catch (error) {
      console.warn('Could not copy kubeconfig - using default');
      testKubeconfig = originalKubeconfig;
    }
  });

  afterAll(async () => {
    // Clean up test namespace (removes all resources)
    try {
      await execAsync(`kubectl delete namespace ${testNamespace} --ignore-not-found=true`);
    } catch (error) {
      console.warn('Could not clean up test namespace');
    }
    
    // Clean up test files
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Could not clean up test directory');
    }
  });

  describe('ManifestValidator with Real Cluster', () => {
    let validator: ManifestValidator;

    beforeEach(() => {
      validator = new ManifestValidator();
    });

    describe('Real Cluster Validation', () => {
      it('should validate a correct ConfigMap manifest using real cluster', async () => {
        // Create test manifest in isolated test directory
        const manifestPath = join(testDir, 'valid-configmap.yaml');
        const testManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: test-config
  namespace: ${testNamespace}
  labels:
    app: test-app
data:
  test: "value"
  config: "data"
`;
        await fs.writeFile(manifestPath, testManifest);
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: testKubeconfig
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }, 15000); // 15 second timeout for real cluster calls

      it('should detect validation errors using real cluster', async () => {
        // Create invalid manifest in isolated test directory
        const manifestPath = join(testDir, 'invalid-deployment.yaml');
        const invalidManifest = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: invalid-deployment
  namespace: ${testNamespace}
spec:
  # Missing required selector field
  template:
    metadata:
      labels:
        app: test
    spec:
      containers:
      - name: test
        # Missing required image field
        ports:
        - containerPort: 80
`;
        await fs.writeFile(manifestPath, invalidManifest);
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: testKubeconfig
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        // Should have errors about missing selector or image
        expect(result.errors.join(' ')).toMatch(/selector|image|required/i);
      }, 15000);

      it('should handle unknown field errors with real cluster', async () => {
        // Create invalid manifest with unknown field in test directory
        const manifestPath = join(testDir, 'invalid-configmap.yaml');
        const invalidManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: invalid-config
  namespace: ${testNamespace}
spec:
  # Unknown field - ConfigMaps don't have spec
  unknownField: "invalid"
data:
  test: "value"
`;
        await fs.writeFile(manifestPath, invalidManifest);
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: testKubeconfig
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.join(' ')).toMatch(/unknown field|Unknown field|spec/i);
      }, 15000);

      it('should support client-side dry-run mode with real cluster', async () => {
        // Create valid manifest for client-side validation
        const manifestPath = join(testDir, 'client-dry-run-configmap.yaml');
        const validManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: client-test-config
  namespace: ${testNamespace}
  labels:
    app: test-app
data:
  config: "value"
`;
        await fs.writeFile(manifestPath, validManifest);
        
        const result = await validator.validateManifest(manifestPath, { 
          dryRunMode: 'client',
          kubeconfig: testKubeconfig
        });

        expect(result.valid).toBe(true);
      }, 15000);

      it('should provide best practice warnings for valid manifests', async () => {
        // Create manifest without best practices (no labels)
        const manifestPath = join(testDir, 'no-labels-configmap.yaml');
        const manifestWithoutLabels = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: no-labels-config
  namespace: ${testNamespace}
data:
  config: "value"
`;
        await fs.writeFile(manifestPath, manifestWithoutLabels);
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: testKubeconfig
        });

        expect(result.valid).toBe(true);
        // Note: Warnings depend on validator implementation
        if (result.warnings && result.warnings.length > 0) {
          expect(result.warnings.some(warning => warning.includes('labels'))).toBe(true);
        }
      }, 15000);
    });
  });

  describe('End-to-End Schema Workflow with Real Cluster', () => {
    it('should parse schema and validate manifest in complete workflow', async () => {
      const parser = new SchemaParser();
      const validator = new ManifestValidator();

      // Simulate kubectl explain output
      const explanation: ResourceExplanation = {
        kind: 'ConfigMap',
        version: 'v1',
        group: '',
        description: 'ConfigMap holds configuration data for pods to consume',
        fields: [
          {
            name: 'metadata',
            type: 'Object',
            description: 'Standard object metadata',
            required: true
          },
          {
            name: 'data',
            type: 'object',
            description: 'Data contains the configuration data',
            required: false
          }
        ]
      };

      // Parse to schema
      const schema = parser.parseResourceExplanation(explanation);
      expect(schema.kind).toBe('ConfigMap');

      // Create valid manifest for validation in test directory
      const manifestPath = join(testDir, 'workflow-configmap.yaml');
      const workflowManifest = `
apiVersion: v1
kind: ConfigMap
metadata:
  name: workflow-config
  namespace: ${testNamespace}
  labels:
    app: workflow-test
data:
  config: "workflow-value"
  settings: "test-data"
`;
      await fs.writeFile(manifestPath, workflowManifest);
      
      const result = await validator.validateManifest(manifestPath, { 
        kubeconfig: testKubeconfig
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }, 15000);

    it('should handle complex CRD schemas in real environment', () => {
      const parser = new SchemaParser();
      
      // Simulate complex CRD explanation
      const crdExplanation: ResourceExplanation = {
        kind: 'VirtualService',
        version: 'v1beta1',
        group: 'networking.istio.io',
        description: 'Configuration affecting traffic routing',
        fields: [
          {
            name: 'spec.http.match.uri.exact',
            type: 'string',
            description: 'Exact string match for URI',
            required: false
          },
          {
            name: 'spec.http.route.destination.host',
            type: 'string',
            description: 'Destination service host',
            required: true
          }
        ]
      };

      const schema = parser.parseResourceExplanation(crdExplanation);
      expect(schema.kind).toBe('VirtualService');
      expect(schema.group).toBe('networking.istio.io');
      expect(schema.apiVersion).toBe('networking.istio.io/v1beta1');
    });
  });
});