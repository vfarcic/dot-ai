/**
 * LEGACY: SolutionEnhancer - Reference Implementation
 * 
 * This file contains the original SolutionEnhancer class that was replaced by
 * the stateful session-based architecture. It is preserved here for reference
 * during development of the new conversational tools.
 * 
 * MOVED FROM: src/core/schema.ts (lines 796-1010)
 * REPLACED BY: Stateful session tools (chooseSolution, answerQuestion)
 * 
 * KEY PATTERNS TO REFERENCE:
 * - Solution validation logic (lines 989-1008)
 * - Question answer processing patterns  
 * - Error handling approaches (lines 994-996)
 * - Resource mapping validation techniques
 * - JSON schema validation methods
 * 
 * DO NOT IMPORT OR USE THIS CLASS IN ACTIVE CODE
 */

import { ClaudeIntegration } from '../../core/claude';
import { ResourceSolution, AIRankingConfig, SchemaParser } from '../../core/schema';

/**
 * SolutionEnhancer processes open-ended user responses to complete missing question answers
 * and generate new questions for additional resource capabilities
 */
export class SolutionEnhancer {
  private claudeIntegration: ClaudeIntegration;
  private config: AIRankingConfig;

  constructor(config: AIRankingConfig) {
    this.config = config;
    this.claudeIntegration = new ClaudeIntegration(config.claudeApiKey);
  }

  /**
   * Enhance a solution by analyzing open user response and completing/adding questions
   */
  async enhanceSolution(
    currentSolution: ResourceSolution,
    openResponse: string,
    availableResources: any,
    explainResource: (resource: string) => Promise<any>
  ): Promise<ResourceSolution> {
    if (!this.claudeIntegration.isInitialized()) {
      throw new Error('Claude integration not initialized. API key required for AI-powered solution enhancement.');
    }

    try {
      // Phase 1: Analyze what resources are needed
      const analysisResult = await this.analyzeResourceNeeds(currentSolution, openResponse, availableResources);
      
      if (analysisResult.approach === 'capability_gap') {
        throw new Error(`Enhancement capability gap: ${analysisResult.reasoning}. ${analysisResult.suggestedAction}`);
      }

      // Phase 2: Fetch detailed schemas and enhance
      const detailedSchemas = await this.fetchRequiredSchemas(currentSolution, analysisResult, explainResource);
      
      // Load enhancement prompt template with detailed schemas
      const prompt = await this.loadEnhancementPrompt(currentSolution, openResponse, detailedSchemas, analysisResult);
      
      // Get AI analysis of what needs to be enhanced
      const response = await this.claudeIntegration.sendMessage(prompt);
      const enhancementData = this.parseEnhancementResponse(response.content);

      // Apply the enhancements to the solution
      return this.applyEnhancements(currentSolution, enhancementData);
    } catch (error) {
      throw new Error(`Solution enhancement failed: ${error}`);
    }
  }

  /**
   * Phase 1: Analyze what resources are needed for the user request
   */
  private async analyzeResourceNeeds(
    currentSolution: ResourceSolution,
    openResponse: string,
    availableResources: any
  ): Promise<any> {
    const fs = await import('fs');
    const path = await import('path');
    
    const promptPath = path.join(process.cwd(), 'prompts', 'resource-analysis.md');
    const template = fs.readFileSync(promptPath, 'utf8');
    
    // Extract just resource types for analysis
    const availableResourceTypes = [...availableResources.resources, ...availableResources.custom]
      .map((r: any) => r.kind);
    
    const analysisPrompt = template
      .replace('{current_solution}', JSON.stringify(currentSolution, null, 2))
      .replace('{user_request}', openResponse)
      .replace('{available_resource_types}', JSON.stringify(availableResourceTypes, null, 2));

    const response = await this.claudeIntegration.sendMessage(analysisPrompt);
    return this.parseEnhancementResponse(response.content);
  }

