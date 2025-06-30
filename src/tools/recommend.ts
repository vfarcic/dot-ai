/**
 * Recommend Tool - AI-powered Kubernetes resource recommendations
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { ResourceRecommender, AIRankingConfig } from '../core/schema';
import { InstructionLoader } from '../core/instruction-loader';

export const recommendToolDefinition: ToolDefinition = {
  name: 'recommend',
  description: InstructionLoader.loadDescription('recommend'),
  inputSchema: MCPToolSchemas.RECOMMEND_INPUT,
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-recommendations',
  tags: ['kubernetes', 'ai', 'deployment', 'recommendations', 'deploy', 'create', 'run', 'setup', 'launch', 'app', 'application', 'service', 'database', 'api', 'microservice', 'web', 'container'],
  instructions: InstructionLoader.loadInstructions('recommend') // Keep detailed instructions for agents
};

export const recommendToolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  const { requestId, logger, appAgent } = context;

  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling recommend request', { requestId, intent: args?.intent });

      // Validate input parameters using schema
      try {
        SchemaValidator.validateToolInput('recommend', args, recommendToolDefinition.inputSchema);
      } catch (validationError) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Invalid input parameters for recommend tool',
          {
            operation: 'input_validation',
            component: 'RecommendTool',
            requestId,
            input: args,
            suggestedActions: [
              'Provide a valid intent string',
              'Check the intent parameter is not empty',
              'Review the recommend tool documentation'
            ]
          },
          validationError as Error
        );
      }

      // Check for Claude API key
      const claudeApiKey = appAgent.getAnthropicApiKey();
      if (!claudeApiKey) {
        throw ErrorHandler.createError(
          ErrorCategory.AI_SERVICE,
          ErrorSeverity.HIGH,
          'ANTHROPIC_API_KEY environment variable must be set for AI-powered resource recommendations',
          {
            operation: 'api_key_check',
            component: 'RecommendTool',
            requestId,
            suggestedActions: [
              'Set ANTHROPIC_API_KEY environment variable',
              'Verify the API key is valid and active',
              'Check that the API key has sufficient credits'
            ]
          }
        );
      }

      logger.info('Starting resource recommendation process', {
        requestId,
        intent: args.intent,
        hasApiKey: !!claudeApiKey
      });

      // Initialize AI-powered ResourceRecommender
      const rankingConfig: AIRankingConfig = { claudeApiKey };
      const recommender = new ResourceRecommender(rankingConfig);

      // Create discovery functions
      const discoverResourcesFn = async () => {
        logger.debug('Discovering cluster resources', { requestId });
        return await appAgent.discovery.discoverResources();
      };

      const explainResourceFn = async (resource: string) => {
        logger.debug(`Explaining resource: ${resource}`, { requestId });
        return await appAgent.discovery.explainResource(resource);
      };

      // Find best solutions for the user intent
      logger.debug('Generating recommendations with AI', { requestId });
      const solutions = await recommender.findBestSolutions(
        args.intent,
        discoverResourcesFn,
        explainResourceFn
      );

      logger.info('Recommendation process completed', {
        requestId,
        solutionCount: solutions.length,
        topScore: solutions[0]?.score
      });

      // Format response for MCP
      const response = {
        intent: args.intent,
        solutions: solutions.map(solution => ({
          type: solution.type,
          score: solution.score,
          description: solution.description,
          reasons: solution.reasons,
          questions: solution.questions
        }))
      };

      // Validate output
      SchemaValidator.validateToolOutput('recommend', { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] }, MCPToolSchemas.MCP_RESPONSE_OUTPUT);

      return {
        content: [{
          type: 'text',
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
};