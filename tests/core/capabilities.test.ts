/**
 * Capability Inference Engine Tests
 * 
 * Test suite for PRD #48: Resource Capabilities Discovery & Integration
 * Tests AI-powered capability inference for Kubernetes resources
 */

// No FS mocking needed - we test actual behavior, not implementation
jest.mock('../../src/core/claude');

import { CapabilityInferenceEngine, ResourceCapability } from '../../src/core/capabilities';
import { ClaudeIntegration } from '../../src/core/claude';
import { Logger } from '../../src/core/error-handling';


describe('ResourceCapability Interface', () => {
  it('should define complete capability structure with all required fields', () => {
    const capability: ResourceCapability = {
      resourceName: 'SQL.devopstoolkit.live',
      capabilities: ['postgresql', 'mysql', 'database'],
      providers: ['azure', 'gcp', 'aws'],
      abstractions: ['managed-service', 'high-availability'],
      complexity: 'low',
      description: 'High-level managed database solution',
      useCase: 'Simple database deployment',
      confidence: 0.9,
      analyzedAt: '2025-08-05T10:30:00Z'
    };

    expect(capability.resourceName).toBe('SQL.devopstoolkit.live');
    expect(capability.capabilities).toEqual(['postgresql', 'mysql', 'database']);
    expect(capability.providers).toEqual(['azure', 'gcp', 'aws']);
    expect(capability.abstractions).toEqual(['managed-service', 'high-availability']);
    expect(capability.complexity).toBe('low');
    expect(capability.confidence).toBe(0.9);
  });

  it('should support optional embedding field', () => {
    const capability: ResourceCapability = {
      resourceName: 'SQL.devopstoolkit.live',
      capabilities: ['database'],
      providers: ['azure'],
      abstractions: ['managed-service'],
      complexity: 'low',
      description: 'Database resource',
      useCase: 'Database deployment',
      confidence: 0.8,
      analyzedAt: '2025-08-05T10:30:00Z',
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5]
    };

    expect(capability.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });
});

