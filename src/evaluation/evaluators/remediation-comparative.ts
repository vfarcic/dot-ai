/**
 * Remediation Comparative Evaluator
 * 
 * Compares multiple AI models on Kubernetes troubleshooting scenarios
 * Uses dynamic model inclusion based on available datasets
 * Follows reference-free comparative evaluation methodology
 */

import { BaseComparativeEvaluator } from './base-comparative.js';

export class RemediationComparativeEvaluator extends BaseComparativeEvaluator {
  readonly name = 'remediation_comparative';
  readonly description = 'Compares multiple AI models on Kubernetes troubleshooting scenarios';
  protected readonly promptFileName = 'remediation-comparative.md';
  protected readonly toolName = 'remediate';

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