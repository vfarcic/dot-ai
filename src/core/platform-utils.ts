/**
 * Platform Utilities
 *
 * Shared utility functions for platform operations and tools.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

export const execAsync = promisify(exec);

/**
 * Get the scripts directory path, works in both development and installed npm package
 */
export function getScriptsDir(): string {
    // In CommonJS (after TypeScript compilation), __dirname is available
    // Go up from dist/core/ to project root, then into scripts/
    return path.join(__dirname, '..', '..', 'scripts');
}


/**
 * Extract JSON object from AI response with robust parsing
 * Handles markdown code blocks and finds proper JSON boundaries
 */
export function extractJsonFromAIResponse(aiResponse: string): unknown {
  let jsonContent = aiResponse;
  
  // First try to find JSON wrapped in code blocks
  const codeBlockMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1];
  } else {
    // Try to find JSON that starts with { and find the matching closing }
    const startIndex = aiResponse.indexOf('{');
    if (startIndex !== -1) {
      let braceCount = 0;
      let endIndex = startIndex;
      
      for (let i = startIndex; i < aiResponse.length; i++) {
        if (aiResponse[i] === '{') braceCount++;
        if (aiResponse[i] === '}') braceCount--;
        if (braceCount === 0) {
          endIndex = i;
          break;
        }
      }
      
      if (endIndex > startIndex) {
        jsonContent = aiResponse.substring(startIndex, endIndex + 1);
      }
    }
  }
  
  try {
    return JSON.parse(jsonContent.trim());
  } catch (error) {
    throw new Error(`Failed to parse JSON from AI response: ${error}`);
  }
}

/**
 * Extract content from markdown code blocks in AI responses
 * Handles various code block formats: ```yaml, ```yml, ```json, or plain ```
 */
export function extractContentFromMarkdownCodeBlocks(content: string, language?: string): string {
  // Create regex pattern for the specified language or any language
  const languagePattern = language ? `(?:${language})` : '(?:yaml|yml|json)?';
  const regex = new RegExp(`\`\`\`${languagePattern}\\s*([\\s\\S]*?)\\s*\`\`\``, 'g');
  
  const match = regex.exec(content);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Return original content if no code blocks found
  return content.trim();
}

/**
 * Extract JSON array from AI response with robust parsing
 * Handles markdown code blocks and finds proper array boundaries
 */
export function extractJsonArrayFromAIResponse(aiResponse: string): unknown[] {
  let jsonContent = aiResponse;
  
  // First try to find JSON array wrapped in code blocks
  const codeBlockMatch = aiResponse.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  if (codeBlockMatch) {
    jsonContent = codeBlockMatch[1];
  } else {
    // Try to find JSON array that starts with [ and find the matching closing ]
    const startIndex = aiResponse.indexOf('[');
    if (startIndex !== -1) {
      let bracketCount = 0;
      let endIndex = startIndex;
      
      for (let i = startIndex; i < aiResponse.length; i++) {
        if (aiResponse[i] === '[') bracketCount++;
        if (aiResponse[i] === ']') bracketCount--;
        if (bracketCount === 0) {
          endIndex = i;
          break;
        }
      }
      
      if (bracketCount === 0) {
        jsonContent = aiResponse.substring(startIndex, endIndex + 1);
      }
    }
  }
  
  try {
    return JSON.parse(jsonContent.trim());
  } catch (error) {
    throw new Error(`Failed to parse JSON array from AI response: ${error}`);
  }
}
