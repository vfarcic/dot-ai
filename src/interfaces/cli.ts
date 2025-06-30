/**
 * CLI Interface Module
 * 
 * Command-line interface for app-agent
 */

import { Command } from 'commander';
import { AppAgent } from '../core';
import * as yaml from 'js-yaml';
import Table from 'cli-table3';
import { ResourceRecommender, SolutionEnhancer, AIRankingConfig } from '../core/schema';

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
}

export class CliInterface {
  private appAgent?: AppAgent;
  private program: Command;
  private config: CliConfig;

  constructor(appAgent?: AppAgent, config: CliConfig = {}) {
    this.appAgent = appAgent;
    this.config = config;
    this.program = new Command();
    this.program.name('app-agent').description('AI-powered Kubernetes deployment agent');
    
    // Add global options that apply to all commands
    this.program
      .option('--kubeconfig <path>', 'Path to kubeconfig file (overrides KUBECONFIG env var and default location)')
      .option('--verbose', 'Enable verbose output globally');
    
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

    // Recommend command
    this.program
      .command('recommend')
      .description('Get AI-powered Kubernetes resource recommendations based on your intent')
      .requiredOption('--intent <description>', 'Describe what you want to deploy or accomplish')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options) => {
        const result = await this.executeCommand('recommend', options);
        this.outputResult(result, options.output || this.config.defaultOutput || 'json');
      });

    // Enhance command
    this.program
      .command('enhance')
      .description('Enhance a solution by processing open-ended user response from solution JSON file')
      .requiredOption('--solution <path>', 'Path to solution JSON file containing open.answer field')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options) => {
        const result = await this.executeCommand('enhance', options);
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
      case 'recommend':
        return [...commonOptions, 'intent'];
      case 'enhance':
        return [...commonOptions, 'solution'];
      default:
        return commonOptions;
    }
  }

  async executeCommand(command: string, options: Record<string, any> = {}): Promise<CliResult> {
    try {
      // Always ensure AppAgent is initialized for command execution
      await this.ensureAppAgent().initialize();

      switch (command) {
        case 'deploy':
          return await this.handleDeployCommand(options);
        case 'status':
          return await this.handleStatusCommand(options);
        case 'learn':
          return await this.handleLearnCommand(options);
        case 'recommend':
          return await this.handleRecommendCommand(options);
        case 'enhance':
          return await this.handleEnhanceCommand(options);
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


  private async handleDeployCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const workflowId = await this.ensureAppAgent().workflow.initializeWorkflow({
        appName: options.app,
        requirements: options.requirements
      });

      const phase = this.ensureAppAgent().workflow.getCurrentPhase();

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
        const claudeResponse = await this.ensureAppAgent().claude.processUserInput(
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
      // Get Claude API key from AppAgent
      const claudeApiKey = this.ensureAppAgent().getAnthropicApiKey();
      if (!claudeApiKey) {
        return {
          success: false,
          error: 'ANTHROPIC_API_KEY environment variable must be set for AI-powered resource recommendations'
        };
      }

      // Show progress for long-running AI operations
      this.showProgress('🔍 Analyzing your intent and discovering cluster resources...');

      // Initialize AI-powered ResourceRecommender
      const rankingConfig: AIRankingConfig = { claudeApiKey };
      const recommender = new ResourceRecommender(rankingConfig);

      // Create discovery functions with progress callbacks
      const discoverResourcesFn = async () => {
        this.showProgress('🔍 Discovering available Kubernetes resources...');
        return await this.ensureAppAgent().discovery.discoverResources();
      };
      
      const explainResourceFn = async (resource: string) => {
        this.showProgress(`📋 Analyzing ${resource} schema and capabilities...`);
        return await this.ensureAppAgent().discovery.explainResource(resource);
      };

      this.showProgress('🤖 AI is selecting the best resources for your intent...');

      // Find best solutions for the user intent using functional approach
      const solutions = await this.findBestSolutionsWithProgress(
        recommender, 
        options.intent, 
        discoverResourcesFn, 
        explainResourceFn
      );

      this.showProgress('✅ Recommendation complete!');
      // Small delay to show completion message
      await new Promise(resolve => setTimeout(resolve, 500));
      this.clearProgress();

      return {
        success: true,
        data: {
          intent: options.intent,
          solutions: solutions.map(solution => ({
            type: solution.type,
            score: solution.score,
            description: solution.description,
            reasons: solution.reasons,
            analysis: solution.analysis,
            resources: solution.resources.map((r: any) => ({
              kind: r.kind,
              apiVersion: r.apiVersion,
              group: r.group,
              description: r.description
            })),
            questions: solution.questions
          })),
          summary: {
            totalSolutions: solutions.length,
            bestScore: solutions[0]?.score || 0,
            recommendedSolution: solutions[0]?.type || 'none',
            topResource: solutions[0]?.resources[0]?.kind || 'none'
          }
        }
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

  private async handleEnhanceCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      // Get Claude API key from AppAgent
      const claudeApiKey = this.ensureAppAgent().getAnthropicApiKey();
      if (!claudeApiKey) {
        return {
          success: false,
          error: 'ANTHROPIC_API_KEY environment variable must be set for AI-powered solution enhancement'
        };
      }

      // Read the solution file
      const fs = await import('fs');
      let solutionData: any;
      
      try {
        const solutionContent = fs.readFileSync(options.solution, 'utf8');
        solutionData = JSON.parse(solutionContent);
      } catch (error) {
        return {
          success: false,
          error: `Failed to read solution file: ${(error as Error).message}`
        };
      }

      // Extract open response from the solution JSON
      const openResponse = solutionData.questions?.open?.answer;
      if (!openResponse) {
        return {
          success: false,
          error: 'No open response found in solution file. Please add an "answer" field to the "open" question.'
        };
      }

      this.showProgress('🔍 Analyzing enhancement request...');

      // Initialize SolutionEnhancer
      const rankingConfig: AIRankingConfig = { claudeApiKey };
      const enhancer = new SolutionEnhancer(rankingConfig);

      // Get available resources for context
      const availableResources = await this.ensureAppAgent().discovery.discoverResources();

      this.showProgress('🤖 AI is enhancing your solution...');

      // Create explainResource function
      const explainResourceFn = async (resource: string) => {
        return await this.ensureAppAgent().discovery.explainResource(resource);
      };

      // Enhance the solution
      const enhancedSolution = await enhancer.enhanceSolution(
        solutionData,
        openResponse,
        availableResources,
        explainResourceFn
      );

      this.showProgress('✅ Enhancement complete!');
      await new Promise(resolve => setTimeout(resolve, 500));
      this.clearProgress();

      return {
        success: true,
        data: enhancedSolution,
        _rawFormat: true  // Special flag for raw output
      };
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.clearProgress();
      return {
        success: false,
        error: `Solution enhancement failed: ${(error as Error).message}`
      };
    }
  }

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
    // Handle raw format for enhance command (return just the data without CLI wrapper)
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

  private outputResult(result: CliResult, format: string): void {
    const output = this.formatOutput(result, format);
    process.stdout.write(`${output}\n`);
    
    if (!result.success) {
      process.exit(1);
    }
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