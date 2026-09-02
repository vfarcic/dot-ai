/**
 * Integration Test: Recommend Tool (Unified with Stage-Based Routing)
 *
 * Tests the complete recommendation workflow via unified REST API endpoint with stage routing.
 * Validates clarification, solution generation, question generation with suggestedAnswers,
 * manifest generation, and deployment through single tool with stage parameter.
 *
 * Stage routing format:
 * - 'recommend' (default) - Initial recommendation/clarification
 * - 'chooseSolution' - Solution selection
 * - 'answerQuestion:required' - Answer required config questions
 * - 'answerQuestion:basic' - Answer basic config questions
 * - 'answerQuestion:advanced' - Answer advanced config questions
 * - 'answerQuestion:open' - Answer open-ended requirements
 * - 'generateManifests' - Generate Kubernetes manifests
 * - 'deployManifests' - Deploy to cluster
 */

import { describe, test, expect, beforeAll } from 'vitest';
import * as k8s from '@kubernetes/client-node';
import { IntegrationTest } from '../helpers/test-base.js';
import { HttpRestApiClient } from '../helpers/http-client.js';
import { signJwt } from '../../../src/interfaces/oauth/jwt.js';
import type {
  GeneratedFile,
  GitPushResult,
  K8sManifest,
  OwnerReference,
  Question,
  SolutionSummary,
} from '../helpers/api-shapes.js';

/**
 * What this file reads off `data`. Fields are declared present because each
 * read follows a `toMatchObject` assertion that proved presence at runtime.
 */
interface RecommendPayload {
  data?: { allSolutions: SolutionSummary[] };
  result: {
    status: string;
    success: boolean;
    sessionId: string;
    solutionId: string;
    namespace: string;
    message: string;
    guidance: string;
    agentInstructions: string;
    visualizationUrl: string;
    releaseName: string;
    helmCommand: string;
    error?: string;
    solutions: SolutionSummary[];
    questions: Question[];
    files: GeneratedFile[];
    gitPush: GitPushResult;
  };
}

/**
 * Pick a *valid* answer for an AI-generated question.
 *
 * Questions and their suggestedAnswer are both AI-generated, and the two can
 * disagree: the model sometimes suggests a value outside the `options` list it
 * generated for the same question. Feeding that straight back produces
 * `status: "stage_error"` / `validation_failed` and fails the workflow test for
 * a reason that has nothing to do with the workflow. Observed in CI on a
 * storage-class question: `must be one of: standard (default)`.
 *
 * `select` is the only type validated against `options`
 * (src/tools/answer-question.ts), so that is the only case needing a fallback.
 * Anything else passes the suggestion through unchanged.
 *
 * An *empty* suggestion is left alone unless the question is required.
 * validateAnswer returns early for undefined/null/'' on a non-required
 * question, so empty already passes — substituting options[0] there would
 * submit a choice the test never intended instead of leaving the question
 * unanswered. A required question with an empty answer genuinely is rejected
 * (answer-question.ts:136-141), so that case does need the fallback.
 */
function validAnswerFor(question: Question): unknown {
  const { type, options, suggestedAnswer } = question;

  if (type === 'select' && Array.isArray(options) && options.length > 0) {
    const isEmptyAnswer =
      suggestedAnswer === undefined ||
      suggestedAnswer === null ||
      suggestedAnswer === '';
    const needsAnswer = !isEmptyAnswer || question.validation?.required;

    if (needsAnswer && !options.includes(suggestedAnswer as string)) {
      return options[0];
    }
  }

  return suggestedAnswer;
}

