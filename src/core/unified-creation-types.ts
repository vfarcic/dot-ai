/**
 * Unified Creation Workflow Types
 * 
 * Generic workflow system that handles both patterns and policies
 * with configurable steps and entity-specific behavior.
 */

export type WorkflowStep = 
  | 'description'
  | 'triggers' 
  | 'trigger-expansion'
  | 'resources'
  | 'rationale'
  | 'created-by'
  | 'namespace-scope'
  | 'kyverno-generation'
  | 'review'
  | 'apply-save-discard'
  | 'complete';

export type EntityType = 'pattern' | 'policy';

export interface WorkflowConfig {
  entityType: EntityType;
  steps: WorkflowStep[];
  displayName: string;
}

export interface UnifiedCreationSession {
  sessionId: string;
  entityType: EntityType;
  currentStep: WorkflowStep;
  createdAt: string;
  updatedAt: string;
  
  // Collected data - flexible to accommodate both patterns and policies
  data: {
    description?: string;
    initialTriggers?: string[];
    expandedTriggers?: string[];
    suggestedResources?: string[]; // Only used for patterns
    rationale?: string;
    createdBy?: string;
    source?: string;
    // Kyverno generation data (only used for policies)
    policyId?: string; // Generated once during kyverno-generation step for consistency
    generatedKyvernoPolicy?: string;
    kyvernoGenerationError?: string;
    kyvernoGenerationSkipped?: boolean; // True when Kyverno is not available
    kyvernoSkipReason?: string; // Reason why Kyverno generation was skipped
    deploymentChoice?: string; // 'policy-only', 'apply', 'save', 'discard'
    // Namespace scope data (only used for policies)
    namespaceScope?: {
      type: 'all' | 'include' | 'exclude';
      namespaces?: string[];  // Selected namespace names
    };
    // Capabilities collection name (for policy testing with pre-populated data)
    capabilitiesCollection?: string; // Collection to use for capability search (default: 'capabilities')
  };
}

export interface UnifiedWorkflowStepResponse {
  sessionId: string;
  entityType: EntityType;
  prompt?: string;
  instruction: string;
  nextStep?: WorkflowStep;
  data?: any;
}

export interface UnifiedWorkflowCompletionResponse {
  sessionId: string;
  entityType: EntityType;
  instruction: string;
  data?: any;
}

// Pattern workflow - unchanged, no Kyverno generation needed
const PATTERN_WORKFLOW: WorkflowStep[] = [
  'description', 
  'triggers', 
  'trigger-expansion', 
  'resources',
  'rationale', 
  'created-by', 
  'review', 
  'complete'
];

// Policy workflow - includes Kyverno generation after data collection
const POLICY_WORKFLOW: WorkflowStep[] = [
  'description', 
  'triggers', 
  'trigger-expansion', 
  'rationale', 
  'created-by',
  'namespace-scope',
  'kyverno-generation',
  'review', 
  'complete'
];

// Predefined workflow configurations
export const WORKFLOW_CONFIGS: Record<EntityType, WorkflowConfig> = {
  pattern: {
    entityType: 'pattern',
    steps: PATTERN_WORKFLOW,
    displayName: 'Pattern'
  },
  policy: {
    entityType: 'policy',
    steps: POLICY_WORKFLOW,
    displayName: 'Policy Intent'
  }
};

// Helper functions
export function requiresResources(config: WorkflowConfig): boolean {
  return config.steps.includes('resources');
}

export function getNextStep(currentStep: WorkflowStep, config: WorkflowConfig): WorkflowStep | null {
  const currentIndex = config.steps.indexOf(currentStep);
  const nextIndex = currentIndex + 1;
  return nextIndex < config.steps.length ? config.steps[nextIndex] : null;
}

export function getPreviousStep(currentStep: WorkflowStep, config: WorkflowConfig): WorkflowStep | null {
  const currentIndex = config.steps.indexOf(currentStep);
  return currentIndex > 0 ? config.steps[currentIndex - 1] : null;
}