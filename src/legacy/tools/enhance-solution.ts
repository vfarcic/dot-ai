/**
 * LEGACY: Enhance Solution Tool - Reference Implementation
 * 
 * This file contains the original enhance_solution tool that was replaced by
 * the stateful session-based architecture. It is preserved here for reference
 * during development of the new conversational tools.
 * 
 * MOVED FROM: src/tools/enhance-solution.ts
 * REPLACED BY: Stateful session tools (chooseSolution, answerQuestion)
 * 
 * KEY PATTERNS TO REFERENCE:
 * - Input validation logic (lines 29-50)
 * - Claude API key checking (lines 52-70)
 * - Solution data parsing and validation (lines 72-97)
 * - Open response extraction and validation (lines 99-118)
 * - Error handling with detailed context (throughout)
 * - Integration with SolutionEnhancer class (lines 126-146)
 * 
 * DO NOT REGISTER OR USE THIS TOOL IN ACTIVE MCP/CLI
 */

import { ToolDefinition, ToolHandler, ToolContext } from '../../core/tool-registry';
import { MCPToolSchemas, SchemaValidator } from '../../core/validation';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../../core/error-handling';
import { SolutionEnhancer } from '../core/solution-enhancer';
import { AIRankingConfig } from '../../core/schema';
import { InstructionLoader } from '../../core/instruction-loader';

export const enhanceSolutionToolDefinition: ToolDefinition = {
  name: 'enhance_solution',
  description: InstructionLoader.loadDescription('enhance_solution'),
  inputSchema: MCPToolSchemas.ENHANCE_SOLUTION_INPUT,
  outputSchema: MCPToolSchemas.MCP_RESPONSE_OUTPUT,
  version: '1.0.0',
  category: 'ai-enhancement',
  tags: ['kubernetes', 'ai', 'enhancement', 'customization', 'optimize', 'modify', 'improve', 'scale', 'customize', 'refine', 'upgrade', 'configure'],
  instructions: InstructionLoader.loadInstructions('enhance-solution') // Keep detailed instructions for agents
};

export const enhanceSolutionToolHandler: ToolHandler = async (args: any, context: ToolContext) => {
  const { requestId, logger, appAgent } = context;

  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling enhance solution request', { requestId, hasSolutionData: !!args?.solution_data });

      // Validate input parameters using schema
      try {
        SchemaValidator.validateToolInput('enhance_solution', args, enhanceSolutionToolDefinition.inputSchema);
      } catch (validationError) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Invalid input parameters for enhance_solution tool',
          {
            operation: 'input_validation',
            component: 'EnhanceSolutionTool',
            requestId,
            input: args,
            suggestedActions: [
              'Provide valid solution_data as JSON string',
              'Check the solution_data parameter is not empty',
              'Ensure solution_data contains valid JSON structure'
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
          'ANTHROPIC_API_KEY environment variable must be set for solution enhancement',
          {
            operation: 'api_key_check',
            component: 'EnhanceSolutionTool',
            requestId,
            suggestedActions: [
              'Set ANTHROPIC_API_KEY environment variable',
              'Verify the API key is valid and active',
              'Check that the API key has sufficient credits'
            ]
          }
        );
      }

      // Parse and validate solution data
      let solutionData: any;
      try {
        solutionData = JSON.parse(args.solution_data);
        
        // Validate solution data structure
        SchemaValidator.validate(solutionData, MCPToolSchemas.SOLUTION_DATA, 'solution_data');
      } catch (parseError) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'Invalid solution data format',
          {
            operation: 'solution_parsing',
            component: 'EnhanceSolutionTool',
            requestId,
            input: { solution_data: args.solution_data },
            suggestedActions: [
              'Ensure solution_data is valid JSON',
              'Check solution data has required structure',
              'Verify questions.open.answer field is present'
            ]
          },
          parseError as Error
        );
      }

      // Extract open response for enhancement
      const openResponse = solutionData.questions?.open?.answer;
      if (!openResponse) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          'No open response found in solution data',
          {
            operation: 'open_response_extraction',
            component: 'EnhanceSolutionTool',
            requestId,
            input: solutionData,
            suggestedActions: [
              'Add an "answer" field to the "open" question in solution data',
              'Ensure the answer contains your enhancement requirements',
              'Check the solution data structure matches expected format'
            ]
          }
        );
      }

      logger.info('Starting solution enhancement process', {
        requestId,
        solutionType: solutionData.type,
        hasOpenResponse: !!openResponse
      });

      // Initialize SolutionEnhancer
      const rankingConfig: AIRankingConfig = { claudeApiKey };
      const enhancer = new SolutionEnhancer(rankingConfig);

      // Get available resources for context
      logger.debug('Discovering cluster resources for enhancement context', { requestId });
      const availableResources = await appAgent.discovery.discoverResources();

      const explainResourceFn = async (resource: string) => {
        logger.debug(`Explaining resource for enhancement: ${resource}`, { requestId });
        return await appAgent.discovery.explainResource(resource);
      };

      // Enhance the solution with AI
      logger.debug('Enhancing solution with AI', { requestId });
      const enhancedSolution = await enhancer.enhanceSolution(
        solutionData,
        openResponse,
        availableResources,
        explainResourceFn
      );

      logger.info('Solution enhancement completed', {
        requestId,
        originalType: solutionData.type,
        enhancedType: enhancedSolution.type
      });

      // Validate output
      const responseContent = [{
        type: 'text',
        text: JSON.stringify(enhancedSolution, null, 2)
      }];

      SchemaValidator.validateToolOutput('enhance_solution', { content: responseContent }, MCPToolSchemas.MCP_RESPONSE_OUTPUT);

      return {
        content: responseContent
      };
    },
    {
      operation: 'enhance_solution_tool',
      component: 'EnhanceSolutionTool',
      requestId,
      input: args
    },
    {
      convertToMcp: true,
      retryCount: 1
    }
  );
};