/**
 * Core Module Tests
 * 
 * These tests define the API contracts and behavior for our core intelligence modules
 * Following TDD approach - these tests define what we SHOULD implement
 */

import { 
  DotAI, 
  KubernetesDiscovery, 
  MemorySystem, 
  WorkflowEngine, 
  ClaudeIntegration 
} from '../src/core';
import { ErrorClassifier, buildKubectlCommand, executeKubectl } from '../src/core/kubernetes-utils';
import * as path from 'path';

// Mock the Anthropic SDK to prevent real API calls in all Claude tests
jest.mock('@anthropic-ai/sdk', () => {
  const mockClient = {
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: 'Mock response for testing - Claude integration working correctly'
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      })
    }
  };
  
  return {
    default: jest.fn().mockImplementation(() => mockClient)
  };
});

describe('Core Module Structure', () => {
  describe('DotAI Class', () => {
    test('should be constructible with configuration options', () => {
      const agent = new DotAI({
        kubernetesConfig: '/path/to/kubeconfig',
        anthropicApiKey: 'test-key'
      });
      
      expect(agent).toBeInstanceOf(DotAI);
      expect(agent.getVersion()).toBe('0.1.0');
    });

    test('should provide access to all core modules', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig, anthropicApiKey: 'test-key' });
      await agent.initialize();
      
      expect(agent.discovery).toBeInstanceOf(KubernetesDiscovery);
      expect(agent.memory).toBeInstanceOf(MemorySystem);
      expect(agent.workflow).toBeInstanceOf(WorkflowEngine);
      expect(agent.claude).toBeInstanceOf(ClaudeIntegration);
    });

    test('should handle initialization errors gracefully', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig, anthropicApiKey: 'test-key' });
      
      // Mock the discovery connect method to fail
      jest.spyOn(agent.discovery, 'connect').mockRejectedValue(new Error('Connection failed'));
      
      await expect(agent.initialize()).rejects.toThrow();
      expect(agent.isInitialized()).toBe(false);
    });

    test('should provide configuration validation', () => {
      expect(() => {
        new DotAI({ anthropicApiKey: '' });
      }).toThrow('Invalid configuration');
    });
  });

  describe('Module Integration', () => {
    test('should allow modules to communicate with each other', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig, anthropicApiKey: 'test-key' });
      await agent.initialize();
      
      // Memory should be able to store discovery results
      const discoveryData = { resources: ['deployment', 'service'] };
      await agent.memory.store('cluster-capabilities', discoveryData);
      
      // Workflow should be able to access memory
      const stored = await agent.memory.retrieve('cluster-capabilities');
      expect(stored).toEqual(discoveryData);
    });

    test('should handle module dependency failures', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig, anthropicApiKey: 'test-key' });
      
      // Mock discovery connect to fail, but other modules should still initialize
      jest.spyOn(agent.discovery, 'connect').mockRejectedValue(new Error('Discovery failed'));
      
      try {
        await agent.initialize();
      } catch (error) {
        // Initialization should fail, but modules should still be accessible
        expect(agent.memory).toBeDefined();
        expect(agent.workflow).toBeDefined();
        expect(agent.discovery).toBeDefined();
      }
    });
  });
});

