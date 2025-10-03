/**
 * Generate Manifests Tool - AI-driven manifest generation with validation loop
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { ensureClusterConnection } from '../core/cluster-utils';
import { ManifestValidator, ValidationResult } from '../core/schema';
import * as fs from 'fs';
import * as path from 'path';
import { loadPrompt } from '../core/shared-prompt-loader';
import * as yaml from 'js-yaml';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import { extractUserAnswers, addDotAiLabels, sanitizeKubernetesName } from '../core/solution-utils';

// Tool metadata for direct MCP registration
export const GENERATEMANIFESTS_TOOL_NAME = 'generateManifests';
export const GENERATEMANIFESTS_TOOL_DESCRIPTION = 'Generate final Kubernetes manifests from fully configured solution (ONLY after completing ALL stages: required, basic, advanced, and open)';

// Zod schema for MCP registration
export const GENERATEMANIFESTS_TOOL_INPUT_SCHEMA = {
  solutionId: z.string().regex(/^sol_[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}_[a-f0-9]+$/).describe('The solution ID to generate manifests for (e.g., sol_2025-07-01T154349_1e1e242592ff)')
};




interface ErrorContext {
  attempt: number;
  previousManifests: string;
  validationResult: ValidationResult;
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
 * Retrieve schemas for resources specified in the solution
 */
