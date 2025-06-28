import { CliInterface } from '../src/interfaces/cli';
import { AppAgent } from '../src/core';
import { jest } from '@jest/globals';

describe('CLI Interface', () => {
  let cli: CliInterface;
  let mockAppAgent: jest.Mocked<AppAgent>;

  beforeEach(() => {
    // Create mock AppAgent
    mockAppAgent = {
      initialize: jest.fn(),
      isInitialized: jest.fn(),
      discovery: {
        connect: jest.fn(),
        isConnected: jest.fn(),
        discoverCRDs: jest.fn(),
        getAPIResources: jest.fn(),
        discoverResources: jest.fn(),
        explainResource: jest.fn(),
        fingerprintCluster: jest.fn()
      },
      memory: {
        storePattern: jest.fn(),
        retrievePattern: jest.fn(),
        storeLessons: jest.fn(),
        getRecommendations: jest.fn()
      },
      workflow: {
        initializeWorkflow: jest.fn(),
        getCurrentPhase: jest.fn(),
        transitionTo: jest.fn(),
        executePhase: jest.fn(),
        rollback: jest.fn()
      },
      claude: {
        generateResponse: jest.fn(),
        processUserInput: jest.fn()
      }
    } as any;

    cli = new CliInterface(mockAppAgent);
  });

  describe('Command Structure', () => {
    test('should have main app-agent command', () => {
      expect(cli.getCommands()).toContain('app-agent');
    });

    test('should have discover subcommand', () => {
      const commands = cli.getSubcommands();
      expect(commands).toContain('discover');
    });

    test('should have deploy subcommand', () => {
      const commands = cli.getSubcommands();
      expect(commands).toContain('deploy');
    });

    test('should have status subcommand', () => {
      const commands = cli.getSubcommands();
      expect(commands).toContain('status');
    });

    test('should have learn subcommand', () => {
      const commands = cli.getSubcommands();
      expect(commands).toContain('learn');
    });
  });

  describe('Help Text Generation', () => {
    test('should provide main help text', async () => {
      const helpText = await cli.getHelp();
      expect(helpText).toContain('app-agent');
      expect(helpText).toContain('Kubernetes application deployment agent');
      expect(helpText).toContain('discover');
      expect(helpText).toContain('deploy');
      expect(helpText).toContain('status');
      expect(helpText).toContain('learn');
    });

    test('should provide discover command help', async () => {
      const helpText = await cli.getCommandHelp('discover');
      expect(helpText).toContain('Discover available resources in the Kubernetes cluster');
      expect(helpText).toContain('--cluster');
      expect(helpText).toContain('--output');
    });

    test('should provide deploy command help', async () => {
      const helpText = await cli.getCommandHelp('deploy');
      expect(helpText).toContain('Start interactive deployment workflow');
      expect(helpText).toContain('--app');
      expect(helpText).toContain('--requirements');
    });

    test('should provide status command help', async () => {
      const helpText = await cli.getCommandHelp('status');
      expect(helpText).toContain('Check deployment status');
      expect(helpText).toContain('--deployment');
    });

    test('should provide learn command help', async () => {
      const helpText = await cli.getCommandHelp('learn');
      expect(helpText).toContain('Show learned deployment patterns');
      expect(helpText).toContain('--pattern');
    });
  });

  describe('Argument Parsing and Validation', () => {
    test('should parse discover command with cluster option', async () => {
      const args = ['discover', '--cluster', 'test-cluster', '--output', 'json'];
      const parsed = await cli.parseArguments(args);
      
      expect(parsed.command).toBe('discover');
      expect(parsed.options.cluster).toBe('test-cluster');
      expect(parsed.options.output).toBe('json');
    });

    test('should parse deploy command with app name', async () => {
      const args = ['deploy', '--app', 'my-app', '--requirements', 'web server'];
      const parsed = await cli.parseArguments(args);
      
      expect(parsed.command).toBe('deploy');
      expect(parsed.options.app).toBe('my-app');
      expect(parsed.options.requirements).toBe('web server');
    });

    test('should validate required arguments', async () => {
      const args = ['deploy']; // Missing required --app
      await expect(cli.parseArguments(args)).rejects.toThrow('Missing required argument: --app');
    });

    test('should validate argument values', async () => {
      const args = ['discover', '--output', 'invalid-format'];
      await expect(cli.parseArguments(args)).rejects.toThrow('Invalid output format. Supported: json, yaml, table');
    });

    test('should handle unknown commands', async () => {
      const args = ['unknown-command'];
      await expect(cli.parseArguments(args)).rejects.toThrow('Unknown command: unknown-command');
    });

    test('should handle unknown options', async () => {
      const args = ['discover', '--unknown-option', 'value'];
      await expect(cli.parseArguments(args)).rejects.toThrow('Unknown option: --unknown-option');
    });
  });

  describe('Command Execution', () => {
    test('should execute discover command successfully', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments', 'services', 'configmaps']);
      mockAppAgent.discovery.discoverResources.mockResolvedValue({
        core: ['Pod', 'Service', 'ConfigMap', 'Secret'],
        apps: ['Deployment', 'StatefulSet', 'DaemonSet'],
        custom: []
      });
      mockAppAgent.discovery.fingerprintCluster.mockResolvedValue('kind-cluster-fingerprint');

      const result = await cli.executeCommand('discover', { output: 'json' });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.discovery.discoverCRDs).toHaveBeenCalled();
      expect(mockAppAgent.discovery.discoverResources).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('crds');
      expect(result.data).toHaveProperty('resources');
    });

    test('should execute deploy command and start workflow', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Discovery');

      const result = await cli.executeCommand('deploy', { 
        app: 'my-app', 
        requirements: 'web server with database' 
      });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.workflow.initializeWorkflow).toHaveBeenCalledWith({
        appName: 'my-app',
        requirements: 'web server with database'
      });
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('workflowId');
      expect(result.data).toHaveProperty('phase', 'Discovery');
    });

    test('should execute status command', async () => {
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Deployment');

      const result = await cli.executeCommand('status', { deployment: 'workflow-123' });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('phase', 'Deployment');
    });

    test('should execute learn command', async () => {
      mockAppAgent.memory.getRecommendations.mockResolvedValue([
        {
          suggestion: 'Use Deployment for web servers',
          confidence: 0.9,
          based_on: ['Previous successful deployment']
        }
      ]);

      const result = await cli.executeCommand('learn', {});
      
      expect(mockAppAgent.memory.getRecommendations).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('recommendations');
      expect(result.data.recommendations).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    test('should handle AppAgent initialization failure', async () => {
      mockAppAgent.initialize.mockRejectedValue(new Error('Connection failed'));

      const result = await cli.executeCommand('discover', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to initialize');
      expect(result.error).toContain('Connection failed');
    });

    test('should handle discovery failures gracefully', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockRejectedValue(new Error('Cluster unreachable'));

      const result = await cli.executeCommand('discover', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Discovery failed');
      expect(result.error).toContain('Cluster unreachable');
    });

    test('should handle workflow failures', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockRejectedValue(new Error('Invalid requirements'));

      const result = await cli.executeCommand('deploy', { 
        app: 'my-app', 
        requirements: 'invalid' 
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Deployment failed');
      expect(result.error).toContain('Invalid requirements');
    });

    test('should provide helpful error messages for common issues', async () => {
      mockAppAgent.initialize.mockRejectedValue(new Error('ENOTFOUND'));

      const result = await cli.executeCommand('discover', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot connect to Kubernetes cluster');
      expect(result.error).toContain('Check your kubeconfig');
    });
  });

  describe('Output Formatting', () => {
    test('should format JSON output correctly', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments']);

      const result = await cli.executeCommand('discover', { output: 'json' });
      const formatted = cli.formatOutput(result, 'json');
      
      expect(() => JSON.parse(formatted)).not.toThrow();
      const parsed = JSON.parse(formatted);
      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('data');
    });

    test('should format YAML output correctly', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments']);

      const result = await cli.executeCommand('discover', { output: 'yaml' });
      const formatted = cli.formatOutput(result, 'yaml');
      
      expect(formatted).toContain('success: true');
      expect(formatted).toContain('data:');
    });

    test('should format table output correctly', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments', 'services']);

      const result = await cli.executeCommand('discover', { output: 'table' });
      const formatted = cli.formatOutput(result, 'table');
      
      expect(formatted).toContain('│'); // Table borders
      expect(formatted).toContain('deployments');
      expect(formatted).toContain('services');
    });

    test('should format error output consistently', () => {
      const errorResult = {
        success: false,
        error: 'Test error message'
      };

      const formatted = cli.formatOutput(errorResult, 'json');
      const parsed = JSON.parse(formatted);
      
      expect(parsed).toHaveProperty('success', false);
      expect(parsed).toHaveProperty('error', 'Test error message');
    });
  });

  describe('Integration with Core Modules', () => {
    test('should properly initialize AppAgent before operations', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.isInitialized.mockReturnValue(true);

      await cli.executeCommand('discover', {});
      
      expect(mockAppAgent.initialize).toHaveBeenCalledTimes(1);
    });

    test('should use discovery module for cluster exploration', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments']);
      mockAppAgent.discovery.fingerprintCluster.mockResolvedValue('vanilla-k8s');

      await cli.executeCommand('discover', {});
      
      expect(mockAppAgent.discovery.discoverCRDs).toHaveBeenCalled();
      expect(mockAppAgent.discovery.fingerprintCluster).toHaveBeenCalled();
    });

    test('should use workflow module for deployment orchestration', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');

      await cli.executeCommand('deploy', { 
        app: 'test-app', 
        requirements: 'web server' 
      });
      
      expect(mockAppAgent.workflow.initializeWorkflow).toHaveBeenCalledWith({
        appName: 'test-app',
        requirements: 'web server'
      });
    });

    test('should use memory module for pattern retrieval', async () => {
      mockAppAgent.memory.getRecommendations.mockResolvedValue([]);

      await cli.executeCommand('learn', {});
      
      expect(mockAppAgent.memory.getRecommendations).toHaveBeenCalled();
    });

    test('should handle module interaction failures gracefully', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments']);
      mockAppAgent.memory.storePattern.mockRejectedValue(new Error('Storage failed'));

      const result = await cli.executeCommand('discover', { remember: true });
      
      // Should succeed with discovery but warn about memory failure
      expect(result.success).toBe(true);
      expect(result.warnings).toContain('Could not store discovery pattern');
    });
  });

  describe('Interactive Features', () => {
    test('should support interactive deployment workflow', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.claude.processUserInput.mockResolvedValue({
        phase: 'Planning',
        questions: ['What type of database do you need?']
      });

      const result = await cli.executeCommand('deploy', { 
        app: 'my-app', 
        interactive: true 
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('questions');
      expect(result.data.questions).toContain('What type of database do you need?');
    });

    test('should handle user responses in workflow', async () => {
      mockAppAgent.workflow.transitionTo.mockResolvedValue('Validation');
      mockAppAgent.claude.processUserInput.mockResolvedValue({
        phase: 'Validation',
        nextSteps: ['Review generated manifest']
      });

      const result = await cli.continueWorkflow('workflow-123', {
        responses: { database: 'PostgreSQL' }
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('nextSteps');
    });
  });

  describe('Configuration and Options', () => {
    test('should respect configuration file settings', async () => {
      const configCli = new CliInterface(mockAppAgent, {
        defaultOutput: 'yaml',
        verboseMode: true
      });

      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments']);
      mockAppAgent.discovery.discoverResources.mockResolvedValue({
        core: ['Pod', 'Service', 'ConfigMap'],
        apps: ['Deployment', 'StatefulSet'],
        custom: []
      });
      mockAppAgent.discovery.fingerprintCluster.mockResolvedValue('vanilla-k8s');

      const result = await configCli.executeCommand('discover', {});
      
      expect(result.success).toBe(true);
      // Should use YAML as default output format
    });

    test('should support verbose mode for detailed output', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverCRDs.mockResolvedValue(['deployments']);
      mockAppAgent.discovery.discoverResources.mockResolvedValue({
        core: ['Pod', 'Service', 'ConfigMap'],
        apps: ['Deployment', 'StatefulSet'],
        custom: []
      });
      mockAppAgent.discovery.fingerprintCluster.mockResolvedValue('vanilla-k8s');

      const result = await cli.executeCommand('discover', { verbose: true });
      
      expect(result.data).toHaveProperty('details');
      expect(result.data.details).toHaveProperty('timing');
    });
  });
}); 