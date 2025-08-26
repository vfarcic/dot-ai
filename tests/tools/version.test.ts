/**
 * Tests for Version Tool
 * 
 * Tests the version tool functionality including version info retrieval
 */

import { 
  VERSION_TOOL_NAME, 
  VERSION_TOOL_DESCRIPTION, 
  VERSION_TOOL_INPUT_SCHEMA,
  handleVersionTool,
  getVersionInfo 
} from '../../src/tools/version';
import { Logger } from '../../src/core/error-handling';

// Mock all the core services for diagnostic tests
jest.mock('../../src/core/vector-db-service', () => ({
  VectorDBService: jest.fn().mockImplementation(() => ({
    healthCheck: jest.fn().mockResolvedValue(true),
    getConfig: jest.fn().mockReturnValue({
      url: 'http://localhost:6333',
      collectionName: 'patterns'
    })
  }))
}));

jest.mock('../../src/core/pattern-vector-service', () => ({
  PatternVectorService: jest.fn().mockImplementation(() => ({
    getPatternsCount: jest.fn().mockResolvedValue(5)
  }))
}));

jest.mock('../../src/core/capability-vector-service', () => ({
  CapabilityVectorService: jest.fn().mockImplementation(() => ({
    healthCheck: jest.fn().mockResolvedValue(true),
    initialize: jest.fn().mockResolvedValue(undefined),
    getCapabilitiesCount: jest.fn().mockResolvedValue(3),
    storeCapability: jest.fn().mockResolvedValue(undefined),
    getCapability: jest.fn().mockResolvedValue({
      resourceName: 'test.version.diagnostic',
      capabilities: ['version-test'],
      providers: ['test'],
      abstractions: ['diagnostic'],
      complexity: 'low',
      description: 'Version tool diagnostic test capability',
      useCase: 'Testing capability storage pipeline',
      confidence: 100
    }),
    deleteCapability: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('../../src/core/embedding-service', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockReturnValue(false), // For capability system check
    getStatus: jest.fn().mockReturnValue({
      available: false,
      provider: null,
      reason: 'OPENAI_API_KEY not set - vector operations will fail'
    })
  }))
}));

jest.mock('../../src/core/claude', () => ({
  ClaudeIntegration: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn().mockResolvedValue('test response')
  }))
}));

jest.mock('../../src/core/kubernetes-utils', () => ({
  executeKubectl: jest.fn(),
  ErrorClassifier: {
    classifyError: jest.fn().mockReturnValue({
      type: 'network',
      enhancedMessage: 'Network connectivity issue detected.'
    })
  }
}));

// Default kubectl mock behavior
const defaultKubectlMock = (args: string[]) => {
  // Add debugging
  const argsStr = JSON.stringify(args);
  
  if (args.includes('cluster-info')) {
    return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942\nKubeDNS is running at https://127.0.0.1:64942/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy');
  }
  if (args.includes('current-context')) {
    return Promise.resolve('kind-dot');
  }
  if (args.includes('version')) {
    return Promise.resolve('Client Version: v1.28.2\nServer Version: v1.27.3+k3s1');
  }
  // Kyverno detection mocks
  if (args.includes('get') && args.includes('crd')) {
    return Promise.resolve('clusterpolicies.kyverno.io\npolicies.kyverno.io\npolicyreports.wgpolicyk8s.io');
  }
  if (args.includes('get') && args.includes('deployment') && args.includes('-n') && args.includes('kyverno') && !argsStr.includes('jsonpath')) {
    return Promise.resolve('kyverno                    1/1     1            1           7d');
  }
  if (args.includes('get') && args.includes('validatingwebhookconfigurations')) {
    return Promise.resolve('kyverno-policy-validating-webhook-cfg\nkyverno-resource-validating-webhook-cfg');
  }
  if (args.includes('jsonpath={.metadata.labels.version}')) {
    return Promise.resolve('1.10.0');
  }
  if (args.includes('jsonpath={.spec.template.spec.containers[0].image}')) {
    return Promise.resolve('ghcr.io/kyverno/kyverno:v1.10.0');
  }
  return Promise.resolve('');
};

