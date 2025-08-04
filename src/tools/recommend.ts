/**
 * Recommend Tool - AI-powered Kubernetes resource recommendations
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { ResourceRecommender, AIRankingConfig } from '../core/schema';
import { ClaudeIntegration } from '../core/claude';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { ensureClusterConnection } from '../core/cluster-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getAndValidateSessionDirectory } from '../core/session-utils';

// Tool metadata for direct MCP registration
export const RECOMMEND_TOOL_NAME = 'recommend';
export const RECOMMEND_TOOL_DESCRIPTION = 'Deploy, create, run, or setup applications on Kubernetes with AI-powered recommendations. Ask the user to describe their application first, then use their response here.';

// Zod schema for MCP registration
export const RECOMMEND_TOOL_INPUT_SCHEMA = {
  intent: z.string().min(1).max(1000).describe('What the user wants to deploy, create, run, or setup on Kubernetes (based on their description). Ask the user to describe their application first, then use their response here. Examples: "deploy a web application", "create a database cluster", "run my Node.js API", "setup a Redis cache", "launch a microservice", "build a CI/CD pipeline", "deploy a WordPress site", "create a monitoring stack", "run a Python Flask app", "setup MongoDB", "deploy a React frontend", "create a load balancer"')
};


/**
 * Validate intent meaningfulness using AI
 */
async function validateIntentWithAI(intent: string, claudeIntegration: any): Promise<void> {
  try {
    // Load prompt template
    const promptPath = path.join(__dirname, '..', '..', 'prompts', 'intent-validation.md');
    const template = fs.readFileSync(promptPath, 'utf8');
    
    // Replace template variables
    const validationPrompt = template.replace('{intent}', intent);
    
    // Send to Claude for validation
    const response = await claudeIntegration.sendMessage(validationPrompt);
    
    // Parse JSON response with robust error handling
    let jsonContent = response.content;
    
    // Try to find JSON object wrapped in code blocks
    const codeBlockMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    } else {
      // Try to find JSON object that starts with { and find the matching closing }
      const startIndex = response.content.indexOf('{');
      if (startIndex !== -1) {
        let braceCount = 0;
        let endIndex = startIndex;
        
        for (let i = startIndex; i < response.content.length; i++) {
          if (response.content[i] === '{') braceCount++;
          if (response.content[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
        
        if (braceCount === 0) {
          jsonContent = response.content.substring(startIndex, endIndex + 1);
        }
      }
    }
    
    const validation = JSON.parse(jsonContent.trim());
    
    // Validate response structure
    if (typeof validation.isSpecific !== 'boolean' || 
        typeof validation.reason !== 'string' ||
        !Array.isArray(validation.suggestions)) {
      throw new Error('AI response has invalid structure');
    }
    
    // If intent is not specific enough, throw error with suggestions
    if (!validation.isSpecific) {
      const suggestions = validation.suggestions.length 
        ? validation.suggestions.map((s: string) => `• ${s}`).join('\n')
        : '• Include specific technology (Node.js, PostgreSQL, React, etc.)\n• Describe the purpose or function\n• Add context about requirements';
      
      throw new Error(
        `Intent needs more specificity: ${validation.reason}\n\n` +
        `Suggestions to improve your intent:\n${suggestions}\n\n` +
        `Original intent: "${intent}"`
      );
    }
    
  } catch (error) {
    // If it's our validation error, re-throw it
    if (error instanceof Error && error.message.includes('Intent needs more specificity')) {
      throw error;
    }
    
    // For other errors (AI service issues, JSON parsing, etc.), 
    // continue without blocking the user - log the issue but don't fail
    console.warn('Intent validation failed, continuing with original intent:', error);
    return;
  }
}


/**
 * Generate unique solution ID with timestamp and random component
 */
function generateSolutionId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '').split('T');
  const dateTime = timestamp[0] + 'T' + timestamp[1].substring(0, 6);
  const randomHex = crypto.randomBytes(6).toString('hex');
  return `sol_${dateTime}_${randomHex}`;
}

/**
 * Write solution data to file atomically (temp file + rename)
 */
function writeSolutionFile(sessionDir: string, solutionId: string, solutionData: any): void {
  const fileName = `${solutionId}.json`;
  const filePath = path.join(sessionDir, fileName);
  const tempPath = filePath + '.tmp';
  
  try {
    // Write to temporary file first
    fs.writeFileSync(tempPath, JSON.stringify(solutionData, null, 2));
    
    // Atomically rename to final location
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    throw new Error(`Failed to write solution file ${fileName}: ${error}`);
  }
}

/**
 * Direct MCP tool handler for recommend functionality
 */
