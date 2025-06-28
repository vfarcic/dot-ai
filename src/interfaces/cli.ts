/**
 * CLI Interface Module
 * 
 * Command-line interface for app-agent
 */

import { Command } from 'commander';
import { AppAgent } from '../core';
import * as yaml from 'yaml';
import Table from 'cli-table3';

export interface CliResult {
  success: boolean;
  data?: any;
  error?: string;
  warnings?: string[];
}

export interface ParsedArguments {
  command: string;
  options: Record<string, any>;
}

export interface CliConfig {
  defaultOutput?: string;
  verboseMode?: boolean;
}

export class CliInterface {
  private appAgent: AppAgent;
  private program: Command;
  private config: CliConfig;

  constructor(appAgent: AppAgent, config: CliConfig = {}) {
    this.appAgent = appAgent;
    this.config = config;
    this.program = new Command();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('app-agent')
      .description('Kubernetes application deployment agent with AI-powered orchestration')
      .version('1.0.0');

    // Discover command
    this.program
      .command('discover')
      .description('Discover available resources in the Kubernetes cluster')
      .option('--cluster <name>', 'Specify cluster name for context')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .option('--verbose', 'Enable verbose output with detailed information')
      .option('--remember', 'Store discovery patterns in memory for learning')
      .action(async (options) => {
        const result = await this.executeCommand('discover', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json');
      });

    // Deploy command
    this.program
      .command('deploy')
      .description('Start interactive deployment workflow')
      .requiredOption('--app <name>', 'Application name to deploy')
      .option('--requirements <text>', 'Application requirements description')
      .option('--interactive', 'Enable interactive mode with questions')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .option('--verbose', 'Enable verbose output')
      .action(async (options) => {
        const result = await this.executeCommand('deploy', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json');
      });

    // Status command
    this.program
      .command('status')
      .description('Check deployment status')
      .option('--deployment <id>', 'Deployment/workflow ID to check')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options) => {
        const result = await this.executeCommand('status', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json');
      });

    // Learn command
    this.program
      .command('learn')
      .description('Show learned deployment patterns and recommendations')
      .option('--pattern <type>', 'Filter by pattern type')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options) => {
        const result = await this.executeCommand('learn', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json');
      });
  }

  getCommands(): string[] {
    return ['app-agent'];
  }

  getSubcommands(): string[] {
    return this.program.commands.map(cmd => cmd.name());
  }

  async getHelp(): Promise<string> {
    return this.program.helpInformation();
  }

  async getCommandHelp(commandName: string): Promise<string> {
    const command = this.program.commands.find(cmd => cmd.name() === commandName);
    if (!command) {
      throw new Error(`Unknown command: ${commandName}`);
    }
    return command.helpInformation();
  }

  async parseArguments(args: string[]): Promise<ParsedArguments> {
    if (args.length === 0) {
      throw new Error('No command provided');
    }

    const commandName = args[0];
    const validCommands = this.getSubcommands();
    
    if (!validCommands.includes(commandName)) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    // Validate options based on command
    const options: Record<string, any> = {};
    
    for (let i = 1; i < args.length; i += 2) {
      const option = args[i];
      const value = args[i + 1];

      if (!option.startsWith('--')) {
        throw new Error(`Invalid option format: ${option}`);
      }

      const optionName = option.substring(2);
      
      // Validate known options for each command
      const validOptions = this.getValidOptionsForCommand(commandName);
      if (!validOptions.includes(optionName)) {
        throw new Error(`Unknown option: ${option}`);
      }

      // Validate specific option values
      if (optionName === 'output' && value && !['json', 'yaml', 'table'].includes(value)) {
        throw new Error('Invalid output format. Supported: json, yaml, table');
      }

      options[optionName] = value || true;
    }

    // Check required options
    if (commandName === 'deploy' && !options.app) {
      throw new Error('Missing required argument: --app');
    }

    return {
      command: commandName,
      options
    };
  }

  private getValidOptionsForCommand(command: string): string[] {
    const commonOptions = ['output', 'verbose'];
    
    switch (command) {
      case 'discover':
        return [...commonOptions, 'cluster', 'remember'];
      case 'deploy':
        return [...commonOptions, 'app', 'requirements', 'interactive'];
      case 'status':
        return [...commonOptions, 'deployment'];
      case 'learn':
        return [...commonOptions, 'pattern'];
      default:
        return commonOptions;
    }
  }

  async executeCommand(command: string, options: Record<string, any> = {}): Promise<CliResult> {
    try {
      // Always ensure AppAgent is initialized for command execution
      await this.appAgent.initialize();

      switch (command) {
        case 'discover':
          return await this.handleDiscoverCommand(options);
        case 'deploy':
          return await this.handleDeployCommand(options);
        case 'status':
          return await this.handleStatusCommand(options);
        case 'learn':
          return await this.handleLearnCommand(options);
        default:
          return {
            success: false,
            error: `Unknown command: ${command}`
          };
      }
    } catch (error) {
      return this.handleError(error, command);
    }
  }

  private async handleDiscoverCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const startTime = Date.now();
      
      // Perform discovery
      const crds = await this.appAgent.discovery.discoverCRDs();
      const resources = await this.appAgent.discovery.discoverResources();
      const clusterFingerprint = await this.appAgent.discovery.fingerprintCluster();
      
      const endTime = Date.now();

      const result: CliResult = {
        success: true,
        data: {
          crds,
          resources,
          clusterFingerprint
        }
      };

