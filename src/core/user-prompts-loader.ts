/**
 * User Prompts Loader
 *
 * Loads user-defined prompts from a git repository.
 * Supports any git provider (GitHub, GitLab, Gitea, Forgejo, Bitbucket, etc.)
 *
 * Environment variables:
 * - DOT_AI_USER_PROMPTS_REPO: Git repository URL (required to enable)
 * - DOT_AI_USER_PROMPTS_BRANCH: Branch to use (default: main)
 * - DOT_AI_USER_PROMPTS_PATH: Subdirectory within repo (default: root)
 * - DOT_AI_GIT_TOKEN: Authentication token (optional)
 * - DOT_AI_USER_PROMPTS_CACHE_TTL: Cache TTL in seconds (default: 86400 = 24h)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { Logger } from './error-handling';
import {
  cloneRepo,
  pullRepo,
  sanitizeRelativePath,
  scrubCredentials,
} from './git-utils';
import { Prompt, PromptFile, loadPromptFile } from '../tools/prompts';

/**
 * Configuration for user prompts repository
 */
export interface UserPromptsConfig {
  repoUrl: string;
  branch: string;
  subPath: string;
  gitToken?: string;
  cacheTtlSeconds: number;
}

/**
 * Per-request override for user prompts repository.
 * When supplied to loadUserPrompts(), bypasses DOT_AI_USER_PROMPTS_REPO env vars
 * for that call while reusing DOT_AI_GIT_TOKEN and the cache TTL.
 */
export interface UserPromptsOverride {
  repoUrl: string;
  branch?: string;
  subPath?: string;
  /**
   * Per-request git credential forwarded by the caller (PRD #621 M2/M3, via the
   * X-Dot-AI-Git-Token header). When present it takes precedence over
   * DOT_AI_GIT_TOKEN for THIS request only (Decision 4) and triggers per-request
   * cache isolation so a private authenticated clone is never served to/from the
   * shared unauthenticated cache slot (Decision 2). Never enters the cache key
   * or any log/error/source surface.
   */
  gitToken?: string;
  /**
   * PRD #647 D1: when set, this override resolves to an already-ingested source
   * (uploaded via POST /api/v1/prompts/sources) identified by this string —
   * NOT a git clone. loadUserPrompts reads the cached uploaded files directly
   * and NEVER calls cloneRepo, so a `local:<label>` or server-unreachable
   * `?repo=` URL is served without any git operation. `repoUrl` carries the
   * same identifier only for the scrubbed `source` echo (computePromptsSource).
   */
  ingestedSource?: string;
}

/**
 * Cache state for tracking repository freshness.
 * Cache is invalidated when any of repoUrl, branch, or subPath changes,
 * so we record all three on every clone.
 */
interface CacheState {
  lastPullTime: number;
  localPath: string;
  repoUrl: string;
  branch: string;
  subPath: string;
}

// In-memory cache state (persists across requests within same process)
let cacheState: CacheState | null = null;

/**
 * PRD #647 D2 — in-memory cache of CLI-uploaded skill sources, keyed by the
 * source identifier sent on upload (e.g. `local:team-dev` or a git URL the
 * server cannot reach). Push-populated by ingestPromptsSource (never fetched);
 * does not survive a restart (re-upload on the next hook fire). Lives in the
 * same loader module as the git-clone cache so the render path resolves both
 * uniformly.
 */
interface IngestedSourceEntry {
  /** Identifier exactly as uploaded — the cache key. */
  identifier: string;
  /** Credential-scrubbed identifier echoed in responses/logs. */
  source: string;
  /** CLI-computed content hash (opaque this round; D3 dedup is a later round). */
  contentHash?: string;
  /** On-disk directory the decoded upload was written to. */
  localPath: string;
  /** Number of files written. */
  fileCount: number;
  /**
   * Recency marker for the LRU (PRD #647 F5/M4): set on upload and refreshed on
   * every successful render. evictIngestedIfNeeded evicts the entry with the
   * smallest value first when the registry exceeds MAX_INGESTED_SOURCES.
   */
  uploadedAt: number;
}

const ingestedSources = new Map<string, IngestedSourceEntry>();

/**
 * PRD #647 D5 — upload-input hardening caps. These are the EXACT values the
 * frozen contract (.dot-agent-deck/647-contract.md) and the integration suite
 * pin, chosen to trip the app-level cap before the ~1 MiB nginx ingress limit.
 */
const MAX_INGEST_FILES = 100;
const MAX_INGEST_TOTAL_BYTES = 256 * 1024; // 256 KiB

/**
 * PRD #647 F5 / D2-M4 — max number of distinct ingested sources held in memory.
 * The cache is push-populated by authenticated uploads, so without a bound it
 * grows unbounded across distinct identifiers (a memory-growth vector). This
 * is a simple access-ordered LRU cap: on overflow the least-recently-used entry
 * (oldest `uploadedAt`, refreshed on every successful render) is evicted, and a
 * later `?source=` render of an evicted identifier hits the existing D2
 * render-miss guidance (re-upload required). Correctness over tuning per the
 * frozen contract — 50 distinct sources is ample for the CLI's per-host usage.
 */
export const MAX_INGESTED_SOURCES = 50;

/**
 * Thrown by ingestPromptsSource on a malformed/unsafe upload so the REST handler
 * can map it to a 400 (vs. a 500 for unexpected IO failures).
 */
export class PromptsSourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptsSourceValidationError';
  }
}

/**
 * PRD #647 D2 — thrown when a render names an ingested `?source=<identifier>`
 * that is not (or no longer) cached. It carries actionable re-upload guidance
 * and is mapped to a 400 VALIDATION_ERROR by the REST handler. Deliberately
 * distinct from the generic "Prompt not found" so the caller knows to re-upload
 * the source rather than wonder why a known skill name is missing — and it never
 * triggers (nor mentions) a git clone, since ingested identifiers are never
 * cloned.
 */
export class IngestedSourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestedSourceNotFoundError';
  }
}

