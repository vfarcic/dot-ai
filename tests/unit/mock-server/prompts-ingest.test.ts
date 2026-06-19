/**
 * Unit Tests: Mock Server Prompts Source Ingestion (PRD #647 M6)
 *
 * Exercises the mock-server in-memory mirror of the source-ingestion endpoint
 * (POST /api/v1/prompts/sources) and the render-from-ingested path
 * (POST /api/v1/prompts/:name?source=). These mirror the real server's wire
 * contract so the CLI (vfarcic/dot-ai-cli #13) can integration-test
 * --repo-fetch / --repo-dir against the mock image.
 *
 * Validates: route precedence over :promptName, the ingest response shape,
 * D3 content-hash dedup, D5 caps + zip-slip rejection, credential scrubbing,
 * D2 render-miss guidance, and server-side argument substitution.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { matchRoute } from '../../../mock-server/routes';
import {
  IngestValidationError,
  IngestedSourceNotFoundError,
  PromptRenderError,
  MAX_INGEST_FILES,
  MAX_INGEST_TOTAL_BYTES,
  clearIngestedSources,
  ingestPromptsSource,
  listIngestedPrompts,
  renderIngestedPrompt,
} from '../../../mock-server/prompts-ingest';

const b64 = (s: string): string => Buffer.from(s, 'utf-8').toString('base64');

const skillMd = (
  name: string,
  opts: { description?: string; required?: boolean; body?: string } = {}
): string => {
  const description = opts.description ?? `PRD 647 fixture ${name}`;
  const lines = ['---', `name: ${name}`, `description: ${description}`];
  if (opts.required) {
    lines.push(
      'arguments:',
      '  - name: targetName',
      '    description: The resource to deploy',
      '    required: true'
    );
  }
  lines.push(
    '---',
    '',
    `# ${name}`,
    '',
    opts.body ?? 'Deploy {{targetName}} into the cluster now.'
  );
  return lines.join('\n');
};

describe('Mock Server Prompts Source Ingestion (PRD #647 M6)', () => {
  beforeEach(() => {
    clearIngestedSources();
  });

  describe('Route registration', () => {
    test('POST /api/v1/prompts/sources matches the sources route, not :promptName', () => {
      const result = matchRoute('POST', '/api/v1/prompts/sources');
      expect(result).not.toBeNull();
      expect(result!.route.path).toBe('/api/v1/prompts/sources');
      // No fixture: handled dynamically in-memory.
      expect(result!.route.fixture).toBeUndefined();
    });

    test('POST /api/v1/prompts/:promptName still matches other names', () => {
      const result = matchRoute('POST', '/api/v1/prompts/troubleshoot-pod');
      expect(result).not.toBeNull();
      expect(result!.route.path).toBe('/api/v1/prompts/:promptName');
      expect(result!.params.promptName).toBe('troubleshoot-pod');
    });
  });

  describe('ingestPromptsSource', () => {
    test('ingests a local: source and echoes scrubbed source, fileCount, status', () => {
      const result = ingestPromptsSource({
        source: 'local:team-dev',
        contentHash: 'sha256:abc',
        files: [{ path: 'demo/SKILL.md', content: b64(skillMd('demo')), mode: '0644' }],
      });
      expect(result).toEqual({
        source: 'local:team-dev',
        contentHash: 'sha256:abc',
        fileCount: 1,
        status: 'ingested',
      });
    });

    test('D3: re-uploading the same { source, contentHash } short-circuits as unchanged', () => {
      const source = 'local:dedup';
      const files = [{ path: 'd/SKILL.md', content: b64(skillMd('d')), mode: '0644' }];
      const first = ingestPromptsSource({ source, contentHash: 'sha256:h1', files });
      expect(first.status).toBe('ingested');

      const second = ingestPromptsSource({ source, contentHash: 'sha256:h1', files });
      expect(second).toMatchObject({ source, contentHash: 'sha256:h1', status: 'unchanged' });

      // A changed hash for the same identifier is processed normally.
      const third = ingestPromptsSource({ source, contentHash: 'sha256:h2', files });
      expect(third.status).toBe('ingested');
    });

    test('D5: rejects more than MAX_INGEST_FILES files before caching', () => {
      const files = [];
      for (let i = 0; i <= MAX_INGEST_FILES; i++) {
        files.push({ path: `pad/file-${i}.txt`, content: b64('x'), mode: '0644' });
      }
      expect(files.length).toBeGreaterThan(MAX_INGEST_FILES);
      expect(() => ingestPromptsSource({ source: 'local:count', files })).toThrow(
        IngestValidationError
      );
    });

    test('D5: rejects a manifest whose decoded payload exceeds MAX_INGEST_TOTAL_BYTES', () => {
      const oversized = 'X'.repeat(MAX_INGEST_TOTAL_BYTES + 1024);
      expect(() =>
        ingestPromptsSource({
          source: 'local:size',
          files: [{ path: 'big/SKILL.md', content: b64(oversized), mode: '0644' }],
        })
      ).toThrow(IngestValidationError);
    });

    test('D5: rejects traversal and absolute file paths (zip-slip)', () => {
      expect(() =>
        ingestPromptsSource({
          source: 'local:zipslip',
          files: [{ path: '../escape/SKILL.md', content: b64('hi'), mode: '0644' }],
        })
      ).toThrow(IngestValidationError);
      expect(() =>
        ingestPromptsSource({
          source: 'local:zipslip-abs',
          files: [{ path: '/etc/passwd', content: b64('hi'), mode: '0644' }],
        })
      ).toThrow(IngestValidationError);
    });

    test('rejects a missing source and an empty file list', () => {
      expect(() => ingestPromptsSource({ files: [] })).toThrow(IngestValidationError);
      expect(() =>
        ingestPromptsSource({ source: 'local:x', files: [] })
      ).toThrow(IngestValidationError);
    });

    test('M5: scrubs credentials from the echoed source and never leaks the token', () => {
      const token = 's3cr3t_tok';
      const result = ingestPromptsSource({
        source: `https://user:${token}@gitlab.corp.internal/team/skills.git`,
        files: [{ path: 'sec/SKILL.md', content: b64(skillMd('sec')), mode: '0644' }],
      });
      expect(result.source).toBe('https://***:***@gitlab.corp.internal/team/skills.git');
      expect(JSON.stringify(result)).not.toContain(token);
    });
  });

  describe('renderIngestedPrompt', () => {
    test('renders an ingested skill with server-side argument substitution', () => {
      ingestPromptsSource({
        source: 'local:render',
        files: [
          {
            path: 'ingest-skill/SKILL.md',
            content: b64(skillMd('ingest-skill', { description: 'desc-647', required: true })),
            mode: '0644',
          },
        ],
      });

      const rendered = renderIngestedPrompt('local:render', 'ingest-skill', {
        targetName: 'postgres',
      });
      expect(rendered).toMatchObject({
        description: 'desc-647',
        messages: [{ role: 'user', content: { type: 'text', text: expect.any(String) } }],
        source: 'local:render',
      });
      const text = rendered.messages[0].content.text;
      expect(text).toContain('Deploy postgres into the cluster');
      expect(text).not.toContain('{{targetName}}');
    });

    test('D2: render-miss returns clear re-upload guidance and no clone vocabulary', () => {
      let thrown: unknown;
      try {
        renderIngestedPrompt('local:never', 'ghost', {});
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(IngestedSourceNotFoundError);
      const message = (thrown as Error).message;
      expect(message).toMatch(/re-?upload|upload/i);
      expect(message).toContain('/api/v1/prompts/sources');
      expect(message).not.toContain('Prompt not found');
      expect(message).not.toMatch(/clone|git|scheme/i);
    });

    test('missing required argument is rejected', () => {
      ingestPromptsSource({
        source: 'local:args',
        files: [
          {
            path: 'needs-arg/SKILL.md',
            content: b64(skillMd('needs-arg', { required: true })),
            mode: '0644',
          },
        ],
      });
      expect(() => renderIngestedPrompt('local:args', 'needs-arg', {})).toThrow(
        PromptRenderError
      );
    });

    test('a cached source missing the requested skill yields Prompt not found', () => {
      ingestPromptsSource({
        source: 'local:partial',
        files: [{ path: 'present/SKILL.md', content: b64(skillMd('present')), mode: '0644' }],
      });
      expect(() => renderIngestedPrompt('local:partial', 'absent', {})).toThrow(
        /Prompt not found/
      );
    });

    test('sibling files in the skill folder are echoed base64 with folder-relative paths', () => {
      ingestPromptsSource({
        source: 'local:files',
        files: [
          { path: 'withfiles/SKILL.md', content: b64(skillMd('withfiles')), mode: '0644' },
          { path: 'withfiles/scripts/run.sh', content: b64('echo hi'), mode: '0755' },
        ],
      });
      const rendered = renderIngestedPrompt('local:files', 'withfiles', {
        targetName: 'x',
      });
      expect(rendered.files).toEqual([
        { path: 'scripts/run.sh', content: b64('echo hi') },
      ]);
    });
  });

  describe('listIngestedPrompts (PRD #647 list-by-source)', () => {
    test('enumerates an uploaded source in the frozen { name, description, arguments } shape', () => {
      ingestPromptsSource({
        source: 'local:list',
        files: [
          {
            path: 'wip-experimental/SKILL.md',
            content: b64(
              skillMd('wip-experimental', {
                description: 'A genuinely novel skill the CLI must enumerate',
                required: true,
              })
            ),
            mode: '0644',
          },
          // A sibling (non-SKILL.md) file is not itself an enumerable prompt.
          { path: 'wip-experimental/scripts/run.sh', content: b64('echo hi'), mode: '0755' },
        ],
      });

      const result = listIngestedPrompts('local:list');
      expect(result.source).toBe('local:list');
      expect(result.prompts).toEqual([
        {
          name: 'wip-experimental',
          description: 'A genuinely novel skill the CLI must enumerate',
          arguments: [
            {
              name: 'targetName',
              description: 'The resource to deploy',
              required: true,
            },
          ],
        },
      ]);
    });

    test('D2: an unknown/evicted source throws clear re-upload guidance, no clone vocabulary', () => {
      let thrown: unknown;
      try {
        listIngestedPrompts('local:never-uploaded');
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(IngestedSourceNotFoundError);
      const message = (thrown as Error).message;
      expect(message).toMatch(/re-?upload|upload/i);
      expect(message).toContain('/api/v1/prompts/sources');
      expect(message).not.toContain('Prompt not found');
      expect(message).not.toMatch(/clone|git|scheme/i);
    });

    test('M5: echoes the credential-scrubbed identifier as data.source', () => {
      ingestPromptsSource({
        source: 'https://user:s3cr3t@gitlab.corp.internal/team/skills.git',
        files: [
          { path: 'sec/SKILL.md', content: b64(skillMd('sec')), mode: '0644' },
        ],
      });
      const result = listIngestedPrompts(
        'https://user:s3cr3t@gitlab.corp.internal/team/skills.git'
      );
      expect(result.source).toBe(
        'https://***:***@gitlab.corp.internal/team/skills.git'
      );
      expect(JSON.stringify(result)).not.toContain('s3cr3t');
    });
  });
});
