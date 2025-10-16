import * as fs from 'fs';
import * as path from 'path';
import { VercelProvider } from '../core/providers/vercel-provider.js';
import { GraphGenerator } from './graph-generator.js';
import { loadEvaluationMetadata } from './metadata-loader.js';

export interface ModelPerformance {
  modelId: string;
  provider: string;
  toolScores: Record<string, number>;
  averageScore: number;
  participationRate: number;
  reliabilityScore: number;
  consistencyAcrossTools: number;
  pricing: {
    input_cost_per_million_tokens: number;
    output_cost_per_million_tokens: number;
  };
  capabilities: {
    context_window: number;
    supports_function_calling: boolean;
  };
}

export interface DecisionMatrix {
  qualityLeaders: ModelPerformance[];
  speedOptimized: ModelPerformance[];
  costEffective: ModelPerformance[];
  balanced: ModelPerformance[];
  reliabilityFocused: ModelPerformance[];
}

export interface UsageRecommendation {
  priority: 'quality-first' | 'speed-first' | 'cost-first' | 'balanced';
  primaryModel: string;
  fallbackModel: string;
  reasoning: string;
  costImplications: string;
  useCases: string[];
}

export class PlatformSynthesizer {
  private aiProvider: VercelProvider;
  private reportsDir: string;

  constructor(aiProvider: VercelProvider, reportsDir = './eval/analysis/individual') {
    this.aiProvider = aiProvider;
    this.reportsDir = reportsDir;
  }

  async generatePlatformWideAnalysis(graphsToGenerate?: string[], skipReport = false): Promise<string> {
    console.log('🔍 Loading all evaluation reports...');
    const allReports = await this.loadAllReports();

    console.log('🔧 Loading tool metadata...');
    const toolMetadata = this.loadToolMetadata();

    console.log('📊 Analyzing cross-tool performance patterns...');
    const crossToolAnalysis = await this.analyzeCrossToolPerformance(allReports);

    let markdownReport: string;

    if (skipReport) {
      console.log('⏭️  Skipping AI report generation...');
      // Return empty string if we're only generating graphs
      markdownReport = '';
    } else {
      console.log('🎯 Generating decision matrices...');
      const decisionMatrices = this.generateDecisionMatrices(crossToolAnalysis.modelPerformances);

      console.log('💡 Creating usage recommendations...');
      const usageRecommendations = this.generateUsageRecommendations(
        crossToolAnalysis,
        decisionMatrices
      );

      console.log('🚀 Generating comprehensive AI-powered report...');
      markdownReport = await this.generatePlatformInsights(
        crossToolAnalysis,
        decisionMatrices,
        usageRecommendations,
        toolMetadata
      );
    }

    console.log('📊 Generating data visualizations...');
    const reportWithGraphs = await this.addGraphsToReport(
      markdownReport,
      crossToolAnalysis.modelPerformances,
      graphsToGenerate
    );

    return reportWithGraphs;
  }

  private loadToolMetadata(): any {
    const metadata = loadEvaluationMetadata();
    return { tools: metadata.tools };
  }

  private async loadAllReports(): Promise<Record<string, any>> {
    const reports: Record<string, any> = {};
    
    // Load all JSON result files from the directory
    const reportFiles = fs.readdirSync(this.reportsDir)
      .filter(file => file.endsWith('-results.json'));
    
    if (reportFiles.length === 0) {
      throw new Error(`No evaluation result files found in ${this.reportsDir}`);
    }
    
    for (const fileName of reportFiles) {
      const reportPath = path.join(this.reportsDir, fileName);
      const reportContent = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      
      // Extract tool type from filename (e.g., "capability-results.json" -> "capability")
      const toolType = fileName.split('-results.json')[0];
      reports[toolType] = reportContent;
      console.log(`✅ Loaded ${toolType} report: ${fileName}`);
    }
    
    console.log(`📊 Total reports loaded: ${Object.keys(reports).length}`);
    return reports;
  }

