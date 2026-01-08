/**
 * Generate Manifests Tool - AI-driven manifest generation with validation loop
 * Supports both capability-based solutions (K8s manifests) and Helm-based solutions (values.yaml)
 */

import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI, maybeGetFeedbackMessage } from '../core/index';
import { Logger } from '../core/error-handling';
import { ensureClusterConnection } from '../core/cluster-utils';
import { ManifestValidator, ValidationResult } from '../core/schema';
import * as fs from 'fs';
import * as path from 'path';
import { loadPrompt } from '../core/shared-prompt-loader';
import * as yaml from 'js-yaml';
import { GenericSessionManager } from '../core/generic-session-manager';
import type { SolutionData } from './recommend';
import { extractUserAnswers, addDotAiLabels } from '../core/solution-utils';
import { extractContentFromMarkdownCodeBlocks } from '../core/platform-utils';
import { isSolutionCRDAvailable } from '../core/crd-availability';
import { generateSolutionCR } from '../core/solution-cr';
import { HelmChartInfo } from '../core/helm-types';
import {
  buildHelmCommand,
  validateHelmDryRun,
  getHelmValuesPath,
  ensureTmpDir
} from '../core/helm-utils';
import { packageManifests, OutputFormat } from '../core/packaging';
import { getVisualizationUrl } from '../core/visualization';

const execFileAsync = promisify(execFile);

// Tool metadata for direct MCP registration
export const GENERATEMANIFESTS_TOOL_NAME = 'generateManifests';
export const GENERATEMANIFESTS_TOOL_DESCRIPTION = 'Generate final Kubernetes manifests from fully configured solution (ONLY after completing ALL stages: required, basic, advanced, and open)';

