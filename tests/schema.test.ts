/**
 * Schema Parser and Validator Tests
 * 
 * TDD test suite for Task 3: Resource Schema Parser and Validator
 * Following the same TDD methodology used in Task 2
 */

import { SchemaParser, ResourceSchema, SchemaField, ResourceRecommender, ValidationResult, ResourceSolution, AIRankingConfig } from '../src/core/schema';
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

describe('ResourceRecommender Class (AI-Powered Two-Phase)', () => {
  let ranker: ResourceRecommender;
  let config: AIRankingConfig;
  let mockClaudeIntegration: any;
  let mockDiscoverResources: jest.Mock;
  let mockExplainResource: jest.Mock;

  beforeEach(() => {
    config = { claudeApiKey: 'test-key' };
    
    // Mock discovery functions
    mockDiscoverResources = jest.fn();
    mockExplainResource = jest.fn();

    // Mock the Claude integration
    const ClaudeIntegration = require('../src/core/claude').ClaudeIntegration;
    mockClaudeIntegration = {
      isInitialized: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn()
    };
    jest.spyOn(ClaudeIntegration.prototype, 'isInitialized').mockReturnValue(true);
    jest.spyOn(ClaudeIntegration.prototype, 'sendMessage').mockImplementation(mockClaudeIntegration.sendMessage);

    ranker = new ResourceRecommender(config);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findBestSolutions method with functional approach', () => {
    it('should perform two-phase analysis for simple intent', async () => {
      const intent = 'run a simple container';
      
      // Mock discovery data
      mockDiscoverResources.mockResolvedValue({
        resources: [
          { kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true },
          { kind: 'Deployment', apiVersion: 'apps/v1', group: 'apps', namespaced: true }
        ],
        custom: []
      });

      // Mock resource explanation
      mockExplainResource.mockResolvedValue({
        kind: 'Pod',
        version: 'v1',
        group: '',
        description: 'Pod is a collection of containers that can run on a host',
        fields: [
          { name: 'metadata', type: 'Object', description: 'Standard object metadata', required: true },
          { name: 'spec', type: 'Object', description: 'Specification of the desired behavior', required: true }
        ]
      });

      // Mock fs.readFileSync for both prompt templates
      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync')
        .mockReturnValueOnce('User Intent: {intent}\n\nAvailable Resources:\n{resources}') // Phase 1 template
        .mockReturnValueOnce('User Intent: {intent}\n\nSelected Resources:\n{resources}'); // Phase 2 template

      // Mock AI responses for both phases
      mockClaudeIntegration.sendMessage
        .mockResolvedValueOnce({
          content: `\`\`\`json
[
  {
    "kind": "Pod",
    "apiVersion": "v1",
    "group": ""
  }
]
\`\`\``
        })
        .mockResolvedValueOnce({
          content: `\`\`\`json
{
  "solutions": [
    {
      "type": "single",
      "resourceIndexes": [0],
      "score": 85,
      "description": "Pod for simple container execution",
      "reasons": ["Direct container hosting", "Simple use case"],
      "analysis": "Pod is the perfect choice for running a simple container without complex orchestration needs",
      "deploymentOrder": [0],
      "dependencies": []
    }
  ]
}
\`\`\``
        });

      const solutions = await ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource);

      expect(mockDiscoverResources).toHaveBeenCalledTimes(1);
      expect(mockExplainResource).toHaveBeenCalledWith('Pod');
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledTimes(2);
      expect(solutions).toHaveLength(1);
      expect(solutions[0].type).toBe('single');
      expect(solutions[0].resources[0].kind).toBe('Pod');
      expect(solutions[0].score).toBe(85);
    });

    it('should handle CRD resources in two-phase approach', async () => {
      const intent = 'provision a new Kubernetes cluster';
      
      // Mock discovery with CRD
      mockDiscoverResources.mockResolvedValue({
        resources: [
          { kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true }
        ],
        custom: [
          { kind: 'Cluster', version: 'v1beta1', group: 'infrastructure.cluster.x-k8s.io', scope: 'Namespaced' }
        ]
      });

      // Mock CRD explanation
      mockExplainResource.mockResolvedValue({
        kind: 'Cluster',
        version: 'v1beta1',
        group: 'infrastructure.cluster.x-k8s.io',
        description: 'Cluster is the Schema for the clusters API',
        fields: [
          { name: 'metadata', type: 'Object', description: 'Standard object metadata', required: true },
          { name: 'spec', type: 'Object', description: 'Desired state of the cluster', required: true }
        ]
      });

      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync')
        .mockReturnValueOnce('{intent}\n{resources}')
        .mockReturnValueOnce('{intent}\n{resources}');

      mockClaudeIntegration.sendMessage
        .mockResolvedValueOnce({
          content: `[{
            "kind": "Cluster",
            "apiVersion": "infrastructure.cluster.x-k8s.io/v1beta1",
            "group": "infrastructure.cluster.x-k8s.io"
          }]`
        })
        .mockResolvedValueOnce({
          content: `{
            "solutions": [{
              "type": "single",
              "resourceIndexes": [0],
              "score": 98,
              "description": "Custom resource for cluster provisioning",
              "reasons": ["Cluster management", "Infrastructure as code"],
              "analysis": "This CRD is specifically designed for cluster provisioning",
              "deploymentOrder": [0],
              "dependencies": ["cluster-api-provider"]
            }]
          }`
        });

      const solutions = await ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource);

      expect(solutions[0].resources[0].kind).toBe('Cluster');
      expect(solutions[0].resources[0].group).toBe('infrastructure.cluster.x-k8s.io');
      expect(solutions[0].score).toBe(98);
      expect(solutions[0].dependencies).toContain('cluster-api-provider');
    });

    it('should handle resource selection errors gracefully', async () => {
      const intent = 'test intent';
      
      mockDiscoverResources.mockResolvedValue({
        resources: [{ kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true }],
        custom: []
      });

      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{intent}\n{resources}');

      // Mock invalid AI response for resource selection
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: 'Invalid JSON response'
      });

      await expect(ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource))
        .rejects.toThrow('AI failed to select resources in valid JSON format');
    });

    it('should handle schema fetching failures', async () => {
      const intent = 'test intent';
      
      mockDiscoverResources.mockResolvedValue({
        resources: [{ kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true }],
        custom: []
      });

      // Mock successful resource selection but failed schema fetching
      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{intent}\n{resources}');

      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: `[{"kind": "Pod", "apiVersion": "v1", "group": ""}]`
      });

      mockExplainResource.mockRejectedValue(new Error('Resource not found'));

      await expect(ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource))
        .rejects.toThrow('Could not fetch schemas for any selected resources');
    });

    it('should throw error when Claude integration not initialized', async () => {
      // Mock isInitialized to return false
      const ClaudeIntegration = require('../src/core/claude').ClaudeIntegration;
      jest.spyOn(ClaudeIntegration.prototype, 'isInitialized').mockReturnValue(false);
      
      const uninitializedRanker = new ResourceRecommender(config);

      await expect(uninitializedRanker.findBestSolutions('test intent', mockDiscoverResources, mockExplainResource))
        .rejects.toThrow('Claude integration not initialized');
    });

    it('should validate AI-selected resources have required fields', async () => {
      const intent = 'test intent';
      
      mockDiscoverResources.mockResolvedValue({
        resources: [{ kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true }],
        custom: []
      });

      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{intent}\n{resources}');

      // Mock AI response with invalid resource (missing apiVersion)
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: `[{"kind": "Pod", "group": ""}]`
      });

      await expect(ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource))
        .rejects.toThrow('AI selected invalid resource');
    });

    it('should handle complex multi-resource solutions', async () => {
      const intent = 'deploy a scalable web application';
      
      mockDiscoverResources.mockResolvedValue({
        resources: [
          { kind: 'Deployment', apiVersion: 'apps/v1', group: 'apps', namespaced: true },
          { kind: 'Service', apiVersion: 'v1', group: '', namespaced: true }
        ],
        custom: []
      });

      // Mock explanations for both resources
      mockExplainResource
        .mockResolvedValueOnce({
          kind: 'Deployment',
          version: 'v1',
          group: 'apps',
          description: 'Deployment enables declarative updates for Pods and ReplicaSets',
          fields: [
            { name: 'metadata', type: 'Object', description: 'Standard object metadata', required: true },
            { name: 'spec', type: 'Object', description: 'Specification of the desired behavior', required: true }
          ]
        })
        .mockResolvedValueOnce({
          kind: 'Service',
          version: 'v1',
          group: '',
          description: 'Service is a named abstraction of software service',
          fields: [
            { name: 'metadata', type: 'Object', description: 'Standard object metadata', required: true },
            { name: 'spec', type: 'Object', description: 'Specification of the desired behavior', required: true }
          ]
        });

      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync')
        .mockReturnValueOnce('{intent}\n{resources}')
        .mockReturnValueOnce('{intent}\n{resources}');

      mockClaudeIntegration.sendMessage
        .mockResolvedValueOnce({
          content: `[
            {"kind": "Deployment", "apiVersion": "apps/v1", "group": "apps"},
            {"kind": "Service", "apiVersion": "v1", "group": ""}
          ]`
        })
        .mockResolvedValueOnce({
          content: `{
            "solutions": [{
              "type": "combination",
              "resourceIndexes": [0, 1],
              "score": 95,
              "description": "Complete web application stack",
              "reasons": ["Scalable architecture", "Load balancing"],
              "analysis": "Deployment provides scalability, Service enables network access",
              "deploymentOrder": [0, 1],
              "dependencies": []
            }]
          }`
        });

      const solutions = await ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource);

      expect(mockExplainResource).toHaveBeenCalledTimes(2);
      expect(solutions[0].type).toBe('combination');
      expect(solutions[0].resources).toHaveLength(2);
      expect(solutions[0].resources[0].kind).toBe('Deployment');
      expect(solutions[0].resources[1].kind).toBe('Service');
      expect(solutions[0].score).toBe(95);
    });

    it('should load correct prompt templates for both phases', async () => {
      const intent = 'test intent';
      
      mockDiscoverResources.mockResolvedValue({
        resources: [{ kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true }],
        custom: []
      });

      mockExplainResource.mockResolvedValue({
        kind: 'Pod',
        version: 'v1',
        group: '',
        description: 'Pod description',
        fields: [{ name: 'metadata', type: 'Object', description: 'Metadata', required: true }]
      });

      const fs = require('fs');
      // Reset the mock and set clear expectations
      const mockReadFileSync = jest.spyOn(fs, 'readFileSync');
      mockReadFileSync.mockClear();
      mockReadFileSync
        .mockReturnValueOnce('Selection template: {intent}\n{resources}')
        .mockReturnValueOnce('Ranking template: {intent}\n{resources}');

      mockClaudeIntegration.sendMessage
        .mockResolvedValueOnce({ content: `[{"kind": "Pod", "apiVersion": "v1", "group": ""}]` })
        .mockResolvedValueOnce({ content: `{"solutions": [{"type": "single", "resourceIndexes": [0], "score": 50, "description": "Test", "reasons": [], "analysis": "", "deploymentOrder": [0], "dependencies": []}]}` });

      await ranker.findBestSolutions(intent, mockDiscoverResources, mockExplainResource);

      // Verify that the correct prompt files were loaded
      expect(mockReadFileSync.mock.calls.find((call: any) => 
        call[0] && call[0].includes('prompts/resource-selection.md')
      )).toBeDefined();
      expect(mockReadFileSync.mock.calls.find((call: any) => 
        call[0] && call[0].includes('prompts/resource-solution-ranking.md')  
      )).toBeDefined();
    });
  });
});