/**
 * PRD #647 D5 — sanitize an untrusted POSIX `mode` string from an uploaded
 * manifest into a safe numeric file mode. Strips the special bits
 * (setuid 04000, setgid 02000, sticky 01000) so an uploaded skill file can never
 * carry an exec-escalation surprise, and keeps only the standard rwx permission
 * bits (07777 → 0777). Anything unparseable falls back to a sane 0644.
 */
export function sanitizeIngestFileMode(mode: unknown): number {
  const DEFAULT_MODE = 0o644;
  if (typeof mode !== 'string' || mode.trim() === '') {
    return DEFAULT_MODE;
  }
  // Manifests send octal strings (e.g. "0644", "755"); parse base 8.
  const parsed = parseInt(mode.trim(), 8);
  if (Number.isNaN(parsed) || parsed < 0) {
    return DEFAULT_MODE;
  }
  // Mask off setuid/setgid/sticky and any bits above the 0777 permission range.
  return parsed & 0o777;
}

/**
 * PRD #647 C5 (CodeRabbit) — strict canonical-base64 matcher. `Buffer.from(s,
 * 'base64')` silently DROPS any out-of-alphabet character and tolerates missing
 * padding, so a malformed `content` would otherwise decode to corrupt bytes and
 * be cached. The CLI always uploads canonical, padded standard base64
 * (Buffer#toString('base64')), so we require exactly that: only the standard
 * alphabet (A–Z a–z 0–9 + /), `=` padding allowed only at the end, and a length
 * that is a multiple of 4. The empty string (an empty file) is accepted.
 */
const CANONICAL_BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
function isCanonicalBase64(content: string): boolean {
  return content.length % 4 === 0 && CANONICAL_BASE64_RE.test(content);
}

/** Shape of the uploaded manifest (validated at runtime; all fields untrusted). */
export interface IngestPromptsSourceInput {
  source: unknown;
  contentHash?: unknown;
  files: unknown;
}

/** Result echoed back to the caller after a successful ingest. */
export interface IngestPromptsSourceResult {
  /** Credential-scrubbed identifier the render path uses via ?source=. */
  source: string;
  contentHash?: string;
  fileCount: number;
  /**
   * 'ingested' — the manifest was decoded, hardened, and (re)written.
   * 'unchanged' — PRD #647 D3 short-circuit: an identical contentHash was
   * already cached for this identifier, so nothing was re-decoded or rewritten.
   */
  status: 'ingested' | 'unchanged';
}

/**
 * Root directory holding decoded ingested sources, a sibling of the git-clone
 * cache directory so both live under the same writable tmp space.
 */
function getIngestedCacheRoot(): string {
  return path.join(path.dirname(getCacheDirectory()), 'ingested-prompts');
}

/**
 * PRD #647 F6 — create a fresh, unpredictable 0700 staging directory under the
 * ingested-cache root for an in-progress upload.
 *
 * Decoded files are written here FIRST and only promoted into the predictable
 * per-identifier slot once every file is on disk (see F3 atomic re-ingest).
 * Because the name is CSPRNG-random (crypto.randomUUID via mkdtempSync) and the
 * directory is 0700, a local attacker can't pre-plant a symlink for the
 * writeFileSync calls to follow (TOCTOU) — the same hardening the token-bearing
 * clone path uses in createIsolatedCloneRoot.
 */
function createIngestedStagingDir(root: string): string {
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(
    path.join(root, `staging-${crypto.randomUUID()}-`)
  );
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    /* best-effort hardening (mkdtempSync already creates with 0700) */
  }
  return dir;
}

/**
 * PRD #647 F5 — enforce the LRU cap on the ingested-source registry. Evicts the
 * least-recently-used entries (oldest `uploadedAt`) until the registry is within
 * MAX_INGESTED_SOURCES, removing each evicted entry's on-disk directory too so
 * memory AND disk stay bounded. An evicted identifier's next render falls into
 * the D2 render-miss path (the registry entry is gone), instructing the caller
 * to re-upload — it is never silently cloned.
 */
