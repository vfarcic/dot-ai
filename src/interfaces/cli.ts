/**
 * CLI Interface Module
 * 
 * Command-line interface for app-agent
 */

import { Command } from 'commander';
import { AppAgent } from '../core';
import * as yaml from 'js-yaml';
import Table from 'cli-table3';
import { ResourceRecommender, AIRankingConfig, formatRecommendationResponse } from '../core/schema';
import { ToolRegistry, ToolContext, initializeTools, registerAllTools } from '../tools';

export interface CliResult {
  success: boolean;
  data?: any;
  error?: string;
  warnings?: string[];
  _rawFormat?: boolean;
}

export interface ParsedArguments {
  command: string;
  options: Record<string, any>;
}

export interface CliConfig {
  defaultOutput?: string;
  verboseMode?: boolean;
  outputFile?: string;
  quietMode?: boolean;
}

export class CliInterface {
  private appAgent?: AppAgent;
  private program: Command;
  private config: CliConfig;
  private toolRegistry: ToolRegistry;

  constructor(appAgent?: AppAgent, config: CliConfig = {}) {
    this.appAgent = appAgent;
    this.config = config;
    this.program = new Command();
    this.toolRegistry = this.initializeToolsQuietly();
    this.program.name('app-agent').description('AI-powered Kubernetes deployment agent');
    
    // Add global options that apply to all commands
    this.program
      .option('--kubeconfig <path>', 'Path to kubeconfig file (overrides KUBECONFIG env var and default location)')
      .option('--verbose', 'Enable verbose output globally')
      .option('--output-file <path>', 'Write clean formatted output to file (respects --output format)')
      .option('--quiet', 'Suppress tool registration and info logs');
    
    this.setupCommands();
  }

  setAppAgent(appAgent: AppAgent): void {
    this.appAgent = appAgent;
  }

  private ensureAppAgent(): AppAgent {
    if (!this.appAgent) {
      throw new Error('Cluster connection required. Please ensure your kubeconfig is valid and cluster is accessible.');
    }
    return this.appAgent;
  }

