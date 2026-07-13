/**
 * Mock-server mirror of the PRD #647 prompts source-ingestion endpoint.
 *
 * The real server (src/core/user-prompts-loader.ts + src/interfaces/rest-api.ts)
 * lets the CLI (vfarcic/dot-ai-cli #13) UPLOAD a skill source it fetched itself
 * — `--repo-fetch <git-url>` (the server can't reach it) or `--repo-dir <path>`
 * (`local:<label>`, no remote at all) — and then RENDER it server-side via
 * `POST /api/v1/prompts/<name>?source=<identifier>` with no git clone.
 *
 * This module mirrors that wire CONTRACT in the mock so the CLI can run its
 * `--repo-fetch` / `--repo-dir` end-to-end tests against the mock image
 * (PRD #647 M6 — unblocks cli#13 M0). It keeps the mock's simpler in-memory
 * style (decoded files held in a Map, never written to disk) but is faithful on
 * everything the CLI exercises:
 *   - the ingest manifest shape + response shape,
 *   - D3 content-hash dedup short-circuit (`status: 'unchanged'`),
 *   - D5 upload hardening (file-count + total-size caps, zip-slip rejection),
 *   - credential scrubbing of the echoed `source`,
 *   - D2 render-miss → clear "(re)upload via POST /api/v1/prompts/sources"
 *     guidance, never a clone,
 *   - server-side argument substitution at render time.
 *
 * Extracted from server.ts so it can be unit-tested without an HTTP listener.
 */

import { posix } from 'node:path';
import { scrubRepoUrl } from './prompts-override.js';

/**
 * PRD #647 D5 caps. EXACT values the frozen contract
 * (.dot-agent-deck/647-contract.md) and the real server pin, so the CLI can
 * exercise the same error paths against the mock.
 */
export const MAX_INGEST_FILES = 100;
export const MAX_INGEST_TOTAL_BYTES = 256 * 1024; // 256 KiB

/**
 * Thrown on a malformed/unsafe upload manifest → mapped to a 400 VALIDATION_ERROR
 * by the server (mirrors the real PromptsSourceValidationError).
 */
export class IngestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestValidationError';
  }
}

/**
 * Thrown when a render names a `?source=<identifier>` that is not cached
 * (never uploaded / evicted). Carries actionable re-upload guidance and is
 * mapped to a 400 VALIDATION_ERROR. Deliberately distinct from "Prompt not
 * found" and free of any git/clone vocabulary — ingested identifiers are never
 * cloned (mirrors the real IngestedSourceNotFoundError, contract D2).
 */
export class IngestedSourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestedSourceNotFoundError';
  }
}

/**
 * Thrown when a render resolves a cached source but the requested skill name is
 * not in it, or its arguments are missing. Mapped to a 400 VALIDATION_ERROR
 * (mirrors the real server's "Prompt not found" / "Missing required arguments").
 */
export class PromptRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptRenderError';
  }
}

interface IngestedEntry {
  /** Credential-scrubbed identifier echoed in responses. */
  source: string;
  /** CLI-computed content hash (enables D3 dedup short-circuit). */
  contentHash?: string;
  /** Decoded upload, keyed by sanitized POSIX-relative path. */
  files: Map<string, Buffer>;
  fileCount: number;
}

/** In-memory cache of uploaded sources, keyed by the identifier sent verbatim. */
const ingestedSources = new Map<string, IngestedEntry>();

/** Test/lifecycle hook: forget all ingested sources. */
export function clearIngestedSources(): void {
  ingestedSources.clear();
}

/**
 * Reject a file path that escapes the source root, is absolute, or contains a
 * null byte; return the normalized POSIX-relative path. Mirrors the real
 * server's sanitizeRelativePath (reused for zip-slip rejection, contract D5).
 */
export function sanitizeRelativePath(p: string): string {
  if (p.includes('\0')) {
    throw new IngestValidationError('contains null byte');
  }
  if (p.startsWith('/')) {
    throw new IngestValidationError('path cannot be absolute');
  }
  const normalized = posix.normalize(p);
  if (normalized.startsWith('..') || posix.isAbsolute(normalized)) {
    throw new IngestValidationError('path cannot escape the source root');
  }
  return normalized;
}

