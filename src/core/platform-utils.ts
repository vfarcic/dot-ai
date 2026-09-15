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
 * Content of the first ```json fence holding a JSON object (`{`) or array
 * (`[`) — the same match the lazy
 * ``/```(?:json)?\s*(\{[\s\S]*?\})\s*```/`` that used to sit inline in both
 * extractors produced, without that regex's quadratic.
 *
 * The lazy form rescans to the end of the string from every opener whose block
 * never closes: 8 000 openers in a 78 KB response cost 112 ms and quadruple per
 * doubling, so a 640 KB response — well within what a model can be made to emit
 * by attacker-writable tool output — is seconds of uninterruptible work on the
 * single-threaded runtime that is also serving every other request. Same
 * finding class as {@link scanJsonObjectExtents} and
 * {@link collectJsonFenceRanges}, and fixed the same way: an opener-only regex,
 * then one search for the closer.
 *
 * Stopping at the first opener that has no closer loses nothing, for the same
 * reason those rescans were wasted: a closing fence sits after every opener
 * that precedes it, so if the leftmost opener has no closer, no later opener
 * has one either — which is what the lazy regex concluded, one full rescan per
 * opener later.
 *
 * Exported for the unit test that checks it against the regex it replaces,
 * the way {@link findBalancedObjectEnd} backs {@link scanJsonObjectExtents}.
 */
export function extractFencedJsonBlock(
  text: string,
  kind: 'object' | 'array'
): string | null {
  // Group-less: each pattern ends on the character that starts the block, so
  // the block starts where the opener match ends.
  const opener = kind === 'object' ? /```(?:json)?\s*\{/ : /```(?:json)?\s*\[/;
  const closer = kind === 'object' ? /\}\s*```/g : /\]\s*```/g;

  const open = opener.exec(text);
  if (open === null) return null;

  const blockStart = open.index + open[0].length - 1;
  closer.lastIndex = blockStart + 1;
  const close = closer.exec(text);
  if (close === null) return null;

  return text.slice(blockStart, close.index + 1);
}

/**
 * Extract JSON object from AI response with robust parsing
 * Handles markdown code blocks and finds proper JSON boundaries
 */
export function extractJsonFromAIResponse(aiResponse: string): unknown {
  let jsonContent = aiResponse;

  // First try to find JSON wrapped in code blocks
  const codeBlock = extractFencedJsonBlock(aiResponse, 'object');
  if (codeBlock !== null) {
    jsonContent = codeBlock;
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
  const codeBlock = extractFencedJsonBlock(aiResponse, 'array');
  if (codeBlock !== null) {
    jsonContent = codeBlock;
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
 * A `{` offset in an AI response, paired with the end of the object it opens.
 */
export interface JsonObjectCandidate {
  /** Offset of the `{`. */
  start: number;
  /** Exclusive end of the balanced object, or -1 when the braces never balance. */
  end: number;
}

/**
 * Balanced extents for every `{` in the text, in document order, in one pass.
 *
 * The obvious implementation — {@link findBalancedObjectEnd} from each `{` in
 * turn — is quadratic, and the input here is a model response shaped by
 * attacker-writable tool output: `'{'.repeat(64000)` makes all 64 000 scans run
 * to the end of the string, measured at 5.5 s of uninterruptible work on the
 * single-threaded runtime that is also serving every other request. Same
 * finding class as the `FORGED_FENCE_PATTERN` backtracking fixed earlier in
 * this PRD, and fixed the same way: remove the quadratic term rather than cap it.
 *
 * One pass has to reproduce, for every `{` at once, what a scan *starting* at
 * that `{` would see — and such a scan starts with a clean string/escape state
 * that the surrounding document does not necessarily share. Two properties make
 * that exact rather than approximate:
 *
 * - **Escape state does not depend on where you start.** A scan only ever
 *   starts right after a `{` or a `}`, never part-way through a run of
 *   backslashes, so every run resolves identically for every scan.
 * - **String state has exactly two alignments.** A scan from offset `p` is
 *   inside a string at offset `i` exactly when the canonical scan's string
 *   state differs between `p` and `i`. So a brace counts for a scan only when
 *   the canonical scan agrees with that scan about being inside a string, which
 *   sorts every brace into one of two classes that never see each other.
 *
 * Each class therefore gets its own depth counter, and each `{` records the
 * depth its closing `}` has to bring that counter back to. An *escaped* `{` is
 * still a candidate — a scan starting there begins with a clean escape state
 * and counts it — but is invisible to every other scan, so several candidates
 * can share one closing brace. That is why a closer resolves a list of waiting
 * candidates instead of popping a single stack entry.
 */
export function scanJsonObjectExtents(text: string): JsonObjectCandidate[] {
  const candidates: JsonObjectCandidate[] = [];
  // Class 0 is "outside a string" in the canonical scan, class 1 is "inside
  // one". A scan never crosses from one to the other.
  const depth = [0, 0];
  const awaitingDepth = [
    new Map<number, number[]>(),
    new Map<number, number[]>(),
  ];

  const open = (start: number, cls: number, closesAtDepth: number): void => {
    const index = candidates.push({ start, end: -1 }) - 1;
    const waiting = awaitingDepth[cls].get(closesAtDepth);
    if (waiting) {
      waiting.push(index);
    } else {
      awaitingDepth[cls].set(closesAtDepth, [index]);
    }
  };

  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      // Escaped, so no other scan sees this brace at all — but a scan that
      // starts here does, and it owes one more `}` than the class currently does.
      if (char === '{') {
        const cls = inString ? 1 : 0;
        open(i, cls, depth[cls] - 1);
      }
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

    if (char !== '{' && char !== '}') continue;

    const cls = inString ? 1 : 0;

    if (char === '{') {
      open(i, cls, depth[cls]);
      depth[cls] += 1;
      continue;
    }

    depth[cls] -= 1;
    const closed = awaitingDepth[cls].get(depth[cls]);
    if (closed) {
      awaitingDepth[cls].delete(depth[cls]);
      for (const index of closed) {
        candidates[index].end = i + 1;
      }
    }
  }

  return candidates;
}

/**
 * Content ranges of ```json fences, in document order.
 *
 * An opener scan plus `indexOf` for the closer, rather than the one regex a
 * lazy `[\s\S]*?``` would give: on a response carrying many unclosed openers
 * the lazy form rescans to the end of the string from every one of them, which
 * is the quadratic {@link scanJsonObjectExtents} exists to avoid. Once an
 * opener has no closing fence after it, no later opener has one either, so the
 * walk stops there — which is what the regex would conclude, one wasted rescan
 * per opener later.
 */
function collectJsonFenceRanges(text: string): Array<[number, number]> {
  // Group-less: the whole match is the opening fence, so the content starts
  // exactly where it ends.
  const openerPattern = /```json[^\S\r\n]*\r?\n?/gi;
  const ranges: Array<[number, number]> = [];
  let match: RegExpExecArray | null;

  while ((match = openerPattern.exec(text)) !== null) {
    const contentStart = match.index + match[0].length;
    const contentEnd = text.indexOf('```', contentStart);
    if (contentEnd === -1) break;

    ranges.push([contentStart, contentEnd]);
    openerPattern.lastIndex = contentEnd + 3;
  }

  return ranges;
}

/**
 * Candidate JSON objects in an AI response, best first.
 *
 * Prompts ask for a fenced ```json block, so braces inside one are tried before
 * anything else. Everything else follows in document order, which is what the
 * naive "start at the first `{` and brace-match" approach considers
 * exclusively — and why prose such as
 * "no CPU or memory requests/limits defined (`"resources": {}`)" ahead of the
 * real block used to hijack the parse.
 *
 * Both inputs are sorted and the fence ranges are disjoint, so the split walks
 * them together once instead of testing every brace against every fence.
 */
export function collectJsonCandidates(text: string): JsonObjectCandidate[] {
  const candidates = scanJsonObjectExtents(text);
  const fenceRanges = collectJsonFenceRanges(text);
  if (fenceRanges.length === 0) return candidates;

  const fenced: JsonObjectCandidate[] = [];
  const unfenced: JsonObjectCandidate[] = [];
  let next = 0;

  for (const [contentStart, contentEnd] of fenceRanges) {
    while (next < candidates.length && candidates[next].start < contentStart) {
      unfenced.push(candidates[next]);
      next += 1;
    }
    while (next < candidates.length && candidates[next].start < contentEnd) {
      fenced.push(candidates[next]);
      next += 1;
    }
  }
  for (; next < candidates.length; next += 1) {
    unfenced.push(candidates[next]);
  }

  return [...fenced, ...unfenced];
}

/**
 * Candidate opening-brace offsets, best first.
 *
 * The offsets of {@link collectJsonCandidates}, for callers that only want to
 * know where the candidates are.
 */
export function collectJsonCandidateOffsets(text: string): number[] {
  return collectJsonCandidates(text).map(candidate => candidate.start);
}

/**
 * End (exclusive) of the balanced JSON object starting at `start`, or -1 when
 * the braces never balance.
 *
 * The single-candidate form. {@link scanJsonObjectExtents} computes the same
 * answer for every `{` at once and is what the search below uses; this stays as
 * the statement of what that means, and as the reference the unit tests check
 * the one-pass scan against.
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

/**
 * Whether `text[start..end)` can possibly be a JSON object.
 *
 * Cheap and one-sided: it rejects only what `JSON.parse` is certain to reject,
 * because the grammar allows nothing after `{` but insignificant whitespace and
 * then either a key string or the closing `}`.
 */
function opensLikeJsonObject(
  text: string,
  start: number,
  end: number
): boolean {
  for (let i = start + 1; i < end; i++) {
    const char = text[i];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      continue;
    }
    return char === '"' || char === '}';
  }
  return false;
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
  /**
   * True when the search stopped at {@link jsonParseBudget} with candidates
   * still untried, so `value` being null means "not found in what was scanned"
   * rather than "not present". Callers must say so rather than report an
   * ordinary structural failure.
   */
  budgetExhausted?: boolean;
}

/**
 * How many characters {@link findShapedJsonObject} will hand to `JSON.parse`
 * across all candidates of one response.
 *
 * Candidate extents nest, so their lengths sum quadratically even though
 * finding them is now linear: `'{"a":'.repeat(8000)` in a 48 KB response is
 * 8 000 valid candidates averaging 24 KB each, which took 3.4 s of `JSON.parse`
 * before this bound existed. The budget is eight times the response plus a
 * floor, which no response that is merely long can reach — it takes a candidate
 * list that re-covers the whole response eight times over, which is nesting,
 * not length.
 */
export function jsonParseBudget(text: string): number {
  return Math.max(1_000_000, text.length * 8);
}

/**
 * Find the JSON object in an AI response that has the shape the caller expects.
 *
 * `JSON.parse` succeeding is not enough to accept a candidate: `{}` parses, and
 * models routinely print braces in prose ahead of the block that matters. So
 * candidates are tried in {@link collectJsonCandidates} order and the first
 * whose balanced extent both parses and satisfies `hasShape` wins. The shape
 * predicate is the caller's, because only the caller knows which object it is
 * looking for.
 *
 * Finding the candidates costs one pass over the text; parsing them is capped
 * at {@link jsonParseBudget}, and a search that hits the cap says so rather
 * than reporting an absence it did not establish.
 */
export function findShapedJsonObject<T>(
  text: string,
  hasShape: (parsed: unknown) => parsed is T
): ShapedJsonSearch<T> {
  const candidates = collectJsonCandidates(text);
  const firstBraceIndex = text.indexOf('{');
  const budget = jsonParseBudget(text);
  let spent = 0;
  let firstBraceError: Error | undefined;

  for (const { start, end } of candidates) {
    const isFirstBrace = start === firstBraceIndex;

    if (end === -1) {
      // Only the first brace's error is ever reported, and building one is not
      // free: a response of 64 000 unbalanced `{` spent most of its time
      // capturing 64 000 stack traces nobody reads.
      if (isFirstBrace) {
        firstBraceError = new Error(
          'Could not find complete JSON object in AI response'
        );
      }
      continue;
    }

    // A JSON object is `{`, then a key string or an immediate `}`. Anything
    // else is a certain SyntaxError, and throwing one is far dearer than
    // looking. The first brace is exempt because callers report its error
    // verbatim, so it has to be the error `JSON.parse` would have raised.
    if (!isFirstBrace && !opensLikeJsonObject(text, start, end)) continue;

    if (spent + (end - start) > budget) {
      return {
        value: null,
        candidateCount: candidates.length,
        firstBraceError,
        budgetExhausted: true,
      };
    }
    spent += end - start;

    let parsed: unknown;

    try {
      parsed = JSON.parse(text.substring(start, end));
    } catch (error) {
      if (isFirstBrace) {
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