  private setupCommands(): void {
    this.program
      .name('app-agent')
      .description('Kubernetes application deployment agent with AI-powered orchestration')
      .version('1.0.0');



    // Status command
    this.program
      .command('status')
      .description('Check deployment status')
      .option('--deployment <id>', 'Deployment/workflow ID to check')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('status', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // Learn command
    this.program
      .command('learn')
      .description('Show learned deployment patterns and recommendations')
      .option('--pattern <type>', 'Filter by pattern type')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('learn', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // Recommend command
    this.program
      .command('recommend')
      .description('Get AI-powered Kubernetes resource recommendations based on your intent')
      .requiredOption('--intent <description>', 'Describe what you want to deploy or accomplish')
      .option('--session-dir <path>', 'Directory to store solution files (defaults to APP_AGENT_SESSION_DIR env var)')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('recommend', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // Choose Solution command
    this.program
      .command('choose-solution')
      .description('Select a solution by ID and return its questions for configuration')
      .requiredOption('--solution-id <id>', 'Solution ID to choose (e.g., sol_2025-07-01T154349_1e1e242592ff)')
      .requiredOption('--session-dir <path>', 'Directory containing solution files')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('chooseSolution', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // Answer Question command
    this.program
      .command('answer-question')
      .description('Process user answers and return remaining questions or completion status')
      .requiredOption('--solution-id <id>', 'Solution ID to update (e.g., sol_2025-07-01T154349_1e1e242592ff)')
      .requiredOption('--session-dir <path>', 'Directory containing solution files')
      .requiredOption('--answers <json>', 'User answers as JSON object')
      .requiredOption('--stage <stage>', 'Configuration stage (required, basic, advanced, open)')
      .option('--done', 'Set when providing final open question answer', false)
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Parse answers JSON
        try {
          options.answers = JSON.parse(options.answers);
        } catch (error) {
          console.error('Error: Invalid JSON in --answers parameter');
          process.exit(1);
        }
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('answerQuestion', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // Generate Manifests command
    this.program
      .command('generate-manifests')
      .description('Generate Kubernetes manifests from solution configuration using AI')
      .requiredOption('--solution-id <id>', 'Solution ID to generate manifests for (e.g., sol_2025-07-01T154349_1e1e242592ff)')
      .requiredOption('--session-dir <path>', 'Directory containing solution files')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('generateManifests', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // Deploy Manifests command
    this.program
      .command('deploy-manifests')
      .description('Deploy Kubernetes manifests from generated solution')
      .requiredOption('--solution-id <id>', 'Solution ID to deploy')
      .requiredOption('--session-dir <path>', 'Session directory path')
      .option('--timeout <seconds>', 'Deployment timeout in seconds', '30')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options, command) => {
        // Get global options from parent command
        const globalOptions = command.parent?.opts() || {};
        this.processGlobalOptions(globalOptions);
        
        // Validate output format
        if (options.output && !['json', 'yaml', 'table'].includes(options.output)) {
          console.error('Error: Invalid output format. Supported: json, yaml, table');
          process.exit(1);
        }
        const result = await this.executeCommand('deployManifests', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json', this.config.outputFile);
      });

    // REMOVED: enhance command - moved to legacy reference
    // See src/legacy/tools/enhance-solution.ts for reference implementation
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
    // (no required option checks needed for current commands)

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
      case 'status':
        return [...commonOptions, 'deployment'];
      case 'learn':
        return [...commonOptions, 'pattern'];
      case 'recommend':
        return [...commonOptions, 'intent', 'session-dir'];
      case 'chooseSolution':
        return [...commonOptions, 'solution-id', 'session-dir'];
      case 'answerQuestion':
        return [...commonOptions, 'solution-id', 'session-dir', 'stage', 'answers', 'done'];
      case 'generateManifests':
        return [...commonOptions, 'solution-id', 'session-dir'];
      case 'deployManifests':
        return [...commonOptions, 'solution-id', 'session-dir', 'timeout'];
      // REMOVED: enhance command, deploy command
      default:
        return commonOptions;
    }
  }

  async executeCommand(command: string, options: Record<string, any> = {}): Promise<CliResult> {
    try {
      // Only initialize AppAgent for commands that need cluster access
      if (command !== 'chooseSolution' && command !== 'answerQuestion' && command !== 'generateManifests') {
        await this.ensureAppAgent().initialize();
      }

      switch (command) {
        case 'status':
          return await this.handleStatusCommand(options);
        case 'learn':
          return await this.handleLearnCommand(options);
        case 'recommend':
          return await this.handleRecommendCommand(options);
        case 'chooseSolution':
          return await this.handleChooseSolutionCommand(options);
        case 'answerQuestion':
          return await this.handleAnswerQuestionCommand(options);
        case 'generateManifests':
          return await this.handleGenerateManifestsCommand(options);
        case 'deployManifests':
          return await this.handleDeployManifestsCommand(options);
        // REMOVED: enhance command, deploy command
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



  private async handleStatusCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const phase = this.ensureAppAgent().workflow.getCurrentPhase();
      
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
      const recommendations = await this.ensureAppAgent().memory.getRecommendations(
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

  private async handleRecommendCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      // Show progress for long-running AI operations
      this.showProgress('🔍 Analyzing your intent and discovering cluster resources...');

      // Create tool context for the recommend tool
      const toolContext: ToolContext = {
        requestId: `cli-${Date.now()}`,
        logger: {
          debug: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`DEBUG: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          info: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`INFO: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          warn: (message: string, meta?: any) => {
            console.error(`WARN: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          error: (message: string, meta?: any) => {
            console.error(`ERROR: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          fatal: (message: string, meta?: any) => {
            console.error(`FATAL: ${message}`, meta ? JSON.stringify(meta) : '');
          }
        },
        appAgent: this.ensureAppAgent()
      };

      // Prepare arguments for the recommend tool including session directory
      const toolArgs = {
        intent: options.intent,
        sessionDir: options.sessionDir // This will be passed to our tool's getSessionDirectory function
      };

      this.showProgress('🤖 AI is analyzing resources and generating solutions...');

      // Execute the recommend tool through the registry
      const result = await this.toolRegistry.executeTool('recommend', toolArgs, toolContext);

      this.showProgress('✅ Recommendation complete!');
      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 500));
      this.clearProgress();

      // Parse the tool result
      const responseData = JSON.parse(result.content[0].text);

      return {
        success: true,
        data: responseData
      };
    } catch (error) {
      // Give a moment for user to see progress before clearing
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.clearProgress(); // Clear progress indicators on error
      return {
        success: false,
        error: `AI-powered recommendations failed: ${(error as Error).message}`
      };
    }
  }

  private async handleChooseSolutionCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      // Show progress for file operations
      this.showProgress('📋 Loading solution and extracting questions...');

      // Create tool context for the chooseSolution tool
      const toolContext: ToolContext = {
        requestId: `cli-${Date.now()}`,
        logger: {
          debug: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`DEBUG: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          info: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`INFO: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          warn: (message: string, meta?: any) => {
            console.error(`WARN: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          error: (message: string, meta?: any) => {
            console.error(`ERROR: Tool execution failed: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          fatal: (message: string, meta?: any) => {
            console.error(`FATAL: ${message}`, meta ? JSON.stringify(meta) : '');
          }
        },
        appAgent: this.appAgent || null
      };

      // Prepare arguments for the chooseSolution tool
      const toolArgs = {
        solutionId: options.solutionId,
        sessionDir: options.sessionDir
      };

      // Execute the chooseSolution tool through the registry
      const result = await this.toolRegistry.executeTool('chooseSolution', toolArgs, toolContext);

      this.showProgress('✅ Solution selected successfully!');
      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 500));
      this.clearProgress();

      // Parse the tool result
      const responseData = JSON.parse(result.content[0].text);

      return {
        success: true,
        data: responseData
      };
    } catch (error) {
      // Give a moment for user to see progress before clearing
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.clearProgress(); // Clear progress indicators on error
      return {
        success: false,
        error: `Choose solution failed: ${(error as Error).message}`
      };
    }
  }

  private async handleAnswerQuestionCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      // Show progress for file operations
      this.showProgress('📝 Processing answers and updating solution...');

      // Create tool context for the answerQuestion tool
      const toolContext: ToolContext = {
        requestId: `cli-${Date.now()}`,
        logger: {
          debug: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`DEBUG: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          info: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`INFO: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          warn: (message: string, meta?: any) => {
            console.error(`WARN: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          error: (message: string, meta?: any) => {
            console.error(`ERROR: Tool execution failed: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          fatal: (message: string, meta?: any) => {
            console.error(`FATAL: ${message}`, meta ? JSON.stringify(meta) : '');
          }
        },
        appAgent: this.appAgent || null
      };

      // Prepare arguments for the answerQuestion tool
      const toolArgs = {
        solutionId: options.solutionId,
        sessionDir: options.sessionDir,
        stage: options.stage,
        answers: options.answers,
        done: options.done || false
      };

      // Execute the answerQuestion tool through the registry
      const result = await this.toolRegistry.executeTool('answerQuestion', toolArgs, toolContext);

      this.showProgress('✅ Answers processed successfully!');
      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 500));
      this.clearProgress();

      // Parse the tool result
      const responseData = JSON.parse(result.content[0].text);

      return {
        success: true,
        data: responseData
      };
    } catch (error) {
      // Give a moment for user to see progress before clearing
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.clearProgress(); // Clear progress indicators on error
      return {
        success: false,
        error: `Answer question failed: ${(error as Error).message}`
      };
    }
  }

  private async handleGenerateManifestsCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      // Show progress for manifest generation
      this.showProgress('🤖 Generating Kubernetes manifests with AI...');

      // Create tool context for the generateManifests tool
      const toolContext: ToolContext = {
        requestId: `cli-${Date.now()}`,
        logger: {
          debug: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`DEBUG: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          info: (message: string, meta?: any) => {
            if (this.config.verboseMode) {
              console.error(`INFO: ${message}`, meta ? JSON.stringify(meta) : '');
            }
          },
          warn: (message: string, meta?: any) => {
            console.error(`WARN: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          error: (message: string, meta?: any) => {
            console.error(`ERROR: Tool execution failed: ${message}`, meta ? JSON.stringify(meta) : '');
          },
          fatal: (message: string, meta?: any) => {
            console.error(`FATAL: ${message}`, meta ? JSON.stringify(meta) : '');
          }
        },
        appAgent: this.appAgent || null
      };

      // Prepare arguments for the generateManifests tool
      const toolArgs = {
        solutionId: options.solutionId,
        sessionDir: options.sessionDir
      };

      // Execute the generateManifests tool through the registry
      const result = await this.toolRegistry.executeTool('generateManifests', toolArgs, toolContext);

      this.showProgress('✅ Manifests generated successfully!');
      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 500));
      this.clearProgress();

