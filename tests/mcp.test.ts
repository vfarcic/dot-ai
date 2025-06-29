import { MCPServer } from '../src/interfaces/mcp';
import { AppAgent } from '../src/core/index';

describe('MCP Interface Layer', () => {
  let mcpServer: MCPServer;
  let mockAppAgent: any;

  beforeEach(() => {
    // Create comprehensive mock with proper Jest typing
    mockAppAgent = {
      initialize: jest.fn().mockResolvedValue(undefined),
      discovery: {
        connect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
        discoverResources: jest.fn().mockResolvedValue({
          core: ['Pod', 'Service', 'ConfigMap', 'Secret'],
          apps: ['Deployment', 'StatefulSet', 'DaemonSet'],
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
      expect(mcpServer.getToolCount()).toBe(3);
    });

    test('should start in uninitialized state', () => {
      expect(mcpServer.isReady()).toBe(false);
    });

    test('should expose exactly 3 MCP tools', () => {
      const toolCount = mcpServer.getToolCount();
      expect(toolCount).toBe(3);
    });

    test('should accept AppAgent instance during construction', () => {
      expect((mcpServer as any).appAgent).toBe(mockAppAgent);
    });
  });

  describe('Tool Handler Functionality', () => {

    test('should handle deploy_application tool execution', async () => {
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      
      const deploySpec = {
        spec: 'Deploy nginx web server with 3 replicas',
        namespace: 'production',
        interactive: true
      };

      const result = await handleDeployApplication(deploySpec);
      
      expect(result.content).toHaveLength(1);
      const responseData = JSON.parse(result.content[0].text);
      
      expect(responseData).toEqual(expect.objectContaining({
        workflow_id: 'workflow-abc123',
        status: 'created',
        message: expect.stringContaining('successfully')
      }));

      expect(mockAppAgent.workflow.createDeploymentWorkflow).toHaveBeenCalledWith(deploySpec);
    });

    test('should use default values for deploy_application', async () => {
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      
      const minimalSpec = { spec: 'Deploy simple nginx' };
      await handleDeployApplication(minimalSpec);

      expect(mockAppAgent.workflow.createDeploymentWorkflow).toHaveBeenCalledWith({
        spec: 'Deploy simple nginx',
        namespace: 'default',
        interactive: true
      });
    });

    test('should handle check_status tool execution', async () => {
      const handleCheckStatus = (mcpServer as any).handleCheckStatus.bind(mcpServer);
      
      const result = await handleCheckStatus({ workflow_id: 'test-workflow-123' });
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toEqual(expect.objectContaining({
        cluster_connected: true,
        current_phase: 'discovery',
        workflow_id: 'test-workflow-123',
        timestamp: expect.any(String)
      }));

      expect(mockAppAgent.discovery.isConnected).toHaveBeenCalled();
      expect(mockAppAgent.workflow.getCurrentPhase).toHaveBeenCalled();
    });

    test('should handle check_status without workflow_id', async () => {
      const handleCheckStatus = (mcpServer as any).handleCheckStatus.bind(mcpServer);
      
      const result = await handleCheckStatus({});
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.workflow_id).toBeNull();
    });

    test('should handle learn_patterns tool execution', async () => {
      const handleLearnPatterns = (mcpServer as any).handleLearnPatterns.bind(mcpServer);
      
      const result = await handleLearnPatterns({ pattern_type: 'deployment' });
      
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toEqual(expect.objectContaining({
        pattern_type: 'deployment',
        recommendations: expect.arrayContaining([
          expect.objectContaining({
            suggestion: expect.any(String),
            confidence: expect.any(Number),
            based_on: expect.any(Array)
          })
        ]),
        success_patterns: expect.arrayContaining([
          expect.objectContaining({
            type: expect.any(String),
            config: expect.any(Object),
            timestamp: expect.any(String)
          })
        ]),
        timestamp: expect.any(String)
      }));

      expect(mockAppAgent.memory.getRecommendations).toHaveBeenCalledWith('deployment', {});
      expect(mockAppAgent.memory.getSuccessPatterns).toHaveBeenCalledWith('deployment');
    });

    test('should use default pattern_type for learn_patterns', async () => {
      const handleLearnPatterns = (mcpServer as any).handleLearnPatterns.bind(mcpServer);
      
      await handleLearnPatterns({});

      expect(mockAppAgent.memory.getRecommendations).toHaveBeenCalledWith('deployment', {});
    });
  });

  describe('Initialization and State Management', () => {

    test('should track initialization state', () => {
      expect(mcpServer.isReady()).toBe(false);
      // After tool execution, the ensureInitialized should set the state
    });

    test('should handle multiple tool calls with shared state', async () => {
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      const handleCheckStatus = (mcpServer as any).handleCheckStatus.bind(mcpServer);
      
      await handleDeployApplication({ spec: 'Deploy nginx' });
      await handleCheckStatus({});

      // Should only initialize once
      expect(mockAppAgent.initialize).toHaveBeenCalledTimes(1);
      expect(mockAppAgent.discovery.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {

    test('should handle workflow creation errors', async () => {
      mockAppAgent.workflow.createDeploymentWorkflow.mockRejectedValueOnce(new Error('Invalid specification'));
      
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      
      await expect(handleDeployApplication({ spec: 'invalid' })).rejects.toThrow('Invalid specification');
    });

    test('should handle initialization errors', async () => {
      mockAppAgent.initialize.mockRejectedValueOnce(new Error('Configuration error'));
      
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      
      await expect(handleDeployApplication({ spec: 'Deploy nginx' })).rejects.toThrow('Configuration error');
    });
  });

  describe('MCP Protocol Compliance', () => {
    test('should return properly formatted MCP responses', async () => {
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      
      const result = await handleDeployApplication({ spec: 'Deploy nginx' });

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
      const testCases = [
        { handler: 'handleDeployApplication', args: { spec: 'nginx', namespace: 'test', interactive: false } },
        { handler: 'handleCheckStatus', args: { workflow_id: 'test-123' } },
        { handler: 'handleLearnPatterns', args: { pattern_type: 'service' } }
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
      const handlers = [
        { method: 'handleCheckStatus', args: {} },
        { method: 'handleLearnPatterns', args: {} }
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
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      
      await handleDeployApplication({ spec: 'nginx app', namespace: 'prod' });

      // Verify workflow calls
      expect(mockAppAgent.workflow.createDeploymentWorkflow).toHaveBeenCalledWith({
        spec: 'nginx app',
        namespace: 'prod',
        interactive: true
      });
    });

    test('should maintain consistent behavior across interface types', async () => {
      // Test that MCP returns same data structure as CLI would expect
      const handleDeployApplication = (mcpServer as any).handleDeployApplication.bind(mcpServer);
      const result = await handleDeployApplication({ spec: 'Deploy nginx' });
      
      const data = JSON.parse(result.content[0].text);
      
      // Structure should match what CLI deployment command would return
      expect(data.workflow_id).toBeDefined();
      expect(data.status).toBeDefined();
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
      expect(mcpServer.getToolCount()).toBe(3);
    });

    test('should track ready state', () => {
      expect(mcpServer.isReady()).toBe(false);
    });
  });
}); 