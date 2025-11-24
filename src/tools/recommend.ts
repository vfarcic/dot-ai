/**
 * Recommend Tool - AI-powered Kubernetes resource recommendations
 */

import { z } from 'zod';
import { ErrorHandler } from '../core/error-handling';
import { ResourceRecommender } from '../core/schema';
import { AIProvider, IntentAnalysisResult } from '../core/ai-provider.interface';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { ensureClusterConnection } from '../core/cluster-utils';
import { GenericSessionManager } from '../core/generic-session-manager';
import { handleChooseSolutionTool } from './choose-solution';
import { handleAnswerQuestionTool } from './answer-question';
import { handleGenerateManifestsTool } from './generate-manifests';
import { handleDeployManifestsTool } from './deploy-manifests';
import { loadPrompt } from '../core/shared-prompt-loader';
import { extractJsonFromAIResponse } from '../core/platform-utils';

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
  answers: z.record(z.any()).optional().describe('User answers for answerQuestion stage'),
  // Parameters for deployManifests stage
  timeout: z.number().optional().describe('Deployment timeout in seconds for deployManifests stage'),
  interaction_id: z.string().optional().describe('INTERNAL ONLY - Do not populate. Used for evaluation dataset generation.')
};

// Solution data stored by GenericSessionManager
export interface SolutionData {
  intent: string;
  type: string;
  score: number;
  description: string;
  reasons: string[];
  analysis: string;
  resources: Array<{
    kind: string;
    apiVersion: string;
    group: string;
    description: string;
  }>;
  questions: {
    required?: any[];
    basic?: any[];
    advanced?: any[];
    open?: any;
    relevantPolicies?: string[];  // Policy descriptions from question generation
  };
  answers: Record<string, any>;
  timestamp: string;
  appliedPatterns?: string[];  // Pattern descriptions that influenced this solution
}

/**
 * Analyze intent for clarification opportunities using AI
 *
 * @param intent User's deployment intent
 * @param aiProvider AI provider instance to use for analysis
 * @param logger Logger for error reporting
 * @param organizationalPatterns Optional organizational patterns context
 * @returns Analysis result with clarification opportunities
 */
async function analyzeIntentForClarification(
  intent: string,
  aiProvider: AIProvider,
  logger: Logger,
  organizationalPatterns: string = '',
  evaluationContext?: {
    user_intent?: string;
    setup_context?: string;
    failure_analysis?: string;
    interaction_id?: string;
  }
): Promise<IntentAnalysisResult> {
  try {
    // Load intent analysis prompt template
    const analysisPrompt = loadPrompt('intent-analysis', {
      intent,
      organizational_patterns: organizationalPatterns || 'No specific organizational patterns available'
    });

    // Send to AI for analysis
    const response = await aiProvider.sendMessage(analysisPrompt, 'recommend-intent-analysis', evaluationContext);

    // Parse JSON response using shared utility
    const analysisResult = extractJsonFromAIResponse(response.content);

    // Validate the response structure
    if (!analysisResult.clarificationOpportunities || !Array.isArray(analysisResult.clarificationOpportunities)) {
      throw new Error('Invalid analysis result structure: missing clarificationOpportunities array');
    }

    if (!analysisResult.overallAssessment || !analysisResult.intentQuality) {
      throw new Error('Invalid analysis result structure: missing overallAssessment or intentQuality');
    }

    return analysisResult;

  } catch (error) {
    // If parsing fails or API call fails, return a fallback minimal analysis
    logger.warn?.('Intent analysis failed, returning minimal analysis', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      clarificationOpportunities: [],
      overallAssessment: {
        enhancementPotential: 'LOW',
        primaryGaps: [],
        recommendedFocus: 'Proceed with original intent - analysis unavailable'
      },
      intentQuality: {
        currentSpecificity: 'Unable to analyze - using original intent',
        strengthAreas: ['User provided clear deployment intent'],
        improvementAreas: []
      }
    };
  }
}


// Session management now handled by GenericSessionManager

/**
 * Direct MCP tool handler for recommend functionality (unified with stage routing)
 */