export async function handleRecommendTool(
  args: { intent: string },
  dotAI: DotAI,
  logger: Logger,
  requestId: string
): Promise<{ content: { type: 'text'; text: string }[] }> {
  return await ErrorHandler.withErrorHandling(
    async () => {
      logger.debug('Handling recommend request', { requestId, intent: args?.intent });

      // Input validation is handled automatically by MCP SDK with Zod schema
      // args are already validated and typed when we reach this point

      // Check for Claude API key
      const claudeApiKey = dotAI.getAnthropicApiKey();
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

      // Validate session directory configuration
      let sessionDir: string;
      try {
        sessionDir = getAndValidateSessionDirectory(args, true); // requireWrite=true
        logger.debug('Session directory validated', { requestId, sessionDir });
      } catch (error) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Session directory validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            operation: 'session_directory_validation',
            component: 'RecommendTool',
            requestId,
            suggestedActions: [
              'Ensure session directory exists and is writable',
              'Set --session-dir parameter or DOT_AI_SESSION_DIR environment variable',
              'Check directory permissions'
            ]
          },
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // Ensure cluster connectivity before proceeding
      await ensureClusterConnection(dotAI, logger, requestId, 'RecommendTool');

      logger.info('Starting resource recommendation process', {
        requestId,
        intent: args.intent,
        hasApiKey: !!claudeApiKey
      });

      // Validate intent specificity with AI before expensive resource discovery
      logger.debug('Validating intent specificity', { requestId, intent: args.intent });
      try {
        const claudeIntegration = new ClaudeIntegration(claudeApiKey);
        await validateIntentWithAI(args.intent, claudeIntegration);
        logger.debug('Intent validation passed', { requestId });
      } catch (error) {
        if (error instanceof Error && error.message.includes('Intent needs more specificity')) {
          // This is a validation error that should be returned to the user
          throw ErrorHandler.createError(
            ErrorCategory.VALIDATION,
            ErrorSeverity.MEDIUM,
            error.message,
            {
              operation: 'intent_validation',
              component: 'RecommendTool',
              requestId,
              input: { intent: args.intent },
              suggestedActions: [
                'Provide more specific details about your deployment',
                'Include technology stack information',
                'Describe the purpose or function of what you want to deploy'
              ]
            },
            error
          );
        }
        // For other errors, log but continue (don't block user due to AI service issues)
        logger.warn('Intent validation failed, continuing with recommendation', { requestId, error: error instanceof Error ? error.message : 'Unknown error' });
      }

      // Initialize AI-powered ResourceRecommender
      const rankingConfig: AIRankingConfig = { claudeApiKey };
      const recommender = new ResourceRecommender(rankingConfig);

      // Create discovery functions
      const discoverResourcesFn = async () => {
        logger.debug('Discovering cluster resources', { requestId });
        return await dotAI.discovery.discoverResources();
      };

      const explainResourceFn = async (resource: string) => {
        logger.debug(`Explaining resource: ${resource}`, { requestId });
        return await dotAI.discovery.explainResource(resource);
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

      // Create solution files and build response
      const solutionSummaries = [];
      const timestamp = new Date().toISOString();

      // Limit to top 5 solutions (respecting quality thresholds from AI ranking)
      const topSolutions = solutions.slice(0, 5);

      for (const solution of topSolutions) {
        const solutionId = generateSolutionId();
        
        // Create complete solution file with all data
        const solutionFileData = {
          solutionId,
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
          questions: solution.questions,
          answers: {}, // Empty initially - will be filled by answerQuestion tool
          timestamp
        };

        // Write solution to file
        try {
          writeSolutionFile(sessionDir, solutionId, solutionFileData);
          logger.debug('Solution file created', { requestId, solutionId, fileName: `${solutionId}.json` });
        } catch (error) {
          throw ErrorHandler.createError(
            ErrorCategory.STORAGE,
            ErrorSeverity.HIGH,
            `Failed to store solution file: ${error instanceof Error ? error.message : 'Unknown error'}`,
            {
              operation: 'solution_file_creation',
              component: 'RecommendTool',
              requestId,
              input: { solutionId },
              suggestedActions: [
                'Check session directory write permissions',
                'Ensure sufficient disk space',
                'Verify session directory is accessible'
              ]
            },
            error instanceof Error ? error : new Error(String(error))
          );
        }

        // Add to response summary (decision-making data only)
        solutionSummaries.push({
          solutionId,
          type: solution.type,
          score: solution.score,
          description: solution.description,
          primaryResources: solution.resources.slice(0, 3).map(r => r.kind),
          reasons: solution.reasons,
          analysis: solution.analysis,
          usedPatterns: solution.usedPatterns || false,
          patternInfluences: solution.patternInfluences || []
        });
      }

      // Analyze pattern usage across all solutions
      const patternsUsedCount = solutionSummaries.filter(s => s.usedPatterns).length;
      const totalPatternInfluences = solutionSummaries.reduce((count, s) => count + (s.patternInfluences?.length || 0), 0);

      // Build new response format
      const response = {
        intent: args.intent,
        solutions: solutionSummaries,
        patternSummary: {
          solutionsUsingPatterns: patternsUsedCount,
          totalSolutions: solutionSummaries.length,
          totalPatternInfluences: totalPatternInfluences,
          patternsAvailable: totalPatternInfluences > 0 ? "Yes" : "None found or pattern search failed"
        },
        nextAction: "Call chooseSolution with your preferred solutionId",
        guidance: "🔴 CRITICAL: You MUST present these solutions to the user and ask them to choose. DO NOT automatically call chooseSolution() without user input. Stop here and wait for user selection. ALSO: Include pattern usage information in your response - show which solutions used organizational patterns and which did not.",
        timestamp
      };

      logger.info('Solution files created and response prepared', {
        requestId,
        solutionCount: solutionSummaries.length,
        sessionDir
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