/**
 * Shared Metadata Loader
 *
 * Provides consistent access to model and tool metadata across all evaluators
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface ModelMetadata {
  provider: string;
  pricing: {
    input_cost_per_million_tokens: number;
    output_cost_per_million_tokens: number;
  };
  context_window: number;
  supports_function_calling: boolean;
}

export interface ToolMetadata {
  name: string;
  description: string;
  primaryFunction: string;
  testTimeout: string;
  successCriteria: string[];
  modelRequirements: Record<string, string>;
}

export interface EvaluationMetadata {
  models: Record<string, ModelMetadata>;
  tools: Record<string, ToolMetadata>;
}

/**
 * Load model and tool metadata from model-metadata.json
 */
export function loadEvaluationMetadata(): EvaluationMetadata {
  try {
    const metadataPath = join(process.cwd(), 'src', 'evaluation', 'model-metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    console.log(`✅ Loaded metadata for ${Object.keys(metadata.models || {}).length} models and ${Object.keys(metadata.tools || {}).length} tools`);
    return {
      models: metadata.models || {},
      tools: metadata.tools || {}
    };
  } catch (error) {
    console.warn('⚠️  Failed to load evaluation metadata:', error);
    return { models: {}, tools: {} };
  }
}

/**
 * Build model pricing context for evaluation prompts
 */
export function buildModelPricingContext(models: Record<string, ModelMetadata>): string {
  const modelIds = Object.keys(models);
  if (modelIds.length === 0) {
    return 'No pricing information available.';
  }

  const pricingLines = modelIds.map(modelId => {
    const model = models[modelId];
    const inputCost = model.pricing?.input_cost_per_million_tokens?.toFixed(2) || 'N/A';
    const outputCost = model.pricing?.output_cost_per_million_tokens?.toFixed(2) || 'N/A';
    const avgCost = model.pricing
      ? ((model.pricing.input_cost_per_million_tokens + model.pricing.output_cost_per_million_tokens) / 2).toFixed(2)
      : 'N/A';
    const contextWindow = model.context_window ? `${(model.context_window / 1000).toFixed(0)}K` : 'N/A';
    return `- **${modelId}** (${model.provider}): $${avgCost}/1M tokens ($${inputCost} input, $${outputCost} output) | Context: ${contextWindow} tokens`;
  });

  return `## Model Pricing Information\n\n${pricingLines.join('\n')}`;
}

/**
 * Build tool context for evaluation prompts (tool-specific description and constraints)
 */
export function buildToolContext(toolName: string, tools: Record<string, ToolMetadata>): string {
  const tool = tools[toolName];
  if (!tool) {
    return `No metadata available for tool: ${toolName}`;
  }

  return `## Tool Being Evaluated: ${tool.name}

**Description**: ${tool.description}

**Primary Function**: ${tool.primaryFunction}

**Test Timeout Constraint**: ${tool.testTimeout}

**Success Criteria**:
${tool.successCriteria.map((c: string) => `- ${c}`).join('\n')}

**Model Requirements**:
${Object.entries(tool.modelRequirements).map(([key, value]) => `- **${key}**: ${value}`).join('\n')}

**IMPORTANT**: When analyzing model failures, consider whether the model exceeded the timeout constraint. Models that timeout should be noted as failing due to timeout constraints rather than quality issues.`;
}