// Zod schema for MCP registration
export const GENERATEMANIFESTS_TOOL_INPUT_SCHEMA = {
  solutionId: z.string().regex(/^sol-\d+-[a-f0-9]{8}$/).describe('The solution ID to generate manifests for (e.g., sol-1762983784617-9ddae2b8)'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};




interface ErrorContext {
  attempt: number;
  previousManifests: string;
  validationResult: ValidationResult;
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
 * Run helm lint on a chart directory
 */
async function helmLint(
  chartDir: string,
  logger: Logger
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  try {
    // Use execFile with array arguments to prevent command injection
    logger.debug('Running helm lint', { chartDir });

    const { stdout, stderr } = await execFileAsync('helm', ['lint', chartDir]);

    // Parse helm lint output for warnings
    const warnings: string[] = [];
    const lines = (stdout + stderr).split('\n');
    for (const line of lines) {
      if (line.includes('[WARNING]')) {
        warnings.push(line.trim());
      }
    }

    logger.debug('helm lint passed', { warnings: warnings.length });
    return { valid: true, errors: [], warnings };

  } catch (error) {
    // helm lint exits with non-zero on errors
    const errorOutput = error instanceof Error ? (error as any).stderr || error.message : String(error);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Parse output for errors and warnings
    const lines = errorOutput.split('\n');
    for (const line of lines) {
      if (line.includes('[ERROR]')) {
        errors.push(line.trim());
      } else if (line.includes('[WARNING]')) {
        warnings.push(line.trim());
      }
    }

    // If no specific errors found, use the full output
    if (errors.length === 0) {
      errors.push(errorOutput.trim());
    }

    logger.warn('helm lint failed', { errors, warnings });
    return { valid: false, errors, warnings };
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
  solutionId: string,
  dotAI: DotAI,
  logger: Logger,
  errorContext?: ErrorContext,
  dotAiLabels?: Record<string, string>,
  interaction_id?: string
): Promise<string> {

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

  // Prepare template variables
  const schemasData = JSON.stringify(resourceSchemas, null, 2);
  const labelsData = dotAiLabels ? JSON.stringify(dotAiLabels, null, 2) : '{}';
  const aiPrompt = loadPrompt('capabilities-generation', {
    solution: solutionData,
    schemas: schemasData,
    previous_attempt: previousAttempt,
    error_details: errorDetails,
    labels: labelsData
  });

  const isRetry = !!errorContext;
  logger.info('Generating manifests with AI', {
    isRetry,
    attempt: errorContext?.attempt,
    hasErrorContext: !!errorContext,
    solutionId
  });

  // Get AI provider from dotAI
  const aiProvider = dotAI.ai;

  // Send prompt to AI
  const response = await aiProvider.sendMessage(aiPrompt, 'recommend-manifests-generation', {
    user_intent: solution.initialIntent || 'Kubernetes manifest generation',
    interaction_id: interaction_id
  });
  
  // Extract YAML content from response
  // Use shared utility to extract from code blocks if wrapped
  const manifestContent = extractContentFromMarkdownCodeBlocks(response.content, 'yaml');
  
  logger.info('AI manifest generation completed', {
    manifestLength: manifestContent.length,
    isRetry,
    solutionId
  });

  return manifestContent;
}

/**
 * Error context for Helm validation retries
 */
interface HelmErrorContext {
  attempt: number;
  previousValues: string;
  validationResult: ValidationResult;
}

/**
 * Generate Helm values.yaml using AI provider
 */
async function generateHelmValuesWithAI(
  solution: any,
  solutionId: string,
  dotAI: DotAI,
  logger: Logger,
  errorContext?: HelmErrorContext,
  interaction_id?: string
): Promise<string> {
  // Fetch chart values.yaml for reference
  const chart: HelmChartInfo = solution.chart;
  const { valuesYaml } = await dotAI.schema.fetchHelmChartContent(chart);

  // Prepare template variables
  const solutionData = JSON.stringify(solution, null, 2);
  const previousAttempt = errorContext ? `
### Generated Values:
\`\`\`yaml
${errorContext.previousValues}
\`\`\`
` : 'None - this is the first attempt.';

  const errorDetails = errorContext ? `
**Attempt**: ${errorContext.attempt}
**Validation Errors**: ${errorContext.validationResult.errors.join(', ')}
**Validation Warnings**: ${errorContext.validationResult.warnings.join(', ')}
` : 'None - this is the first attempt.';

  const aiPrompt = loadPrompt('helm-generation', {
    solution: solutionData,
    chart_values: valuesYaml || '# No default values available',
    previous_attempt: previousAttempt,
    error_details: errorDetails
  });

  const isRetry = !!errorContext;
  logger.info('Generating Helm values with AI', {
    isRetry,
    attempt: errorContext?.attempt,
    hasErrorContext: !!errorContext,
    solutionId,
    chart: `${chart.repositoryName}/${chart.chartName}`
  });

  // Get AI provider from dotAI
  const aiProvider = dotAI.ai;

  // Send prompt to AI
  const response = await aiProvider.sendMessage(aiPrompt, 'helm-values-generation', {
    user_intent: solution.intent || 'Helm chart installation',
    interaction_id: interaction_id
  });

  // Extract YAML content from response
  const valuesContent = extractContentFromMarkdownCodeBlocks(response.content, 'yaml');

  logger.info('AI Helm values generation completed', {
    valuesLength: valuesContent.length,
    isRetry,
    solutionId
  });

  return valuesContent;
}

/**
 * Validate Helm installation using dry-run (wrapper around shared utility)
 */
async function validateHelmInstallation(
  chart: HelmChartInfo,
  releaseName: string,
  namespace: string,
  valuesPath: string,
  logger: Logger
): Promise<ValidationResult> {
  logger.info('Running Helm dry-run validation', {
    chart: `${chart.repositoryName}/${chart.chartName}`,
    releaseName,
    namespace
  });

  const result = await validateHelmDryRun(chart, releaseName, namespace, valuesPath);

  if (result.success) {
    logger.info('Helm dry-run validation successful');
    return {
      valid: true,
      errors: [],
      warnings: []
    };
  }

  logger.warn('Helm dry-run validation failed', { error: result.error });
  return {
    valid: false,
    errors: [result.error || 'Unknown Helm validation error'],
    warnings: []
  };
}

/**
 * Handle Helm solution generation
 */
async function handleHelmGeneration(
  solution: any,
  solutionId: string,
  dotAI: DotAI,
  logger: Logger,
  requestId: string,
  sessionManager: GenericSessionManager<SolutionData>,
  interaction_id?: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const maxAttempts = 10;
  const chart: HelmChartInfo = solution.chart;
  const userAnswers = extractUserAnswers(solution);

  // Extract release name and namespace from answers
  const releaseName = userAnswers.name;
  const namespace = userAnswers.namespace || 'default';

  if (!releaseName) {
    throw ErrorHandler.createError(
      ErrorCategory.VALIDATION,
      ErrorSeverity.HIGH,
      'Release name (name) is required for Helm installation',
      {
        operation: 'helm_generation',
        component: 'GenerateManifestsTool',
        requestId,
        suggestedActions: ['Ensure the "name" question was answered in the configuration']
      }
    );
  }

  // Prepare file paths using shared utilities
  ensureTmpDir();
  const valuesPath = getHelmValuesPath(solutionId);

  // AI generation and validation loop
  let lastError: HelmErrorContext | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info('Helm values generation attempt', {
      attempt,
      maxAttempts,
      isRetry: attempt > 1,
      requestId,
      chart: `${chart.repositoryName}/${chart.chartName}`
    });

    try {
      // Generate values.yaml with AI
      const valuesYaml = await generateHelmValuesWithAI(
        solution,
        solutionId,
        dotAI,
        logger,
        lastError,
        interaction_id
      );

      // Save values to file
      fs.writeFileSync(valuesPath, valuesYaml, 'utf8');
      logger.info('Helm values saved to file', { valuesPath, attempt, requestId });

      // Save attempt for debugging
      const attemptPath = valuesPath.replace('.yaml', `_attempt_${attempt.toString().padStart(2, '0')}.yaml`);
      fs.writeFileSync(attemptPath, valuesYaml, 'utf8');

      // Validate with helm dry-run
      const validation = await validateHelmInstallation(
        chart,
        releaseName,
        namespace,
        valuesPath,
        logger
      );

      if (validation.valid) {
        logger.info('Helm validation successful', {
          attempt,
          valuesPath,
          requestId
        });

        // Build user-friendly helm command with generic values file path
        // (internal valuesPath is used for actual execution, not shown to user)
        const helmCommand = buildHelmCommand(chart, releaseName, namespace, 'values.yaml');

        // Check if we should show feedback message
        const feedbackMessage = maybeGetFeedbackMessage();

        // PRD #320: Update session with generateManifests data for visualization
        sessionManager.updateSession(solutionId, {
          ...solution,
          stage: 'generateManifests',
          generatedManifests: {
            type: 'helm',
            valuesYaml: valuesYaml,
            helmCommand: helmCommand,
            chart: {
              repository: chart.repository,
              repositoryName: chart.repositoryName,
              chartName: chart.chartName,
              version: chart.version
            },
            releaseName: releaseName,
            namespace: namespace,
            validationAttempts: attempt
          }
        });

        // PRD #320: Generate visualization URL
        const visualizationUrl = getVisualizationUrl(solutionId);

        const response = {
          success: true,
          status: 'helm_command_generated',
          solutionId: solutionId,
          solutionType: 'helm',
          helmCommand: helmCommand,
          valuesYaml: valuesYaml,
          chart: {
            repository: chart.repository,
            repositoryName: chart.repositoryName,
            chartName: chart.chartName,
            version: chart.version
          },
          releaseName: releaseName,
          namespace: namespace,
          validationAttempts: attempt,
          timestamp: new Date().toISOString(),
          ...(visualizationUrl && { visualizationUrl })
        };

        // PRD #320: Return two content blocks - JSON for REST API, text instruction for MCP agents
        const content: Array<{ type: 'text'; text: string }> = [{
          type: 'text' as const,
          text: JSON.stringify(response, null, 2)
        }];

        if (visualizationUrl) {
          content.push({
            type: 'text' as const,
            text: `📊 **View visualization**: ${visualizationUrl}`
          });
        }

        // PRD #326: Add feedback message as separate content block so agents display it to users
        if (feedbackMessage) {
          content.push({
            type: 'text' as const,
            text: feedbackMessage
          });
        }

        return { content };
      }

      // Validation failed, prepare error context for next attempt
      lastError = {
        attempt,
        previousValues: valuesYaml,
        validationResult: validation
      };

      logger.warn('Helm validation failed', {
        attempt,
        maxAttempts,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        requestId
      });

    } catch (error) {
      logger.error('Error during Helm values generation attempt', error as Error);

      if (attempt === maxAttempts) {
        throw error;
      }

      // Prepare error context for retry
      lastError = {
        attempt,
        previousValues: lastError?.previousValues || '',
        validationResult: {
          valid: false,
          errors: [error instanceof Error ? error.message : String(error)],
          warnings: []
        }
      };
    }
  }

  // All attempts failed
  throw new Error(`Failed to generate valid Helm values after ${maxAttempts} attempts. Last errors: ${lastError?.validationResult.errors.join(', ')}`);
}


/**
 * Render packaged output to raw YAML for validation
 */
async function renderPackageToYaml(
  packageDir: string,
  format: OutputFormat,
  logger: Logger
): Promise<{ success: boolean; yaml?: string; error?: string; isTerminalError?: boolean }> {
  try {
    // Use execFile with array arguments to prevent command injection
    const args = format === 'helm'
      ? ['template', 'test-release', packageDir]
      : ['kustomize', packageDir];
    const command = format === 'helm' ? 'helm' : 'kubectl';

    logger.debug('Rendering package to YAML', { format, command, args });
    const { stdout, stderr } = await execFileAsync(command, args);

    if (stderr && !stdout) {
      return { success: false, error: stderr };
    }

    return { success: true, yaml: stdout };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for terminal infrastructure errors that won't be fixed by AI retrying
    const terminalErrorPatterns = [
      'not found',           // command not found
      'command not found',   // explicit command not found
      'ENOENT',              // file/command doesn't exist
      'permission denied',   // permission issues
      'EACCES',              // access denied
    ];

    const isTerminalError = terminalErrorPatterns.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );

    return {
      success: false,
      error: errorMessage,
      isTerminalError  // Signal to caller to not retry
    };
  }
}

/**
 * Write package files to a temporary directory
 */
function writePackageFiles(
  files: { relativePath: string; content: string }[],
  baseDir: string
): void {
  const resolvedBase = path.resolve(baseDir);

  for (const file of files) {
    const filePath = path.join(baseDir, file.relativePath);
    const resolvedPath = path.resolve(filePath);

    // Prevent path traversal attacks
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error(`Invalid file path: ${file.relativePath} would escape base directory`);
    }

    const fileDir = path.dirname(filePath);

    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, file.content, 'utf8');
  }
}

