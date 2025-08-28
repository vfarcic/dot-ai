/**
 * Shared Prompt Loader
 * 
 * Loads prompt templates from markdown files and replaces variables
 * Following CLAUDE.md guidelines for file-based prompts
 * 
 * Extracted from unified-creation-session.ts to be shared across all creation workflows
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Load prompt template from file and replace variables
 */
export function loadPrompt(promptName: string, variables: Record<string, string> = {}): string {
  try {
    // Use __dirname to resolve paths relative to the module location
    // This works both locally and when installed as an npm package
    const promptPath = path.join(__dirname, '..', '..', 'prompts', `${promptName}.md`);
    let template = fs.readFileSync(promptPath, 'utf8');
    
    // Replace template variables
    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return template;
  } catch (error) {
    console.error(`Failed to load prompt ${promptName}:`, error);
    return `Error loading prompt: ${promptName}`;
  }
}