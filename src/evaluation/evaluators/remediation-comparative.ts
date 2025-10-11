/**
 * Remediation Comparative Evaluator
 * 
 * Compares multiple AI models on Kubernetes troubleshooting scenarios
 * Uses dynamic model inclusion based on available datasets
 * Follows reference-free comparative evaluation methodology
 */

import { StandardEvaluator, EvaluationScore, EvaluationSample } from './base.js';
import { VercelProvider } from '../../core/providers/vercel-provider';
import { getCurrentModel } from '../../core/model-config';
import { extractJsonFromAIResponse } from '../../core/platform-utils';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DatasetAnalyzer, ComparisonScenario } from '../dataset-analyzer.js';

interface ComparativeEvaluationResult {
  scenario_summary: string;
  models_compared: string[];
  comparative_analysis: Record<string, {
    quality_score: number;
    efficiency_score: number;
    performance_score: number;
    communication_score: number;
    weighted_total: number;
    strengths: string;
    weaknesses: string;
  }>;
  ranking: Array<{
    rank: number;
    model: string;
    score: number;
    rationale: string;
  }>;
  overall_insights: string;
}

interface ComparativeEvaluationScore extends EvaluationScore {
  modelRankings: Array<{
    rank: number;
    model: string;
    score: number;
  }>;
  bestModel: string;
  modelCount: number;
}

export class RemediationComparativeEvaluator extends StandardEvaluator {
  readonly name = 'remediation_comparative';
  readonly description = 'Compares multiple AI models on Kubernetes troubleshooting scenarios';

  private evaluatorModel: VercelProvider;
  private datasetAnalyzer: DatasetAnalyzer;
  private promptTemplate: string;

  constructor(datasetDir?: string) {
    super();
    
    // Use Claude via VercelProvider as the evaluator (most reliable for complex comparative evaluation)
    this.evaluatorModel = new VercelProvider({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: getCurrentModel('anthropic'),
      debugMode: process.env.DEBUG_DOT_AI === 'true'
    });

    this.datasetAnalyzer = new DatasetAnalyzer(datasetDir);

    // Load comparative evaluation prompt template
    const promptPath = join(process.cwd(), 'src', 'evaluation', 'prompts', 'remediation-comparative.md');
    this.promptTemplate = readFileSync(promptPath, 'utf8');
  }

  /**
   * Evaluate all available models for remediation scenarios
   * This method finds all scenarios with multiple model responses and evaluates them comparatively
   */
  async evaluateAllScenarios(): Promise<ComparativeEvaluationScore[]> {
    const scenarios = this.datasetAnalyzer.groupByScenario('remediate');
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
   * Evaluate a single scenario comparing all available models
   */
  async evaluateScenario(scenario: ComparisonScenario): Promise<ComparativeEvaluationScore> {
    // Build model responses section for the prompt
    const modelResponsesText = scenario.models.map((modelResponse, index) => {
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

**Response:**
${modelResponse.response}

---`;
    }).join('\n\n');

    const modelList = scenario.models.map(m => m.model).join('", "');

    // Generate the comparative evaluation prompt
    const evaluationPrompt = this.promptTemplate
      .replace('{issue}', scenario.issue)
      .replace('{model_responses}', modelResponsesText)
      .replace('{model_list}', modelList);

    try {
      const response = await this.evaluatorModel.sendMessage(
        evaluationPrompt, 
        `remediation-comparative-${scenario.interaction_id}`
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
   * Legacy evaluate method for compatibility with StandardEvaluator interface
   * This is not used in the comparative evaluation workflow
   */
  async evaluate(_sample: EvaluationSample): Promise<EvaluationScore> {
    throw new Error('Use evaluateAllScenarios() or evaluateScenario() for comparative evaluation');
  }

  /**
   * Get statistics about available datasets
   */
  getDatasetStats() {
    return this.datasetAnalyzer.getDatasetStats('remediate');
  }

  /**
   * Get detailed breakdown of evaluation phases available
   */
  getEvaluationPhases(): {
    phase: string;
    description: string;
    availableModels: string[];
    scenarioCount: number;
  }[] {
    const scenarios = this.datasetAnalyzer.groupByScenario('remediate');
    const phaseGroups = new Map<string, {
      models: Set<string>;
      count: number;
    }>();

    // Group scenarios by phase type
    for (const scenario of scenarios) {
      const phase = scenario.interaction_id;
      
      if (!phaseGroups.has(phase)) {
        phaseGroups.set(phase, {
          models: new Set(),
          count: 0
        });
      }

      const group = phaseGroups.get(phase)!;
      scenario.models.forEach(model => group.models.add(model.model));
      group.count++;
    }

    // Convert to structured output with descriptions
    const phaseDescriptions: Record<string, string> = {
      'manual_analyze': 'Manual Investigation Phase - How well each model investigates and diagnoses issues',
      'manual_execute': 'Manual Execution Phase - How well each model validates and confirms fixes worked',
      'automatic_analyze_execute': 'Automatic Full Workflow - End-to-end troubleshooting in single automated workflow'
    };

    return Array.from(phaseGroups.entries()).map(([phase, data]) => ({
      phase,
      description: phaseDescriptions[phase] || `${phase} phase evaluation`,
      availableModels: Array.from(data.models).sort(),
      scenarioCount: data.count
    }));
  }
}