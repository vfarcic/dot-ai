/**
 * Shared Prompt Loader
 *
 * Loads prompt templates from files and replaces variables using Handlebars
 * Following CLAUDE.md guidelines for file-based prompts
 *
 * Extracted from unified-creation-session.ts to be shared across all creation workflows
 * Extended to support custom base directories and file extensions
 */

import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

// Register custom Handlebars helpers
// Block helper for equality comparison: {{#eq a b}}...{{/eq}}
Handlebars.registerHelper('eq', function(this: any, a: any, b: any, options: any) {
  if (a === b) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

/**
 * Load template from file and replace variables using Handlebars
 *
 * @param templateName - Name of the template file (without extension)
 * @param variables - Key-value pairs to replace in template
 * @param baseDir - Base directory relative to project root (default: 'prompts')
 * @param fileExtension - File extension (default: '.md')
 * @returns Processed template content
 *
 * Supports Handlebars syntax:
 * - {{variable}} - Variable interpolation
 * - {{#if variable}}...{{/if}} - Conditional blocks
 * - {{#each array}}...{{/each}} - Iteration
 */
export function loadPrompt(
  templateName: string,
  variables: Record<string, any> = {},
  baseDir: string = 'prompts',
  fileExtension: string = '.md'
): string {
  try {
    // Use __dirname to resolve paths relative to the module location
    // This works both locally and when installed as an npm package
    // From dist/core/ we go up two levels to project root, then into baseDir
    const templatePath = path.join(__dirname, '..', '..', baseDir, `${templateName}${fileExtension}`);
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    // Compile and execute Handlebars template
    const template = Handlebars.compile(templateContent);
    const result = template(variables);

    return result;
  } catch (error) {
    console.error(`Failed to load template ${templateName} from ${baseDir}:`, error);
    return `Error loading template: ${templateName}`;
  }
}