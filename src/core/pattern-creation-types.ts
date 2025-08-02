/**
 * Pattern Creation Workflow Types
 * 
 * Defines the step-by-step workflow for creating organizational patterns
 * with context-aware questions and validation.
 */

export type PatternCreationStep = 
  | 'description'
  | 'triggers' 
  | 'trigger-expansion'
  | 'resources'
  | 'rationale'
  | 'created-by'
  | 'review'
  | 'complete';

export interface PatternCreationSession {
  sessionId: string;
  currentStep: PatternCreationStep;
  createdAt: string;
  updatedAt: string;
  
  // Collected data
  data: {
    description?: string;
    initialTriggers?: string[];
    expandedTriggers?: string[];
    suggestedResources?: string[];
    rationale?: string;
    createdBy?: string;
  };
}

export interface PatternWorkflowStep {
  sessionId: string;
  step: PatternCreationStep;
  prompt: string;
  instruction: string;
  nextStep?: PatternCreationStep;
  data?: any;
}