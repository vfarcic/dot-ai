/**
 * Capability Comparative Evaluator
 * 
 * Compares multiple AI models on Kubernetes capability inference scenarios
 * Groups by interaction_id (e.g., auto_scan, crud_auto_scan) and evaluates
 * quality of capability analyses across different models
 */

import { BaseComparativeEvaluator, ComparativeEvaluationScore } from './base-comparative.js';
import { ComparisonScenario } from '../dataset-analyzer.js';

export class CapabilityComparativeEvaluator extends BaseComparativeEvaluator {
  readonly name = 'capability-comparative';
  readonly description = 'Compares AI models on Kubernetes capability inference quality';
  protected readonly promptFileName = 'capability-comparative.md';
  protected readonly toolName = 'capability';

  constructor(datasetDir?: string) {
    super(datasetDir);
    this.initializePrompt();
  }

  async evaluateAllScenarios(): Promise<ComparativeEvaluationScore[]> {
    try {
      const scenarios = this.datasetAnalyzer.groupByScenario(this.toolName);
      const results: ComparativeEvaluationScore[] = [];

      console.log(`Found ${scenarios.length} capability scenarios with multiple models for comparative evaluation`);

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
      console.error(`Capability comparative evaluation failed:`, error);
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
   * Build the evaluation prompt - uses base class reliability context with capability-specific template
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

  private extractResourceName(input: any): string {
    if (input?.issue) {
      const match = input.issue.match(/resource: (.+)/);
      return match ? match[1] : 'unknown';
    }
    return 'unknown';
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
      'auto_scan': 'Auto Scan Phase - How well each model analyzes cluster resource capabilities automatically',
      'crud_auto_scan': 'CRUD Auto Scan Phase - How well each model handles capability analysis with CRUD operations',
      'list_auto_scan': 'List Auto Scan Phase - How well each model handles capability listing and organization',
      'search_auto_scan': 'Search Auto Scan Phase - How well each model handles capability search and filtering'
    };

    return Array.from(phaseGroups.entries()).map(([phase, data]) => ({
      phase,
      description: phaseDescriptions[phase] || `${phase} phase evaluation`,
      availableModels: Array.from(data.models).sort(),
      scenarioCount: data.count
    }));
  }
}