/**
 * MCP Prompts Handler - Manages shared prompt library
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../core/error-handling';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';

export interface PromptMetadata {
  name: string;
  description: string;
  category: string;
}

export interface Prompt {
  name: string;
  description: string;
  content: string;
}

/**
 * Loads and parses a prompt file with YAML frontmatter
 */
export function loadPromptFile(filePath: string): Prompt {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      throw new Error(`Invalid prompt file format: missing YAML frontmatter in ${filePath}`);
    }
    
    const [, frontmatterYaml, promptContent] = frontmatterMatch;
    
    // Simple YAML parsing for our specific format
    const metadata: Partial<PromptMetadata> = {};
    const lines = frontmatterYaml.split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        // Remove quotes if present
        const cleanValue = value.trim().replace(/^["']|["']$/g, '');
        metadata[key.trim() as keyof PromptMetadata] = cleanValue;
      }
    }
    
    if (!metadata.name || !metadata.description || !metadata.category) {
      throw new Error(`Missing required metadata in ${filePath}: name, description, category`);
    }
    
    return {
      name: metadata.name,
      description: metadata.description,
      content: promptContent.trim()
    };
  } catch (error) {
    throw new Error(`Failed to load prompt file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Loads all prompts from the shared-prompts directory
 */
export function loadAllPrompts(logger: Logger): Prompt[] {
  try {
    const promptsDir = path.join(process.cwd(), 'shared-prompts');
    
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
        const prompt = loadPromptFile(filePath);
        prompts.push(prompt);
        logger.debug('Loaded prompt', { name: prompt.name, file });
      } catch (error) {
        logger.error(`Failed to load prompt file ${file}`, error as Error);
      }
    }
    
    logger.info('Loaded prompts from shared library', { 
      total: prompts.length, 
      promptsDir 
    });
    
    return prompts;
  } catch (error) {
    logger.error('Failed to load prompts directory', error as Error);
    return [];
  }
}

/**
 * Handle prompts/list MCP request
 */
export async function handlePromptsListRequest(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing prompts/list request', { requestId });
    
    const prompts = loadAllPrompts(logger);
    
    // Convert to MCP prompts/list response format
    const promptList = prompts.map(prompt => ({
      name: prompt.name,
      description: prompt.description
    }));
    
    logger.info('Prompts list generated', { 
      requestId, 
      promptCount: promptList.length 
    });
    
    return {
      prompts: promptList
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
        input: args
      }
    );
  }
}

/**
 * Handle prompts/get MCP request
 */
export async function handlePromptsGetRequest(
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing prompts/get request', { 
      requestId, 
      promptName: args.name 
    });
    
    if (!args.name) {
      throw new Error('Missing required parameter: name');
    }
    
    const prompts = loadAllPrompts(logger);
    const prompt = prompts.find(p => p.name === args.name);
    
    if (!prompt) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.MEDIUM,
        `Prompt not found: ${args.name}`,
        {
          operation: 'prompts_get',
          component: 'PromptsHandler',
          requestId
        }
      );
    }
    
    logger.info('Prompt found and returned', { 
      requestId, 
      promptName: prompt.name 
    });
    
    // Convert to MCP prompts/get response format
    return {
      description: prompt.description,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: prompt.content
          }
        }
      ]
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
        input: args
      }
    );
  }
}