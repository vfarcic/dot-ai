/**
 * Dataset Analyzer for Multi-Model Comparison
 * 
 * Analyzes evaluation datasets to group them by scenario and extract
 * model responses for comparative evaluation.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface DatasetSample {
  input: {
    issue: string;
    [key: string]: unknown;
  };
  output: string;
  performance: {
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    model_version: string;
    sdk: string;
    iterations?: number;
    tool_calls_executed?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  };
  metadata: {
    timestamp: string;
    complexity: string;
    tags: string[];
    source: string;
    tool: string;
    test_scenario: string;
    failure_analysis: string;
  };
}

export interface ModelResponse {
  model: string;
  response: string;
  performance: {
    duration_ms: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    iterations?: number;
    tool_calls_executed?: number;
    cache_read_tokens?: number;
    cache_creation_tokens?: number;
  };
  metadata: {
    timestamp: string;
    complexity: string;
    test_scenario: string;
    issue?: string;
    interaction_count?: number;
    failure_analysis?: {
      failure_type?: string;
      failure_reason?: string;
      time_to_failure?: number;
      interaction_number?: number;
      issue?: string;
      [key: string]: unknown;
    };
    all_failures?: Array<{
      failure_type?: string;
      failure_reason?: string;
      time_to_failure?: number;
      interaction_number?: number;
      issue?: string;
      [key: string]: unknown;
    }>;
  };
}

export interface ComparisonScenario {
  issue: string;
  interaction_id: string;
  tool: string;
  models: ModelResponse[];
}

export class DatasetAnalyzer {
  private datasetDir: string;

  constructor(datasetDir: string = './eval/datasets') {
    this.datasetDir = datasetDir;
  }

  /**
   * Find all available datasets for a specific tool
   */
  findDatasets(tool: string): string[] {
    const files = readdirSync(this.datasetDir);
    return files
      .filter(file => file.startsWith(`${tool}_`) && file.endsWith('.jsonl'))
      .map(file => join(this.datasetDir, file));
  }

  /**
   * Parse dataset filename to extract components
   * Format: {tool}_{interaction_id}_{sdk}_{model}_{timestamp}.jsonl
   */
  parseDatasetFilename(filename: string): {
    tool: string;
    interaction_id: string;
    sdk: string;
    model: string;
    timestamp: string;
  } | null {
    const basename = filename.replace(/^.*\//, '').replace(/\.jsonl$/, '');
    const parts = basename.split('_');
    
    if (parts.length < 5) return null;

    // For remediate datasets: remediate_{phase}_{action}_vercel_{model}_{timestamp}
    // e.g., remediate_manual_analyze_vercel_gpt_timestamp
    const tool = parts[0];
    const timestamp = parts[parts.length - 1];
    
    // Find 'vercel' SDK position to split correctly
    const sdkIndex = parts.indexOf('vercel');
    if (sdkIndex === -1) return null;
    
    // interaction_id is everything between tool and sdk
    const interaction_id = parts.slice(1, sdkIndex).join('_');
    const sdk = parts[sdkIndex];
    const model = parts.slice(sdkIndex + 1, -1).join('_');

    return { tool, interaction_id, sdk, model, timestamp };
  }

  /**
   * Load and parse a dataset file
   */
  loadDataset(filepath: string): DatasetSample | null {
    try {
      const content = readFileSync(filepath, 'utf8').trim();
      if (!content) return null;
      
      return JSON.parse(content) as DatasetSample;
    } catch (error) {
      console.warn(`Failed to load dataset ${filepath}:`, error);
      return null;
    }
  }

  /**
   * Group datasets by scenario for comparative evaluation
   * Returns scenarios that have data from multiple models
   * Groups by both tool and interaction_id to create separate evaluations for each phase
   */
  groupByScenario(tool: string): ComparisonScenario[] {
    const datasets = this.findDatasets(tool);
    const scenarioGroups = new Map<string, Map<string, ModelResponse[]>>();

    // Group datasets by filename pattern up to provider, then by model
    for (const filepath of datasets) {
      const sample = this.loadDataset(filepath);
      if (!sample) continue;

      // Extract scenario key from filename pattern (up to provider)
      const filename = filepath.replace(/^.*\//, ''); // Remove directory path
      const filenameParts = filename.split('_');
      const beforeProvider = [];
      for (const part of filenameParts) {
        if (part === 'vercel') break; // Stop at SDK name
        beforeProvider.push(part);
      }
      const scenarioKey = beforeProvider.join('_');
      
      // Group by model within each scenario
      const modelKey = `${sample.performance.sdk}_${sample.performance.model_version}`;
      
      if (!scenarioGroups.has(scenarioKey)) {
        scenarioGroups.set(scenarioKey, new Map());
      }
      
      const modelGroups = scenarioGroups.get(scenarioKey)!;
      if (!modelGroups.has(modelKey)) {
        modelGroups.set(modelKey, []);
      }

      // Parse failure_analysis if it exists
      let failure_analysis = undefined;
      if (sample.metadata.failure_analysis && sample.metadata.failure_analysis !== "") {
        try {
          if (typeof sample.metadata.failure_analysis === 'string') {
            failure_analysis = JSON.parse(sample.metadata.failure_analysis);
          } else {
            failure_analysis = sample.metadata.failure_analysis;
          }
        } catch {
          // If parsing fails, treat as no failure analysis
          failure_analysis = undefined;
        }
      }

      modelGroups.get(modelKey)!.push({
        model: modelKey,
        response: sample.output,
        performance: sample.performance,
        metadata: {
          timestamp: sample.metadata.timestamp,
          complexity: sample.metadata.complexity,
          test_scenario: sample.metadata.test_scenario,
          issue: sample.input.issue,
          failure_analysis
        }
      });
    }

    // Convert to comparison scenarios - include ALL scenarios (remove multi-model filter)
    const scenarios: ComparisonScenario[] = [];
    for (const [scenarioKey, modelGroups] of scenarioGroups) {
      // Flatten model groups: each model may have multiple interactions
      const allModelResponses: ModelResponse[] = [];
      for (const [modelKey, interactions] of modelGroups) {
        // Combine multiple interactions per model into a single response
        if (interactions.length === 1) {
          allModelResponses.push(interactions[0]);
        } else {
          // Multiple interactions per model - combine them
          const combinedResponse = this.combineModelInteractions(modelKey, interactions);
          allModelResponses.push(combinedResponse);
        }
      }
      
      // Get representative issue from first model's first interaction
      const firstModel = Array.from(modelGroups.values())[0]?.[0];
      const issue = firstModel?.metadata?.issue || scenarioKey;
      
      scenarios.push({
        issue,
        interaction_id: scenarioKey,
        tool,
        models: allModelResponses
      });
    }

    return scenarios;
  }

  /**
   * Combine multiple interactions per model into a single response for evaluation
   */
  private combineModelInteractions(modelKey: string, interactions: ModelResponse[]): ModelResponse {
    // Sort interactions by timestamp
    const sorted = interactions.sort((a, b) => 
      new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime()
    );
    
    // Create combined response showing all interactions
    const combinedResponse = sorted.map((interaction, index) => 
      `**Interaction ${index + 1}:**\n` +
      `Issue: ${interaction.metadata.issue}\n` +
      `Response: ${interaction.response}\n`
    ).join('\n---\n');
    
    // Aggregate performance metrics
    const totalDuration = sorted.reduce((sum, i) => sum + i.performance.duration_ms, 0);
    const totalInputTokens = sorted.reduce((sum, i) => sum + i.performance.input_tokens, 0);
    const totalOutputTokens = sorted.reduce((sum, i) => sum + i.performance.output_tokens, 0);
    
    // Collect all failure analyses from all interactions that have them
    const allFailures: Array<{ interaction_number: number; issue?: string; [key: string]: unknown }> = [];
    sorted.forEach((interaction, index) => {
      if (interaction.metadata.failure_analysis) {
        allFailures.push({
          interaction_number: index + 1,
          issue: interaction.metadata.issue,
          ...(interaction.metadata.failure_analysis as Record<string, unknown>)
        });
      }
    });
    
    // Use the first failure as the primary failure_analysis, but preserve all failures
    const primaryFailureAnalysis = allFailures.length > 0 ? allFailures[0] : undefined;
    
    return {
      model: modelKey,
      response: combinedResponse,
      performance: {
        ...sorted[0].performance,
        duration_ms: totalDuration,
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalInputTokens + totalOutputTokens
      },
      metadata: {
        ...sorted[0].metadata,
        issue: sorted[0].metadata.issue, // Use first interaction's issue as primary
        interaction_count: interactions.length,
        failure_analysis: primaryFailureAnalysis,
        all_failures: allFailures.length > 0 ? allFailures : undefined
      }
    };
  }

  /**
   * Get summary of available models across all scenarios for a tool
   */
  getAvailableModels(tool: string): string[] {
    const datasets = this.findDatasets(tool);
    const models = new Set<string>();

    for (const filepath of datasets) {
      const parsed = this.parseDatasetFilename(filepath);
      if (parsed) {
        models.add(`${parsed.sdk}_${parsed.model}`);
      }
    }

    return Array.from(models).sort();
  }

  /**
   * Get statistics about dataset availability
   */
  getDatasetStats(tool: string): {
    totalDatasets: number;
    availableModels: string[];
    scenariosWithMultipleModels: number;
    interactionTypes: string[];
  } {
    const scenarios = this.groupByScenario(tool);
    const datasets = this.findDatasets(tool);
    const interactionTypes = new Set<string>();

    for (const filepath of datasets) {
      const parsed = this.parseDatasetFilename(filepath);
      if (parsed) {
        interactionTypes.add(parsed.interaction_id);
      }
    }

    return {
      totalDatasets: datasets.length,
      availableModels: this.getAvailableModels(tool),
      scenariosWithMultipleModels: scenarios.length,
      interactionTypes: Array.from(interactionTypes).sort()
    };
  }
}