export async function handleRecommendTool(
  args: any,
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      // Stage-based routing: extract stage and route to appropriate handler
      const stage = args.stage || 'recommend'; // Default to 'recommend' if not specified

      logger.debug('Handling recommend request with stage routing', { requestId, stage, intent: args?.intent });

      // Route to appropriate handler based on stage
      if (stage === 'chooseSolution') {
        return await handleChooseSolutionTool(args, dotAI, logger, requestId);
      }

      if (stage.startsWith('answerQuestion:')) {
        // Extract config stage from stage parameter (e.g., "answerQuestion:required" -> "required")
        const configStage = stage.split(':')[1];
        const answerQuestionArgs = {
          solutionId: args.solutionId,
          stage: configStage,
          answers: args.answers
        };
        return await handleAnswerQuestionTool(answerQuestionArgs, dotAI, logger, requestId);
      }

      if (stage === 'generateManifests') {
        return await handleGenerateManifestsTool(args, dotAI, logger, requestId);
      }

      if (stage === 'deployManifests') {
        return await handleDeployManifestsTool(args, dotAI, logger, requestId);
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

      // Initialize AI provider for potential clarification analysis
      const aiProvider = dotAI.ai;

      // Check if intent clarification is needed (unless final=true)
      if (!args.final) {
        logger.debug('Analyzing intent for clarification opportunities', { requestId, intent: args.intent });

        const analysisResult = await analyzeIntentForClarification(
          args.intent, 
          aiProvider, 
          logger, 
          '', // organizationalPatterns - empty for now
          {
            user_intent: args.intent,
            interaction_id: args.interaction_id
          }
        );
        
        // If clarification opportunities exist, return them to the client agent
        if (analysisResult.clarificationOpportunities && 
            analysisResult.clarificationOpportunities.length > 0 &&
            analysisResult.overallAssessment.enhancementPotential !== 'LOW') {
          
          // Convert analysis to structured questions for client agent
          const questions = analysisResult.clarificationOpportunities
            .map((opp: any, index: number) => ({
              id: `clarification-${index + 1}`,
              question: opp.suggestedQuestions?.[0] || `Can you provide more details about ${opp.missingContext.toLowerCase()}?`,
              reasoning: opp.reasoning,
              examples: opp.suggestedQuestions?.slice(1) || []
            }));

          const clarificationResponse = {
            status: 'clarification_available',
            intent: args.intent,
            analysis: {
              enhancementPotential: analysisResult.overallAssessment.enhancementPotential,
              recommendedFocus: analysisResult.overallAssessment.recommendedFocus,
              currentSpecificity: analysisResult.intentQuality.currentSpecificity,
              strengthAreas: analysisResult.intentQuality.strengthAreas,
              improvementAreas: analysisResult.intentQuality.improvementAreas
            },
            questions,
            agentInstructions: 'Present these clarification questions to help the user provide a more specific intent. When the user provides a refined intent (or confirms the current intent is sufficient), call the recommend tool again with final: true to proceed with recommendations.'
          };

          logger.debug('Returning clarification questions', { 
            requestId, 
            questionsCount: questions.length,
            enhancementPotential: analysisResult.overallAssessment.enhancementPotential
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(clarificationResponse, null, 2)
              }
            ]
          };
        }

        logger.debug('No significant clarification opportunities found, proceeding with recommendations', { requestId });
      } else {
        logger.debug('Skipping intent clarification (final=true), proceeding directly with recommendations', { requestId });
      }

      // Ensure cluster connectivity before proceeding with recommendations
      await ensureClusterConnection(dotAI, logger, requestId, 'RecommendTool');

      // Initialize AI-powered ResourceRecommender with provider
      const recommender = new ResourceRecommender(dotAI.ai);

      // Create discovery function
      const explainResourceFn = async (resource: string) => {
        logger.debug(`Explaining resource: ${resource}`, { requestId });
        return await dotAI.discovery.explainResource(resource);
      };

      // Find best solutions for the user intent
      logger.debug('Generating recommendations with AI', { requestId });
      const solutions = await recommender.findBestSolutions(
        args.intent,
        explainResourceFn,
        args.interaction_id
      );

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
          intent: args.intent,
          type: solution.type,
          score: solution.score,
          description: solution.description,
          reasons: solution.reasons,
          analysis: solution.analysis,
          resources: solution.resources.map(r => ({
            kind: r.kind,
            apiVersion: r.apiVersion,
            group: r.group,
            description: r.description
          })),
          questions: solution.questions, // Includes relevantPolicies from question generation
          answers: {}, // Empty initially - will be filled by answerQuestion tool
          timestamp,
          appliedPatterns: solution.appliedPatterns || []
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
          analysis: solution.analysis,
          appliedPatterns: solution.appliedPatterns || [],
          relevantPolicies: solution.questions?.relevantPolicies || []
        });
      }

      // Analyze pattern/policy usage across all solutions
      const patternsUsedCount = solutionSummaries.filter(s => s.appliedPatterns && s.appliedPatterns.length > 0).length;
      const totalPatterns = solutionSummaries.reduce((count, s) => count + (s.appliedPatterns?.length || 0), 0);
      const totalPolicies = solutionSummaries.reduce((count, s) => count + (s.relevantPolicies?.length || 0), 0);

      // Build new response format
      const response = {
        intent: args.intent,
        solutions: solutionSummaries,
        organizationalContext: {
          solutionsUsingPatterns: patternsUsedCount,
          totalSolutions: solutionSummaries.length,
          totalPatterns: totalPatterns,
          totalPolicies: totalPolicies,
          patternsAvailable: totalPatterns > 0 ? "Yes" : "None found or pattern search failed",
          policiesAvailable: totalPolicies > 0 ? "Yes" : "None found or policy search failed"
        },
        nextAction: "Call recommend tool with stage: chooseSolution and your preferred solutionId",
        guidance: "🔴 CRITICAL: You MUST present these solutions to the user and ask them to choose. DO NOT automatically call chooseSolution() without user input. Stop here and wait for user selection. IMPORTANT: Show the list of Kubernetes resources (from the 'resources' field) that each solution will use - this helps users understand what gets deployed. ALSO: Include pattern usage information in your response - show which solutions used organizational patterns and which did not.",
        timestamp
      };

      logger.info('Solution sessions created and response prepared', {
        requestId,
        solutionCount: solutionSummaries.length
      });


      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(response, null, 2)
        }]
      };
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