/**
 * Schema Integration Tests
 * 
 * Integration tests that require real Kubernetes cluster connectivity
 * These tests use actual kubectl commands and cluster validation
 */

import { ManifestValidator, SchemaParser, ValidationResult } from '../src/core/schema';
import { ResourceExplanation } from '../src/core/discovery';

describe('Schema Integration Tests', () => {
  describe('ManifestValidator with Real Cluster', () => {
    let validator: ManifestValidator;

    beforeEach(() => {
      validator = new ManifestValidator();
    });

    describe('Real Cluster Validation', () => {
      it('should validate a correct ConfigMap manifest using real cluster', async () => {
        const path = await import('path');
        
        // Use fixture file instead of creating temporary files
        const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'valid-configmap.yaml');
        const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: kubeconfigPath
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }, 10000); // 10 second timeout for real cluster calls

      it('should detect validation errors using real cluster', async () => {
        const path = await import('path');
        
        // Use existing invalid deployment fixture
        const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'invalid-deployment.yaml');
        const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: kubeconfigPath
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        // Should have errors about missing selector or invalid field types
        expect(result.errors[0]).toMatch(/selector|image|invalid/i);
      }, 10000);

      it('should handle unknown field errors with real cluster', async () => {
        const path = await import('path');
        
        // Use invalid configmap fixture with unknown field
        const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'invalid-configmap.yaml');
        const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: kubeconfigPath
        });

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/unknown field|Unknown field/i);
      }, 10000);

      it('should support client-side dry-run mode with real cluster', async () => {
        const path = await import('path');
        
        // Use valid configmap fixture for client-side validation
        const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'valid-configmap.yaml');
        const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
        
        const result = await validator.validateManifest(manifestPath, { 
          dryRunMode: 'client',
          kubeconfig: kubeconfigPath
        });

        expect(result.valid).toBe(true);
      }, 10000);

      it('should provide best practice warnings for valid manifests', async () => {
        const path = await import('path');
        
        // Use configmap fixture without labels/namespace
        const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'configmap-no-labels.yaml');
        const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
        
        const result = await validator.validateManifest(manifestPath, {
          kubeconfig: kubeconfigPath
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some(warning => warning.includes('labels'))).toBe(true);
        expect(result.warnings.some(warning => warning.includes('namespace'))).toBe(true);
      }, 10000);
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

      // Use fixture file for validation
      const path = await import('path');
      const manifestPath = path.join(process.cwd(), 'tests', 'fixtures', 'valid-configmap.yaml');
      const kubeconfigPath = path.join(process.cwd(), 'kubeconfig.yaml');
      
      const result = await validator.validateManifest(manifestPath, { 
        kubeconfig: kubeconfigPath
      });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }, 10000);

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