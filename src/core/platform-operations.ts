/**
 * Platform Operations Discovery
 *
 * Orchestrates tool-based discovery and mapping of Nu shell script operations.
 * All data fetching logic lives in tools, this module handles orchestration.
 */

import { AIProvider } from './ai-provider.interface';
import { Logger } from './error-handling';
import * as fs from 'fs';
import * as path from 'path';
import { execAsync, getScriptsDir, extractJsonFromAIResponse } from './platform-utils';
import { GenericSessionManager, GenericSession } from './generic-session-manager';

// Import Operation interfaces from the tool (single source of truth)
export { Operation, OperationCommand } from '../tools/platform/discover-operations.tool';

// Re-import for local use
import { Operation } from '../tools/platform/discover-operations.tool';

export interface MatchedOperation {
  tool: string;
  operation: string;
  command: string[];
  description: string;
}

export interface IntentMapping {
  matched: boolean;
  operation?: MatchedOperation;
  reason?: string;
}

export interface ParameterMetadata {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  required: boolean;
  description: string;
  default?: any;
  choices?: string[];
}

/**
 * Platform session data structure (stored in GenericSession.data)
 */
export interface PlatformSessionData {
  intent: string;
  matchedOperation: MatchedOperation;
  parameters: ParameterMetadata[];
  answers: Record<string, any>;
  currentStep: 'collectParameters' | 'confirm' | 'execute' | 'complete';
}

/**
 * Platform session (uses GenericSession pattern)
 */
export type PlatformSession = GenericSession<PlatformSessionData>;

/**
 * Discover available operations from Nu shell scripts
 * Uses tool for data fetching and prompt injection for AI parsing
 */
export async function discoverOperations(
  aiProvider: AIProvider,
  logger: Logger
): Promise<Operation[]> {
  try {
    // Import the tool execution function
    const { executeDiscoverOperations } = await import('../tools/platform/discover-operations.tool');

    // Execute tool directly to get help output
    const toolResult = await executeDiscoverOperations({}, aiProvider, logger);

    if (!toolResult.success || !toolResult.helpOutput) {
      throw new Error(toolResult.error || 'Failed to get Nu script help output');
    }

    // Load the parsing prompt template
    const promptPath = path.join(process.cwd(), 'prompts', 'platform-operations-parse-script-help.md');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    // Inject help output into prompt
    const prompt = promptTemplate.replace('{helpOutput}', toolResult.helpOutput);

    // Single AI call with injected data
    const response = await aiProvider.sendMessage(prompt, 'platform-discover-operations');

    // Parse operations from AI response
    const operations = extractJsonFromAIResponse(response.content);

    logger.info?.('Discovered operations from Nu scripts', {
      count: operations.length
    });

    return operations;
  } catch (error) {
    logger.error?.('Failed to discover operations', error as Error);
    throw error;
  }
}

/**
 * Map user intent to a specific operation using AI
 */
export async function mapIntentToOperation(
  intent: string,
  operations: Operation[],
  aiProvider: AIProvider,
  logger: Logger
): Promise<IntentMapping> {
  try {
    // Load AI prompt template for intent mapping
    const promptPath = path.join(process.cwd(), 'prompts', 'map-intent-to-operation.md');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');

    // Replace template variables
    const prompt = promptTemplate
      .replace('{intent}', intent)
      .replace('{operations}', JSON.stringify(operations, null, 2));

    // Send to AI provider for AI-powered intent matching
    const response = await aiProvider.sendMessage(prompt, 'platform-map-intent');

    // Extract JSON from AI response with robust parsing
    const mapping: IntentMapping = extractJsonFromAIResponse(response.content);

    // Validate that AI returned required fields
    if (mapping.matched && mapping.operation) {
      if (!mapping.operation.command || !Array.isArray(mapping.operation.command)) {
        throw new Error(`AI did not return valid command array. Response: ${JSON.stringify(mapping)}`);
      }
    }

    logger.info?.('Mapped user intent to operation', {
      intent,
      matched: mapping.matched,
      operation: mapping.operation?.tool,
      command: mapping.operation?.command
    });

    return mapping;
  } catch (error) {
    logger.error?.('Failed to map intent to operation', error as Error);
    throw error;
  }
}

/**
 * Get parameters for a specific operation using Nushell's structured JSON output
 */