export interface IngestPromptsSourceInput {
  source?: unknown;
  contentHash?: unknown;
  files?: unknown;
}

export interface IngestPromptsSourceResult {
  /** Credential-scrubbed identifier the render path resolves via ?source=. */
  source: string;
  contentHash?: string;
  fileCount: number;
  /**
   * 'ingested' — the manifest was decoded, hardened, and (re)stored.
   * 'unchanged' — D3 short-circuit: an identical contentHash was already cached
   * for this identifier, so nothing was re-decoded.
   */
  status: 'ingested' | 'unchanged';
}

/**
 * Validate, base64-decode, harden, and cache an uploaded skill source.
 *
 * Hardening is applied BEFORE anything is cached so a rejected upload is never
 * partially stored (mirrors the real ingestPromptsSource ordering):
 *   - D3 dedup is checked first: an identical { source, contentHash } already
 *     cached short-circuits as 'unchanged' without re-decoding.
 *   - D5 file-count cap (MAX_INGEST_FILES), enforced before any decode.
 *   - D5 zip-slip: every path goes through sanitizeRelativePath.
 *   - D5 total-size cap (MAX_INGEST_TOTAL_BYTES) over summed DECODED bytes.
 */
export function ingestPromptsSource(
  input: IngestPromptsSourceInput
): IngestPromptsSourceResult {
  // Identifier (cache key) must be a non-empty string.
  if (typeof input.source !== 'string' || input.source.trim() === '') {
    throw new IngestValidationError(
      'source is required and must be a non-empty string'
    );
  }
  const identifier = input.source.trim();

  const contentHash =
    typeof input.contentHash === 'string' ? input.contentHash : undefined;

  // D3 dedup — same identifier + same contentHash already cached → unchanged.
  if (contentHash) {
    const cached = ingestedSources.get(identifier);
    if (cached && cached.contentHash === contentHash) {
      return {
        source: cached.source,
        contentHash,
        fileCount: cached.fileCount,
        status: 'unchanged',
      };
    }
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new IngestValidationError(
      'files is required and must be a non-empty array'
    );
  }

  // D5 file-count cap, before any decode/store.
  if (input.files.length > MAX_INGEST_FILES) {
    throw new IngestValidationError(
      `Too many files: ${input.files.length} exceeds the limit of ${MAX_INGEST_FILES}`
    );
  }

  // Decode + path-validate every file (tallying decoded bytes) before storing.
  const decoded: { relPath: string; bytes: Buffer }[] = [];
  let totalBytes = 0;
  for (const raw of input.files) {
    if (!raw || typeof raw !== 'object') {
      throw new IngestValidationError(
        'each file must be an object with a path and base64 content'
      );
    }
    const file = raw as { path?: unknown; content?: unknown };
    if (typeof file.path !== 'string' || file.path.trim() === '') {
      throw new IngestValidationError(
        'each file must have a non-empty string path'
      );
    }
    if (typeof file.content !== 'string') {
      throw new IngestValidationError(
        `file content must be a base64-encoded string: ${file.path}`
      );
    }
    let relPath: string;
    try {
      relPath = sanitizeRelativePath(file.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid path';
      throw new IngestValidationError(
        `Invalid file path "${file.path}": ${message}`
      );
    }
    const bytes = Buffer.from(file.content, 'base64');
    totalBytes += bytes.length;
    // D5 total-decoded-payload cap, before any store so an oversized manifest is
    // never partially cached.
    if (totalBytes > MAX_INGEST_TOTAL_BYTES) {
      throw new IngestValidationError(
        `Total decoded payload exceeds the limit of ${MAX_INGEST_TOTAL_BYTES} bytes`
      );
    }
    decoded.push({ relPath, bytes });
  }

  const scrubbedSource = scrubRepoUrl(identifier);
  const files = new Map<string, Buffer>();
  for (const { relPath, bytes } of decoded) {
    files.set(relPath, bytes);
  }
  // N3 parity with the real server: count DISTINCT written paths (the Map
  // already collapses duplicate paths), not the raw manifest length.
  const fileCount = files.size;
  ingestedSources.set(identifier, {
    source: scrubbedSource,
    contentHash,
    files,
    fileCount,
  });

  return {
    source: scrubbedSource,
    contentHash,
    fileCount,
    status: 'ingested',
  };
}

interface ParsedSkill {
  description: string;
  args: { name: string; description?: string; required: boolean }[];
  body: string;
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '');
}

