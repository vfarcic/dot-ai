/**
 * Schema Parser and Validator Tests
 * 
 * TDD test suite for Task 3: Resource Schema Parser and Validator
 * Following the same TDD methodology used in Task 2
 */

import { SchemaParser, ResourceSchema, SchemaField, ManifestValidator, ResourceRanker, ValidationResult, RankingResult } from '../src/core/schema';
import { ResourceExplanation } from '../src/core/discovery';

describe('ResourceSchema Interface and Core Types', () => {
  describe('ResourceSchema interface', () => {
    it('should define complete schema structure with all required fields', () => {
      const schema: ResourceSchema = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Deployment enables declarative updates for Pods and ReplicaSets',
        properties: new Map(),
        required: ['metadata', 'spec'],
        namespace: true
      };

      expect(schema.apiVersion).toBe('apps/v1');
      expect(schema.kind).toBe('Deployment');
      expect(schema.group).toBe('apps');
      expect(schema.version).toBe('v1');
      expect(schema.description).toContain('Deployment');
      expect(schema.properties).toBeInstanceOf(Map);
      expect(schema.required).toEqual(['metadata', 'spec']);
      expect(schema.namespace).toBe(true);
    });

    it('should support nested properties with SchemaField structure', () => {
      const field: SchemaField = {
        name: 'spec.replicas',
        type: 'integer',
        description: 'Number of desired pods',
        required: false,
        default: 1,
        constraints: {
          minimum: 0,
          maximum: 1000
        },
        nested: new Map()
      };

      expect(field.name).toBe('spec.replicas');
      expect(field.type).toBe('integer');
      expect(field.description).toContain('pods');
      expect(field.required).toBe(false);
      expect(field.default).toBe(1);
      expect(field.constraints?.minimum).toBe(0);
      expect(field.constraints?.maximum).toBe(1000);
      expect(field.nested).toBeInstanceOf(Map);
    });

    it('should handle different field types correctly', () => {
      const stringField: SchemaField = {
        name: 'metadata.name',
        type: 'string',
        description: 'Name of the resource',
        required: true,
        nested: new Map()
      };

      const arrayField: SchemaField = {
        name: 'spec.containers',
        type: 'array',
        description: 'List of containers',
        required: true,
        nested: new Map()
      };

      const objectField: SchemaField = {
        name: 'spec.selector',
        type: 'object',
        description: 'Label selector',
        required: true,
        nested: new Map()
      };

      expect(stringField.type).toBe('string');
      expect(arrayField.type).toBe('array');
      expect(objectField.type).toBe('object');
    });
  });
});

