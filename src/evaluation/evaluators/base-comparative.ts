/**
 * Base Comparative Evaluator
 * 
 * Shared functionality for comparing multiple AI models across scenarios
 * Eliminates code duplication between remediation, recommendation, and capability evaluators
 */

import { EvaluationScore } from './base.js';
import { VercelProvider } from '../../core/providers/vercel-provider';
import { getCurrentModel } from '../../core/model-config';
import { extractJsonFromAIResponse } from '../../core/platform-utils';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DatasetAnalyzer, ComparisonScenario } from '../dataset-analyzer.js';
import { loadEvaluationMetadata, buildModelPricingContext, buildToolContext, type EvaluationMetadata } from '../metadata-loader.js';

export interface ComparativeEvaluationResult {
  scenario_summary: string;
  models_compared: string[];
  comparative_analysis: Record<string, {
    quality_score?: number;
    efficiency_score?: number;
    performance_score?: number;
    communication_score?: number;
    accuracy_score?: number;
    completeness_score?: number;
    clarity_score?: number;
    consistency_score?: number;
    weighted_total: number;
    strengths: string;
    weaknesses: string;
  }>;
  ranking: Array<{
    rank: number;
    model: string;
    score: number;
    rationale?: string;
    reasoning?: string;
  }>;
  overall_insights?: string;
}

export interface ComparativeEvaluationScore extends EvaluationScore {
  modelRankings: Array<{
    rank: number;
    model: string;
    score: number;
  }>;
  bestModel: string;
  modelCount: number;
}

export abstract class BaseComparativeEvaluator {
  abstract readonly name: string;
  abstract readonly description: string;
  protected abstract readonly promptFileName: string;
  protected abstract readonly toolName: string;

  protected evaluatorModel: VercelProvider;
  protected datasetAnalyzer: DatasetAnalyzer;
  protected promptTemplate: string;
  protected metadata: EvaluationMetadata;

  constructor(datasetDir?: string) {
    // Use Claude via VercelProvider as the evaluator (most reliable for complex comparative evaluation)
    this.evaluatorModel = new VercelProvider({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: getCurrentModel('anthropic'),
      debugMode: process.env.DEBUG_DOT_AI === 'true'
    });

    this.datasetAnalyzer = new DatasetAnalyzer(datasetDir || './eval/datasets');

    // Prompt template will be loaded by subclass
    this.promptTemplate = '';

    // Load metadata
    this.metadata = loadEvaluationMetadata();
  }

  /**
   * Initialize the evaluator - must be called by subclass constructor
   */
  protected initializePrompt() {
    const promptPath = join(process.cwd(), 'src', 'evaluation', 'prompts', this.promptFileName);
    this.promptTemplate = readFileSync(promptPath, 'utf8');
  }

  /**
   * Evaluate all available models for scenarios
   * This method finds all scenarios with multiple model responses and evaluates them comparatively
   */
  async evaluateAllScenarios(): Promise<ComparativeEvaluationScore[]> {
    const scenarios = this.datasetAnalyzer.groupByScenario(this.toolName);
    const results: ComparativeEvaluationScore[] = [];

    console.log(`Found ${scenarios.length} scenarios with multiple models for comparative evaluation`);

    for (const scenario of scenarios) {
      try {
        const result = await this.evaluateScenario(scenario);
        results.push(result);
      } catch (error) {
        console.error(`Failed to evaluate scenario ${scenario.interaction_id}:`, error);
      }
    }

    return results;
  }

  /**
   * Conduct final assessment across all scenarios to determine overall winner
   */
  async conductFinalAssessment(scenarioResults: ComparativeEvaluationScore[]): Promise<any> {
    if (scenarioResults.length === 0) {
      throw new Error('No scenario results provided for final assessment');
    }

    // Load the overall winner assessment prompt
    const promptPath = join(process.cwd(), 'src', 'evaluation', 'prompts', 'overall-winner-assessment.md');
    const overallWinnerTemplate = readFileSync(promptPath, 'utf8');

    // Get all models that should have been tested (from first scenario)
    const allModels = scenarioResults[0]?.modelRankings?.map(r => r.model) || [];
    
    // Build the final assessment prompt with raw data
    const finalPrompt = overallWinnerTemplate
      .replace('{tool_type}', this.toolName)
      .replace('{total_scenarios}', scenarioResults.length.toString())
      .replace('{expected_models}', JSON.stringify(allModels))
      .replace('{scenario_results}', JSON.stringify(scenarioResults, null, 2));

    try {
      console.log(`\n🔍 Conducting final assessment across ${scenarioResults.length} scenarios for ${this.toolName}\n`);
      
      const response = await this.evaluatorModel.sendMessage(
        finalPrompt,
        `${this.name}-final-assessment`,
        {
          user_intent: `Final cross-scenario assessment for ${this.toolName}`,
          interaction_id: 'final-assessment'
        }
      );

      // Extract JSON from AI response
      const finalAssessment = extractJsonFromAIResponse(response.content);
      
      console.log(`✅ Final Assessment Complete for ${this.toolName}`);
      console.log(`🏆 Overall Winner: ${finalAssessment.overall_assessment?.winner || 'Unknown'}`);
      
      return finalAssessment;

    } catch (error) {
      console.error(`Final assessment failed for ${this.toolName}:`, error);
      throw error;
    }
  }