  /**
   * Phase 2: Fetch schemas only for the resources we need
   */
  private async fetchRequiredSchemas(
    currentSolution: ResourceSolution,
    analysisResult: any,
    explainResource: (resource: string) => Promise<any>
  ): Promise<any[]> {
    const parser = new SchemaParser();
    const detailedSchemas = [];

    // Always fetch schemas for current solution resources
    for (const resource of currentSolution.resources) {
      try {
        const explanation = await explainResource(resource.kind);
        const schema = parser.parseResourceExplanation(explanation);
        detailedSchemas.push({
          kind: resource.kind,
          apiVersion: resource.apiVersion,
          group: resource.group,
          schema: schema,
          explanation: explanation
        });
      } catch (error) {
        console.warn(`Failed to fetch detailed schema for ${resource.kind}: ${error}`);
      }
    }

    // If additional resources are suggested, fetch their schemas too
    if (analysisResult.approach === 'add_resources' && analysisResult.suggestedResources) {
      for (const resourceKind of analysisResult.suggestedResources) {
        try {
          const explanation = await explainResource(resourceKind);
          const schema = parser.parseResourceExplanation(explanation);
          detailedSchemas.push({
            kind: resourceKind,
            apiVersion: schema.apiVersion,
            group: schema.group,
            schema: schema,
            explanation: explanation
          });
        } catch (error) {
          console.warn(`Failed to fetch detailed schema for suggested resource ${resourceKind}: ${error}`);
        }
      }
    }

    return detailedSchemas;
  }

  /**
   * Load and format the enhancement prompt template
   */
  private async loadEnhancementPrompt(
    currentSolution: ResourceSolution,
    openResponse: string,
    detailedSchemas: any[],
    analysisResult: any
  ): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    
    const promptPath = path.join(process.cwd(), 'prompts', 'solution-enhancement.md');
    const template = fs.readFileSync(promptPath, 'utf8');
    
    return template
      .replace('{current_solution}', JSON.stringify(currentSolution, null, 2))
      .replace('{open_response}', openResponse)
      .replace('{detailed_schemas}', JSON.stringify(detailedSchemas, null, 2))
      .replace('{analysis_result}', JSON.stringify(analysisResult, null, 2));
  }

  /**
   * Parse AI response for enhancement data
   */
  private parseEnhancementResponse(aiResponse: string): any {
    try {
      // Extract JSON from AI response (may be wrapped in markdown)
      let jsonContent = aiResponse;
      
      // Try to find JSON wrapped in code blocks
      const codeBlockMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1];
      } else {
        // Try to find JSON that starts with { and find the matching closing }
        const startIndex = aiResponse.indexOf('{');
        if (startIndex !== -1) {
          let braceCount = 0;
          let endIndex = startIndex;
          
          for (let i = startIndex; i < aiResponse.length; i++) {
            if (aiResponse[i] === '{') braceCount++;
            if (aiResponse[i] === '}') braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
          
          if (braceCount === 0) {
            jsonContent = aiResponse.substring(startIndex, endIndex + 1);
          }
        }
      }
      
      return JSON.parse(jsonContent.trim());
    } catch (error) {
      throw new Error(`Failed to parse AI enhancement response: ${(error as Error).message}. AI response: "${aiResponse.substring(0, 200)}..."`);
    }
  }

  /**
   * Apply enhancement data to the current solution (simplified for single-pass architecture)
   * 
   * REFERENCE PATTERN: This method shows the validation and error handling patterns
   * that should be referenced when implementing the new stateful tools.
   */
  private applyEnhancements(currentSolution: ResourceSolution, enhancementData: any): ResourceSolution {
    // Create a deep copy of the solution to avoid mutations
    const enhancedSolution: ResourceSolution = JSON.parse(JSON.stringify(currentSolution));
    
    // Handle error cases
    if (enhancementData.error) {
      throw new Error(`Enhancement capability gap: ${enhancementData.message}`);
    }

    // In single-pass architecture, the AI returns a complete enhanced solution
    if (enhancementData.enhancedSolution) {
      // Replace with the complete AI-enhanced solution 
      return enhancementData.enhancedSolution as ResourceSolution;
    }

    // SINGLE-PASS: Keep the open question answer as provided - no state clearing
    // The user provided a complete answer and we've processed it into an enhanced solution

    return enhancedSolution;
  }

}