      // Parse the tool result
      const responseData = JSON.parse(result.content[0].text);

      return {
        success: true,
        data: responseData
      };
    } catch (error) {
      // Give a moment for user to see progress before clearing
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.clearProgress(); // Clear progress indicators on error
      return {
        success: false,
        error: `Manifest generation failed: ${(error as Error).message}`
      };
    }
  }

  private async handleDeployManifestsCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      // Show progress for deployment
      this.showProgress('🚀 Deploying Kubernetes manifests...');

      // Import and use DeployOperation directly
      const { DeployOperation } = await import('../core/deploy-operation');
      const deployOp = new DeployOperation();

      const sessionDir = options.sessionDir;
      
      const deployOptions = {
        solutionId: options.solutionId,
        sessionDir: sessionDir,
        timeout: parseInt(options.timeout) || 30
      };

      const result = await deployOp.deploy(deployOptions);

      this.clearProgress();

      return {
        success: result.success,
        data: {
          solutionId: result.solutionId,
          manifestPath: result.manifestPath,
          readinessTimeout: result.readinessTimeout,
          message: result.message,
          kubectlOutput: result.kubectlOutput
        }
      };
    } catch (error) {
      // Give a moment for user to see progress before clearing
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.clearProgress(); // Clear progress indicators on error
      return {
        success: false,
        error: `Manifest deployment failed: ${(error as Error).message}`
      };
    }
  }

  // REMOVED: handleEnhanceCommand method - moved to legacy reference
  // See src/legacy/tools/enhance-solution.ts for reference implementation

  async continueWorkflow(workflowId: string, input: { responses: Record<string, any> }): Promise<CliResult> {
    try {
      await this.ensureAppAgent().workflow.transitionTo('Validation');
      
      const claudeResponse = await this.ensureAppAgent().claude.processUserInput(
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
    // Handle raw format for commands that need it
    const isRawFormat = (result as any)._rawFormat;
    if (isRawFormat) {
      switch (format) {
        case 'json':
          return JSON.stringify(result.data, null, 2);
        case 'yaml':
          return yaml.dump(result.data);
        case 'table':
          return this.formatAsTable({ success: true, data: result.data });
        default:
          return JSON.stringify(result.data, null, 2);
      }
    }

    // Standard CLI format for other commands
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'yaml':
        return yaml.dump(result);
      
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
    if (result.data && (result.data.resources || result.data.crds)) {
      const table = new Table({
        head: ['Resource Type', 'Category'],
        colWidths: [40, 20]
      });
      
      // Add discovered resources
      if (result.data.resources && result.data.resources.resources) {
        result.data.resources.resources.forEach((resource: any) => {
          const category = resource.group === '' ? 'Core' : resource.group;
          table.push([resource.kind, category]);
        });
      }
      
      // Add custom resources (CRDs) - handle both string and object formats
      if (result.data.crds && Array.isArray(result.data.crds)) {
        result.data.crds.forEach((crd: any) => {
          const crdName = typeof crd === 'string' ? crd : crd.name;
          table.push([crdName, 'Custom']);
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

  private outputResult(result: CliResult, format: string, outputFile?: string): void {
    const output = this.formatOutput(result, format);
    
    if (outputFile) {
      // Write clean output to file
      const fs = require('fs');
      const path = require('path');
      
      // Ensure directory exists
      const dir = path.dirname(outputFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(outputFile, output);
    } else {
      // Write to stdout
      process.stdout.write(`${output}\n`);
    }
    
    if (!result.success) {
      process.exit(1);
    }
  }

  /**
   * Process global options and update config
   */
  private processGlobalOptions(options: Record<string, any>): void {
    if (options.verbose !== undefined) {
      this.config.verboseMode = options.verbose;
    }
    if (options.outputFile !== undefined) {
      this.config.outputFile = options.outputFile;
    }
    if (options.quiet !== undefined) {
      this.config.quietMode = options.quiet;
    }
  }

  /**
   * Initialize tools with appropriate logging level
   */
  private initializeToolsQuietly(): ToolRegistry {
    // Create a quiet logger that only logs errors
    const quietLogger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (message: string, error?: Error) => {
        console.error(`ERROR: ${message}`, error ? error.message : '');
      },
      fatal: (message: string, error?: Error) => {
        console.error(`FATAL: ${message}`, error ? error.message : '');
      }
    };

    // Create registry with quiet logger
    const registry = new ToolRegistry({ logger: quietLogger });
    
    // Register tools manually (avoiding the registerAllTools function that has its own logger)
    const { recommendToolDefinition, recommendToolHandler } = require('../tools/recommend');
    const { canHelpToolDefinition, canHelpToolHandler } = require('../tools/can-help');
    const { chooseSolutionToolDefinition, chooseSolutionToolHandler } = require('../tools/choose-solution');
    const { answerQuestionToolDefinition, answerQuestionToolHandler } = require('../tools/answer-question');
    const { generateManifestsToolDefinition, generateManifestsToolHandler } = require('../tools/generate-manifests');
    
    registry.registerTool(recommendToolDefinition, recommendToolHandler);
    registry.registerTool(canHelpToolDefinition, canHelpToolHandler);
    registry.registerTool(chooseSolutionToolDefinition, chooseSolutionToolHandler);
    registry.registerTool(answerQuestionToolDefinition, answerQuestionToolHandler);
    registry.registerTool(generateManifestsToolDefinition, generateManifestsToolHandler);
    
    return registry;
  }

  private handleError(error: any, _command: string): CliResult {
    this.clearProgress(); // Clear any progress indicators on error
    
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

  /**
   * Show progress message to user during long-running operations
   */
  private showProgress(message: string): void {
    // Only show progress if output is going to console (not when piped or in JSON mode)
    if (process.stdout.isTTY) {
      process.stderr.write(`\r\x1b[K${message}`);
    }
  }

  /**
   * Clear progress indicators
   */
  private clearProgress(): void {
    if (process.stdout.isTTY) {
      process.stderr.write('\r\x1b[K');
    }
  }

  /**
   * Find best solutions with detailed progress feedback
   */
  private async findBestSolutionsWithProgress(
    recommender: ResourceRecommender,
    intent: string,
    discoverResourcesFn: () => Promise<any>,
    explainResourceFn: (resource: string) => Promise<any>
  ): Promise<any[]> {
    this.showProgress('🤖 AI is analyzing your intent...');
    
    // Start a timer to show elapsed time
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      this.showProgress(`🤖 AI analysis in progress... (${elapsed}s)`);
    }, 3000);

    try {
      // The ResourceRecommender handles the three phases internally:
      // 1. Resource discovery and selection
      // 2. Schema fetching and ranking  
      // 3. Question generation
      const solutions = await recommender.findBestSolutions(intent, discoverResourcesFn, explainResourceFn);
      
      clearInterval(progressInterval);
      return solutions;
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  // CLI entry point
  async run(args: string[] = process.argv): Promise<void> {
    try {
      await this.program.parseAsync(args);
    } catch (error) {
      const result = this.handleError(error, 'general');
      this.outputResult(result, 'json');
      process.exit(1);
    }
  }
}

// Export for CLI entry point
export default CliInterface; 