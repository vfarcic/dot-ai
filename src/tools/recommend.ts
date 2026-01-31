/**
 * Recommend Tool - AI-powered Kubernetes resource recommendations
 */

import { z } from 'zod';
import { ErrorHandler } from '../core/error-handling';
import { ResourceRecommender, Question } from '../core/schema';
import { DotAI, buildAgentDisplayBlock } from '../core/index';
import { Logger } from '../core/error-handling';
import { GenericSessionManager } from '../core/generic-session-manager';
import { handleChooseSolutionTool } from './choose-solution';
import { handleAnswerQuestionTool } from './answer-question';
import { handleGenerateManifestsTool } from './generate-manifests';
import { handleDeployManifestsTool } from './deploy-manifests';
import { loadPrompt } from '../core/shared-prompt-loader';
import { extractJsonFromAIResponse } from '../core/platform-utils';
import { getVisualizationUrl } from '../core/visualization';
import { ArtifactHubService } from '../core/artifacthub';
import { HelmChartInfo } from '../core/helm-types';
import type { PluginManager } from '../core/plugin-manager';

// Intent refinement heuristic constants
const VAGUE_INTENT_THRESHOLD = 100; // Characters - intents below this trigger guidance

// Tool metadata for direct MCP registration
export const RECOMMEND_TOOL_NAME = 'recommend';
export const RECOMMEND_TOOL_DESCRIPTION = 'Deploy applications, infrastructure, and services using Kubernetes resources with AI recommendations. Supports cloud resources via operators like Crossplane, cluster management via CAPI, and traditional Kubernetes workloads. Describe what you want to deploy. Does NOT handle policy creation, organizational patterns, or resource capabilities - use manageOrgData for those.';