/**
 * Package manifests and validate the output
 */
async function packageAndValidate(
  rawManifests: string,
  solution: any,
  outputFormat: OutputFormat,
  outputPath: string,
  solutionId: string,
  dotAI: DotAI,
  logger: Logger,
  interaction_id?: string
): Promise<{ files: { relativePath: string; content: string }[]; attempts: number }> {
  const maxAttempts = 5;
  let packagingError: { attempt: number; previousOutput: string; validationError: string } | undefined;

  const tmpDir = path.join(process.cwd(), 'tmp');
  const packageDir = path.join(tmpDir, `${solutionId}-${outputFormat}`);

  // Helper to cleanup temp directory
  const cleanupPackageDir = () => {
    if (fs.existsSync(packageDir)) {
      try {
        fs.rmSync(packageDir, { recursive: true });
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp package directory', { packageDir, error: cleanupError });
      }
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info('Packaging attempt', { attempt, maxAttempts, format: outputFormat });

    try {
      const packagingResult = await packageManifests(
        rawManifests,
        solution,
        outputFormat,
        outputPath,
        dotAI,
        logger,
        packagingError,
        interaction_id
      );

      // Write files to temp directory
      if (fs.existsSync(packageDir)) {
        fs.rmSync(packageDir, { recursive: true });
      }
      fs.mkdirSync(packageDir, { recursive: true });
      writePackageFiles(packagingResult.files, packageDir);

      // Run helm lint for Helm charts (catches structural issues before rendering)
      if (outputFormat === 'helm') {
        const lintResult = await helmLint(packageDir, logger);
        if (!lintResult.valid) {
          packagingError = {
            attempt,
            previousOutput: JSON.stringify(packagingResult.files.map(f => f.relativePath)),
            validationError: `helm lint failed: ${lintResult.errors.join(', ')}`
          };
          logger.warn('helm lint failed', { attempt, errors: lintResult.errors });
          continue;
        }
        // Log warnings but don't fail on them
        if (lintResult.warnings.length > 0) {
          logger.info('helm lint warnings', { warnings: lintResult.warnings });
        }
      }

      // Render to raw YAML
      const renderResult = await renderPackageToYaml(packageDir, outputFormat, logger);
      if (!renderResult.success) {
        // Check for terminal infrastructure errors - fail fast, don't retry
        if (renderResult.isTerminalError) {
          const terminalError = new Error(`Infrastructure error (not retryable): ${renderResult.error}`);
          logger.error('Terminal infrastructure error - cannot retry', terminalError, {
            format: outputFormat
          });
          throw terminalError;
        }

        packagingError = {
          attempt,
          previousOutput: JSON.stringify(packagingResult.files.map(f => f.relativePath)),
          validationError: `Failed to render ${outputFormat}: ${renderResult.error}`
        };
        logger.warn('Package render failed', { attempt, error: renderResult.error });
        continue;
      }

      // Validate rendered YAML
      const renderedYamlPath = path.join(tmpDir, `${solutionId}-${outputFormat}-rendered.yaml`);
      if (!renderResult.yaml) {
        throw new Error('Render succeeded but no YAML content returned');
      }
      fs.writeFileSync(renderedYamlPath, renderResult.yaml, 'utf8');

      const validation = await validateManifests(renderedYamlPath);
      if (validation.valid) {
        logger.info('Package validation successful', { format: outputFormat, attempt });
        cleanupPackageDir();
        return { files: packagingResult.files, attempts: attempt };
      }

      packagingError = {
        attempt,
        previousOutput: JSON.stringify(packagingResult.files.map(f => f.relativePath)),
        validationError: validation.errors.join(', ')
      };
      logger.warn('Package validation failed', { attempt, errors: validation.errors });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Packaging attempt failed', error as Error);

      if (attempt === maxAttempts) {
        throw error;
      }

      packagingError = {
        attempt,
        previousOutput: packagingError?.previousOutput || '',
        validationError: errorMessage
      };
    }
  }

  cleanupPackageDir();
  throw new Error(`Failed to generate valid ${outputFormat} package after ${maxAttempts} attempts. Last error: ${packagingError?.validationError}`);
}


/**
 * Direct MCP tool handler for generateManifests functionality
 */
export async function handleGenerateManifestsTool(
  args: { solutionId: string; interaction_id?: string },
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

      // Initialize session manager
      const sessionManager = new GenericSessionManager<SolutionData>('sol');
      logger.debug('Session manager initialized', { requestId });

      // Ensure cluster connectivity before proceeding
      await ensureClusterConnection(dotAI, logger, requestId, 'GenerateManifestsTool');

      // Load solution session
      const session = sessionManager.getSession(args.solutionId);

      if (!session) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Solution not found: ${args.solutionId}`,
          {
            operation: 'solution_loading',
            component: 'GenerateManifestsTool',
            requestId,
            input: { solutionId: args.solutionId },
            suggestedActions: [
              'Verify the solution ID is correct',
              'Ensure the solution was created by the recommend tool',
              'Ensure all configuration stages were completed',
              'Check that the session has not expired'
            ]
          }
        );
      }

      const solution = session.data;
      logger.debug('Solution loaded successfully', {
        solutionId: args.solutionId,
        solutionType: solution.type,
        hasQuestions: !!solution.questions,
        primaryResources: solution.resources
      });

      // Branch based on solution type
      if (solution.type === 'helm') {
        logger.info('Detected Helm solution, using Helm generation flow', {
          solutionId: args.solutionId,
          chart: solution.chart ? `${solution.chart.repositoryName}/${solution.chart.chartName}` : 'unknown'
        });
        return await handleHelmGeneration(
          solution,
          args.solutionId,
          dotAI,
          logger,
          requestId,
          sessionManager,
          args.interaction_id
        );
      }

      // Capability-based solution: Generate Kubernetes manifests
      logger.info('Using capability-based manifest generation flow', {
        solutionId: args.solutionId
      });

      // Prepare file path for manifests (store in tmp directory)
      const tmpDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      const yamlPath = path.join(tmpDir, `${args.solutionId}.yaml`);
      
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
            args.solutionId,
            dotAI,
            logger,
            lastError,
            dotAiLabels,
            args.interaction_id
          );

          // Check if Solution CRD is available and generate Solution CR if present
          let solutionCR = '';
          try {
            const crdAvailable = await isSolutionCRDAvailable();
            if (crdAvailable) {
              solutionCR = generateSolutionCR({
                solutionId: args.solutionId,
                namespace: userAnswers.namespace || 'default',
                solution: solution,
                generatedManifestsYaml: aiManifests
              });
              logger.info('Solution CR generated successfully', { solutionId: args.solutionId });
            } else {
              logger.info('Solution CRD not available, skipping Solution CR generation (graceful degradation)', { solutionId: args.solutionId });
            }
          } catch (error) {
            logger.warn('Failed to check CRD availability or generate Solution CR, skipping', {
              solutionId: args.solutionId,
              error: error instanceof Error ? error.message : String(error)
            });
            // Graceful degradation - continue without Solution CR
          }

          // Combine all manifests (Solution CR + AI manifests)
          const manifestParts: string[] = [];
          if (solutionCR) {
            manifestParts.push(solutionCR);
          }
          manifestParts.push(aiManifests);
          const manifests = manifestParts.length > 1 ? manifestParts.join('---\n') : manifestParts[0];
          
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

            // Extract packaging options from user answers (with defaults)
            const outputFormat = (userAnswers.outputFormat || 'raw') as OutputFormat;
            const outputPath = userAnswers.outputPath || './manifests';
            const feedbackMessage = maybeGetFeedbackMessage();

            // Handle packaging based on outputFormat
            if (outputFormat === 'helm' || outputFormat === 'kustomize') {
              const packagingResult = await packageAndValidate(
                manifests,
                solution,
                outputFormat,
                outputPath,
                args.solutionId,
                dotAI,
                logger,
                args.interaction_id
              );

              // PRD #320: Update session with generateManifests data for visualization
              sessionManager.updateSession(args.solutionId, {
                ...solution,
                stage: 'generateManifests',
                generatedManifests: {
                  type: outputFormat,
                  outputPath,
                  files: packagingResult.files,
                  validationAttempts: attempt,
                  packagingAttempts: packagingResult.attempts
                }
              });

              // PRD #320: Generate visualization URL
              const visualizationUrl = getVisualizationUrl(args.solutionId);

              const response = {
                success: true,
                status: 'manifests_generated',
                solutionId: args.solutionId,
                outputFormat,
                outputPath,
                files: packagingResult.files,
                validationAttempts: attempt,
                packagingAttempts: packagingResult.attempts,
                timestamp: new Date().toISOString(),
                agentInstructions: `Write the files to "${outputPath}". The output is a ${outputFormat === 'helm' ? 'Helm chart' : 'Kustomize overlay'}. If immediate deployment is desired, call the recommend tool with stage: "deployManifests".`,
                ...(visualizationUrl && { visualizationUrl })
              };

              // PRD #320: Return two content blocks - JSON for REST API, text instruction for MCP agents
              const content: Array<{ type: 'text'; text: string }> = [{
                type: 'text' as const,
                text: JSON.stringify(response, null, 2)
              }];

              if (visualizationUrl) {
                content.push({
                  type: 'text' as const,
                  text: `📊 **View visualization**: ${visualizationUrl}`
                });
              }

              // PRD #326: Add feedback message as separate content block so agents display it to users
              if (feedbackMessage) {
                content.push({
                  type: 'text' as const,
                  text: feedbackMessage
                });
              }

              return { content };
            }

            // PRD #320: Update session with generateManifests data for visualization (raw format)
            sessionManager.updateSession(args.solutionId, {
              ...solution,
              stage: 'generateManifests',
              generatedManifests: {
                type: 'raw',
                outputPath,
                files: [{ relativePath: 'manifests.yaml', content: manifests }],
                validationAttempts: attempt
              }
            });

            // PRD #320: Generate visualization URL
            const visualizationUrl = getVisualizationUrl(args.solutionId);

            // Raw format - return manifests as-is
            const response = {
              success: true,
              status: 'manifests_generated',
              solutionId: args.solutionId,
              outputFormat,
              outputPath,
              files: [
                { relativePath: 'manifests.yaml', content: manifests }
              ],
              validationAttempts: attempt,
              timestamp: new Date().toISOString(),
              agentInstructions: `Write the files to "${outputPath}". If immediate deployment is desired, call the recommend tool with stage: "deployManifests".`,
              ...(visualizationUrl && { visualizationUrl })
            };

            // PRD #320: Return two content blocks - JSON for REST API, text instruction for MCP agents
            const content: Array<{ type: 'text'; text: string }> = [{
              type: 'text' as const,
              text: JSON.stringify(response, null, 2)
            }];

            if (visualizationUrl) {
              content.push({
                type: 'text' as const,
                text: `📊 **View visualization**: ${visualizationUrl}`
              });
            }

            // PRD #326: Add feedback message as separate content block so agents display it to users
            if (feedbackMessage) {
              content.push({
                type: 'text' as const,
                text: feedbackMessage
              });
            }

            return { content };
          }

          // Validation failed, prepare error context for next attempt
          // Only pass AI-generated manifests to avoid duplicates on retry
          lastError = {
            attempt,
            previousManifests: aiManifests,
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

