/**
 * Unit Tests: ingested prompts source (PRD #647 M2 + M3)
 *
 * Pins the server-side ingestion contract (.dot-agent-deck/647-contract.md):
 *   - D6: ingestPromptsSource accepts a JSON manifest with base64 file bodies,
 *     decodes and caches them keyed by the `source` identifier.
 *   - D1/M3: loadUserPrompts resolves an `ingestedSource` override from that
 *     cache and reads the uploaded files directly — a `local:<label>`
 *     identifier renders with NO git operation (it is intrinsically
 *     non-clonable, so a successful load proves the ingested path was taken).
 *   - D5 (minimal this round): a path-traversal file path is rejected before
 *     anything is cached.
 *
 * The end-to-end ingest→render round-trip against a live server is covered by
 * tests/integration/tools/prompts.test.ts.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  ingestPromptsSource,
  loadUserPrompts,
  clearIngestedPromptsSources,
  getIngestedPromptsSources,
  sanitizeIngestFileMode,
  PromptsSourceValidationError,
  IngestedSourceNotFoundError,
  MAX_INGESTED_SOURCES,
  type UserPromptsOverride,
} from '../../../src/core/user-prompts-loader';
import type { Logger } from '../../../src/core/error-handling';
import { handlePromptsListRequest } from '../../../src/tools/prompts';

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Unique identifier per test so the shared in-memory cache / on-disk dir never
// collide across cases or repeated runs.
let counter = 0;
function uniqueLabel(): string {
  counter += 1;
  return `local:unit-${process.pid}-${counter}`;
}

function skillManifestFile(skillName: string): {
  path: string;
  content: string;
  mode: string;
} {
  const skillMd = [
    '---',
    `name: ${skillName}`,
    'description: PRD 647 unit ingest fixture',
    'arguments:',
    '  - name: targetName',
    '    description: substituted at render time',
    '    required: true',
    '---',
    '',
    `Deploy {{targetName}} now.`,
  ].join('\n');
  return {
    path: `${skillName}/SKILL.md`,
    content: Buffer.from(skillMd, 'utf-8').toString('base64'),
    mode: '0644',
  };
}

describe('ingestPromptsSource (PRD #647 M2)', () => {
  beforeEach(() => {
    clearIngestedPromptsSources();
  });

  test('caches a decoded local: source and echoes the scrubbed identifier', () => {
    const source = uniqueLabel();
    const skillName = `skill-${counter}`;

    const result = ingestPromptsSource(
      {
        source,
        contentHash: 'sha256:deadbeef',
        files: [skillManifestFile(skillName)],
      },
      noopLogger
    );

    expect(result).toMatchObject({
      source,
      contentHash: 'sha256:deadbeef',
      fileCount: 1,
      status: 'ingested',
    });
    expect(getIngestedPromptsSources()).toContain(source);
  });

  test('rejects a missing/empty source identifier', () => {
    expect(() =>
      ingestPromptsSource(
        { source: '', files: [skillManifestFile('x')] },
        noopLogger
      )
    ).toThrow(PromptsSourceValidationError);
    expect(() =>
      ingestPromptsSource(
        { source: undefined, files: [skillManifestFile('x')] },
        noopLogger
      )
    ).toThrow(/source is required/);
  });

  test('rejects an empty or missing files array', () => {
    expect(() =>
      ingestPromptsSource({ source: uniqueLabel(), files: [] }, noopLogger)
    ).toThrow(/files is required/);
    expect(() =>
      ingestPromptsSource(
        { source: uniqueLabel(), files: undefined },
        noopLogger
      )
    ).toThrow(PromptsSourceValidationError);
  });

  test('rejects a path-traversal file path before caching (zip-slip guard)', () => {
    const source = uniqueLabel();
    expect(() =>
      ingestPromptsSource(
        {
          source,
          files: [
            {
              path: '../escape/SKILL.md',
              content: Buffer.from('x', 'utf-8').toString('base64'),
            },
          ],
        },
        noopLogger
      )
    ).toThrow(PromptsSourceValidationError);
    // Nothing was cached for the rejected upload.
    expect(getIngestedPromptsSources()).not.toContain(source);
  });
});

describe('loadUserPrompts ingested resolution (PRD #647 M3)', () => {
  beforeEach(() => {
    clearIngestedPromptsSources();
  });

  test('renders a local: ingested source with no git operation', async () => {
    const source = uniqueLabel();
    const skillName = `skill-${counter}`;
    ingestPromptsSource(
      { source, files: [skillManifestFile(skillName)] },
      noopLogger
    );

    // A `local:` identifier is non-clonable; reaching the git path would throw
    // an invalid-scheme error and return []. A populated result proves the
    // ingested branch served it directly.
    const override: UserPromptsOverride = {
      repoUrl: source,
      ingestedSource: source,
    };
    const prompts = await loadUserPrompts(noopLogger, false, override);

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({
      name: skillName,
      source: 'user',
      arguments: [{ name: 'targetName', required: true }],
    });
    expect(prompts[0].content).toContain('{{targetName}}');
  });

  test('throws re-upload guidance (no clone fallback) for an unknown ingested identifier (PRD #647 D2)', async () => {
    const override: UserPromptsOverride = {
      repoUrl: 'local:never-uploaded',
      ingestedSource: 'local:never-uploaded',
    };
    // D2: a missing ingested identifier must NOT silently fall back to [] (which
    // would surface the generic "Prompt not found"); it must throw actionable
    // re-upload guidance — and never a git/clone error (it is never cloned).
    // Capture the thrown error ONCE and assert both its type and message (N14).
    let caught: unknown;
    try {
      await loadUserPrompts(noopLogger, false, override);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IngestedSourceNotFoundError);
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toMatch(/re-?upload|upload/i);
    expect(message).toContain('/api/v1/prompts/sources');
    expect(message).not.toContain('Prompt not found');
    expect(message).not.toMatch(/scheme|clone|git/i);
  });
});

describe('handlePromptsListRequest ingested resolution (PRD #647 list-by-source)', () => {
  beforeEach(() => {
    clearIngestedPromptsSources();
  });

  test('enumerates an ingested source via override and echoes the identifier', async () => {
    const source = uniqueLabel();
    // A clearly novel name (not a built-in prompt) so a hit proves the LIST
    // enumerated the UPLOADED skill, not just the built-in set.
    const skillName = `wip-experimental-${counter}`;
    ingestPromptsSource(
      { source, files: [skillManifestFile(skillName)] },
      noopLogger
    );

    const override: UserPromptsOverride = {
      repoUrl: source,
      ingestedSource: source,
    };
    const result = await handlePromptsListRequest(
      {},
      noopLogger,
      'req-list-ingested',
      override
    );

    // data.source echoes the (scrubbed) ingested identifier, not an env coord.
    expect(result.source).toBe(source);
    const listed = result.prompts.find(p => p.name === skillName);
    expect(listed).toMatchObject({
      name: skillName,
      description: 'PRD 647 unit ingest fixture',
      arguments: [{ name: 'targetName', required: true }],
    });
  });

  test('re-throws IngestedSourceNotFoundError for an unknown identifier (PRD #647 D2)', async () => {
    // The list handler must surface the loader's re-upload guidance unchanged so
    // the REST layer maps it to 400 (not a generic 500 or silent built-in set).
    const override: UserPromptsOverride = {
      repoUrl: 'local:never-uploaded-list',
      ingestedSource: 'local:never-uploaded-list',
    };
    let caught: unknown;
    try {
      await handlePromptsListRequest({}, noopLogger, 'req-list-miss', override);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IngestedSourceNotFoundError);
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toMatch(/re-?upload|upload/i);
    expect(message).toContain('/api/v1/prompts/sources');
    expect(message).not.toContain('Prompt not found');
    expect(message).not.toMatch(/scheme|clone|git/i);
  });
});

describe('sanitizeIngestFileMode (PRD #647 D5 — mode-bit hardening)', () => {
  test('strips setuid/setgid/sticky special bits, keeping only rwx perms', () => {
    // setuid (04000) + 0755 → 0755; the setuid bit is gone.
    expect(sanitizeIngestFileMode('4755')).toBe(0o755);
    // setgid (02000) + 0755 → 0755.
    expect(sanitizeIngestFileMode('2755')).toBe(0o755);
    // sticky (01000) + 0777 → 0777.
    expect(sanitizeIngestFileMode('1777')).toBe(0o777);
    // all special bits + 0777 → 0777 (07777 masked to 0777).
    expect(sanitizeIngestFileMode('7777')).toBe(0o777);
  });

  test('preserves sane permission modes verbatim', () => {
    expect(sanitizeIngestFileMode('0644')).toBe(0o644);
    expect(sanitizeIngestFileMode('644')).toBe(0o644);
    expect(sanitizeIngestFileMode('0755')).toBe(0o755);
  });

  test('falls back to 0644 for absent/empty/unparseable modes', () => {
    expect(sanitizeIngestFileMode(undefined)).toBe(0o644);
    expect(sanitizeIngestFileMode('')).toBe(0o644);
    expect(sanitizeIngestFileMode('  ')).toBe(0o644);
    expect(sanitizeIngestFileMode('not-a-mode')).toBe(0o644);
    expect(sanitizeIngestFileMode(0o755)).toBe(0o644); // non-string → default
  });

  test('a sanitized mode never carries any special (setuid/setgid/sticky) bit', () => {
    for (const input of ['4755', '2750', '1777', '7777', '6644']) {
      const result = sanitizeIngestFileMode(input);
      expect(result & 0o7000).toBe(0);
    }
  });
});

describe('ingestPromptsSource hardening (PRD #647 M4 + D5)', () => {
  beforeEach(() => {
    clearIngestedPromptsSources();
  });

  test('short-circuits an unchanged re-upload with status "unchanged" (D3 dedup)', () => {
    const source = uniqueLabel();
    const skillName = `skill-${counter}`;
    const file = skillManifestFile(skillName);
    const contentHash = 'sha256:cafebabe';

    const first = ingestPromptsSource(
      { source, contentHash, files: [file] },
      noopLogger
    );
    expect(first).toMatchObject({ fileCount: 1, status: 'ingested' });

    // Same identifier + same contentHash → recognized as unchanged, NOT re-ingested.
    const second = ingestPromptsSource(
      { source, contentHash, files: [file] },
      noopLogger
    );
    expect(second).toMatchObject({
      source: first.source,
      contentHash,
      fileCount: 1,
      status: 'unchanged',
    });

    // A different hash for the same identifier is processed normally.
    const third = ingestPromptsSource(
      { source, contentHash: 'sha256:0ddba11', files: [file] },
      noopLogger
    );
    expect(third).toMatchObject({ status: 'ingested' });
  });

  test('rejects a manifest exceeding the file-count cap before caching (D5)', () => {
    const source = uniqueLabel();
    const files = [];
    for (let i = 0; i < 101; i++) {
      files.push({
        path: `pad/file-${i}.txt`,
        content: Buffer.from('x', 'utf-8').toString('base64'),
        mode: '0644',
      });
    }
    expect(() =>
      ingestPromptsSource({ source, files }, noopLogger)
    ).toThrow(PromptsSourceValidationError);
    expect(getIngestedPromptsSources()).not.toContain(source);
  });

  test('rejects a manifest exceeding the total decoded-size cap before caching (D5)', () => {
    const source = uniqueLabel();
    // One file whose decoded size (~300 KiB) is over the 256 KiB total cap.
    const big = 'X'.repeat(300 * 1024);
    expect(() =>
      ingestPromptsSource(
        {
          source,
          files: [
            {
              path: 'big/SKILL.md',
              content: Buffer.from(big, 'utf-8').toString('base64'),
              mode: '0644',
            },
          ],
        },
        noopLogger
      )
    ).toThrow(PromptsSourceValidationError);
    expect(getIngestedPromptsSources()).not.toContain(source);
  });

  // PRD #647 F3 — a NUL byte in a file path must be rejected with a validation
  // error (→ 400) BEFORE any fs write, because git-utils' sanitizeRelativePath
  // does not catch it and the raw `\0` would otherwise throw a TypeError → 500.
  test('rejects a null-byte file path before caching (F3)', () => {
    const source = uniqueLabel();
    expect(() =>
      ingestPromptsSource(
        {
          source,
          files: [
            {
              path: 'skill\0/SKILL.md',
              content: Buffer.from('x', 'utf-8').toString('base64'),
            },
          ],
        },
        noopLogger
      )
    ).toThrow(PromptsSourceValidationError);
    expect(getIngestedPromptsSources()).not.toContain(source);
  });

  test('null-byte rejection message mentions the null byte', () => {
    const source = uniqueLabel();
    let message = '';
    try {
      ingestPromptsSource(
        {
          source,
          files: [
            {
              path: 'a\0b.md',
              content: Buffer.from('x', 'utf-8').toString('base64'),
            },
          ],
        },
        noopLogger
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/null byte/i);
  });

  // PRD #647 F3 — a failed re-upload must NEVER destroy the previously-cached
  // entry. The first upload succeeds; a second upload for the SAME identifier
  // with an invalid (null-byte) path is rejected, and the original content must
  // still render unchanged afterwards (atomic write-then-promote).
  test('a failed re-upload leaves the prior cached entry intact (F3 atomicity)', async () => {
    const source = uniqueLabel();
    const skillName = `skill-${counter}`;
    ingestPromptsSource(
      { source, files: [skillManifestFile(skillName)] },
      noopLogger
    );

    // Re-upload the same identifier with a doomed manifest (null-byte path).
    expect(() =>
      ingestPromptsSource(
        {
          source,
          files: [
            {
              path: `${skillName}\0/SKILL.md`,
              content: Buffer.from('corrupt', 'utf-8').toString('base64'),
            },
          ],
        },
        noopLogger
      )
    ).toThrow(PromptsSourceValidationError);

    // The original entry is still cached and renders the original content.
    expect(getIngestedPromptsSources()).toContain(source);
    const prompts = await loadUserPrompts(noopLogger, false, {
      repoUrl: source,
      ingestedSource: source,
    });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({ name: skillName });
  });

  // PRD #647 N3 — duplicate paths in a manifest collapse to one file on disk,
  // so fileCount must count DISTINCT written paths, not raw manifest entries.
  test('fileCount counts distinct written paths, not duplicates (N3)', () => {
    const source = uniqueLabel();
    const skillName = `skill-${counter}`;
    const first = skillManifestFile(skillName);
    // Same path twice + one extra distinct path → 2 distinct paths.
    const result = ingestPromptsSource(
      {
        source,
        files: [
          first,
          { ...first }, // duplicate path
          {
            path: `${skillName}/extra.md`,
            content: Buffer.from('extra', 'utf-8').toString('base64'),
          },
        ],
      },
      noopLogger
    );
    expect(result.fileCount).toBe(2);
  });

  // PRD #647 F5 — the in-memory registry is LRU-bounded at MAX_INGESTED_SOURCES.
  // Uploading one more than the cap evicts the least-recently-used identifier,
  // whose later render then hits the D2 render-miss (re-upload) guidance.
  test('evicts the least-recently-used source past the cap (F5)', async () => {
    const labels: string[] = [];
    // Fill the cache to exactly the cap; the FIRST one is the LRU victim.
    for (let i = 0; i < MAX_INGESTED_SOURCES; i++) {
      const source = uniqueLabel();
      labels.push(source);
      ingestPromptsSource(
        { source, files: [skillManifestFile(`skill-${counter}`)] },
        noopLogger
      );
    }
    expect(getIngestedPromptsSources()).toHaveLength(MAX_INGESTED_SOURCES);

    // One more upload pushes the registry over the cap → evict the oldest.
    const overflow = uniqueLabel();
    ingestPromptsSource(
      { source: overflow, files: [skillManifestFile(`skill-${counter}`)] },
      noopLogger
    );

    expect(getIngestedPromptsSources()).toHaveLength(MAX_INGESTED_SOURCES);
    // The first-uploaded identifier was evicted; rendering it now yields the
    // D2 re-upload guidance, never a clone.
    await expect(
      loadUserPrompts(noopLogger, false, {
        repoUrl: labels[0],
        ingestedSource: labels[0],
      })
    ).rejects.toThrow(IngestedSourceNotFoundError);
    // The most-recent upload is still cached and renders.
    const prompts = await loadUserPrompts(noopLogger, false, {
      repoUrl: overflow,
      ingestedSource: overflow,
    });
    expect(prompts).toHaveLength(1);
  });
});
