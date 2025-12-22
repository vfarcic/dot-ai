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
    test('should complete full workflow: intent refinement → solutions → choose → answer → generate → deploy', async () => {
      let manifestPath: string;

      // PHASE 1: Request recommendations without final flag (intent refinement)
      // NOTE: Testing default stage behavior - no stage parameter defaults to 'recommend'
      // Vague intent (< 100 chars) triggers heuristic-based guidance response (PRD #22)
      const refinementResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        intent: 'deploy database',
        // stage omitted - should default to 'recommend'
        interaction_id: 'refinement_phase'
      });

      // Validate intent refinement response structure (heuristic-based, no AI call)
      const expectedRefinementResponse = {
        success: true,
        data: {
          result: {
            success: true,
            needsRefinement: true,
            intent: 'deploy database',
            guidance: expect.stringContaining('Intent Refinement Guidance')
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

      expect(refinementResponse).toMatchObject(expectedRefinementResponse);

      // Validate guidance content includes key sections
      const guidance = refinementResponse.data.result.guidance;
      expect(guidance).toContain('Analyze Available Context');
      expect(guidance).toContain('Perform Deep Analysis');
      expect(guidance).toContain('Discuss With User');
      expect(guidance).toContain('final: true');

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
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            currentStage: 'required',
            questions: expect.any(Array),
            nextStage: expect.stringMatching(/^(basic|advanced|open)$/),
            message: expect.stringContaining('required configuration'),
            nextAction: 'Call recommend tool with stage: answerQuestion:required',
            guidance: expect.stringContaining('Present ALL required questions'),
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
          suggestedAnswer: expect.anything() // CRITICAL: Verify suggestedAnswer exists
        });
      });

      // PACKAGING QUESTIONS VALIDATION: Capability-based solutions must have outputFormat and outputPath
      const outputFormatQuestion = requiredQuestions.find((q: any) => q.id === 'outputFormat');
      const outputPathQuestion = requiredQuestions.find((q: any) => q.id === 'outputPath');

      expect(outputFormatQuestion).toBeDefined();
      expect(outputFormatQuestion).toMatchObject({
        id: 'outputFormat',
        question: 'How would you like the manifests packaged?',
        type: 'select',
        options: ['raw', 'helm', 'kustomize'],
        suggestedAnswer: 'kustomize',
        validation: { required: true }
      });

      expect(outputPathQuestion).toBeDefined();
      expect(outputPathQuestion).toMatchObject({
        id: 'outputPath',
        question: 'Where would you like to save the output?',
        type: 'text',
        suggestedAnswer: './manifests',
        validation: { required: true }
      });

      // PHASE 4: Answer required stage questions using suggestedAnswers
      // Explicitly use 'raw' format for main workflow test (kustomize/helm have dedicated tests)
      const requiredAnswers: Record<string, any> = {};
      requiredQuestions.forEach((q: any) => {
        if (q.id === 'outputFormat') {
          requiredAnswers[q.id] = 'raw'; // Use raw format for main workflow
        } else {
          requiredAnswers[q.id] = q.suggestedAnswer;
        }
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
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
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
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
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
      // Raw format returns a single manifests.yaml file
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
                content: expect.stringContaining('apiVersion:')
              })
            ]),
            validationAttempts: expect.any(Number),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
            agentInstructions: expect.stringContaining('Write the files to')
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

      // Verify raw format contains single manifests.yaml file
      const files = generateResponse.data.result.files;
      const manifestFile = files.find((f: any) => f.relativePath === 'manifests.yaml');
      expect(manifestFile).toBeDefined();
      expect(manifestFile.content).toContain('apiVersion:');
      expect(manifestFile.content).toContain('kind:');
      expect(manifestFile.content).toContain('metadata:');

      // For raw format, all manifests are in a single file
      const manifests = manifestFile.content;

      // SOLUTION CR VALIDATION: Verify Solution CR is included and properly structured
      const yaml = await import('js-yaml');
      // For raw format, parse the single manifests.yaml file
      const parsedManifests = yaml.loadAll(manifests);
      const solutionCR = parsedManifests.find((m: any) => m?.kind === 'Solution');

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
            'dot-ai.devopstoolkit.live/solution-id': solutionId
          }
        },
        spec: {
          intent: 'deploy postgresql database',
          resources: expect.arrayContaining([
            expect.objectContaining({
              apiVersion: expect.any(String),
              kind: expect.any(String),
              name: expect.any(String),
              namespace: namespace
            })
          ]),
          context: expect.objectContaining({
            createdBy: 'dot-ai-mcp',
            rationale: expect.any(String)
            // Note: patterns and policies may be stripped by AI packaging when empty
          })
        }
      });

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
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
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
      // Parse manifests to verify each resource exists
      const deployedManifests = yaml.loadAll(manifests);
      expect(deployedManifests.length).toBeGreaterThan(0);

      // Verify at least one non-Solution resource was deployed
      const nonSolutionResources = deployedManifests.filter((m: any) => m.kind !== 'Solution');
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
      let deployedResource: any;

      for (let waited = 0; waited < maxWaitMs; waited += pollIntervalMs) {
        const resourceResult = await integrationTest.kubectl(
          `get ${firstResource.kind} ${firstResource.name} -n ${namespace} -o json`
        );
        deployedResource = JSON.parse(resourceResult);

        // Check if Solution ownerReference exists
        const hasOwnerRef = deployedResource.metadata.ownerReferences?.some(
          (ref: any) => ref.kind === 'Solution' && ref.name === solutionCRName
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
      expect(deployedResource.metadata.ownerReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            apiVersion: 'dot-ai.devopstoolkit.live/v1alpha1',
            kind: 'Solution',
            name: solutionCRName,
            controller: false, // Solution is a tracker, not the primary controller
            blockOwnerDeletion: true
          })
        ])
      );
    }, 1200000); // 20 minutes for full AI workflow (accommodates slower AI models like OpenAI)
  });

  describe('Helm Chart Discovery', () => {
    test('should complete Helm workflow: discovery → choose solution → question generation', async () => {
      // PHASE 1: Discover Helm solutions
      // Use Prometheus as test case - no Prometheus CRDs in test cluster, so Helm will be triggered
      const helmResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        intent: 'Install Prometheus for monitoring',
        final: true,
        interaction_id: 'helm_workflow_discovery'
      });

      // Validate response structure and that official prometheus-community chart is included
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
                  repository: 'https://prometheus-community.github.io/helm-charts',
                  repositoryName: 'prometheus-community',
                  chartName: 'prometheus',
                  official: true,
                  verifiedPublisher: true
                }),
                reasons: expect.arrayContaining([expect.any(String)])
              })
            ]),
            helmInstallation: true,
            nextAction: 'Call recommend tool with stage: chooseSolution and your preferred solutionId',
            guidance: expect.stringContaining('Helm chart options'),
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

      expect(helmResponse).toMatchObject(expectedHelmResponse);

      // Find the prometheus-community chart and validate its score
      const solutions = helmResponse.data.result.solutions;
      const prometheusCommunityChart = solutions.find(
        (s: any) => s.chart?.repositoryName === 'prometheus-community'
      );

      expect(prometheusCommunityChart).toBeDefined();
      expect(prometheusCommunityChart.score).toBeGreaterThanOrEqual(70);
      expect(prometheusCommunityChart.score).toBeLessThanOrEqual(100);
      expect(prometheusCommunityChart.reasons.length).toBeGreaterThan(0);

      const solutionId = prometheusCommunityChart.solutionId;

      // PHASE 2: Choose Helm solution - triggers question generation
      const chooseResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'chooseSolution',
        solutionId,
        interaction_id: 'helm_workflow_choose'
      });

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
            nextAction: 'Call recommend tool with stage: answerQuestion:required',
            guidance: expect.stringContaining('Present ALL required questions'),
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

      // Validate question structure - each question must have suggestedAnswer for cluster-aware defaults
      const requiredQuestions = chooseResponse.data.result.questions;
      requiredQuestions.forEach((q: any) => {
        expect(q).toMatchObject({
          id: expect.any(String),
          question: expect.any(String),
          type: expect.stringMatching(/^(text|select|number|boolean|multiselect)$/),
          suggestedAnswer: expect.anything() // CRITICAL: Cluster-aware defaults
        });
      });

      // PACKAGING QUESTIONS VALIDATION: Helm solutions should NOT have outputFormat/outputPath
      // These are only for capability-based solutions where we package raw manifests
      const outputFormatQuestion = requiredQuestions.find((q: any) => q.id === 'outputFormat');
      const outputPathQuestion = requiredQuestions.find((q: any) => q.id === 'outputPath');
      expect(outputFormatQuestion).toBeUndefined();
      expect(outputPathQuestion).toBeUndefined();

      // PHASE 3: Answer required stage questions
      // Helm workflow: required → basic → advanced → ready_for_manifest_generation (NO 'open' stage)
      const allQuestions = [...requiredQuestions];

      // Helper to build answers from questions using suggested values
      const buildAnswers = (questions: any[]) => {
        const answers: Record<string, any> = {};
        questions.forEach((q: any) => {
          answers[q.id] = q.suggestedAnswer;
        });
        return answers;
      };

      // Helper to validate question structure
      const validateQuestions = (questions: any[]) => {
        questions.forEach((q: any) => {
          expect(q).toMatchObject({
            id: expect.any(String),
            question: expect.any(String),
            type: expect.stringMatching(/^(text|select|number|boolean|multiselect)$/),
            suggestedAnswer: expect.anything()
          });
        });
      };

      // Answer required stage → should move to basic
      const basicResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:required',
        solutionId,
        answers: buildAnswers(requiredQuestions),
        interaction_id: 'helm_workflow_required'
      });

      expect(basicResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: solutionId,
            currentStage: 'basic',
            nextStage: 'advanced', // NOT 'open' - Helm skips open stage
            questions: expect.any(Array)
          }
        }
      });

      const basicQuestions = basicResponse.data.result.questions || [];
      validateQuestions(basicQuestions);
      allQuestions.push(...basicQuestions);

      // PHASE 4: Answer basic stage questions → should move to advanced
      const advancedResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:basic',
        solutionId,
        answers: buildAnswers(basicQuestions),
        interaction_id: 'helm_workflow_basic'
      });

      expect(advancedResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            solutionId: solutionId,
            currentStage: 'advanced',
            nextStage: null, // CRITICAL: Helm has NO 'open' stage - nextStage must be null
            questions: expect.any(Array)
          }
        }
      });

      // CRITICAL: Verify text instructions don't mention 'open stage' for Helm
      // This is what client agents read to decide what to do next
      expect(advancedResponse.data.result.agentInstructions).not.toContain('open stage');
      expect(advancedResponse.data.result.guidance).toContain('manifest generation');

      const advancedQuestions = advancedResponse.data.result.questions || [];
      validateQuestions(advancedQuestions);
      allQuestions.push(...advancedQuestions);

      // Validate questions were generated across all stages
      expect(allQuestions.length).toBeGreaterThan(0);

      // Ensure advanced stage has questions to answer (prevents empty answer submission)
      expect(advancedQuestions.length).toBeGreaterThan(0);

      // Namespace question - fundamental for any Helm installation (MUST exist)
      const questionTexts = allQuestions.map((q: any) => `${q.id} ${q.question}`.toLowerCase());
      const hasNamespaceQuestion = questionTexts.some(text => text.includes('namespace'));
      expect(hasNamespaceQuestion).toBe(true);

      // PHASE 5: Answer advanced stage questions → should go directly to ready_for_manifest_generation
      // (Helm NEVER goes to 'open' stage)
      const completionResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:advanced',
        solutionId,
        answers: buildAnswers(advancedQuestions),
        interaction_id: 'helm_workflow_advanced'
      });

      // Helm should now be ready for manifest generation (skipping open stage)
      // Log full response on failure for debugging
      if (completionResponse.data?.result?.status === 'stage_error') {
        console.error('Stage error details:', JSON.stringify(completionResponse.data.result, null, 2));
      }
      expect(completionResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'ready_for_manifest_generation',
            solutionId: solutionId,
            nextAction: 'Call recommend tool with stage: generateManifests'
          }
        }
      });

      // PHASE 6: Generate Helm values (helm dry-run validation)
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'generateManifests',
        solutionId,
        interaction_id: 'helm_workflow_generate'
      });

      // Validate Helm generation response
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
              repository: 'https://prometheus-community.github.io/helm-charts',
              repositoryName: 'prometheus-community',
              chartName: 'prometheus'
            },
            releaseName: expect.any(String),
            namespace: expect.any(String),
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

      // Verify Helm command contains expected components
      const helmCommand = generateResponse.data.result.helmCommand;
      expect(helmCommand).toContain('prometheus-community/prometheus');
      expect(helmCommand).toContain('--namespace');
      expect(helmCommand).toContain('--create-namespace');
      // Verify user-friendly values file reference (not internal path)
      expect(helmCommand).toContain('-f values.yaml');
      expect(helmCommand).not.toContain('/tmp/');
      expect(helmCommand).not.toContain('sol-');

      // Extract namespace and release name for deployment validation
      const helmNamespace = generateResponse.data.result.namespace;
      const releaseName = generateResponse.data.result.releaseName;

      // PHASE 6: Deploy Helm chart (helm upgrade --install execution)
      const deployResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'deployManifests',
        solutionId,
        timeout: 120, // 2 minutes for Helm install
        interaction_id: 'helm_workflow_deploy'
      });

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
              repository: 'https://prometheus-community.github.io/helm-charts',
              repositoryName: 'prometheus-community',
              chartName: 'prometheus'
            },
            message: expect.stringContaining('deployed successfully'),
            helmOutput: expect.any(String),
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
      const noChartResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        intent: 'Install devopstoolkit-nonexistent-operator',
        final: true,
        interaction_id: 'helm_nonexistent_chart_test'
      });

      // Validate no_charts_found response structure
      const expectedNoChartResponse = {
        success: true,
        data: {
          result: {
            status: 'no_charts_found',
            searchQuery: expect.any(String),
            reason: expect.any(String),
            message: expect.stringContaining('No Helm charts found on ArtifactHub')
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

      expect(noChartResponse).toMatchObject(expectedNoChartResponse);

      // Validate message includes issue link
      expect(noChartResponse.data.result.message).toContain('https://github.com/vfarcic/dot-ai/issues/new');
    }, 300000); // 5 minutes for AI analysis
  });

  describe('Helm Packaging (outputFormat: helm)', () => {
    test('should generate Helm chart structure when outputFormat is helm', async () => {
      // PHASE 1: Get solutions for a capability-based deployment
      const solutionsResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        intent: 'deploy nginx web server',
        final: true,
        interaction_id: 'helm_packaging_solutions'
      });

      expect(solutionsResponse).toMatchObject({
        success: true,
        data: {
          result: {
            solutions: expect.any(Array)
          }
        }
      });

      // Find a capability-based solution (type: 'single' or 'combination', not 'helm')
      const solutions = solutionsResponse.data.result.solutions;
      const capabilitySolution = solutions.find((s: any) => s.type !== 'helm');
      expect(capabilitySolution).toBeDefined();

      const solutionId = capabilitySolution.solutionId;

      // PHASE 2: Choose solution
      const chooseResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'chooseSolution',
        solutionId,
        interaction_id: 'helm_packaging_choose'
      });

      expect(chooseResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'required',
            questions: expect.any(Array)
          }
        }
      });

      // PHASE 3: Answer required questions with outputFormat: 'helm'
      const requiredQuestions = chooseResponse.data.result.questions;
      const requiredAnswers: Record<string, any> = {};

      requiredQuestions.forEach((q: any) => {
        if (q.id === 'outputFormat') {
          requiredAnswers[q.id] = 'helm'; // Select Helm packaging
        } else if (q.id === 'outputPath') {
          requiredAnswers[q.id] = './my-nginx-chart';
        } else {
          requiredAnswers[q.id] = q.suggestedAnswer;
        }
      });

      const answerRequiredResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:required',
        solutionId,
        answers: requiredAnswers,
        interaction_id: 'helm_packaging_required'
      });

      expect(answerRequiredResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'basic'
          }
        }
      });

      // PHASE 4-6: Skip through remaining stages
      await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:basic',
        solutionId,
        answers: {},
        interaction_id: 'helm_packaging_basic'
      });

      await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:advanced',
        solutionId,
        answers: {},
        interaction_id: 'helm_packaging_advanced'
      });

      await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:open',
        solutionId,
        answers: { open: 'N/A' },
        interaction_id: 'helm_packaging_open'
      });

      // PHASE 7: Generate manifests with Helm packaging
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'generateManifests',
        solutionId,
        interaction_id: 'helm_packaging_generate'
      });

      // Validate Helm chart structure in response
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
                content: expect.stringContaining('apiVersion: v2')
              }),
              expect.objectContaining({
                relativePath: 'values.yaml',
                content: expect.any(String)
              })
            ]),
            validationAttempts: expect.any(Number),
            packagingAttempts: expect.any(Number),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
            agentInstructions: expect.stringContaining('Helm chart')
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

      // Validate Helm chart file structure
      const files = generateResponse.data.result.files;
      const chartYaml = files.find((f: any) => f.relativePath === 'Chart.yaml');
      const valuesYaml = files.find((f: any) => f.relativePath === 'values.yaml');
      const templateFiles = files.filter((f: any) => f.relativePath.startsWith('templates/'));

      // Chart.yaml must exist and contain required fields
      expect(chartYaml).toBeDefined();
      expect(chartYaml.content).toContain('name:');
      expect(chartYaml.content).toContain('version:');

      // values.yaml must exist
      expect(valuesYaml).toBeDefined();

      // At least one template file must exist
      expect(templateFiles.length).toBeGreaterThan(0);

      // Template files should contain Helm templating syntax
      const hasHelmSyntax = templateFiles.some((f: any) =>
        f.content.includes('{{ .Values.') || f.content.includes('{{ .Release.')
      );
      expect(hasHelmSyntax).toBe(true);
    }, 900000); // 15 minutes for full workflow with AI packaging
  });

  describe('Kustomize Packaging (outputFormat: kustomize)', () => {
    test('should generate Kustomize structure when outputFormat is kustomize', async () => {
      // PHASE 1: Get solutions for a capability-based deployment
      const solutionsResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        intent: 'deploy nginx web server',
        final: true,
        interaction_id: 'kustomize_packaging_solutions'
      });

      expect(solutionsResponse).toMatchObject({
        success: true,
        data: {
          result: {
            solutions: expect.any(Array)
          }
        }
      });

      // Find a capability-based solution (type: 'single' or 'combination', not 'helm')
      const solutions = solutionsResponse.data.result.solutions;
      const capabilitySolution = solutions.find((s: any) => s.type !== 'helm');
      expect(capabilitySolution).toBeDefined();

      const solutionId = capabilitySolution.solutionId;

      // PHASE 2: Choose solution
      const chooseResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'chooseSolution',
        solutionId,
        interaction_id: 'kustomize_packaging_choose'
      });

      expect(chooseResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'required',
            questions: expect.any(Array)
          }
        }
      });

      // PHASE 3: Answer required questions with outputFormat: 'kustomize'
      const requiredQuestions = chooseResponse.data.result.questions;
      const requiredAnswers: Record<string, any> = {};

      requiredQuestions.forEach((q: any) => {
        if (q.id === 'outputFormat') {
          requiredAnswers[q.id] = 'kustomize'; // Select Kustomize packaging
        } else if (q.id === 'outputPath') {
          requiredAnswers[q.id] = './my-nginx-kustomize';
        } else {
          requiredAnswers[q.id] = q.suggestedAnswer;
        }
      });

      const answerRequiredResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:required',
        solutionId,
        answers: requiredAnswers,
        interaction_id: 'kustomize_packaging_required'
      });

      expect(answerRequiredResponse).toMatchObject({
        success: true,
        data: {
          result: {
            status: 'stage_questions',
            currentStage: 'basic'
          }
        }
      });

      // PHASE 4-6: Skip through remaining stages
      await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:basic',
        solutionId,
        answers: {},
        interaction_id: 'kustomize_packaging_basic'
      });

      await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:advanced',
        solutionId,
        answers: {},
        interaction_id: 'kustomize_packaging_advanced'
      });

      await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'answerQuestion:open',
        solutionId,
        answers: { open: 'N/A' },
        interaction_id: 'kustomize_packaging_open'
      });

      // PHASE 7: Generate manifests with Kustomize packaging
      const generateResponse = await integrationTest.httpClient.post('/api/v1/tools/recommend', {
        stage: 'generateManifests',
        solutionId,
        interaction_id: 'kustomize_packaging_generate'
      });

      // Validate Kustomize structure in response
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
                content: expect.stringContaining('apiVersion: kustomize.config.k8s.io/v1beta1')
              }),
              expect.objectContaining({
                relativePath: 'overlays/production/kustomization.yaml',
                content: expect.stringContaining('images:')
              }),
              expect.objectContaining({
                relativePath: 'base/kustomization.yaml',
                content: expect.stringContaining('resources:')
              })
            ]),
            validationAttempts: expect.any(Number),
            packagingAttempts: expect.any(Number),
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
            agentInstructions: expect.stringContaining('Kustomize')
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

      // Validate Kustomize file structure
      const files = generateResponse.data.result.files;
      const rootKustomization = files.find((f: any) => f.relativePath === 'kustomization.yaml');
      const productionOverlay = files.find((f: any) => f.relativePath === 'overlays/production/kustomization.yaml');
      const baseKustomization = files.find((f: any) => f.relativePath === 'base/kustomization.yaml');
      const baseResources = files.filter((f: any) =>
        f.relativePath.startsWith('base/') && f.relativePath !== 'base/kustomization.yaml'
      );

      // Root kustomization.yaml must exist and reference overlays/production
      expect(rootKustomization).toBeDefined();
      expect(rootKustomization.content).toContain('kind: Kustomization');
      expect(rootKustomization.content).toMatch(/resources:[\s\S]*overlays\/production/);

      // overlays/production/kustomization.yaml must exist with images transformer
      expect(productionOverlay).toBeDefined();
      expect(productionOverlay.content).toContain('kind: Kustomization');
      expect(productionOverlay.content).toContain('images:');
      expect(productionOverlay.content).toMatch(/resources:[\s\S]*\.\.\/\.\.\/base/);

      // base/kustomization.yaml must exist
      expect(baseKustomization).toBeDefined();
      expect(baseKustomization.content).toContain('kind: Kustomization');

      // At least one base resource file must exist
      expect(baseResources.length).toBeGreaterThan(0);

      // Base resources should be valid Kubernetes manifests with image without tag
      const deploymentFile = baseResources.find((f: any) => f.content.includes('kind: Deployment'));
      expect(deploymentFile).toBeDefined();
      // Base deployment image should NOT have a tag (tag is in overlay)
      const imageMatch = deploymentFile.content.match(/image:\s*["']?([^"'\s]+)["']?/);
      expect(imageMatch).not.toBeNull(); // Fix: toBeDefined passes for null
      // Image should not contain a colon followed by a tag (e.g., nginx:1.21)
      // Allow for images like "nginx" or "ghcr.io/org/app" but not "nginx:tag"
      const imageName = imageMatch![1];
      // If image has a registry (contains /), allow colons in registry but not for tags
      // Simple check: if there's a colon after the last slash, it's likely a tag
      const lastSlashIndex = imageName.lastIndexOf('/');
      const afterLastSlash = lastSlashIndex >= 0 ? imageName.substring(lastSlashIndex) : imageName;
      expect(afterLastSlash).not.toMatch(/:[a-zA-Z0-9]/); // No tag like :v1.0 or :latest

      // SOLUTION CR VALIDATION: Verify Solution CR is in overlay (not base) since it has namespace-specific references
      const yaml = await import('js-yaml');
      const overlayResources = files.filter((f: any) =>
        f.relativePath.startsWith('overlays/production/') && f.relativePath !== 'overlays/production/kustomization.yaml'
      );
      const solutionFile = overlayResources.find((f: any) => f.content.includes('kind: Solution'));
      expect(solutionFile).toBeDefined();

      // Verify overlay kustomization.yaml references the solution file
      expect(productionOverlay.content).toMatch(/resources:[\s\S]*solution\.yaml/);

      const parsedSolution = yaml.loadAll(solutionFile.content);
      const solutionCR = parsedSolution.find((m: any) => m?.kind === 'Solution');
      expect(solutionCR).toBeDefined();

      // Verify Solution CR structure
      expect(solutionCR).toMatchObject({
        apiVersion: 'dot-ai.devopstoolkit.live/v1alpha1',
        kind: 'Solution',
        metadata: {
          name: expect.stringMatching(/^solution-sol-\d+-[a-f0-9]{8}$/),
          namespace: expect.any(String), // namespace in metadata for overlay resources
          labels: {
            'dot-ai.devopstoolkit.live/created-by': 'dot-ai-mcp',
            'dot-ai.devopstoolkit.live/solution-id': expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/)
          }
        },
        spec: {
          intent: 'deploy nginx web server',
          // Verify resources have namespace preserved (kustomize doesn't transform spec.resources)
          resources: expect.arrayContaining([
            expect.objectContaining({
              kind: expect.any(String),
              name: expect.any(String),
              namespace: expect.any(String) // namespace must be present in spec.resources
            })
          ]),
          context: expect.objectContaining({
            createdBy: 'dot-ai-mcp',
            rationale: expect.any(String)
            // Note: patterns and policies may be stripped by AI packaging when empty
          })
        }
      });
    }, 900000); // 15 minutes for full workflow with AI packaging
  });
});