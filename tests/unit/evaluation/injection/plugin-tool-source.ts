/**
 * Reads plugin tool definitions straight out of their production source (PRD #811, M1).
 *
 * `packages/agentic-tools` is a separate package that is not installed by the root
 * `npm ci` and is outside `rootDir: ./src`, so neither the harness nor a test can
 * *import* its tool definitions. They can be *read*: every definition in
 * `packages/agentic-tools/src/tools/*.ts` is a pure object literal with no
 * references, no template strings and no computed values, so a small scanner turns
 * one into the same JSON the model would see.
 *
 * This exists so `composition.test.ts` can compare the harness's restated tool
 * surface against production field by field — descriptions included. Without it the
 * harness could drift arbitrarily from the tool surface it claims to reproduce, and
 * the model under test would be answering a different question from the one
 * production asks it.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/** Directory holding one file per plugin tool. */
export const PLUGIN_TOOLS_DIR = join(
  'packages',
  'agentic-tools',
  'src',
  'tools'
);

/** Source file a tool is defined in, derived from its name (`kubectl_get` → `kubectl-get.ts`). */
export function pluginToolSourcePath(toolName: string): string {
  return join(PLUGIN_TOOLS_DIR, `${toolName.replace(/_/g, '-')}.ts`);
}

/** Extract the `definition: { … }` object literal text containing `name: '<toolName>'`. */
function definitionBlock(source: string, toolName: string): string {
  const anchor = source.indexOf(`name: '${toolName}',`);
  if (anchor === -1) {
    throw new Error(`No definition for "${toolName}" in its plugin source`);
  }
  const start = source.lastIndexOf('{', anchor);
  if (start === -1) {
    throw new Error(`Malformed definition for "${toolName}"`);
  }

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "'") {
      // Skip the string literal wholesale: braces inside it are not structure.
      i++;
      while (i < source.length && source[i] !== "'") {
        if (source[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced definition literal for "${toolName}"`);
}

/**
 * Convert a pure TypeScript object literal into the value it denotes.
 *
 * Handles exactly what these definitions use: nested objects, arrays, bare
 * identifier keys, single-quoted strings (with backslash escapes), numbers and
 * booleans. Anything else throws rather than guessing, so a definition that grows
 * a computed value fails loudly instead of being silently misread.
 */
function parseObjectLiteral(text: string): unknown {
  let index = 0;

  const skipWhitespace = (): void => {
    while (index < text.length && /\s/.test(text[index])) index++;
  };

  const fail = (what: string): never => {
    throw new Error(
      `Unsupported syntax in plugin tool definition at offset ${index}: expected ${what}`
    );
  };

  const parseString = (): string => {
    index++; // opening quote
    let out = '';
    while (index < text.length && text[index] !== "'") {
      if (text[index] === '\\') {
        index++;
        out += text[index];
      } else {
        out += text[index];
      }
      index++;
    }
    index++; // closing quote
    return out;
  };

  const parseValue = (): unknown => {
    skipWhitespace();
    const char = text[index];

    if (char === "'") return parseString();

    if (char === '{') {
      index++;
      const object: Record<string, unknown> = {};
      for (;;) {
        skipWhitespace();
        if (text[index] === '}') {
          index++;
          return object;
        }
        const key =
          text[index] === "'"
            ? parseString()
            : (/^[A-Za-z_$][\w$]*/.exec(text.slice(index)) ?? fail('a key'))[0];
        if (text[index] !== "'") index += key.length;
        skipWhitespace();
        if (text[index] !== ':') fail('":"');
        index++;
        object[key] = parseValue();
        skipWhitespace();
        if (text[index] === ',') index++;
      }
    }

    if (char === '[') {
      index++;
      const array: unknown[] = [];
      for (;;) {
        skipWhitespace();
        if (text[index] === ']') {
          index++;
          return array;
        }
        array.push(parseValue());
        skipWhitespace();
        if (text[index] === ',') index++;
      }
    }

    const literal = /^(true|false|null|-?\d+(?:\.\d+)?)/.exec(
      text.slice(index)
    );
    if (literal) {
      index += literal[0].length;
      if (literal[0] === 'true') return true;
      if (literal[0] === 'false') return false;
      if (literal[0] === 'null') return null;
      return Number(literal[0]);
    }

    return fail('a string, object, array, number or boolean');
  };

  const value = parseValue();
  skipWhitespace();
  return value;
}

/** A plugin tool definition, in the shape the model is handed. */
export interface PluginToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Read one plugin tool definition from production source.
 *
 * `type: 'agentic'` is dropped: it is plugin-registry metadata that never reaches
 * the model, and `AITool` has no field for it.
 */
export function readPluginToolDefinition(
  toolName: string,
  projectRoot = process.cwd()
): PluginToolDefinition {
  const source = readFileSync(
    join(projectRoot, pluginToolSourcePath(toolName)),
    'utf8'
  );
  const parsed = parseObjectLiteral(
    definitionBlock(source, toolName)
  ) as Record<string, unknown> & { type?: string };
  delete parsed.type;
  return parsed as unknown as PluginToolDefinition;
}
