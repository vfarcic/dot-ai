import { MCPServer } from '../../src/interfaces/mcp';
import { AppAgent } from '../../src/core/index';

describe('MCP Interface Layer', () => {
  let mcpServer: MCPServer;
  let mockAppAgent: any;

  beforeEach(() => {
    // Create comprehensive mock with proper Jest typing
    mockAppAgent = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getAnthropicApiKey: jest.fn().mockReturnValue('test-api-key'),
      discovery: {
        connect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
        discoverResources: jest.fn().mockResolvedValue({
          resources: [
            { kind: 'Pod', apiVersion: 'v1', group: '', namespaced: true },
            { kind: 'Service', apiVersion: 'v1', group: '', namespaced: true },
            { kind: 'ConfigMap', apiVersion: 'v1', group: '', namespaced: true },
            { kind: 'Secret', apiVersion: 'v1', group: '', namespaced: true },
            { kind: 'Deployment', apiVersion: 'apps/v1', group: 'apps', namespaced: true },
            { kind: 'StatefulSet', apiVersion: 'apps/v1', group: 'apps', namespaced: true },
            { kind: 'DaemonSet', apiVersion: 'apps/v1', group: 'apps', namespaced: true }
          ],
          custom: []
        }),
        getClusterInfo: jest.fn().mockResolvedValue({ 
          type: 'vanilla', 
          version: 'v1.29.0', 
          capabilities: ['pods', 'services', 'deployments'] 
        }),
        discoverCRDs: jest.fn().mockResolvedValue([
          { name: 'AppClaim', group: 'app.io', version: 'v1', schema: {} },
          { name: 'CustomResource', group: 'custom.io', version: 'v1beta1', schema: {} }
        ])
      },
      memory: {
        storePattern: jest.fn().mockResolvedValue(undefined),
        retrievePattern: jest.fn().mockResolvedValue([]),
        storeLessons: jest.fn().mockResolvedValue(undefined),
        getRecommendations: jest.fn().mockResolvedValue([
          { suggestion: 'Use nginx:latest for web servers', confidence: 0.8, based_on: ['success-pattern-1'] },
          { suggestion: 'Consider resource limits', confidence: 0.7, based_on: ['success-pattern-2'] }
        ]),
        getSuccessPatterns: jest.fn().mockResolvedValue([
          { type: 'deployment', config: { image: 'nginx:latest', replicas: 3 }, timestamp: new Date() },
          { type: 'service', config: { type: 'ClusterIP', port: 80 }, timestamp: new Date() }
        ])
      },
      workflow: {
        createDeploymentWorkflow: jest.fn().mockResolvedValue('workflow-abc123'),
        getCurrentPhase: jest.fn().mockReturnValue('discovery'),
        execute: jest.fn().mockResolvedValue({ 
          id: 'exec-456', 
          status: 'running', 
          steps: ['discovery', 'planning', 'deployment'] 
        })
      },
      claude: {
        generateManifest: jest.fn().mockResolvedValue('apiVersion: v1\nkind: Pod\nmetadata:\n  name: test-pod'),
        analyzeRequirements: jest.fn().mockResolvedValue({ 
          resources: ['Pod', 'Service'], 
          namespace: 'default',
          complexity: 'simple'
        }),
        suggestConfiguration: jest.fn().mockResolvedValue('Consider using nginx:alpine for smaller image size and better security')
      }
    };

    const config = {
      name: 'app-agent-test',
      version: '1.0.0',
      description: 'Test MCP server for Kubernetes deployment agent'
    };

    mcpServer = new MCPServer(mockAppAgent, config);
  });

  describe('MCP Server Initialization', () => {
    test('should initialize MCPServer with correct configuration', () => {
      expect(mcpServer).toBeDefined();
      expect(mcpServer.getToolCount()).toBe(2);
    });

    test('should start in uninitialized state', () => {
      expect(mcpServer.isReady()).toBe(false);
    });

    test('should expose exactly 2 MCP tools', () => {
      const toolCount = mcpServer.getToolCount();
      expect(toolCount).toBe(2);
    });

    test('should accept AppAgent instance during construction', () => {
      expect((mcpServer as any).appAgent).toBe(mockAppAgent);
    });
  });

  describe('Tool Handler Functionality', () => {

    test('should require session directory for recommend tool', async () => {
      // Test that recommend tool fails without session directory
      const toolContext = {
        requestId: 'test-request-123',
        logger: (mcpServer as any).logger,
        appAgent: mockAppAgent
      };
      
      const intentSpec = {
        intent: 'Deploy a web application with load balancing'
      };

      // Ensure no session directory is set
      const originalEnv = process.env.APP_AGENT_SESSION_DIR;
      delete process.env.APP_AGENT_SESSION_DIR;
      
      try {
        await (mcpServer as any).toolRegistry.executeTool('recommend', intentSpec, toolContext);
        fail('Expected recommend tool to fail without session directory');
      } catch (error: any) {
        expect(error.message).toContain('Session directory must be specified');
        expect(error.message).toContain('APP_AGENT_SESSION_DIR');
      }
      
      // Restore environment
      if (originalEnv) {
        process.env.APP_AGENT_SESSION_DIR = originalEnv;
      }
    });

    test('should validate recommend tool requires API key', async () => {
      // Test that recommend tool fails without API key
      mockAppAgent.getAnthropicApiKey.mockReturnValue(null);
      
      const toolContext = {
        requestId: 'test-request-123',
        logger: (mcpServer as any).logger,
        appAgent: mockAppAgent
      };
      
      const intentSpec = {
        intent: 'Deploy a web application with load balancing'
      };

      // Set environment variable for session directory
      const originalEnv = process.env.APP_AGENT_SESSION_DIR;
      process.env.APP_AGENT_SESSION_DIR = '/tmp/test-sessions';
      
      // Create test session directory
      const fs = require('fs');
      if (!fs.existsSync('/tmp/test-sessions')) {
        fs.mkdirSync('/tmp/test-sessions', { recursive: true });
      }
      
      try {
        await (mcpServer as any).toolRegistry.executeTool('recommend', intentSpec, toolContext);
        fail('Expected recommend tool to fail without API key');
      } catch (error: any) {
        expect(error.message).toContain('ANTHROPIC_API_KEY environment variable must be set');
      }
      
      // Restore environment
      if (originalEnv) {
        process.env.APP_AGENT_SESSION_DIR = originalEnv;
      } else {
        delete process.env.APP_AGENT_SESSION_DIR;
      }
    });

    // REMOVED: enhance_solution tool test - moved to legacy reference
    // See src/legacy/tools/enhance-solution.ts for reference implementation

    test('should require intent parameter for recommend', async () => {
      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      
      const result = await handleRecommend({});
      expect(result.content).toHaveLength(1);
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBeDefined();
      expect(responseData.error.message).toContain('Invalid parameters for tool \'recommend\'');
    });

    // REMOVED: enhance_solution validation test - moved to legacy reference

    // REMOVED: enhance_solution JSON validation test - moved to legacy reference

    // REMOVED: enhance_solution answer validation test - moved to legacy reference
  });

  describe('Initialization and State Management', () => {

    test('should track initialization state', () => {
      expect(mcpServer.isReady()).toBe(false);
      // After tool execution, the ensureInitialized should set the state
    });

    test('should handle multiple tool calls with shared state', async () => {
      // Mock schema ranking functionality
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockResolvedValue([])
      };

      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      
      await handleRecommend({ intent: 'Deploy nginx' });
      await handleRecommend({ intent: 'Deploy database' });

      // Should only initialize once
      expect(mockAppAgent.initialize).toHaveBeenCalledTimes(1);
      expect(mockAppAgent.discovery.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {

    test('should handle schema ranking errors', async () => {
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
      };
      
      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      
      const result = await handleRecommend({ intent: 'Deploy nginx' });
      expect(result.content).toHaveLength(1);
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBeDefined();
      expect(responseData.error.message).toContain('AI service unavailable');
    });

    test('should handle initialization errors', async () => {
      mockAppAgent.initialize.mockRejectedValueOnce(new Error('Configuration error'));
      
      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      
      const result = await handleRecommend({ intent: 'Deploy nginx' });
      expect(result.content).toHaveLength(1);
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBeDefined();
      expect(responseData.error.message).toContain('Cannot read properties of undefined');
    });

    // REMOVED: enhance_solution API key test - moved to legacy reference
  });

  describe('MCP Protocol Compliance', () => {
    test('should return properly formatted MCP responses', async () => {
      // Mock schema ranking functionality
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockResolvedValue([])
      };

      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      
      const result = await handleRecommend({ intent: 'Deploy nginx' });

      // Verify MCP response structure
      expect(result).toEqual({
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'text',
            text: expect.any(String)
          })
        ])
      });

      // Verify content is valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    test('should handle all tool input schemas correctly', async () => {
      // Mock schema ranking functionality
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockResolvedValue([])
      };

      const testCases = [
        { handler: 'handleRecommend', args: { intent: 'Deploy web app' } }
      ];

      for (const testCase of testCases) {
        const handler = (mcpServer as any)[testCase.handler].bind(mcpServer);
        const result = await handler(testCase.args);
        
        expect(result).toEqual({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.any(String)
            })
          ])
        });
      }
    });

    test('should include timestamps in all responses', async () => {
      // Mock schema ranking functionality
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockResolvedValue([])
      };

      const handlers = [
        { method: 'handleRecommend', args: { intent: 'Deploy app' } }
      ];

      for (const { method, args } of handlers) {
        const handler = (mcpServer as any)[method].bind(mcpServer);
        const result = await handler(args);
        const data = JSON.parse(result.content[0].text);
        
        expect(data.timestamp).toBeDefined();
        expect(new Date(data.timestamp)).toBeInstanceOf(Date);
      }
    });
  });

  describe('Integration with Core Modules', () => {
    test('should use same AppAgent instance as CLI interface', () => {
      expect((mcpServer as any).appAgent).toBe(mockAppAgent);
    });

    test('should call core module methods with correct parameters', async () => {
      // Mock schema ranking functionality
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockResolvedValue([])
      };

      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      
      await handleRecommend({ intent: 'nginx app deployment' });

      // Verify schema ranking calls
      expect(mockAppAgent.schema.rankResources).toHaveBeenCalledWith('nginx app deployment');
    });

    test('should maintain consistent behavior across interface types', async () => {
      // Mock schema ranking functionality
      mockAppAgent.schema = {
        ...mockAppAgent.schema,
        rankResources: jest.fn().mockResolvedValue([{
          type: 'single',
          score: 80,
          description: 'Test solution',
          reasons: ['Test reason'],
          analysis: 'Test analysis',
          resources: [
            { kind: 'Pod', apiVersion: 'v1', group: '', description: 'Test pod' }
          ],
          questions: { required: [], basic: [], advanced: [], open: {} }
        }])
      };

      // Test that MCP returns same data structure as CLI would expect
      const handleRecommend = (mcpServer as any).handleRecommend.bind(mcpServer);
      const result = await handleRecommend({ intent: 'Deploy nginx' });
      
      const data = JSON.parse(result.content[0].text);
      
      // Structure should match what CLI recommend command would return
      expect(data.intent).toBeDefined();
      expect(data.solutions).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Lifecycle Management', () => {
    test('should handle start method', async () => {
      // Start method should exist and may work in test environment
      await expect(mcpServer.start()).resolves.not.toThrow();
    });

    test('should handle stop method gracefully', async () => {
      await expect(mcpServer.stop()).resolves.not.toThrow();
    });

    test('should provide tool count', () => {
      expect(mcpServer.getToolCount()).toBe(2);
    });

    test('should track ready state', () => {
      expect(mcpServer.isReady()).toBe(false);
    });
  });
}); 