/**
 * Unified Creation Session Manager
 * 
 * Handles step-by-step creation workflow for both patterns and policies
 * with context-aware questions and AI-powered trigger expansion.
 * Loads prompts from markdown files following CLAUDE.md guidelines.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getAndValidateSessionDirectory } from './session-utils';
import { loadPrompt } from './shared-prompt-loader';
import { 
  UnifiedCreationSession, 
  UnifiedWorkflowStepResponse,
  UnifiedWorkflowCompletionResponse,
  EntityType,
  WorkflowConfig,
  WORKFLOW_CONFIGS,
  getNextStep
} from './unified-creation-types';
import { CreatePatternRequest } from './pattern-types';
import { PolicyIntent } from './organizational-types';
import { createPattern } from './pattern-operations';

export class UnifiedCreationSessionManager {
  private config: WorkflowConfig;
  
  constructor(entityType: EntityType) {
    this.config = WORKFLOW_CONFIGS[entityType];
  }
  
  /**
   * Create a new creation session
   */
  createSession(args: any): UnifiedCreationSession {
    // Validate session directory exists
    getAndValidateSessionDirectory(args, true);
    const sessionId = this.generateSessionId();
    
    const session: UnifiedCreationSession = {
      sessionId,
      entityType: this.config.entityType,
      currentStep: this.config.steps[0], // Start with first step
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: {}
    };
    
    this.saveSession(session, args);
    return session;
  }
  
  /**
   * Load existing session
   */
  loadSession(sessionId: string, args: any): UnifiedCreationSession | null {
    try {
      const sessionDir = getAndValidateSessionDirectory(args, false);
      const sessionFile = path.join(sessionDir, `${this.config.entityType}-sessions`, `${sessionId}.json`);
      
      if (!fs.existsSync(sessionFile)) {
        return null;
      }
      
      const sessionData = fs.readFileSync(sessionFile, 'utf8');
      return JSON.parse(sessionData) as UnifiedCreationSession;
    } catch (error) {
      console.error(`Failed to load ${this.config.entityType} session ${sessionId}:`, error);
      return null;
    }
  }
  
  /**
   * Process user response and advance session
   */
  processResponse(sessionId: string, response: string, args: any): UnifiedCreationSession {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      throw new Error(`${this.config.displayName} session ${sessionId} not found`);
    }
    
    // Process response based on current step
    switch (session.currentStep) {
      case 'description':
        session.data.description = response.trim();
        session.currentStep = getNextStep('description', this.config)!;
        break;
        
      case 'triggers':
        session.data.initialTriggers = response.split(',').map(t => t.trim()).filter(t => t.length > 0);
        session.currentStep = getNextStep('triggers', this.config)!;
        break;
        
      case 'trigger-expansion':
        // Parse JSON response for confirmed triggers
        try {
          const confirmed = JSON.parse(response);
          session.data.expandedTriggers = confirmed;
          session.currentStep = getNextStep('trigger-expansion', this.config)!;
        } catch (error) {
          // If not JSON, treat as comma-separated list
          session.data.expandedTriggers = response.split(',').map(t => t.trim()).filter(t => t.length > 0);
          session.currentStep = getNextStep('trigger-expansion', this.config)!;
        }
        break;
        
      case 'resources':
        if (this.config.entityType === 'pattern') {
          session.data.suggestedResources = response.split(',').map(r => r.trim()).filter(r => r.length > 0);
          session.currentStep = getNextStep('resources', this.config)!;
        }
        break;
        
      case 'rationale':
        session.data.rationale = response.trim();
        session.currentStep = getNextStep('rationale', this.config)!;
        break;
        
      case 'created-by':
        session.data.createdBy = response.trim();
        session.currentStep = getNextStep('created-by', this.config)!;
        break;
        
      case 'review':
        // User confirmed, move to complete
        session.currentStep = 'complete';
        break;
        
      default:
        throw new Error(`Unknown step: ${session.currentStep}`);
    }
    
    session.updatedAt = new Date().toISOString();
    this.saveSession(session, args);
    
    return session;
  }
  
  /**
   * Generate next workflow step
   */
  getNextWorkflowStep(session: UnifiedCreationSession): UnifiedWorkflowStepResponse | UnifiedWorkflowCompletionResponse {
    const sessionId = session.sessionId;
    
    switch (session.currentStep) {
      case 'description':
        return {
          sessionId,
          entityType: this.config.entityType,
          step: 'description',
          prompt: loadPrompt(`${this.config.entityType}-description`),
          instruction: `Wait for the user to provide a description of the ${this.config.displayName.toLowerCase()}. Once received, call this tool again with their response.`,
          nextStep: getNextStep('description', this.config) || undefined
        };
        
      case 'triggers':
        return {
          sessionId,
          entityType: this.config.entityType,
          step: 'triggers',
          prompt: loadPrompt(`${this.config.entityType}-triggers`),
          instruction: `Wait for the user to provide trigger keywords. If they provide a description instead of specific keywords (like "triggered by any app" or "for databases"), convert it to actual keywords (like "app, application, service, workload" or "database, DB, postgres, mysql") and ask them "I converted your description to these keywords: [keywords]. Does that look right?" Wait for their confirmation, then call this tool again with the confirmed comma-separated keywords.`,
          nextStep: getNextStep('triggers', this.config) || undefined
        };
        
      case 'trigger-expansion':
        return this.generateTriggerExpansionStep(session);
        
      case 'resources':
        if (this.config.entityType === 'pattern') {
          return {
            sessionId,
            entityType: this.config.entityType,
            step: 'resources',
            prompt: loadPrompt(`${this.config.entityType}-resources`, { description: session.data.description || '' }),
            instruction: 'Wait for the user to provide Kubernetes resource types. Once received, call this tool again with their comma-separated response.',
            nextStep: getNextStep('resources', this.config) || undefined
          };
        }
        // If not pattern, skip to next step
        return this.getNextWorkflowStep({ ...session, currentStep: getNextStep('resources', this.config)! });
        
      case 'rationale':
        return {
          sessionId,
          entityType: this.config.entityType,
          step: 'rationale',
          prompt: loadPrompt(`${this.config.entityType}-rationale`, { description: session.data.description || '' }),
          instruction: `Wait for the user to provide the rationale. Once received, call this tool again with their response.`,
          nextStep: getNextStep('rationale', this.config) || undefined
        };
        
      case 'created-by':
        return {
          sessionId,
          entityType: this.config.entityType,
          step: 'created-by',
          prompt: loadPrompt(`${this.config.entityType}-created-by`),
          instruction: 'Wait for the user to provide creator information. Once received, call this tool again with their response.',
          nextStep: getNextStep('created-by', this.config) || undefined
        };
        
      case 'review':
        return this.generateReviewStep(session);
        
      case 'complete':
        return this.completeWorkflow(session);
        
      default:
        throw new Error(`Unknown step: ${session.currentStep}`);
    }
  }
  
  /**
   * Generate trigger expansion step with AI suggestions
   */
  private generateTriggerExpansionStep(session: UnifiedCreationSession): UnifiedWorkflowStepResponse {
    const description = session.data.description || '';
    const initialTriggers = session.data.initialTriggers || [];
    
    const prompt = loadPrompt(`${this.config.entityType}-trigger-expansion`, {
      description,
      initialTriggers: initialTriggers.join(', ')
    });
    
    return {
      sessionId: session.sessionId,
      entityType: this.config.entityType,
      step: 'trigger-expansion',
      prompt,
      instruction: `Use AI to generate trigger suggestions based on the ${this.config.displayName.toLowerCase()} description and initial triggers. Present them to the user for confirmation. Based on their response: if they say "include all" or "all", send back ALL the suggested terms as a comma-separated list. If they say "skip" or "none", send back only the original triggers. If they specify specific terms, send back the original triggers plus their selected terms as a comma-separated list. Do not send their raw response - send the actual final trigger list.`,
      nextStep: getNextStep('trigger-expansion', this.config) || undefined,
      data: { initialTriggers, description }
    };
  }
  
  /**
   * Generate review step showing all collected data
   */
  private generateReviewStep(session: UnifiedCreationSession): UnifiedWorkflowStepResponse {
    const data = session.data;
    const finalTriggers = data.expandedTriggers || data.initialTriggers || [];
    
    const templateData: any = {
      description: data.description,
      triggers: finalTriggers.join(', '),
      rationale: data.rationale,
      createdBy: data.createdBy
    };
    
    if (this.config.entityType === 'pattern') {
      templateData.resources = data.suggestedResources?.join(', ') || 'None specified';
    }
    
    const prompt = loadPrompt(`${this.config.entityType}-review`, templateData);
    
    return {
      sessionId: session.sessionId,
      entityType: this.config.entityType,
      step: 'review',
      prompt,
      instruction: `Present the ${this.config.displayName.toLowerCase()} information for user review. Wait for their confirmation. If they say 'yes' or 'looks good' or similar, call this tool again with 'confirmed'. If they want to make changes, handle the corrections and then call this tool again with 'confirmed' when ready.`,
      nextStep: 'complete',
      data: session.data
    };
  }
  
  /**
   * Complete the workflow and create the entity
   */
  private completeWorkflow(session: UnifiedCreationSession): UnifiedWorkflowCompletionResponse {
    try {
      const finalTriggers = session.data.expandedTriggers || session.data.initialTriggers || [];
      
      if (this.config.entityType === 'pattern') {
        const request: CreatePatternRequest = {
          description: session.data.description!,
          triggers: finalTriggers,
          suggestedResources: session.data.suggestedResources!,
          rationale: session.data.rationale!,
          createdBy: session.data.createdBy!
        };
        
        const pattern = createPattern(request);
        
        const prompt = loadPrompt('pattern-complete-success', {
          patternId: pattern.id,
          description: pattern.description,
          triggers: pattern.triggers.join(', '),
          resources: pattern.suggestedResources.join(', ')
        });
        
        return {
          sessionId: session.sessionId,
          entityType: this.config.entityType,
          instruction: prompt,
          data: { pattern }
        };
      } else {
        // Policy creation
        const policy: PolicyIntent = {
          id: randomUUID(),
          description: session.data.description!,
          triggers: finalTriggers,
          rationale: session.data.rationale!,
          createdAt: new Date().toISOString(),
          createdBy: session.data.createdBy!,
          deployedPolicies: []
        };
        
        const prompt = loadPrompt('policy-complete-success', {
          description: policy.description,
          triggers: policy.triggers.join(', '),
          rationale: policy.rationale
        });
        
        return {
          sessionId: session.sessionId,
          entityType: this.config.entityType,
          instruction: prompt,
          data: { policy }
        };
      }
    } catch (error) {
      const errorPrompt = loadPrompt(`${this.config.entityType}-complete-error`, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        instruction: errorPrompt,
        data: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  
  
  /**
   * Save session to file
   */
  private saveSession(session: UnifiedCreationSession, args: any): void {
    try {
      const sessionDir = getAndValidateSessionDirectory(args, true);
      const entitySessionsDir = path.join(sessionDir, `${this.config.entityType}-sessions`);
      
      if (!fs.existsSync(entitySessionsDir)) {
        fs.mkdirSync(entitySessionsDir, { recursive: true });
      }
      
      const sessionFile = path.join(entitySessionsDir, `${session.sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
    } catch (error) {
      throw new Error(`Failed to save ${this.config.displayName.toLowerCase()} session: ${error}`);
    }
  }
  
  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${this.config.entityType}-${Date.now()}-${randomUUID().substring(0, 8)}`;
  }
}