      // Add verbose details if requested
      if (options.verbose || this.config.verboseMode) {
        result.data.details = {
          timing: `${endTime - startTime}ms`,
          crdCount: crds.length,
          resourceCount: Object.keys(resources.core).length + Object.keys(resources.apps).length + Object.keys(resources.custom).length
        };
      }

      // Store pattern in memory if requested
      if (options.remember) {
        try {
          await this.appAgent.memory.storePattern('discovery', {
            crds,
            resources,
            clusterFingerprint
          });
        } catch (error) {
          result.warnings = result.warnings || [];
          result.warnings.push('Could not store discovery pattern');
        }
      }

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      // Handle specific error types with helpful messages
      if (errorMessage.includes('ENOTFOUND')) {
        return {
          success: false,
          error: 'Cannot connect to Kubernetes cluster. Check your kubeconfig'
        };
      }
      
      if (errorMessage.includes('Cluster unreachable')) {
        return {
          success: false,
          error: 'Discovery failed: Cluster unreachable'
        };
      }
      
      return {
        success: false,
        error: `Discovery failed: ${errorMessage}`
      };
    }
  }

  private async handleDeployCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const workflowId = await this.appAgent.workflow.initializeWorkflow({
        appName: options.app,
        requirements: options.requirements
      });

      const phase = this.appAgent.workflow.getCurrentPhase();

      const result: CliResult = {
        success: true,
        data: {
          workflowId,
          phase,
          appName: options.app
        }
      };

      // Handle interactive mode
      if (options.interactive) {
        const claudeResponse = await this.appAgent.claude.processUserInput(
          `Starting deployment for ${options.app}. Requirements: ${options.requirements || 'none provided'}`
        );
        
        result.data = {
          ...result.data,
          ...claudeResponse
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Deployment failed: ${(error as Error).message}`
      };
    }
  }

  private async handleStatusCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const phase = this.appAgent.workflow.getCurrentPhase();
      
      return {
        success: true,
        data: {
          workflowId: options.deployment,
          phase,
          status: 'active'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Status check failed: ${(error as Error).message}`
      };
    }
  }

  private async handleLearnCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const recommendations = await this.appAgent.memory.getRecommendations(
        options.pattern || 'deployment',
        {}
      );

      return {
        success: true,
        data: {
          recommendations,
          patternType: options.pattern || 'deployment'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Learning retrieval failed: ${(error as Error).message}`
      };
    }
  }

  async continueWorkflow(workflowId: string, input: { responses: Record<string, any> }): Promise<CliResult> {
    try {
      await this.appAgent.workflow.transitionTo('Validation');
      
      const claudeResponse = await this.appAgent.claude.processUserInput(
        `Continue workflow ${workflowId} with responses: ${JSON.stringify(input.responses)}`
      );

      return {
        success: true,
        data: claudeResponse
      };
    } catch (error) {
      return {
        success: false,
        error: `Workflow continuation failed: ${(error as Error).message}`
      };
    }
  }

  formatOutput(result: CliResult, format: string): string {
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'yaml':
        return yaml.stringify(result);
      
      case 'table':
        return this.formatAsTable(result);
      
      default:
        return JSON.stringify(result, null, 2);
    }
  }

  private formatAsTable(result: CliResult): string {
    if (!result.success) {
      const table = new Table({
        head: ['Status', 'Error'],
        colWidths: [20, 60]
      });
      table.push(['Failed', result.error || 'Unknown error']);
      return table.toString();
    }

    // Format data as table based on content
    if (result.data && result.data.resources) {
      const table = new Table({
        head: ['Resource Type', 'Category'],
        colWidths: [40, 20]
      });
      
      // Add core Kubernetes resources
      if (result.data.resources.core) {
        result.data.resources.core.forEach((resource: string) => {
          table.push([resource, 'Core']);
        });
      }
      
      // Add apps resources
      if (result.data.resources.apps) {
        result.data.resources.apps.forEach((resource: string) => {
          table.push([resource, 'Apps']);
        });
      }
      
      // Add custom resources (CRDs)
      if (result.data.crds && Array.isArray(result.data.crds)) {
        result.data.crds.forEach((crd: string) => {
          table.push([crd, 'Custom']);
        });
      }
      
      return table.toString();
    }

    // Generic table format
    const table = new Table({
      head: ['Property', 'Value'],
      colWidths: [30, 50]
    });

    if (result.data) {
      Object.entries(result.data).forEach(([key, value]) => {
        table.push([key, JSON.stringify(value)]);
      });
    }

    return table.toString();
  }

  private outputResult(result: CliResult, format: string): void {
    const formatted = this.formatOutput(result, format);
    console.log(formatted);
    
    if (!result.success) {
      process.exit(1);
    }
  }

  private handleError(error: any, command: string): CliResult {
    let errorMessage = (error as Error).message;
    
    // Provide helpful error messages for common issues
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('connection')) {
      errorMessage = 'Cannot connect to Kubernetes cluster. Check your kubeconfig and cluster status.';
    } else if (errorMessage.includes('Connection failed')) {
      errorMessage = `Failed to initialize App Agent: ${errorMessage}`;
    }

    return {
      success: false,
      error: errorMessage
    };
  }

  // CLI entry point
  async run(args: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(args);
    } catch (error) {
      console.error('CLI Error:', (error as Error).message);
      process.exit(1);
    }
  }
}

// Export for CLI entry point
export default CliInterface; 