describe('CapabilityInferenceEngine', () => {
  let engine: CapabilityInferenceEngine;
  let mockClaudeIntegration: jest.Mocked<ClaudeIntegration>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocked dependencies
    mockClaudeIntegration = {
      sendMessage: jest.fn()
    } as any;
    
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    engine = new CapabilityInferenceEngine(mockClaudeIntegration, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with Claude integration and logger', () => {
      expect(engine).toBeInstanceOf(CapabilityInferenceEngine);
    });
  });

  describe('inferCapabilities', () => {
    const sampleResourceName = 'SQL.devopstoolkit.live';

    const mockAIResponse = {
      content: JSON.stringify({
        capabilities: ['postgresql', 'mysql', 'database'],
        providers: ['azure', 'gcp', 'aws'],
        abstractions: ['managed-service'],
        complexity: 'low',
        description: 'High-level managed database solution',
        useCase: 'Simple database deployment',
        confidence: 0.9
      }),
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    };

    beforeEach(() => {
      mockClaudeIntegration.sendMessage.mockResolvedValue(mockAIResponse);
    });

    it('should successfully infer capabilities with complete resource definition', async () => {
      const resourceDefinition = `
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: sqls.devopstoolkit.live
  labels:
    database.postgresql: "true"
    provider.multicloud: "true"
spec:
  group: devopstoolkit.live
  names:
    kind: SQL
    categories: [database, postgresql]
  versions:
  - name: v1beta1
    schema:
      openAPIV3Schema:
        description: "Multi-cloud PostgreSQL database service"
        properties:
          spec:
            properties:
              size:
                enum: [small, medium, large]
              version:
                type: string
              region:
                type: string
`;

      const result = await engine.inferCapabilities(sampleResourceName, resourceDefinition);

      expect(result.resourceName).toBe('SQL.devopstoolkit.live');
      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(result.providers).toEqual(['azure', 'gcp', 'aws']);
      expect(result.complexity).toBe('low');
      expect(result.confidence).toBe(0.9);
      expect(result.analyzedAt).toBeDefined();
    });

    it('should successfully infer capabilities without resource definition', async () => {
      const result = await engine.inferCapabilities(sampleResourceName);

      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting capability inference',
        expect.objectContaining({
          resource: 'SQL.devopstoolkit.live',
          hasDefinition: false
        })
      );
    });

    it('should successfully infer capabilities with resource definition', async () => {
      const resourceDefinition = 'apiVersion: v1\nkind: Pod\nspec:\n  containers:\n  - name: app\n    image: nginx';

      const result = await engine.inferCapabilities('Pod', resourceDefinition);

      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting capability inference',
        expect.objectContaining({
          resource: 'Pod',
          hasDefinition: true
        })
      );
    });

    it('should successfully infer capabilities with minimal context', async () => {
      const result = await engine.inferCapabilities(sampleResourceName);

      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting capability inference',
        expect.objectContaining({
          resource: 'SQL.devopstoolkit.live',
          hasDefinition: false
        })
      );
    });

    it('should log completion with capability counts', async () => {
      await engine.inferCapabilities(sampleResourceName);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Capability inference completed',
        expect.objectContaining({
          resource: 'SQL.devopstoolkit.live',
          capabilitiesFound: 3,
          providersFound: 3,
          complexity: 'low',
          confidence: 0.9
        })
      );
    });
  });

  describe('prompt template loading', () => {
    const sampleResourceName = 'SQL.devopstoolkit.live';

    it('should successfully load capability inference prompt', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          capabilities: ['database'],
          providers: ['azure'],
          abstractions: ['managed-service'],
          complexity: 'medium',
          description: 'Database resource',
          useCase: 'Database deployment',
          confidence: 0.8
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      const result = await engine.inferCapabilities(sampleResourceName);

      // Verify Claude was called with a prompt that includes the resource name
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining(sampleResourceName)
      );
      
      // Verify Claude was called with a prompt that includes the default "No resource definition provided" text
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('No resource definition provided')
      );
      
      expect(result).toEqual({
        resourceName: sampleResourceName,
        capabilities: ['database'],
        providers: ['azure'],
        abstractions: ['managed-service'],
        complexity: 'medium',
        description: 'Database resource',
        useCase: 'Database deployment',
        confidence: 0.8,
        analyzedAt: expect.any(String)
      });
    });

    it('should successfully process capability inference with resource definition', async () => {
      const resourceDefinition = 'apiVersion: v1\nkind: SQL\nmetadata:\n  name: test-sql';
      
      // Set up mock response for this specific test
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          capabilities: ['database', 'sql'],
          providers: ['kubernetes'],
          abstractions: ['custom-resource'],
          complexity: 'medium',
          description: 'SQL database resource',
          useCase: 'Database deployment with definition',
          confidence: 0.85
        }),
        usage: { input_tokens: 120, output_tokens: 60 }
      });

      const result = await engine.inferCapabilities(sampleResourceName, resourceDefinition);

      // Verify Claude was called with a prompt that includes the resource name  
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining(sampleResourceName)
      );
      
      // Verify Claude was called with a prompt that includes the resource definition
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('apiVersion: v1')
      );
      expect(result).toEqual({
        resourceName: sampleResourceName,
        capabilities: ['database', 'sql'],
        providers: ['kubernetes'],
        abstractions: ['custom-resource'],
        complexity: 'medium',
        description: 'SQL database resource',
        useCase: 'Database deployment with definition',
        confidence: 0.85,
        analyzedAt: expect.any(String)
      });
    });

    it('should handle analysis without resource definition', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          capabilities: ['database'],
          providers: ['azure'],
          abstractions: ['managed-service'],
          complexity: 'medium',
          description: 'Database resource',
          useCase: 'Database deployment',
          confidence: 0.8
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      const result = await engine.inferCapabilities(sampleResourceName);

      // Verify Claude was called and result is properly formatted
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalled();
      expect(result).toEqual({
        resourceName: sampleResourceName,
        capabilities: ['database'],
        providers: ['azure'],
        abstractions: ['managed-service'],
        complexity: 'medium',
        description: 'Database resource',
        useCase: 'Database deployment',
        confidence: 0.8,
        analyzedAt: expect.any(String)
      });
    });

  });

  describe('AI response parsing', () => {
    const sampleResourceName = 'SQL.devopstoolkit.live';

    beforeEach(() => {
      // No FS mocking needed - using actual prompt file
    });

    it('should parse valid AI response correctly', async () => {
      const validResponse = {
        content: JSON.stringify({
          capabilities: ['postgresql', 'database'],
          providers: ['azure', 'aws'],
          abstractions: ['managed-service'],
          complexity: 'low',
          description: 'Managed database solution',
          useCase: 'Database deployment',
          confidence: 0.85
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      };
      mockClaudeIntegration.sendMessage.mockResolvedValue(validResponse);

      const result = await engine.inferCapabilities(sampleResourceName);

      expect(result.capabilities).toEqual(['postgresql', 'database']);
      expect(result.providers).toEqual(['azure', 'aws']);
      expect(result.abstractions).toEqual(['managed-service']);
      expect(result.complexity).toBe('low');
      expect(result.description).toBe('Managed database solution');
      expect(result.useCase).toBe('Database deployment');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle AI response with extra whitespace', async () => {
      const responseWithWhitespace = {
        content: JSON.stringify({
          capabilities: ['database'],
          providers: ['azure'],
          abstractions: ['managed-service'],
          complexity: 'medium',
          description: '  Managed database solution  ',
          useCase: '  Database deployment  ',
          confidence: 0.8
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      };
      mockClaudeIntegration.sendMessage.mockResolvedValue(responseWithWhitespace);

      const result = await engine.inferCapabilities(sampleResourceName);

      expect(result.description).toBe('Managed database solution');
      expect(result.useCase).toBe('Database deployment');
    });

    it('should throw error if no JSON found in AI response', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: 'This is just text without JSON',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'No JSON found in AI response'
      );
    });

    it('should throw error if AI response contains invalid JSON', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: '{ invalid json }',
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'Invalid JSON in AI response'
      );
    });

    it('should throw error if capabilities field is missing', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          providers: ['azure'],
          abstractions: ['managed-service'],
          complexity: 'low',
          description: 'Database solution',
          useCase: 'Database deployment',
          confidence: 0.8
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'AI response missing or invalid capabilities array'
      );
    });

    it('should throw error if complexity value is invalid', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          capabilities: ['database'],
          providers: ['azure'],
          abstractions: ['managed-service'],
          complexity: 'invalid',
          description: 'Database solution',
          useCase: 'Database deployment',
          confidence: 0.8
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'AI response invalid complexity: invalid. Must be low, medium, or high'
      );
    });

    it('should throw error if confidence is out of range', async () => {
      mockClaudeIntegration.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          capabilities: ['database'],
          providers: ['azure'],
          abstractions: ['managed-service'],
          complexity: 'low',
          description: 'Database solution',
          useCase: 'Database deployment',
          confidence: 1.5
        }),
        usage: { input_tokens: 100, output_tokens: 50 }
      });

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'AI response invalid confidence score: 1.5. Must be number between 0-1'
      );
    });

    it('should log and re-throw AI errors', async () => {
      const aiError = new Error('Claude API error');
      mockClaudeIntegration.sendMessage.mockRejectedValue(aiError);

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow('Claude API error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'AI capability inference failed',
        aiError,
        expect.objectContaining({
          resource: 'SQL.devopstoolkit.live'
        })
      );
    });
  });

  describe('generateCapabilityId static method', () => {
    it('should generate deterministic UUID for standard resource', () => {
      const resourceName = 'SQL.devopstoolkit.live';

      const id = CapabilityInferenceEngine.generateCapabilityId(resourceName);

      // Should be a valid UUID format
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      // Should be deterministic - same input produces same output
      const id2 = CapabilityInferenceEngine.generateCapabilityId(resourceName);
      expect(id).toBe(id2);
      // Verify specific expected UUID for this resource
      expect(id).toBe('d259727c-73e4-4ff0-eac6-54051c1d0c38');
    });

    it('should generate deterministic UUID for core resource', () => {
      const resourceName = 'Pod';

      const id = CapabilityInferenceEngine.generateCapabilityId(resourceName);

      // Should be a valid UUID format
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      // Should be deterministic
      const id2 = CapabilityInferenceEngine.generateCapabilityId(resourceName);
      expect(id).toBe(id2);
      // Verify specific expected UUID for this resource
      expect(id).toBe('df9676f3-8ed2-3424-24cd-cfd7e5ba0729');
    });

    it('should generate deterministic UUID for apps resource', () => {
      const resourceName = 'Deployment.apps';

      const id = CapabilityInferenceEngine.generateCapabilityId(resourceName);

      // Should be a valid UUID format
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      // Should be deterministic
      const id2 = CapabilityInferenceEngine.generateCapabilityId(resourceName);
      expect(id).toBe(id2);
      // Verify specific expected UUID for this resource
      expect(id).toBe('b120b11c-c57a-fcbb-b93c-ff373ad7cf77');
    });

    it('should generate different UUIDs for different resources', () => {
      const id1 = CapabilityInferenceEngine.generateCapabilityId('resource1');
      const id2 = CapabilityInferenceEngine.generateCapabilityId('resource2');
      
      expect(id1).not.toBe(id2);
      // Both should be valid UUIDs
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });
});