function evictIngestedIfNeeded(logger: Logger): void {
  while (ingestedSources.size > MAX_INGESTED_SOURCES) {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;
    for (const [key, entry] of ingestedSources) {
      if (entry.uploadedAt < oldestTime) {
        oldestTime = entry.uploadedAt;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) break;
    const evicted = ingestedSources.get(oldestKey);
    ingestedSources.delete(oldestKey);
    if (evicted) {
      try {
        fs.rmSync(evicted.localPath, { recursive: true, force: true });
      } catch {
        /* best-effort disk cleanup; the registry entry is already gone */
      }
      logger.debug('Evicted ingested prompts source (LRU cap reached)', {
        source: evicted.source,
      });
    }
  }
}

/**
 * PRD #647 M2/M4/D5 — validate, base64-decode, harden, and cache an uploaded
 * skill source.
 *
 * The decoded files are written to a fresh 0700 staging directory, then
 * atomically promoted into the per-identifier slot (a hash of the identifier)
 * and registered in the in-memory ingested cache so the existing render path
 * (loadUserPrompts → loadPromptsFromDir) resolves them with no git operation.
 * The atomic promote (F3) means a failed/invalid re-upload never destroys the
 * prior cached entry.
 *
 * Hardening, all applied BEFORE the prior slot is touched so a rejected upload
 * is never partially cached:
 *   - D3 dedup: an identical `contentHash` already cached for this identifier
 *     short-circuits with status 'unchanged' — nothing is re-decoded or rewritten.
 *   - D5 file-count cap: more than MAX_INGEST_FILES files is rejected up front.
 *   - D5 total-size cap: summed DECODED bytes over MAX_INGEST_TOTAL_BYTES is rejected.
 *   - D5 zip-slip: every file path goes through sanitizeRelativePath (reused
 *     from git-utils) to reject traversal/absolute paths.
 *   - F3 NUL byte: a `\0` in a file path is rejected with a 400 BEFORE any fs
 *     call (sanitizeRelativePath does not catch it).
 *   - D5 mode bits: each file's POSIX `mode` is sanitized (setuid/setgid/sticky
 *     stripped) via sanitizeIngestFileMode before the file is written.
 */
export function ingestPromptsSource(
  input: IngestPromptsSourceInput,
  logger: Logger
): IngestPromptsSourceResult {
  // Identifier (cache key) must be a non-empty string.
  if (typeof input.source !== 'string' || input.source.trim() === '') {
    throw new PromptsSourceValidationError(
      'source is required and must be a non-empty string'
    );
  }
  const identifier = input.source.trim();

  const contentHash =
    typeof input.contentHash === 'string' ? input.contentHash : undefined;

  // PRD #647 D3 — content-hash dedup. If the caller sent a contentHash that is
  // already cached for this identifier, the upload is byte-for-byte unchanged:
  // short-circuit WITHOUT re-decoding or rewriting any files and report the
  // cached file count. A different or absent hash falls through to a normal
  // (re)ingest below.
  if (contentHash) {
    const cached = ingestedSources.get(identifier);
    if (cached && cached.contentHash === contentHash) {
      logger.info('Ingested prompts source unchanged (dedup short-circuit)', {
        source: cached.source,
        fileCount: cached.fileCount,
      });
      return {
        source: cached.source,
        contentHash,
        fileCount: cached.fileCount,
        status: 'unchanged',
      };
    }
  }

  // Manifest must carry at least one file.
  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new PromptsSourceValidationError(
      'files is required and must be a non-empty array'
    );
  }

  // PRD #647 D5 — file-count cap, enforced before any decode/write.
  if (input.files.length > MAX_INGEST_FILES) {
    throw new PromptsSourceValidationError(
      `Too many files: ${input.files.length} exceeds the limit of ${MAX_INGEST_FILES}`
    );
  }

  // Decode + path-validate EVERY file (and tally decoded bytes) before writing.
  const decoded: { relPath: string; bytes: Buffer; mode: number }[] = [];
  let totalBytes = 0;
  for (const raw of input.files) {
    if (!raw || typeof raw !== 'object') {
      throw new PromptsSourceValidationError(
        'each file must be an object with a path and base64 content'
      );
    }
    const file = raw as { path?: unknown; content?: unknown; mode?: unknown };
    if (typeof file.path !== 'string' || file.path.trim() === '') {
      throw new PromptsSourceValidationError(
        'each file must have a non-empty string path'
      );
    }
    if (typeof file.content !== 'string') {
      throw new PromptsSourceValidationError(
        `file content must be a base64-encoded string: ${file.path}`
      );
    }
    // PRD #647 F3 — reject a NUL byte BEFORE any fs call. git-utils'
    // sanitizeRelativePath does not catch `\0`, so without this an embedded NUL
    // would slip through to fs.mkdirSync/writeFileSync and throw a raw
    // TypeError → a generic 500 plus a partial write. Map it to a clean 400
    // here, up front, so a rejected upload never touches disk. (Backslashes are
    // left as ordinary POSIX path characters — they cannot escape the root —
    // keeping parity with the mock's sanitizeRelativePath.)
    if (file.path.includes('\0')) {
      throw new PromptsSourceValidationError(
        `Invalid file path "${file.path}": contains null byte`
      );
    }
    let relPath: string;
    try {
      // Reuse the folder-write traversal/zip-slip guard.
      relPath = sanitizeRelativePath(file.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid path';
      throw new PromptsSourceValidationError(
        `Invalid file path "${file.path}": ${message}`
      );
    }
    // PRD #647 C5 — reject malformed base64 with a 400 BEFORE decoding, so a
    // corrupt upload is never silently decoded (Buffer.from drops bad chars)
    // and cached. Checked after the path guards so a rejected upload never
    // touches disk.
    if (!isCanonicalBase64(file.content)) {
      throw new PromptsSourceValidationError(
        `Invalid base64 content for file "${file.path}"`
      );
    }
    const bytes = Buffer.from(file.content, 'base64');
    totalBytes += bytes.length;
    // PRD #647 D5 — total decoded payload cap, checked before any write so an
    // oversized manifest is never partially cached.
    if (totalBytes > MAX_INGEST_TOTAL_BYTES) {
      throw new PromptsSourceValidationError(
        `Total decoded payload exceeds the limit of ${MAX_INGEST_TOTAL_BYTES} bytes`
      );
    }
    decoded.push({
      relPath,
      bytes,
      // PRD #647 D5 — sanitize the untrusted mode (strip setuid/setgid/sticky).
      mode: sanitizeIngestFileMode(file.mode),
    });
  }

  // PRD #647 F3 — atomic re-ingest. Each identifier maps to a predictable
  // per-identifier slot keyed by its hash, but we never write INTO that slot
  // directly: write the decoded files into a fresh, unpredictable 0700 staging
  // directory FIRST, then promote it into place only after every file is on
  // disk. This guarantees a write-time failure (the NUL byte rejected above,
  // EISDIR, disk full, …) NEVER destroys the previously-cached entry — the old
  // slot is removed only on the success path, and the in-memory registry is
  // updated last.
  // PRD #647 F3 — resolve the cache root ONCE so the staging dir and the final
  // slot are guaranteed to live on the same filesystem. getIngestedCacheRoot()
  // can otherwise resolve to a different device between calls (project tmp vs the
  // os.tmpdir() fallback), which made the promote rename fail with EXDEV.
  const cacheRoot = getIngestedCacheRoot();
  const finalDir = path.join(
    cacheRoot,
    crypto.createHash('sha256').update(identifier).digest('hex')
  );
  const stagingDir = createIngestedStagingDir(cacheRoot);
  // PRD #647 N3 — count DISTINCT written paths: two manifest entries that
  // sanitize to the same path collapse to one file on disk, so fileCount must
  // not double-count them.
  const writtenPaths = new Set<string>();
  // PRD #647 F3 (CodeRabbit C1) — failure-ATOMIC promote. The earlier version
  // `rmSync(finalDir)`'d the prior slot BEFORE the rename, so a rename failure
  // destroyed the last known-good entry (the map still pointed at finalDir).
  // Instead: move the old slot aside to an unpredictable backup, rename staging
  // into place, then delete the backup. If the promote throws, the backup is
  // moved back so the prior cached entry is always recoverable. rename does not
  // follow a symlink at the source or target, so a pre-planted finalDir symlink
  // is moved/replaced, not written through.
  const backupDir = `${finalDir}.bak-${crypto.randomUUID()}`;
  let hadPrevious = false;
  try {
    for (const { relPath, bytes, mode } of decoded) {
      const fullPath = path.join(stagingDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, bytes, { mode });
      writtenPaths.add(relPath);
    }
    // Move any prior slot aside FIRST (so it can be restored on failure), then
    // promote the fully-written staging dir into place.
    if (fs.existsSync(finalDir)) {
      fs.renameSync(finalDir, backupDir);
      hadPrevious = true;
    }
    fs.renameSync(stagingDir, finalDir);
  } catch (error) {
    // Roll back the partial staging dir; never leave it behind.
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup of the abandoned staging dir */
    }
    // Restore the prior cached entry if it was moved aside but the promote
    // never completed, so a failed re-upload truly never destroys it.
    if (hadPrevious && fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
      try {
        fs.renameSync(backupDir, finalDir);
      } catch {
        /* best-effort restore; backup remains on disk for manual recovery */
      }
    }
    throw error;
  }
  // Promote succeeded — discard the prior good copy. Best-effort: a cleanup
  // failure here must NOT fail an already-successful re-ingest (the new content
  // is in place), at worst leaving a stale backup dir for the tmp sweep.
  if (hadPrevious) {
    try {
      fs.rmSync(backupDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup of the superseded prior copy */
    }
  }

  const fileCount = writtenPaths.size;
  const scrubbedSource = scrubSourceUrl(identifier);
  // PRD #647 F5 — re-insert so a re-upload counts as most-recently-used in the
  // access-ordered LRU, then evict if the registry now exceeds the cap.
  ingestedSources.delete(identifier);
  ingestedSources.set(identifier, {
    identifier,
    source: scrubbedSource,
    contentHash,
    localPath: finalDir,
    fileCount,
    uploadedAt: Date.now(),
  });
  evictIngestedIfNeeded(logger);

  logger.info('Ingested prompts source', {
    source: scrubbedSource,
    fileCount,
  });

  return {
    source: scrubbedSource,
    contentHash,
    fileCount,
    status: 'ingested',
  };
}

/**
 * Load prompts from a previously-ingested source (PRD #647 M3 + D2).
 *
 * Resolves the identifier from the in-memory ingested cache and reads the
 * decoded upload directly — NO git operation. A miss (evicted/never-uploaded)
 * throws IngestedSourceNotFoundError with re-upload guidance rather than
 * silently falling back to a clone (D2: ingested identifiers are never cloned).
 * The thrown message deliberately avoids the generic "Prompt not found" wording
 * AND any git/clone/scheme vocabulary so the caller learns to re-upload and the
 * "no clone attempted" guarantee is observable.
 *
 * Note the distinction the contract requires: a MISSING identifier (no cache
 * entry) yields this guidance, whereas a CACHED identifier that simply does not
 * contain the requested skill name returns the loaded prompts and lets the
 * caller surface the normal "Prompt not found".
 */
function loadIngestedPrompts(identifier: string, logger: Logger): Prompt[] {
  const entry = ingestedSources.get(identifier);
  if (!entry || !fs.existsSync(entry.localPath)) {
    const scrubbed = scrubSourceUrl(identifier);
    logger.warn('Ingested prompts source not found; (re)upload required', {
      source: scrubbed,
    });
    throw new IngestedSourceNotFoundError(
      `Ingested source not found: ${scrubbed}. (Re)upload it via POST /api/v1/prompts/sources before rendering.`
    );
  }

  // PRD #647 F5 — mark this entry most-recently-used so a frequently-rendered
  // source survives the LRU eviction in evictIngestedIfNeeded.
  entry.uploadedAt = Date.now();

  const prompts = loadPromptsFromDir(entry.localPath, logger);
  logger.info('Loaded user prompts from ingested source', {
    total: prompts.length,
    source: entry.source,
  });
  return prompts;
}

/**
 * Read user prompts configuration from environment variables
 * Returns null if DOT_AI_USER_PROMPTS_REPO is not set
 */
export function getUserPromptsConfig(): UserPromptsConfig | null {
  const repoUrl = process.env.DOT_AI_USER_PROMPTS_REPO;

  if (!repoUrl) {
    return null;
  }

  // Validate cache TTL - fallback to default if invalid or negative
  const parsedTtl = parseInt(
    process.env.DOT_AI_USER_PROMPTS_CACHE_TTL || '86400',
    10
  );
  const cacheTtlSeconds =
    Number.isNaN(parsedTtl) || parsedTtl < 0 ? 86400 : parsedTtl;

  return {
    repoUrl,
    branch: process.env.DOT_AI_USER_PROMPTS_BRANCH || 'main',
    subPath: process.env.DOT_AI_USER_PROMPTS_PATH || '',
    gitToken: process.env.DOT_AI_GIT_TOKEN,
    cacheTtlSeconds,
  };
}

/**
 * Compute the `source` value the REST endpoints expose in their responses.
 * The CLI (vfarcic/dot-ai-cli) uses this string verbatim to tag the skill
 * files it writes, so:
 *   - per-request override supplied  → override.repoUrl
 *   - no override, env-var configured → DOT_AI_USER_PROMPTS_REPO
 *   - no override, no env-var         → "built-in"
 *
 * URLs flow through scrubSourceUrl before returning, which scrubs BOTH:
 *   - userinfo credentials (https://user:token@host/repo)
 *   - credential-bearing query params (?access_token=... etc — CodeRabbit
 *     Major A)
 *
 * Stability is preserved: scrubSourceUrl is deterministic (fixed `***`
 * placeholder), so two identical credential-bearing inputs produce the same
 * scrubbed source — keeping the CLI's "wipe only my own slice" invariant
 * intact.
 */
export function computePromptsSource(override?: UserPromptsOverride): string {
  if (override?.repoUrl) {
    return scrubSourceUrl(override.repoUrl);
  }
  const envRepo = process.env.DOT_AI_USER_PROMPTS_REPO;
  if (envRepo) {
    return scrubSourceUrl(envRepo);
  }
  return 'built-in';
}

/**
 * Build a UserPromptsConfig from a per-request override.
 * Reuses DOT_AI_GIT_TOKEN and DOT_AI_USER_PROMPTS_CACHE_TTL from the environment;
 * branch and subPath fall back to the same defaults as the env-var path.
 *
 * Validates the override inputs before returning:
 *   - repoUrl scheme must be http or https (prevents file://, ssh://, etc.)
 *   - subPath must be a relative path inside the cache directory (no '..',
 *     no absolute, no null bytes)
 *   - branch must match the git-safe character set used elsewhere
 *
 * Throws Error with a credential-scrubbed message on any validation failure.
 */
export function getUserPromptsConfigFromOverride(
  override: UserPromptsOverride
): UserPromptsConfig {
  // F1: repoUrl scheme must be http/https
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(override.repoUrl);
  } catch {
    throw new Error(
      `Invalid override repoUrl: ${sanitizeUrlForLogging(override.repoUrl)} (failed to parse)`
    );
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Invalid override repoUrl scheme: ${parsedUrl.protocol} (only http and https are allowed) for ${sanitizeUrlForLogging(override.repoUrl)}`
    );
  }

  // F2: subPath must be a safe relative path
  let normalizedSubPath = '';
  if (override.subPath) {
    if (override.subPath.includes('\0')) {
      throw new Error('Invalid override subPath: contains null byte');
    }
    try {
      normalizedSubPath = sanitizeRelativePath(override.subPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Invalid override subPath: ${message}`, { cause: error });
    }
  }

  // F3: branch (if supplied) must match the git-safe character set
  const branch = override.branch || 'main';
  if (override.branch !== undefined && !isValidGitBranch(override.branch)) {
    throw new Error(`Invalid override branch name: ${override.branch}`);
  }

  const parsedTtl = parseInt(
    process.env.DOT_AI_USER_PROMPTS_CACHE_TTL || '86400',
    10
  );
  const cacheTtlSeconds =
    Number.isNaN(parsedTtl) || parsedTtl < 0 ? 86400 : parsedTtl;

  return {
    repoUrl: override.repoUrl,
    branch,
    subPath: normalizedSubPath,
    // PRD #621 M2 / Decision 4: a request-supplied token (override.gitToken)
    // takes precedence over the server env credential for this request only;
    // the env credential remains the fallback when no header is present.
    gitToken: override.gitToken ?? process.env.DOT_AI_GIT_TOKEN,
    cacheTtlSeconds,
  };
}