/**
 * Parse a folder-based SKILL.md: YAML frontmatter (description + arguments) and
 * the markdown body. Returns null when the frontmatter is missing — mirroring
 * the real loader skipping a malformed skill file (→ "Prompt not found").
 */
function parseSkillMd(content: string): ParsedSkill | null {
  // PRD #647 N15: the `\n?` before the closing `---` (and the `(\n…|)` body
  // alternation that requires the fence to be followed by a newline or EOF)
  // handles a SKILL.md with no trailing newline / no body, while still pinning
  // the closing fence to its own line — so a `description` value that itself
  // contains `---` is not mistaken for the fence.
  const match = content.match(/^---\n([\s\S]*?)\n?---(\n[\s\S]*|)$/);
  if (!match) {
    return null;
  }
  const [, frontmatter, body] = match;
  const lines = frontmatter.split('\n');

  let description = '';
  const args: { name: string; description?: string; required: boolean }[] = [];
  let inArgs = false;
  let current: { name: string; description?: string; required: boolean } | null =
    null;

  for (const line of lines) {
    if (/^arguments:\s*$/.test(line)) {
      inArgs = true;
      continue;
    }
    if (inArgs) {
      const nameMatch = line.match(/^\s*-\s*name:\s*(.+?)\s*$/);
      if (nameMatch) {
        if (current) args.push(current);
        current = { name: stripQuotes(nameMatch[1]), required: false };
        continue;
      }
      const reqMatch = line.match(/^\s*required:\s*(.+?)\s*$/);
      if (reqMatch && current) {
        current.required = /^true$/i.test(stripQuotes(reqMatch[1]));
        continue;
      }
      // PRD #647 list-by-source: capture the per-argument `description:` so the
      // list path can echo the full { name, description, required } argument
      // shape the real server returns. Indented under the argument, so it is
      // captured here (and `continue`d) before the top-level description parse.
      const argDescMatch = line.match(/^\s+description:\s*(.+?)\s*$/);
      if (argDescMatch && current) {
        current.description = stripQuotes(argDescMatch[1]);
        continue;
      }
      // A non-indented, non-list line ends the arguments block; fall through to
      // parse it as a top-level key. Indented argument properties are skipped.
      if (/^\S/.test(line)) {
        if (current) {
          args.push(current);
          current = null;
        }
        inArgs = false;
      } else {
        continue;
      }
    }
    const kv = line.match(/^([^:]+):\s*(.+)$/);
    if (kv && kv[1].trim() === 'description') {
      description = stripQuotes(kv[2]);
    }
  }
  if (current) args.push(current);

  return { description, args, body: body.trim() };
}

export interface RenderedPrompt {
  description: string;
  messages: Array<{ role: string; content: { type: string; text: string } }>;
  source: string;
  files?: Array<{ path: string; content: string }>;
}

/**
 * Render a skill from a previously-ingested source (contract M3 + D2).
 *
 * Resolves the identifier from the in-memory cache and reads the decoded upload
 * directly — NO git operation. A miss throws IngestedSourceNotFoundError with
 * re-upload guidance (never falls back to a clone). A cached source missing the
 * requested skill name, or missing required arguments, throws PromptRenderError.
 * On success the `{{argument}}` placeholders in the skill body are substituted
 * server-side, exactly like a `?repo=` render.
 */