async function retrieveResourceSchemas(solution: any, dotAI: DotAI, logger: Logger): Promise<any> {
  try {
    // Extract resource references from solution
    const resourceRefs = (solution.resources || []).map((resource: any) => ({
      kind: resource.kind,
      apiVersion: resource.apiVersion,
      group: resource.group
    }));
    
    if (resourceRefs.length === 0) {
      logger.warn('No resources found in solution for schema retrieval');
      return {};
    }
    
    logger.info('Retrieving schemas for solution resources', {
      resourceCount: resourceRefs.length,
      resources: resourceRefs.map((r: any) => `${r.kind}@${r.apiVersion}`)
    });
    
    const schemas: any = {};
    
    // Retrieve schema for each resource
    for (const resourceRef of resourceRefs) {
      try {
        const resourceKey = `${resourceRef.kind}.${resourceRef.apiVersion}`;
        logger.debug('Retrieving schema', { resourceKey });
        
        // Use discovery engine to explain the resource
        const explanation = await dotAI.discovery.explainResource(resourceRef.kind);
        
        schemas[resourceKey] = {
          kind: resourceRef.kind,
          apiVersion: resourceRef.apiVersion,
          schema: explanation,
          timestamp: new Date().toISOString()
        };
        
        logger.debug('Schema retrieved successfully', { 
          resourceKey,
          schemaLength: explanation.length 
        });
        
      } catch (error) {
        logger.error('Failed to retrieve schema for resource', error as Error, {
          resource: resourceRef
        });
        
        // Fail fast - if we can't get schemas, manifest generation will likely fail
        throw new Error(`Failed to retrieve schema for ${resourceRef.kind}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    logger.info('All resource schemas retrieved successfully', {
      schemaCount: Object.keys(schemas).length
    });
    
    return schemas;
    
  } catch (error) {
    logger.error('Schema retrieval failed', error as Error);
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
 * Validate manifests using multi-layer approach
 */
async function validateManifests(yamlPath: string): Promise<ValidationResult> {
  // First check if file exists
  if (!fs.existsSync(yamlPath)) {
    return {
      valid: false,
      errors: [`Manifest file not found: ${yamlPath}`],
      warnings: []
    };
  }
  
  // Read YAML content for syntax validation
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  
  // 1. YAML syntax validation
  const syntaxCheck = validateYamlSyntax(yamlContent);
  if (!syntaxCheck.valid) {
    return {
      valid: false,
      errors: [`YAML syntax error: ${syntaxCheck.error}`],
      warnings: []
    };
  }
  
  // 2. kubectl dry-run validation using ManifestValidator
  const validator = new ManifestValidator();
  return await validator.validateManifest(yamlPath, { dryRunMode: 'server' });
}

/**
 * Generate manifests using AI provider
 */
async function generateManifestsWithAI(
  solution: any, 
  dotAI: DotAI,
  logger: Logger,
  errorContext?: ErrorContext,
  dotAiLabels?: Record<string, string>
): Promise<string> {
  
  // Load prompt template
  const template = loadPrompt('manifest-generation');
  
  // Retrieve schemas for solution resources
  const resourceSchemas = await retrieveResourceSchemas(solution, dotAI, logger);
  
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
**Validation Errors**: ${errorContext.validationResult.errors.join(', ')}
**Validation Warnings**: ${errorContext.validationResult.warnings.join(', ')}
` : 'None - this is the first attempt.';
  
  // Replace template variables
  const schemasData = JSON.stringify(resourceSchemas, null, 2);
  const labelsData = dotAiLabels ? JSON.stringify(dotAiLabels, null, 2) : '{}';
  const aiPrompt = template
    .replace('{solution}', solutionData)
    .replace('{schemas}', schemasData)
    .replace('{previous_attempt}', previousAttempt)
    .replace('{error_details}', errorDetails)
    .replace('{labels}', labelsData);
  
  const isRetry = !!errorContext;
  logger.info('Generating manifests with AI', {
    isRetry,
    attempt: errorContext?.attempt,
    hasErrorContext: !!errorContext,
    solutionId: solution.solutionId
  });

  // Get AI provider from dotAI
  const aiProvider = dotAI.ai;

  // Send prompt to AI
  const response = await aiProvider.sendMessage(aiPrompt);
  
  // Extract YAML content from response
  let manifestContent = response.content;
  
  // Try to extract YAML from code blocks if wrapped
  const yamlBlockMatch = manifestContent.match(/```(?:yaml|yml)?\s*([\s\S]*?)\s*```/);
  if (yamlBlockMatch) {
    manifestContent = yamlBlockMatch[1];
  }
  
  // Clean up any leading/trailing whitespace
  manifestContent = manifestContent.trim();
  
  logger.info('AI manifest generation completed', {
    manifestLength: manifestContent.length,
    isRetry,
    solutionId: solution.solutionId
  });

  return manifestContent;
}

/**
 * Generate dot-ai application metadata ConfigMap
 */
function generateMetadataConfigMap(solution: any, userAnswers: Record<string, any>, logger: Logger): string {
  const appName = userAnswers.name;
  const namespace = userAnswers.namespace || 'default';
  const solutionId = solution.solutionId;
  const originalIntent = solution.intent;
  
  // Validate required fields (will throw if missing)
  const dotAiLabels = addDotAiLabels(undefined, userAnswers, solution);
  
  // Extract resource references from solution
  const resources = (solution.resources || []).map((resource: any) => ({
    apiVersion: resource.apiVersion,
    kind: resource.kind,
    name: resource.name || appName, // Use app name as fallback
    namespace: resource.namespace || namespace
  }));
  
  // Create ConfigMap object
  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: sanitizeKubernetesName(`dot-ai-app-${appName}-${solutionId}`),
      namespace: namespace,
      labels: dotAiLabels,
      annotations: {
        'dot-ai.io/original-intent': originalIntent
      }
    },
    data: {
      'deployment-info.yaml': yaml.dump({
        appName,
        deployedAt: new Date().toISOString(),
        originalIntent,
        resources
      })
    }
  };
  
  try {
    return yaml.dump(configMap);
  } catch (error) {
    logger.error('Failed to generate YAML for ConfigMap', error as Error, {
      configMap,
      appName,
      solutionId,
      namespace
    });
    throw new Error(`ConfigMap YAML generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Direct MCP tool handler for generateManifests functionality
 */
export async function handleGenerateManifestsTool(
  args: { solutionId: string },
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      const maxAttempts = 10;
      
      logger.debug('Handling generateManifests request', { 
        requestId, 
        solutionId: args?.solutionId 
      });

      // Input validation is handled automatically by MCP SDK with Zod schema
      // args are already validated and typed when we reach this point
      
      // Get session directory from environment
      let sessionDir: string;
      try {
        sessionDir = getAndValidateSessionDirectory(args, true); // requireWrite=true for manifest generation
        logger.debug('Session directory resolved and validated', { sessionDir });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Session directory validation failed',
          {
            operation: 'session_directory_validation',
            component: 'GenerateManifestsTool',
            requestId,
            suggestedActions: [
              'Ensure session directory exists and is writable',
              'Check directory permissions',
              'Verify the directory path is correct',
              'Verify DOT_AI_SESSION_DIR environment variable is correctly set'
            ]
          }
        );
      }
      
      // Ensure cluster connectivity before proceeding
      await ensureClusterConnection(dotAI, logger, requestId, 'GenerateManifestsTool');
      
      // Load solution file
      let solution: any;
      try {
        solution = loadSolutionFile(args.solutionId, sessionDir);
        logger.debug('Solution file loaded successfully', { 
          solutionId: args.solutionId,
          hasQuestions: !!solution.questions,
          primaryResources: solution.resources
        });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.STORAGE,
          ErrorSeverity.HIGH,
          error instanceof Error ? error.message : 'Failed to load solution file',
          {
            operation: 'solution_file_load',
            component: 'GenerateManifestsTool',
            requestId,
            input: { solutionId: args.solutionId, sessionDir },
            suggestedActions: [
              'Check that the solution ID is correct',
              'Verify the solution file exists in the session directory',
              'Ensure the solution was fully configured with all stages complete',
              'List available solution files in the session directory'
            ]
          }
        );
      }
      
      // Prepare file path for manifests
      const yamlPath = path.join(sessionDir, `${args.solutionId}.yaml`);
      
      // AI generation and validation loop
      let lastError: ErrorContext | undefined;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logger.info('AI manifest generation attempt', { 
          attempt, 
          maxAttempts, 
          isRetry: attempt > 1,
          requestId 
        });
        
        try {
          // Extract user answers and generate required labels
          const userAnswers = extractUserAnswers(solution);
          const dotAiLabels = addDotAiLabels(undefined, userAnswers, solution);
          
          // Generate manifests with AI (including labels)
          const aiManifests = await generateManifestsWithAI(
            solution, 
            dotAI,
            logger,
            lastError,
            dotAiLabels
          );
          
          // Generate metadata ConfigMap
          const metadataConfigMap = generateMetadataConfigMap(solution, userAnswers, logger);
          
          // Combine ConfigMap with AI-generated manifests
          const manifests = metadataConfigMap + '---\n' + aiManifests;
          
          // Save manifests to file
          fs.writeFileSync(yamlPath, manifests, 'utf8');
          logger.info('Manifests saved to file', { yamlPath, attempt, requestId });
          
          // Save a copy of this attempt for debugging
          const attemptPath = yamlPath.replace('.yaml', `_attempt_${attempt.toString().padStart(2, '0')}.yaml`);
          fs.writeFileSync(attemptPath, manifests, 'utf8');
          logger.info('Saved manifest attempt for debugging', { 
            attempt, 
            attemptPath,
            requestId 
          });
          
          // Validate manifests
          const validation = await validateManifests(yamlPath);
          
          if (validation.valid) {
            logger.info('Manifest validation successful', { 
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
                type: 'text' as const,
                text: JSON.stringify(response, null, 2)
              }]
            };
          }
          
          // Validation failed, prepare error context for next attempt
          lastError = {
            attempt,
            previousManifests: manifests,
            validationResult: validation
          };
          
          logger.warn('Manifest validation failed', {
            attempt,
            maxAttempts,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
            requestId
          });
          
        } catch (error) {
          logger.error('Error during manifest generation attempt', error as Error);
          
          // Check if this is a validation error that should not be retried
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const isValidationError = errorMessage.includes('Application name is required') || 
                                   errorMessage.includes('Application intent is required');
          
          // If this is a validation error or the last attempt, throw the error immediately
          if (isValidationError || attempt === maxAttempts) {
            throw error;
          }
          
          // Prepare error context for retry
          lastError = {
            attempt,
            previousManifests: lastError?.previousManifests || '',
            validationResult: {
              valid: false,
              errors: [errorMessage],
              warnings: []
            }
          };
        }
      }
      
      // If we reach here, all attempts failed
      throw new Error(`Failed to generate valid manifests after ${maxAttempts} attempts. Last errors: ${lastError?.validationResult.errors.join(', ')}`);
    },
    {
      operation: 'generate_manifests',
      component: 'GenerateManifestsTool',
      requestId,
      input: args
    }
  );
}