describe('SchemaParser Class', () => {
  let parser: SchemaParser;

  beforeEach(() => {
    parser = new SchemaParser();
  });

  describe('parseResourceExplanation method', () => {
    it('should convert ResourceExplanation to ResourceSchema', () => {
      const explanation: ResourceExplanation = {
        kind: 'Pod',
        version: 'v1',
        group: '',
        description: 'Pod is a collection of containers',
        fields: [
          {
            name: 'metadata',
            type: 'Object',
            description: 'Standard object metadata',
            required: true
          },
          {
            name: 'spec',
            type: 'Object',
            description: 'Specification of the desired behavior',
            required: true
          },
          {
            name: 'status',
            type: 'Object',
            description: 'Most recently observed status',
            required: false
          }
        ]
      };

      const schema = parser.parseResourceExplanation(explanation);

      expect(schema.kind).toBe('Pod');
      expect(schema.version).toBe('v1');
      expect(schema.group).toBe('');
      expect(schema.apiVersion).toBe('v1');
      expect(schema.description).toContain('Pod is a collection');
      expect(schema.required).toContain('metadata');
      expect(schema.required).toContain('spec');
      expect(schema.required).not.toContain('status');
      expect(schema.properties.has('metadata')).toBe(true);
      expect(schema.properties.has('spec')).toBe(true);
      expect(schema.properties.has('status')).toBe(true);
    });

    it('should handle nested field parsing correctly', () => {
      const explanation: ResourceExplanation = {
        kind: 'Deployment',
        version: 'v1',
        group: 'apps',
        description: 'Deployment description',
        fields: [
          {
            name: 'spec.replicas',
            type: 'integer',
            description: 'Number of desired pods',
            required: false
          },
          {
            name: 'spec.selector.matchLabels',
            type: 'object',
            description: 'Map of label selectors',
            required: true
          },
          {
            name: 'spec.template.metadata.labels',
            type: 'object',
            description: 'Map of string keys and values',
            required: false
          }
        ]
      };

      const schema = parser.parseResourceExplanation(explanation);

      expect(schema.properties.has('spec')).toBe(true);
      const specField = schema.properties.get('spec');
      expect(specField?.nested?.has('replicas')).toBe(true);
      expect(specField?.nested?.has('selector')).toBe(true);
      expect(specField?.nested?.has('template')).toBe(true);

      const selectorField = specField?.nested?.get('selector');
      expect(selectorField?.nested?.has('matchLabels')).toBe(true);
    });

    it('should extract type constraints from field descriptions', () => {
      const explanation: ResourceExplanation = {
        kind: 'Pod',
        version: 'v1',
        group: '',
        description: 'Pod description',
        fields: [
          {
            name: 'spec.activeDeadlineSeconds',
            type: 'integer',
            description: 'Optional duration in seconds (minimum: 1)',
            required: false
          },
          {
            name: 'spec.restartPolicy',
            type: 'string',
            description: 'Restart policy. Possible values: Always, OnFailure, Never',
            required: false
          }
        ]
      };

      const schema = parser.parseResourceExplanation(explanation);
      const specField = schema.properties.get('spec');
      
      const deadlineField = specField?.nested?.get('activeDeadlineSeconds');
      expect(deadlineField?.constraints?.minimum).toBe(1);

      const restartField = specField?.nested?.get('restartPolicy');
      expect(restartField?.constraints?.enum).toEqual(['Always', 'OnFailure', 'Never']);
    });

    it('should handle different kubectl explain output formats', () => {
      // Test with minimal field information
      const minimalExplanation: ResourceExplanation = {
        kind: 'ConfigMap',
        version: 'v1',
        group: '',
        description: 'ConfigMap holds configuration data',
        fields: [
          {
            name: 'data',
            type: 'object',
            description: 'Data contains the configuration data',
            required: false
          }
        ]
      };

      const schema = parser.parseResourceExplanation(minimalExplanation);
      expect(schema.kind).toBe('ConfigMap');
      expect(schema.properties.has('data')).toBe(true);
    });
  });

  describe('parseFieldConstraints method', () => {
    it('should extract minimum and maximum values from descriptions', () => {
      const constraints1 = parser.parseFieldConstraints('integer', 'Port number (minimum: 1, maximum: 65535)');
      expect(constraints1.minimum).toBe(1);
      expect(constraints1.maximum).toBe(65535);

      const constraints2 = parser.parseFieldConstraints('integer', 'Replicas (min: 0, max: 100)');
      expect(constraints2.minimum).toBe(0);
      expect(constraints2.maximum).toBe(100);
    });

    it('should extract enum values from descriptions', () => {
      const constraints1 = parser.parseFieldConstraints('string', 'Policy. Possible values: Always, OnFailure, Never');
      expect(constraints1.enum).toEqual(['Always', 'OnFailure', 'Never']);

      const constraints2 = parser.parseFieldConstraints('string', 'Type. Valid values are: ClusterIP, NodePort, LoadBalancer');
      expect(constraints2.enum).toEqual(['ClusterIP', 'NodePort', 'LoadBalancer']);
    });

    it('should extract default values from descriptions', () => {
      const constraints1 = parser.parseFieldConstraints('string', 'Image pull policy (default: IfNotPresent)');
      expect(constraints1.default).toBe('IfNotPresent');

      const constraints2 = parser.parseFieldConstraints('integer', 'Port number. Defaults to 80');
      expect(constraints2.default).toBe(80);
    });

    it('should handle complex constraint descriptions', () => {
      const constraints = parser.parseFieldConstraints(
        'string',
        'DNS policy. Valid values: ClusterFirst, Default, None. Default: ClusterFirst. Min length: 1'
      );
      expect(constraints.enum).toEqual(['ClusterFirst', 'Default', 'None']);
      expect(constraints.default).toBe('ClusterFirst');
      expect(constraints.minLength).toBe(1);
    });
  });
});

// Mock the kubernetes-utils module before importing
jest.mock('../src/core/kubernetes-utils', () => ({
  executeKubectl: jest.fn()
}));

