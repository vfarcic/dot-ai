/**
 * Remediation Accuracy Evaluator
 * 
 * Specialized evaluator for Kubernetes troubleshooting scenarios
 * Uses model-graded evaluation following OpenAI Evals standards
 */

import { StandardEvaluator, EvaluationScore, EvaluationSample } from './base.js';
import { VercelProvider } from '../../core/providers/vercel-provider';
import { getCurrentModel } from '../../core/model-config';
import { extractJsonFromAIResponse } from '../../core/platform-utils';

export class RemediationAccuracyEvaluator extends StandardEvaluator {
  readonly name = 'remediation_accuracy';
  readonly description = 'Evaluates accuracy of Kubernetes troubleshooting analysis and solutions';

  private evaluatorModel: VercelProvider;

  constructor() {
    super();
    // Use Claude via VercelProvider as the evaluator (using same model version as system)
    this.evaluatorModel = new VercelProvider({
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: getCurrentModel('anthropic') // Use centralized model config
    });
  }

  async evaluate(sample: EvaluationSample): Promise<EvaluationScore> {
    const { input, output, ideal } = sample;

    // Domain-specific evaluation prompt for troubleshooting
    const gradingPrompt = `You are evaluating a Kubernetes troubleshooting response. You are an expert in Kubernetes operations and diagnosis.

TROUBLESHOOTING SCENARIO:
User Issue: "${input.issue}"

AI RESPONSE TO EVALUATE:
${output}

EXPECTED SOLUTION BENCHMARK:
- Root Cause: ${ideal.root_cause}
- Solution Category: ${ideal.solution_category}
- Expected Diagnostic Commands: ${ideal.diagnostic_commands.join(', ')}
- Expected Remediation Actions: ${ideal.remediation_actions.join(', ')}

EVALUATION CRITERIA FOR KUBERNETES TROUBLESHOOTING:
1. Root Cause Identification (0-1): Did the AI correctly identify the underlying issue?
2. Diagnostic Approach (0-1): Are the diagnostic steps logical, comprehensive, and following Kubernetes best practices?
3. Solution Quality (0-1): Are the remediation actions appropriate, safe, and likely to resolve the issue?
4. Command Accuracy (0-1): Are kubectl commands syntactically correct and appropriate for the diagnosis?

Analyze the AI response against these criteria and return ONLY a JSON object:
{
  "root_cause_identification": <score 0-1>,
  "diagnostic_approach": <score 0-1>,
  "solution_quality": <score 0-1>,
  "command_accuracy": <score 0-1>,
  "overall_score": <average of all four scores>,
  "reasoning": "<2-3 sentence explanation focusing on what the AI did well or missed>"
}`;

    try {
      const response = await this.evaluatorModel.sendMessage(gradingPrompt);
      
      // Extract JSON from AI response with robust parsing
      const evaluation = extractJsonFromAIResponse(response.content);

      return {
        key: this.name,
        score: evaluation.overall_score || 0,
        comment: evaluation.reasoning || 'No reasoning provided',
        confidence: 0.9 // High confidence for model-graded evaluation with domain expertise
      };
    } catch (error) {
      console.error('Remediation evaluation failed:', error);
      return {
        key: this.name,
        score: 0,
        comment: `Evaluation error: ${error}`,
        confidence: 0
      };
    }
  }
}