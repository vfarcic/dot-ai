/**
 * Tool Instruction Loader
 * 
 * Loads user interaction instructions for MCP tools from markdown files
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export class InstructionLoader {
  private static instructionCache = new Map<string, string>();
  
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
   * Clear the instruction cache (useful for testing)
   */
  static clearCache(): void {
    this.instructionCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { instructions: { size: number; keys: string[] } } {
    return {
      instructions: {
        size: this.instructionCache.size,
        keys: Array.from(this.instructionCache.keys())
      }
    };
  }
}