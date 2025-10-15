#!/usr/bin/env npx tsx

/**
 * Evaluation Runner for Multi-Model Comparative Analysis
 * 
 * Runs comparative evaluation on available datasets from multiple models
 * Automatically detects and evaluates both remediation and recommendation datasets
 */

import { RemediationComparativeEvaluator } from './evaluators/remediation-comparative.js';
import { RecommendationComparativeEvaluator } from './evaluators/recommendation-comparative.js';
import { CapabilityComparativeEvaluator } from './evaluators/capability-comparative.js';
import { PatternComparativeEvaluator } from './evaluators/pattern-comparative.js';
import { PolicyComparativeEvaluator } from './evaluators/policy-comparative.js';
import { readdir } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const EVALUATOR_CONFIG = {
  remediation: { 
    evaluator: RemediationComparativeEvaluator, 
    prefix: 'remediate_', 
    title: 'Remediation AI Model Comparison Report' 
  },
  recommendation: { 
    evaluator: RecommendationComparativeEvaluator, 
    prefix: 'recommend_', 
    title: 'Recommendation AI Model Comparison Report' 
  },
  capability: { 
    evaluator: CapabilityComparativeEvaluator, 
    prefix: 'capability_', 
    title: 'Capability AI Model Comparison Report' 
  },
  pattern: { 
    evaluator: PatternComparativeEvaluator, 
    prefix: 'pattern_', 
    title: 'Pattern AI Model Comparison Report' 
  },
  policy: { 
    evaluator: PolicyComparativeEvaluator, 
    prefix: 'policy_', 
    title: 'Policy AI Model Comparison Report' 
  }
} as const;

type EvaluationType = keyof typeof EVALUATOR_CONFIG;

function generateMarkdownReport(results: any[], stats: any, evaluationType: EvaluationType, finalAssessment?: any): string {
  const timestamp = new Date().toISOString();
  
  // Use final assessment if provided
  const overallAssessment = finalAssessment?.overall_assessment || null;
  
  // Calculate basic statistics for reference
  const modelScores = new Map<string, number[]>();
  results.forEach(result => {
    if (result.modelRankings) {
      result.modelRankings.forEach((ranking: any) => {
        if (!modelScores.has(ranking.model)) {
          modelScores.set(ranking.model, []);
        }
        modelScores.get(ranking.model)!.push(ranking.score);
      });
    }
  });
  
  // Calculate average scores for supplementary information
  const modelAverages = new Map<string, number>();
  modelScores.forEach((scores, model) => {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    modelAverages.set(model, Math.round(avg * 1000) / 1000);
  });
  
  const reportTitle = EVALUATOR_CONFIG[evaluationType].title;
  
  return `# ${reportTitle}

**Generated**: ${timestamp}  
**Scenarios Analyzed**: ${results.length}  
**Models Evaluated**: ${stats.availableModels.length}  
**Total Datasets**: ${stats.totalDatasets}

## Executive Summary

### 🏆 Overall Winner (AI Assessment)
${overallAssessment ? `
**${overallAssessment.winner}**

${overallAssessment.rationale}
` : 'Overall assessment not available'}

### 📊 AI Reliability Rankings

${overallAssessment ? overallAssessment.reliability_ranking
  .map((ranking: any, index: number) => `${index + 1}. **${ranking.model}** (${Math.round(ranking.reliability_score * 100)}%) - ${ranking.reliability_notes}`)
  .join('\n') : 'Reliability rankings not available'}

### 📋 Production Recommendations

${overallAssessment ? `
- **Primary Choice**: ${overallAssessment.production_recommendations.primary}
- **Secondary Option**: ${overallAssessment.production_recommendations.secondary}
- **Avoid for Production**: ${overallAssessment.production_recommendations.avoid.length > 0 ? overallAssessment.production_recommendations.avoid.join(', ') : 'None'}
${Object.keys(overallAssessment.production_recommendations.specialized_use).length > 0 ? 
  '\n**Specialized Use Cases:**\n' + Object.entries(overallAssessment.production_recommendations.specialized_use)
    .map(([useCase, model]) => `- **${useCase}**: ${model}`)
    .join('\n') : ''}
` : 'Production recommendations not available'}

### 📊 Supplementary Statistics (Reference Only)

| Model | Avg Score | Notes |
|-------|-----------|-------|
${Array.from(modelAverages.entries())
  .sort((a, b) => b[1] - a[1])
  .map(([model, avgScore]) => `| ${model} | ${avgScore} | See AI assessment above |`)
  .join('\n')}

## Detailed Scenario Results

${results.map((result, index) => {
  const scenarioTitle = result.key.replace(/_/g, ' ').replace(/(remediation|recommendation) comparative /, '').toUpperCase();
  
  return `### ${index + 1}. ${scenarioTitle}

**Winner**: ${result.bestModel} (Score: ${result.score})  
**Models Compared**: ${result.modelCount}  
**Confidence**: ${result.confidence ? Math.round(result.confidence * 100) : 0}%

#### Rankings
${result.modelRankings ? result.modelRankings.map((rank: any) => 
  `${rank.rank}. **${rank.model}** - ${rank.score}`
).join('\n') : 'No detailed rankings available'}

#### Analysis
${result.comment}

---`;
}).join('\n\n')}

## AI Model Selection Guide

${overallAssessment ? `
### Key Insights
${overallAssessment.key_insights}

### Recommended Selection Strategy
- **For Production Use**: Choose ${overallAssessment.production_recommendations.primary}
- **For Secondary Option**: Consider ${overallAssessment.production_recommendations.secondary}
${overallAssessment.production_recommendations.avoid.length > 0 ? 
  `- **Avoid**: ${overallAssessment.production_recommendations.avoid.join(', ')} (reliability concerns)` : ''}

### Decision Framework
The AI assessment prioritizes **reliability and consistency** over peak performance. Models that fail completely in any scenario are heavily penalized, ensuring production-ready recommendations.
` : 'AI model selection guide not available'}

---

## Report Attribution

Report generated by DevOps AI Toolkit Comparative Evaluation System
`;
}