/**
 * Get the cache directory for user prompts
 * Tries project-relative tmp first, falls back to system temp
 */
export function getCacheDirectory(): string {
  // Try project-relative tmp directory first
  const projectTmp = path.join(process.cwd(), 'tmp', 'user-prompts');

  try {
    // Ensure parent tmp directory exists
    const parentTmp = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(parentTmp)) {
      fs.mkdirSync(parentTmp, { recursive: true });
    }

    // Test if we can write to it. Use a unique probe name so concurrent callers
    // never unlink each other's probe — a shared name races (one caller's unlink
    // makes another's write/unlink throw), wrongly forcing the os.tmpdir()
    // fallback and splitting a single ingest's writes across filesystems.
    const testFile = path.join(parentTmp, `.write-test-${process.pid}-${crypto.randomUUID()}`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    return projectTmp;
  } catch {
    // Fall back to system temp (works in Docker/K8s)
    return path.join(os.tmpdir(), 'dot-ai-user-prompts');
  }
}

/**
 * Sanitize URL for logging (remove credentials)
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) parsed.username = '***';
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    // If URL parsing fails, do basic sanitization
    return url.replace(/\/\/[^@]+@/, '//***@');
  }
}

/**
 * Query-param names whose values look credential-bearing. Conservative
 * allowlist-on-redaction — case-insensitive substring match.
 */