describe('ManifestValidator Class', () => {
  let validator: ManifestValidator;
  let tempDir: string;
  let mockExecuteKubectl: jest.MockedFunction<any>;

  beforeEach(async () => {
    // Import the mocked function
    const { executeKubectl } = await import('../src/core/kubernetes-utils');
    mockExecuteKubectl = executeKubectl as jest.MockedFunction<any>;
    
    validator = new ManifestValidator();
    
    // Create a temporary directory for test manifests
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-validator-test-'));
    
    // Reset mock before each test
    mockExecuteKubectl.mockReset();
  });

  afterEach(async () => {
    // Clean up temporary files
    const fs = await import('fs');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateManifest method', () => {
    it('should validate a correct manifest successfully using dry-run', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      const validManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap',
          namespace: 'default',
          labels: { app: 'test' }
        },
        data: {
          'config.yaml': 'test: value'
        }
      };

      const manifestPath = path.join(tempDir, 'valid-manifest.yaml');
      const yaml = await import('yaml');
      fs.writeFileSync(manifestPath, yaml.stringify(validManifest));

      // Mock executeKubectl to simulate successful dry-run
      mockExecuteKubectl.mockResolvedValue('configmap/test-configmap created (dry run)');

      const result = await validator.validateManifest(manifestPath);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        ['apply', '--dry-run=server', '-f', manifestPath],
        { kubeconfig: undefined }
      );
    });

    it('should detect validation errors using dry-run', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      // Create an invalid manifest (missing required fields)
      const invalidManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'test-deployment'
        }
        // Missing required spec field
      };

      const manifestPath = path.join(tempDir, 'invalid-manifest.yaml');
      const yaml = await import('yaml');
      fs.writeFileSync(manifestPath, yaml.stringify(invalidManifest));

      // Mock executeKubectl to simulate validation failure
      mockExecuteKubectl.mockRejectedValue(new Error('validation failed: spec is required'));

      const result = await validator.validateManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Kubernetes validation failed: validation failed: spec is required');
    });

    it('should handle unknown field errors', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      const manifestPath = path.join(tempDir, 'unknown-field-manifest.yaml');
      fs.writeFileSync(manifestPath, 'apiVersion: v1\nkind: Pod\nunknownField: value');

      // Mock executeKubectl to simulate unknown field error
      mockExecuteKubectl.mockRejectedValue(new Error('unknown field "unknownField"'));

      const result = await validator.validateManifest(manifestPath);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown field in manifest: unknown field "unknownField"');
    });

    it('should provide best practice warnings for valid manifests', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      const manifestWithoutLabels = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap'
          // Missing labels and namespace
        },
        data: {
          'config.yaml': 'test: value'
        }
      };

      const manifestPath = path.join(tempDir, 'no-labels-manifest.yaml');
      const yaml = await import('yaml');
      fs.writeFileSync(manifestPath, yaml.stringify(manifestWithoutLabels));

      // Mock executeKubectl to simulate successful dry-run
      mockExecuteKubectl.mockResolvedValue('configmap/test-configmap created (dry run)');

      const result = await validator.validateManifest(manifestPath);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(warning => warning.includes('labels'))).toBe(true);
      expect(result.warnings.some(warning => warning.includes('namespace'))).toBe(true);
    });

    it('should support client-side dry-run mode', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      const validManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap'
        },
        data: {
          'config.yaml': 'test: value'
        }
      };

      const manifestPath = path.join(tempDir, 'client-dry-run-manifest.yaml');
      const yaml = await import('yaml');
      fs.writeFileSync(manifestPath, yaml.stringify(validManifest));

      // Mock executeKubectl to simulate successful client dry-run
      mockExecuteKubectl.mockResolvedValue('configmap/test-configmap created (dry run)');

      const result = await validator.validateManifest(manifestPath, { dryRunMode: 'client' });

      expect(result.valid).toBe(true);
      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        ['apply', '--dry-run=client', '-f', manifestPath],
        { kubeconfig: undefined }
      );
    });

    it('should support custom kubeconfig', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      const validManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap'
        },
        data: {
          'config.yaml': 'test: value'
        }
      };

      const manifestPath = path.join(tempDir, 'custom-kubeconfig-manifest.yaml');
      const yaml = await import('yaml');
      fs.writeFileSync(manifestPath, yaml.stringify(validManifest));

      // Mock executeKubectl to simulate successful dry-run with custom kubeconfig
      mockExecuteKubectl.mockResolvedValue('configmap/test-configmap created (dry run)');

      const customKubeconfig = '/path/to/custom/kubeconfig';
      const result = await validator.validateManifest(manifestPath, { kubeconfig: customKubeconfig });

      expect(result.valid).toBe(true);
      expect(mockExecuteKubectl).toHaveBeenCalledWith(
        ['apply', '--dry-run=server', '-f', manifestPath],
        { kubeconfig: customKubeconfig }
      );
    });
  });

});