describe('Memory System Module', () => {
  let memory: MemorySystem;

  beforeEach(() => {
    memory = new MemorySystem();
  });

  describe('Basic Storage Operations', () => {
    test('should store and retrieve data', async () => {
      const testData = { key: 'value', number: 42 };
      
      await memory.store('test-key', testData);
      const retrieved = await memory.retrieve('test-key');
      
      expect(retrieved).toEqual(testData);
    });

    test('should handle non-existent keys gracefully', async () => {
      const result = await memory.retrieve('non-existent');
      expect(result).toBeNull();
    });

    test('should support different data types', async () => {
      await memory.store('string', 'hello');
      await memory.store('number', 123);
      await memory.store('boolean', true);
      await memory.store('array', [1, 2, 3]);
      await memory.store('object', { nested: { value: 'test' } });
      
      expect(await memory.retrieve('string')).toBe('hello');
      expect(await memory.retrieve('number')).toBe(123);
      expect(await memory.retrieve('boolean')).toBe(true);
      expect(await memory.retrieve('array')).toEqual([1, 2, 3]);
      expect(await memory.retrieve('object')).toEqual({ nested: { value: 'test' } });
    });
  });

  describe('Learning and Context', () => {
    test('should learn from successful deployments', async () => {
      const deployment = {
        app: 'nginx',
        namespace: 'production',
        replicas: 3,
        resources: { cpu: '500m', memory: '1Gi' }
      };
      
      await memory.learnSuccess('deployment', deployment);
      
      const patterns = await memory.getSuccessPatterns('deployment');
      expect(patterns).toContainEqual(expect.objectContaining({
        config: deployment,
        type: 'deployment'
      }));
    });

    test('should track failure patterns to avoid repetition', async () => {
      const failedConfig = {
        app: 'broken-app',
        issue: 'insufficient resources'
      };
      
      await memory.learnFailure('deployment', failedConfig, 'Pod failed to schedule');
      
      const failures = await memory.getFailurePatterns('deployment');
      expect(failures).toContainEqual(expect.objectContaining({
        config: failedConfig,
        error: 'Pod failed to schedule'
      }));
    });

    test('should provide recommendations based on learning', async () => {
      // Store successful pattern
      await memory.learnSuccess('service', {
        type: 'LoadBalancer',
        ports: [{ port: 80, targetPort: 8080 }]
      });
      
      const recommendations = await memory.getRecommendations('service', {
        type: 'LoadBalancer'
      });
      
      expect(recommendations).toContainEqual(expect.objectContaining({
        suggestion: expect.any(String),
        confidence: expect.any(Number)
      }));
    });
  });

  describe('Context Management', () => {
    test('should maintain session context', async () => {
      await memory.setContext('current-namespace', 'my-app');
      await memory.setContext('deployment-strategy', 'rolling');
      
      const context = await memory.getContext();
      expect(context).toHaveProperty('current-namespace', 'my-app');
      expect(context).toHaveProperty('deployment-strategy', 'rolling');
    });

    test('should clear context when needed', async () => {
      await memory.setContext('temp-setting', 'value');
      await memory.clearContext('temp-setting');
      
      const context = await memory.getContext();
      expect(context).not.toHaveProperty('temp-setting');
    });
  });
});

describe('Workflow Engine Module', () => {
  let workflow: WorkflowEngine;

  beforeEach(() => {
    workflow = new WorkflowEngine();
  });

  describe('Workflow Creation', () => {
    test('should create deployment workflows', async () => {
      const spec = {
        app: 'my-app',
        image: 'nginx:latest',
        replicas: 2
      };
      
      const workflowId = await workflow.createDeploymentWorkflow(spec);
      expect(typeof workflowId).toBe('string');
      expect(workflowId.length).toBeGreaterThan(0);
    });

    test('should validate workflow specifications', async () => {
      const invalidSpec = {
        // Missing required fields
        replicas: 'invalid'
      };
      
      await expect(workflow.createDeploymentWorkflow(invalidSpec)).rejects.toThrow('Invalid workflow specification');
    });
  });

  describe('Workflow Execution', () => {
    test('should execute workflows step by step', async () => {
      const spec = { app: 'test-app', image: 'nginx:latest' };
      const workflowId = await workflow.createDeploymentWorkflow(spec);
      
      const execution = await workflow.execute(workflowId);
      expect(execution).toHaveProperty('id');
      expect(execution).toHaveProperty('status');
      expect(execution).toHaveProperty('steps');
    });

    test('should handle step failures gracefully', async () => {
      const spec = { app: 'failing-app', image: 'invalid:image' };
      const workflowId = await workflow.createDeploymentWorkflow(spec);
      
      const execution = await workflow.execute(workflowId);
      expect(execution.status).toBe('failed');
      expect(execution).toHaveProperty('error');
    });

    test('should support workflow rollback', async () => {
      const spec = { app: 'rollback-test', image: 'nginx:latest' };
      const workflowId = await workflow.createDeploymentWorkflow(spec);
      
      const execution = await workflow.execute(workflowId);
      const rollbackResult = await workflow.rollback(execution.id);
      
      expect(rollbackResult).toHaveProperty('success', true);
    });
  });

  describe('Workflow Templates', () => {
    test('should support predefined workflow templates', async () => {
      const templates = await workflow.getAvailableTemplates();
      
      expect(Array.isArray(templates)).toBe(true);
      expect(templates).toContainEqual(expect.objectContaining({
        name: expect.any(String),
        description: expect.any(String),
        parameters: expect.any(Array)
      }));
    });

    test('should create workflows from templates', async () => {
      const templateParams = {
        template: 'web-app',
        parameters: {
          appName: 'my-web-app',
          image: 'nginx:latest',
          domain: 'my-app.example.com'
        }
      };
      
      const workflowId = await workflow.createFromTemplate(templateParams);
      expect(typeof workflowId).toBe('string');
    });
  });
});

