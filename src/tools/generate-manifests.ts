/**
 * Generate Manifests Tool - AI-driven manifest generation with validation loop
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { ClaudeIntegration } from '../core/claude';
import { AppAgent } from '../core/index';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { spawn } from 'child_process';

// MCP Tool Definition - sessionDir configured via environment
export const generateManifestsToolDefinition: ToolDefinition = {
  name: 'generateManifests',
  description: 'Generate final Kubernetes manifests from configured solution data and user requirements using AI',
  inputSchema: {
    type: 'object',
    properties: {
      solutionId: {
        type: 'string',
        description: 'The solution ID to generate manifests for (e.g., sol_2025-07-01T154349_1e1e242592ff)',
        pattern: '^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$'
      }
    },
    required: ['solutionId']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'manifests', 'deployment', 'yaml', 'ai'],
  instructions: 'Generate production-ready Kubernetes manifests using AI with validation loop. Session directory is configured via APP_AGENT_SESSION_DIR environment variable.'
};

// CLI Tool Definition - sessionDir required as parameter
export const generateManifestsCLIDefinition: ToolDefinition = {
  name: 'generateManifests',
  description: 'Generate final Kubernetes manifests from configured solution data and user requirements using AI',
  inputSchema: {
    type: 'object',
    properties: {
      solutionId: {
        type: 'string',
        description: 'The solution ID to generate manifests for (e.g., sol_2025-07-01T154349_1e1e242592ff)',
        pattern: '^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$'
      },
      sessionDir: {
        type: 'string',
        description: 'Session directory containing solution files (required for CLI)',
        minLength: 1
      }
    },
    required: ['solutionId', 'sessionDir']
  },
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'manifests', 'deployment', 'yaml', 'ai'],
  instructions: 'Generate production-ready Kubernetes manifests using AI with validation loop. Use --session-dir parameter to specify session directory.'
};

interface ValidationResult {
  success: boolean;
  yamlSyntaxValid: boolean;
  kubectlOutput?: string;
  exitCode?: number;
  stderr?: string;
  stdout?: string;
  error?: string;
}

interface ErrorContext {
  attempt: number;
  previousManifests: string;
  yamlSyntaxValid: boolean;
  kubectlOutput?: string;
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}

/**
 * Validate session directory exists and is accessible
 */
function validateSessionDirectory(sessionDir: string): void {
  try {
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session directory does not exist: ${sessionDir}`);
    }
    
    const stat = fs.statSync(sessionDir);
    if (!stat.isDirectory()) {
      throw new Error(`Session directory path is not a directory: ${sessionDir}`);
    }
    
    fs.accessSync(sessionDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    if (error instanceof Error && error.message.includes('EACCES')) {
      throw new Error(`Session directory is not readable/writable: ${sessionDir}`);
    }
    throw error;
  }
}

/**
 * Validate solution ID format
 */
function validateSolutionId(solutionId: string): void {
  const pattern = /^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$/;
  if (!pattern.test(solutionId)) {
    throw new Error(`Invalid solution ID format: ${solutionId}. Expected format: sol_YYYY-MM-DDTHHMMSS_hexstring`);
  }
}

/**
 * Load solution file and validate structure
 */
function loadSolutionFile(solutionId: string, sessionDir: string): any {
  const solutionPath = path.join(sessionDir, `${solutionId}.json`);
  
  if (!fs.existsSync(solutionPath)) {
    throw new Error(`Solution file not found: ${solutionPath}. Available files: ${fs.readdirSync(sessionDir).filter(f => f.endsWith('.json')).join(', ')}`);
  }
  
  try {
    const content = fs.readFileSync(solutionPath, 'utf8');
    const solution = JSON.parse(content);
    
    if (!solution.solutionId || !solution.questions) {
      throw new Error(`Invalid solution file structure: ${solutionId}. Missing required fields: solutionId or questions`);
    }
    
    return solution;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in solution file: ${solutionId}`);
    }
    throw error;
  }
}

/**
 * Get session directory from environment or arguments
 */
function getSessionDirectory(args: any, context: ToolContext): string {
  if (args.sessionDir) {
    return args.sessionDir;
  }
  
  const envSessionDir = process.env.APP_AGENT_SESSION_DIR;
  if (!envSessionDir) {
    throw new Error('Session directory not configured. Set APP_AGENT_SESSION_DIR environment variable or provide --session-dir parameter');
  }
  
  return envSessionDir;
}

/**
 * Retrieve schemas for resources specified in the solution
 */