function loadModelMetadata() {
  try {
    const fs = require('fs');
    const path = require('path');
    const metadataPath = path.join(__dirname, 'model-metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      console.error('❌ Model metadata file not found');
      console.error('📊 Pricing and capabilities data required for cost analysis');
      console.error('');
      console.error('🔄 To create model metadata, run:');
      console.error('   /update-model-metadata');
      console.error('');
      process.exit(1);
    }
    
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    
    // Check if metadata is older than 30 days
    const metadataAge = Date.now() - new Date(metadata.lastUpdated).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    if (metadataAge > thirtyDays) {
      console.error('❌ Model metadata is over 30 days old (last updated: ' + metadata.lastUpdated + ')');
      console.error('📊 Pricing and capabilities data may be outdated, affecting cost analysis accuracy');
      console.error('');
      console.error('🔄 To update model metadata, run:');
      console.error('   /update-model-metadata');
      console.error('');
      process.exit(1);
    }
    
    console.log('✅ Model metadata loaded (updated: ' + metadata.lastUpdated + ')');
    return metadata;
  } catch (error) {
    console.error('❌ Failed to load model metadata:', error instanceof Error ? error.message : String(error));
    console.error('🔄 To create model metadata, run: /update-model-metadata');
    process.exit(1);
  }
}

function generateJsonReport(results: any[], stats: any, evaluationType: EvaluationType, modelMetadata: any, finalAssessment?: any) {
  const timestamp = new Date().toISOString();
  
  // Use final assessment if provided
  const overallAssessment = finalAssessment || null;
  
  return {
    metadata: {
      reportType: 'comparative-evaluation',
      evaluationType: evaluationType,
      generated: timestamp,
      scenariosAnalyzed: results.length,
      modelsEvaluated: stats.availableModels.length,
      totalDatasets: stats.totalDatasets,
      tool: EVALUATOR_CONFIG[evaluationType].title
    },
    modelMetadata: modelMetadata.models,
    overallAssessment: overallAssessment,
    results: results,
    summary: stats
  };
}

async function detectAvailableDatasets(datasetsDir: string, filterType?: EvaluationType): Promise<Record<EvaluationType, boolean>> {
  try {
    const files = await readdir(datasetsDir);
    const result: Record<string, boolean> = {};
    
    for (const [type, config] of Object.entries(EVALUATOR_CONFIG)) {
      // If filter specified, only check for that type
      if (filterType && type !== filterType) {
        result[type] = false;
      } else {
        result[type] = files.some(file => file.startsWith(config.prefix));
      }
    }
    
    return result as Record<EvaluationType, boolean>;
  } catch (error) {
    console.warn('Could not read datasets directory, assuming no datasets available');
    const result: Record<string, boolean> = {};
    for (const type of Object.keys(EVALUATOR_CONFIG)) {
      result[type] = false;
    }
    return result as Record<EvaluationType, boolean>;
  }
}