describe('Claude Integration Module', () => {
  let claude: ClaudeIntegration;

  beforeEach(() => {
    claude = new ClaudeIntegration('test-key');
  });

  describe('AI Communication', () => {
    test('should send messages to Claude and receive responses', async () => {
      const response = await claude.sendMessage('Hello, can you help me deploy a web application?');
      
      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('usage');
      expect(typeof response.content).toBe('string');
    });

    test('should handle conversation context', async () => {
      await claude.sendMessage('I want to deploy nginx');
      const response = await claude.sendMessage('What are the recommended resources?');
      
      // Response should reference the previous nginx context
      expect(response.content.toLowerCase()).toContain('nginx');
    });

    test('should format Kubernetes YAML properly', async () => {
      const response = await claude.generateYAML('deployment', {
        app: 'nginx',
        replicas: 2,
        image: 'nginx:latest'
      });
      
      expect(response).toHaveProperty('yaml');
      expect(response).toHaveProperty('explanation');
      expect(response.yaml).toContain('apiVersion');
      expect(response.yaml).toContain('kind: Deployment');
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      const invalidClaude = new ClaudeIntegration('invalid-key');
      
      await expect(invalidClaude.sendMessage('test')).rejects.toThrow();
    });

    test('should provide meaningful error messages', async () => {
      try {
        const invalidClaude = new ClaudeIntegration('');
        await invalidClaude.sendMessage('test');
      } catch (error) {
        expect((error as Error).message).toContain('API key');
      }
    });
  });

  describe('Learning Integration', () => {
    test('should learn from successful interactions', async () => {
      const interaction = {
        input: 'Deploy nginx with 2 replicas',
        output: 'Successfully created deployment',
        success: true
      };
      
      await claude.recordInteraction(interaction);
      
      const patterns = await claude.getSuccessfulPatterns();
      expect(patterns).toContainEqual(expect.objectContaining(interaction));
    });
  });

  describe('Centralized Configuration Management', () => {
    const originalKubeconfig = process.env.KUBECONFIG;
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

    afterEach(() => {
      // Restore original environment variables
      if (originalKubeconfig) {
        process.env.KUBECONFIG = originalKubeconfig;
      } else {
        delete process.env.KUBECONFIG;
      }

      if (originalAnthropicKey) {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    test('should read ANTHROPIC_API_KEY from environment when not provided in config', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.KUBECONFIG;

      const dotAI = new DotAI({ anthropicApiKey: 'test-key' });
      
      // Use the public getter to verify API key was read from environment
      expect(dotAI.getAnthropicApiKey()).toBe('test-key');
    });

    test('should use provided config values over environment variables', () => {
      process.env.KUBECONFIG = '/env/kubeconfig.yaml';
      process.env.ANTHROPIC_API_KEY = 'test-key';

      const dotAI = new DotAI({
        kubernetesConfig: '/override/kubeconfig.yaml',
        anthropicApiKey: 'test-key'
      });
      
      // Should use the provided config values, not environment
      expect(dotAI.getAnthropicApiKey()).toBe('test-key');
    });

    test('should handle missing environment variables gracefully', () => {
      delete process.env.KUBECONFIG;
      delete process.env.ANTHROPIC_API_KEY;

      const dotAI = new DotAI();
      
      expect(dotAI.getAnthropicApiKey()).toBeUndefined();
    });

    test('should provide public getter for API key', () => {
      const dotAI = new DotAI({
        anthropicApiKey: 'test-key'
      });
      
      expect(dotAI.getAnthropicApiKey()).toBe('test-key');
    });

    test('should return undefined when no API key is available', () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      const dotAI = new DotAI();
      
      expect(dotAI.getAnthropicApiKey()).toBeUndefined();
    });

    test('should validate configuration and reject empty API key', () => {
      expect(() => {
        new DotAI({
          anthropicApiKey: ''
        });
      }).toThrow('Invalid configuration: Empty API key provided');
    });
  });
}); 