describe('ResourceRanker Class', () => {
  let ranker: ResourceRanker;
  let schemas: ResourceSchema[];

  beforeEach(() => {
    ranker = new ResourceRanker();
    
    // Create sample schemas for ranking tests
    schemas = [
      {
        apiVersion: 'v1',
        kind: 'Pod',
        group: '',
        version: 'v1',
        description: 'Pod is a collection of containers that can run on a host',
        properties: new Map(),
        required: ['metadata', 'spec'],
        namespace: true
      },
      {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Deployment enables declarative updates for Pods and ReplicaSets',
        properties: new Map(),
        required: ['metadata', 'spec'],
        namespace: true
      },
      {
        apiVersion: 'v1',
        kind: 'Service',
        group: '',
        version: 'v1',
        description: 'Service is a named abstraction of software service',
        properties: new Map(),
        required: ['metadata', 'spec'],
        namespace: true
      }
    ];
  });

  describe('rankResourcesByIntent method', () => {
    it('should rank Deployment highest for scalable web app intent', () => {
      const intent = 'scalable web application with multiple replicas';
      const ranking = ranker.rankResourcesByIntent(intent, schemas);

      expect(ranking).toHaveLength(3);
      expect(ranking[0].schema.kind).toBe('Deployment');
      expect(ranking[0].score).toBeGreaterThan(ranking[1].score);
      expect(ranking[0].reasons).toContain('scalable');
    });

    it('should rank Service highest for networking intent', () => {
      const intent = 'expose application with load balancing';
      const ranking = ranker.rankResourcesByIntent(intent, schemas);

      expect(ranking[0].schema.kind).toBe('Service');
      expect(ranking[0].reasons).toContain('expose');
    });

    it('should rank Pod lowest for production workloads', () => {
      const intent = 'production web application with high availability';
      const ranking = ranker.rankResourcesByIntent(intent, schemas);

      const podRanking = ranking.find(r => r.schema.kind === 'Pod');
      expect(podRanking?.score).toBeLessThan(
        ranking.find(r => r.schema.kind === 'Deployment')?.score || 0
      );
    });

    it('should provide detailed scoring reasons', () => {
      const intent = 'web application with auto-scaling';
      const ranking = ranker.rankResourcesByIntent(intent, schemas);

      const deploymentRanking = ranking.find(r => r.schema.kind === 'Deployment');
      expect(deploymentRanking?.reasons).toContain('auto-scaling');
      expect(deploymentRanking?.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('calculateCapabilityScore method', () => {
    it('should score based on keyword matches in descriptions', () => {
      const deploymentSchema = schemas.find(s => s.kind === 'Deployment')!;
      const intent = 'declarative updates for applications';
      
      const score = ranker.calculateCapabilityScore(intent, deploymentSchema);
      expect(score).toBeGreaterThan(0);
    });

    it('should give higher scores for better matches', () => {
      const deploymentSchema = schemas.find(s => s.kind === 'Deployment')!;
      const podSchema = schemas.find(s => s.kind === 'Pod')!;
      
      const scalingIntent = 'scalable application with replica management';
      const deploymentScore = ranker.calculateCapabilityScore(scalingIntent, deploymentSchema);
      const podScore = ranker.calculateCapabilityScore(scalingIntent, podSchema);
      
      expect(deploymentScore).toBeGreaterThan(podScore);
    });
  });

  describe('extractScoringReasons method', () => {
    it('should extract relevant keywords from intent and schema', () => {
      const deploymentSchema = schemas.find(s => s.kind === 'Deployment')!;
      const intent = 'scalable web application with declarative updates';
      
      const reasons = ranker.extractScoringReasons(intent, deploymentSchema);
      expect(reasons).toContain('scalable');
      expect(reasons).toContain('declarative');
    });

    it('should handle case-insensitive matching', () => {
      const deploymentSchema = schemas.find(s => s.kind === 'Deployment')!;
      const intent = 'SCALABLE application with DECLARATIVE updates';
      
      const reasons = ranker.extractScoringReasons(intent, deploymentSchema);
      expect(reasons.length).toBeGreaterThan(0);
    });
  });
});

describe('Integration Tests', () => {
  describe('End-to-end schema parsing and validation workflow', () => {
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

      // Create a temporary manifest file for validation
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      const yaml = await import('yaml');
      
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-test-'));
      const manifestPath = path.join(tempDir, 'test-manifest.yaml');
      
      const manifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-config'
        },
        data: {
          'config.yaml': 'setting: value'
        }
      };
      
      fs.writeFileSync(manifestPath, yaml.stringify(manifest));

      // Mock executeKubectl for validation
      const kubernetesUtils = await import('../src/core/kubernetes-utils');
      const mockExecuteKubectl = jest.spyOn(kubernetesUtils, 'executeKubectl');
      mockExecuteKubectl.mockResolvedValue('configmap/test-config created (dry run)');

      // Validate the manifest using dry-run
      const result = await validator.validateManifest(manifestPath);
      expect(result.valid).toBe(true);
      
      // Restore the mock
      mockExecuteKubectl.mockRestore();
      
      // Clean up
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should handle complex CRD schemas', () => {
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