// Zod schema for MCP registration (unified tool with stage routing)
export const RECOMMEND_TOOL_INPUT_SCHEMA = {
  stage: z.string().optional().describe('Deployment workflow stage: "recommend" (default), "chooseSolution", "answerQuestion:required", "answerQuestion:basic", "answerQuestion:advanced", "answerQuestion:open", "generateManifests", "deployManifests". Defaults to "recommend" if omitted.'),
  intent: z.string().min(1).max(1000).optional().describe('What the user wants to deploy, create, setup, install, or run on Kubernetes. Examples: "deploy web application", "create PostgreSQL database", "setup Redis cache", "install Prometheus monitoring", "configure Ingress controller", "provision storage volumes", "launch MongoDB operator", "run Node.js API", "setup CI/CD pipeline", "create load balancer", "install Grafana dashboard", "deploy React frontend"'),
  final: z.boolean().optional().describe('Set to true to skip intent clarification and proceed directly with recommendations. If false or omitted, the tool will analyze the intent and provide clarification questions to help improve recommendation quality.'),
  // Parameters for chooseSolution stage
  solutionId: z.string().optional().describe('Solution ID for chooseSolution, answerQuestion, generateManifests, and deployManifests stages'),
  // Parameters for answerQuestion stage (stage parameter contains the config stage like "answerQuestion:required")
  answers: z.record(z.string(), z.any()).optional().describe('User answers for answerQuestion stage'),
  // Parameters for deployManifests stage
  timeout: z.number().optional().describe('Deployment timeout in seconds for deployManifests stage'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};

// Solution data stored by GenericSessionManager
// Supports both capability-based solutions (with resources) and Helm solutions (with chart)
export interface SolutionData {
  toolName: 'recommend';  // PRD #320: Tool identifier for visualization endpoint
  stage?: 'solutions' | 'questions' | 'manifests' | 'deployed';  // UI workflow stage for page refresh support
  intent: string;
  type: string;  // 'single' | 'combination' for capability, 'helm' for Helm
  score: number;
  description: string;
  reasons: string[];
  // Capability-based solutions have resources
  resources?: Array<{
    kind: string;
    apiVersion: string;
    group: string;
    description: string;
  }>;
  // Helm solutions have chart info
  chart?: HelmChartInfo;
  questions: {
    required?: Question[];
    basic?: Question[];
    advanced?: Question[];
    open?: { question: string; placeholder: string; answer?: string };
    relevantPolicies?: string[];  // Policy descriptions from question generation
  };
  answers: Record<string, unknown>;
  timestamp: string;
  appliedPatterns?: string[];  // Pattern descriptions that influenced this solution
  // PRD #320: Generated manifests data for visualization
  generatedManifests?: {
    type: 'raw' | 'helm' | 'kustomize';
    outputPath?: string;
    files?: Array<{ relativePath: string; content: string }>;
    valuesYaml?: string;  // For Helm charts
    helmCommand?: string;  // For Helm charts
    chart?: {
      repository: string;
      repositoryName: string;
      chartName: string;
      version: string;
    };
    releaseName?: string;
    namespace?: string;
    validationAttempts?: number;
    packagingAttempts?: number;
  };
  // Workflow state tracking for UI page refresh support (dot-ai-ui feature request)
  currentQuestionStage?: 'required' | 'basic' | 'advanced' | 'open';
  nextQuestionStage?: string | null;
  allSolutions?: Array<{  // Context: all solutions that were available
    solutionId: string;
    type: string;
    score: number;
    description: string;
    reasons: string[];
  }>;
  organizationalContext?: {  // Pattern/policy usage context across all solutions
    solutionsUsingPatterns: number;
    totalSolutions: number;
    totalPatterns: number;
    totalPolicies: number;
    patternsAvailable: string;
    policiesAvailable: string;
  };
}

/**
 * Check if intent is vague using simple heuristic (character count)
 *
 * @param intent User's intent string
 * @returns true if intent is considered vague and needs refinement
 */
function isVagueIntent(intent: string): boolean {
  return intent.length < VAGUE_INTENT_THRESHOLD;
}

/**
 * Generate guidance response for vague intents by loading the prompt template
 *
 * @param intent The vague intent that was provided
 * @returns Structured response with guidance for the client agent
 */
function generateIntentRefinementGuidance(intent: string): object {
  // Load the guidance prompt from file
  const guidance = loadPrompt('intent-refinement-guidance', {});

  return {
    success: true,
    needsRefinement: true,
    intent,
    guidance
  };
}


// Session management now handled by GenericSessionManager

/**
 * Arguments for recommend tool
 */
interface RecommendToolArgs {
  stage?: string;
  intent?: string;
  final?: boolean;
  solutionId?: string;
  answers?: Record<string, unknown>;
  timeout?: number;
  interaction_id?: string;
}

/**
 * AI response structure for Helm chart selection
 */
interface AIChartSelectionResponse {
  solutions?: Array<{
    chartName: string;
    repositoryUrl: string;
    repositoryName: string;
    version: string;
    appVersion?: string;
    score: number;
    description: string;
    reasons: string[];
  }>;
  noMatchReason?: string;
}

/**
 * Direct MCP tool handler for recommend functionality (unified with stage routing)
 * PRD #343: pluginManager required for kubectl operations
 */
export async function handleRecommendTool(
  args: RecommendToolArgs,
  dotAI: DotAI,
  logger: Logger,
  requestId: string,
  pluginManager: PluginManager
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      // Stage-based routing: extract stage and route to appropriate handler
      const stage = args.stage || 'recommend'; // Default to 'recommend' if not specified

      logger.debug('Handling recommend request with stage routing', { requestId, stage, intent: args?.intent });

      // Route to appropriate handler based on stage
      if (stage === 'chooseSolution') {
        return await handleChooseSolutionTool(args as { solutionId: string }, dotAI, logger, requestId);
      }

      if (stage.startsWith('answerQuestion:')) {
        // Extract config stage from stage parameter (e.g., "answerQuestion:required" -> "required")
        const configStage = stage.split(':')[1] as 'required' | 'basic' | 'advanced' | 'open';
        const answerQuestionArgs = {
          solutionId: args.solutionId || '',
          stage: configStage,
          answers: args.answers || {},
          interaction_id: args.interaction_id
        };
        return await handleAnswerQuestionTool(answerQuestionArgs, dotAI, logger, requestId);
      }

      if (stage === 'generateManifests') {
        // PRD #359: Uses unified plugin registry for kubectl operations
        return await handleGenerateManifestsTool(args as { solutionId: string }, dotAI, logger, requestId, pluginManager);
      }

      if (stage === 'deployManifests') {
        // PRD #359: Uses unified plugin registry for kubectl operations
        return await handleDeployManifestsTool(args as { solutionId: string }, dotAI, logger, requestId);
      }

      // Default: recommend stage (original recommend logic)
      // Input validation is handled automatically by MCP SDK with Zod schema
      // args are already validated and typed when we reach this point
      // AI provider is already initialized and validated in dotAI.ai

      // Initialize session manager
      const sessionManager = new GenericSessionManager<SolutionData>('sol');
      logger.debug('Session manager initialized', { requestId });


      logger.info('Starting resource recommendation process', {
        requestId,
        intent: args.intent,
        hasApiProvider: dotAI.ai.isInitialized()
      });

      // Ensure intent is provided for recommend stage
      const intent = args.intent || '';

      // Check if intent needs refinement using simple heuristic (unless final=true)
      if (!args.final && isVagueIntent(intent)) {
        logger.debug('Vague intent detected, returning refinement guidance', {
          requestId,
          intent,
          intentLength: intent.length,
          threshold: VAGUE_INTENT_THRESHOLD
        });

        const guidanceResponse = generateIntentRefinementGuidance(intent);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(guidanceResponse, null, 2)
            }
          ]
        };
      }

      if (args.final) {
        logger.debug('Skipping intent refinement check (final=true), proceeding directly', { requestId });
      } else {
        logger.debug('Intent is detailed enough, proceeding with recommendations', {
          requestId,
          intentLength: intent.length
        });
      }

      // Initialize AI-powered ResourceRecommender with provider
      // PRD #359: Uses unified plugin registry for kubectl operations
      const recommender = new ResourceRecommender(dotAI.ai);

      // Create discovery function
      const explainResourceFn = async (resource: string) => {
        logger.debug(`Explaining resource: ${resource}`, { requestId });
        return await dotAI.discovery.explainResource(resource);
      };

      // Find best solutions for the user intent
      logger.debug('Generating recommendations with AI', { requestId });
      const solutionResult = await recommender.findBestSolutions(
        intent,
        explainResourceFn,
        args.interaction_id
      );

      // Handle Helm recommendation case
      if (solutionResult.helmRecommendation) {
        logger.info('Helm installation recommended, searching ArtifactHub', {
          requestId,
          suggestedTool: solutionResult.helmRecommendation.suggestedTool,
          searchQuery: solutionResult.helmRecommendation.searchQuery,
          reason: solutionResult.helmRecommendation.reason
        });

        // Search ArtifactHub for matching charts
        const artifactHub = new ArtifactHubService();
        const charts = await artifactHub.searchCharts(
          solutionResult.helmRecommendation.searchQuery,
          10 // Get top 10 results for AI to analyze
        );

        if (charts.length === 0) {
          // No charts found on ArtifactHub
          logger.warn('No charts found on ArtifactHub', { requestId, searchQuery: solutionResult.helmRecommendation.searchQuery });
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'no_charts_found',
                searchQuery: solutionResult.helmRecommendation.searchQuery,
                reason: solutionResult.helmRecommendation.reason,
                message: `No Helm charts found on ArtifactHub for "${solutionResult.helmRecommendation.suggestedTool}". We currently only support charts available on ArtifactHub. If you need support for charts from other sources, please open an issue at https://github.com/vfarcic/dot-ai/issues/new`
              }, null, 2)
            }]
          };
        }

        // Format charts for AI analysis
        const chartsText = artifactHub.formatChartsForAI(charts);

        // Load prompt and send to AI for chart selection
        const chartSelectionPrompt = loadPrompt('helm-chart-selection', {
          intent: args.intent,
          charts: chartsText
        });

        const aiResponse = await dotAI.ai.sendMessage(
          chartSelectionPrompt,
          'recommend-helm-chart-selection',
          {
            user_intent: args.intent,
            interaction_id: args.interaction_id
          }
        );

        // Parse AI response
        const aiSelection = extractJsonFromAIResponse(aiResponse.content) as AIChartSelectionResponse;

        if (!aiSelection.solutions || aiSelection.solutions.length === 0) {
          // AI couldn't find matching charts
          logger.warn('AI found no matching charts', { requestId, noMatchReason: aiSelection.noMatchReason });
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'no_matching_charts',
                reason: aiSelection.noMatchReason || 'No charts matched the user intent',
                searchQuery: solutionResult.helmRecommendation.searchQuery,
                instruction: 'Consider refining your request or manually specifying a Helm chart.'
              }, null, 2)
            }]
          };
        }

        // Create sessions for Helm solutions
        const timestamp = new Date().toISOString();
        const helmSolutionSummaries = [];

        for (const aiSolution of aiSelection.solutions) {
          // Find the original chart data from ArtifactHub results
          const originalChart = charts.find(c => c.name === aiSolution.chartName);

          const solutionData: SolutionData = {
            toolName: 'recommend',
            intent,
            type: 'helm',
            score: aiSolution.score,
            description: aiSolution.description,
            reasons: aiSolution.reasons,
            chart: {
              repository: aiSolution.repositoryUrl,
              repositoryName: aiSolution.repositoryName,
              chartName: aiSolution.chartName,
              version: aiSolution.version,
              appVersion: aiSolution.appVersion,
              official: originalChart?.official || originalChart?.repository?.official,
              verifiedPublisher: originalChart?.verified_publisher || originalChart?.repository?.verified_publisher
            },
            questions: { required: [], basic: [], advanced: [] }, // Will be generated from chart values later
            answers: {},
            timestamp,
            stage: 'solutions' // UI page refresh support
          };

          const session = sessionManager.createSession(solutionData);
          const solutionId = session.sessionId;
          logger.debug('Helm solution session created', { requestId, solutionId });

          helmSolutionSummaries.push({
            solutionId,
            type: 'helm',
            score: aiSolution.score,
            description: aiSolution.description,
            chart: solutionData.chart,
            reasons: aiSolution.reasons
          });
        }

        // Update all sessions with allSolutions context for UI page refresh
        for (const summary of helmSolutionSummaries) {
          sessionManager.updateSession(summary.solutionId, {
            allSolutions: helmSolutionSummaries.map(s => ({
              solutionId: s.solutionId,
              type: s.type,
              score: s.score,
              description: s.description,
              reasons: s.reasons
            }))
          });
        }

        // PRD #320: Generate visualization URL with all solution session IDs
        const helmSessionIds = helmSolutionSummaries.map(s => s.solutionId);
        const helmVisualizationUrl = getVisualizationUrl(helmSessionIds);

        // Build Helm solutions response
        const helmResponse = {
          intent: args.intent,
          solutions: helmSolutionSummaries,
          helmInstallation: true,
          nextAction: 'Call recommend tool with stage: chooseSolution and your preferred solutionId',
          guidance: '🔴 CRITICAL: Present these Helm chart options to the user and ask them to choose. DO NOT automatically call chooseSolution() without user input. Show the chart details (repository, version, official status) to help users decide.',
          timestamp,
          ...(helmVisualizationUrl && { visualizationUrl: helmVisualizationUrl })
        };

        logger.info('Helm solutions prepared', {
          requestId,
          solutionCount: helmSolutionSummaries.length,
          topScore: helmSolutionSummaries[0]?.score,
          ...(helmVisualizationUrl && { visualizationUrl: helmVisualizationUrl })
        });

        // Build content blocks - JSON for REST API, agent instruction for MCP agents
        const content: Array<{ type: 'text'; text: string }> = [{
          type: 'text' as const,
          text: JSON.stringify(helmResponse, null, 2)
        }];

        // Add agent instruction block if visualization URL is present
        const agentDisplayBlock = buildAgentDisplayBlock({ visualizationUrl: helmVisualizationUrl });
        if (agentDisplayBlock) {
          content.push(agentDisplayBlock);
        }

        return { content };
      }

      const solutions = solutionResult.solutions;

      logger.info('Recommendation process completed', {
        requestId,
        solutionCount: solutions.length,
        topScore: solutions[0]?.score
      });

      // Create solution files and build response
      const solutionSummaries = [];
      const timestamp = new Date().toISOString();

      // Limit to top 5 solutions (respecting quality thresholds from AI ranking)
      const topSolutions = solutions.slice(0, 5);

      for (const solution of topSolutions) {
        // Create complete solution data
        const solutionData: SolutionData = {
          toolName: 'recommend',
          intent,
          type: solution.type,
          score: solution.score,
          description: solution.description,
          reasons: solution.reasons,
          resources: solution.resources.map(r => ({
            kind: r.kind,
            apiVersion: r.apiVersion,
            group: r.group,
            description: r.description
          })),
          questions: solution.questions, // Includes relevantPolicies from question generation
          answers: {}, // Empty initially - will be filled by answerQuestion tool
          timestamp,
          appliedPatterns: solution.appliedPatterns || [],
          stage: 'solutions' // UI page refresh support
        };

        // Create solution session
        const session = sessionManager.createSession(solutionData);
        const solutionId = session.sessionId;
        logger.debug('Solution session created', { requestId, solutionId, fileName: `${solutionId}.json` });

        // Add to response summary (decision-making data only)
        solutionSummaries.push({
          solutionId,
          type: solution.type,
          score: solution.score,
          description: solution.description,
          primaryResources: solution.resources.slice(0, 3).map(r => r.kind),
          resources: solution.resources.map(r => ({
            kind: r.kind,
            apiVersion: r.apiVersion,
            group: r.group,
            description: r.description?.split('\n')[0] || `${r.kind} resource` // Use first line of description or fallback
          })),
          reasons: solution.reasons,
          appliedPatterns: solution.appliedPatterns || [],
          relevantPolicies: solution.questions?.relevantPolicies || []
        });
      }

      // Update all sessions with allSolutions context for UI page refresh
      for (const summary of solutionSummaries) {
        sessionManager.updateSession(summary.solutionId, {
          allSolutions: solutionSummaries.map(s => ({
            solutionId: s.solutionId,
            type: s.type,
            score: s.score,
            description: s.description,
            reasons: s.reasons
          }))
        });
      }

      // Analyze pattern/policy usage across all solutions
      const patternsUsedCount = solutionSummaries.filter(s => s.appliedPatterns && s.appliedPatterns.length > 0).length;
      const totalPatterns = solutionSummaries.reduce((count, s) => count + (s.appliedPatterns?.length || 0), 0);
      const totalPolicies = solutionSummaries.reduce((count, s) => count + (s.relevantPolicies?.length || 0), 0);

      // Build organizational context for storage and response
      const organizationalContext = {
        solutionsUsingPatterns: patternsUsedCount,
        totalSolutions: solutionSummaries.length,
        totalPatterns: totalPatterns,
        totalPolicies: totalPolicies,
        patternsAvailable: totalPatterns > 0 ? "Yes" : "None found or pattern search failed",
        policiesAvailable: totalPolicies > 0 ? "Yes" : "None found or policy search failed"
      };

      // Update all sessions with organizationalContext for UI page refresh
      for (const summary of solutionSummaries) {
        sessionManager.updateSession(summary.solutionId, {
          organizationalContext
        });
      }

      // PRD #320: Generate visualization URL with all solution session IDs
      const sessionIds = solutionSummaries.map(s => s.solutionId);
      const visualizationUrl = getVisualizationUrl(sessionIds);

      // Build new response format
      const response = {
        intent: args.intent,
        solutions: solutionSummaries,
        organizationalContext,
        nextAction: "Call recommend tool with stage: chooseSolution and your preferred solutionId",
        guidance: "🔴 CRITICAL: You MUST present these solutions to the user and ask them to choose. DO NOT automatically call chooseSolution() without user input. Stop here and wait for user selection. IMPORTANT: Show the list of Kubernetes resources (from the 'resources' field) that each solution will use - this helps users understand what gets deployed. ALSO: Include pattern usage information in your response - show which solutions used organizational patterns and which did not.",
        timestamp,
        ...(visualizationUrl && { visualizationUrl })
      };

      logger.info('Solution sessions created and response prepared', {
        requestId,
        solutionCount: solutionSummaries.length,
        ...(visualizationUrl && { visualizationUrl })
      });

      // Build content blocks - JSON for REST API, agent instruction for MCP agents
      const content: Array<{ type: 'text'; text: string }> = [{
        type: 'text' as const,
        text: JSON.stringify(response, null, 2)
      }];

      // Add agent instruction block if visualization URL is present
      const agentDisplayBlock = buildAgentDisplayBlock({ visualizationUrl });
      if (agentDisplayBlock) {
        content.push(agentDisplayBlock);
      }

      return { content };
    },
    {
      operation: 'recommend_tool',
      component: 'RecommendTool',
      requestId,
      input: args
    },
    {
      convertToMcp: true,
      retryCount: 1
    }
  );
}