/**
 * CLI Interface Module
 * 
 * Command-line interface for app-agent
 */

import { Command } from 'commander';
import { AppAgent } from '../core';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import Table from 'cli-table3';
import { SchemaParser, ManifestValidator, ResourceRanker, AIRankingConfig } from '../core/schema';

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
    this.program.name('app-agent').description('AI-powered Kubernetes deployment agent');
    
    // Add global options that apply to all commands
    this.program
      .option('--kubeconfig <path>', 'Path to kubeconfig file (overrides KUBECONFIG env var and default location)')
      .option('--verbose', 'Enable verbose output globally');
    
    this.setupCommands();
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

    // Schema command
    this.program
      .command('schema')
      .description('Parse and display resource schema information with AI-powered ranking')
      .option('--resource <name>', 'Resource name to get schema for (e.g., deployment, pod)')
      .option('--api-version <version>', 'API version (e.g., apps/v1, v1). If not specified, will show available versions')
      .option('--list-versions', 'List all available API versions for the resource')
      .option('--validate <file>', 'Validate a YAML manifest file against the resource schema')
      .option('--rank', 'Enable AI-powered resource ranking and recommendation')
      .option('--intent <description>', 'Describe your intent for AI-powered resource recommendations (required with --rank)')
      .option('--output <format>', 'Output format (json|yaml|table)', 'json')
      .action(async (options) => {
        const result = await this.executeCommand('schema', options);
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
      case 'schema':
        return [...commonOptions, 'resource', 'api-version', 'list-versions', 'validate', 'rank', 'intent'];
      default:
        return commonOptions;
    }
  }

  async executeCommand(command: string, options: Record<string, any> = {}): Promise<CliResult> {
    try {
      // Always ensure AppAgent is initialized for command execution
      await this.appAgent.initialize();

      switch (command) {
        case 'deploy':
          return await this.handleDeployCommand(options);
        case 'status':
          return await this.handleStatusCommand(options);
        case 'learn':
          return await this.handleLearnCommand(options);
        case 'schema':
          return await this.handleSchemaCommand(options);
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

  private async handleSchemaCommand(options: Record<string, any>): Promise<CliResult> {
    try {
      const parser = new SchemaParser();
      
      // Handle validation if --validate option is provided
      if (options.validate) {
        if (!options.resource) {
          return {
            success: false,
            error: 'Resource type must be specified with --resource when using --validate'
          };
        }

        // Read and parse the manifest file
        let manifestContent: any;
        try {
          const fileContent = fs.readFileSync(options.validate, 'utf8');
          manifestContent = yaml.load(fileContent);
        } catch (error) {
          return {
            success: false,
            error: `Failed to read or parse manifest file: ${(error as Error).message}`
          };
        }

        // Get the resource schema
        let targetApiVersion = options.apiVersion;
        
        if (!targetApiVersion) {
          // Try to get API version from the manifest
          if (manifestContent && manifestContent.apiVersion) {
            targetApiVersion = manifestContent.apiVersion;
          } else {
            // If no API version specified, try to find the resource
            const resources = await this.appAgent.discovery.discoverResources();
            const allResources = [...resources.resources, ...resources.custom];
            
            const matchingResources = allResources.filter(r => 
              r.name.toLowerCase() === options.resource.toLowerCase() ||
              r.kind.toLowerCase() === options.resource.toLowerCase()
            );

            if (matchingResources.length === 0) {
              return {
                success: false,
                error: `No resources found matching '${options.resource}'. Check cluster connectivity and resource name.`
              };
            }

            if (matchingResources.length > 1) {
              return {
                success: false,
                error: `Multiple API versions found for '${options.resource}'. Please specify --api-version <version>.`
              };
            }

            const resource = matchingResources[0];
            if ('apiVersion' in resource) {
              targetApiVersion = resource.apiVersion;
            } else {
              targetApiVersion = resource.group ? `${resource.group}/${resource.version}` : resource.version;
            }
          }
        }

        // Get resource explanation and parse schema
        const explanation = await this.appAgent.discovery.explainResource(options.resource, targetApiVersion);
        const schema = parser.parseResourceExplanation(explanation);

        // Validate the manifest using dry-run approach
        const validator = new ManifestValidator();
        let validationResult;
        
        // Get the kubeconfig from the AppAgent's configuration
        const kubeconfigPath = (this.appAgent as any).config?.kubernetesConfig;
        
        // Try server-side dry-run first (more accurate)
        validationResult = await validator.validateManifest(options.validate, { 
          dryRunMode: 'server',
          kubeconfig: kubeconfigPath 
        });
        
        // If server-side validation failed due to connection issues, try client-side
        if (!validationResult.valid && validationResult.errors.length > 0) {
          const errorMessage = validationResult.errors[0];
          if (errorMessage.includes('connection refused') || errorMessage.includes('timeout') || errorMessage.includes('Connection timeout')) {
            console.warn('Server-side validation failed, falling back to client-side validation...');
            validationResult = await validator.validateManifest(options.validate, { 
              dryRunMode: 'client',
              kubeconfig: kubeconfigPath 
            });
          }
        }

        return {
          success: validationResult.valid,
          data: {
            file: options.validate,
            resource: options.resource,
            apiVersion: targetApiVersion,
            validation: {
              valid: validationResult.valid,
              errors: validationResult.errors,
              warnings: validationResult.warnings
            },
            summary: {
              totalErrors: validationResult.errors.length,
              totalWarnings: validationResult.warnings.length,
              manifestKind: manifestContent?.kind,
              manifestApiVersion: manifestContent?.apiVersion
            }
          },
          warnings: validationResult.warnings
        };
      }

      // Handle list versions if requested
      if (options.listVersions) {
        if (!options.resource) {
          return {
            success: false,
            error: 'Resource must be specified with --resource when using --list-versions'
          };
        }

        const resources = await this.appAgent.discovery.discoverResources();
        const allResources = [...resources.resources, ...resources.custom];
        
        const matchingResources = allResources.filter(r => 
          r.name.toLowerCase() === options.resource.toLowerCase() ||
          r.kind.toLowerCase() === options.resource.toLowerCase()
        );

        if (matchingResources.length === 0) {
          return {
            success: false,
            error: `No resources found matching '${options.resource}'. Check cluster connectivity and resource name.`
          };
        }

        return {
          success: true,
          data: {
            resource: options.resource,
            versions: matchingResources.map(r => {
              if ('apiVersion' in r) {
                return {
                  apiVersion: r.apiVersion,
                  kind: r.kind,
                  group: r.group || 'core',
                  namespaced: r.namespaced
                };
              } else {
                return {
                  apiVersion: r.group ? `${r.group}/${r.version}` : r.version,
                  kind: r.kind,
                  group: r.group || 'core',
                  namespaced: r.scope === 'Namespaced'
                };
              }
            })
          }
        };
      }

      // Handle ranking if --rank option is provided (before resource validation)
      if (options.rank) {
        if (!options.intent) {
          return {
            success: false,
            error: 'Intent must be specified with --intent when using --rank option'
          };
        }

        // Get Claude API key from environment
        const claudeApiKey = process.env.ANTHROPIC_API_KEY;
        if (!claudeApiKey) {
          return {
            success: false,
            error: 'ANTHROPIC_API_KEY environment variable must be set for AI-powered resource ranking'
          };
        }

        try {
          // Initialize AI-powered ResourceRanker
          const rankingConfig: AIRankingConfig = { claudeApiKey };
          const ranker = new ResourceRanker(rankingConfig);

          // Create discovery functions
          const discoverResourcesFn = () => this.appAgent.discovery.discoverResources();
          const explainResourceFn = (resource: string) => this.appAgent.discovery.explainResource(resource);

          // Find best solutions for the user intent using functional approach
          const solutions = await ranker.findBestSolutions(options.intent, discoverResourcesFn, explainResourceFn);

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
                resources: solution.resources.map(r => ({
                  kind: r.kind,
                  apiVersion: r.apiVersion,
                  group: r.group,
                  description: r.description
                })),
                deploymentOrder: solution.deploymentOrder,
                dependencies: solution.dependencies
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
          return {
            success: false,
            error: `AI-powered ranking failed: ${(error as Error).message}`
          };
        }
      }

      // Handle regular schema parsing
      if (!options.resource) {
        return {
          success: false,
          error: 'Resource must be specified with --resource option'
        };
      }

      // Determine which API version to use
      let targetApiVersion = options.apiVersion;
      
      if (!targetApiVersion) {
        // If no API version specified, try to find the resource and suggest versions
        const resources = await this.appAgent.discovery.discoverResources();
        const allResources = [...resources.resources, ...resources.custom];
        
        const matchingResources = allResources.filter(r => 
          r.name.toLowerCase() === options.resource.toLowerCase() ||
          r.kind.toLowerCase() === options.resource.toLowerCase()
        );

        if (matchingResources.length === 0) {
          return {
            success: false,
            error: `No resources found matching '${options.resource}'. Check cluster connectivity and resource name.`
          };
        }

        if (matchingResources.length > 1) {
          return {
            success: false,
            error: `Multiple API versions found for '${options.resource}':\n${
              matchingResources.map(r => {
                if ('apiVersion' in r) {
                  // EnhancedResource
                  return `  - ${r.apiVersion} (${r.kind})`;
                } else {
                  // EnhancedCRD
                  return `  - ${r.group ? `${r.group}/${r.version}` : r.version} (${r.kind})`;
                }
              }).join('\n')
            }\nPlease specify --api-version <version> or use --list-versions to see all options.`
          };
        }

        // Use the single matching resource
        const resource = matchingResources[0];
        if ('apiVersion' in resource) {
          // EnhancedResource
          targetApiVersion = resource.apiVersion;
        } else {
          // EnhancedCRD
          targetApiVersion = resource.group ? `${resource.group}/${resource.version}` : resource.version;
        }
      }

      // Get resource explanation using the discovery engine
      const explanation = await this.appAgent.discovery.explainResource(options.resource, targetApiVersion);
      
      // Parse the explanation into a structured schema
      const schema = parser.parseResourceExplanation(explanation);

      // Convert Map to Object for JSON serialization
      const serializableSchema = {
        ...schema,
        properties: Object.fromEntries(
          Array.from(schema.properties.entries()).map(([key, field]) => [
            key,
            {
              ...field,
              nested: Object.fromEntries(field.nested)
            }
          ])
        )
      };

      return {
        success: true,
        data: {
          resource: options.resource,
          apiVersion: targetApiVersion,
          schema: serializableSchema,
          summary: {
            kind: schema.kind,
            apiVersion: schema.apiVersion,
            group: schema.group,
            version: schema.version,
            propertyCount: schema.properties.size,
            requiredFields: schema.required.length,
            namespaced: schema.namespace
          }
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Schema parsing failed: ${(error as Error).message}`
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
      const result = this.handleError(error, 'general');
      this.outputResult(result, 'json');
      process.exit(1);
    }
  }
}

// Export for CLI entry point
export default CliInterface; 