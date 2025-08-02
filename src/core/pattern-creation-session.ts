/**
 * Pattern Creation Session Manager
 * 
 * Handles step-by-step pattern creation workflow with context-aware questions
 * and AI-powered trigger expansion.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { getAndValidateSessionDirectory } from './session-utils';
import { 
  PatternCreationSession, 
  PatternWorkflowStep 
} from './pattern-creation-types';
import { CreatePatternRequest } from './pattern-types';
import { createPattern } from './pattern-operations';

export class PatternCreationSessionManager {
  
  /**
   * Create a new pattern creation session
   */
  createSession(args: any): PatternCreationSession {
    // Validate session directory exists
    getAndValidateSessionDirectory(args, true);
    const sessionId = this.generateSessionId();
    
    const session: PatternCreationSession = {
      sessionId,
      currentStep: 'description',
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
  loadSession(sessionId: string, args: any): PatternCreationSession | null {
    try {
      const sessionDir = getAndValidateSessionDirectory(args, false);
      const sessionFile = path.join(sessionDir, 'pattern-sessions', `${sessionId}.json`);
      
      if (!fs.existsSync(sessionFile)) {
        return null;
      }
      
      const content = fs.readFileSync(sessionFile, 'utf8');
      return JSON.parse(content) as PatternCreationSession;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Save session to disk
   */
  private saveSession(session: PatternCreationSession, args: any): void {
    const sessionDir = getAndValidateSessionDirectory(args, true);
    const sessionsDir = path.join(sessionDir, 'pattern-sessions');
    
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    
    const sessionFile = path.join(sessionsDir, `${session.sessionId}.json`);
    session.updatedAt = new Date().toISOString();
    
    fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  }
  
  /**
   * Process user response and move to next step
   */
  processResponse(sessionId: string, response: string, args: any): PatternWorkflowStep | null {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      return null;
    }
    
    // Process response based on current step
    switch (session.currentStep) {
      case 'description':
        session.data.description = response.trim();
        session.currentStep = 'triggers';
        break;
        
      case 'triggers':
        session.data.initialTriggers = response.split(',').map(t => t.trim()).filter(t => t.length > 0);
        session.currentStep = 'trigger-expansion';
        break;
        
      case 'trigger-expansion':
        // Parse JSON response for confirmed triggers
        try {
          const confirmed = JSON.parse(response);
          session.data.expandedTriggers = confirmed;
          session.currentStep = 'resources';
        } catch (error) {
          // If not JSON, treat as comma-separated
          session.data.expandedTriggers = response.split(',').map(t => t.trim()).filter(t => t.length > 0);
          session.currentStep = 'resources';
        }
        break;
        
      case 'resources':
        session.data.suggestedResources = response.split(',').map(r => r.trim()).filter(r => r.length > 0);
        session.currentStep = 'rationale';
        break;
        
      case 'rationale':
        session.data.rationale = response.trim();
        session.currentStep = 'created-by';
        break;
        
      case 'created-by':
        session.data.createdBy = response.trim();
        session.currentStep = 'review';
        break;
        
      case 'review':
        if (response.toLowerCase().includes('confirm') || response.toLowerCase().includes('yes')) {
          session.currentStep = 'complete';
        } else {
          // Allow user to go back or modify
          session.currentStep = 'description';
        }
        break;
        
      default:
        return null;
    }
    
    this.saveSession(session, args);
    return this.getNextStep(sessionId, args);
  }
  
  /**
   * Get the next workflow step for the session
   */
  getNextStep(sessionId: string, args: any): PatternWorkflowStep | null {
    const session = this.loadSession(sessionId, args);
    if (!session) {
      return null;
    }
    
    switch (session.currentStep) {
      case 'description':
        return {
          sessionId,
          step: 'description',
          prompt: 'Ask the user: "What deployment capability does this pattern provide? I need a capability name (2-4 words).\n\nExamples:\n- Specific: \\"Horizontal scaling\\", \\"Database persistence\\", \\"SSL termination\\"  \n- Broad/Organizational: \\"Application networking\\", \\"General security\\", \\"Basic monitoring\\"\n\nBoth specific and broad patterns are fine. What capability describes your pattern?"',
          instruction: 'Wait for the user to provide a capability name (2-4 words). Accept both specific capabilities (like "Database persistence") and broad organizational patterns (like "Application networking" or even "General security"). If they say just "app", suggest "Application deployment" or "General application". Then call this tool again with their response.',
          nextStep: 'triggers'
        };
        
      case 'triggers':
        return {
          sessionId,
          step: 'triggers',
          prompt: 'Ask the user: "What keywords or phrases should trigger this pattern? For example, if someone asks to \\"add scaling\\" or \\"make it scalable\\", this pattern should be suggested. Please provide keywords separated by commas."',
          instruction: 'Wait for the user to provide trigger keywords. If they provide a description instead of specific keywords (like "triggered by any app" or "for databases"), convert it to actual keywords (like "app, application, service, workload" or "database, DB, postgres, mysql") and ask them "I converted your description to these keywords: [keywords]. Does that look right?" Wait for their confirmation, then call this tool again with the confirmed comma-separated keywords.',
          nextStep: 'trigger-expansion'
        };
        
      case 'trigger-expansion':
        return this.generateTriggerExpansionStep(session);
        
      case 'resources':
        return {
          sessionId,
          step: 'resources',
          prompt: `Ask the user: "Which Kubernetes resources should be suggested for ${session.data.description}? Please list the resource types you want this pattern to suggest, separated by commas. For example: Deployment, Service, ConfigMap or StatefulSet, PersistentVolumeClaim, Secret."`,
          instruction: 'Wait for the user to select Kubernetes resources. Then call this tool again with their comma-separated response.',
          nextStep: 'rationale'
        };
        
      case 'rationale':
        return {
          sessionId,
          step: 'rationale',
          prompt: `Ask the user: "Why does this combination of resources work well together for ${session.data.description}? This helps others understand when and why to use this pattern."`,
          instruction: 'Wait for the user to provide their rationale explanation. Then call this tool again with their response.',
          nextStep: 'created-by'
        };
        
      case 'created-by':
        return {
          sessionId,
          step: 'created-by',
          prompt: 'Ask the user: "What is your name or team identifier? This helps track pattern ownership and allows others to contact you with questions."',
          instruction: 'Wait for the user to provide their identifier. Then call this tool again with their response.',
          nextStep: 'review'
        };
        
      case 'review':
        return {
          sessionId,
          step: 'review',
          prompt: this.generateReviewPrompt(session),
          instruction: 'Show the user the complete pattern summary and ask for confirmation. Then call this tool again with their response.',
          nextStep: 'complete'
        };
        
      case 'complete':
        return this.completePattern(session, args);
        
      default:
        return null;
    }
  }
  
  /**
   * Generate trigger expansion step with AI suggestions
   */
  private generateTriggerExpansionStep(session: PatternCreationSession): PatternWorkflowStep {
    const description = session.data.description || '';
    const initialTriggers = session.data.initialTriggers || [];
    
    return {
      sessionId: session.sessionId,
      step: 'trigger-expansion',
      prompt: `Based on the pattern "${description}" and initial triggers [${initialTriggers.join(', ')}], use AI to suggest additional related terms that should also trigger this pattern. Consider synonyms, abbreviations, and alternative phrasings. Present them as a list and ask the user to confirm which ones to include. For example:

"I found these additional terms that might also trigger your '${description}' pattern:
- application
- service  
- workload
- deploy
- deployment
- microservice
- container
- pod

Which of these should also trigger this pattern? You can:
1. Select specific ones: 'include: term1, term2, term3'  
2. Include all: 'include all'
3. Skip additions: 'skip' or 'none'

Your current triggers: ${initialTriggers.join(', ')}"

IMPORTANT: After the user responds, you must convert their response into the actual final trigger list (comma-separated) before calling this tool again. Do not send the user's raw response.`,
      instruction: 'Use AI to generate trigger suggestions based on the pattern description and initial triggers. Present them to the user for confirmation. Based on their response: if they say "include all" or "all", send back ALL the suggested terms as a comma-separated list. If they say "skip" or "none", send back only the original triggers. If they specify specific terms, send back the original triggers plus their selected terms as a comma-separated list. Do not send their raw response - send the actual final trigger list.',
      nextStep: 'resources',
      data: { initialTriggers, description }
    };
  }
  
  /**
   * Generate review prompt showing complete pattern
   */
  private generateReviewPrompt(session: PatternCreationSession): string {
    const data = session.data;
    return `Please review your pattern:

**Description**: ${data.description}
**Triggers**: ${(data.expandedTriggers || data.initialTriggers || []).join(', ')}
**Suggested Resources**: ${(data.suggestedResources || []).join(', ')}
**Rationale**: ${data.rationale}
**Created By**: ${data.createdBy}

Does this look correct? Type 'confirm' to create the pattern, or 'modify' to make changes.`;
  }
  
  /**
   * Complete pattern creation and return success result
   */
  private completePattern(session: PatternCreationSession, _args: any): PatternWorkflowStep {
    try {
      const request: CreatePatternRequest = {
        description: session.data.description!,
        triggers: session.data.expandedTriggers || session.data.initialTriggers || [],
        suggestedResources: session.data.suggestedResources!,
        rationale: session.data.rationale!,
        createdBy: session.data.createdBy!
      };
      
      const pattern = createPattern(request);
      
      // Pattern will be saved to Vector DB by the organizational-data tool
      // No need to save to files here - that's handled in the tool layer
      
      return {
        sessionId: session.sessionId,
        step: 'complete',
        prompt: `Pattern created successfully! 

**Pattern ID**: ${pattern.id}
**Description**: ${pattern.description}
**Triggers**: ${pattern.triggers.join(', ')}
**Resources**: ${pattern.suggestedResources.join(', ')}

The pattern is now ready to enhance AI recommendations. When users ask for deployments matching your triggers, this pattern will suggest the specified Kubernetes resources.`,
        instruction: 'Pattern creation completed successfully. The pattern has been saved and is ready for use.',
        data: { pattern }
      };
      
    } catch (error) {
      return {
        sessionId: session.sessionId,
        step: 'complete',
        prompt: `Error creating pattern: ${error instanceof Error ? error.message : String(error)}`,
        instruction: 'Pattern creation failed. Please check the error message and try again.',
        data: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
  
  private generateSessionId(): string {
    return `pattern_${Date.now()}_${randomUUID().substring(0, 8)}`;
  }
}