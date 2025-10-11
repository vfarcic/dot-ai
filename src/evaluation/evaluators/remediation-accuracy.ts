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
import { readFileSync } from 'fs';
import { join } from 'path';

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
      model: getCurrentModel('anthropic'), // Use centralized model config
      debugMode: process.env.DEBUG_DOT_AI === 'true' // Enable debug logging for evaluation
    });
  }

  async evaluate(sample: EvaluationSample): Promise<EvaluationScore> {
    const { input, output, ideal } = sample;

    // Load markdown prompt template from file and replace placeholders
    const promptPath = join(process.cwd(), 'src', 'evaluation', 'prompts', 'remediation-accuracy.md');
    const template = readFileSync(promptPath, 'utf8');
    
    const gradingPrompt = template
      .replace('{issue}', input.issue || 'Unknown issue')
      .replace('{ai_response}', output)
      .replace('{expected_root_cause}', ideal?.root_cause || 'Not specified')
      .replace('{expected_solution_category}', ideal?.solution_category || 'Not specified')
      .replace('{expected_diagnostic_commands}', ideal?.diagnostic_commands?.join(', ') || 'Not specified')
      .replace('{expected_remediation_actions}', ideal?.remediation_actions?.join(', ') || 'Not specified');

    try {
      const response = await this.evaluatorModel.sendMessage(
        gradingPrompt, 
        'remediation-evaluation' // Clear operation name for debug files
      );
      
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