const CREDENTIAL_PARAM_RE = /token|key|secret|password|auth|credential/i;

/**
 * Source-only deep scrub for URLs that flow into the response body and the
 * on-disk skill frontmatter the CLI writes (PRD #581 / CodeRabbit Major A).
 *
 * In addition to the userinfo scrub from sanitizeUrlForLogging, redacts the
 * VALUES of query parameters whose names look credential-bearing (token, key,
 * secret, password, auth, credential — case-insensitive). The placeholder is
 * a fixed string so the output is deterministic — same input always produces
 * the same source, preserving the CLI's "tag-and-wipe-by-source" invariant.
 *
 * Scope: ONLY called from computePromptsSource. NOT a general-purpose
 * replacement for sanitizeUrlForLogging — the broader hygiene of the shared
 * helper was deferred per the M2 follow-up scope.
 */
export function scrubSourceUrl(url: string): string {
  // Userinfo scrub first; this also handles "//user:pass@" via the regex
  // fallback when URL parsing fails.
  const userinfoScrubbed = sanitizeUrlForLogging(url);
  try {
    const parsed = new URL(userinfoScrubbed);
    let mutated = false;
    for (const name of [...parsed.searchParams.keys()]) {
      if (CREDENTIAL_PARAM_RE.test(name)) {
        parsed.searchParams.set(name, '***');
        mutated = true;
      }
    }
    return mutated ? parsed.toString() : userinfoScrubbed;
  } catch {
    // Unparseable; return the userinfo-scrubbed form unchanged. Query-param
    // scrubbing on unparseable URLs is meaningless — there's no reliable
    // boundary to walk.
    return userinfoScrubbed;
  }
}

/**
 * Validate git branch name to prevent command injection
 * Allows alphanumeric characters, hyphens, underscores, slashes, and dots
 */
function isValidGitBranch(branch: string): boolean {
  return /^[a-zA-Z0-9_.\-/]+$/.test(branch);
}

