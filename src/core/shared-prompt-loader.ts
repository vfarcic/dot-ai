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
 
Handlebars.registerHelper('eq', function(this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
  if (a === b) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

// Block helper for truthy check: {{#isTrue value}}...{{/isTrue}}
// Treats various truthy values as true (case-insensitive for strings)
// Truthy: true, "yes", "true", "1", "on" (any case)
 
Handlebars.registerHelper('isTrue', function(this: unknown, value: unknown, options: Handlebars.HelperOptions) {
  // Handle boolean true
  if (value === true) {
    return options.fn(this);
  }

  // Handle string values (case-insensitive)
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'yes' || normalized === 'true' || normalized === '1' || normalized === 'on') {
      return options.fn(this);
    }
  }

  // Handle numeric 1
  if (value === 1) {
    return options.fn(this);
  }

  return options.inverse(this);
});

/**
 * Load template from file and replace variables using Handlebars
 *
 * @param templateName - Name of the template file (without extension)
 * @param variables - Key-value pairs to replace in template
 * @param baseDir - Base directory (relative to project root or absolute path; default: 'prompts')
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
  variables: Record<string, unknown> = {},
  baseDir: string = 'prompts',
  fileExtension: string = '.md'
): string {
  try {
    // Support both absolute and relative paths for baseDir
    // If baseDir is absolute, use it directly; otherwise resolve relative to project root
    const resolvedBaseDir = path.isAbsolute(baseDir)
      ? baseDir
      : path.join(__dirname, '..', '..', baseDir);

    const templatePath = path.join(resolvedBaseDir, `${templateName}${fileExtension}`);
    const templateContent = fs.readFileSync(templatePath, 'utf8');

    // Compile and execute Handlebars template
    const template = Handlebars.compile(templateContent);
    const result = template(variables);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const resolvedPath = path.isAbsolute(baseDir)
      ? path.join(baseDir, `${templateName}${fileExtension}`)
      : path.join(__dirname, '..', '..', baseDir, `${templateName}${fileExtension}`);

    console.error(`Failed to load template "${templateName}" from "${baseDir}" (resolved: ${resolvedPath}): ${errorMessage}`);
    return `Error loading template: ${templateName}`;
  }
}