async function retrieveResourceSchemas(solution: any, context: ToolContext): Promise<any> {
  try {
    // Extract resource references from solution
    const resourceRefs = (solution.resources || []).map((resource: any) => ({
      kind: resource.kind,
      apiVersion: resource.apiVersion,
      group: resource.group
    }));
    
    if (resourceRefs.length === 0) {
      context.logger.warn('No resources found in solution for schema retrieval');
      return {};
    }
    
    context.logger.info('Retrieving schemas for solution resources', {
      resourceCount: resourceRefs.length,
      resources: resourceRefs.map((r: any) => `${r.kind}@${r.apiVersion}`)
    });
    
    // Initialize AppAgent to get cluster connection (similar to how other tools do it)
    const appAgent = new AppAgent();
    await appAgent.initialize();
    
    const schemas: any = {};
    
    // Retrieve schema for each resource
    for (const resourceRef of resourceRefs) {
      try {
        const resourceKey = `${resourceRef.kind}.${resourceRef.apiVersion}`;
        context.logger.debug('Retrieving schema', { resourceKey });
        
        // Use discovery engine to explain the resource
        const explanation = await appAgent.discovery.explainResource(resourceRef.kind);
        
        schemas[resourceKey] = {
          kind: resourceRef.kind,
          apiVersion: resourceRef.apiVersion,
          schema: explanation,
          timestamp: new Date().toISOString()
        };
        
        context.logger.debug('Schema retrieved successfully', { 
          resourceKey,
          fieldCount: explanation.fields.length 
        });
        
      } catch (error) {
        context.logger.error('Failed to retrieve schema for resource', error as Error, {
          resource: resourceRef
        });
        
        // Fail fast - if we can't get schemas, manifest generation will likely fail
        throw new Error(`Failed to retrieve schema for ${resourceRef.kind}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    context.logger.info('All resource schemas retrieved successfully', {
      schemaCount: Object.keys(schemas).length
    });
    
    return schemas;
    
  } catch (error) {
    context.logger.error('Schema retrieval failed', error as Error);
    throw new Error(`Failed to retrieve resource schemas: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate YAML syntax
 */
function validateYamlSyntax(yamlContent: string): { valid: boolean; error?: string } {
  try {
    yaml.loadAll(yamlContent);
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Unknown YAML syntax error'
    };
  }
}

/**
 * Run kubectl dry-run validation
 */
async function runKubectlDryRun(yamlPath: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const kubectl = spawn('kubectl', ['apply', '--dry-run=server', '-f', yamlPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    kubectl.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    kubectl.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    kubectl.on('close', (code) => {
      resolve({
        success: code === 0,
        yamlSyntaxValid: true, // If we get here, YAML was parseable
        kubectlOutput: stderr || stdout,
        exitCode: code || 0,
        stderr,
        stdout
      });
    });
    
    kubectl.on('error', (error) => {
      resolve({
        success: false,
        yamlSyntaxValid: true,
        error: `Failed to run kubectl: ${error.message}`,
        kubectlOutput: `kubectl command failed: ${error.message}`,
        exitCode: -1,
        stderr: error.message,
        stdout: ''
      });
    });
  });
}

/**
 * Validate manifests using multi-layer approach
 */
async function validateManifests(yamlPath: string): Promise<ValidationResult> {
  // First check if file exists
  if (!fs.existsSync(yamlPath)) {
    return {
      success: false,
      yamlSyntaxValid: false,
      error: `Manifest file not found: ${yamlPath}`
    };
  }
  
  // Read YAML content
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  
  // 1. YAML syntax validation
  const syntaxCheck = validateYamlSyntax(yamlContent);
  if (!syntaxCheck.valid) {
    return {
      success: false,
      yamlSyntaxValid: false,
      error: `YAML syntax error: ${syntaxCheck.error}`,
      kubectlOutput: `YAML parsing failed: ${syntaxCheck.error}`
    };
  }
  
  // 2. kubectl dry-run validation
  return await runKubectlDryRun(yamlPath);
}

/**
 * Generate manifests using AI with Claude integration
 */
async function generateManifestsWithAI(
  solution: any, 
  context: ToolContext,
  errorContext?: ErrorContext
): Promise<string> {
  
  // Load prompt template
  const promptPath = path.join(process.cwd(), 'prompts', 'manifest-generation.md');
  const template = fs.readFileSync(promptPath, 'utf8');
  
  // Retrieve schemas for solution resources
  const resourceSchemas = await retrieveResourceSchemas(solution, context);
  
  // Prepare template variables
  const solutionData = JSON.stringify(solution, null, 2);
  const previousAttempt = errorContext ? `
### Generated Manifests:
\`\`\`yaml
${errorContext.previousManifests}
\`\`\`
` : 'None - this is the first attempt.';
  
  const errorDetails = errorContext ? `
**Attempt**: ${errorContext.attempt}
**YAML Syntax Valid**: ${errorContext.yamlSyntaxValid}
**kubectl Output**: ${errorContext.kubectlOutput}
**Exit Code**: ${errorContext.exitCode}
**Error Details**: ${errorContext.stderr}
` : 'None - this is the first attempt.';
  
  // Replace template variables
  const schemasData = JSON.stringify(resourceSchemas, null, 2);
  const aiPrompt = template
    .replace('{solution}', solutionData)
    .replace('{schemas}', schemasData)
    .replace('{previous_attempt}', previousAttempt)
    .replace('{error_details}', errorDetails);
  
  const isRetry = !!errorContext;
  context.logger.info('Generating manifests with AI', {
    isRetry,
    attempt: errorContext?.attempt,
    hasErrorContext: !!errorContext,
    solutionId: solution.solutionId
  });

  // Initialize Claude integration
  const apiKey = process.env.ANTHROPIC_API_KEY || 'test-key';
  const claudeIntegration = new ClaudeIntegration(apiKey);
  
  // Send prompt to Claude
  const response = await claudeIntegration.sendMessage(aiPrompt);
  
  // Extract YAML content from response
  let manifestContent = response.content;
  
  // Try to extract YAML from code blocks if wrapped
  const yamlBlockMatch = manifestContent.match(/```(?:yaml|yml)?\s*([\s\S]*?)\s*```/);
  if (yamlBlockMatch) {
    manifestContent = yamlBlockMatch[1];
  }
  
  // Clean up any leading/trailing whitespace
  manifestContent = manifestContent.trim();
  
  context.logger.info('AI manifest generation completed', {
    manifestLength: manifestContent.length,
    isRetry,
    solutionId: solution.solutionId
  });

  return manifestContent;
}

/**
 * Generate Manifests Tool Handler
 */
export const generateManifestsToolHandler: ToolHandler = async (args, context: ToolContext) => {
  try {
    const requestId = `gm-${Date.now()}`;
    const maxAttempts = 10;
    
    context.logger.info('Starting AI-driven manifest generation', { 
      solutionId: args.solutionId, 
      requestId 
    });
    
    // Validate inputs
    validateSolutionId(args.solutionId);
    const sessionDir = getSessionDirectory(args, context);
    validateSessionDirectory(sessionDir);
    
    // Load solution file
    const solution = loadSolutionFile(args.solutionId, sessionDir);
    context.logger.info('Solution loaded successfully', { 
      solutionId: args.solutionId,
      hasQuestions: !!solution.questions,
      primaryResources: solution.resources,
      requestId
    });
    
    // Prepare file path for manifests
    const yamlPath = path.join(sessionDir, `${args.solutionId}.yaml`);
    
    // AI generation and validation loop
    let lastError: ErrorContext | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      context.logger.info('AI manifest generation attempt', { 
        attempt, 
        maxAttempts, 
        isRetry: attempt > 1,
        requestId 
      });
      
      try {
        // Generate manifests with AI
        const manifests = await generateManifestsWithAI(
          solution, 
          context, 
          lastError
        );
        
        // Save manifests to file
        fs.writeFileSync(yamlPath, manifests, 'utf8');
        context.logger.info('Manifests saved to file', { yamlPath, attempt, requestId });
        
        // Save a copy of this attempt for debugging
        const attemptPath = yamlPath.replace('.yaml', `_attempt_${attempt.toString().padStart(2, '0')}.yaml`);
        fs.writeFileSync(attemptPath, manifests, 'utf8');
        context.logger.info('Saved manifest attempt for debugging', { 
          attempt, 
          attemptPath,
          requestId 
        });
        
        // Validate manifests
        const validation = await validateManifests(yamlPath);
        
        if (validation.success) {
          context.logger.info('Manifest validation successful', { 
            attempt, 
            yamlPath,
            requestId 
          });
          
          // Success! Return the validated manifests
          const response = {
            success: true,
            status: 'manifests_generated',
            solutionId: args.solutionId,
            manifests: manifests,
            yamlPath: yamlPath,
            validationAttempts: attempt,
            timestamp: new Date().toISOString()
          };
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }]
          };
        }
        
        // Validation failed, prepare error context for next attempt
        lastError = {
          attempt,
          previousManifests: manifests,
          yamlSyntaxValid: validation.yamlSyntaxValid,
          kubectlOutput: validation.kubectlOutput,
          exitCode: validation.exitCode,
          stderr: validation.stderr,
          stdout: validation.stdout
        };
        
        context.logger.warn('Manifest validation failed', {
          attempt,
          maxAttempts,
          yamlSyntaxValid: validation.yamlSyntaxValid,
          kubectlOutput: validation.kubectlOutput,
          requestId
        });
        
      } catch (error) {
        context.logger.error('Error during manifest generation attempt', error as Error);
        
        // If this is the last attempt, throw the error
        if (attempt === maxAttempts) {
          throw error;
        }
        
        // Prepare error context for retry
        lastError = {
          attempt,
          previousManifests: lastError?.previousManifests || '',
          yamlSyntaxValid: false,
          kubectlOutput: error instanceof Error ? error.message : 'Unknown error',
          exitCode: -1,
          stderr: error instanceof Error ? error.message : 'Unknown error',
          stdout: ''
        };
      }
    }
    
    // If we reach here, all attempts failed
    throw new Error(`Failed to generate valid manifests after ${maxAttempts} attempts. Last error: ${lastError?.kubectlOutput}`);
  } catch (error) {
    context.logger.error('Generate manifests tool execution failed', error as Error);
    throw error;
  }
};