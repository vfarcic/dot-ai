/**
 * Tool Instruction Loader
 * 
 * Loads user interaction instructions for MCP tools from markdown files
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export class InstructionLoader {
  private static instructionCache = new Map<string, string>();
  private static descriptionCache = new Map<string, string>();
  
  /**
   * Load tool instructions from markdown file (for agent use)
   * @param toolName - Name of the tool (e.g., 'recommend', 'enhance-solution')
   * @returns The instruction content as string
   */
  static loadInstructions(toolName: string): string {
    // Check cache first
    if (this.instructionCache.has(toolName)) {
      return this.instructionCache.get(toolName)!;
    }

    try {
      // Use same pattern as schema.ts for project root detection
      const instructionPath = join(process.cwd(), 'prompts', 'tool-instructions', `${toolName}.md`);
      
      const content = readFileSync(instructionPath, 'utf-8');
      
      // Cache the content
      this.instructionCache.set(toolName, content);
      
      return content;
    } catch (error) {
      throw new Error(`Missing instruction file for tool '${toolName}': prompts/tool-instructions/${toolName}.md`);
    }
  }

  /**
   * Load concise tool description for user-facing interfaces (MCP)
   * @param toolName - Name of the tool (e.g., 'recommend', 'enhance-solution')
   * @returns The concise description as string
   */
  static loadDescription(toolName: string): string {
    // Check cache first
    if (this.descriptionCache.has(toolName)) {
      return this.descriptionCache.get(toolName)!;
    }

    let description: string;
    
    switch (toolName) {
      case 'recommend':
        description = 'Deploy, create, run, or setup applications on Kubernetes with AI-powered recommendations. Ask the user to describe their application first, then use their response here.';
        break;
      case 'enhance_solution':
        description = 'Customize, optimize, modify, or enhance existing deployment solutions with AI-powered improvements based on user requirements.';
        break;
      case 'can_help':
        description = 'Check if App-Agent can help with your deployment, application creation, or infrastructure request.';
        break;
      default:
        description = `${toolName} tool - please describe your requirements to get started.`;
        break;
    }

    // Cache the description
    this.descriptionCache.set(toolName, description);
    return description;
  }

  /**
   * Clear the instruction cache (useful for testing)
   */
  static clearCache(): void {
    this.instructionCache.clear();
    this.descriptionCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { instructions: { size: number; keys: string[] }; descriptions: { size: number; keys: string[] } } {
    return {
      instructions: {
        size: this.instructionCache.size,
        keys: Array.from(this.instructionCache.keys())
      },
      descriptions: {
        size: this.descriptionCache.size,
        keys: Array.from(this.descriptionCache.keys())
      }
    };
  }
}