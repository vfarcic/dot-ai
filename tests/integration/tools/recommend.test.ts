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
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('Recommend Tool Integration', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(() => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');
  });

  describe('Recommendation Workflow', () => {
    test('should complete full workflow: clarification → solutions → choose → answer → generate → deploy', async () => {
      let manifestPath: string;

      // PHASE 1: Request recommendations without final flag (clarification)
      // NOTE: Testing default stage behavior - no stage parameter defaults to 'recommend'
      const clarificationResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        intent: 'deploy database',
        // stage omitted - should default to 'recommend'
        interaction_id: 'clarification_phase'
      });

      // Validate clarification response structure (based on actual API inspection)
      const expectedClarificationResponse = {
        success: true,
        data: {
          result: {
            status: 'clarification_available',
            intent: 'deploy database',
            analysis: {
              enhancementPotential: expect.stringMatching(/^(LOW|MEDIUM|HIGH)$/),
              recommendedFocus: expect.any(String),
              currentSpecificity: expect.any(String),
              strengthAreas: expect.any(Array),
              improvementAreas: expect.any(Array)
            },
            questions: expect.any(Array),
            agentInstructions: expect.stringContaining('clarification questions')
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(clarificationResponse).toMatchObject(expectedClarificationResponse);

      // PHASE 2: Request recommendations with refined intent and final=true (solutions)
      const solutionsResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'recommend', // Explicit stage parameter
        intent: 'deploy postgresql database',
        final: true,
        interaction_id: 'solution_assembly_phase'
      });

      // Validate solutions response structure (based on actual API inspection)
      const expectedSolutionsResponse = {
        success: true,
        data: {
          result: {
            intent: 'deploy postgresql database',
            solutions: expect.any(Array),
            patternSummary: {
              solutionsUsingPatterns: expect.any(Number),
              totalSolutions: expect.any(Number),
              totalPatternInfluences: expect.any(Number),
              patternsAvailable: expect.any(String)
            },
            nextAction: 'Call recommend tool with stage: chooseSolution and your preferred solutionId',
            guidance: expect.stringContaining('You MUST present these solutions'),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(solutionsResponse).toMatchObject(expectedSolutionsResponse);

      // Extract solutionId for next phase
      const solutionId = solutionsResponse.data.result.solutions[0].solutionId;

      // PHASE 3: Call chooseSolution stage with solutionId
      const chooseResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'chooseSolution',
        solutionId,
        interaction_id: 'choose_solution_phase'
      });

      // Validate chooseSolution response structure (based on actual API inspection)
      const expectedChooseResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: expect.stringMatching(/^sol_\d{4}-\d{2}-\d{2}T\d{6}_[a-f0-9]+$/),
            currentStage: 'required',
            questions: expect.any(Array),
            nextStage: expect.stringMatching(/^(basic|advanced|open)$/),
            message: expect.stringContaining('required configuration'),
            nextAction: 'Call recommend tool with stage: answerQuestion:required',
            guidance: expect.stringContaining('Do NOT try to generate manifests yet'),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(chooseResponse).toMatchObject(expectedChooseResponse);

      // CRITICAL: Validate that all questions have suggestedAnswer field
      const requiredQuestions = chooseResponse.data.result.questions;
      expect(requiredQuestions.length).toBeGreaterThan(0);

      requiredQuestions.forEach((q: any) => {
        expect(q).toMatchObject({
          id: expect.any(String),
          question: expect.any(String),
          type: expect.stringMatching(/^(text|select|number|boolean|multiselect)$/),
          validation: expect.any(Object),
          suggestedAnswer: expect.anything() // CRITICAL: Verify suggestedAnswer exists
        });
      });

      // PHASE 4: Answer required stage questions using suggestedAnswers
      const requiredAnswers: Record<string, any> = {};
      requiredQuestions.forEach((q: any) => {
        requiredAnswers[q.id] = q.suggestedAnswer;
      });

      const answerRequiredResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:required', // Combined stage routing
        solutionId,
        answers: requiredAnswers,
        interaction_id: 'answer_required_phase'
      });

      // Validate answerQuestion response (should return next stage questions)
      expect(answerRequiredResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: expect.stringMatching(/^sol_\d{4}-\d{2}-\d{2}T\d{6}_[a-f0-9]+$/),
            currentStage: 'basic',
            questions: expect.any(Array),
            nextAction: 'Call recommend tool with stage: answerQuestion:basic'
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        }
      });

      // PHASE 5: Skip basic stage (empty answers)
      const skipBasicResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:basic', // Combined stage routing
        solutionId,
        answers: {},
        interaction_id: 'skip_basic_phase'
      });

      // Validate skip basic response (based on actual API inspection)
      const expectedSkipBasicResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'advanced',
            questions: expect.any(Array),
            nextStage: 'open',
            nextAction: 'Call recommend tool with stage: answerQuestion:advanced'
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(skipBasicResponse).toMatchObject(expectedSkipBasicResponse);

      // PHASE 6: Skip advanced stage (empty answers)
      const skipAdvancedResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:advanced', // Combined stage routing
        solutionId,
        answers: {},
        interaction_id: 'skip_advanced_phase'
      });

      // Validate skip advanced response (based on actual API inspection)
      const expectedSkipAdvancedResponse = {
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'open',
            questions: expect.any(Array),
            nextAction: 'Call recommend tool with stage: answerQuestion:open'
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(skipAdvancedResponse).toMatchObject(expectedSkipAdvancedResponse);

      // PHASE 7: Complete open stage with N/A
      const completeOpenResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:open', // Combined stage routing
        solutionId,
        answers: { open: 'N/A' },
        interaction_id: 'complete_open_phase'
      });

      // Validate open stage completion response (based on actual API inspection)
      const expectedCompleteOpenResponse = {
        success: true,
        data: {
          result: {
            status: 'ready_for_manifest_generation',
            solutionId: expect.stringMatching(/^sol_\d{4}-\d{2}-\d{2}T\d{6}_[a-f0-9]+$/),
            nextAction: 'Call recommend tool with stage: generateManifests',
            message: expect.stringContaining('Configuration complete'),
            solutionData: expect.any(Object)
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(completeOpenResponse).toMatchObject(expectedCompleteOpenResponse);

      // PHASE 8: Generate manifests
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'generateManifests',
        solutionId,
        interaction_id: 'generate_manifests_phase'
      });

      // Validate generateManifests response (based on actual API inspection)
      const expectedGenerateResponse = {
        success: true,
        data: {
          result: {
            success: true,
            status: 'manifests_generated',
            solutionId: expect.stringMatching(/^sol_\d{4}-\d{2}-\d{2}T\d{6}_[a-f0-9]+$/),
            manifests: expect.stringContaining('apiVersion:'), // Should contain YAML
            yamlPath: expect.stringContaining('.yaml'),
            validationAttempts: expect.any(Number),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(generateResponse).toMatchObject(expectedGenerateResponse);

      // Verify manifests contain valid Kubernetes YAML structure (generic validation)
      const manifests = generateResponse.data.result.manifests;
      expect(manifests).toContain('apiVersion:');
      expect(manifests).toContain('kind:');
      expect(manifests).toContain('metadata:');

      // PHASE 9: Deploy manifests to cluster
      const deployResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'deployManifests',
        solutionId,
        interaction_id: 'deploy_manifests_phase'
      });

      // Validate deployManifests response (based on actual API inspection)
      const expectedDeployResponse = {
        success: true,
        data: {
          result: {
            success: true,
            solutionId: expect.stringMatching(/^sol_\d{4}-\d{2}-\d{2}T\d{6}_[a-f0-9]+$/),
            manifestPath: expect.stringContaining('.yaml'),
            message: expect.stringContaining('Deployment'),
            kubectlOutput: expect.any(String),
            deploymentComplete: true,
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
          },
          tool: 'recommend',
          executionTime: expect.any(Number)
        },
        meta: {
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          requestId: expect.any(String),
          version: 'v1'
        }
      };

      expect(deployResponse).toMatchObject(expectedDeployResponse);

      // PHASE 10: Verify resources were created in the cluster
      // Use the manifest file that was deployed
      manifestPath = deployResponse.data.result.manifestPath;

      // Verify resources from the manifest exist (should fail if not found)
      const verifyResult = await integrationTest.kubectl(
        `get -f ${manifestPath} --no-headers`
      );
      expect(verifyResult.length).toBeGreaterThan(0); // Should have created resources
    }, 1200000); // 20 minutes for full AI workflow (accommodates slower AI models like OpenAI)
  });
});