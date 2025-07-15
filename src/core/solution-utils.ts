/**
 * Solution utilities for working with solution data structures
 */

/**
 * Extract all user answers from a solution's questions
 */
export function extractUserAnswers(solution: any): Record<string, any> {
  const userAnswers: Record<string, any> = {};
  
  // Extract from all question categories
  const questionCategories = ['required', 'basic', 'advanced'];
  for (const category of questionCategories) {
    const questions = solution.questions[category] || [];
    for (const question of questions) {
      if (question.answer !== undefined && question.answer !== null) {
        userAnswers[question.id] = question.answer;
      }
    }
  }
  
  // Include open answer if provided
  if (solution.questions.open?.answer) {
    userAnswers.open = solution.questions.open.answer;
  }
  
  return userAnswers;
}

/**
 * Sanitize intent string for use as Kubernetes label (63 char limit, alphanumeric + hyphens)
 */
export function sanitizeIntentForLabel(intent: string): string {
  return intent
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .substring(0, 63)
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate standard dot-ai labels for Kubernetes resources
 */
export function generateDotAiLabels(userAnswers: Record<string, any>, solution: any): Record<string, string> {
  const appName = userAnswers.name;
  const originalIntent = solution.intent;
  
  if (!appName) {
    throw new Error('Application name is required for dot-ai labels. This indicates a bug in the MCP workflow.');
  }
  
  if (!originalIntent) {
    throw new Error('Application intent is required for dot-ai labels. This indicates a bug in the solution data.');
  }
  
  return {
    'dot-ai.io/managed': 'true',
    'dot-ai.io/app-name': appName,
    'dot-ai.io/intent': sanitizeIntentForLabel(originalIntent)
  };
}

/**
 * Add dot-ai labels to existing labels object
 */
export function addDotAiLabels(
  existingLabels: Record<string, string> | undefined,
  userAnswers: Record<string, any>,
  solution: any
): Record<string, string> {
  const dotAiLabels = generateDotAiLabels(userAnswers, solution);
  return { ...existingLabels, ...dotAiLabels };
}