export function renderIngestedPrompt(
  identifier: string,
  promptName: string,
  args: Record<string, string>
): RenderedPrompt {
  const entry = ingestedSources.get(identifier);
  if (!entry) {
    const scrubbed = scrubRepoUrl(identifier);
    throw new IngestedSourceNotFoundError(
      `Ingested source not found: ${scrubbed}. (Re)upload it via POST /api/v1/prompts/sources before rendering.`
    );
  }

  const skillKey = `${promptName}/SKILL.md`;
  const skillBytes = entry.files.get(skillKey);
  const parsed = skillBytes
    ? parseSkillMd(skillBytes.toString('utf-8'))
    : null;
  if (!parsed) {
    throw new PromptRenderError(`Prompt not found: ${promptName}`);
  }

  const provided = args || {};
  const missing = parsed.args
    .filter(a => a.required && !provided[a.name])
    .map(a => a.name);
  if (missing.length > 0) {
    throw new PromptRenderError(
      `Missing required arguments: ${missing.join(', ')}`
    );
  }

  let text = parsed.body;
  for (const [name, value] of Object.entries(provided)) {
    text = text.split(`{{${name}}}`).join(String(value));
  }

  const response: RenderedPrompt = {
    description: parsed.description,
    messages: [{ role: 'user', content: { type: 'text', text } }],
    source: entry.source,
  };

  // Sibling files under the skill folder (other than SKILL.md) are echoed
  // base64-encoded with paths relative to the skill folder, mirroring the real
  // folder-based render response.
  const prefix = `${promptName}/`;
  const extraFiles: Array<{ path: string; content: string }> = [];
  for (const [relPath, bytes] of entry.files) {
    if (relPath === skillKey || !relPath.startsWith(prefix)) continue;
    extraFiles.push({
      path: relPath.slice(prefix.length),
      content: bytes.toString('base64'),
    });
  }
  if (extraFiles.length > 0) {
    response.files = extraFiles;
  }

  return response;
}

export interface ListedPromptArgument {
  name: string;
  description?: string;
  required: boolean;
}

export interface ListedPrompt {
  name: string;
  description: string;
  arguments?: ListedPromptArgument[];
}

export interface ListIngestedResult {
  prompts: ListedPrompt[];
  /** Credential-scrubbed identifier echoed back as data.source. */
  source: string;
}

/**
 * Enumerate the prompts contained in a previously-ingested source (PRD #647
 * list-by-source — the new contract addition the CLI's upload → LIST → render
 * flow needs). Resolves the identifier from the in-memory cache and reads the
 * decoded upload directly — NO git operation. A miss (never uploaded / evicted)
 * throws IngestedSourceNotFoundError carrying re-upload guidance, exactly like
 * the render path (D2), so the mock returns the same 400 instead of a generic
 * success-with-builtins. On a hit each `<name>/SKILL.md` is parsed into the
 * frozen { name, description, arguments } shape the real list endpoint emits,
 * and data.source echoes the scrubbed identifier.
 */
export function listIngestedPrompts(identifier: string): ListIngestedResult {
  const entry = ingestedSources.get(identifier);
  if (!entry) {
    const scrubbed = scrubRepoUrl(identifier);
    throw new IngestedSourceNotFoundError(
      `Ingested source not found: ${scrubbed}. (Re)upload it via POST /api/v1/prompts/sources before rendering.`
    );
  }

  const prompts: ListedPrompt[] = [];
  for (const [relPath, bytes] of entry.files) {
    // Folder-based skills are keyed as `<name>/SKILL.md`; only those are
    // enumerable prompts. Sibling files in a skill folder are skipped.
    const match = relPath.match(/^([^/]+)\/SKILL\.md$/);
    if (!match) continue;
    const parsed = parseSkillMd(bytes.toString('utf-8'));
    if (!parsed) continue;
    const item: ListedPrompt = {
      name: match[1],
      description: parsed.description,
    };
    if (parsed.args.length > 0) {
      item.arguments = parsed.args.map(arg => {
        const out: ListedPromptArgument = {
          name: arg.name,
          required: arg.required,
        };
        if (arg.description !== undefined) {
          out.description = arg.description;
        }
        return out;
      });
    }
    prompts.push(item);
  }

  return { prompts, source: entry.source };
}
