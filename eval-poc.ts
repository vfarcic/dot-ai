/**
 * Evaluation Proof of Concept
 * 
 * Tests our evaluation framework with a single remediation scenario
 * Compares multiple AI models on troubleshooting accuracy + performance
 */

import { EvaluationRunner } from './dist/evaluation/runner.js';
import { RemediationAccuracyEvaluator } from './dist/evaluation/evaluators/remediation-accuracy.js';
import { CURRENT_MODELS } from './dist/core/model-config.js';

// Mock API calls for proof of concept
// In real implementation, these would call actual /api/v1/tools/remediate
const mockModels = [
  {
    name: 'gpt-5',
    provider: 'openai',
    apiCall: async (input: Record<string, any>) => {
      // Simulate GPT-5 response
      return {
        output: `Based on the issue "${input.issue}", I've investigated the cluster and identified the following:

**Root Cause Analysis:**
The pod test-app-7d8c9f5b4-xm2k9 is experiencing Out of Memory (OOM) kills due to insufficient memory limits configured in the deployment.

**Evidence Found:**
- Pod restart count: 7 (indicating repeated crashes)
- Last termination reason: OOMKilled
- Container exit code: 137
- Memory limit: 128Mi, but process attempting to allocate ~250MB

**Diagnostic Commands Executed:**
\`\`\`bash
kubectl describe pod test-app-7d8c9f5b4-xm2k9 -n remediate-test
kubectl logs test-app-7d8c9f5b4-xm2k9 -n remediate-test --previous
kubectl top pod test-app-7d8c9f5b4-xm2k9 -n remediate-test
\`\`\`

**Recommended Remediation:**
1. Update deployment memory limits from 128Mi to 512Mi
2. Add memory requests (256Mi) for proper scheduling
3. Implement resource monitoring with alerts`,
        performance: {
          duration_ms: 8500,
          input_tokens: 450,
          output_tokens: 280,
          total_tokens: 730,
          cost_usd: 0.022,
          iterations: 2,
          tool_calls_executed: 4,
          model_version: CURRENT_MODELS.openai
        }
      };
    }
  },
  {
    name: 'claude-sonnet-4-5',
    provider: 'anthropic',
    apiCall: async (input: Record<string, any>) => {
      // Simulate Claude response
      return {
        output: `## Kubernetes Troubleshooting Analysis

**Issue:** Application crashing in remediate-test namespace

**Investigation Results:**
I've analyzed the failing pod test-app-648d5f7c9b-7k4mp and identified a clear memory constraint issue.

**Findings:**
- Pod status: CrashLoopBackOff
- Restart count: 12 restarts in the last 10 minutes
- Exit reason: OOMKilled (exit code 137)
- Current memory limit: 128Mi
- Actual memory usage at crash: ~250Mi

**Commands Used for Diagnosis:**
\`\`\`
kubectl get pods -n remediate-test -o wide
kubectl describe pod test-app-648d5f7c9b-7k4mp -n remediate-test
kubectl logs test-app-648d5f7c9b-7k4mp -n remediate-test --previous
kubectl top pod test-app-648d5f7c9b-7k4mp -n remediate-test
\`\`\`

**Root Cause:** Memory limit (128Mi) insufficient for application requirements

**Recommended Actions:**
1. Increase memory limit to 512Mi in deployment spec
2. Set memory request to 256Mi for proper scheduling
3. Add resource monitoring and alerting`,
        performance: {
          duration_ms: 6200,
          input_tokens: 420,
          output_tokens: 245,
          total_tokens: 665,
          cost_usd: 0.015,
          iterations: 1,
          tool_calls_executed: 3,
          model_version: CURRENT_MODELS.anthropic
        }
      };
    }
  }
];

async function runEvaluationProofOfConcept() {
  console.log('🧪 Starting Evaluation Proof of Concept');
  console.log('=' .repeat(50));

  const runner = new EvaluationRunner();
  const evaluator = new RemediationAccuracyEvaluator();

  const config = {
    datasetName: 'remediate',
    models: mockModels,
    evaluators: [evaluator],
    runs: 2 // Test non-determinism handling with 2 runs
  };

  try {
    const results = await runner.runEvaluation(config);
    
    console.log('\n📊 EVALUATION RESULTS');
    console.log('=' .repeat(50));
    
    for (const result of results) {
      console.log(`\n🤖 Model: ${result.model}`);
      console.log(`📊 Quality Score: ${result.quality_scores.remediation_accuracy.score.toFixed(3)}`);
      console.log(`⚡ Duration: ${result.performance.duration_ms}ms`);
      console.log(`💰 Cost: $${result.performance.cost_usd?.toFixed(4) || 'N/A'}`);
      console.log(`🎯 Quality/Second: ${result.efficiency.quality_per_second.toFixed(3)}`);
      console.log(`💡 Reasoning: ${result.quality_scores.remediation_accuracy.comment}`);
    }

    // Model comparison
    console.log('\n🏆 MODEL COMPARISON');
    console.log('=' .repeat(50));
    
    const sortedByQuality = results.sort((a, b) => 
      b.quality_scores.remediation_accuracy.score - a.quality_scores.remediation_accuracy.score
    );
    
    console.log('🎯 Best Quality:', sortedByQuality[0].model);
    
    const sortedBySpeed = results.sort((a, b) => a.performance.duration_ms - b.performance.duration_ms);
    console.log('⚡ Fastest:', sortedBySpeed[0].model);
    
    const sortedByEfficiency = results.sort((a, b) => 
      b.efficiency.quality_per_second - a.efficiency.quality_per_second
    );
    console.log('🏅 Best Efficiency:', sortedByEfficiency[0].model);

  } catch (error) {
    console.error('❌ Evaluation failed:', error);
  }
}

// Run the proof of concept
runEvaluationProofOfConcept().catch(console.error);