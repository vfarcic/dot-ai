/**
 * MCP Prompts Handler - Manages shared prompt library
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../core/error-handling';
import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
} from '../core/error-handling';
import { VALIDATION_MESSAGES } from '../core/constants/validation';

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMetadata {
  name: string;
  description: string;
  category: string;
  arguments?: PromptArgument[];
}

export interface Prompt {
  name: string;
  description: string;
  content: string;
  arguments?: PromptArgument[];
  source: 'built-in' | 'user';
}

/**
 * Parses YAML frontmatter with support for nested arguments array
 */
function parseYamlFrontmatter(yaml: string): Partial<PromptMetadata> {
  const metadata: Partial<PromptMetadata> = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for arguments array start
    if (line.match(/^arguments:\s*$/)) {
      const args: PromptArgument[] = [];
      i++;

      // Parse array items (lines starting with "  - ")
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        const arg: PromptArgument = { name: '' };

        // First line of array item: "  - name: value"
        const firstLineMatch = lines[i].match(/^\s+-\s+(\w+):\s*(.*)$/);
        if (firstLineMatch) {
          const [, key, value] = firstLineMatch;
          if (key === 'name') {
            arg.name = value.trim().replace(/^["']|["']$/g, '');
          } else if (key === 'description') {
            arg.description = value.trim().replace(/^["']|["']$/g, '');
          } else if (key === 'required') {
            arg.required = value.trim().toLowerCase() === 'true';
          }
        }
        i++;

        // Continue parsing properties of this array item (lines starting with "    ")
        while (i < lines.length && lines[i].match(/^\s{4,}\w+:/)) {
          const propMatch = lines[i].match(/^\s+(\w+):\s*(.*)$/);
          if (propMatch) {
            const [, key, value] = propMatch;
            if (key === 'name') {
              arg.name = value.trim().replace(/^["']|["']$/g, '');
            } else if (key === 'description') {
              arg.description = value.trim().replace(/^["']|["']$/g, '');
            } else if (key === 'required') {
              arg.required = value.trim().toLowerCase() === 'true';
            }
          }
          i++;
        }

        if (arg.name) {
          args.push(arg);
        }
      }

      if (args.length > 0) {
        metadata.arguments = args;
      }
    } else {
      // Simple key-value pair
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const cleanValue = value.trim().replace(/^["']|["']$/g, '');
        const trimmedKey = key.trim() as keyof PromptMetadata;
        if (trimmedKey !== 'arguments') {
          (metadata as Record<string, unknown>)[trimmedKey] = cleanValue;
        }
      }
      i++;
    }
  }

  return metadata;
}

/**
 * Loads and parses a prompt file with YAML frontmatter
 */
export function loadPromptFile(filePath: string, source: 'built-in' | 'user' = 'built-in'): Prompt {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      throw new Error(
        `Invalid prompt file format: missing YAML frontmatter in ${filePath}`
      );
    }

    const [, frontmatterYaml, promptContent] = frontmatterMatch;

    // Parse YAML with support for arguments array
    const metadata = parseYamlFrontmatter(frontmatterYaml);

    if (!metadata.name || !metadata.description || !metadata.category) {
      throw new Error(
        `Missing required metadata in ${filePath}: name, description, category`
      );
    }

    return {
      name: metadata.name,
      description: metadata.description,
      content: promptContent.trim(),
      arguments: metadata.arguments,
      source,
    };
  } catch (error) {
    throw new Error(
      `Failed to load prompt file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Loads built-in prompts from the shared-prompts directory
 */
export function loadBuiltInPrompts(logger: Logger, baseDir?: string): Prompt[] {
  try {
    const promptsDir =
      baseDir ?? path.join(__dirname, '..', '..', 'shared-prompts');

    if (!fs.existsSync(promptsDir)) {
      logger.warn('Shared prompts directory not found', { path: promptsDir });
      return [];
    }

    const files = fs.readdirSync(promptsDir);
    const promptFiles = files.filter(file => file.endsWith('.md'));

    const prompts: Prompt[] = [];

    for (const file of promptFiles) {
      try {
        const filePath = path.join(promptsDir, file);
        const prompt = loadPromptFile(filePath, 'built-in');
        prompts.push(prompt);
        logger.debug('Loaded built-in prompt', { name: prompt.name, file });
      } catch (error) {
        logger.error(`Failed to load prompt file ${file}`, error as Error);
      }
    }

    logger.info('Loaded built-in prompts from shared library', {
      total: prompts.length,
      promptsDir,
    });

    return prompts;
  } catch (error) {
    logger.error('Failed to load prompts directory', error as Error);
    return [];
  }
}

/**
 * Merge built-in and user prompts with collision detection
 * Built-in prompts take precedence over user prompts with the same name
 */
export function mergePrompts(
  builtInPrompts: Prompt[],
  userPrompts: Prompt[],
  logger: Logger
): Prompt[] {
  const builtInNames = new Set(builtInPrompts.map(p => p.name));
  const merged = [...builtInPrompts];

  for (const userPrompt of userPrompts) {
    if (builtInNames.has(userPrompt.name)) {
      logger.warn('User prompt name collision with built-in prompt, skipping user prompt', {
        name: userPrompt.name,
        message: 'Built-in prompt takes precedence',
      });
      continue;
    }
    merged.push(userPrompt);
  }

  return merged;
}

/**
 * Loads all prompts (built-in + user) with collision detection
 * This is the main entry point for loading prompts
 */
export async function loadAllPrompts(
  logger: Logger,
  baseDir?: string,
  forceRefresh: boolean = false
): Promise<Prompt[]> {
  // Load built-in prompts (synchronous)
  const builtInPrompts = loadBuiltInPrompts(logger, baseDir);

  // Load user prompts from git repository (async, graceful failure)
  let userPrompts: Prompt[] = [];
  try {
    const { loadUserPrompts } = await import('../core/user-prompts-loader.js');
    userPrompts = await loadUserPrompts(logger, forceRefresh);
  } catch (error) {
    logger.debug('User prompts loader not available or failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Merge with collision detection
  const allPrompts = mergePrompts(builtInPrompts, userPrompts, logger);

  logger.info('Loaded all prompts', {
    builtIn: builtInPrompts.length,
    user: userPrompts.length,
    total: allPrompts.length,
    collisions: builtInPrompts.length + userPrompts.length - allPrompts.length,
  });

  return allPrompts;
}

export interface PromptsListArgs {
  baseDir?: string;
}

interface PromptsListResponse {
  prompts: Array<{ name: string; description: string; arguments?: PromptArgument[] }>;
}

/**
 * Handle prompts/list MCP request
 */
export async function handlePromptsListRequest(
  args: PromptsListArgs | undefined,
  logger: Logger,
  requestId: string
): Promise<PromptsListResponse> {
  try {
    logger.info('Processing prompts/list request', { requestId });

    const prompts = await loadAllPrompts(
      logger,
      process.env.NODE_ENV === 'test' ? args?.baseDir : undefined
    );

    // Convert to MCP prompts/list response format (include arguments if present)
    const promptList = prompts.map(prompt => {
      const item: { name: string; description: string; arguments?: PromptArgument[] } = {
        name: prompt.name,
        description: prompt.description,
      };
      if (prompt.arguments && prompt.arguments.length > 0) {
        item.arguments = prompt.arguments;
      }
      return item;
    });

    logger.info('Prompts list generated', {
      requestId,
      promptCount: promptList.length,
    });

    return {
      prompts: promptList,
    };
  } catch (error) {
    logger.error('Prompts list request failed', error as Error);

    throw ErrorHandler.createError(
      ErrorCategory.OPERATION,
      ErrorSeverity.HIGH,
      error instanceof Error ? error.message : 'Unknown error in prompts list',
      {
        operation: 'prompts_list',
        component: 'PromptsHandler',
        requestId,
        input: args,
      }
    );
  }
}

interface PromptsGetArgs {
  name: string;
  arguments?: Record<string, string>;
  baseDir?: string;
}

interface PromptsGetResponse {
  description?: string;
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}

/**
 * Handle prompts/get MCP request
 */
export async function handlePromptsGetRequest(
  args: PromptsGetArgs,
  logger: Logger,
  requestId: string
): Promise<PromptsGetResponse> {
  try {
    logger.info('Processing prompts/get request', {
      requestId,
      promptName: args.name,
    });

    if (!args.name) {
      throw new Error(VALIDATION_MESSAGES.MISSING_PARAMETER('name'));
    }

    const prompts = await loadAllPrompts(
      logger,
      process.env.NODE_ENV === 'test' ? args?.baseDir : undefined
    );
    const prompt = prompts.find(p => p.name === args.name);

    if (!prompt) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        `Prompt not found: ${args.name}`,
        {
          operation: 'prompts_get',
          component: 'PromptsHandler',
          requestId,
        }
      );
    }

    // Validate required arguments if prompt has arguments defined
    const providedArgs: Record<string, string> = args.arguments || {};
    if (prompt.arguments && prompt.arguments.length > 0) {
      const missingRequired = prompt.arguments
        .filter(arg => arg.required && !providedArgs[arg.name])
        .map(arg => arg.name);

      if (missingRequired.length > 0) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          `Missing required arguments: ${missingRequired.join(', ')}`,
          {
            operation: 'prompts_get',
            component: 'PromptsHandler',
            requestId,
            input: { promptName: prompt.name, missingArguments: missingRequired },
          }
        );
      }
    }

    // Substitute {{argumentName}} placeholders in content
    let processedContent = prompt.content;
    for (const [argName, argValue] of Object.entries(providedArgs)) {
      processedContent = processedContent.replaceAll(`{{${argName}}}`, String(argValue));
    }

    logger.info('Prompt found and returned', {
      requestId,
      promptName: prompt.name,
      argumentsProvided: Object.keys(providedArgs).length,
    });

    // Convert to MCP prompts/get response format
    return {
      description: prompt.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: processedContent,
          },
        },
      ],
    };
  } catch (error) {
    logger.error('Prompts get request failed', error as Error);

    // Re-throw if already an AppError
    if (error instanceof Error && 'category' in error) {
      throw error;
    }

    throw ErrorHandler.createError(
      ErrorCategory.OPERATION,
      ErrorSeverity.HIGH,
      error instanceof Error ? error.message : 'Unknown error in prompts get',
      {
        operation: 'prompts_get',
        component: 'PromptsHandler',
        requestId,
        input: args,
      }
    );
  }
}
