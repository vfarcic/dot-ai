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
} from '../../src/core';
import { ErrorClassifier, buildKubectlCommand, executeKubectl } from '../../src/core/kubernetes-utils';
import * as path from 'path';

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
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig });
      await agent.initialize();
      
      expect(agent.discovery).toBeInstanceOf(KubernetesDiscovery);
      expect(agent.memory).toBeInstanceOf(MemorySystem);
      expect(agent.workflow).toBeInstanceOf(WorkflowEngine);
      expect(agent.claude).toBeInstanceOf(ClaudeIntegration);
    });

    test('should handle initialization errors gracefully', async () => {
      // Use project's working kubeconfig.yaml for integration tests
      const projectKubeconfig = path.join(process.cwd(), 'kubeconfig.yaml');
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig });
      
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
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig });
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
      const agent = new DotAI({ kubernetesConfig: projectKubeconfig });
      
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