async function runEvaluation(evaluatorType: EvaluationType, datasetsDir: string, modelMetadata: any) {
  const EvaluatorClass = EVALUATOR_CONFIG[evaluatorType].evaluator;
  const evaluator = new EvaluatorClass(datasetsDir);
  
  console.log(`\n🔬 Starting ${evaluatorType.charAt(0).toUpperCase() + evaluatorType.slice(1)} Evaluation\n`);
  
  // Show dataset stats
  console.log('📊 Dataset Analysis:');
  const stats = evaluator.getDatasetStats();
  console.log(`- Total datasets: ${stats.totalDatasets}`);
  console.log(`- Available models: ${stats.availableModels.join(', ')}`);
  console.log(`- Scenarios with multiple models: ${stats.scenariosWithMultipleModels}`);
  console.log(`- Interaction types: ${stats.interactionTypes.join(', ')}`);
  console.log();
  
  // Show evaluation phases
  console.log('🎯 Evaluation Phases:');
  const phases = evaluator.getEvaluationPhases();
  phases.forEach(phase => {
    console.log(`- ${phase.phase}: ${phase.description}`);
    console.log(`  Models: ${phase.availableModels.join(', ')}`);
    console.log(`  Scenarios: ${phase.scenarioCount}`);
    console.log();
  });
  
  // Run comparative evaluation on all scenarios
  console.log('🚀 Running Comparative Evaluation...\n');
  
  const results = await evaluator.evaluateAllScenarios();
  
  console.log(`✅ ${evaluatorType.charAt(0).toUpperCase() + evaluatorType.slice(1)} Evaluation Complete! Analyzed ${results.length} scenarios\n`);
  
  // Conduct final assessment across all scenarios
  const finalAssessment = await evaluator.conductFinalAssessment(results);
  
  // Generate dual-format reports using final assessment
  const reportContent = generateMarkdownReport(results, stats, evaluatorType, finalAssessment);
  const jsonResults = generateJsonReport(results, stats, evaluatorType, modelMetadata, finalAssessment);
  
  // Save reports to files
  const dateStamp = new Date().toISOString().split('T')[0];
  const markdownPath = `./eval/analysis/individual/${evaluatorType}-evaluation-${dateStamp}.md`;
  const jsonPath = `./eval/analysis/individual/${evaluatorType}-results-${dateStamp}.json`;
  const reportDir = './eval/analysis/individual';
  
  // Ensure report directory exists
  const fs = await import('fs');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  fs.writeFileSync(markdownPath, reportContent);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonResults, null, 2));
  
  console.log(`📊 ${evaluatorType.charAt(0).toUpperCase() + evaluatorType.slice(1)} reports generated:`);
  console.log(`   📝 Markdown: ${markdownPath}`);
  console.log(`   📄 JSON: ${jsonPath}`);
  
  // Brief console summary
  console.log(`🏆 ${evaluatorType.charAt(0).toUpperCase() + evaluatorType.slice(1)} Results:`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ${result.key}: ${result.bestModel} (${result.score})`);
  });
  
  return results;
}

async function main() {
  console.log('🔬 Starting Multi-Model Comparative Evaluation\n');
  
  // Clean old debug files but preserve evaluation datasets
  console.log('🧹 Cleaning old debug files...');
  try {
    await execAsync('find ./tmp/debug-ai -type f ! -name \'*.jsonl\' -delete 2>/dev/null || true');
    await execAsync('mkdir -p ./tmp/debug-ai');
    console.log('✅ Debug files cleaned (datasets preserved)\n');
  } catch (error) {
    console.warn('⚠️  Could not clean debug files:', error instanceof Error ? error.message : String(error));
  }
  
  // Check model metadata freshness before starting any evaluation work
  const modelMetadata = loadModelMetadata();
  
  const datasetsDir = './eval/datasets';
  
  // Parse command line arguments for subset evaluation
  const args = process.argv.slice(2);
  let filterType: EvaluationType | undefined = undefined;
  
  if (args.length > 0) {
    const requestedType = args[0];
    if (requestedType in EVALUATOR_CONFIG) {
      filterType = requestedType as EvaluationType;
    } else {
      console.error(`❌ Invalid evaluation type: "${requestedType}"`);
      console.error(`✅ Available types: ${Object.keys(EVALUATOR_CONFIG).join(', ')}`);
      process.exit(1);
    }
  }
  
  const availableDatasets = await detectAvailableDatasets(datasetsDir, filterType);
  
  console.log('🔍 Dataset Detection:');
  for (const [type, available] of Object.entries(availableDatasets)) {
    console.log(`- ${type.charAt(0).toUpperCase() + type.slice(1)} datasets: ${available ? '✅' : '❌'}`);
  }
  
  if (filterType) {
    console.log(`\n🎯 Running evaluation for: ${filterType}`);
  }
  
  const hasAnyDatasets = Object.values(availableDatasets).some(Boolean);
  if (!hasAnyDatasets) {
    if (filterType) {
      console.error(`❌ No datasets found for type: ${filterType}`);
    } else {
      console.error('❌ No evaluation datasets found. Please run integration tests first to generate datasets.');
    }
    process.exit(1);
  }
  
  try {
    const allResults = [];
    
    // If filterType is specified, only run that evaluation type
    if (filterType) {
      if (availableDatasets[filterType]) {
        const results = await runEvaluation(filterType, datasetsDir, modelMetadata);
        allResults.push(...results);
      } else {
        console.error(`❌ No datasets available for type: ${filterType}`);
        process.exit(1);
      }
    } else {
      // Run all available evaluations
      for (const [type, available] of Object.entries(availableDatasets)) {
        if (available) {
          const results = await runEvaluation(type as EvaluationType, datasetsDir, modelMetadata);
          allResults.push(...results);
        }
      }
    }
    
    console.log(`\n🎉 All Evaluations Complete! Total scenarios analyzed: ${allResults.length}`);
    console.log(`📁 Check ./eval/reports/ for detailed analysis reports\n`);
    
  } catch (error) {
    console.error('❌ Evaluation failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}