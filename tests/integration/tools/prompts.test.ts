/**
 * Integration Test: Prompts
 *
 * Tests the prompts REST API endpoints against a real test cluster.
 * Validates prompts list and get functionality with exact data validation.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Prompts Integration', () => {
  const integrationTest = new IntegrationTest();

  // Detect deployment mode based on MCP_BASE_URL (parse hostname to avoid substring matching issues)
  const isInClusterMode = (() => {
    try {
      const url = new URL(process.env.MCP_BASE_URL || '');
      return url.hostname.endsWith('.nip.io') || url.hostname === 'nip.io';
    } catch {
      return false;
    }
  })();

  // Exact list of all built-in prompts with their metadata
  const expectedBuiltInPrompts = [
    {
      name: 'generate-cicd',
      description:
        'Generate intelligent CI/CD workflows through interactive conversation by analyzing repository structure and user preferences',
    },
    {
      name: 'generate-dockerfile',
      description:
        'Generate production-ready, secure, multi-stage Dockerfile and .dockerignore for any project',
    },
    {
      name: 'prd-close',
      description:
        'Close a PRD that is already implemented or no longer needed',
    },
    {
      name: 'prd-create',
      description:
        'Create documentation-first PRDs that guide development through user-facing content',
    },
    {
      name: 'prd-done',
      description:
        'Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue',
    },
    {
      name: 'prd-full',
      description:
        'Run a PRD end-to-end autonomously — start, iterate until done, then create a PR. Stops after PR creation for manual review.',
      arguments: [
        {
          name: 'prdNumber',
          description:
            'PRD number to implement (e.g., 306). Required — no auto-detection.',
          required: true,
        },
        {
          name: 'mode',
          description:
            "Isolation strategy for this PRD's work. Must be `branch` or `worktree`. Pre-answers the branch-vs-worktree decision in `/prd-start`.",
          required: true,
        },
      ],
      // prd-full has required arguments — the Prompts Get test must supply
      // them or the server returns success: false.
      testArgs: { prdNumber: '306', mode: 'branch' },
    },
    {
      name: 'prd-next',
      description:
        'Analyze existing PRD to identify and recommend the single highest-priority task to work on next',
    },
    {
      name: 'prd-start',
      description: 'Start working on a PRD implementation',
      arguments: [
        {
          name: 'prdNumber',
          description: 'PRD number to start working on (e.g., 306)',
          required: false,
        },
      ],
    },
    {
      name: 'prd-update-decisions',
      description:
        'Update PRD based on design decisions and strategic changes made during conversations',
    },
    {
      name: 'prd-update-progress',
      description:
        'Update PRD progress based on git commits and code changes, enhanced by conversation context',
    },
    {
      name: 'prds-get',
      description:
        "Fetch all open GitHub issues from this project that have the 'PRD' label",
    },
  ];

  // User prompts loaded from git repository (user-prompts/ directory)
  const expectedUserPrompts = [
    { name: 'eval-analyze-test-failure', description: 'Analyze Test Failure' },
    {
      name: 'eval-run',
      description: 'Run AI Model Evaluations',
      arguments: [
        {
          name: 'toolType',
          description:
            'Evaluation type (capabilities, policies, patterns, remediation, recommendation)',
          required: false,
        },
        {
          name: 'models',
          description:
            'Comma-separated list of models (sonnet, gpt, gemini, gemini-flash, grok)',
          required: false,
        },
      ],
    },
    {
      name: 'eval-update-model-metadata',
      description: 'Update Model Metadata Command',
    },
    {
      name: 'test-skill',
      description: 'Test skill for folder-based skills integration tests',
      expectedFiles: ['helper.sh'],
    },
  ];

  // Combined list of all prompts (built-in + user)
  const expectedPrompts = [...expectedBuiltInPrompts, ...expectedUserPrompts];

  beforeAll(async () => {
    // Verify we're using the test environment (either kubeconfig or in-cluster)
    if (!isInClusterMode) {
      const kubeconfig = process.env.KUBECONFIG;
      expect(kubeconfig).toContain('kubeconfig-test.yaml');
    }

    // Warm-up: Make a single prompts request to ensure git clone completes
    // before running tests. This prevents race conditions when user prompts
    // are loaded from a git repository.
    await integrationTest.httpClient.get('/api/v1/prompts');
  });

  describe('Prompts List', () => {
    test('should return 11 built-in prompts + 4 user prompts with correct metadata', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts');

      // expectedFiles and testArgs are test-only fields and must not be passed
      // to the API-shape matcher.
      const expectedListResponse = {
        success: true,
        data: {
          prompts: expect.arrayContaining(
            expectedPrompts.map(
              ({ expectedFiles: _e, testArgs: _t, ...rest }) =>
                expect.objectContaining(rest)
            )
          ),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1',
        },
      };

      expect(response).toMatchObject(expectedListResponse);
      expect(response.data.prompts).toMatchObject({ length: 15 });
    });
  });

  describe('Prompts Get', () => {
    // Test each prompt individually (including folder-based skills with files)
    test.each(expectedPrompts)(
      'should return prompt content for $name',
      async ({ name, description, expectedFiles, testArgs }) => {
        const response = await integrationTest.httpClient.post(
          `/api/v1/prompts/${name}`,
          testArgs ? { arguments: testArgs } : {}
        );

        const expectedGetResponse = {
          success: true,
          data: {
            description: description,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: expect.any(String),
                },
              },
            ],
          },
          meta: {
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            requestId: expect.stringMatching(/^rest_\d+_\d+$/),
            version: 'v1',
          },
        };

        expect(response).toMatchObject(expectedGetResponse);
        // Verify content is non-empty
        expect(response.data.messages[0].content.text.length).toBeGreaterThan(
          100
        );

        // Verify files field for folder-based skills vs flat prompts
        if (expectedFiles) {
          expect(response.data).toMatchObject({
            files: expectedFiles.map((filePath: string) => ({
              path: filePath,
              content: expect.any(String),
            })),
          });
          // Verify base64 content decodes to non-empty string
          for (const file of response.data.files) {
            const decoded = Buffer.from(file.content, 'base64').toString(
              'utf-8'
            );
            expect(decoded.length).toBeGreaterThan(0);
          }
        } else {
          expect(response.data).toMatchObject(
            expect.not.objectContaining({ files: expect.anything() })
          );
        }
      }
    );

    test('should return error for non-existent prompt', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/non-existent-prompt',
        {}
      );

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prompt not found: non-existent-prompt',
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1',
        },
      };

      expect(response).toMatchObject(expectedErrorResponse);
    });
  });

  describe('Prompt Arguments', () => {
    test('should return prd-start with arguments metadata in list', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts');

      const prdStartPrompt = response.data.prompts.find(
        (p: { name: string }) => p.name === 'prd-start'
      );
      expect(prdStartPrompt).toBeDefined();
      expect(prdStartPrompt.arguments).toEqual([
        {
          name: 'prdNumber',
          description: 'PRD number to start working on (e.g., 306)',
          required: false,
        },
      ]);
    });

    test('should return prd-start content without argument (placeholder remains)', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/prd-start',
        {}
      );

      expect(response.success).toBe(true);
      // Without argument, the placeholder should remain in the content
      expect(response.data.messages[0].content.text).toContain('{{prdNumber}}');
    });

    test('should substitute argument when provided to prd-start', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/prd-start',
        {
          arguments: { prdNumber: '306' },
        }
      );

      expect(response.success).toBe(true);
      // With argument, the placeholder should be substituted
      expect(response.data.messages[0].content.text).not.toContain(
        '{{prdNumber}}'
      );
      expect(response.data.messages[0].content.text).toContain('306');
    });
  });

  describe('Prompts Cache Refresh', () => {
    const gitToken = process.env.DOT_AI_GIT_TOKEN;
    const testRunId = Date.now();
    const testPromptName = `test-cache-refresh-${testRunId}`;
    const testPromptPath = `user-prompts/${testPromptName}.md`;
    const testPromptContent = [
      '---',
      `name: ${testPromptName}`,
      'description: Temporary prompt for cache refresh integration test',
      '---',
      '',
      'This is a temporary prompt used by integration tests. If you see this file, it was not cleaned up properly.',
    ].join('\n');

    // GitHub API helper to create a file in the test-prompts repo
    async function createFileInRepo(): Promise<string> {
      const res = await fetch(
        `https://api.github.com/repos/vfarcic/dot-ai-test-prompts/contents/${testPromptPath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${gitToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'test: add temporary prompt for cache refresh test',
            content: Buffer.from(testPromptContent).toString('base64'),
          }),
        }
      );
      expect(res.ok).toBe(true);
      const data = await res.json();
      return data.content.sha;
    }

    // GitHub API helper to delete a file from the test-prompts repo
    async function deleteFileFromRepo(sha: string): Promise<void> {
      const res = await fetch(
        `https://api.github.com/repos/vfarcic/dot-ai-test-prompts/contents/${testPromptPath}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `token ${gitToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: 'test: remove temporary prompt for cache refresh test',
            sha,
          }),
        }
      );
      expect(res.ok).toBe(true);
    }

    test('should refresh cache and pick up new prompts from repository', async () => {
      // Skip if no git token (can only test with write access to test-prompts repo)
      if (!gitToken) {
        console.log('Skipping cache refresh test: DOT_AI_GIT_TOKEN not set');
        return;
      }

      let fileSha: string | undefined;

      try {
        // Step 1: Record initial prompt count
        const initialList =
          await integrationTest.httpClient.get('/api/v1/prompts');
        expect(initialList).toMatchObject({ success: true });
        const initialCount = initialList.data.prompts.length;

        // Step 2: Push a new prompt to the repo
        fileSha = await createFileInRepo();

        // Step 3: Verify list still returns cached (old) count
        const cachedList =
          await integrationTest.httpClient.get('/api/v1/prompts');
        expect(cachedList.data.prompts.length).toBe(initialCount);

        // Step 4: Call refresh
        const refreshResponse = await integrationTest.httpClient.post(
          '/api/v1/prompts/refresh',
          {}
        );
        expect(refreshResponse).toMatchObject({
          success: true,
          data: {
            refreshed: true,
            promptsLoaded: expect.any(Number),
            // PRD #581: source is now the env-var URL when configured, or
            // "built-in" when no env-var repo is set. The integration test
            // env always sets DOT_AI_USER_PROMPTS_REPO, so we expect a URL.
            source: expect.stringMatching(/^https?:\/\/|^built-in$/),
          },
          meta: {
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            requestId: expect.stringMatching(/^rest_\d+_\d+$/),
            version: 'v1',
          },
        });

        // Step 5: Verify list now includes the new prompt
        const refreshedList =
          await integrationTest.httpClient.get('/api/v1/prompts');
        expect(refreshedList.data.prompts.length).toBe(initialCount + 1);
        const newPrompt = refreshedList.data.prompts.find(
          (p: { name: string }) => p.name === testPromptName
        );
        expect(newPrompt).toMatchObject({
          name: testPromptName,
          description: 'Temporary prompt for cache refresh integration test',
        });
      } finally {
        // Step 6: Always clean up — remove the test prompt from the repo
        if (fileSha) {
          await deleteFileFromRepo(fileSha);
          // Refresh again to restore the server cache to clean state
          await integrationTest.httpClient.post('/api/v1/prompts/refresh', {});
        }
      }
    }, 300000);

    test('should reject GET method for refresh endpoint', async () => {
      const response = await integrationTest.httpClient.get(
        '/api/v1/prompts/refresh'
      );

      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('Only POST method allowed'),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1',
        },
      });
    });
  });

  describe('HTTP Method Validation', () => {
    test('should reject POST for prompts list endpoint', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts',
        {}
      );

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('Only GET method allowed'),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1',
        },
      };

      expect(response).toMatchObject(expectedErrorResponse);
    });

    test('should reject GET for prompt get endpoint', async () => {
      const response = await integrationTest.httpClient.get(
        '/api/v1/prompts/generate-dockerfile'
      );

      const expectedErrorResponse = {
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('Only POST method allowed'),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.stringMatching(/^rest_\d+_\d+$/),
          version: 'v1',
        },
      };

      expect(response).toMatchObject(expectedErrorResponse);
    });
  });

  describe('Per-request override (PRD #581)', () => {
    // The integration test infra sets DOT_AI_USER_PROMPTS_REPO and
    // DOT_AI_USER_PROMPTS_PATH=user-prompts. A REST override only carries
    // repoUrl (the wire contract for M2 — branch/subPath stay at defaults),
    // so any happy-path override invalidates the loader cache via the
    // (repoUrl, branch, subPath) cache key. That re-clone races against the
    // 'Prompts Cache Refresh' test in this file AND against any other
    // integration file that touches /api/v1/prompts — vitest's fork pool
    // runs files in parallel against the same deployed server, so even a
    // separate non-concurrent file (PRD #581 F5) races. The happy-path
    // override response shape (source echo, override threading) is
    // therefore covered by:
    //   - the unit-level loader tests in tests/unit/core/user-prompts-loader.test.ts
    //     (which exercise the full override flow with the git boundary
    //     mocked, so cache state is process-local and isolated)
    //   - the unit-level computePromptsSource tests in
    //     tests/unit/core/user-prompts-source.test.ts (which pin the wire
    //     contract for the `source` field — including credential scrubbing)
    //   - the mock-server unit tests in tests/unit/mock-server/fixtures.test.ts
    //     (which prove the wire contract end-to-end against the fixture
    //     server the CLI tests against)
    //
    // What we CAN test at the REST integration level without touching the
    // user-prompts cache are the validation paths (rejected before any clone)
    // and the no-override source value. Those are exercised below.

    test('GET /api/v1/prompts without ?repo returns source from env-var config', async () => {
      const response = await integrationTest.httpClient.get('/api/v1/prompts');
      expect(response).toMatchObject({
        success: true,
        data: {
          prompts: expect.any(Array),
          // Real server sets DOT_AI_USER_PROMPTS_REPO so source is a URL.
          source: expect.stringMatching(/^https?:\/\//),
        },
      });
    });

    test('GET /api/v1/prompts?repo=ssh://... returns 400 with credential-safe message', async () => {
      const response = await integrationTest.httpClient.get(
        `/api/v1/prompts?repo=${encodeURIComponent('ssh://git@github.com/example/repo.git')}`
      );
      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('scheme'),
        },
      });
    });

    test('GET /api/v1/prompts?repo=<url-with-token-and-bad-scheme> scrubs token from validation error', async () => {
      const secret = 'rest_test_secret_token_xyz';
      // Bad scheme so we hit the 400 path; the response must not echo the
      // secret embedded in the URL.
      const credUrl = `ssh://user:${secret}@github.com/example/repo.git`;
      const response = await integrationTest.httpClient.get(
        `/api/v1/prompts?repo=${encodeURIComponent(credUrl)}`
      );
      expect(response).toMatchObject({ success: false });
      expect(JSON.stringify(response)).not.toContain(secret);
    });

    test('POST /api/v1/prompts/refresh with body.repo=ssh://... returns 400', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/refresh',
        { repo: 'ssh://git@github.com/example/repo.git' }
      );
      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('scheme'),
        },
      });
    });

    // F2: type-checking guards against the server crashing to 500 on a
    // malformed body. `repo` MUST be a string per the wire contract.
    test('POST /api/v1/prompts/refresh with body.repo as array returns 400 (not 500)', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/refresh',
        { repo: ['https://github.com/a/b.git', 'https://github.com/c/d.git'] }
      );
      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('repo must be a string'),
        },
      });
    });

    test('POST /api/v1/prompts/refresh with body.repo as number returns 400 (not 500)', async () => {
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/refresh',
        { repo: 42 }
      );
      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('repo must be a string'),
        },
      });
    });

    test('POST /api/v1/prompts/:name?repo=ssh://... returns 400', async () => {
      const response = await integrationTest.httpClient.post(
        `/api/v1/prompts/prd-create?repo=${encodeURIComponent('ssh://git@github.com/example/repo.git')}`,
        {}
      );
      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('scheme'),
        },
      });
    });

    test('POST /api/v1/prompts/:name?repo=<url-with-token-and-bad-scheme> scrubs token from response', async () => {
      const secret = 'name_test_secret_xyz';
      const credUrl = `ssh://user:${secret}@github.com/example/repo.git`;
      const response = await integrationTest.httpClient.post(
        `/api/v1/prompts/prd-create?repo=${encodeURIComponent(credUrl)}`,
        {}
      );
      expect(response).toMatchObject({ success: false });
      expect(JSON.stringify(response)).not.toContain(secret);
    });
  });

  // PRD #621 M1: the override must also carry a subdirectory (?path= / body
  // `path`) and a branch (?branch= / body `branch`), threaded into
  // candidate.subPath / candidate.branch inside extractPromptsOverride and
  // HONORED by the clone. Today extractPromptsOverride builds `{ repoUrl }`
  // only (rest-api.ts ~line 1900) and the handlers pass only `repo`, so the
  // five tests below are RED until M1 lands.
  //
  // Cache/race note (extends the PRD #581 comment above): a happy-path override
  // re-clones into the SINGLE shared cache directory (getCacheDirectory() is
  // NOT keyed by coordinate) and overwrites the loader's
  // (repoUrl, branch, subPath) cacheState. The integration server is shared
  // across all test files, so a concurrent plain /api/v1/prompts request can
  // re-clone the env-var coordinate into the same directory mid-read. To keep
  // these deterministic we:
  //   - observe each override within a SINGLE request (that request's response
  //     reflects its own clone+read),
  //   - retry the observation a few times (expectEventually) to absorb a
  //     transient concurrent re-clone, and
  //   - restore the env-var cache (refresh with no override) in finally/afterAll.
  // The fixture — a uniquely-named prompt committed to a throwaway branch under
  // a non-default subdirectory — is created via the GitHub API exactly like the
  // 'Prompts Cache Refresh' test above, and only when DOT_AI_GIT_TOKEN is set.
  describe('Per-request path + branch override (PRD #621 M1)', () => {
    const gitToken = process.env.DOT_AI_GIT_TOKEN;
    // Must match DOT_AI_USER_PROMPTS_REPO from the integration infra so the
    // override changes only branch/subPath (not repoUrl) vs. the env config.
    const promptsRepoUrl =
      'https://github.com/vfarcic/dot-ai-test-prompts.git';
    const ghRepoApi =
      'https://api.github.com/repos/vfarcic/dot-ai-test-prompts';

    const overrideRunId = Date.now();
    const fixtureBranch = `prd621-fixture-${overrideRunId}`;
    const fixtureSubdir = 'prd621-skills';
    const fixturePromptName = `prd621-override-${overrideRunId}`;
    const fixtureDescription =
      'PRD 621 fixture prompt: subdir on a non-default branch';
    const fixturePromptPath = `${fixtureSubdir}/${fixturePromptName}.md`;
    const fixturePromptContent = [
      '---',
      `name: ${fixturePromptName}`,
      `description: ${fixtureDescription}`,
      '---',
      '',
      'This prompt lives ONLY on a non-default branch under a non-default',
      'subdirectory. It is reachable only when BOTH ?path= and ?branch= are',
      'threaded into the override and honored by the clone (PRD #621 M1).',
    ].join('\n');

    let fixtureReady = false;

    async function ghApi(method: string, apiPath: string, body?: unknown) {
      return fetch(`${ghRepoApi}${apiPath}`, {
        method,
        headers: {
          Authorization: `token ${gitToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    }

    // Refresh with NO override restores the loader cacheState to the env-var
    // coordinate (repoUrl, main, user-prompts) without changing it, undoing any
    // coordinate drift left by an override request.
    async function restoreEnvCache(): Promise<void> {
      await integrationTest.httpClient.post('/api/v1/prompts/refresh', {});
    }

    // Retry an assertion block to absorb a transient concurrent re-clone of the
    // shared cache directory (see cache/race note above). In RED the assertion
    // never passes, so this just delays the (expected) final failure.
    async function expectEventually(
      fn: () => Promise<void>,
      attempts = 5,
      delayMs = 1500
    ): Promise<void> {
      let lastError: unknown;
      for (let i = 0; i < attempts; i++) {
        try {
          await fn();
          return;
        } catch (error) {
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      throw lastError;
    }

    beforeAll(async () => {
      if (!gitToken) return;

      // 1. Resolve main's commit SHA.
      const refRes = await ghApi('GET', '/git/ref/heads/main');
      expect(refRes.ok).toBe(true);
      const refData = (await refRes.json()) as { object: { sha: string } };

      // 2. Create the throwaway fixture branch off main.
      const branchRes = await ghApi('POST', '/git/refs', {
        ref: `refs/heads/${fixtureBranch}`,
        sha: refData.object.sha,
      });
      expect(branchRes.ok).toBe(true);

      // 3. Commit the fixture prompt under the non-default subdirectory on it.
      const fileRes = await ghApi('PUT', `/contents/${fixturePromptPath}`, {
        message: 'test: add PRD #621 path/branch override fixture',
        content: Buffer.from(fixturePromptContent).toString('base64'),
        branch: fixtureBranch,
      });
      expect(fileRes.ok).toBe(true);

      fixtureReady = true;
    });

    afterAll(async () => {
      if (!fixtureReady) return;
      // Deleting the branch removes the fixture file with it.
      await ghApi('DELETE', `/git/refs/heads/${fixtureBranch}`);
      // Leave the server cache on the env-var coordinate for other test files.
      await restoreEnvCache();
    });

    test('GET /api/v1/prompts?path=&branch= resolves a prompt from the subdir on the non-default branch (PRD #621)', async () => {
      if (!gitToken) {
        console.log(
          'Skipping PRD #621 path/branch GET test: DOT_AI_GIT_TOKEN not set'
        );
        return;
      }
      try {
        await expectEventually(async () => {
          const response = await integrationTest.httpClient.get(
            `/api/v1/prompts?repo=${encodeURIComponent(promptsRepoUrl)}` +
              `&path=${encodeURIComponent(fixtureSubdir)}` +
              `&branch=${encodeURIComponent(fixtureBranch)}`
          );
          expect(response).toMatchObject({ success: true });
          const fixturePrompt = response.data.prompts.find(
            (p: { name: string }) => p.name === fixturePromptName
          );
          // RED until M1: ?path=/?branch= are dropped, the clone reads repo
          // ROOT on MAIN, and this prompt is absent (fixturePrompt undefined).
          expect(fixturePrompt).toMatchObject({
            name: fixturePromptName,
            description: fixtureDescription,
          });
        });
      } finally {
        await restoreEnvCache();
      }
    }, 120000);

    // End-to-end exercise of the real git clone-with-token path (PRD #621 M3).
    // This is the ONLY e2e coverage of the credential clone: every other
    // positive token test mocks simple-git. The token-vs-env auth distinction
    // is deliberately NOT asserted (no private/second-realm repo is available in
    // CI), so this does NOT prove "the token authenticated where env would not".
    // Instead it sends the credential header alongside ?path=/?branch= so M2
    // reads it and M3 threads it into an ISOLATED, per-request token-bearing
    // clone (GIT_ASKPASS keeps the token off the URL/argv/.git/config;
    // http.followRedirects is scoped to the source host) — then asserts the
    // distinct subdir@branch prompt still resolves and the token never leaks.
    // The point: prove the credential mechanism (GIT_ASKPASS / redirect config)
    // does NOT break cloning the public fixture, end to end. It would catch a
    // regression where, e.g., followRedirects=false blocks git's normal
    // github.com -> codeload redirect and the clone silently yields no prompts.
    test('GET /api/v1/prompts?path=&branch= with X-Dot-AI-Git-Token clones the subdir/branch prompt end-to-end without leaking the token (PRD #621 M3)', async () => {
      if (!gitToken) {
        console.log(
          'Skipping PRD #621 M3 token-clone e2e test: DOT_AI_GIT_TOKEN not set'
        );
        return;
      }
      try {
        await expectEventually(async () => {
          const response = await integrationTest.httpClient.get(
            `/api/v1/prompts?repo=${encodeURIComponent(promptsRepoUrl)}` +
              `&path=${encodeURIComponent(fixtureSubdir)}` +
              `&branch=${encodeURIComponent(fixtureBranch)}`,
            // Real env token: guarantees the public clone succeeds (so a failure
            // means the credential MECHANISM broke the clone, not bad auth).
            { 'X-Dot-AI-Git-Token': gitToken }
          );
          expect(response).toMatchObject({ success: true });
          // The distinct subdir@branch prompt resolves through the token-bearing
          // isolated clone.
          const fixturePrompt = response.data.prompts.find(
            (p: { name: string }) => p.name === fixturePromptName
          );
          expect(fixturePrompt).toMatchObject({
            name: fixturePromptName,
            description: fixtureDescription,
          });
          // The forwarded credential must never appear in the response surface
          // (source, error, or anywhere).
          expect(JSON.stringify(response)).not.toContain(gitToken);
        });
      } finally {
        await restoreEnvCache();
      }
    }, 120000);

    test('POST /api/v1/prompts/:name?path=&branch= returns the subdir/branch prompt content (PRD #621)', async () => {
      if (!gitToken) {
        console.log(
          'Skipping PRD #621 path/branch get-by-name test: DOT_AI_GIT_TOKEN not set'
        );
        return;
      }
      try {
        await expectEventually(async () => {
          const response = await integrationTest.httpClient.post(
            `/api/v1/prompts/${fixturePromptName}` +
              `?repo=${encodeURIComponent(promptsRepoUrl)}` +
              `&path=${encodeURIComponent(fixtureSubdir)}` +
              `&branch=${encodeURIComponent(fixtureBranch)}`,
            {}
          );
          // RED until M1: path/branch dropped → prompt not found → 400.
          expect(response).toMatchObject({
            success: true,
            data: {
              description: fixtureDescription,
              messages: [
                {
                  role: 'user',
                  content: { type: 'text', text: expect.any(String) },
                },
              ],
            },
          });
        });
      } finally {
        await restoreEnvCache();
      }
    }, 120000);

    test('POST /api/v1/prompts/refresh honors path and branch body fields (PRD #621)', async () => {
      if (!gitToken) {
        console.log(
          'Skipping PRD #621 refresh body path/branch test: DOT_AI_GIT_TOKEN not set'
        );
        return;
      }
      try {
        await expectEventually(async () => {
          // Control: same branch, a subdirectory that does NOT exist on it →
          // built-in prompts only (no user prompts loaded).
          const controlRes = await integrationTest.httpClient.post(
            '/api/v1/prompts/refresh',
            {
              repo: promptsRepoUrl,
              path: `${fixtureSubdir}-absent-${overrideRunId}`,
              branch: fixtureBranch,
            }
          );
          expect(controlRes).toMatchObject({
            success: true,
            data: { refreshed: true, promptsLoaded: expect.any(Number) },
          });

          // Fixture: the subdirectory that DOES exist on the branch →
          // built-in prompts + exactly the one fixture prompt.
          const fixtureRes = await integrationTest.httpClient.post(
            '/api/v1/prompts/refresh',
            {
              repo: promptsRepoUrl,
              path: fixtureSubdir,
              branch: fixtureBranch,
            }
          );
          expect(fixtureRes).toMatchObject({
            success: true,
            data: {
              refreshed: true,
              promptsLoaded: expect.any(Number),
              source: expect.stringContaining('dot-ai-test-prompts'),
            },
          });

          // RED until M1: body path/branch are dropped, so BOTH refreshes
          // clone repo ROOT on MAIN and load the same count → the +1 from the
          // fixture subdir never appears.
          expect(fixtureRes.data.promptsLoaded).toBe(
            controlRes.data.promptsLoaded + 1
          );
        });
      } finally {
        await restoreEnvCache();
      }
    }, 180000);

    test('GET /api/v1/prompts?path=<traversal> returns 400 with scrubbed credentials and leaves the env cache intact (PRD #621)', async () => {
      const secret = 'prd621_path_secret_xyz';
      const credUrl = `https://user:${secret}@github.com/vfarcic/dot-ai-test-prompts.git`;

      const before = await integrationTest.httpClient.get('/api/v1/prompts');
      expect(before).toMatchObject({ success: true });

      // RED until M1: ?path= is dropped, the override validates on repoUrl
      // alone, and the traversal subPath is never rejected (no 400).
      const response = await integrationTest.httpClient.get(
        `/api/v1/prompts?repo=${encodeURIComponent(credUrl)}` +
          `&path=${encodeURIComponent('../../etc/passwd')}`
      );
      expect(response).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      // The embedded credential must never reach the response.
      expect(JSON.stringify(response)).not.toContain(secret);

      // A request rejected BEFORE any clone must not corrupt the env-var cache:
      // the env config still serves the same prompts and source afterwards.
      const after = await integrationTest.httpClient.get('/api/v1/prompts');
      expect(after).toMatchObject({
        success: true,
        data: { source: before.data.source },
      });
      expect(after.data.prompts.length).toBe(before.data.prompts.length);
    }, 120000);

    test('POST /api/v1/prompts/refresh with invalid branch returns 400 with scrubbed credentials (PRD #621)', async () => {
      const secret = 'prd621_branch_secret_xyz';
      const credUrl = `https://user:${secret}@github.com/vfarcic/dot-ai-test-prompts.git`;

      // RED until M1: body `branch` is dropped, so the illegal branch name is
      // never validated and no 400 is returned.
      const response = await integrationTest.httpClient.post(
        '/api/v1/prompts/refresh',
        { repo: credUrl, branch: 'bad branch name!!' }
      );
      expect(response).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(JSON.stringify(response)).not.toContain(secret);
    }, 120000);
  });

  // PRD #621 M2/M3/M4: the override gains an optional per-request git CREDENTIAL
  // forwarded via the `X-Dot-AI-Git-Token` request header (M2 reads it + adds it
  // to both CORS allowlists; M3 uses it for the clone, scoped to the source host,
  // with cache isolation). M4 is the non-negotiable backward-compat parity guard.
  //
  // What IS robustly observable via black-box HTTP — and therefore lives here:
  //   - M2 CORS allowlist: an OPTIONS preflight advertises the new header
  //     (RED today — neither allowlist lists it yet).
  //   - M4 parity: a request with NO path/branch/header behaves like v1.21.0,
  //     for both the no-?repo= (env-var) path and the ?repo=-only path, and the
  //     credential header is never echoed back. NOTE: the header is truly inert
  //     ONLY on the no-?repo= path. When a ?repo= override IS present the token
  //     is NOT inert — M2 reads it and M3 threads it into an isolated,
  //     per-request token-bearing clone (GIT_ASKPASS) that bypasses the shared
  //     cache. It does not change the observed prompt set/source in the
  //     ?repo=-only test only because the asserted prompt is built-in and the
  //     public test-repo root carries no user prompts.
  //
  // What is NOT robustly observable here (flagged for the coder as UNIT tests —
  // see the report; the #581 happy-path override coverage was pushed to unit
  // tests for the same shared-server/shared-cache reasons):
  //   - Credential PRECEDENCE / AUTH (override.gitToken ?? env; clone auth
  //     against the source host): needs a private or second-auth-realm repo —
  //     a positive auth test is non-distinguishing because the env token can
  //     already read the env realm, and the only RED-distinguishing signal
  //     (auth failure => content ABSENT) is retry-unsafe and race-unsafe on the
  //     shared deployed server + single non-coordinate-keyed cache directory.
  //   - CACHE ISOLATION (token-bearing private clone not served to/from the
  //     shared unauthenticated slot; token absent from the cache key): the
  //     cross-serve window is unobservable/flaky black-box; unit tests can
  //     control cache state precisely (git boundary mocked).
  //   - CROSS-HOST REDIRECT non-forwarding (decision 3): needs a controllable
  //     redirecting git host — not available; unit-test the auth/redirect path.
  //   - LOG scrubbing (token absent from server logs): logs are not HTTP-observable.
  describe('Per-request credential header + backward-compat parity (PRD #621 M2/M3/M4)', () => {
    const promptsRepoUrl =
      'https://github.com/vfarcic/dot-ai-test-prompts.git';

    // Retry an equality/presence assertion to absorb a transient concurrent
    // re-clone of the shared cache directory (see the M1 cache/race note). Used
    // only for assertions whose GREEN state is the STABLE state, so retrying can
    // absorb a race but cannot mask a genuine M2/M3 regression (which would fail
    // every attempt).
    async function expectEventually(
      fn: () => Promise<void>,
      attempts = 5,
      delayMs = 1500
    ): Promise<void> {
      let lastError: unknown;
      for (let i = 0; i < attempts; i++) {
        try {
          await fn();
          return;
        } catch (error) {
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      throw lastError;
    }

    async function restoreEnvCache(): Promise<void> {
      await integrationTest.httpClient.post('/api/v1/prompts/refresh', {});
    }

    // ---- M2: CORS allowlist (the one genuinely RED-today test in this block) ----
    test('OPTIONS /api/v1/prompts preflight advertises the X-Dot-AI-Git-Token header (PRD #621 M2)', async () => {
      const baseUrl = process.env.MCP_BASE_URL || 'http://localhost:3456';
      // OPTIONS is answered (204) before auth and carries the CORS allowlist.
      const res = await fetch(`${baseUrl}/api/v1/prompts`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'x-dot-ai-git-token',
        },
      });
      const allowHeaders = res.headers.get('access-control-allow-headers');
      // Sanity: CORS is enabled and surfaced through the ingress.
      expect(allowHeaders).toBeTruthy();
      // RED until M2: the allowlist is "Content-Type, X-Session-Id,
      // Authorization, X-Dot-AI-Authorization" (mcp.ts) / "Content-Type,
      // Authorization" (rest-api.ts) — neither lists the new credential header.
      expect((allowHeaders || '').toLowerCase()).toContain(
        'x-dot-ai-git-token'
      );
    }, 60000);

    // ---- M4 parity: no-?repo= (env-var) path is inert to the credential header ----
    test('no-override request behaves like v1.21.0 with the credential header present and never echoes it (PRD #621 M4 parity)', async () => {
      const secret = 'prd621_norepo_header_secret_zzz';
      await expectEventually(async () => {
        const withHeader = await integrationTest.httpClient.get(
          '/api/v1/prompts',
          { 'X-Dot-AI-Git-Token': secret }
        );
        expect(withHeader).toMatchObject({
          success: true,
          // Source is the env-var repo, unchanged by the header.
          data: { source: expect.stringContaining('dot-ai-test-prompts') },
        });
        const names = withHeader.data.prompts.map(
          (p: { name: string }) => p.name
        );
        // Built-in AND env user prompts (loaded from the user-prompts/ subdir)
        // are present => the env-var path is fully unaffected by the header.
        expect(names).toContain('prd-create');
        expect(names).toContain('eval-run');
        // The forwarded credential must never appear in the response surface.
        expect(JSON.stringify(withHeader)).not.toContain(secret);
      });
    }, 120000);

    // ---- M4 parity: ?repo=-only path matches PRD #581; the header is threaded
    //      into an isolated token clone but the observed outcome is unchanged
    //      here (built-in prompt + empty public repo root) ----
    test('?repo=-only request matches PRD #581 (root clone) with and without the credential header (PRD #621 M4 parity)', async () => {
      const secret = 'prd621_repoonly_header_secret_zzz';
      try {
        await expectEventually(async () => {
          const res = await integrationTest.httpClient.get(
            `/api/v1/prompts?repo=${encodeURIComponent(promptsRepoUrl)}`
          );
          const resH = await integrationTest.httpClient.get(
            `/api/v1/prompts?repo=${encodeURIComponent(promptsRepoUrl)}`,
            { 'X-Dot-AI-Git-Token': secret }
          );
          for (const r of [res, resH]) {
            expect(r).toMatchObject({
              success: true,
              data: { source: expect.stringContaining('dot-ai-test-prompts') },
            });
            const names = r.data.prompts.map((p: { name: string }) => p.name);
            // ?repo=-only clones the repo ROOT on main (PRD #581 behavior):
            // built-in prompts present, but env user prompts (which live under
            // the user-prompts/ subdir) are NOT loaded.
            expect(names).toContain('prd-create');
            expect(names).not.toContain('eval-run');
          }
          // The header is NOT inert when a repo override is present: M2 reads it
          // and M3 threads it into an isolated, per-request token-bearing clone.
          // The prompt SET is identical here only because the asserted prompt is
          // built-in and the public repo ROOT has no user prompts — so the
          // token-bearing isolated clone and the unauthenticated clone surface
          // the same result. This remains a valid parity guard (same observable
          // result with or without the header).
          const nameSet = (r: { data: { prompts: { name: string }[] } }) =>
            r.data.prompts.map(p => p.name).sort();
          expect(nameSet(resH)).toEqual(nameSet(res));
          // No credential leak in the response.
          expect(JSON.stringify(resH)).not.toContain(secret);
        });
      } finally {
        await restoreEnvCache();
      }
    }, 180000);
  });
});
