/**
 * Capability Inference Engine Tests
 * 
 * Test suite for PRD #48: Resource Capabilities Discovery & Integration
 * Tests AI-powered capability inference for Kubernetes resources
 */

// Mock fs module before importing anything
const mockFs = {
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('Mock template with {kind} {group} {apiVersion}')
};

jest.doMock('fs', () => mockFs);
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
      mockFs.readFileSync.mockReturnValue('Mock prompt template with {resourceName}');
      mockClaudeIntegration.sendMessage.mockResolvedValue(mockAIResponse);
    });

    it('should successfully infer capabilities with schema and metadata', async () => {
      const schema = 'apiVersion: devopstoolkit.live/v1beta1\nkind: SQL';
      const metadata = { annotations: { 'example.com/database': 'true' } };

      const result = await engine.inferCapabilities(sampleResourceName, schema, metadata);

      expect(result.resourceName).toBe('SQL.devopstoolkit.live');
      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(result.providers).toEqual(['azure', 'gcp', 'aws']);
      expect(result.complexity).toBe('low');
      expect(result.confidence).toBe(0.9);
      expect(result.analyzedAt).toBeDefined();
    });

    it('should successfully infer capabilities with schema only', async () => {
      const schema = 'apiVersion: devopstoolkit.live/v1beta1\nkind: SQL';

      const result = await engine.inferCapabilities(sampleResourceName, schema);

      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting capability inference',
        expect.objectContaining({
          resource: 'SQL.devopstoolkit.live',
          hasSchema: true,
          hasMetadata: false
        })
      );
    });

    it('should successfully infer capabilities with metadata only', async () => {
      const metadata = { annotations: { 'example.com/database': 'true' } };

      const result = await engine.inferCapabilities(sampleResourceName, undefined, metadata);

      expect(result.capabilities).toEqual(['postgresql', 'mysql', 'database']);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting capability inference',
        expect.objectContaining({
          resource: 'SQL.devopstoolkit.live',
          hasSchema: false,
          hasMetadata: true
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
          hasSchema: false,
          hasMetadata: false
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

    it('should load prompt template from correct path', async () => {
      const mockTemplate = 'Template with {kind} and {group} and {apiVersion}';
      mockFs.readFileSync.mockReturnValue(mockTemplate);
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

      await engine.inferCapabilities(sampleResourceName);

      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('prompts/capability-inference.md')
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('prompts/capability-inference.md'),
        'utf8'
      );
    });

    it('should replace template variables correctly', async () => {
      const mockTemplate = 'Resource: {resourceName} Context: {analysisContext} Schema: {schema} Metadata: {metadata}';
      mockFs.readFileSync.mockReturnValue(mockTemplate);
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

      const schema = 'kind: SQL';
      const metadata = { test: 'data' };

      await engine.inferCapabilities(sampleResourceName, schema, metadata);

      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Resource: SQL.devopstoolkit.live')
      );
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Context: Schema and metadata available')
      );
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Schema: kind: SQL')
      );
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Metadata: {\n  "test": "data"\n}')
      );
    });

    it('should handle different analysis contexts', async () => {
      const mockTemplate = 'Context: {analysisContext}';
      mockFs.readFileSync.mockReturnValue(mockTemplate);
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

      // Test schema only
      await engine.inferCapabilities(sampleResourceName, 'schema');
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith('Context: Schema only');

      // Test metadata only
      await engine.inferCapabilities(sampleResourceName, undefined, { test: 'data' });
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith('Context: Metadata only');

      // Test limited context
      await engine.inferCapabilities(sampleResourceName);
      expect(mockClaudeIntegration.sendMessage).toHaveBeenCalledWith('Context: Limited context');
    });

    it('should throw error if prompt template file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'Capability inference prompt template not found'
      );
    });

    it('should throw error if prompt template cannot be read', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(engine.inferCapabilities(sampleResourceName)).rejects.toThrow(
        'Failed to read capability inference prompt: File read error'
      );
    });
  });

  describe('AI response parsing', () => {
    const sampleResourceName = 'SQL.devopstoolkit.live';

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue('Mock template');
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
    it('should generate correct ID format for standard resource', () => {
      const resourceName = 'SQL.devopstoolkit.live';

      const id = CapabilityInferenceEngine.generateCapabilityId(resourceName);

      expect(id).toBe('capability-SQL-devopstoolkit-live');
    });

    it('should generate correct ID format for core resource', () => {
      const resourceName = 'Pod';

      const id = CapabilityInferenceEngine.generateCapabilityId(resourceName);

      expect(id).toBe('capability-Pod');
    });

    it('should generate correct ID format for apps resource', () => {
      const resourceName = 'Deployment.apps';

      const id = CapabilityInferenceEngine.generateCapabilityId(resourceName);

      expect(id).toBe('capability-Deployment-apps');
    });
  });
});