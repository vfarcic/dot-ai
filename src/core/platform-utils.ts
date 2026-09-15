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
  const codeBlockMatch = aiResponse.match(
    /```(?:json)?\s*(\{[\s\S]*?\})\s*```/
  );
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
    throw new Error(`Failed to parse JSON from AI response: ${error}`, {
      cause: error,
    });
  }
}

/**
 * Extract content from markdown code blocks in AI responses
 * Handles various code block formats: ```yaml, ```yml, ```json, or plain ```
 */
export function extractContentFromMarkdownCodeBlocks(
  content: string,
  language?: string
): string {
  // Create regex pattern for the specified language or any language
  const languagePattern = language ? `(?:${language})` : '(?:yaml|yml|json)?';
  const regex = new RegExp(
    `\`\`\`${languagePattern}\\s*([\\s\\S]*?)\\s*\`\`\``,
    'g'
  );

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
  const codeBlockMatch = aiResponse.match(
    /```(?:json)?\s*(\[[\s\S]*?\])\s*```/
  );
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
    throw new Error(`Failed to parse JSON array from AI response: ${error}`, {
      cause: error,
    });
  }
}

/**
 * Candidate opening-brace offsets for a JSON object in an AI response, best
 * first.
 *
 * Prompts ask for a fenced ```json block, so braces inside one are tried before
 * anything else. Everything else follows in document order, which is what the
 * naive "start at the first `{` and brace-match" approach considers
 * exclusively — and why prose such as
 * "no CPU or memory requests/limits defined (`"resources": {}`)" ahead of the
 * real block used to hijack the parse.
 */
export function collectJsonCandidateOffsets(text: string): number[] {
  const allBraces: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      allBraces.push(i);
    }
  }

  // Group 1 is the opening fence, so the content offset can be computed exactly
  const fenceRegex = /(```json[^\S\r\n]*\r?\n?)([\s\S]*?)```/gi;
  const fenced = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const contentStart = match.index + match[1].length;
    const contentEnd = contentStart + match[2].length;
    for (const brace of allBraces) {
      if (brace >= contentStart && brace < contentEnd) {
        fenced.add(brace);
      }
    }
  }

  return [
    ...allBraces.filter(brace => fenced.has(brace)),
    ...allBraces.filter(brace => !fenced.has(brace)),
  ];
}

/**
 * End (exclusive) of the balanced JSON object starting at `start`, or -1 when
 * the braces never balance.
 */
export function findBalancedObjectEnd(text: string, start: number): number {
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braceCount++;
    if (char === '}') {
      braceCount--;
      if (braceCount === 0) {
        return i + 1;
      }
    }
  }

  return -1;
}

/** Outcome of {@link findShapedJsonObject}. */
export interface ShapedJsonSearch<T> {
  /** First candidate that parsed *and* matched the shape, or null when none did. */
  value: T | null;
  /** How many `{` offsets were considered. Zero means the text held no object at all. */
  candidateCount: number;
  /**
   * The parse error the document-order first `{` produced, when that candidate
   * failed to parse. Callers that used to start at the first brace report this
   * so a malformed response still explains itself the way it always did.
   */
  firstBraceError?: Error;
}

/**
 * Find the JSON object in an AI response that has the shape the caller expects.
 *
 * `JSON.parse` succeeding is not enough to accept a candidate: `{}` parses, and
 * models routinely print braces in prose ahead of the block that matters. So
 * candidates are tried in {@link collectJsonCandidateOffsets} order and the
 * first whose balanced extent both parses and satisfies `hasShape` wins. The
 * shape predicate is the caller's, because only the caller knows which object
 * it is looking for.
 */
export function findShapedJsonObject<T>(
  text: string,
  hasShape: (parsed: unknown) => parsed is T
): ShapedJsonSearch<T> {
  const candidates = collectJsonCandidateOffsets(text);
  const firstBraceIndex = text.indexOf('{');
  let firstBraceError: Error | undefined;

  for (const start of candidates) {
    let parsed: unknown;

    try {
      const end = findBalancedObjectEnd(text, start);
      if (end === -1) {
        throw new Error('Could not find complete JSON object in AI response');
      }
      parsed = JSON.parse(text.substring(start, end));
    } catch (error) {
      if (start === firstBraceIndex) {
        firstBraceError =
          error instanceof Error ? error : new Error(String(error));
      }
      continue;
    }

    if (hasShape(parsed)) {
      return { value: parsed, candidateCount: candidates.length };
    }
  }

  return { value: null, candidateCount: candidates.length, firstBraceError };
}
