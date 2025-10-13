/**
 * Pattern Comparative Evaluator
 * 
 * Compares multiple AI models on Kubernetes organizational pattern management scenarios
 * Groups by interaction_id (e.g., pattern_create_workflow) and evaluates
 * quality of pattern creation, identification, and management across different models
 */

import { BaseComparativeEvaluator, ComparativeEvaluationScore } from './base-comparative.js';
import { ComparisonScenario } from '../dataset-analyzer.js';

export class PatternComparativeEvaluator extends BaseComparativeEvaluator {
  readonly name = 'pattern-comparative';
  readonly description = 'Compares AI models on Kubernetes organizational pattern management quality';
  protected readonly promptFileName = 'pattern-comparative.md';
  protected readonly toolName = 'pattern';

  constructor(datasetDir?: string) {
    super(datasetDir);
    this.initializePrompt();
  }

  async evaluateAllScenarios(): Promise<ComparativeEvaluationScore[]> {
    try {
      const scenarios = this.datasetAnalyzer.groupByScenario(this.toolName);
      const results: ComparativeEvaluationScore[] = [];

      console.log(`Found ${scenarios.length} pattern scenarios with multiple models for comparative evaluation`);

      for (const scenario of scenarios) {
        try {
          const result = await this.evaluateScenario(scenario);
          results.push(result);
        } catch (error) {
          console.error(`Failed to evaluate scenario ${scenario.interaction_id}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error(`Pattern comparative evaluation failed:`, error);
      return [{
        key: `${this.name}_error`,
        score: 0,
        comment: `Evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
        modelRankings: [],
        bestModel: 'unknown',
        modelCount: 0
      }];
    }
  }

  /**
   * Build the evaluation prompt - uses base class reliability context with pattern-specific template
   */
  protected buildEvaluationPrompt(scenario: ComparisonScenario, modelResponsesText: string, modelList: string): string {
    // Use the base class's properly formatted model responses which include:
    // - Reliability Status (✅ Completed successfully OR ⚠️ TIMEOUT FAILURE)
    // - Performance metrics
    // - All model responses
    
    return this.promptTemplate
      .replace('{scenario_name}', scenario.interaction_id)
      .replace('{model_responses}', modelResponsesText)
      .replace('{models}', modelList);
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
    const scenarios = this.datasetAnalyzer.groupByScenario(this.toolName);
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
      'pattern_create_workflow': 'Pattern Creation Workflow - How well each model guides users through creating organizational patterns',
      'trigger_expansion': 'Trigger Expansion Phase - How well each model expands infrastructure triggers for patterns',
      'pattern_validation': 'Pattern Validation Phase - How well each model validates organizational patterns',
      'pattern_matching': 'Pattern Matching Phase - How well each model matches user requirements to existing patterns'
    };

    return Array.from(phaseGroups.entries()).map(([phase, data]) => ({
      phase,
      description: phaseDescriptions[phase] || `${phase} phase evaluation`,
      availableModels: Array.from(data.models).sort(),
      scenarioCount: data.count
    }));
  }
}