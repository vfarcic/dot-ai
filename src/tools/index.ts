/**
 * Tool Registration Index
 * 
 * Centralized registration of all available MCP tools
 */

import { ToolRegistry, defaultToolRegistry } from '../core/tool-registry';
import { ConsoleLogger } from '../core/error-handling';

// Import tool definitions and handlers
import { recommendToolDefinition, recommendToolHandler } from './recommend';
// import { enhanceSolutionToolDefinition, enhanceSolutionToolHandler } from './enhance-solution'; // MOVED TO LEGACY
import { canHelpToolDefinition, canHelpToolHandler } from './can-help';
import { chooseSolutionToolDefinition, chooseSolutionToolHandler } from './choose-solution';
import { answerQuestionToolDefinition, answerQuestionToolHandler } from './answer-question';

/**
 * Register all available tools with the registry
 */
export function registerAllTools(registry: ToolRegistry = defaultToolRegistry): void {
  const logger = new ConsoleLogger('ToolRegistration');
  
  try {
    // Register recommend tool
    registry.registerTool(recommendToolDefinition, recommendToolHandler);
    
    // Register enhance_solution tool
    // registry.registerTool(enhanceSolutionToolDefinition, enhanceSolutionToolHandler); // MOVED TO LEGACY
    
    // Register can_help tool
    registry.registerTool(canHelpToolDefinition, canHelpToolHandler);
    
    // Register chooseSolution tool
    registry.registerTool(chooseSolutionToolDefinition, chooseSolutionToolHandler);
    
    // Register answerQuestion tool
    registry.registerTool(answerQuestionToolDefinition, answerQuestionToolHandler);
    
    const stats = registry.getStats();
    logger.info('All tools registered successfully', {
      totalTools: stats.totalTools,
      enabledTools: stats.enabledTools,
      categories: stats.categories
    });
    
  } catch (error) {
    logger.error('Failed to register tools', error as Error);
    throw error;
  }
}

/**
 * Get the default configured tool registry
 */
export function getToolRegistry(): ToolRegistry {
  return defaultToolRegistry;
}

/**
 * Initialize tools with automatic registration
 */
export function initializeTools(): ToolRegistry {
  registerAllTools();
  return defaultToolRegistry;
}

// Export tool registry types for external use
export { ToolRegistry, ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';