/**
 * Create a unique, throwaway ROOT directory for a token-bearing override
 * request (PRD #621 M3 / Decision 2). It lives alongside the shared cache
 * directory but is NOT the shared slot, so an authenticated private clone is
 * never written to (or served from) the unauthenticated cache. The caller
 * removes it after reading.
 *
 * Hardening (LOW-4): created atomically via fs.mkdtempSync with a CSPRNG
 * (crypto.randomUUID) name component and mode 0700, so the authenticated clone
 * cannot land in a predictable, world-readable location.
 */
function createIsolatedCloneRoot(): string {
  const parent = path.dirname(getCacheDirectory());
  const root = fs.mkdtempSync(
    path.join(parent, `user-prompts-override-${crypto.randomUUID()}-`)
  );
  try {
    fs.chmodSync(root, 0o700);
  } catch {
    /* best-effort hardening (mkdtempSync already creates with 0700) */
  }
  return root;
}

/**
 * Clone the user prompts repository.
 *
 * `overrideToken` (PRD #621 M3) is a per-request credential that, when present,
 * overrides env auth for this clone only and is scoped to the source host with
 * no cross-host redirect forwarding (handled in cloneRepo). When omitted, the
 * clone authenticates via env exactly as before.
 */
async function cloneRepository(
  config: UserPromptsConfig,
  localPath: string,
  logger: Logger,
  overrideToken?: string
): Promise<void> {
  // Validate branch name as defense-in-depth
  if (!isValidGitBranch(config.branch)) {
    throw new Error(`Invalid branch name: ${config.branch}`);
  }

  const sanitizedUrl = sanitizeUrlForLogging(config.repoUrl);

  logger.info('Cloning user prompts repository', {
    url: sanitizedUrl,
    branch: config.branch,
    localPath,
  });

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(localPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Remove existing directory if it exists (clean clone)
    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }

    await cloneRepo(config.repoUrl, localPath, {
      branch: config.branch,
      depth: 1,
      // Per-request override credential (PRD #621 M3). undefined → cloneRepo
      // falls back to env auth, i.e. today's behavior unchanged.
      token: overrideToken,
    });

    logger.info('Successfully cloned user prompts repository', {
      url: sanitizedUrl,
      branch: config.branch,
    });
  } catch (error) {
    const scrub = (raw: string): string =>
      scrubCredentials(
        config.gitToken ? raw.replaceAll(config.gitToken, '***') : raw
      );
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const sanitizedError = scrub(errorMessage);

    logger.error(
      'Failed to clone user prompts repository',
      new Error(sanitizedError),
      {
        url: sanitizedUrl,
        branch: config.branch,
      }
    );
    // LOW-5: scrub the caught error IN PLACE (message + stack) before attaching
    // it as `cause`, so a serialized `.cause` cannot leak the token. (With the
    // GIT_ASKPASS rework the override token is no longer on the git argv/URL, so
    // it cannot appear here in the first place — this is defense-in-depth, esp.
    // for the env-credential path which still embeds its token in the URL.)
    if (error instanceof Error) {
      error.message = scrub(error.message);
      if (error.stack) {
        error.stack = scrub(error.stack);
      }
    }
    throw new Error(
      `Failed to clone user prompts repository: ${sanitizedError}`,
      { cause: error }
    );
  }
}

/**
 * Pull latest changes from the user prompts repository
 */
