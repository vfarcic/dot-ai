/**
 * Evaluation Runner
 * 
 * Orchestrates multi-model evaluations following OpenAI Evals patterns
 * Collects quality scores + performance metrics for comprehensive analysis
 */

import { StandardEvaluator, EvaluationResult, PerformanceMetrics } from './evaluators/base.js';
import { loadEvalDataset } from './datasets/loader.js';

export interface ModelConfig {
  name: string;
  provider: string;
  apiCall: (input: Record<string, any>) => Promise<{
    output: string;
    performance: PerformanceMetrics;
  }>;
}

export interface EvaluationRunConfig {
  datasetName: string;
  models: ModelConfig[];
  evaluators: StandardEvaluator[];
  runs: number; // Number of runs per model (for non-determinism handling)
}

export class EvaluationRunner {
  
  /**
   * Run evaluation across multiple models
   * Industry standard: separate evaluation for each model
   */
  async runEvaluation(config: EvaluationRunConfig): Promise<EvaluationResult[]> {
    console.log(`🚀 Starting evaluation: ${config.datasetName}`);
    console.log(`📊 Models: ${config.models.map(m => m.name).join(', ')}`);
    console.log(`🔍 Evaluators: ${config.evaluators.map(e => e.name).join(', ')}`);
    console.log(`🔄 Runs per model: ${config.runs}`);

    const dataset = loadEvalDataset(config.datasetName);
    const results: EvaluationResult[] = [];

    // Evaluate each model separately (industry standard)
    for (const model of config.models) {
      console.log(`\n📋 Evaluating model: ${model.name}`);
      
      for (const sample of dataset) {
        console.log(`  🧪 Sample: ${sample.input.issue?.substring(0, 50)}...`);
        
        // Multiple runs to handle non-determinism
        const runResults = [];
        for (let run = 0; run < config.runs; run++) {
          console.log(`    🔄 Run ${run + 1}/${config.runs}`);
          
          const sampleResult = await this.evaluateSingleSample(
            sample, 
            model, 
            config.evaluators,
            run
          );
          runResults.push(sampleResult);
        }
        
        // Average scores across runs (standard practice)
        const aggregatedResult = this.aggregateRuns(runResults);
        results.push(aggregatedResult);
      }
    }

    console.log(`\n✅ Evaluation complete! ${results.length} results generated.`);
    return results;
  }

  /**
   * Evaluate single sample with one model
   */
  private async evaluateSingleSample(
    sample: any,
    model: ModelConfig,
    evaluators: StandardEvaluator[],
    runNumber: number
  ): Promise<EvaluationResult> {
    
    // const startTime = Date.now(); // Reserved for future timing needs
    
    // Get AI response + performance metrics
    const { output, performance } = await model.apiCall(sample.input);
    
    // Get quality scores from evaluators
    const qualityScores: Record<string, any> = {};
    for (const evaluator of evaluators) {
      const score = await evaluator.evaluate({
        input: sample.input,
        output,
        ideal: sample.ideal,
        metadata: sample.metadata
      });
      qualityScores[evaluator.name] = score;
    }

    // Calculate overall quality score (average of all evaluators)
    const overallQuality = Object.values(qualityScores)
      .map((s: any) => s.score)
      .reduce((a, b) => a + b) / Object.values(qualityScores).length;

    // Calculate efficiency metrics
    const efficiency = {
      quality_per_second: overallQuality / (performance.duration_ms / 1000),
      quality_per_token: overallQuality / performance.total_tokens,
      quality_per_dollar: performance.cost_usd ? overallQuality / performance.cost_usd : undefined
    };

    return {
      sample_id: `${model.name}_${Date.now()}_${runNumber}`,
      model: model.name,
      timestamp: new Date().toISOString(),
      quality_scores: qualityScores,
      performance,
      efficiency,
      input: sample.input,
      output,
      ideal: sample.ideal
    };
  }

  /**
   * Aggregate multiple runs (handle AI non-determinism)
   */
  private aggregateRuns(runs: EvaluationResult[]): EvaluationResult {
    if (runs.length === 1) return runs[0];

    // Average quality scores
    const avgQualityScores: Record<string, any> = {};
    const evaluatorNames = Object.keys(runs[0].quality_scores);
    
    for (const evalName of evaluatorNames) {
      const scores = runs.map(r => r.quality_scores[evalName].score);
      const avgScore = scores.reduce((a, b) => a + b) / scores.length;
      const confidence = this.calculateConfidence(scores);
      
      avgQualityScores[evalName] = {
        key: evalName,
        score: avgScore,
        confidence,
        comment: `Averaged across ${runs.length} runs`
      };
    }

    // Average performance metrics
    const avgPerformance: PerformanceMetrics = {
      duration_ms: this.average(runs.map(r => r.performance.duration_ms)),
      input_tokens: this.average(runs.map(r => r.performance.input_tokens)),
      output_tokens: this.average(runs.map(r => r.performance.output_tokens)),
      total_tokens: this.average(runs.map(r => r.performance.total_tokens)),
      cost_usd: runs[0].performance.cost_usd ? this.average(runs.map(r => r.performance.cost_usd!)) : undefined,
      iterations: this.average(runs.map(r => r.performance.iterations || 1)),
      tool_calls_executed: this.average(runs.map(r => r.performance.tool_calls_executed || 0)),
      model_version: runs[0].performance.model_version
    };

    // Recalculate efficiency with averaged metrics
    const overallQuality = Object.values(avgQualityScores)
      .map((s: any) => s.score)
      .reduce((a, b) => a + b) / Object.values(avgQualityScores).length;

    const avgEfficiency = {
      quality_per_second: overallQuality / (avgPerformance.duration_ms / 1000),
      quality_per_token: overallQuality / avgPerformance.total_tokens,
      quality_per_dollar: avgPerformance.cost_usd ? overallQuality / avgPerformance.cost_usd : undefined
    };

    return {
      sample_id: `${runs[0].model}_aggregated_${runs.length}runs`,
      model: runs[0].model,
      timestamp: new Date().toISOString(),
      quality_scores: avgQualityScores,
      performance: avgPerformance,
      efficiency: avgEfficiency,
      input: runs[0].input,
      output: `Aggregated from ${runs.length} runs`,
      ideal: runs[0].ideal
    };
  }

  private average(numbers: number[]): number {
    return numbers.reduce((a, b) => a + b) / numbers.length;
  }

  private calculateConfidence(scores: number[]): number {
    const mean = this.average(scores);
    const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    // Return confidence as 1 - normalized standard deviation
    return Math.max(0, Math.min(1, 1 - (stdDev / mean)));
  }
}