  /**
   * Evaluate a single scenario comparing all available models
   */
  async evaluateScenario(scenario: ComparisonScenario): Promise<ComparativeEvaluationScore> {
    // Build model responses section for the prompt
    const modelResponsesText = scenario.models.map((modelResponse, index) => {
      // Build failure analysis context
      let reliabilityContext = '✅ Completed successfully';
      if (modelResponse.metadata.failure_analysis) {
        const failure = modelResponse.metadata.failure_analysis;
        reliabilityContext = `⚠️  **${failure.failure_type.toUpperCase()} FAILURE**: ${failure.failure_reason}`;
        if (failure.failure_type === 'timeout') {
          reliabilityContext += `\n- **Time to failure**: ${Math.round(failure.time_to_failure / 1000)}s (${Math.round(failure.time_to_failure / 60000)}min)`;
          reliabilityContext += `\n- **Impact**: Model could not complete full workflow within time limit`;
        }
      }

      return `### Model ${index + 1}: ${modelResponse.model}

**Performance Metrics:**
- Duration: ${modelResponse.performance.duration_ms}ms
- Input Tokens: ${modelResponse.performance.input_tokens}
- Output Tokens: ${modelResponse.performance.output_tokens}
- Total Tokens: ${modelResponse.performance.total_tokens}
- Iterations: ${modelResponse.performance.iterations || 'N/A'}
- Tool Calls: ${modelResponse.performance.tool_calls_executed || 'N/A'}
- Cache Read: ${modelResponse.performance.cache_read_tokens || 0} tokens
- Cache Creation: ${modelResponse.performance.cache_creation_tokens || 0} tokens

**Reliability Status:**
${reliabilityContext}

**Response:**

${modelResponse.response}

---`;
    }).join('\n\n');

    const modelList = scenario.models.map(m => m.model).join('", "');

    // Generate the comparative evaluation prompt
    const evaluationPrompt = this.buildEvaluationPrompt(scenario, modelResponsesText, modelList);

    try {
      const response = await this.evaluatorModel.sendMessage(
        evaluationPrompt, 
        `${this.name}-${scenario.interaction_id}`,
        {
          user_intent: `Comparative ${this.name} evaluation for ${scenario.interaction_id}`,
          interaction_id: scenario.interaction_id
        }
      );
      
      // Extract JSON from AI response with robust parsing
      const evaluation: ComparativeEvaluationResult = extractJsonFromAIResponse(response.content);

      // Convert to standard EvaluationScore format
      const rankings = evaluation.ranking || [];
      const bestModel = rankings.length > 0 ? rankings[0].model : scenario.models[0].model;
      const bestScore = rankings.length > 0 ? rankings[0].score : 0;

      return {
        key: `${this.name}_${scenario.interaction_id}`,
        score: bestScore,
        comment: evaluation.overall_insights || 'Comparative evaluation completed',
        confidence: 0.9, // High confidence for comparative evaluation
        modelRankings: rankings.map(r => ({
          rank: r.rank,
          model: r.model,
          score: r.score
        })),
        bestModel,
        modelCount: scenario.models.length
      };

    } catch (error) {
      console.error(`Comparative evaluation failed for ${scenario.interaction_id}:`, error);
      return {
        key: `${this.name}_${scenario.interaction_id}`,
        score: 0,
        comment: `Evaluation error: ${error}`,
        confidence: 0,
        modelRankings: [],
        bestModel: 'unknown',
        modelCount: scenario.models.length
      };
    }
  }

  /**
   * Build the evaluation prompt - can be overridden by subclasses for custom behavior
   */
  protected buildEvaluationPrompt(scenario: ComparisonScenario, modelResponsesText: string, modelList: string): string {
    // Build metadata context sections
    const pricingContext = buildModelPricingContext(this.metadata.models);
    const toolContext = buildToolContext(this.toolName, this.metadata.tools);

    // Inject all data into prompt template via placeholders
    return this.promptTemplate
      .replace('{pricing_context}', pricingContext)
      .replace('{tool_context}', toolContext)
      .replace('{issue}', scenario.issue)
      .replace('{model_responses}', modelResponsesText)
      .replace('{model_list}', modelList)
      .replace('{phase}', scenario.interaction_id)
      .replace('{scenario_name}', scenario.interaction_id);
  }

  /**
   * Get statistics about available datasets
   */
  getDatasetStats() {
    return this.datasetAnalyzer.getDatasetStats(this.toolName);
  }

  /**
   * Get detailed breakdown of evaluation phases available
   * Must be implemented by subclasses to provide domain-specific phase descriptions
   */
  abstract getEvaluationPhases(): {
    phase: string;
    description: string;
    availableModels: string[];
    scenarioCount: number;
  }[];
}