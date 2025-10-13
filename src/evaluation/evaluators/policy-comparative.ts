/**
 * Policy Comparative Evaluator
 * 
 * Compares multiple AI models on Kubernetes organizational policy intent management scenarios
 * Groups by interaction_id (e.g., policy_create_workflow) and evaluates
 * quality of policy creation, validation, and enforcement recommendations across different models
 */

import { BaseComparativeEvaluator, ComparativeEvaluationScore } from './base-comparative.js';
import { ComparisonScenario } from '../dataset-analyzer.js';

export class PolicyComparativeEvaluator extends BaseComparativeEvaluator {
  readonly name = 'policy-comparative';
  readonly description = 'Compares AI models on Kubernetes organizational policy intent management quality';
  protected readonly promptFileName = 'policy-comparative.md';
  protected readonly toolName = 'policy';

  constructor(datasetDir?: string) {
    super(datasetDir);
    this.initializePrompt();
  }

  async evaluateAllScenarios(): Promise<ComparativeEvaluationScore[]> {
    try {
      const scenarios = this.datasetAnalyzer.groupByScenario(this.toolName);
      const results: ComparativeEvaluationScore[] = [];

      console.log(`Found ${scenarios.length} policy scenarios with multiple models for comparative evaluation`);

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
      console.error(`Policy comparative evaluation failed:`, error);
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
   * Build the evaluation prompt - uses base class reliability context with policy-specific template
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
      'policy_create_workflow': 'Policy Creation Workflow - How well each model guides users through creating organizational policies',
      'policy_validation': 'Policy Validation Phase - How well each model validates policy intent correctness and enforceability',
      'policy_enforcement_recommendations': 'Policy Enforcement Recommendations - How well each model provides enforcement strategies',
      'policy_compliance_analysis': 'Policy Compliance Analysis - How well each model analyzes compliance with existing policies'
    };

    return Array.from(phaseGroups.entries()).map(([phase, data]) => ({
      phase,
      description: phaseDescriptions[phase] || `${phase} phase evaluation`,
      availableModels: Array.from(data.models).sort(),
      scenarioCount: data.count
    }));
  }
}