describe.concurrent('Recommend Tool Integration', () => {
  const integrationTest = new IntegrationTest();
  const gitToken = process.env.DOT_AI_GIT_TOKEN;
  const gitRepoUrl =
    process.env.DOT_AI_GIT_TEST_REPO ||
    'https://github.com/vfarcic/dot-ai-test-prompts.git';

  function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } {
    const url = new URL(repoUrl);
    const [owner, repoName] = url.pathname.replace(/^\/+/, '').split('/');

    if (!owner || !repoName) {
      throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
    }

    return {
      owner,
      repo: repoName.replace(/\.git$/, ''),
    };
  }

  const gitHubRepo = parseGitHubRepo(gitRepoUrl);

  interface GitHubFileContent {
    name: string;
    path: string;
    sha: string;
    size: number;
    url: string;
    html_url: string;
    git_url: string;
    download_url: string | null;
    type: 'file' | 'dir' | 'symlink' | 'submodule';
    content?: string;
    encoding?: string;
  }

  async function getGitHubFile(
    filePath: string,
    ref?: string
  ): Promise<GitHubFileContent | null> {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const response = await fetch(
      `https://api.github.com/repos/${gitHubRepo.owner}/${gitHubRepo.repo}/contents/${filePath}${refQuery}`,
      {
        headers: {
          Authorization: `token ${gitToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    expect(response.ok).toBe(true);
    return response.json() as Promise<GitHubFileContent>;
  }

  // ─── GitHub pull request helpers (PRD #710 M2 PR mode) ───

  const gitHubApiHeaders = {
    Authorization: `token ${gitToken}`,
    Accept: 'application/vnd.github+json',
    // GitHub answers authenticated reads with `Cache-Control: private,
    // max-age=60`. These helpers re-read the same URL seconds apart to observe a
    // push landing, so any cache honouring that would hand back the pre-push
    // answer for a minute.
    'Cache-Control': 'no-cache',
  };

  const gitHubRepoApi = `https://api.github.com/repos/${gitHubRepo.owner}/${gitHubRepo.repo}`;

  interface GitHubPullRequest {
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    draft: boolean;
    head: { ref: string; sha: string };
    base: { ref: string };
  }

  interface GitHubCommit {
    sha: string;
    commit: {
      message: string;
      author: { name: string; email: string };
    };
  }

  async function getBranchSha(branch: string): Promise<string> {
    const response = await fetch(`${gitHubRepoApi}/git/ref/heads/${branch}`, {
      headers: gitHubApiHeaders,
    });
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { object: { sha: string } };
    return data.object.sha;
  }

  /**
   * The N most recent commit shas on `branch`, newest first.
   */
  async function listBranchCommitShas(
    branch: string,
    count: number
  ): Promise<string[]> {
    const response = await fetch(
      `${gitHubRepoApi}/commits?sha=${encodeURIComponent(branch)}&per_page=${count}`,
      { headers: gitHubApiHeaders }
    );
    expect(response.ok).toBe(true);
    const commits = (await response.json()) as Array<{ sha: string }>;
    return commits.map(commit => commit.sha);
  }

  /**
   * Wait for `branch` to report `sha` as its tip.
   *
   * Reads of freshly pushed state are eventually consistent — observed on this
   * repository: right after a push, `GET /git/ref/heads/<branch>` still answered
   * with the PREVIOUS commit while the push had demonstrably succeeded. So a
   * single read cannot decide whether a push landed, and worse, it makes a
   * "nothing was pushed" assertion pass vacuously. Every check of a just-pushed
   * tip therefore names the exact sha it expects and waits for it.
   */
  async function waitForBranchSha(
    branch: string,
    sha: string
  ): Promise<string> {
    const maxWaitMs = 60000;
    const pollIntervalMs = 2000;

    let current = await getBranchSha(branch);
    for (
      let waited = 0;
      current !== sha && waited < maxWaitMs;
      waited += pollIntervalMs
    ) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      current = await getBranchSha(branch);
    }
    return current;
  }

  async function getPullRequest(number: number): Promise<GitHubPullRequest> {
    const response = await fetch(`${gitHubRepoApi}/pulls/${number}`, {
      headers: gitHubApiHeaders,
    });
    expect(response.ok).toBe(true);
    return response.json() as Promise<GitHubPullRequest>;
  }

  /**
   * Every pull request — open, closed or merged — whose head is `branch`.
   * `state=all` is deliberate: a duplicate PR that was opened and then closed
   * still means the re-run opened a second PR instead of updating the first.
   */
  async function listPullRequestsForHead(
    branch: string
  ): Promise<GitHubPullRequest[]> {
    const head = encodeURIComponent(`${gitHubRepo.owner}:${branch}`);
    const response = await fetch(
      `${gitHubRepoApi}/pulls?state=all&head=${head}&per_page=100`,
      { headers: gitHubApiHeaders }
    );
    expect(response.ok).toBe(true);
    return response.json() as Promise<GitHubPullRequest[]>;
  }

  async function getCommit(ref: string): Promise<GitHubCommit> {
    const response = await fetch(
      `${gitHubRepoApi}/commits/${encodeURIComponent(ref)}`,
      { headers: gitHubApiHeaders }
    );
    expect(response.ok).toBe(true);
    return response.json() as Promise<GitHubCommit>;
  }

  /**
   * A pull request's `head.sha` is a denormalized copy of the branch tip that
   * GitHub converges asynchronously: immediately after a push the git ref API
   * already reports the new commit while the pull request object can still
   * report the previous one. So poll for convergence instead of asserting on
   * the first read — the guarantee ("the open PR ends up pointing at the new
   * commit") is kept, only the race is removed. A PR that never converges still
   * fails the assertion at the call site.
   */
  async function waitForPullRequestHeadSha(
    number: number,
    sha: string
  ): Promise<GitHubPullRequest> {
    const maxWaitMs = 60000;
    const pollIntervalMs = 2000;

    let pullRequest = await getPullRequest(number);
    for (
      let waited = 0;
      pullRequest.head.sha !== sha && waited < maxWaitMs;
      waited += pollIntervalMs
    ) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      pullRequest = await getPullRequest(number);
    }
    return pullRequest;
  }

  /**
   * Cleanup helpers report a refused request instead of ignoring it: this
   * repository is shared by every run of this suite, so a close or delete that
   * silently did nothing leaves a pull request or branch behind for all of
   * them. The caller decides what a failure means — see the cleanup block at
   * the end of the pushToGit test.
   */
  async function assertGitHubOk(
    response: Response,
    what: string
  ): Promise<void> {
    if (!response.ok) {
      throw new Error(
        `${what} failed: ${response.status} ${await response.text()}`
      );
    }
  }

  async function closePullRequest(number: number): Promise<void> {
    const response = await fetch(`${gitHubRepoApi}/pulls/${number}`, {
      method: 'PATCH',
      headers: { ...gitHubApiHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'closed' }),
    });
    await assertGitHubOk(response, `Closing pull request #${number}`);
  }

  async function deleteBranch(branch: string): Promise<void> {
    const response = await fetch(`${gitHubRepoApi}/git/refs/heads/${branch}`, {
      method: 'DELETE',
      headers: gitHubApiHeaders,
    });
    await assertGitHubOk(response, `Deleting branch ${branch}`);
  }

  async function deleteGitHubFile(
    filePath: string,
    message: string
  ): Promise<void> {
    const existingFile = await getGitHubFile(filePath);
    if (!existingFile) {
      return;
    }

    const response = await fetch(
      `https://api.github.com/repos/${gitHubRepo.owner}/${gitHubRepo.repo}/contents/${filePath}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `token ${gitToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github.v3+json',
        },
        body: JSON.stringify({
          message,
          sha: existingFile.sha,
        }),
      }
    );

    await assertGitHubOk(response, `Deleting file ${filePath}`);
  }

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Recommendation Workflow', () => {
    test('should complete full workflow: intent refinement → solutions → choose → answer → generate → deploy', async () => {
      // PHASE 1: Request recommendations without final flag (intent refinement)
      // NOTE: Testing default stage behavior - no stage parameter defaults to 'recommend'
      // Vague intent (< 100 chars) triggers heuristic-based guidance response (PRD #22)
      const refinementResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            intent: 'deploy database',
            // stage omitted - should default to 'recommend'
            interaction_id: 'refinement_phase',
          }
        );

      // Validate intent refinement response structure (heuristic-based, no AI call)
      const expectedRefinementResponse = {
        success: true,
        data: {
          result: {
            success: true,
            needsRefinement: true,
            intent: 'deploy database',
            guidance: expect.stringContaining('Intent Refinement Guidance'),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(refinementResponse).toMatchObject(expectedRefinementResponse);

      // Validate guidance content includes key sections
      const guidance = refinementResponse.data!.result.guidance;
      expect(guidance).toContain('Analyze Available Context');
      expect(guidance).toContain('Perform Deep Analysis');
      expect(guidance).toContain('Discuss With User');
      expect(guidance).toContain('final: true');

      // PHASE 2: Request recommendations with refined intent and final=true (solutions)
      const solutionsResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'recommend', // Explicit stage parameter
            intent: 'deploy postgresql database',
            final: true,
            interaction_id: 'solution_assembly_phase',
          }
        );

      // Validate solutions response structure (based on actual API inspection)
      // PRD #320: Recommend tool returns visualizationUrl with multiple session IDs joined by +
      const expectedSolutionsResponse = {
        success: true,
        data: {
          result: {
            intent: 'deploy postgresql database',
            solutions: expect.any(Array),
            organizationalContext: expect.objectContaining({
              solutionsUsingPatterns: expect.any(Number),
              totalSolutions: expect.any(Number),
              totalPatterns: expect.any(Number),
              totalPolicies: expect.any(Number),
              patternsAvailable: expect.any(String),
              policiesAvailable: expect.any(String),
            }),
            nextAction:
              'Call recommend tool with stage: chooseSolution and your preferred solutionId',
            guidance: expect.stringContaining(
              'You MUST present these solutions'
            ),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            // PRD #320: Visualization URL contains multiple solution session IDs joined by +
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/sol-\d+-[a-f0-9]+(\+sol-\d+-[a-f0-9]+)*$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(solutionsResponse).toMatchObject(expectedSolutionsResponse);

      // PRD #320: Verify visualization URL contains all solution session IDs
      const solutionIds = solutionsResponse.data!.result.solutions.map(
        (s: SolutionSummary) => s.solutionId
      );
      const visualizationUrl = solutionsResponse.data!.result.visualizationUrl;
      const urlSessionIds = visualizationUrl.split('/v/')[1].split('+');
      expect(urlSessionIds).toEqual(solutionIds);

      // NOTE: Visualization endpoint is tested in version.test.ts (fastest tool)

      // Extract solutionId for next phase
      const solutionId = solutionsResponse.data!.result.solutions[0].solutionId;

      // SESSION STATE VALIDATION: Verify session persistence for UI page refresh
      const sessionStartTime = Date.now();
      const sessionResponse =
        await integrationTest.httpClient.get<RecommendPayload>(
          `/api/v1/sessions/${solutionId}`
        );
      const sessionResponseTime = Date.now() - sessionStartTime;

      // Validate session retrieval is fast (< 1000ms indicates reading from cache, not AI call)
      expect(sessionResponseTime).toBeLessThan(1000);

      // Validate session contains all workflow state for page refresh
      const expectedSessionResponse = {
        success: true,
        data: {
          sessionId: solutionId,
          createdAt: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          updatedAt: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          data: {
            toolName: 'recommend',
            stage: 'solutions', // UI page refresh support
            intent: 'deploy postgresql database',
            type: expect.stringMatching(/^(single|combination|helm)$/),
            score: expect.any(Number),
            description: expect.any(String),
            reasons: expect.any(Array),
            allSolutions: expect.arrayContaining([
              expect.objectContaining({
                solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
                type: expect.any(String),
                score: expect.any(Number),
                description: expect.any(String),
                reasons: expect.any(Array),
              }),
            ]),
            organizationalContext: expect.objectContaining({
              solutionsUsingPatterns: expect.any(Number),
              totalSolutions: expect.any(Number),
              totalPatterns: expect.any(Number),
              totalPolicies: expect.any(Number),
              patternsAvailable: expect.any(String),
              policiesAvailable: expect.any(String),
            }),
            questions: expect.any(Object),
            answers: expect.any(Object),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
          },
        },
        meta: expect.objectContaining({
          version: 'v1',
        }),
      };

      expect(sessionResponse).toMatchObject(expectedSessionResponse);

      // Validate allSolutions contains all solution IDs from the response
      const sessionAllSolutions = sessionResponse.data!.data!.allSolutions.map(
        (s: SolutionSummary) => s.solutionId
      );
      expect(sessionAllSolutions).toEqual(solutionIds);

      // PHASE 3: Call chooseSolution stage with solutionId
      const chooseResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'chooseSolution',
            solutionId,
            interaction_id: 'choose_solution_phase',
          }
        );

      // Validate chooseSolution response structure (based on actual API inspection)
      const expectedChooseResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            currentStage: 'required',
            questions: expect.any(Array),
            nextStage: expect.stringMatching(/^(basic|advanced|open)$/),
            message: expect.stringContaining('required configuration'),
            nextAction:
              'Call recommend tool with stage: answerQuestion:required',
            guidance: expect.stringContaining('Present ALL required questions'),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(chooseResponse).toMatchObject(expectedChooseResponse);

      // CRITICAL: Validate that all questions have suggestedAnswer field
      const requiredQuestions = chooseResponse.data!.result.questions;
      expect(requiredQuestions.length).toBeGreaterThan(0);

      requiredQuestions.forEach((q: Question) => {
        expect(q).toMatchObject({
          id: expect.any(String),
          question: expect.any(String),
          type: expect.stringMatching(
            /^(text|select|number|boolean|multiselect)$/
          ),
          suggestedAnswer: expect.anything(), // CRITICAL: Verify suggestedAnswer exists
        });
      });

      // PACKAGING QUESTIONS VALIDATION: Capability-based solutions must have outputFormat and outputPath
      const outputFormatQuestion = requiredQuestions.find(
        (q: Question) => q.id === 'outputFormat'
      );
      const outputPathQuestion = requiredQuestions.find(
        (q: Question) => q.id === 'outputPath'
      );

      expect(outputFormatQuestion).toBeDefined();
      expect(outputFormatQuestion).toMatchObject({
        id: 'outputFormat',
        question: 'How would you like the manifests packaged?',
        type: 'select',
        options: ['raw', 'helm', 'kustomize'],
        suggestedAnswer: 'kustomize',
        validation: { required: true },
      });

      expect(outputPathQuestion).toBeDefined();
      expect(outputPathQuestion).toMatchObject({
        id: 'outputPath',
        question: 'Where would you like to save the output?',
        type: 'text',
        suggestedAnswer: './manifests',
        validation: { required: true },
      });

      // PHASE 4: Answer required stage questions using suggestedAnswers
      // Explicitly use 'raw' format for main workflow test (kustomize/helm have dedicated tests)
      const requiredAnswers: Record<string, unknown> = {};
      requiredQuestions.forEach((q: Question) => {
        if (q.id === 'outputFormat') {
          requiredAnswers[q.id] = 'raw'; // Use raw format for main workflow
        } else {
          requiredAnswers[q.id] = validAnswerFor(q);
        }
      });

      const answerRequiredResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:required', // Combined stage routing
            solutionId,
            answers: requiredAnswers,
            interaction_id: 'answer_required_phase',
          }
        );

      // Validate answerQuestion response (should return next stage questions).
      // The diagnostic message surfaces the actual result (or error) so an
      // AI-driven mismatch is legible in CI instead of an opaque "data {…3}" diff.
      expect(
        answerRequiredResponse,
        `answerQuestion:required expected status=stage_questions/currentStage=basic, got: ${JSON.stringify(
          answerRequiredResponse.data?.result ??
            answerRequiredResponse.error ??
            answerRequiredResponse
        )}`
      ).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            currentStage: 'basic',
            questions: expect.any(Array),
            nextAction: 'Call recommend tool with stage: answerQuestion:basic',
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
      });

      // PHASE 5: Skip basic stage (empty answers)
      const skipBasicResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:basic', // Combined stage routing
            solutionId,
            answers: {},
            interaction_id: 'skip_basic_phase',
          }
        );

      // Validate skip basic response (based on actual API inspection)
      const expectedSkipBasicResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'advanced',
            questions: expect.any(Array),
            nextStage: 'open',
            nextAction:
              'Call recommend tool with stage: answerQuestion:advanced',
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(skipBasicResponse).toMatchObject(expectedSkipBasicResponse);

      // PHASE 6: Skip advanced stage (empty answers)
      const skipAdvancedResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:advanced', // Combined stage routing
            solutionId,
            answers: {},
            interaction_id: 'skip_advanced_phase',
          }
        );

      // Validate skip advanced response (based on actual API inspection)
      const expectedSkipAdvancedResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'open',
            questions: expect.any(Array),
            nextAction: 'Call recommend tool with stage: answerQuestion:open',
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(skipAdvancedResponse).toMatchObject(expectedSkipAdvancedResponse);

      // PHASE 7: Complete open stage with N/A
      const completeOpenResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:open', // Combined stage routing
            solutionId,
            answers: { open: 'N/A' },
            interaction_id: 'complete_open_phase',
          }
        );

      // Validate open stage completion response (based on actual API inspection)
      const expectedCompleteOpenResponse = {
        success: true,
        data: {
          result: {
            status: 'ready_for_manifest_generation',
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            nextAction: 'Call recommend tool with stage: generateManifests',
            message: expect.stringContaining('Configuration complete'),
            solutionData: expect.any(Object),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(completeOpenResponse).toMatchObject(expectedCompleteOpenResponse);

      // PHASE 8: Generate manifests
      const generateResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'generateManifests',
            solutionId,
            interaction_id: 'generate_manifests_phase',
          }
        );

      // Validate generateManifests response (based on actual API inspection)
      // Raw format returns a single manifests.yaml file
      // PRD #320: generateManifests now returns visualizationUrl
      const expectedGenerateResponse = {
        success: true,
        data: {
          result: {
            success: true,
            status: 'manifests_generated',
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            outputFormat: 'raw',
            outputPath: './manifests',
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'manifests.yaml',
                content: expect.stringContaining('apiVersion:'),
              }),
            ]),
            validationAttempts: expect.any(Number),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            agentInstructions: expect.stringContaining(
              'Present the user with these options'
            ),
            // PRD #320: Visualization URL for generateManifests stage
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/sol-\d+-[a-f0-9]+$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(generateResponse).toMatchObject(expectedGenerateResponse);

      // Verify raw format contains single manifests.yaml file
      const files = generateResponse.data!.result.files;
      const manifestFile = files.find(
        (f: GeneratedFile) => f.relativePath === 'manifests.yaml'
      );
      expect(manifestFile).toBeDefined();
      expect(manifestFile!.content).toContain('apiVersion:');
      expect(manifestFile!.content).toContain('kind:');
      expect(manifestFile!.content).toContain('metadata:');

      // For raw format, all manifests are in a single file
      const manifests = manifestFile!.content;

      // SOLUTION CR VALIDATION: Verify Solution CR is included and properly structured
      const yaml = await import('js-yaml');
      // For raw format, parse the single manifests.yaml file
      const parsedManifests = yaml.loadAll(
        manifests
      ) as Array<K8sManifest | null>;
      const solutionCR = parsedManifests.find(m => m?.kind === 'Solution');

      // Extract namespace from answers (default to 'default' if not specified)
      const namespace = requiredAnswers.namespace || 'default';

      expect(solutionCR).toBeDefined();
      expect(solutionCR).toMatchObject({
        apiVersion: 'dot-ai.devopstoolkit.live/v1alpha1',
        kind: 'Solution',
        metadata: {
          name: `solution-${solutionId}`,
          namespace: namespace,
          labels: {
            'dot-ai.devopstoolkit.live/created-by': 'dot-ai-mcp',
            'dot-ai.devopstoolkit.live/solution-id': solutionId,
          },
        },
        spec: {
          intent: 'deploy postgresql database',
          resources: expect.arrayContaining([
            expect.objectContaining({
              apiVersion: expect.any(String),
              kind: expect.any(String),
              name: expect.any(String),
              namespace: namespace,
            }),
          ]),
          context: expect.objectContaining({
            createdBy: 'dot-ai-mcp',
            rationale: expect.any(String),
            // Note: patterns and policies may be stripped by AI packaging when empty
          }),
        },
      });

      // NOTE: Visualization endpoint is tested in version.test.ts (fastest tool)

      // PHASE 9: Deploy manifests to cluster
      const deployResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'deployManifests',
            solutionId,
            interaction_id: 'deploy_manifests_phase',
          }
        );

      // Validate deployManifests response (based on actual API inspection)
      const expectedDeployResponse = {
        success: true,
        data: {
          result: {
            success: true,
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            manifestPath: expect.stringContaining('.yaml'),
            message: expect.stringContaining('Deployment'),
            kubectlOutput: expect.any(String),
            deploymentComplete: true,
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(
        deployResponse,
        `Deploy failed: ${JSON.stringify(deployResponse.error || deployResponse.data?.result?.error || 'no error field')}`
      ).toMatchObject(expectedDeployResponse);

      // PHASE 10: Verify resources were created in the cluster
      // Parse manifests to verify each resource exists
      const deployedManifests = yaml.loadAll(manifests) as K8sManifest[];
      expect(deployedManifests.length).toBeGreaterThan(0);

      // Verify at least one non-Solution resource was deployed
      const nonSolutionResources = deployedManifests.filter(
        (m: K8sManifest) => m.kind !== 'Solution'
      );
      expect(nonSolutionResources.length).toBeGreaterThan(0);

      // CONTROLLER INTEGRATION VALIDATION: Verify controller picked up Solution CR
      // Poll for controller to reconcile and add ownerReferences (up to 60 seconds)
      const solutionCRName = `solution-${solutionId}`;

      // Get Solution CR from cluster
      const getSolutionResult = await integrationTest.kubectl(
        `get solution ${solutionCRName} -n ${namespace} -o json`
      );
      const clusterSolutionCR = JSON.parse(getSolutionResult);

      // Verify Solution CR exists in cluster
      expect(clusterSolutionCR.metadata.name).toBe(solutionCRName);
      expect(clusterSolutionCR.spec.intent).toBe('deploy postgresql database');

      // Verify controller added ownerReferences to at least one deployed resource
      // Get the first resource from Solution CR spec
      const firstResource = clusterSolutionCR.spec.resources[0];

      // Poll for ownerReference to be added (controller reconciliation can take time)
      const maxWaitMs = 60000;
      const pollIntervalMs = 2000;
      let ownerRefFound = false;
      let deployedResource: K8sManifest | undefined;

      for (let waited = 0; waited < maxWaitMs; waited += pollIntervalMs) {
        const resourceResult = await integrationTest.kubectl(
          `get ${firstResource.kind} ${firstResource.name} -n ${namespace} -o json`
        );
        deployedResource = JSON.parse(resourceResult) as K8sManifest;

        // Check if Solution ownerReference exists
        const hasOwnerRef = deployedResource.metadata?.ownerReferences?.some(
          (ref: OwnerReference) =>
            ref.kind === 'Solution' && ref.name === solutionCRName
        );

        if (hasOwnerRef) {
          ownerRefFound = true;
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      // Verify ownerReference pointing to Solution CR exists
      // Note: controller=false because Solution is a tracker, not a lifecycle controller
      // Actual resource controllers (like CNPG) remain as controller=true
      expect(ownerRefFound).toBe(true);
      expect(deployedResource?.metadata?.ownerReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            apiVersion: 'dot-ai.devopstoolkit.live/v1alpha1',
            kind: 'Solution',
            name: solutionCRName,
            controller: false, // Solution is a tracker, not the primary controller
            blockOwnerDeletion: true,
          }),
        ])
      );
    }, 1200000); // 20 minutes for full AI workflow (accommodates slower AI models like OpenAI)
  });

  describe('GitOps Push Workflow', () => {
    /**
     * PRD #710 decision 8 / M3: the PR-mode half of the workflow below runs as
     * an authenticated OAuth user rather than the static token user, because two
     * things can only be observed with an identity present:
     *
     * - the commit author and PR body must identify the AUTHENTICATED user, and
     *   a client-supplied authorName/authorEmail must not override it;
     * - PR mode must be reachable with `execute` alone. This user deliberately
     *   holds no `apply`, which is what direct push will require after M3.
     */
    const prPushUser = {
      userId: 'recommend-pr-push-test',
      email: 'recommend-pr-push@gitops-test.local',
      groups: [] as string[],
    };

    function prPushClient(): HttpRestApiClient {
      const secret = process.env.DOT_AI_JWT_SECRET;
      if (!secret) {
        throw new Error(
          'DOT_AI_JWT_SECRET must be set for the GitOps PR-mode test'
        );
      }
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt(
        {
          sub: prPushUser.userId,
          email: prPushUser.email,
          groups: prPushUser.groups,
          iat: now,
          exp: now + 3600,
        },
        secret
      );
      return new HttpRestApiClient({
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    beforeAll(async () => {
      const kc = new k8s.KubeConfig();
      kc.loadFromDefault();
      const rbacApi = kc.makeApiClient(k8s.RbacAuthorizationV1Api);

      // Tolerate a pre-existing binding so a re-run against a surviving cluster
      // works; anything else is a real failure and must surface.
      const ignoreAlreadyExists = async (op: Promise<unknown>) => {
        try {
          await op;
        } catch (error) {
          const details = JSON.stringify(
            (error as { body?: unknown }).body ?? error
          );
          if (
            (error as { code?: number }).code !== 409 &&
            !details.includes('AlreadyExists')
          ) {
            throw error;
          }
        }
      };

      await ignoreAlreadyExists(
        rbacApi.createClusterRole({
          body: {
            metadata: { name: 'recommend-pr-push-execute' },
            rules: [
              {
                apiGroups: ['dot-ai.devopstoolkit.ai'],
                resources: ['tools'],
                resourceNames: ['recommend'],
                verbs: ['execute'],
              },
            ],
          },
        })
      );

      await ignoreAlreadyExists(
        rbacApi.createClusterRoleBinding({
          body: {
            metadata: { name: 'recommend-pr-push-execute-binding' },
            subjects: [
              {
                kind: 'User',
                name: prPushUser.email,
                apiGroup: 'rbac.authorization.k8s.io',
              },
            ],
            roleRef: {
              kind: 'ClusterRole',
              name: 'recommend-pr-push-execute',
              apiGroup: 'rbac.authorization.k8s.io',
            },
          },
        })
      );
    }, 30000);

    test('should complete generateManifests → pushToGit against a real GitHub repository', async () => {
      const testRunId = Date.now();
      const targetPath = `integration-tests/push-to-git-${testRunId}`;
      // PR mode writes to its own paths so the direct push (which lands on the
      // base branch) does not make the first PR-mode push an empty diff.
      const prTargetPath = `integration-tests/push-to-git-pr-${testRunId}`;
      const updatedTargetPath = `integration-tests/push-to-git-pr-update-${testRunId}`;
      const cleanupMessage = `test: cleanup pushToGit integration ${testRunId}`;
      const prCommitMessage = `test: pushToGit PR mode integration ${testRunId}`;
      const baseBranch = 'main';
      const spoofedAuthorName = 'Spoofed Author';
      const spoofedAuthorEmail = 'spoofed-author@attacker.example';
      const pushedFiles: string[] = [];
      const createdPrNumbers: number[] = [];
      const createdBranches: string[] = [];

      /**
       * Collect everything a push created BEFORE asserting on it, so a failed
       * assertion still cleans up the branch, PR and files it left behind.
       */
      const recordForCleanup = (response: {
        data?: { result?: { gitPush?: GitPushResult } };
      }) => {
        const gitPush = response.data?.result?.gitPush;
        if (!gitPush) return;
        if (Array.isArray(gitPush.filesPushed)) {
          for (const file of gitPush.filesPushed) {
            if (!pushedFiles.includes(file)) pushedFiles.push(file);
          }
        }
        const prNumber = gitPush.pullRequest?.number;
        if (
          typeof prNumber === 'number' &&
          !createdPrNumbers.includes(prNumber)
        ) {
          createdPrNumbers.push(prNumber);
        }
        const head = gitPush.pullRequest?.branch ?? gitPush.branch;
        // Never delete the base branch — in a build where PR mode is not wired
        // up yet, gitPush.branch IS the base branch.
        if (
          typeof head === 'string' &&
          head !== baseBranch &&
          !createdBranches.includes(head)
        ) {
          createdBranches.push(head);
        }
      };

      let testFailure: unknown;

      try {
        const solutionsResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              intent: 'deploy nginx web server',
              final: true,
              interaction_id: `push_to_git_solutions_${testRunId}`,
            }
          );

        expect(solutionsResponse).toMatchObject({
          success: true,
          data: {
            result: {
              solutions: expect.any(Array),
            },
          },
        });

        const capabilitySolution =
          solutionsResponse.data!.result.solutions.find(
            (s: SolutionSummary) => s.type !== 'helm'
          );
        expect(capabilitySolution).toBeDefined();

        const solutionId = capabilitySolution!.solutionId;

        const chooseResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              stage: 'chooseSolution',
              solutionId,
              interaction_id: `push_to_git_choose_${testRunId}`,
            }
          );

        expect(chooseResponse).toMatchObject({
          success: true,
          data: {
            result: {
              status: 'stage_questions',
              currentStage: 'required',
              questions: expect.any(Array),
            },
          },
        });

        const requiredAnswers: Record<string, unknown> = {};
        chooseResponse.data!.result.questions.forEach((question: Question) => {
          if (question.id === 'outputFormat') {
            requiredAnswers[question.id] = 'raw';
          } else if (question.id === 'outputPath') {
            requiredAnswers[question.id] = './gitops-manifests';
          } else {
            requiredAnswers[question.id] = validAnswerFor(question);
          }
        });

        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:required',
            solutionId,
            answers: requiredAnswers,
            interaction_id: `push_to_git_required_${testRunId}`,
          }
        );

        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:basic',
            solutionId,
            answers: {},
            interaction_id: `push_to_git_basic_${testRunId}`,
          }
        );

        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:advanced',
            solutionId,
            answers: {},
            interaction_id: `push_to_git_advanced_${testRunId}`,
          }
        );

        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:open',
            solutionId,
            answers: { open: 'N/A' },
            interaction_id: `push_to_git_open_${testRunId}`,
          }
        );

        const generateResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              stage: 'generateManifests',
              solutionId,
              interaction_id: `push_to_git_generate_${testRunId}`,
            }
          );

        expect(generateResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              status: 'manifests_generated',
              solutionId,
              outputFormat: 'raw',
              files: expect.arrayContaining([
                expect.objectContaining({
                  relativePath: 'manifests.yaml',
                }),
              ]),
            },
          },
        });

        const pushResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              stage: 'pushToGit',
              solutionId,
              repoUrl: gitRepoUrl,
              targetPath,
              commitMessage: `test: pushToGit integration ${testRunId}`,
              interaction_id: `push_to_git_stage_${testRunId}`,
            }
          );

        recordForCleanup(pushResponse);

        expect(pushResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              status: 'manifests_pushed',
              solutionId,
              gitPush: {
                repoUrl: gitRepoUrl,
                path: targetPath,
                branch: 'main',
                commitSha: expect.any(String),
                filesPushed: expect.arrayContaining([
                  `${targetPath}/manifests.yaml`,
                ]),
                pushedAt: expect.any(String),
              },
              filesPreview: expect.arrayContaining([
                expect.objectContaining({
                  path: `${targetPath}/manifests.yaml`,
                  size: expect.any(Number),
                  lines: expect.any(Number),
                }),
              ]),
              gitopsMessage: expect.stringContaining('Argo CD'),
              timestamp: expect.any(String),
            },
            tool: 'recommend',
            executionTime: expect.any(Number),
          },
        });

        const sessionResponse =
          await integrationTest.httpClient.get<RecommendPayload>(
            `/api/v1/sessions/${solutionId}`
          );
        expect(sessionResponse).toMatchObject({
          success: true,
          data: {
            sessionId: solutionId,
            data: {
              stage: 'pushed',
              gitPush: {
                repoUrl: gitRepoUrl,
                path: targetPath,
                branch: 'main',
                commitSha: expect.any(String),
              },
            },
          },
        });

        const pushedFile = await getGitHubFile(`${targetPath}/manifests.yaml`);
        expect(pushedFile).not.toBeNull();
        const pushedContent = Buffer.from(
          pushedFile!.content!,
          pushedFile!.encoding! as BufferEncoding
        ).toString('utf8');
        expect(pushedContent).toContain('apiVersion:');
        expect(pushedContent).toContain('kind:');

        // ─────────────────────────────────────────────────────────────────
        // PR MODE (PRD #710 M2)
        //
        // Same session, same manifests, `pullRequest: true`. `branch` now means
        // the BASE branch (decision 1) and the head branch is server-generated:
        // `dot-ai/<solutionId>-<timestamp>` (decision 2).
        // ─────────────────────────────────────────────────────────────────
        const prClient = prPushClient();
        const baseShaBeforePr = await getBranchSha(baseBranch);

        const prPushResponse = await prClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'pushToGit',
            solutionId,
            repoUrl: gitRepoUrl,
            targetPath: prTargetPath,
            branch: baseBranch,
            pullRequest: true,
            commitMessage: prCommitMessage,
            // Decision 8: a client cannot attribute the commit to someone else —
            // the authenticated identity wins over both of these.
            authorName: spoofedAuthorName,
            authorEmail: spoofedAuthorEmail,
            // Success criterion 2: no client-supplied parameter may influence the
            // head branch. There is deliberately no head-branch parameter, so an
            // invented one must be ignored rather than honoured.
            headBranch: 'client-chosen-head',
            interaction_id: `push_to_git_pr_${testRunId}`,
          }
        );

        recordForCleanup(prPushResponse);

        const expectedPrUrl = new RegExp(
          `^https://github\\.com/${gitHubRepo.owner}/${gitHubRepo.repo}/pull/\\d+$`
        );
        // Head branch: server-generated from the session id (decision 2), never
        // the base branch and never a client-supplied name.
        const expectedHeadBranch = new RegExp(`^dot-ai/${solutionId}-\\d+$`);

        expect(prPushResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              status: 'manifests_pushed',
              solutionId,
              gitPush: {
                repoUrl: gitRepoUrl,
                path: prTargetPath,
                branch: expect.stringMatching(expectedHeadBranch),
                commitSha: expect.any(String),
                // Decision 5: mirrors remediate's pullRequest shape, nested
                // under gitPush. `status` discriminates the outcome exactly as
                // createPullRequest() does (created | no_changes | updated).
                pullRequest: {
                  status: 'created',
                  url: expect.stringMatching(expectedPrUrl),
                  number: expect.any(Number),
                  branch: expect.stringMatching(expectedHeadBranch),
                  baseBranch,
                  filesChanged: expect.arrayContaining([
                    `${prTargetPath}/manifests.yaml`,
                  ]),
                },
              },
            },
            tool: 'recommend',
          },
        });

        const prInfo = prPushResponse.data!.result.gitPush.pullRequest;
        const prNumber: number = prInfo!.number;
        const prBranch: string = prInfo!.branch;
        const createCommitSha: string =
          prPushResponse.data!.result.gitPush.commitSha;
        expect(prBranch).not.toBe(baseBranch);
        expect(prBranch).not.toBe('client-chosen-head');

        // Let the head branch converge on the commit the push reported before
        // reading anything off it, so the reads below cannot see a pre-push
        // state (or a 404 for a branch that exists).
        expect(await waitForBranchSha(prBranch, createCommitSha)).toBe(
          createCommitSha
        );

        // Success criterion 1: the base branch is never written in PR mode.
        expect(await getBranchSha(baseBranch)).toBe(baseShaBeforePr);
        expect(
          await getGitHubFile(`${prTargetPath}/manifests.yaml`, baseBranch)
        ).toBeNull();

        // Decision 5: the session carries the PR so a re-run can find it, and
        // `stage` stays 'pushed' — no new value in the stage enum, which
        // dot-ai-ui consumes.
        const prSessionResponse =
          await integrationTest.httpClient.get<RecommendPayload>(
            `/api/v1/sessions/${solutionId}`
          );
        expect(prSessionResponse).toMatchObject({
          success: true,
          data: {
            sessionId: solutionId,
            data: {
              stage: 'pushed',
              gitPush: {
                repoUrl: gitRepoUrl,
                path: prTargetPath,
                branch: prBranch,
                pullRequest: {
                  url: prInfo!.url,
                  number: prNumber,
                  branch: prBranch,
                  baseBranch,
                },
              },
            },
          },
        });

        const createdPr = await getPullRequest(prNumber);
        expect(createdPr).toMatchObject({
          number: prNumber,
          state: 'open',
          // Integration tests set DOT_AI_GIT_CREATE_DRAFT_PRS=true so test PRs
          // don't trigger CodeRabbit reviews.
          draft: true,
          // Decision 8: the PR title is the commit message.
          title: prCommitMessage,
          head: { ref: prBranch },
          base: { ref: baseBranch },
        });

        // Decision 8: the body answers "who asked for this, and for what".
        expect(createdPr.body).toContain(solutionId);
        expect(createdPr.body).toContain('deploy nginx web server');
        expect(createdPr.body).toContain(prTargetPath);
        expect(createdPr.body).toContain(prPushUser.email);
        expect(createdPr.body).not.toContain(spoofedAuthorEmail);

        // Decision 8: the commit author is the authenticated user, not the
        // client-supplied author.
        const headCommit = await getCommit(createCommitSha);
        expect(headCommit.commit.message).toContain(prCommitMessage);
        expect(headCommit.commit.author.email).toBe(prPushUser.email);
        expect(headCommit.commit.author.name).not.toBe(spoofedAuthorName);

        const prFile = await getGitHubFile(
          `${prTargetPath}/manifests.yaml`,
          prBranch
        );
        expect(prFile).not.toBeNull();
        const prFileContent = Buffer.from(prFile!.content!, 'base64').toString(
          'utf8'
        );
        expect(prFileContent).toContain('apiVersion:');
        expect(prFileContent).toContain('kind:');

        // ── Re-run with UNCHANGED manifests (decision 3) ──
        // The files already match what the PR proposes, so the commit would be
        // empty. That must be an explicit "no changes" outcome, not a GitHub 422.
        const unchangedResponse = await prClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'pushToGit',
            solutionId,
            repoUrl: gitRepoUrl,
            targetPath: prTargetPath,
            branch: baseBranch,
            pullRequest: true,
            commitMessage: prCommitMessage,
            interaction_id: `push_to_git_pr_unchanged_${testRunId}`,
          }
        );

        recordForCleanup(unchangedResponse);

        expect(unchangedResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              solutionId,
              gitPush: {
                pullRequest: {
                  status: 'no_changes',
                  url: prInfo!.url,
                  number: prNumber,
                  branch: prBranch,
                  baseBranch,
                  filesChanged: [],
                },
              },
            },
          },
        });

        // Nothing was pushed and no second PR was opened. The tip is named
        // exactly rather than compared to an earlier read — see
        // waitForBranchSha. That this run added no commit at all is proved
        // positively by the two-commit history check after the update below.
        expect(await getBranchSha(prBranch)).toBe(createCommitSha);
        expect(
          (await listPullRequestsForHead(prBranch)).map(pr => pr.number)
        ).toEqual([prNumber]);

        // ── Re-run with CHANGED manifests (decision 9) ──
        // A different target path is a deterministic content change without
        // re-running the AI. The open PR must be updated in place by pushing to
        // the recorded head branch, not superseded by a second PR.
        const updateResponse = await prClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'pushToGit',
            solutionId,
            repoUrl: gitRepoUrl,
            targetPath: updatedTargetPath,
            branch: baseBranch,
            pullRequest: true,
            commitMessage: prCommitMessage,
            interaction_id: `push_to_git_pr_update_${testRunId}`,
          }
        );

        recordForCleanup(updateResponse);

        expect(updateResponse).toMatchObject({
          success: true,
          data: {
            result: {
              success: true,
              status: 'manifests_pushed',
              solutionId,
              gitPush: {
                path: updatedTargetPath,
                branch: prBranch,
                commitSha: expect.any(String),
                pullRequest: {
                  status: 'updated',
                  url: prInfo!.url,
                  number: prNumber,
                  branch: prBranch,
                  baseBranch,
                  filesChanged: expect.arrayContaining([
                    `${updatedTargetPath}/manifests.yaml`,
                  ]),
                },
              },
            },
          },
        });

        const updateCommitSha: string =
          updateResponse.data!.result.gitPush.commitSha;
        expect(await waitForBranchSha(prBranch, updateCommitSha)).toBe(
          updateCommitSha
        );

        // The head branch is exactly the create commit with the update commit on
        // top: the update added one commit to the recorded branch, and the
        // unchanged re-run before it added none.
        expect(await listBranchCommitShas(prBranch, 2)).toEqual([
          updateCommitSha,
          createCommitSha,
        ]);

        const updatedPr = await waitForPullRequestHeadSha(
          prNumber,
          updateCommitSha
        );
        expect(updatedPr).toMatchObject({
          number: prNumber,
          state: 'open',
          head: { ref: prBranch, sha: updateCommitSha },
          base: { ref: baseBranch },
        });

        // Exactly one PR for this head branch — the re-run updated it.
        expect(
          (await listPullRequestsForHead(prBranch)).map(pr => pr.number)
        ).toEqual([prNumber]);

        expect(
          await getGitHubFile(`${updatedTargetPath}/manifests.yaml`, prBranch)
        ).not.toBeNull();

        // Still nothing on the base branch after three PR-mode pushes.
        expect(await getBranchSha(baseBranch)).toBe(baseShaBeforePr);
        expect(
          await getGitHubFile(`${updatedTargetPath}/manifests.yaml`, baseBranch)
        ).toBeNull();

        // ─────────────────────────────────────────────────────────────────
        // REPOSITORY HOST ALLOWLIST (PRD #710)
        //
        // Same session and same manifests as every push above — only the host
        // changes. `gist.github.com` is the deliberate choice, and it is a
        // tradeoff, so here is the whole of it:
        //
        // - It is refused for a reason that stays true. Matching is exact with
        //   no wildcards, and gist.github.com is a DIFFERENT service —
        //   `<owner>/<repo>` there does not address this repository. The host
        //   this test named before, `www.github.com`, was the SAME service, so
        //   pinning it as refused pinned a latent bug: that bug was fixed, the
        //   host joined the default allowlist, and this assertion broke. Naming
        //   another same-service host would only queue the same breakage up
        //   again. `git-utils-security.test.ts` pins gist.github.com as refused
        //   at the unit level, so both levels argue from one example.
        // - It is real and reachable, so a gate that stopped running would make
        //   a genuine authenticated request instead of failing instantly on DNS.
        //   The test cannot pass merely because the host does not resolve, which
        //   is why an unroutable host is not used here.
        // - A regression keeps the credential inside GitHub. If the gate stops
        //   running, the server's git token goes to a GitHub-operated host, not
        //   to a third party such as gitlab.com whose logs we do not control. A
        //   negative test for a credential gate should not exfiltrate the
        //   credential when it fails.
        //
        // What that costs, stated plainly: gist.github.com will not serve this
        // repository, so a gate failure surfaces as a CLONE failure rather than
        // as a commit landing somewhere we can read back. The "nothing was
        // pushed" reads below are therefore corroboration, not the primary
        // detector — the detector is the exact refusal message, which a clone
        // failure cannot produce.
        // ─────────────────────────────────────────────────────────────────
        const deniedHost = 'gist.github.com';
        const deniedRepoUrl = `https://${deniedHost}/${gitHubRepo.owner}/${gitHubRepo.repo}.git`;
        const deniedTargetPath = `integration-tests/push-to-git-denied-${testRunId}`;

        const deniedResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              stage: 'pushToGit',
              solutionId,
              repoUrl: deniedRepoUrl,
              targetPath: deniedTargetPath,
              commitMessage: `test: pushToGit disallowed host ${testRunId}`,
              interaction_id: `push_to_git_denied_host_${testRunId}`,
            }
          );

        // A push that got through anyway is a failure, but clean up what it
        // created before the assertions below report it.
        recordForCleanup(deniedResponse);

        // The refusal names the offending host and the Helm value that governs
        // it. "Currently allowed: github.com, www.github.com" is load-bearing
        // three times over: it is the operator's next step; it is this suite's
        // proof that the chart rendered the default list into the deployment
        // rather than an empty one — an empty render is deny-all and would have
        // failed every push above instead of just this one; and it is the
        // running server enumerating its own effective allowlist, which is how
        // the allowed case for `www.github.com` is asserted here without paying
        // for a second push (that push would exercise git's redirect-with-
        // credentials behaviour, not this gate).
        // stringContaining, not equality, for one reason only: a VALIDATION
        // error reaches the REST layer already converted to an MCP error, so
        // the transport prefixes the code ("MCP error -32602: "). Everything
        // after that prefix is matched exactly.
        expect(deniedResponse).toMatchObject({
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: expect.stringContaining(
              `Repository host "${deniedHost}" is not allowed. Currently allowed: github.com, www.github.com. To allow it, add the host to the "gitops.allowedRepoHosts" Helm value (default: github.com, www.github.com) and restart the server.`
            ),
          },
          meta: {
            requestId: expect.stringMatching(/^rest_\d+_\d+$/),
            version: 'v1',
          },
        });

        // Rejection happens before a credential is minted or attached, so
        // nothing in the response can carry one — not in the message, and not
        // in the echoed input. A credential rides in a URL as `user:pass@host`,
        // so both hosts in play get the authority form: the refused one, and
        // the real repository host this session has been pushing to. The two
        // substrings are distinct — "@gist.github.com" does not contain
        // "@github.com".
        const deniedResponseText = JSON.stringify(deniedResponse);
        expect(deniedResponseText).not.toContain(`@${deniedHost}`);
        expect(deniedResponseText).not.toContain('@github.com');
        if (gitToken) {
          expect(deniedResponseText).not.toContain(gitToken);
        }

        // Nothing was pushed: the base branch is still where the PR-mode pushes
        // left it, the refused path exists on neither branch, and the open PR
        // gained no commit. Per the note above these corroborate rather than
        // detect — a refusal replaced by a clone failure lands nothing here
        // either — but they are what catches a HALF-working gate: one that
        // refuses the host yet still mints a credential and writes this path to
        // the repository it was already holding open.
        expect(await getBranchSha(baseBranch)).toBe(baseShaBeforePr);
        expect(
          await getGitHubFile(`${deniedTargetPath}/manifests.yaml`, baseBranch)
        ).toBeNull();
        expect(
          await getGitHubFile(`${deniedTargetPath}/manifests.yaml`, prBranch)
        ).toBeNull();
        expect(await getBranchSha(prBranch)).toBe(updateCommitSha);

        // The session still describes the last push that actually happened —
        // the refused call recorded nothing.
        const deniedSessionResponse =
          await integrationTest.httpClient.get<RecommendPayload>(
            `/api/v1/sessions/${solutionId}`
          );
        expect(deniedSessionResponse).toMatchObject({
          success: true,
          data: {
            sessionId: solutionId,
            data: {
              stage: 'pushed',
              gitPush: {
                repoUrl: gitRepoUrl,
                path: updatedTargetPath,
                branch: prBranch,
                commitSha: updateCommitSha,
              },
            },
          },
        });
      } catch (error) {
        // Held, not rethrown yet: cleanup below must run to completion first,
        // and it must not be able to replace this error with its own.
        testFailure = error;
      }

      // Every cleanup step is independent. Collecting failures instead of
      // throwing them is what keeps the two guarantees this block exists for:
      // the first rejection cannot skip the steps behind it (which would leave
      // branches, pull requests and files standing in the shared test
      // repository), and a cleanup problem cannot stand in for the test's own
      // assertion error and send the next reader after the wrong thing.
      const cleanupFailures: string[] = [];
      const cleanupStep = async (step: () => Promise<void>) => {
        try {
          await step();
        } catch (error) {
          cleanupFailures.push(
            error instanceof Error ? error.message : String(error)
          );
        }
      };

      for (const prNumber of createdPrNumbers) {
        await cleanupStep(() => closePullRequest(prNumber));
      }
      for (const branch of createdBranches) {
        await cleanupStep(() => deleteBranch(branch));
      }
      // Files that reached the base branch (the direct push above, plus any
      // push that landed there because PR mode was not honoured).
      for (const filePath of [...pushedFiles].reverse()) {
        await cleanupStep(() => deleteGitHubFile(filePath, cleanupMessage));
      }

      if (testFailure) {
        // Anything cleanup could not remove is reported alongside the real
        // failure rather than in place of it.
        if (cleanupFailures.length > 0) {
          console.error(
            `pushToGit cleanup left artifacts behind:\n${cleanupFailures.join('\n')}`
          );
        }
        throw testFailure;
      }

      // A test that passed but leaked is still a problem for every later run
      // against this repository, so it fails here.
      expect(cleanupFailures).toMatchObject([]);
    }, 1200000);
  });

  describe('Helm Chart Discovery', () => {
    test('should complete Helm workflow: discovery → choose solution → question generation', async () => {
      // Clean up any existing Helm releases BEFORE starting workflow
      // This prevents "another operation in progress" errors from previous runs
      try {
        // Use kubectl to delete namespace - this runs in the test cluster via kubectl
        await integrationTest.kubectl(
          'delete namespace monitoring --ignore-not-found=true --wait=true --timeout=60s'
        );
      } catch {
        // Ignore errors - namespace may not exist
      }

      // PHASE 1: Discover Helm solutions
      // Use Prometheus as test case - no Prometheus CRDs in test cluster, so Helm will be triggered
      const helmResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            intent: 'Install Prometheus for monitoring',
            final: true,
            interaction_id: 'helm_workflow_discovery',
          }
        );

      // Validate response structure and that official prometheus-community chart is included
      // PRD #320: Helm solutions also return visualizationUrl with multiple session IDs
      const expectedHelmResponse = {
        success: true,
        data: {
          result: {
            intent: 'Install Prometheus for monitoring',
            solutions: expect.arrayContaining([
              expect.objectContaining({
                solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
                type: 'helm',
                score: expect.any(Number),
                description: expect.stringMatching(/prometheus/i),
                chart: expect.objectContaining({
                  repository:
                    'https://prometheus-community.github.io/helm-charts',
                  repositoryName: 'prometheus-community',
                  chartName: 'prometheus',
                  official: true,
                  verifiedPublisher: true,
                }),
                reasons: expect.arrayContaining([expect.any(String)]),
              }),
            ]),
            helmInstallation: true,
            nextAction:
              'Call recommend tool with stage: chooseSolution and your preferred solutionId',
            guidance: expect.stringContaining('Helm chart options'),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            // PRD #320: Visualization URL for Helm solutions
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/sol-\d+-[a-f0-9]+(\+sol-\d+-[a-f0-9]+)*$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(helmResponse).toMatchObject(expectedHelmResponse);

      // Find the prometheus-community chart and validate its score
      const solutions = helmResponse.data!.result.solutions;
      const prometheusCommunityChart = solutions.find(
        (s: SolutionSummary) =>
          s.chart?.repositoryName === 'prometheus-community'
      );

      expect(prometheusCommunityChart).toBeDefined();
      expect(prometheusCommunityChart!.score).toBeGreaterThanOrEqual(70);
      expect(prometheusCommunityChart!.score).toBeLessThanOrEqual(100);
      expect(prometheusCommunityChart!.reasons!.length).toBeGreaterThan(0);

      const solutionId = prometheusCommunityChart!.solutionId;

      // PHASE 2: Choose Helm solution - triggers question generation
      const chooseResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'chooseSolution',
            solutionId,
            interaction_id: 'helm_workflow_choose',
          }
        );

      // Validate chooseSolution response structure (same format as capability-based solutions)
      const expectedChooseResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: solutionId,
            currentStage: 'required',
            questions: expect.any(Array),
            nextStage: 'basic',
            message: expect.stringContaining('required configuration'),
            nextAction:
              'Call recommend tool with stage: answerQuestion:required',
            guidance: expect.stringContaining('Present ALL required questions'),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(chooseResponse).toMatchObject(expectedChooseResponse);

      // Validate question structure - each question must have suggestedAnswer for cluster-aware defaults
      const requiredQuestions = chooseResponse.data!.result.questions;
      requiredQuestions.forEach((q: Question) => {
        expect(q).toMatchObject({
          id: expect.any(String),
          question: expect.any(String),
          type: expect.stringMatching(
            /^(text|select|number|boolean|multiselect)$/
          ),
          suggestedAnswer: expect.anything(), // CRITICAL: Cluster-aware defaults
        });
      });

      // PACKAGING QUESTIONS VALIDATION: Helm solutions should NOT have outputFormat/outputPath
      // These are only for capability-based solutions where we package raw manifests
      const outputFormatQuestion = requiredQuestions.find(
        (q: Question) => q.id === 'outputFormat'
      );
      const outputPathQuestion = requiredQuestions.find(
        (q: Question) => q.id === 'outputPath'
      );
      expect(outputFormatQuestion).toBeUndefined();
      expect(outputPathQuestion).toBeUndefined();

      // PHASE 3: Answer required stage questions
      // Helm workflow: required → basic → advanced → ready_for_manifest_generation (NO 'open' stage)
      const allQuestions = [...requiredQuestions];

      // Helper to build answers from questions using suggested values
      const buildAnswers = (questions: Question[]) => {
        const answers: Record<string, unknown> = {};
        questions.forEach((q: Question) => {
          answers[q.id] = validAnswerFor(q);
        });
        return answers;
      };

      // Helper to validate question structure
      const validateQuestions = (questions: Question[]) => {
        questions.forEach((q: Question) => {
          expect(q).toMatchObject({
            id: expect.any(String),
            question: expect.any(String),
            type: expect.stringMatching(
              /^(text|select|number|boolean|multiselect)$/
            ),
            suggestedAnswer: expect.anything(),
          });
        });
      };

      // Answer required stage → should move to basic
      const basicResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:required',
            solutionId,
            answers: buildAnswers(requiredQuestions),
            interaction_id: 'helm_workflow_required',
          }
        );

      expect(basicResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: solutionId,
            currentStage: 'basic',
            nextStage: 'advanced', // NOT 'open' - Helm skips open stage
            questions: expect.any(Array),
          },
        },
      });

      const basicQuestions = basicResponse.data!.result.questions || [];
      validateQuestions(basicQuestions);
      allQuestions.push(...basicQuestions);

      // PHASE 4: Answer basic stage questions → should move to advanced
      const advancedResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:basic',
            solutionId,
            answers: buildAnswers(basicQuestions),
            interaction_id: 'helm_workflow_basic',
          }
        );

      expect(advancedResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: solutionId,
            currentStage: 'advanced',
            nextStage: null, // CRITICAL: Helm has NO 'open' stage - nextStage must be null
            questions: expect.any(Array),
          },
        },
      });

      // CRITICAL: Verify text instructions don't mention 'open stage' for Helm
      // This is what client agents read to decide what to do next
      expect(advancedResponse.data!.result.agentInstructions).not.toContain(
        'open stage'
      );
      expect(advancedResponse.data!.result.guidance).toContain(
        'manifest generation'
      );

      const advancedQuestions = advancedResponse.data!.result.questions || [];
      validateQuestions(advancedQuestions);
      allQuestions.push(...advancedQuestions);

      // Validate questions were generated across all stages
      expect(allQuestions.length).toBeGreaterThan(0);

      // Ensure advanced stage has questions to answer (prevents empty answer submission)
      expect(advancedQuestions.length).toBeGreaterThan(0);

      // Namespace question - fundamental for any Helm installation (MUST exist)
      const questionTexts = allQuestions.map((q: Question) =>
        `${q.id} ${q.question}`.toLowerCase()
      );
      const hasNamespaceQuestion = questionTexts.some(text =>
        text.includes('namespace')
      );
      expect(hasNamespaceQuestion).toBe(true);

      // PHASE 5: Answer advanced stage questions → should go directly to ready_for_manifest_generation
      // (Helm NEVER goes to 'open' stage)
      const completionResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:advanced',
            solutionId,
            answers: buildAnswers(advancedQuestions),
            interaction_id: 'helm_workflow_advanced',
          }
        );

      // Helm should now be ready for manifest generation (skipping open stage)
      // Log full response on failure for debugging
      if (completionResponse.data?.result?.status === 'stage_error') {
        console.error(
          'Stage error details:',
          JSON.stringify(completionResponse.data.result, null, 2)
        );
      }
      expect(completionResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'ready_for_manifest_generation',
            solutionId: solutionId,
            nextAction: 'Call recommend tool with stage: generateManifests',
          },
        },
      });

      // PHASE 6: Generate + deploy the Helm chart. The values.yaml is AI-generated
      // and varies between runs; an occasional bad generation leaves the prometheus
      // pod failing its health probes, so `helm --wait` fails and the deploy reports
      // success:false. Retry generate→deploy a bounded number of times with fresh
      // values (tearing the namespace down between attempts) so that AI-generation
      // variance doesn't flake CI. The happy path succeeds on the first attempt.
      const MAX_DEPLOY_ATTEMPTS = 3;
      let helmNamespace = '';
      let releaseName = '';

      for (let attempt = 1; attempt <= MAX_DEPLOY_ATTEMPTS; attempt++) {
        // Generate Helm values (helm dry-run validation)
        const generateResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              stage: 'generateManifests',
              solutionId,
              interaction_id: 'helm_workflow_generate',
            }
          );

        // Validate Helm generation response
        // PRD #320: Helm generateManifests now returns visualizationUrl
        const expectedGenerateResponse = {
          success: true,
          data: {
            result: {
              success: true,
              status: 'helm_command_generated',
              solutionId: solutionId,
              solutionType: 'helm',
              helmCommand: expect.stringContaining('helm upgrade --install'),
              valuesYaml: expect.any(String),
              // Note: valuesPath is intentionally NOT included - it's an internal implementation detail
              // The helmCommand uses generic 'values.yaml' for user-friendly display
              chart: {
                repository:
                  'https://prometheus-community.github.io/helm-charts',
                repositoryName: 'prometheus-community',
                chartName: 'prometheus',
              },
              releaseName: expect.any(String),
              namespace: expect.any(String),
              validationAttempts: expect.any(Number),
              timestamp: expect.stringMatching(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
              ),
              // PRD #320: Visualization URL for Helm generateManifests
              visualizationUrl: expect.stringMatching(
                /^https:\/\/dot-ai-ui\.test\.local\/v\/sol-\d+-[a-f0-9]+$/
              ),
            },
            tool: 'recommend',
            executionTime: expect.any(Number),
          },
          meta: {
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            requestId: expect.any(String),
            version: 'v1',
          },
        };

        expect(generateResponse).toMatchObject(expectedGenerateResponse);

        // Verify Helm command contains expected components
        const helmCommand = generateResponse.data!.result.helmCommand;
        expect(helmCommand).toContain('prometheus-community/prometheus');
        expect(helmCommand).toContain('--namespace');
        expect(helmCommand).toContain('--create-namespace');
        // Verify user-friendly values file reference (not internal path)
        expect(helmCommand).toContain('-f values.yaml');
        expect(helmCommand).not.toContain('/tmp/');
        expect(helmCommand).not.toContain('sol-');

        // Extract namespace and release name for deployment validation
        helmNamespace = generateResponse.data!.result.namespace;
        releaseName = generateResponse.data!.result.releaseName;

        // NOTE: Visualization endpoint is tested in version.test.ts (fastest tool)

        // Deploy Helm chart (helm upgrade --install execution)
        const deployResponse =
          await integrationTest.httpClient.post<RecommendPayload>(
            '/api/v1/tools/recommend',
            {
              stage: 'deployManifests',
              solutionId,
              timeout: 240, // 4 minutes for a heavy chart (prometheus) to become ready
              interaction_id: 'helm_workflow_deploy',
            }
          );

        // Validate Helm deployment response
        const expectedDeployResponse = {
          success: true,
          data: {
            result: {
              success: true,
              solutionId: solutionId,
              solutionType: 'helm',
              releaseName: releaseName,
              namespace: helmNamespace,
              chart: {
                repository:
                  'https://prometheus-community.github.io/helm-charts',
                repositoryName: 'prometheus-community',
                chartName: 'prometheus',
              },
              message: expect.stringContaining('deployed successfully'),
              helmOutput: expect.any(String),
              deploymentComplete: true,
              timestamp: expect.stringMatching(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
              ),
            },
            tool: 'recommend',
            executionTime: expect.any(Number),
          },
          meta: {
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            requestId: expect.any(String),
            version: 'v1',
          },
        };

        // Success — validate and stop retrying.
        if (deployResponse?.data?.result?.success) {
          expect(deployResponse).toMatchObject(expectedDeployResponse);
          break;
        }

        // Deploy failed. On earlier attempts, tear the namespace down and retry
        // with freshly generated values (addresses AI-generation variance).
        if (attempt < MAX_DEPLOY_ATTEMPTS) {
          await integrationTest
            .kubectl(`delete namespace ${helmNamespace} --ignore-not-found`)
            .catch(() => {
              /* best-effort teardown before regenerating */
            });
          continue;
        }

        // Final attempt failed — gather diagnostics before asserting.
        let diagnostics = '\n=== HELM DEPLOYMENT DIAGNOSTICS ===\n';
        diagnostics += `Deploy response: ${JSON.stringify(deployResponse?.data?.result, null, 2)}\n`;

        try {
          // Get all Helm releases to see their states
          const helmList = await integrationTest.kubectl(
            'get secrets -A -l owner=helm -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,TYPE:.type --no-headers'
          );
          diagnostics += `\n--- Helm Release Secrets ---\n${helmList}\n`;
        } catch {
          diagnostics += `\n--- Helm Release Secrets: Failed to retrieve ---\n`;
        }

        try {
          // Get Helm release history if it exists
          const helmHistory = await integrationTest.kubectl(
            `get secrets -n ${helmNamespace} -l owner=helm,name=${releaseName} -o json`
          );
          const secrets = JSON.parse(helmHistory);
          if (secrets.items?.length > 0) {
            const states = secrets.items.map((s: K8sManifest) => ({
              name: s.metadata?.name,
              status: s.metadata?.labels?.status || 'unknown',
              version: s.metadata?.labels?.version || 'unknown',
            }));
            diagnostics += `\n--- Release "${releaseName}" Secrets ---\n${JSON.stringify(states, null, 2)}\n`;
          }
        } catch {
          diagnostics += `\n--- Release Secrets: Failed to retrieve ---\n`;
        }

        try {
          // Check for any pending pods or events
          const events = await integrationTest.kubectl(
            `get events -n ${helmNamespace} --sort-by='.lastTimestamp' -o custom-columns=TIME:.lastTimestamp,TYPE:.type,REASON:.reason,MESSAGE:.message --no-headers 2>/dev/null | tail -10`
          );
          diagnostics += `\n--- Recent Events in ${helmNamespace} ---\n${events}\n`;
        } catch {
          diagnostics += `\n--- Events: Failed to retrieve ---\n`;
        }

        diagnostics += `(failed after ${MAX_DEPLOY_ATTEMPTS} attempts)\n`;
        diagnostics += '=== END DIAGNOSTICS ===\n';

        // Fail with diagnostics included in error message
        expect(deployResponse?.data?.result?.success, diagnostics).toBe(true);
      }

      // PHASE 7: Verify Helm release was created in cluster
      const helmListResult = await integrationTest.kubectl(
        `get pods -n ${helmNamespace} -l app.kubernetes.io/instance=${releaseName} -o json`
      );
      const helmPods = JSON.parse(helmListResult);

      // Verify at least one pod exists for the release
      expect(helmPods.items.length).toBeGreaterThan(0);
    }, 900000); // 15 minutes for full Helm workflow with deployment

    test('should return no_charts_found when chart does not exist on ArtifactHub', async () => {
      // Use a clearly non-existent chart name
      const noChartResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            intent: 'Install devopstoolkit-nonexistent-operator',
            final: true,
            interaction_id: 'helm_nonexistent_chart_test',
          }
        );

      // Validate no_charts_found response structure
      const expectedNoChartResponse = {
        success: true,
        data: {
          result: {
            status: 'no_charts_found',
            searchQuery: expect.any(String),
            reason: expect.any(String),
            message: expect.stringContaining(
              'No Helm charts found on ArtifactHub'
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(noChartResponse).toMatchObject(expectedNoChartResponse);

      // Validate message includes issue link
      expect(noChartResponse.data!.result.message).toContain(
        'https://github.com/vfarcic/dot-ai/issues/new'
      );
    }, 300000); // 5 minutes for AI analysis
  });

  describe('Helm Packaging (outputFormat: helm)', () => {
    test('should generate Helm chart structure when outputFormat is helm', async () => {
      // PHASE 1: Get solutions for a capability-based deployment
      const solutionsResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            intent: 'deploy nginx web server',
            final: true,
            interaction_id: 'helm_packaging_solutions',
          }
        );

      expect(solutionsResponse).toMatchObject({
        success: true,
        data: {
          result: {
            solutions: expect.any(Array),
          },
        },
      });

      // Find a capability-based solution (type: 'single' or 'combination', not 'helm')
      const solutions = solutionsResponse.data!.result.solutions;
      const capabilitySolution = solutions.find(
        (s: SolutionSummary) => s.type !== 'helm'
      );
      expect(capabilitySolution).toBeDefined();

      const solutionId = capabilitySolution!.solutionId;

      // PHASE 2: Choose solution
      const chooseResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'chooseSolution',
            solutionId,
            interaction_id: 'helm_packaging_choose',
          }
        );

      expect(chooseResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'required',
            questions: expect.any(Array),
          },
        },
      });

      // PHASE 3: Answer required questions with outputFormat: 'helm'
      const requiredQuestions = chooseResponse.data!.result.questions;
      const requiredAnswers: Record<string, unknown> = {};

      requiredQuestions.forEach((q: Question) => {
        if (q.id === 'outputFormat') {
          requiredAnswers[q.id] = 'helm'; // Select Helm packaging
        } else if (q.id === 'outputPath') {
          requiredAnswers[q.id] = './my-nginx-chart';
        } else {
          requiredAnswers[q.id] = validAnswerFor(q);
        }
      });

      const answerRequiredResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:required',
            solutionId,
            answers: requiredAnswers,
            interaction_id: 'helm_packaging_required',
          }
        );

      expect(answerRequiredResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'basic',
          },
        },
      });

      // PHASE 4-6: Skip through remaining stages
      await integrationTest.httpClient.post<RecommendPayload>(
        '/api/v1/tools/recommend',
        {
          stage: 'answerQuestion:basic',
          solutionId,
          answers: {},
          interaction_id: 'helm_packaging_basic',
        }
      );

      await integrationTest.httpClient.post<RecommendPayload>(
        '/api/v1/tools/recommend',
        {
          stage: 'answerQuestion:advanced',
          solutionId,
          answers: {},
          interaction_id: 'helm_packaging_advanced',
        }
      );

      await integrationTest.httpClient.post<RecommendPayload>(
        '/api/v1/tools/recommend',
        {
          stage: 'answerQuestion:open',
          solutionId,
          answers: { open: 'N/A' },
          interaction_id: 'helm_packaging_open',
        }
      );

      // PHASE 7: Generate manifests with Helm packaging
      const generateResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'generateManifests',
            solutionId,
            interaction_id: 'helm_packaging_generate',
          }
        );

      // Validate Helm chart structure in response
      // PRD #320: Helm packaging generateManifests returns visualizationUrl
      const expectedGenerateResponse = {
        success: true,
        data: {
          result: {
            success: true,
            status: 'manifests_generated',
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            outputFormat: 'helm',
            outputPath: './my-nginx-chart',
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'Chart.yaml',
                content: expect.stringContaining('apiVersion: v2'),
              }),
              expect.objectContaining({
                relativePath: 'values.yaml',
                content: expect.any(String),
              }),
            ]),
            validationAttempts: expect.any(Number),
            packagingAttempts: expect.any(Number),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            agentInstructions: expect.stringContaining('Helm chart'),
            // PRD #320: Visualization URL for packaging generateManifests
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/sol-\d+-[a-f0-9]+$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(
        generateResponse,
        `Helm generate failed: ${JSON.stringify(generateResponse.error || generateResponse.data?.result?.error || 'no error field')}`
      ).toMatchObject(expectedGenerateResponse);

      // Validate Helm chart file structure
      const files = generateResponse.data!.result.files;
      const chartYaml = files.find(
        (f: GeneratedFile) => f.relativePath === 'Chart.yaml'
      );
      const valuesYaml = files.find(
        (f: GeneratedFile) => f.relativePath === 'values.yaml'
      );
      const templateFiles = files.filter((f: GeneratedFile) =>
        f.relativePath.startsWith('templates/')
      );

      // Chart.yaml must exist and contain required fields
      expect(chartYaml).toBeDefined();
      expect(chartYaml!.content).toContain('name:');
      expect(chartYaml!.content).toContain('version:');

      // values.yaml must exist
      expect(valuesYaml).toBeDefined();

      // At least one template file must exist
      expect(templateFiles.length).toBeGreaterThan(0);

      // Template files should contain Helm templating syntax
      const hasHelmSyntax = templateFiles.some(
        (f: GeneratedFile) =>
          f.content.includes('{{ .Values.') ||
          f.content.includes('{{ .Release.')
      );
      expect(hasHelmSyntax).toBe(true);
    }, 900000); // 15 minutes for full workflow with AI packaging
  });

  describe('Kustomize Packaging (outputFormat: kustomize)', () => {
    test('should generate Kustomize structure when outputFormat is kustomize', async () => {
      // PHASE 1: Get solutions for a capability-based deployment
      const solutionsResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            intent: 'deploy nginx web server',
            final: true,
            interaction_id: 'kustomize_packaging_solutions',
          }
        );

      expect(solutionsResponse).toMatchObject({
        success: true,
        data: {
          result: {
            solutions: expect.any(Array),
          },
        },
      });

      // Find a capability-based solution (type: 'single' or 'combination', not 'helm')
      const solutions = solutionsResponse.data!.result.solutions;
      const capabilitySolution = solutions.find(
        (s: SolutionSummary) => s.type !== 'helm'
      );
      expect(capabilitySolution).toBeDefined();

      const solutionId = capabilitySolution!.solutionId;

      // PHASE 2: Choose solution
      const chooseResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'chooseSolution',
            solutionId,
            interaction_id: 'kustomize_packaging_choose',
          }
        );

      expect(chooseResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'required',
            questions: expect.any(Array),
          },
        },
      });

      // PHASE 3: Answer required questions with outputFormat: 'kustomize'
      const requiredQuestions = chooseResponse.data!.result.questions;
      const requiredAnswers: Record<string, unknown> = {};

      requiredQuestions.forEach((q: Question) => {
        if (q.id === 'outputFormat') {
          requiredAnswers[q.id] = 'kustomize'; // Select Kustomize packaging
        } else if (q.id === 'outputPath') {
          requiredAnswers[q.id] = './my-nginx-kustomize';
        } else {
          requiredAnswers[q.id] = validAnswerFor(q);
        }
      });

      const answerRequiredResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'answerQuestion:required',
            solutionId,
            answers: requiredAnswers,
            interaction_id: 'kustomize_packaging_required',
          }
        );

      expect(answerRequiredResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'basic',
          },
        },
      });

      // PHASE 4-6: Skip through remaining stages
      await integrationTest.httpClient.post<RecommendPayload>(
        '/api/v1/tools/recommend',
        {
          stage: 'answerQuestion:basic',
          solutionId,
          answers: {},
          interaction_id: 'kustomize_packaging_basic',
        }
      );

      await integrationTest.httpClient.post<RecommendPayload>(
        '/api/v1/tools/recommend',
        {
          stage: 'answerQuestion:advanced',
          solutionId,
          answers: {},
          interaction_id: 'kustomize_packaging_advanced',
        }
      );

      await integrationTest.httpClient.post<RecommendPayload>(
        '/api/v1/tools/recommend',
        {
          stage: 'answerQuestion:open',
          solutionId,
          answers: { open: 'N/A' },
          interaction_id: 'kustomize_packaging_open',
        }
      );

      // PHASE 7: Generate manifests with Kustomize packaging
      const generateResponse =
        await integrationTest.httpClient.post<RecommendPayload>(
          '/api/v1/tools/recommend',
          {
            stage: 'generateManifests',
            solutionId,
            interaction_id: 'kustomize_packaging_generate',
          }
        );

      // Validate Kustomize structure in response
      // PRD #320: Kustomize packaging generateManifests returns visualizationUrl
      const expectedGenerateResponse = {
        success: true,
        data: {
          result: {
            success: true,
            status: 'manifests_generated',
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            outputFormat: 'kustomize',
            outputPath: './my-nginx-kustomize',
            files: expect.arrayContaining([
              expect.objectContaining({
                relativePath: 'kustomization.yaml',
                content: expect.stringContaining(
                  'apiVersion: kustomize.config.k8s.io/v1beta1'
                ),
              }),
              expect.objectContaining({
                relativePath: 'overlays/production/kustomization.yaml',
                content: expect.stringContaining('images:'),
              }),
              expect.objectContaining({
                relativePath: 'base/kustomization.yaml',
                content: expect.stringContaining('resources:'),
              }),
            ]),
            validationAttempts: expect.any(Number),
            packagingAttempts: expect.any(Number),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
            ),
            agentInstructions: expect.stringContaining('Kustomize'),
            // PRD #320: Visualization URL for Kustomize generateManifests
            visualizationUrl: expect.stringMatching(
              /^https:\/\/dot-ai-ui\.test\.local\/v\/sol-\d+-[a-f0-9]+$/
            ),
          },
          tool: 'recommend',
          executionTime: expect.any(Number),
        },
        meta: {
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          ),
          requestId: expect.any(String),
          version: 'v1',
        },
      };

      expect(generateResponse).toMatchObject(expectedGenerateResponse);

      // Validate Kustomize file structure
      const files = generateResponse.data!.result.files;
      const rootKustomization = files.find(
        (f: GeneratedFile) => f.relativePath === 'kustomization.yaml'
      );
      const productionOverlay = files.find(
        (f: GeneratedFile) =>
          f.relativePath === 'overlays/production/kustomization.yaml'
      );
      const baseKustomization = files.find(
        (f: GeneratedFile) => f.relativePath === 'base/kustomization.yaml'
      );
      const baseResources = files.filter(
        (f: GeneratedFile) =>
          f.relativePath.startsWith('base/') &&
          f.relativePath !== 'base/kustomization.yaml'
      );

      // Root kustomization.yaml must exist and reference overlays/production
      expect(rootKustomization).toBeDefined();
      expect(rootKustomization!.content).toContain('kind: Kustomization');
      expect(rootKustomization!.content).toMatch(
        /resources:[\s\S]*overlays\/production/
      );

      // overlays/production/kustomization.yaml must exist with images transformer
      expect(productionOverlay).toBeDefined();
      expect(productionOverlay!.content).toContain('kind: Kustomization');
      expect(productionOverlay!.content).toContain('images:');
      expect(productionOverlay!.content).toMatch(
        /resources:[\s\S]*\.\.\/\.\.\/base/
      );

      // base/kustomization.yaml must exist
      expect(baseKustomization).toBeDefined();
      expect(baseKustomization!.content).toContain('kind: Kustomization');

      // At least one base resource file must exist
      expect(baseResources.length).toBeGreaterThan(0);

      // Base resources should be valid Kubernetes manifests with image without tag
      const deploymentFile = baseResources.find((f: GeneratedFile) =>
        f.content.includes('kind: Deployment')
      );
      expect(deploymentFile).toBeDefined();
      // Base deployment image should NOT have a specific version tag (tag is in overlay)
      const imageMatch = deploymentFile!.content.match(
        /image:\s*["']?([^"'\s]+)["']?/
      );
      expect(imageMatch).not.toBeNull(); // Fix: toBeDefined passes for null
      // Image should not contain a specific version tag (e.g., nginx:1.21, nginx:v1.0)
      // :latest is acceptable as it's the implicit default and overlays still specify actual versions
      const imageName = imageMatch![1];
      // If image has a registry (contains /), allow colons in registry but not for version tags
      const lastSlashIndex = imageName.lastIndexOf('/');
      const afterLastSlash =
        lastSlashIndex >= 0 ? imageName.substring(lastSlashIndex) : imageName;
      // Allow :latest, :alpine, :slim (variant tags) but not version tags like :1.21, :v1.0, :stable
      expect(afterLastSlash).not.toMatch(/:(\d|v\d|stable)/i); // No specific version tags

      // SOLUTION CR VALIDATION: Verify Solution CR is in overlay (not base) since it has namespace-specific references
      const yaml = await import('js-yaml');
      const overlayResources = files.filter(
        (f: GeneratedFile) =>
          f.relativePath.startsWith('overlays/production/') &&
          f.relativePath !== 'overlays/production/kustomization.yaml'
      );
      const solutionFile = overlayResources.find((f: GeneratedFile) =>
        f.content.includes('kind: Solution')
      );
      expect(solutionFile).toBeDefined();

      // Verify overlay kustomization.yaml references the solution file
      expect(productionOverlay!.content).toMatch(
        /resources:[\s\S]*solution\.yaml/
      );

      const parsedSolution = yaml.loadAll(
        solutionFile!.content
      ) as Array<K8sManifest | null>;
      const solutionCR = parsedSolution.find(m => m?.kind === 'Solution');
      expect(solutionCR).toBeDefined();

      // Verify Solution CR structure
      expect(solutionCR).toMatchObject({
        apiVersion: 'dot-ai.devopstoolkit.live/v1alpha1',
        kind: 'Solution',
        metadata: {
          name: expect.stringMatching(/^solution-sol-\d+-[a-f0-9]{8}$/),
          // Note: namespace may or may not be present depending on AI output
          labels: {
            'dot-ai.devopstoolkit.live/created-by': 'dot-ai-mcp',
            'dot-ai.devopstoolkit.live/solution-id': expect.stringMatching(
              /^sol-\d+-[a-f0-9]{8}$/
            ),
          },
        },
        spec: {
          intent: 'deploy nginx web server',
          // Verify resources have namespace preserved (kustomize doesn't transform spec.resources)
          resources: expect.arrayContaining([
            expect.objectContaining({
              kind: expect.any(String),
              name: expect.any(String),
              namespace: expect.any(String), // namespace must be present in spec.resources
            }),
          ]),
          context: expect.objectContaining({
            createdBy: 'dot-ai-mcp',
            rationale: expect.any(String),
            // Note: patterns and policies may be stripped by AI packaging when empty
          }),
        },
      });
    }, 900000); // 15 minutes for full workflow with AI packaging
  });
});
