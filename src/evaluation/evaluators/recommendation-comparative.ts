/**
 * Recommendation Comparative Evaluator
 * 
 * Compares multiple AI models on Kubernetes recommendation scenarios
 * Uses dynamic model inclusion based on available datasets
 * Follows reference-free comparative evaluation methodology
 */

import { BaseComparativeEvaluator } from './base-comparative.js';

export class RecommendationComparativeEvaluator extends BaseComparativeEvaluator {
  readonly name = 'recommendation_comparative';
  readonly description = 'Compares multiple AI models on Kubernetes deployment recommendation scenarios';
  protected readonly promptFileName = 'recommendation-comparative.md';
  protected readonly toolName = 'recommend';

  constructor(datasetDir?: string) {
    super(datasetDir);
    this.initializePrompt();
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
      'clarification_phase': 'Intent Analysis Phase - How well each model analyzes user intents and identifies missing context',
      'question_generation': 'Question Generation Phase - How well each model generates clarifying questions to enhance requirements',
      'solution_assembly': 'Solution Assembly Phase - How well each model selects appropriate Kubernetes resources and deployment patterns',
      'generate_manifests_phase': 'Manifest Generation Phase - How well each model generates production-ready Kubernetes manifests'
    };

    return Array.from(phaseGroups.entries()).map(([phase, data]) => ({
      phase,
      description: phaseDescriptions[phase] || `${phase} phase evaluation`,
      availableModels: Array.from(data.models).sort(),
      scenarioCount: data.count
    }));
  }
}