  private async analyzeCrossToolPerformance(allReports: Record<string, any>): Promise<{
    modelPerformances: ModelPerformance[];
    crossToolConsistency: Record<string, number>;
    toolSpecificLeaders: Record<string, string>;
    universalPerformers: string[];
  }> {
    const modelPerformances = this.calculateModelPerformances(allReports);
    
    // Calculate cross-tool consistency scores
    const crossToolConsistency: Record<string, number> = {};
    for (const model of modelPerformances) {
      const scores = Object.values(model.toolScores);
      if (scores.length > 1) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        const standardDeviation = Math.sqrt(variance);
        // Lower standard deviation = higher consistency (invert for consistency score)
        crossToolConsistency[model.modelId] = Math.max(0, 1 - (standardDeviation / mean));
      }
    }

    // Identify tool-specific leaders and universal performers
    const toolSpecificLeaders: Record<string, string> = {};
    const toolTypes = Object.keys(allReports);
    for (const toolType of toolTypes) {
      const bestModel = modelPerformances
        .filter(m => m.toolScores[toolType] !== undefined)
        .sort((a, b) => b.toolScores[toolType] - a.toolScores[toolType])[0];
      
      if (bestModel) {
        toolSpecificLeaders[toolType] = bestModel.modelId;
      }
    }

    // Universal performers = models that rank in top 3 across all tools they participate in
    const universalPerformers: string[] = [];
    for (const model of modelPerformances) {
      const participatingTools = Object.keys(model.toolScores);
      let topThreeCount = 0;
      
      for (const toolType of participatingTools) {
        const ranking = modelPerformances
          .filter(m => m.toolScores[toolType] !== undefined)
          .sort((a, b) => b.toolScores[toolType] - a.toolScores[toolType])
          .findIndex(m => m.modelId === model.modelId);
        
        if (ranking < 3) topThreeCount++;
      }
      
      if (participatingTools.length >= 3 && topThreeCount >= participatingTools.length * 0.75) {
        universalPerformers.push(model.modelId);
      }
    }