export async function getOperationParameters(
  command: string[],
  logger: Logger
): Promise<ParameterMetadata[]> {
  try {
    // Build the full command name that Nushell expects
    const commandName = `main ${command.join(' ')}`;

    // Execute Nu script to get structured command metadata
    const scriptPath = path.join(getScriptsDir(), 'dot.nu');
    const nuCommand = `source ${scriptPath}; scope commands | where name == "${commandName}" | to json`;
    const { stdout, stderr } = await execAsync(`nu -c '${nuCommand}'`);

    if (stderr) {
      logger.warn?.('Nu scope commands produced stderr', { stderr });
    }

    // Parse JSON response
    const commands = JSON.parse(stdout);

    if (!commands || commands.length === 0) {
      logger.warn?.('No command metadata found', { commandName });
      return [];
    }

    const commandMetadata = commands[0];
    const signatures = commandMetadata.signatures?.any || [];

    // Filter and transform parameter data
    const parameters: ParameterMetadata[] = [];

    for (const param of signatures) {
      // Skip input/output parameters
      if (param.parameter_type === 'input' || param.parameter_type === 'output') {
        continue;
      }

      // Skip help parameter
      if (param.parameter_name === 'help') {
        continue;
      }

      // Map Nushell types to our types
      let type: 'string' | 'number' | 'boolean' | 'choice' = 'string';
      if (param.syntax_shape === 'bool') {
        type = 'boolean';
      } else if (param.syntax_shape === 'int') {
        type = 'number';
      } else if (param.syntax_shape === 'string') {
        type = 'string';
      }

      // Determine if required (positional parameters are typically required)
      const required = param.parameter_type === 'positional' && !param.is_optional;

      parameters.push({
        name: param.parameter_name,
        type,
        required,
        description: param.description || '',
        default: param.parameter_default
      });
    }

    logger.info?.('Retrieved operation parameters', {
      command: commandName,
      parameterCount: parameters.length
    });

    return parameters;
  } catch (error) {
    logger.error?.('Failed to get operation parameters', error as Error);
    throw error;
  }
}

/**
 * Create and persist a platform session using GenericSessionManager
 */
export async function createSession(
  intent: string,
  matchedOperation: MatchedOperation,
  parameters: ParameterMetadata[],
  logger: Logger
): Promise<PlatformSession> {
  try {
    const sessionManager = new GenericSessionManager<PlatformSessionData>('platform');

    const session = sessionManager.createSession({
      intent,
      matchedOperation,
      parameters,
      answers: {},
      currentStep: 'collectParameters'
    });

    logger.info?.('Created platform session', { sessionId: session.sessionId, intent });

    return session;
  } catch (error) {
    logger.error?.('Failed to create platform session', error as Error);
    throw error;
  }
}

/**
 * Load a platform session from file using GenericSessionManager
 */
export function loadSession(
  sessionId: string,
  logger: Logger
): PlatformSession | null {
  try {
    const sessionManager = new GenericSessionManager<PlatformSessionData>('platform');
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      logger.warn?.('Session file not found', { sessionId });
      return null;
    }

    logger.info?.('Loaded platform session', { sessionId });

    return session;
  } catch (error) {
    logger.error?.('Failed to load platform session', error as Error);
    throw error;
  }
}

/**
 * Execute a platform operation with collected parameters
 */
export async function executeOperation(
  session: PlatformSession,
  answers: Record<string, any>,
  logger: Logger
): Promise<{ success: boolean; message?: string; error?: string; missingParameters?: string[] }> {
  try {
    // Validate required parameters
    const missingRequired = session.data.parameters
      .filter(p => p.required && !(p.name in answers))
      .map(p => p.name);

    if (missingRequired.length > 0) {
      return {
        success: false,
        error: `Missing required parameters: ${missingRequired.join(', ')}`,
        missingParameters: missingRequired
      };
    }

    // Merge answers with defaults for optional parameters
    const finalAnswers = { ...answers };
    for (const param of session.data.parameters) {
      if (!(param.name in finalAnswers) && param.default !== undefined) {
        finalAnswers[param.name] = param.default;
      }
    }

    // Build Nu script command
    const scriptPath = path.join(getScriptsDir(), 'dot.nu');
    const command = session.data.matchedOperation.command;

    // Build command arguments
    const args: string[] = [];
    for (const param of session.data.parameters) {
      const value = finalAnswers[param.name];
      if (value !== undefined) {
        args.push(`--${param.name}`);
        args.push(String(value));
      }
    }

    const fullCommand = `nu ${scriptPath} ${command.join(' ')} ${args.join(' ')}`;

    logger.info?.('Executing platform operation', {
      sessionId: session.sessionId,
      command: fullCommand
    });

    const { stdout, stderr } = await execAsync(fullCommand);

    if (stderr) {
      logger.warn?.('Operation produced stderr', { stderr });
    }

    logger.info?.('Platform operation completed', {
      sessionId: session.sessionId,
      stdout: stdout.substring(0, 500) // Log first 500 chars
    });

    return {
      success: true,
      message: `Successfully executed ${session.data.matchedOperation.tool} ${session.data.matchedOperation.operation}`
    };
  } catch (error) {
    logger.error?.('Failed to execute platform operation', error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
