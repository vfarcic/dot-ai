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
      },
      schema: {
        parseResource: jest.fn(),
        validateManifest: jest.fn(),
        rankResources: jest.fn()
      }
    } as any;

    cli = new CliInterface(mockAppAgent);
  });

  describe('Command Structure', () => {
    test('should have main app-agent command', () => {
      expect(cli.getCommands()).toContain('app-agent');
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

    test('should have schema subcommand', () => {
      const commands = cli.getSubcommands();
      expect(commands).toContain('schema');
    });
  });

  describe('Help Text Generation', () => {
    test('should provide main help text', async () => {
      const helpText = await cli.getHelp();
      expect(helpText).toContain('app-agent');
      expect(helpText).toContain('Kubernetes application deployment agent');
      expect(helpText).toContain('deploy');
      expect(helpText).toContain('status');
      expect(helpText).toContain('learn');
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

    test('should provide schema command help', async () => {
      const helpText = await cli.getCommandHelp('schema');
      expect(helpText).toContain('Parse and display resource schema information');
      expect(helpText).toContain('--resource');
      expect(helpText).toContain('--api-version');
      expect(helpText).toContain('--list-versions');
      expect(helpText).toContain('--validate');
    });
  });

  describe('Argument Parsing and Validation', () => {

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


    test('should handle unknown commands', async () => {
      const args = ['unknown-command'];
      await expect(cli.parseArguments(args)).rejects.toThrow('Unknown command: unknown-command');
    });


    test('should parse schema command with resource option', async () => {
      const args = ['schema', '--resource', 'deployment', '--output', 'json'];
      const parsed = await cli.parseArguments(args);
      
      expect(parsed.command).toBe('schema');
      expect(parsed.options.resource).toBe('deployment');
      expect(parsed.options.output).toBe('json');
    });

    test('should parse schema command with api-version option', async () => {
      const args = ['schema', '--resource', 'deployment', '--api-version', 'apps/v1'];
      const parsed = await cli.parseArguments(args);
      
      expect(parsed.command).toBe('schema');
      expect(parsed.options.resource).toBe('deployment');
      expect(parsed.options['api-version']).toBe('apps/v1');
    });

    test('should parse schema command with list-versions option', async () => {
      const args = ['schema', '--resource', 'deployment', '--list-versions'];
      const parsed = await cli.parseArguments(args);
      
      expect(parsed.command).toBe('schema');
      expect(parsed.options.resource).toBe('deployment');
      expect(parsed.options['list-versions']).toBe(true);
    });

    test('should parse schema command with validate option', async () => {
      const args = ['schema', '--resource', 'deployment', '--validate', 'tests/fixtures/test-deployment.yaml'];
      const parsed = await cli.parseArguments(args);
      
      expect(parsed.command).toBe('schema');
      expect(parsed.options.resource).toBe('deployment');
      expect(parsed.options.validate).toBe('tests/fixtures/test-deployment.yaml');
    });
  });

  describe('Command Execution', () => {

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

    test('should execute schema parse command', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverResources.mockResolvedValue({
        resources: [
          { kind: 'Deployment', name: 'deployments', group: 'apps', apiVersion: 'apps/v1', namespaced: true, shortNames: [] }
        ],
        custom: []
      });
      mockAppAgent.discovery.explainResource.mockResolvedValue({
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Manages a replicated application',
        fields: [
          {
            name: 'spec.replicas',
            type: 'integer',
            description: 'Number of desired pods. Defaults to 1',
            required: false
          }
        ]
      });

      const result = await cli.executeCommand('schema', { resource: 'deployment' });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.discovery.discoverResources).toHaveBeenCalled();
      expect(mockAppAgent.discovery.explainResource).toHaveBeenCalledWith('deployment', 'apps/v1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('schema');
      expect(result.data.schema).toHaveProperty('kind', 'Deployment');
      expect(result.data).toHaveProperty('summary');
    });

    test('should execute schema command with api-version', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.explainResource.mockResolvedValue({
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Manages a replicated application',
        fields: [
          {
            name: 'spec.replicas',
            type: 'integer',
            description: 'Number of desired pods',
            required: false
          }
        ]
      });

      const result = await cli.executeCommand('schema', { 
        resource: 'deployment', 
        apiVersion: 'apps/v1' 
      });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.discovery.explainResource).toHaveBeenCalledWith('deployment', 'apps/v1');
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('apiVersion', 'apps/v1');
    });

    test('should execute schema list-versions command', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.discoverResources.mockResolvedValue({
        resources: [
          { kind: 'Deployment', name: 'deployments', group: 'apps', apiVersion: 'apps/v1', namespaced: true, shortNames: [] }
        ],
        custom: []
      });

      const result = await cli.executeCommand('schema', { 
        resource: 'deployment', 
        listVersions: true 
      });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.discovery.discoverResources).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('versions');
      expect(result.data.versions).toHaveLength(1);
      expect(result.data.versions[0]).toHaveProperty('kind', 'Deployment');
    });

    test('should execute schema validate command', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.explainResource.mockResolvedValue({
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Manages a replicated application',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            description: 'Standard object metadata',
            required: true
          },
          {
            name: 'spec',
            type: 'object', 
            description: 'Deployment specification',
            required: true
          }
        ]
      });

      const result = await cli.executeCommand('schema', { 
        resource: 'deployment', 
        validate: 'tests/fixtures/test-deployment.yaml'
      });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      // Note: discoverResources is NOT called because the manifest contains apiVersion: apps/v1
      expect(mockAppAgent.discovery.explainResource).toHaveBeenCalledWith('deployment', 'apps/v1');
      expect(result.data).toHaveProperty('validation');
      expect(result.data.validation).toHaveProperty('valid');
      expect(result.data.validation).toHaveProperty('errors');
      expect(result.data.validation).toHaveProperty('warnings');
      expect(result.data.file).toBe('tests/fixtures/test-deployment.yaml');
    });

    test('should execute schema validate command with explicit api-version', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.explainResource.mockResolvedValue({
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Manages a replicated application',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            description: 'Standard object metadata',
            required: true
          },
          {
            name: 'spec',
            type: 'object',
            description: 'Deployment specification', 
            required: true
          }
        ]
      });

      const result = await cli.executeCommand('schema', { 
        resource: 'deployment',
        apiVersion: 'apps/v1',
        validate: 'tests/fixtures/test-deployment.yaml'
      });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.discovery.explainResource).toHaveBeenCalledWith('deployment', 'apps/v1');
      expect(result.data.apiVersion).toBe('apps/v1');
      expect(result.data.validation).toHaveProperty('valid');
    });

    test('should handle validation errors for missing resource', async () => {
      const result = await cli.executeCommand('schema', { 
        validate: 'tests/fixtures/test-deployment.yaml'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Resource type must be specified with --resource when using --validate');
    });

    test('should handle validation errors for missing file', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      
      const result = await cli.executeCommand('schema', { 
        resource: 'deployment',
        validate: 'nonexistent-file.yaml'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Schema parsing failed');
    });

    test('should handle validation with manifest api version', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.discovery.explainResource.mockResolvedValue({
        kind: 'Deployment',
        group: 'apps',
        version: 'v1',
        description: 'Manages a replicated application',
        fields: [
          {
            name: 'metadata',
            type: 'object',
            description: 'Standard object metadata',
            required: true
          }
        ]
      });

      const result = await cli.executeCommand('schema', { 
        resource: 'deployment',
        validate: 'tests/fixtures/test-deployment.yaml'
      });
      
      expect(mockAppAgent.initialize).toHaveBeenCalled();
      expect(mockAppAgent.discovery.explainResource).toHaveBeenCalledWith('deployment', 'apps/v1');
      expect(result.data.summary.manifestApiVersion).toBe('apps/v1');
    });
  });

  describe('Error Handling', () => {


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

  });

  describe('Output Formatting', () => {
    test('should format JSON output correctly', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Discovery');

      const result = await cli.executeCommand('deploy', { app: 'test-app', requirements: 'web server' });
      const formatted = cli.formatOutput(result, 'json');
      
      expect(() => JSON.parse(formatted)).not.toThrow();
      const parsed = JSON.parse(formatted);
      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('data');
    });

    test('should format YAML output correctly', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Discovery');

      const result = await cli.executeCommand('deploy', { app: 'test-app', requirements: 'web server' });
      const formatted = cli.formatOutput(result, 'yaml');
      
      expect(formatted).toContain('success: true');
      expect(formatted).toContain('data:');
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
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');

      await cli.executeCommand('deploy', { app: 'test-app', requirements: 'web server' });
      
      expect(mockAppAgent.initialize).toHaveBeenCalledTimes(1);
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
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Discovery');
      mockAppAgent.memory.storePattern.mockRejectedValue(new Error('Storage failed'));

      const result = await cli.executeCommand('deploy', { app: 'test-app', requirements: 'web server' });
      
      // Should succeed with deployment
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('workflowId', 'workflow-123');
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
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Discovery');

      const result = await configCli.executeCommand('deploy', { app: 'test-app', requirements: 'web server' });
      
      expect(result.success).toBe(true);
      // Should use YAML as default output format
    });

    test('should support verbose mode for detailed output', async () => {
      mockAppAgent.initialize.mockResolvedValue(undefined);
      mockAppAgent.workflow.initializeWorkflow.mockResolvedValue('workflow-123');
      mockAppAgent.workflow.getCurrentPhase.mockReturnValue('Discovery');

      const result = await cli.executeCommand('deploy', { app: 'test-app', requirements: 'web server', verbose: true });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('workflowId', 'workflow-123');
      expect(result.data).toHaveProperty('phase', 'Discovery');
    });
  });
}); 