    return {
      modelPerformances,
      crossToolConsistency,
      toolSpecificLeaders,
      universalPerformers
    };
  }

  private calculateModelPerformances(allReports: Record<string, any>): ModelPerformance[] {
    const modelMap = new Map<string, Partial<ModelPerformance>>();
    
    // Process each tool's evaluation results
    for (const [toolType, report] of Object.entries(allReports)) {
      if (!report.overallAssessment?.detailed_analysis) continue;
      
      for (const [modelKey, assessment] of Object.entries(report.overallAssessment.detailed_analysis)) {
        const modelId = modelKey as string;
        
        if (!modelMap.has(modelId)) {
          const metadata = report.modelMetadata?.[this.extractBaseModelId(modelId)] || {};
          modelMap.set(modelId, {
            modelId,
            provider: metadata.provider || 'Unknown',
            toolScores: {},
            pricing: metadata.pricing || { input_cost_per_million_tokens: 0, output_cost_per_million_tokens: 0 },
            capabilities: {
              context_window: metadata.context_window || 0,
              supports_function_calling: metadata.supports_function_calling || false
            }
          });
        }
        
        const modelData = modelMap.get(modelId)!;
        const assessmentData = assessment as any;
        
        // Extract average score for this tool
        if (typeof assessmentData.average_score === 'number') {
          modelData.toolScores![toolType] = assessmentData.average_score;
        }
        
        // Update participation and reliability metrics
        if (typeof assessmentData.participation_rate === 'number') {
          modelData.participationRate = (modelData.participationRate || 0) + assessmentData.participation_rate;
        }
        
        if (typeof assessmentData.reliability_score === 'number') {
          modelData.reliabilityScore = (modelData.reliabilityScore || 0) + assessmentData.reliability_score;
        }
      }
    }
    
    // Calculate final metrics
    const modelPerformances: ModelPerformance[] = [];
    for (const [modelId, data] of modelMap.entries()) {
      const toolCount = Object.keys(data.toolScores!).length;
      if (toolCount === 0) continue;
      
      const averageScore = Object.values(data.toolScores!).reduce((a, b) => a + b, 0) / toolCount;
      const participationRate = (data.participationRate || 0) / toolCount;
      const reliabilityScore = (data.reliabilityScore || 0) / toolCount;
      
      // Calculate consistency across tools
      const scores = Object.values(data.toolScores!);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
      const consistencyAcrossTools = Math.max(0, 1 - (Math.sqrt(variance) / mean));
      
      modelPerformances.push({
        modelId,
        provider: data.provider!,
        toolScores: data.toolScores!,
        averageScore,
        participationRate,
        reliabilityScore,
        consistencyAcrossTools,
        pricing: data.pricing!,
        capabilities: data.capabilities!
      });
    }
    
    return modelPerformances.sort((a, b) => b.averageScore - a.averageScore);
  }

  private generateDecisionMatrices(modelPerformances: ModelPerformance[]): DecisionMatrix {
    // Sort models by different criteria
    const qualityLeaders = [...modelPerformances]
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 5);
    
    const speedOptimized = [...modelPerformances]
      .filter(m => m.pricing.input_cost_per_million_tokens > 0) // Filter out models with no pricing data
      .sort((a, b) => a.pricing.input_cost_per_million_tokens - b.pricing.input_cost_per_million_tokens)
      .slice(0, 5);
    
    const costEffective = [...modelPerformances]
      .filter(m => m.pricing.input_cost_per_million_tokens > 0 && m.pricing.output_cost_per_million_tokens > 0)
      .map(model => ({
        ...model,
        valueScore: model.averageScore / ((model.pricing.input_cost_per_million_tokens + model.pricing.output_cost_per_million_tokens) / 2)
      }))
      .sort((a: any, b: any) => b.valueScore - a.valueScore)
      .slice(0, 5);
    
    const balanced = [...modelPerformances]
      .filter(m => m.pricing.input_cost_per_million_tokens > 0)
      .map(model => ({
        ...model,
        balancedScore: (model.averageScore * 0.4) + (model.consistencyAcrossTools * 0.3) + 
                      (model.reliabilityScore * 0.3) - 
                      ((model.pricing.input_cost_per_million_tokens + model.pricing.output_cost_per_million_tokens) / 100)
      }))
      .sort((a: any, b: any) => b.balancedScore - a.balancedScore)
      .slice(0, 5);
    
    const reliabilityFocused = [...modelPerformances]
      .sort((a, b) => {
        if (b.reliabilityScore !== a.reliabilityScore) {
          return b.reliabilityScore - a.reliabilityScore;
        }
        return b.consistencyAcrossTools - a.consistencyAcrossTools;
      })
      .slice(0, 5);
    
    return {
      qualityLeaders,
      speedOptimized,
      costEffective,
      balanced,
      reliabilityFocused
    };
  }

  private generateUsageRecommendations(
    crossToolAnalysis: any, 
    decisionMatrices: DecisionMatrix
  ): UsageRecommendation[] {
    const recommendations: UsageRecommendation[] = [
      {
        priority: 'quality-first',
        primaryModel: decisionMatrices.qualityLeaders[0]?.modelId || '',
        fallbackModel: decisionMatrices.qualityLeaders[1]?.modelId || '',
        reasoning: 'Optimized for maximum accuracy and completeness across all MCP tools',
        costImplications: `Estimated cost: $${this.calculateCostEstimate(decisionMatrices.qualityLeaders[0])}/1M tokens`,
        useCases: ['Production deployments', 'Critical troubleshooting', 'Complex recommendations']
      },
      {
        priority: 'cost-first',
        primaryModel: decisionMatrices.costEffective[0]?.modelId || '',
        fallbackModel: decisionMatrices.costEffective[1]?.modelId || '',
        reasoning: 'Best value ratio of performance per dollar spent',
        costImplications: `Estimated cost: $${this.calculateCostEstimate(decisionMatrices.costEffective[0])}/1M tokens`,
        useCases: ['Budget-conscious deployments', 'Frequent operations', 'Cost-sensitive workflows']
      },
      {
        priority: 'speed-first',
        primaryModel: decisionMatrices.speedOptimized[0]?.modelId || '',
        fallbackModel: decisionMatrices.speedOptimized[1]?.modelId || '',
        reasoning: 'Optimized for fastest response times and lowest latency',
        costImplications: `Estimated cost: $${this.calculateCostEstimate(decisionMatrices.speedOptimized[0])}/1M tokens`,
        useCases: ['Time-sensitive troubleshooting', 'Interactive debugging', 'Rapid prototyping']
      },
      {
        priority: 'balanced',
        primaryModel: decisionMatrices.balanced[0]?.modelId || '',
        fallbackModel: decisionMatrices.balanced[1]?.modelId || '',
        reasoning: 'Optimal balance of quality, reliability, and cost considerations',
        costImplications: `Estimated cost: $${this.calculateCostEstimate(decisionMatrices.balanced[0])}/1M tokens`,
        useCases: ['General purpose usage', 'Mixed workloads', 'Default recommendation']
      }
    ];
    
    return recommendations;
  }

  private async generatePlatformInsights(
    crossToolAnalysis: any,
    decisionMatrices: DecisionMatrix,
    usageRecommendations: UsageRecommendation[],
    toolMetadata: any
  ): Promise<any> {
    // Load prompt template from evaluation prompts directory
    const promptPath = path.join(process.cwd(), 'src', 'evaluation', 'prompts', 'platform-synthesis.md');
    const promptTemplate = fs.readFileSync(promptPath, 'utf8');
    
    const promptWithData = promptTemplate
      .replace('{crossToolAnalysisJson}', JSON.stringify(crossToolAnalysis, null, 2))
      .replace('{decisionMatricesJson}', JSON.stringify(decisionMatrices, null, 2))
      .replace('{usageRecommendationsJson}', JSON.stringify(usageRecommendations, null, 2))
      .replace('{toolMetadataJson}', JSON.stringify(toolMetadata, null, 2));

    const aiResponse = await this.aiProvider.sendMessage(promptWithData);
    return aiResponse.content; // Return the AI-generated markdown directly
  }

  private extractKeyFindings(crossToolAnalysis: any): string[] {
    const findings: string[] = [];
    
    findings.push(`${crossToolAnalysis.modelPerformances.length} models evaluated across ${Object.keys(crossToolAnalysis.toolSpecificLeaders).length} tool types`);
    findings.push(`${crossToolAnalysis.universalPerformers.length} models demonstrated consistent cross-tool performance`);
    
    // Add performance spread analysis
    const scores = crossToolAnalysis.modelPerformances.map((m: any) => m.averageScore);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    findings.push(`Performance spread: ${(maxScore - minScore).toFixed(3)} (${maxScore.toFixed(3)} - ${minScore.toFixed(3)})`);
    
    return findings;
  }

  private categorizeModelTiers(modelPerformances: ModelPerformance[]): Record<string, string[]> {
    const sorted = [...modelPerformances].sort((a, b) => b.averageScore - a.averageScore);
    
    // Use reliability score and consistency to determine production readiness
    const productionReady = sorted.filter(m => m.reliabilityScore >= 0.8 && m.consistencyAcrossTools >= 0.7);
    const costOptimized = sorted.filter(m => 
      m.reliabilityScore >= 0.7 && 
      m.consistencyAcrossTools >= 0.6 && 
      !productionReady.includes(m) &&
      (m.pricing.input_cost_per_million_tokens + m.pricing.output_cost_per_million_tokens) < 10
    );
    const avoidForProduction = sorted.filter(m => 
      !productionReady.includes(m) && !costOptimized.includes(m)
    );
    
    return {
      'Production Ready': productionReady.map(m => m.modelId),
      'Cost-Optimized': costOptimized.map(m => m.modelId),
      'Avoid for Production': avoidForProduction.map(m => m.modelId)
    };
  }

  private identifyCrossToolPatterns(crossToolAnalysis: any): Record<string, any> {
    return {
      consistencyLeaders: Object.entries(crossToolAnalysis.crossToolConsistency)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([model]) => model),
      toolSpecificLeaders: crossToolAnalysis.toolSpecificLeaders,
      universalPerformers: crossToolAnalysis.universalPerformers
    };
  }

  private generateProductionRecommendations(decisionMatrices: DecisionMatrix): Record<string, string> {
    return {
      'Primary Production Model': decisionMatrices.qualityLeaders[0]?.modelId || 'None',
      'Cost-Optimized Alternative': decisionMatrices.costEffective[0]?.modelId || 'None',
      'High-Reliability Option': decisionMatrices.reliabilityFocused[0]?.modelId || 'None',
      'Balanced General Use': decisionMatrices.balanced[0]?.modelId || 'None'
    };
  }

  private calculateCostEstimate(model?: ModelPerformance): string {
    if (!model || !model.pricing.input_cost_per_million_tokens) return '0.00';
    
    // Estimate average cost per 1M tokens (assuming 50% input, 50% output)
    const avgCost = (model.pricing.input_cost_per_million_tokens + model.pricing.output_cost_per_million_tokens) / 2;
    return avgCost.toFixed(2);
  }

  private extractBaseModelId(fullModelId: string): string {
    // Extract base model from full ID like "vercel_claude-sonnet-4-5-20250929_2025-10-15"
    const parts = fullModelId.split('_');
    if (parts.length >= 2) {
      return parts[1]; // Return the middle part (actual model name)
    }
    return fullModelId;
  }

  /**
   * Generates graphs and replaces placeholders in the markdown report
   */
  private async addGraphsToReport(
    markdownContent: string,
    modelPerformances: ModelPerformance[],
    graphsToGenerate?: string[]
  ): Promise<string> {
    const graphGenerator = new GraphGenerator('./eval/analysis/platform/graphs');

    try {
      // Generate all or specific graphs
      const graphResults = await graphGenerator.generateAllGraphs(modelPerformances, graphsToGenerate);

      // Replace placeholders with actual image markdown
      let updatedMarkdown = markdownContent;

      const graphMappings = {
        '[GRAPH:performance-tiers]': '![Performance Tiers](./graphs/performance-tiers.png)',
        '[GRAPH:cost-vs-quality]': '![Cost vs Quality](./graphs/cost-vs-quality.png)',
        '[GRAPH:reliability-comparison]': '![Reliability Comparison](./graphs/reliability-comparison.png)',
        '[GRAPH:tool-performance-heatmap]': '![Tool Performance Heatmap](./graphs/tool-performance-heatmap.png)',
        '[GRAPH:context-window-correlation]': '![Context Window Correlation](./graphs/context-window-correlation.png)'
      };

      for (const [placeholder, imageMarkdown] of Object.entries(graphMappings)) {
        updatedMarkdown = updatedMarkdown.replace(placeholder, imageMarkdown);
      }

      // Log graph generation results
      for (const [graphName, result] of Object.entries(graphResults)) {
        if (result.success) {
          console.log(`  ✅ ${graphName}: ${result.graphPath}`);
        } else {
          console.warn(`  ⚠️  ${graphName}: ${result.error}`);
          // If graph generation failed, remove the placeholder to avoid broken markdown
          const placeholderKey = `[GRAPH:${graphName}]`;
          updatedMarkdown = updatedMarkdown.replace(placeholderKey, `*Graph generation failed: ${result.error}*`);
        }
      }

      return updatedMarkdown;
    } catch (error) {
      console.error('⚠️  Failed to generate graphs, returning report without visualizations:', error);
      // If graph generation completely fails, remove all placeholders
      return markdownContent.replace(/\[GRAPH:[^\]]+\]/g, '*Graph generation failed*');
    }
  }

  async saveSynthesisReport(
    markdownContent: string,
    outputPath = './eval/analysis/platform/synthesis-report.md'
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save the AI-generated markdown directly
    fs.writeFileSync(outputPath, markdownContent);
    console.log(`✅ Platform synthesis report saved: ${outputPath}`);
  }

}