async function pullRepository(
  config: UserPromptsConfig,
  localPath: string,
  logger: Logger
): Promise<void> {
  const sanitizedUrl = sanitizeUrlForLogging(config.repoUrl);

  logger.debug('Pulling user prompts repository', {
    url: sanitizedUrl,
    localPath,
  });

  try {
    await pullRepo(localPath);

    logger.debug('Successfully pulled user prompts repository', {
      url: sanitizedUrl,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const sanitizedError = scrubCredentials(
      config.gitToken
        ? errorMessage.replaceAll(config.gitToken, '***')
        : errorMessage
    );

    logger.warn(
      'Failed to pull user prompts repository, using cached version',
      {
        url: sanitizedUrl,
        error: sanitizedError,
      }
    );
    // Don't throw - use cached version
  }
}

/**
 * Ensure the repository is cloned and up-to-date.
 *
 * Returns the path to the prompts directory within the repository, plus an
 * optional `isolatedRoot` the caller must remove after reading (set only for
 * the token-bearing isolation path below).
 *
 * PRD #621 M3 / Decision 2 (cache isolation): when `overrideToken` is present
 * (a request forwarded an X-Dot-AI-Git-Token), the clone is performed into a
 * unique throwaway directory and the shared `cacheState` is neither read nor
 * written. This guarantees an authenticated private clone is never served from
 * — nor written into — the shared unauthenticated cache slot for the same
 * (repoUrl, branch, subPath) coordinate, and that the token never enters the
 * cache key. Token-less requests use the shared cache exactly as before.
 */
async function ensureRepository(
  config: UserPromptsConfig,
  logger: Logger,
  forceRefresh: boolean = false,
  overrideToken?: string
): Promise<{ promptsDir: string; isolatedRoot?: string }> {
  if (overrideToken) {
    const isolatedRoot = createIsolatedCloneRoot();
    // Clone into a subdirectory of the 0700 root so the root's restrictive
    // permissions cover the authenticated clone (git creates `cloneDir` itself).
    const cloneDir = path.join(isolatedRoot, 'repo');
    logger.debug('Token-bearing override: cloning in isolation', {
      url: sanitizeUrlForLogging(config.repoUrl),
      branch: config.branch,
    });
    try {
      await cloneRepository(config, cloneDir, logger, overrideToken);
    } catch (error) {
      // Remove any partial clone before propagating so a failed authenticated
      // request leaves no isolated directory behind. With GIT_ASKPASS the token
      // is never written to disk, so a cleanup failure cannot leave a PAT
      // behind — but warn (don't swallow) for observability.
      try {
        fs.rmSync(isolatedRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn(
          'Failed to remove isolated clone directory after clone failure',
          {
            path: isolatedRoot,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          }
        );
      }
      throw error;
    }
    const promptsDir = config.subPath
      ? path.join(cloneDir, config.subPath)
      : cloneDir;
    return { promptsDir, isolatedRoot };
  }

  const localPath = getCacheDirectory();
  const now = Date.now();
  const ttlMs = config.cacheTtlSeconds * 1000;

  // Check if we need to clone or pull. The cache is invalidated when any of
  // (repoUrl, branch, subPath) differs from the cached entry so that, for
  // example, a future override with a different branch but the same repoUrl
  // won't serve stale content from the previous clone.
  const cacheMisses =
    cacheState !== null &&
    (cacheState.repoUrl !== config.repoUrl ||
      cacheState.branch !== config.branch ||
      cacheState.subPath !== config.subPath);
  if (!cacheState || !fs.existsSync(cacheState.localPath) || cacheMisses) {
    // First time, cache directory deleted, or cached coordinates differ - clone fresh
    if (cacheMisses) {
      logger.debug(
        'Cached repo coordinates differ from requested, re-cloning',
        {
          cachedUrl: sanitizeUrlForLogging(cacheState!.repoUrl),
          cachedBranch: cacheState!.branch,
          cachedSubPath: cacheState!.subPath,
          requestedUrl: sanitizeUrlForLogging(config.repoUrl),
          requestedBranch: config.branch,
          requestedSubPath: config.subPath,
        }
      );
    }
    await cloneRepository(config, localPath, logger);
    cacheState = {
      lastPullTime: now,
      localPath,
      repoUrl: config.repoUrl,
      branch: config.branch,
      subPath: config.subPath,
    };
  } else if (forceRefresh || now - cacheState.lastPullTime >= ttlMs) {
    // Cache expired or force refresh - pull
    await pullRepository(config, localPath, logger);
    cacheState.lastPullTime = now;
  } else {
    logger.debug('Using cached user prompts repository', {
      localPath,
      cacheAge: Math.round((now - cacheState.lastPullTime) / 1000),
      ttl: config.cacheTtlSeconds,
    });
  }

  // Return path to prompts directory (with optional subPath)
  return {
    promptsDir: config.subPath
      ? path.join(localPath, config.subPath)
      : localPath,
  };
}

const SKILL_FILE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file (before base64 encoding)
const SKILL_FILENAME = 'SKILL.md';

/**
 * Recursively collect all files in a skill folder (excluding SKILL.md at root),
 * returning them as base64-encoded PromptFile objects.
 */
function collectSkillFiles(
  dirPath: string,
  basePath: string,
  logger: Logger
): PromptFile[] {
  const files: PromptFile[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(basePath, fullPath);

    if (entry.isDirectory()) {
      files.push(...collectSkillFiles(fullPath, basePath, logger));
    } else if (entry.isFile()) {
      if (entry.name === SKILL_FILENAME && dirPath === basePath) continue;

      const stat = fs.statSync(fullPath);
      if (stat.size > SKILL_FILE_MAX_BYTES) {
        logger.warn('Skill file exceeds size limit, skipping', {
          file: relativePath,
          size: stat.size,
          limit: SKILL_FILE_MAX_BYTES,
        });
        continue;
      }

      const content = fs.readFileSync(fullPath);
      files.push({
        path: relativePath,
        content: content.toString('base64'),
      });
    }
  }

  return files;
}

/**
 * Load a skill folder (directory containing SKILL.md) as a Prompt with supporting files.
 * Returns null if the directory does not contain SKILL.md.
 */
function loadSkillFolder(
  dirPath: string,
  dirName: string,
  logger: Logger
): Prompt | null {
  const skillMdPath = path.join(dirPath, SKILL_FILENAME);

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const prompt = loadPromptFile(skillMdPath, 'user', dirName);

  const supportingFiles = collectSkillFiles(dirPath, dirPath, logger);

  if (supportingFiles.length > 0) {
    prompt.files = supportingFiles;
  }

  return prompt;
}

/**
 * Read flat `.md` prompt files and skill folders (directories with SKILL.md)
 * from a prompts directory into Prompt objects.
 *
 * Shared by the git-clone loader path and the PRD #647 ingested (uploaded)
 * source path so both resolve through ONE identical loader — the only
 * difference between a `?repo=` clone and an uploaded `?source=` is how the
 * directory was populated. The caller is responsible for ensuring the directory
 * exists.
 */
function loadPromptsFromDir(promptsDir: string, logger: Logger): Prompt[] {
  const entries = fs.readdirSync(promptsDir, { withFileTypes: true });
  const prompts: Prompt[] = [];
  const loadedNames = new Set<string>();

  // 1. Load flat .md files (existing behavior)
  const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
  for (const entry of mdFiles) {
    try {
      const filePath = path.join(promptsDir, entry.name);
      const prompt = loadPromptFile(filePath, 'user');
      prompts.push(prompt);
      loadedNames.add(prompt.name);
      logger.debug('Loaded user prompt', {
        name: prompt.name,
        file: entry.name,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Failed to load user prompt file, skipping', {
        file: entry.name,
        error: errorMessage,
      });
    }
  }

  // 2. Load skill folders (directories containing SKILL.md)
  const directories = entries.filter(
    e => e.isDirectory() && !e.name.startsWith('.')
  );
  for (const dir of directories) {
    try {
      const dirPath = path.join(promptsDir, dir.name);
      const prompt = loadSkillFolder(dirPath, dir.name, logger);
      if (prompt) {
        if (loadedNames.has(prompt.name)) {
          logger.warn(
            'Skill folder name collision with existing prompt, skipping',
            {
              name: prompt.name,
              dir: dir.name,
            }
          );
          continue;
        }
        prompts.push(prompt);
        loadedNames.add(prompt.name);
        logger.debug('Loaded user skill folder', {
          name: prompt.name,
          dir: dir.name,
          filesCount: prompt.files?.length ?? 0,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.warn('Failed to load skill folder, skipping', {
        dir: dir.name,
        error: errorMessage,
      });
    }
  }

  return prompts;
}

/**
 * Raised when a PER-REQUEST prompts-repo override (PRD #581/#621) fails to load —
 * e.g. the clone is rejected (missing/wrong forwarded credential) or the source is
 * unreachable. An env-var-configured repo failure falls back to built-in prompts,
 * but an override is an explicit caller request, so its failure must surface as an
 * error instead of silently returning fewer skills ("fail open" — issue #575).
 *
 * The `message` is already credential-scrubbed by the thrower, so callers may
 * surface it to clients directly.
 */
export class UserPromptsOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserPromptsOverrideError';
  }
}

/**
 * Load user prompts from a git repository.
 *
 * When `override` is supplied, fetches from that repository for this call only,
 * ignoring DOT_AI_USER_PROMPTS_REPO env vars. Otherwise, uses env-var configuration.
 *
 * Returns an empty array when not configured, or when an ENV-VAR-configured repo
 * fails to load (graceful fallback to built-in prompts). When a per-request
 * `override` fails to load, throws {@link UserPromptsOverrideError} instead — the
 * caller asked for that specific source, so the failure must not be swallowed.
 */
export async function loadUserPrompts(
  logger: Logger,
  forceRefresh: boolean = false,
  override?: UserPromptsOverride
): Promise<Prompt[]> {
  // PRD #647 D1/M3: an ingested-source override resolves from the in-memory
  // uploaded-source cache and is NEVER cloned. Short-circuit BEFORE
  // getUserPromptsConfigFromOverride, which would reject a non-http identifier
  // such as `local:<label>`. The render handler only sets this when the request
  // carries an explicit `?source=` signal, so the env-var and `?repo=` clone
  // paths below are untouched.
  if (override?.ingestedSource) {
    return loadIngestedPrompts(override.ingestedSource, logger);
  }

  let config: UserPromptsConfig | null;
  try {
    // Override validation can throw on bad scheme / traversal / branch — keep
    // the call inside the catch so a malformed per-request override returns
    // [] rather than propagating an exception to the caller.
    config = override
      ? getUserPromptsConfigFromOverride(override)
      : getUserPromptsConfig();
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    const safeMessage = scrubCredentials(rawMessage);
    // A per-request override that fails validation is an explicit caller request
    // gone wrong — surface it (issue #575). Env-var config failures fall back.
    if (override) {
      logger.error(
        'Per-request prompts override is invalid',
        new Error(safeMessage)
      );
      throw new UserPromptsOverrideError(safeMessage);
    }
    logger.error(
      'Failed to load user prompts, falling back to built-in only',
      new Error(safeMessage)
    );
    return [];
  }

  if (!config) {
    logger.debug(
      'User prompts not configured (DOT_AI_USER_PROMPTS_REPO not set)'
    );
    return [];
  }

  // PRD #621 M3 / Decision 2: a request-forwarded credential (override.gitToken)
  // triggers per-request cache isolation. Track the throwaway clone directory so
  // it is removed after the read (success-path cleanup; the failure path is
  // cleaned up inside ensureRepository).
  const overrideToken = override?.gitToken;
  let isolatedRoot: string | undefined;

  try {
    const ensured = await ensureRepository(
      config,
      logger,
      forceRefresh,
      overrideToken
    );
    const promptsDir = ensured.promptsDir;
    isolatedRoot = ensured.isolatedRoot;

    if (!fs.existsSync(promptsDir)) {
      logger.warn('User prompts directory not found in repository', {
        path: promptsDir,
        subPath: config.subPath,
      });
      return [];
    }

    // Load flat .md files and skill folders from the prompts directory.
    const prompts = loadPromptsFromDir(promptsDir, logger);

    logger.info('Loaded user prompts from repository', {
      total: prompts.length,
      url: sanitizeUrlForLogging(config.repoUrl),
    });

    return prompts;
  } catch (error) {
    // F5: scrub credentials before they reach loggers/callers. Underlying git
    // errors can echo the authenticated URL (with embedded token) verbatim.
    const rawMessage = error instanceof Error ? error.message : 'Unknown error';
    const safeMessage = scrubCredentials(
      config.gitToken
        ? rawMessage.replaceAll(config.gitToken, '***')
        : rawMessage
    );
    // A per-request override clone failure (bad/missing forwarded credential,
    // unreachable host, missing branch/subdir) must NOT silently fall back to
    // built-in prompts — the caller explicitly requested this source, so surface
    // the failure (issue #575). Env-var-configured repo failures still fall back.
    if (override) {
      logger.error(
        'Failed to load per-request prompts override',
        new Error(safeMessage)
      );
      throw new UserPromptsOverrideError(safeMessage);
    }
    logger.error(
      'Failed to load user prompts, falling back to built-in only',
      new Error(safeMessage)
    );
    return [];
  } finally {
    // PRD #621 M3 / Decision 2: remove the per-request isolated clone (if any)
    // so token-bearing override clones leave no on-disk residue. With
    // GIT_ASKPASS the token is never written to disk, so a failed cleanup
    // cannot leave a PAT behind — but warn (don't swallow) for observability.
    if (isolatedRoot) {
      try {
        fs.rmSync(isolatedRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('Failed to remove isolated clone directory', {
          path: isolatedRoot,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }
  }
}

/**
 * Clear the cache state (useful for testing)
 */
export function clearUserPromptsCache(): void {
  cacheState = null;
}

/**
 * Clear the ingested-source cache (PRD #647, useful for testing).
 * Only drops the in-memory registry; on-disk directories are left to be
 * overwritten by the next upload or cleaned with the tmp directory.
 */
export function clearIngestedPromptsSources(): void {
  ingestedSources.clear();
}

/**
 * Inspect the ingested-source cache (PRD #647, for testing/debugging).
 * Returns the scrubbed identifiers currently cached.
 */
export function getIngestedPromptsSources(): string[] {
  return [...ingestedSources.values()].map(entry => entry.source);
}

/**
 * Get current cache state (for testing/debugging)
 */
export function getUserPromptsCacheState(): CacheState | null {
  return cacheState ? { ...cacheState } : null;
}
