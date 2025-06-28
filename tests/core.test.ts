/**
 * Core Module Tests
 * 
 * These tests define the API contracts and behavior for our core intelligence modules
 * Following TDD approach - these tests define what we SHOULD implement
 */

import { 
  AppAgent, 
  KubernetesDiscovery, 
  MemorySystem, 
  WorkflowEngine, 
  ClaudeIntegration 
} from '../src/core';
import path from 'path';

describe('Core Module Structure', () => {
  describe('AppAgent Class', () => {
    test('should be constructible with configuration options', () => {
      const agent = new AppAgent({
        kubernetesConfig: '/path/to/kubeconfig',
        anthropicApiKey: 'test-key'
      });
      
      expect(agent).toBeInstanceOf(AppAgent);
      expect(agent.getVersion()).toBe('0.1.0');
    });

    test('should provide access to all core modules', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new AppAgent({ kubernetesConfig: projectKubeconfig });
      await agent.initialize();
      
      expect(agent.discovery).toBeInstanceOf(KubernetesDiscovery);
      expect(agent.memory).toBeInstanceOf(MemorySystem);
      expect(agent.workflow).toBeInstanceOf(WorkflowEngine);
      expect(agent.claude).toBeInstanceOf(ClaudeIntegration);
    });

    test('should handle initialization errors gracefully', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new AppAgent({ kubernetesConfig: projectKubeconfig });
      
      // Mock the discovery connect method to fail
      jest.spyOn(agent.discovery, 'connect').mockRejectedValue(new Error('Connection failed'));
      
      await expect(agent.initialize()).rejects.toThrow();
      expect(agent.isInitialized()).toBe(false);
    });

    test('should provide configuration validation', () => {
      expect(() => {
        new AppAgent({ anthropicApiKey: '' });
      }).toThrow('Invalid configuration');
    });
  });

  describe('Module Integration', () => {
    test('should allow modules to communicate with each other', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new AppAgent({ kubernetesConfig: projectKubeconfig });
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
      const agent = new AppAgent({ kubernetesConfig: projectKubeconfig });
      
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

describe('Kubernetes Discovery Module', () => {
  let discovery: KubernetesDiscovery;

  beforeEach(() => {
    discovery = new KubernetesDiscovery();
  });

  describe('Kubeconfig Resolution (TDD)', () => {
    test('should use custom kubeconfig path when provided in constructor', () => {
      const customPath = '/custom/path/to/kubeconfig';
      const discovery = new KubernetesDiscovery({ kubeconfigPath: customPath });
      
      expect(discovery.getKubeconfigPath()).toBe(customPath);
    });

    test('should use KUBECONFIG environment variable when no custom path provided', () => {
      const envPath = '/env/path/to/kubeconfig';
      process.env.KUBECONFIG = envPath;
      
      const discovery = new KubernetesDiscovery();
      expect(discovery.getKubeconfigPath()).toBe(envPath);
      
      delete process.env.KUBECONFIG;
    });

    test('should use default ~/.kube/config when no custom path or env var provided', () => {
      delete process.env.KUBECONFIG;
      
      const discovery = new KubernetesDiscovery();
      const defaultPath = require('path').join(require('os').homedir(), '.kube', 'config');
      
      expect(discovery.getKubeconfigPath()).toBe(defaultPath);
    });

    test('should prioritize custom path over environment variable', () => {
      const customPath = '/custom/path/to/kubeconfig';
      const envPath = '/env/path/to/kubeconfig';
      process.env.KUBECONFIG = envPath;
      
      const discovery = new KubernetesDiscovery({ kubeconfigPath: customPath });
      expect(discovery.getKubeconfigPath()).toBe(customPath);
      
      delete process.env.KUBECONFIG;
    });

    test('should prioritize environment variable over default path', () => {
      const envPath = '/env/path/to/kubeconfig';
      process.env.KUBECONFIG = envPath;
      
      const discovery = new KubernetesDiscovery();
      expect(discovery.getKubeconfigPath()).toBe(envPath);
      
      delete process.env.KUBECONFIG;
    });

    test('should handle multiple paths in KUBECONFIG environment variable', () => {
      const multiPath = '/path1/kubeconfig:/path2/kubeconfig:/path3/kubeconfig';
      process.env.KUBECONFIG = multiPath;
      
      const discovery = new KubernetesDiscovery();
      // Should use the first path in the colon-separated list
      expect(discovery.getKubeconfigPath()).toBe('/path1/kubeconfig');
      
      delete process.env.KUBECONFIG;
    });

    test('should allow kubeconfig path to be changed after construction', () => {
      const discovery = new KubernetesDiscovery();
      const newPath = '/new/path/to/kubeconfig';
      
      discovery.setKubeconfigPath(newPath);
      expect(discovery.getKubeconfigPath()).toBe(newPath);
    });
  });

  describe('Cluster Connection', () => {
    let discovery: KubernetesDiscovery;
    
    beforeEach(() => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      discovery = new KubernetesDiscovery({ kubeconfigPath: projectKubeconfig });
    });

    test('should use implemented kubeconfig resolution in integration tests', () => {
      const kubeconfigPath = discovery.getKubeconfigPath();
      expect(kubeconfigPath).toBeDefined();
      expect(typeof kubeconfigPath).toBe('string');
      
      // Should be using the project's kubeconfig.yaml for integration tests
      expect(kubeconfigPath).toContain('kubeconfig.yaml');
    });

    test('should connect to kubernetes cluster', async () => {
      await discovery.connect();
      expect(discovery.isConnected()).toBe(true);
    });

    test('should handle connection errors gracefully', async () => {
      const invalidDiscovery = new KubernetesDiscovery({ kubeconfigPath: '/invalid/path/kubeconfig' });
      await expect(invalidDiscovery.connect()).rejects.toThrow();
      expect(invalidDiscovery.isConnected()).toBe(false);
    });
  });

  describe('Cluster Type Detection', () => {
    let discovery: KubernetesDiscovery;
    
    beforeEach(async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      discovery = new KubernetesDiscovery({ kubeconfigPath: projectKubeconfig });
      await discovery.connect();
    });

    test('should detect cluster type and version', async () => {
      const clusterInfo = await discovery.getClusterInfo();
      expect(clusterInfo).toMatchObject({
        type: expect.any(String),
        version: expect.any(String),
        capabilities: expect.any(Array)
      });
    });
  });

  describe('Resource Discovery', () => {
    let discovery: KubernetesDiscovery;
    
    beforeEach(async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      discovery = new KubernetesDiscovery({ kubeconfigPath: projectKubeconfig });
      await discovery.connect();
    });

    test('should discover available Kubernetes resources', async () => {
      const resources = await discovery.discoverResources();
      expect(resources).toBeDefined();
      expect(resources.core).toBeInstanceOf(Array);
      expect(resources.apps).toBeInstanceOf(Array);
    });

    test('should discover Custom Resource Definitions (CRDs)', async () => {
      const crds = await discovery.discoverCRDs();
      expect(crds).toBeInstanceOf(Array);
    });

    test('should provide resource schema information', async () => {
      const schema = await discovery.getResourceSchema('Pod', 'v1');
      expect(schema).toBeDefined();
    });
  });

  describe('Namespace Operations', () => {
    let discovery: KubernetesDiscovery;
    
    beforeEach(async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      discovery = new KubernetesDiscovery({ kubeconfigPath: projectKubeconfig });
      await discovery.connect();
    });

    test('should list available namespaces', async () => {
      const namespaces = await discovery.getNamespaces();
      expect(namespaces).toBeInstanceOf(Array);
      expect(namespaces.length).toBeGreaterThan(0);
      expect(namespaces).toContain('default');
    });

    test('should validate namespace existence', async () => {
      const defaultExists = await discovery.namespaceExists('default');
      expect(defaultExists).toBe(true);
      
      const fakeExists = await discovery.namespaceExists('non-existent-namespace-12345');
      expect(fakeExists).toBe(false);
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
    claude = new ClaudeIntegration('test-api-key');
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
}); 