describe('Version Tool', () => {
  let logger: Logger;
  let requestId: string;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn()
    };
    requestId = 'test-request-123';
    jest.clearAllMocks();
    
    // Set up default kubectl mock
    const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
    mockExecuteKubectl.mockImplementation(defaultKubectlMock);
    
    // Clear environment variables for clean test state
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  describe('Tool Metadata', () => {
    it('should have correct tool name', () => {
      expect(VERSION_TOOL_NAME).toBe('version');
    });

    it('should have proper description', () => {
      expect(VERSION_TOOL_DESCRIPTION).toBe('Get comprehensive system status including version information, Vector DB connection status, embedding service capabilities, Anthropic API connectivity, Kubernetes cluster connectivity, Kyverno policy engine status, and pattern management health check');
    });

    it('should have valid input schema', () => {
      expect(typeof VERSION_TOOL_INPUT_SCHEMA).toBe('object');
      expect(VERSION_TOOL_INPUT_SCHEMA).toBeDefined();
      expect(Object.keys(VERSION_TOOL_INPUT_SCHEMA).length).toBe(0);
    });
  });

  describe('getVersionInfo', () => {
    it('should return version information', () => {
      const versionInfo = getVersionInfo();

      expect(versionInfo).toHaveProperty('version');
      expect(versionInfo).toHaveProperty('nodeVersion');
      expect(versionInfo).toHaveProperty('platform');
      expect(versionInfo).toHaveProperty('arch');

      expect(typeof versionInfo.version).toBe('string');
      expect(typeof versionInfo.nodeVersion).toBe('string');
      expect(typeof versionInfo.platform).toBe('string');
      expect(typeof versionInfo.arch).toBe('string');
    });

    it('should return valid version string', () => {
      const versionInfo = getVersionInfo();

      expect(versionInfo.version).toBeDefined();
      expect(versionInfo.version.length).toBeGreaterThan(0);
      expect(typeof versionInfo.version).toBe('string');
    });

    it('should return valid runtime information', () => {
      const versionInfo = getVersionInfo();
      
      expect(versionInfo.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
      expect(['darwin', 'linux', 'win32']).toContain(versionInfo.platform);
      expect(['arm64', 'x64', 'x86']).toContain(versionInfo.arch);
    });
  });

  describe('handleVersionTool', () => {
    it('should handle version tool request successfully', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toHaveProperty('status', 'success');
      expect(responseData).toHaveProperty('system');
      expect(responseData).toHaveProperty('summary');
      expect(responseData).toHaveProperty('timestamp');

      // Check system structure
      expect(responseData.system).toHaveProperty('version');
      expect(responseData.system).toHaveProperty('vectorDB');
      expect(responseData.system).toHaveProperty('embedding');
      expect(responseData.system).toHaveProperty('anthropic');
      expect(responseData.system).toHaveProperty('kubernetes');
      expect(responseData.system).toHaveProperty('kyverno');

      // Check version info
      expect(responseData.system.version).toHaveProperty('version');
      expect(responseData.system.version).toHaveProperty('nodeVersion');
      expect(responseData.system.version).toHaveProperty('platform');
      expect(responseData.system.version).toHaveProperty('arch');
    });

    it('should return valid timestamp in response', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      const responseData = JSON.parse(result.content[0].text);
      expect(() => new Date(responseData.timestamp)).not.toThrow();
      expect(new Date(responseData.timestamp).toISOString()).toBe(responseData.timestamp);
    });

    it('should handle empty arguments', async () => {
      const args = {};
      const result = await handleVersionTool(args, logger, requestId);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.status).toBe('success');
      expect(responseData.system).toBeDefined();
      expect(responseData.system.version).toBeDefined();
    });

    it('should handle null arguments', async () => {
      const args = null;
      const result = await handleVersionTool(args, logger, requestId);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.status).toBe('success');
      expect(responseData.system).toBeDefined();
      expect(responseData.system.version).toBeDefined();
    });
  });

  describe('System Diagnostics', () => {
    it('should return comprehensive system status with healthy services', async () => {
      // Set up healthy environment
      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('success');
      
      // Check Vector DB status
      expect(response.system.vectorDB).toMatchObject({
        connected: true,
        url: 'http://localhost:6333',
        collections: {
          patterns: {
            exists: true,
            documentsCount: 5
          },
          policies: {
            exists: expect.any(Boolean)
          },
          capabilities: {
            exists: expect.any(Boolean)
          }
        }
      });
      
      // Check embedding status
      expect(response.system.embedding).toMatchObject({
        available: false,
        provider: null,
        reason: 'OPENAI_API_KEY not set - vector operations will fail'
      });
      
      // Check Anthropic status
      expect(response.system.anthropic).toMatchObject({
        connected: true,
        keyConfigured: true
      });
      
      // Check Kubernetes status
      expect(response.system.kubernetes).toMatchObject({
        connected: true,
        clusterInfo: {
          endpoint: 'https://127.0.0.1:64942',
          version: 'v1.27.3+k3s1',
          context: 'kind-dot'
        },
        kubeconfig: expect.any(String)
      });
      
      // Check capability system status
      expect(response.system.capabilities).toMatchObject({
        systemReady: true, // Ready because core MCP operations (list, search, ID-based get) work
        vectorDBHealthy: true,
        collectionAccessible: true,
        storedCount: 3
      });
      
      // Check Kyverno status
      expect(response.system.kyverno).toMatchObject({
        installed: true,
        version: '1.10.0',
        webhookReady: true,
        policyGenerationReady: true
      });
      
      // Check summary - overall should be healthy because core systems work
      expect(response.summary.overall).toBe('healthy');
      expect(response.summary.patternSearch).toBe('keyword-only');
      expect(response.summary.capabilityScanning).toBe('ready');
      expect(response.summary.kubernetesAccess).toBe('connected');
      expect(response.summary.policyGeneration).toBe('ready');
      expect(response.summary.capabilities).toContain('pattern-management');
      expect(response.summary.capabilities).toContain('ai-recommendations');
      expect(response.summary.capabilities).toContain('kubernetes-integration');
      expect(response.summary.capabilities).toContain('policy-generation');
      expect(response.summary.capabilities).not.toContain('semantic-search'); // No embeddings available
    });

    it('should show capability system diagnostics when embeddings unavailable', async () => {
      // Test that capability system shows as not ready when embeddings unavailable
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);

      expect(response.status).toBe('success');
      expect(response.system.capabilities).toMatchObject({
        systemReady: true, // Ready because core MCP operations work even without embeddings
        vectorDBHealthy: true,
        collectionAccessible: true,
        storedCount: 3
      });
      expect(response.summary.capabilityScanning).toBe('ready');
      expect(response.summary.capabilities).toContain('pattern-management');
    });

    it('should show degraded status when Anthropic API key is missing', async () => {
      // No ANTHROPIC_API_KEY set
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.anthropic.connected).toBe(false);
      expect(response.system.anthropic.keyConfigured).toBe(false);
      expect(response.system.anthropic.error).toContain('ANTHROPIC_API_KEY');
      expect(response.summary.overall).toBe('degraded');
      expect(response.summary.capabilities).not.toContain('ai-recommendations');
    });

    it('should show semantic search when embedding service is available', async () => {
      // Mock embedding service as available
      const mockEmbeddingService = require('../../src/core/embedding-service').EmbeddingService;
      mockEmbeddingService.mockImplementation(() => ({
        getStatus: jest.fn().mockReturnValue({
          available: true,
          provider: 'openai',
          model: 'text-embedding-3-small',
          dimensions: 1536
        })
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-openai-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.embedding.available).toBe(true);
      expect(response.system.embedding.provider).toBe('openai');
      expect(response.summary.patternSearch).toBe('semantic+keyword');
      expect(response.summary.capabilities).toContain('semantic-search');
    });

    it('should handle Vector DB connection failures', async () => {
      // Mock Vector DB as unhealthy
      const mockVectorDB = require('../../src/core/vector-db-service').VectorDBService;
      mockVectorDB.mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(false),
        getConfig: jest.fn().mockReturnValue({
          url: 'http://localhost:6333',
          collectionName: 'patterns'
        })
      }));

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.vectorDB.connected).toBe(false);
      expect(response.system.vectorDB.error).toContain('Health check failed');
      expect(response.summary.overall).toBe('degraded');
      expect(response.summary.capabilities).not.toContain('pattern-management');
    });

    it('should handle Anthropic API connection errors', async () => {
      // Mock Claude integration to throw error
      const mockClaude = require('../../src/core/claude').ClaudeIntegration;
      mockClaude.mockImplementation(() => ({
        sendMessage: jest.fn().mockRejectedValue(new Error('API rate limit exceeded'))
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.anthropic.connected).toBe(false);
      expect(response.system.anthropic.keyConfigured).toBe(true);
      expect(response.system.anthropic.error).toContain('API rate limit exceeded');
    });

    it('should detect capability storage failures', async () => {
      // Mock embedding service to return valid embeddings
      const mockEmbeddingService = require('../../src/core/embedding-service').EmbeddingService;
      mockEmbeddingService.mockImplementation(() => ({
        isAvailable: jest.fn().mockReturnValue(true),
        generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
        getStatus: jest.fn().mockReturnValue({
          available: true,
          provider: 'openai',
          reason: 'API key available'
        })
      }));

      // Mock a storage failure scenario
      const mockCapabilityService = require('../../src/core/capability-vector-service').CapabilityVectorService;
      mockCapabilityService.mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(true),
        initialize: jest.fn().mockResolvedValue(undefined),
        getCapabilitiesCount: jest.fn().mockResolvedValue(0),
        storeCapability: jest.fn().mockRejectedValue(new Error('Bad Request')),
        getCapability: jest.fn().mockResolvedValue(null),
        deleteCapability: jest.fn().mockResolvedValue(undefined)
      }));

      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.status).toBe('success');
      expect(response.system.capabilities).toMatchObject({
        systemReady: false, // False because storedCount is 0, not because of the test failure
        vectorDBHealthy: true,
        collectionAccessible: true,
        storedCount: 0,
        error: expect.stringContaining('Capability system test failed')
      });
      expect(response.summary.capabilityScanning).toBe('not-ready');
      expect(response.summary.capabilities).not.toContain('capability-scanning');
      
      // Reset mocks for other tests
      mockCapabilityService.mockImplementation(() => ({
        healthCheck: jest.fn().mockResolvedValue(true),
        initialize: jest.fn().mockResolvedValue(undefined),
        getCapabilitiesCount: jest.fn().mockResolvedValue(3),
        storeCapability: jest.fn().mockResolvedValue(undefined),
        getCapability: jest.fn().mockResolvedValue({
          resourceName: 'test.version.diagnostic',
          capabilities: ['version-test'],
          providers: ['test'],
          abstractions: ['diagnostic'],
          complexity: 'low',
          description: 'Version tool diagnostic test capability',
          useCase: 'Testing capability storage pipeline',
          confidence: 100
        }),
        deleteCapability: jest.fn().mockResolvedValue(undefined)
      }));

      // Reset embedding service mock
      mockEmbeddingService.mockImplementation(() => ({
        isAvailable: jest.fn().mockReturnValue(false),
        getStatus: jest.fn().mockReturnValue({
          available: false,
          provider: null,
          reason: 'OPENAI_API_KEY not set - vector operations will fail'
        })
      }));
    });

    it('should handle Kubernetes connection failures', async () => {
      // Mock kubectl to throw connection error
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockRejectedValueOnce(new Error('ECONNREFUSED: Connection refused'));

      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kubernetes.connected).toBe(false);
      expect(response.system.kubernetes.error).toContain('ECONNREFUSED');
      expect(response.system.kubernetes.errorType).toBe('network');
      expect(response.summary.kubernetesAccess).toBe('disconnected');
      expect(response.summary.capabilityScanning).toBe('not-ready'); // Not ready when K8s disconnected
      expect(response.summary.capabilities).not.toContain('kubernetes-integration');
      expect(response.summary.capabilities).not.toContain('capability-scanning');
      
      // Reset mock for other tests
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942\nKubeDNS is running at https://127.0.0.1:64942/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy');
        }
        if (args.includes('current-context')) {
          return Promise.resolve('kind-dot');
        }
        if (args.includes('version')) {
          return Promise.resolve('Client Version: v1.28.2\nServer Version: v1.27.3+k3s1');
        }
        return Promise.resolve('');
      });
    });

    it('should show correct kubeconfig path from environment', async () => {
      process.env.KUBECONFIG = '/custom/path/kubeconfig.yaml';
      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kubernetes.kubeconfig).toBe('/custom/path/kubeconfig.yaml');
      
      // Clean up
      delete process.env.KUBECONFIG;
    });

    it('should handle partial Kubernetes info retrieval', async () => {
      // Mock kubectl to succeed for cluster-info but fail for context/version
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        if (args.includes('current-context') || args.includes('version')) {
          return Promise.reject(new Error('Command failed'));
        }
        return Promise.resolve('');
      });

      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kubernetes.connected).toBe(true);
      expect(response.system.kubernetes.clusterInfo.endpoint).toBe('https://127.0.0.1:64942');
      expect(response.system.kubernetes.clusterInfo.context).toBeUndefined();
      expect(response.system.kubernetes.clusterInfo.version).toBeUndefined();
      
      // Reset mock
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942\nKubeDNS is running at https://127.0.0.1:64942/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy');
        }
        if (args.includes('current-context')) {
          return Promise.resolve('kind-dot');
        }
        if (args.includes('version')) {
          return Promise.resolve('Client Version: v1.28.2\nServer Version: v1.27.3+k3s1');
        }
        return Promise.resolve('');
      });
    });

    it('should log diagnostic progress', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      
      await handleVersionTool({}, logger, requestId);
      
      expect(logger.info).toHaveBeenCalledWith(
        'Processing version tool request with system diagnostics',
        { requestId }
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        'Running system diagnostics...',
        { requestId }
      );
      
      expect(logger.info).toHaveBeenCalledWith(
        'System diagnostics completed',
        expect.objectContaining({
          requestId,
          vectorDBConnected: expect.any(Boolean),
          embeddingAvailable: expect.any(Boolean),
          anthropicConnected: expect.any(Boolean),
          kubernetesConnected: expect.any(Boolean),
          kyvernoReady: expect.any(Boolean)
        })
      );
    });
  });

  describe('Kyverno Detection', () => {
    beforeEach(() => {
      // Set up default healthy environment for each test
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation(defaultKubectlMock);
    });

    afterEach(() => {
      // Reset kubectl mock to default behavior
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation(defaultKubectlMock);
    });

    it('should detect fully operational Kyverno installation', async () => {
      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: true,
        version: '1.10.0',
        webhookReady: true,
        policyGenerationReady: true
      });
      
      expect(response.summary.policyGeneration).toBe('ready');
      expect(response.summary.capabilities).toContain('policy-generation');
    });

    it('should detect when Kyverno CRDs are missing', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          return Promise.resolve('coredns.k8s.io\ningresses.networking.k8s.io'); // No Kyverno CRDs
        }
        // Return defaults for other calls
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        if (args.includes('current-context')) {
          return Promise.resolve('kind-dot');
        }
        if (args.includes('version')) {
          return Promise.resolve('Client Version: v1.28.2\nServer Version: v1.27.3+k3s1');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: false,
        policyGenerationReady: false,
        reason: 'Kyverno CRDs not found in cluster - Kyverno is not installed'
      });
      
      expect(response.summary.policyGeneration).toBe('not-ready');
      expect(response.summary.capabilities).not.toContain('policy-generation');
    });

    it('should detect when Kyverno deployment is not ready', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          return Promise.resolve('clusterpolicies.kyverno.io\npolicies.kyverno.io');
        }
        if (args.includes('get') && args.includes('deployment') && args.includes('-n') && args.includes('kyverno')) {
          return Promise.resolve('kyverno                    0/1     0            0           7d'); // Not ready
        }
        if (args.includes('get') && args.includes('validatingwebhookconfigurations')) {
          return Promise.resolve('kyverno-policy-validating-webhook-cfg\nkyverno-resource-validating-webhook-cfg');
        }
        // Return defaults for other calls
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: true,
        webhookReady: true,
        policyGenerationReady: false,
        reason: 'Kyverno deployment is not ready'
      });
      
      expect(response.summary.policyGeneration).toBe('not-ready');
    });

    it('should detect when Kyverno webhook is missing', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          return Promise.resolve('clusterpolicies.kyverno.io\npolicies.kyverno.io');
        }
        if (args.includes('get') && args.includes('deployment') && args.includes('-n') && args.includes('kyverno')) {
          return Promise.resolve('kyverno                    1/1     1            1           7d');
        }
        if (args.includes('get') && args.includes('validatingwebhookconfigurations')) {
          return Promise.resolve('cert-manager-webhook\nother-webhook'); // No Kyverno webhooks
        }
        // Return defaults for other calls
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: true,
        webhookReady: false,
        policyGenerationReady: false,
        reason: 'Kyverno admission webhook is not ready'
      });
    });

    it('should handle version detection from image tag', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          return Promise.resolve('clusterpolicies.kyverno.io\npolicies.kyverno.io');
        }
        if (args.includes('get') && args.includes('deployment') && args.includes('-n') && args.includes('kyverno') && !JSON.stringify(args).includes('jsonpath')) {
          return Promise.resolve('kyverno                    1/1     1            1           7d');
        }
        if (args.includes('get') && args.includes('validatingwebhookconfigurations')) {
          return Promise.resolve('kyverno-policy-validating-webhook-cfg');
        }
        if (args.includes('jsonpath={.metadata.labels.version}')) {
          return Promise.resolve(''); // No version label
        }
        if (args.includes('jsonpath={.spec.template.spec.containers[0].image}')) {
          return Promise.resolve('ghcr.io/kyverno/kyverno:v1.9.2'); // Version from image tag
        }
        // Return defaults for other calls
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: true,
        version: '1.9.2',
        webhookReady: true,
        policyGenerationReady: true
      });
    });

    it('should handle Kubernetes connectivity issues', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          throw new Error('ECONNREFUSED: Connection refused');
        }
        // Return defaults for other calls that still work
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: false,
        policyGenerationReady: false,
        error: 'Cannot detect Kyverno - Kubernetes cluster is not accessible'
      });
      
      expect(response.summary.policyGeneration).toBe('not-ready');
    });

    it('should detect partial Kyverno installation', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          return Promise.resolve('clusterpolicies.kyverno.io'); // Only some CRDs
        }
        if (args.includes('get') && args.includes('deployment') && args.includes('-n') && args.includes('kyverno')) {
          throw new Error('No resources found in kyverno namespace'); // No deployment
        }
        if (args.includes('get') && args.includes('validatingwebhookconfigurations')) {
          return Promise.resolve('other-webhook'); // No Kyverno webhooks
        }
        // Return defaults for other calls
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: true,
        webhookReady: false,
        policyGenerationReady: false,
        reason: 'Kyverno deployment and admission webhook are not ready'
      });
    });

    it('should handle kubectl command failures gracefully', async () => {
      const mockExecuteKubectl = require('../../src/core/kubernetes-utils').executeKubectl;
      mockExecuteKubectl.mockImplementation((args: string[]) => {
        if (args.includes('get') && args.includes('crd')) {
          throw new Error('kubectl: command not found');
        }
        // Return defaults for other calls
        if (args.includes('cluster-info')) {
          return Promise.resolve('Kubernetes control plane is running at https://127.0.0.1:64942');
        }
        return Promise.resolve('');
      });

      const result = await handleVersionTool({}, logger, requestId);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.system.kyverno).toMatchObject({
        installed: false,
        policyGenerationReady: false,
        error: 'Kyverno detection failed: kubectl: command not found'
      });
    });
  });
});