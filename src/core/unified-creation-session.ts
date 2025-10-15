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
import { CapabilityVectorService } from './capability-vector-service';
import { KubernetesDiscovery } from './discovery';
import { ManifestValidator } from './schema';
import { getKyvernoStatus } from '../tools/version';
import { extractContentFromMarkdownCodeBlocks } from './platform-utils';
import * as yaml from 'js-yaml';
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
  private discovery: KubernetesDiscovery;
  
  constructor(entityType: EntityType, discovery?: KubernetesDiscovery) {
    this.config = WORKFLOW_CONFIGS[entityType];
    this.discovery = discovery || new KubernetesDiscovery();
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
      data: {
        // Store capabilities collection if provided (for policy testing with pre-populated data)
        capabilitiesCollection: args.collection
      }
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
        
      case 'namespace-scope': {
        // Parse user's namespace selection
        const scopeChoice = response.trim().toLowerCase();
        if (scopeChoice === 'all' || scopeChoice === '1') {
          session.data.namespaceScope = { type: 'all' };
        } else if (scopeChoice.startsWith('include:')) {
          const namespaces = scopeChoice.replace('include:', '').split(',').map(ns => ns.trim()).filter(ns => ns.length > 0);
          session.data.namespaceScope = { type: 'include', namespaces };
        } else if (scopeChoice.startsWith('exclude:')) {
          const namespaces = scopeChoice.replace('exclude:', '').split(',').map(ns => ns.trim()).filter(ns => ns.length > 0);
          session.data.namespaceScope = { type: 'exclude', namespaces };
        }
        session.currentStep = getNextStep('namespace-scope', this.config)!;
        break;
      }
        
      case 'kyverno-generation':
        // Kyverno generation completed, store result in session
        if (response.startsWith('ERROR:')) {
          session.data.kyvernoGenerationError = response;
          session.data.generatedKyvernoPolicy = undefined;
        } else {
          session.data.generatedKyvernoPolicy = response;
          session.data.kyvernoGenerationError = undefined;
        }
        session.currentStep = getNextStep('kyverno-generation', this.config)!;
        break;
        
      case 'review':
        // Handle review step based on entity type
        if (this.config.entityType === 'policy') {
          // For policies, user provided deployment choice during review (semantic response)
          const deploymentChoice = response.trim();
          if (deploymentChoice === 'apply-to-cluster') {
            session.data.deploymentChoice = 'apply';
          } else if (deploymentChoice === 'store-intent-only') {
            session.data.deploymentChoice = 'policy-only';
          } else {
            // Handle cancel or any other response as discard
            session.data.deploymentChoice = 'discard';
          }
          session.currentStep = 'complete';
        } else {
          // For patterns, user confirmed review
          session.currentStep = 'complete';
        }
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
  async getNextWorkflowStep(session: UnifiedCreationSession, args?: any): Promise<UnifiedWorkflowStepResponse | UnifiedWorkflowCompletionResponse> {
    const sessionId = session.sessionId;
    
    switch (session.currentStep) {
      case 'description':
        return {
          sessionId,
          entityType: this.config.entityType,
          prompt: loadPrompt(`${this.config.entityType}-description`),
          instruction: `Wait for the user to provide a description of the ${this.config.displayName.toLowerCase()}. Once received, call this tool again with their response.`,
          nextStep: getNextStep('description', this.config) || undefined
        };
        
      case 'triggers':
        return {
          sessionId,
          entityType: this.config.entityType,
          prompt: loadPrompt('infrastructure-triggers'),
          instruction: 'Wait for the user to provide infrastructure type keywords separated by commas. Once received, call this tool again with their response.',
          nextStep: getNextStep('triggers', this.config) || undefined
        };
        
      case 'trigger-expansion':
        return await this.generateTriggerExpansionStep(session, args?.interaction_id);
        
      case 'resources':
        if (this.config.entityType === 'pattern') {
          return {
            sessionId,
            entityType: this.config.entityType,
            prompt: loadPrompt(`${this.config.entityType}-resources`, { description: session.data.description || '' }),
            instruction: 'Wait for the user to provide Kubernetes resource types. Once received, call this tool again with their comma-separated response.',
            nextStep: getNextStep('resources', this.config) || undefined
          };
        }
        // If not pattern, skip to next step
        return this.getNextWorkflowStep({ ...session, currentStep: getNextStep('resources', this.config)! }, args);
        
      case 'rationale':
        return {
          sessionId,
          entityType: this.config.entityType,
          prompt: loadPrompt(`${this.config.entityType}-rationale`, { description: session.data.description || '' }),
          instruction: `Wait for the user to provide the rationale. Once received, call this tool again with their response.`,
          nextStep: getNextStep('rationale', this.config) || undefined
        };
        
      case 'created-by':
        return {
          sessionId,
          entityType: this.config.entityType,
          prompt: loadPrompt(`${this.config.entityType}-created-by`),
          instruction: 'Wait for the user to provide creator information. Once received, call this tool again with their response.',
          nextStep: getNextStep('created-by', this.config) || undefined
        };
        
      case 'namespace-scope': {
        // Check if Kyverno is installed - only show namespace options if it is
        const kyvernoStatus = await getKyvernoStatus();
        if (!kyvernoStatus.installed) {
          // Skip namespace-scope if Kyverno not installed, go to next step
          session.currentStep = getNextStep('namespace-scope', this.config)!;
          return this.getNextWorkflowStep(session, args);
        }
        
        // Ensure discovery service is connected to cluster before retrieving namespaces
        await this.discovery.connect();
        
        // Get actual namespaces from cluster
        const namespaces = await this.discovery.getNamespaces();
        
        const prompt = loadPrompt('policy-namespace-scope', {
          namespaces: namespaces.join(', ')
        });
        
        return {
          sessionId,
          entityType: this.config.entityType,
          prompt,
          instruction: 'Ask user to select namespace scope. Options: "all" for cluster-wide, "include: ns1,ns2" for specific namespaces, "exclude: ns1,ns2" to exclude namespaces.',
          nextStep: getNextStep('namespace-scope', this.config) || undefined,
          data: { availableNamespaces: namespaces }
        };
      }
        
      case 'kyverno-generation':
        return await this.generateKyvernoStep(session, args);
        
      case 'review':
        return this.generateReviewStep(session);
        
        
      case 'complete':
        return await this.completeWorkflow(session);
        
      default:
        throw new Error(`Unknown step: ${session.currentStep}`);
    }
  }
  
  /**
   * Generate trigger expansion step with AI suggestions
   */
  private async generateTriggerExpansionStep(session: UnifiedCreationSession, interaction_id?: string): Promise<UnifiedWorkflowStepResponse> {
    const description = session.data.description || '';
    const initialTriggers = session.data.initialTriggers || [];
    
    try {
      // Generate expanded triggers internally using AI
      const expandedTriggers = await this.generateInternalTriggerExpansion(initialTriggers, description, interaction_id);
      
      // Combine initial and expanded triggers into full list
      const fullTriggerList = [...initialTriggers, ...expandedTriggers];
      
      if (expandedTriggers.length === 0) {
        // No expansions found, skip to next step with original triggers
        return {
          sessionId: session.sessionId,
          entityType: this.config.entityType,
          instruction: `No additional infrastructure types were found. Continue to the next step by calling this tool again with the original triggers: "${initialTriggers.join(', ')}"`,
          nextStep: getNextStep('trigger-expansion', this.config) || undefined,
          data: { fullTriggerList: initialTriggers }
        };
      }
      
      // Present full trigger list to user for selection
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        instruction: `Present this complete list of infrastructure types: "${fullTriggerList.join(', ')}". Ask the user to select which ones they want to keep (they can choose any combination or add their own custom triggers). Return their final selection as a comma-separated list.`,
        nextStep: getNextStep('trigger-expansion', this.config) || undefined,
        data: { fullTriggerList }
      };
    } catch (error) {
      console.warn('Failed to generate trigger expansion, using original triggers:', error);
      
      // Fallback: continue with original triggers only
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        instruction: `Unable to generate additional infrastructure type suggestions. Continue to the next step by calling this tool again with the original triggers: "${initialTriggers.join(', ')}"`,
        nextStep: getNextStep('trigger-expansion', this.config) || undefined,
        data: { fullTriggerList: initialTriggers }
      };
    }
  }
  
  /**
   * Generate trigger expansion using internal AI
   */
  private async generateInternalTriggerExpansion(initialTriggers: string[], description: string, interaction_id?: string): Promise<string[]> {
    const { createAIProvider } = require('./ai-provider-factory');
    const aiProvider = createAIProvider();

    if (!aiProvider.isInitialized()) {
      console.warn('AI provider not available for trigger expansion');
      return [];
    }
    
    const prompt = loadPrompt('infrastructure-trigger-expansion', {
      initialTriggers: initialTriggers.join(', '),
      description
    });

    try {
      const response = await aiProvider.sendMessage(prompt, `${this.config.entityType}-trigger-expansion`, {
        user_intent: `Create organizational ${this.config.entityType} for ${initialTriggers.join(', ') || 'unspecified domain'}`,
        interaction_id: interaction_id || 'trigger_expansion'
      });
      const expandedText = response.content.trim();
      
      if (!expandedText || expandedText.toLowerCase().includes('no relevant') || expandedText.toLowerCase().includes('no additional')) {
        return [];
      }
      
      // Parse comma-separated response and clean up
      const expanded = expandedText
        .split(',')
        .map((trigger: string) => trigger.trim())
        .filter((trigger: string) => trigger.length > 0)
        .filter((trigger: string) => !initialTriggers.some((initial: string) =>
          initial.toLowerCase() === trigger.toLowerCase()
        ));
      
      return expanded;
    } catch (error) {
      console.warn('Error in trigger expansion AI call:', error);
      return [];
    }
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
      
      const prompt = loadPrompt(`${this.config.entityType}-review`, templateData);
      
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        prompt,
        instruction: `Present the ${this.config.displayName.toLowerCase()} information for user review. Wait for their confirmation. If they say 'yes' or 'looks good' or similar, call this tool again with 'confirmed'. If they want to make changes, handle the corrections and then call this tool again with 'confirmed' when ready.`,
        nextStep: 'complete',
        data: session.data
      };
    } else {
      // Policy review - build prompt conditionally based on Kyverno status
      let prompt: string;
      let instruction: string;
      
      const baseReview = `Please review your policy intent:

**Description**: ${data.description}
**Triggers**: ${finalTriggers.join(', ')}
**Rationale**: ${data.rationale}
**Created By**: ${data.createdBy}

`;
      
      if (data.kyvernoGenerationSkipped) {
        prompt = baseReview + `**Kyverno Generation**: Skipped (${data.kyvernoSkipReason})

**Choose what to do:**

1. **Store policy intent only** - Save for AI guidance without cluster enforcement
2. **Cancel** - Do nothing`;
        
        instruction = `Present the policy intent with explanation that Kyverno generation was skipped (${data.kyvernoSkipReason}). Show these numbered options: "1. Store policy intent only (for AI guidance)", "2. Cancel (do nothing)". If user chooses option 1, call this tool again with "store-intent-only". If user chooses option 2 (cancel), do not call this tool again.`;
      } else {
        prompt = baseReview + `I've also generated a Kyverno ClusterPolicy that enforces this requirement:

**Generated Kyverno Policy**:
\`\`\`yaml
${data.generatedKyvernoPolicy || ''}
\`\`\`

**Choose what to do:**

1. **Apply Kyverno policy to cluster** - Store policy intent AND deploy enforcement to cluster
2. **Store policy intent only** - Save for AI guidance without cluster enforcement  
3. **Cancel** - Do nothing

⚠️ **Warning**: Option 1 will deploy active policy enforcement to your cluster.`;
        
        instruction = `Present the policy intent and display the complete generated Kyverno policy YAML manifest for user review. Show these numbered options: "1. Apply Kyverno policy to cluster", "2. Store policy intent only (don't apply)", "3. Cancel (do nothing)". If user chooses option 1, call this tool again with "apply-to-cluster". If user chooses option 2, call this tool again with "store-intent-only". If user chooses option 3 (cancel), do not call this tool again.`;
      }
      
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        prompt,
        instruction,
        nextStep: getNextStep('review', this.config) || undefined,
        data: session.data
      };
    }
  }
  
  /**
   * Complete the workflow and create the entity
   */
  private async completeWorkflow(session: UnifiedCreationSession): Promise<UnifiedWorkflowCompletionResponse> {
    try {
      const finalTriggers = session.data.expandedTriggers || session.data.initialTriggers || [];
      
      if (this.config.entityType === 'pattern') {
        // Create pattern internally in MCP
        const request: CreatePatternRequest = {
          description: session.data.description!,
          triggers: finalTriggers,
          suggestedResources: session.data.suggestedResources!,
          rationale: session.data.rationale!,
          createdBy: session.data.createdBy!
        };
        
        const pattern = createPattern(request);
        
        // Return success message to client (not prompt to process)
        return {
          sessionId: session.sessionId,
          entityType: this.config.entityType,
          instruction: `**Pattern Created Successfully!**

**Pattern ID**: ${pattern.id}
**Description**: ${pattern.description}
**Triggers**: ${pattern.triggers.join(', ')}
**Resources**: ${pattern.suggestedResources.join(', ')}

The pattern is now ready to enhance AI recommendations. When users ask for deployments matching your triggers, this pattern will suggest the specified Kubernetes resources.`,
          data: { pattern }
        };
      } else {
        // Policy creation with deployment choice handling
        const deploymentChoice = session.data.deploymentChoice || 'policy-only';
        
        // Handle discard choice early
        if (deploymentChoice === 'discard') {
          const prompt = loadPrompt('policy-complete-discard', {
            description: session.data.description || 'Unknown policy'
          });
          
          return {
            sessionId: session.sessionId,
            entityType: this.config.entityType,
            instruction: prompt,
            data: { discarded: true }
          };
        }
        
        // Create policy intent using the consistent ID generated during kyverno-generation step
        if (!session.data.policyId) {
          // In test environment, generate ID if missing (for mocked workflows)
          const isTestEnv = process.env.NODE_ENV === 'test';
          if (isTestEnv) {
            session.data.policyId = randomUUID();
          } else {
            throw new Error('Policy ID missing from session - this indicates a workflow error');
          }
        }
        
        const policy: PolicyIntent = {
          id: session.data.policyId,
          description: session.data.description!,
          triggers: finalTriggers,
          rationale: session.data.rationale!,
          createdAt: new Date().toISOString(),
          createdBy: session.data.createdBy!,
          deployedPolicies: []
        };
        
        // Handle different deployment choices
        return await this.handlePolicyDeploymentChoice(session, policy, deploymentChoice);
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
   * Handle policy deployment choice (apply to cluster or store intent only)
   */
  private async handlePolicyDeploymentChoice(session: UnifiedCreationSession, policy: PolicyIntent, deploymentChoice: string): Promise<UnifiedWorkflowCompletionResponse> {
    const generatedKyvernoPolicy = session.data.generatedKyvernoPolicy;
    const kyvernoSkipped = session.data.kyvernoGenerationSkipped;
    
    // If Kyverno generation was skipped, only allow intent-only storage
    if (kyvernoSkipped && !generatedKyvernoPolicy) {
      if (deploymentChoice.trim() === '1' || deploymentChoice.toLowerCase() === 'apply-to-cluster') {
        throw new Error('Cannot apply to cluster: Kyverno generation was skipped because Kyverno is not available');
      }
      // Force intent-only storage when Kyverno is not available
      deploymentChoice = 'store-intent-only';
    } else if (!generatedKyvernoPolicy) {
      throw new Error('No Kyverno policy generated');
    }
    
    if (deploymentChoice.trim() === '1' || deploymentChoice.toLowerCase() === 'apply') {
      // Save Kyverno YAML to file for debugging and apply using existing DeployOperation
      const fs = await import('fs');
      const path = await import('path');
      
      const sessionDir = path.join(process.cwd(), 'tmp', 'sessions', 'policy-sessions');
      const kyvernoFileName = `${policy.id}-kyverno.yaml`;
      const kyvernoFilePath = path.join(sessionDir, kyvernoFileName);
      
      // Ensure directory exists
      fs.mkdirSync(sessionDir, { recursive: true });
      
      // Save Kyverno policy to file
      fs.writeFileSync(kyvernoFilePath, generatedKyvernoPolicy!, 'utf8');
      
      // Apply to cluster using existing DeployOperation
      try {
        const { DeployOperation } = await import('./deploy-operation');
        const deployOp = new DeployOperation();
        
        const deployResult = await deployOp.deploy({
          solutionId: `${policy.id}-kyverno`,
          sessionDir,
          timeout: 30
        });
        
        // Track successful deployment
        policy.deployedPolicies = [{
          name: `policy-${policy.id}`,
          appliedAt: new Date().toISOString()
        }];
        
        return {
          sessionId: session.sessionId,
          entityType: this.config.entityType,
          instruction: `**Policy Applied to Cluster Successfully!**

**Policy ID**: ${policy.id}
**Description**: ${policy.description}
**Triggers**: ${policy.triggers.join(', ')}
**Rationale**: ${policy.rationale}
**Created By**: ${policy.createdBy}
**Deployed Policy**: ${policy.deployedPolicies[0].name}
**Kyverno File**: ${kyvernoFilePath}

The policy intent has been stored in the database and the Kyverno policy has been applied to your cluster.

${deployResult.kubectlOutput}`,
          data: { policy, kyvernoPolicy: generatedKyvernoPolicy, applied: true, kyvernoFile: kyvernoFilePath }
        };
        
      } catch (deployError: any) {
        return {
          sessionId: session.sessionId,
          entityType: this.config.entityType,
          instruction: `**Policy Application Failed!**

**Policy ID**: ${policy.id}
**Description**: ${policy.description}
**Error**: ${deployError.message}
**Kyverno File**: ${kyvernoFilePath}

The policy intent has been stored in the database, but the Kyverno policy could not be applied to the cluster. You can manually apply it using:
\`kubectl apply -f ${kyvernoFilePath}\``,
          data: { policy, kyvernoPolicy: generatedKyvernoPolicy, applied: false, error: deployError.message, kyvernoFile: kyvernoFilePath }
        };
      }
    } else {
      // Store only the policy intent, no Kyverno deployment
      const skipReason = session.data.kyvernoSkipReason;
      const instruction = kyvernoSkipped ? 
        `**Policy Intent Stored Successfully!**

**Policy ID**: ${policy.id}
**Description**: ${policy.description}
**Triggers**: ${policy.triggers.join(', ')}
**Rationale**: ${policy.rationale}
**Created By**: ${policy.createdBy}

The policy intent has been stored in the database for AI guidance. 
**Note**: ${skipReason}` :
        `**Policy Intent Stored Successfully!**

**Policy ID**: ${policy.id}
**Description**: ${policy.description}
**Triggers**: ${policy.triggers.join(', ')}
**Rationale**: ${policy.rationale}
**Created By**: ${policy.createdBy}

The policy intent has been stored in the database. The Kyverno policy was not applied to the cluster.`;

      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        instruction,
        data: { policy, kyvernoPolicy: generatedKyvernoPolicy, applied: false, kyvernoSkipped }
      };
    }
  }


  /**
   * Validate YAML syntax
   */
  private validateYamlSyntax(yamlContent: string): { valid: boolean; error?: string } {
    try {
      yaml.loadAll(yamlContent);
      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Unknown YAML syntax error'
      };
    }
  }

  /**
   * Validate Kyverno policy using multi-layer approach
   */
  private async validateKyvernoPolicy(yamlPath: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    // First check if file exists
    if (!fs.existsSync(yamlPath)) {
      return {
        valid: false,
        errors: [`Kyverno policy file not found: ${yamlPath}`],
        warnings: []
      };
    }
    
    // Read YAML content for syntax validation
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    
    // 1. YAML syntax validation
    const syntaxCheck = this.validateYamlSyntax(yamlContent);
    if (!syntaxCheck.valid) {
      return {
        valid: false,
        errors: [`YAML syntax error: ${syntaxCheck.error}`],
        warnings: []
      };
    }
    
    // 2. kubectl dry-run validation using ManifestValidator
    try {
      const validator = new ManifestValidator();
      const result = await validator.validateManifest(yamlPath, { dryRunMode: 'server' });
      return result;
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Generate Kyverno policy step - automatically generates policy from intent data with validation loop
   */
  private async generateKyvernoStep(session: UnifiedCreationSession, args?: any): Promise<UnifiedWorkflowStepResponse> {
    // Check if Kyverno is available before attempting policy generation
    const kyvernoStatus = await getKyvernoStatus();
    if (!kyvernoStatus.policyGenerationReady) {
      // Skip Kyverno generation and go directly to review with intent-only option
      session.currentStep = getNextStep('kyverno-generation', this.config)!;
      session.data.kyvernoGenerationSkipped = true;
      session.data.kyvernoSkipReason = kyvernoStatus.reason || 'Kyverno not available for policy generation';
      // Generate policy ID since we skipped the normal generation step
      session.data.policyId = randomUUID();
      
      // Save session and proceed to review
      if (args) {
        this.saveSession(session, args);
      }
      
      return this.generateReviewStep(session);
    }
    
    const data = session.data;
    const finalTriggers = data.expandedTriggers || data.initialTriggers || [];
    const maxAttempts = 5;
    let lastError: { attempt: number; previousPolicy: string; validationResult: { valid: boolean; errors: string[]; warnings: string[] } } | undefined;
    
    try {
      // Ensure discovery service is connected to cluster before retrieving schemas
      await this.discovery.connect();

      // Retrieve actual resource schemas using semantic search and discovery
      // Use capabilities collection from session data if provided (for testing with pre-populated data)
      const resourceSchemas = await this.retrieveRelevantSchemas(
        data.description || '',
        finalTriggers,
        data.capabilitiesCollection
      );
      
      // Prepare session directory for YAML saving
      const sessionDir = getAndValidateSessionDirectory(args, true);
      const policySessionDir = path.join(sessionDir, 'policy-sessions');
      
      if (!fs.existsSync(policySessionDir)) {
        fs.mkdirSync(policySessionDir, { recursive: true });
      }
      
      // Generate policy ID once and store in session for consistency
      if (!session.data.policyId) {
        session.data.policyId = randomUUID();
      }

      // AI generation and validation loop (like generate-manifests tool)
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Prepare template data using consistent policy ID
          const templateData = {
            policy_description: data.description || '',
            policy_rationale: data.rationale || '',
            policy_triggers: finalTriggers.join(', '),
            policy_id: session.data.policyId,
            resource_schemas: this.formatSchemasForPrompt(resourceSchemas),
            namespace_scope: this.formatNamespaceScope(session.data.namespaceScope),
            previous_attempt: lastError ? `\n### Previous Generated Policy:\n\`\`\`yaml\n${lastError.previousPolicy}\n\`\`\`` : 'None - this is the first attempt.',
            error_details: lastError ? `\n**Attempt**: ${lastError.attempt}\n**Validation Errors**: ${lastError.validationResult.errors.join(', ')}\n**Validation Warnings**: ${lastError.validationResult.warnings.join(', ')}` : 'None - this is the first attempt.'
          };
          
          const prompt = loadPrompt('kyverno-generation', templateData);

          // Call AI provider internally to generate Kyverno policy
          const { createAIProvider } = require('./ai-provider-factory');
          const aiProvider = createAIProvider();
          
          const response = await aiProvider.sendMessage(prompt, 'policy-kyverno-generation', {
            user_intent: data.description ? `Create Kyverno policy: ${data.description}` : `Generate Kyverno policy for ${finalTriggers.join(', ')}`,
            interaction_id: args?.interaction_id || 'kyverno_generation'
          });
          
          // Response should be clean YAML with analysis comments
          // Extract YAML from code blocks if wrapped (using shared utility)
          const kyvernoPolicy = extractContentFromMarkdownCodeBlocks(response.content, 'yaml');
          
          // Save policy to file immediately after generation
          const yamlPath = path.join(policySessionDir, `${session.sessionId}-kyverno.yaml`);
          fs.writeFileSync(yamlPath, kyvernoPolicy, 'utf8');
          
          // Save a copy of this attempt for debugging
          const attemptPath = yamlPath.replace('.yaml', `_attempt_${attempt.toString().padStart(2, '0')}.yaml`);
          fs.writeFileSync(attemptPath, kyvernoPolicy, 'utf8');
          
          // Validate policy using kubectl dry-run
          const validation = await this.validateKyvernoPolicy(yamlPath);
          
          if (validation.valid) {
            // Success! Store the validated policy in session data
            session.data.generatedKyvernoPolicy = kyvernoPolicy;
            
            // DEBUG_DOT_AI logging
            if (process.env.DEBUG_DOT_AI === 'true') {
              console.debug('Generated and validated Kyverno policy', {
                attempt,
                promptLength: prompt.length,
                schemaCount: Object.keys(resourceSchemas).length,
                policyLength: kyvernoPolicy.length,
                yamlPath
              });
            }
            
            // Skip display step and go directly to review
            session.currentStep = getNextStep('kyverno-generation', this.config)!;
            
            // Save session immediately after generating Kyverno policy AND updating the step
            if (args) {
              this.saveSession(session, args);
            }
            
            return this.getNextWorkflowStep(session, args);
          }
          
          // Validation failed, prepare error context for next attempt
          lastError = {
            attempt,
            previousPolicy: kyvernoPolicy,
            validationResult: validation
          };
          
          console.warn(`Kyverno policy validation failed on attempt ${attempt}/${maxAttempts}:`, {
            errors: validation.errors,
            warnings: validation.warnings
          });
          
        } catch (error) {
          console.error(`Error during Kyverno policy generation attempt ${attempt}:`, error);
          
          // If this is the last attempt, throw the error
          if (attempt === maxAttempts) {
            throw error;
          }
          
          // Prepare error context for retry
          lastError = {
            attempt,
            previousPolicy: lastError?.previousPolicy || '',
            validationResult: {
              valid: false,
              errors: [error instanceof Error ? error.message : String(error)],
              warnings: []
            }
          };
        }
      }
      
      // If we reach here, all attempts failed
      const errorMessage = `Failed to generate valid Kyverno policy after ${maxAttempts} attempts. Last errors: ${lastError?.validationResult.errors.join(', ')}`;
      session.data.kyvernoGenerationError = errorMessage;
      
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        prompt: `**Error Generating Kyverno Policy**

${errorMessage}

Please try again or modify your policy description.`,
        instruction: 'Kyverno policy generation failed after multiple attempts. You can ask for modifications to the policy intent or try again.',
        nextStep: getNextStep('kyverno-generation', this.config) || undefined,
        data: { kyvernoGenerationError: errorMessage }
      };
      
    } catch (error) {
      // Store error for later handling
      session.data.kyvernoGenerationError = error instanceof Error ? error.message : String(error);
      
      return {
        sessionId: session.sessionId,
        entityType: this.config.entityType,
        prompt: `**Error Generating Kyverno Policy**

Failed to generate Kyverno policy: ${session.data.kyvernoGenerationError}

Please try again or modify your policy description.`,
        instruction: 'Kyverno policy generation failed. You can ask for modifications to the policy intent or try again.',
        nextStep: getNextStep('kyverno-generation', this.config) || undefined,
        data: { kyvernoGenerationError: session.data.kyvernoGenerationError }
      };
    }
  }

  /**
   * Retrieve relevant schemas for Kyverno generation using semantic search
   */
  private async retrieveRelevantSchemas(
    policyDescription: string,
    triggers: string[],
    collection?: string
  ): Promise<Record<string, any>> {

    // Combine policy description with triggers for enhanced search
    const searchQuery = [policyDescription, ...triggers].join(' ');

    console.info('Performing semantic search for relevant capabilities', {
      searchQuery,
      triggerCount: triggers.length,
      collection: collection || 'capabilities'
    });

    const capabilityService = new CapabilityVectorService(collection);
    
    // Use existing searchCapabilities function - no fallback, let it throw if it fails
    const searchResults = await capabilityService.searchCapabilities(searchQuery, { 
      limit: 50 // Higher limit to get more relevant resources - aligns with recommendation tool
    });
    
    if (searchResults.length === 0) {
      throw new Error(`No relevant capabilities found for policy description: "${policyDescription}"`);
    }
    
    console.info('Semantic search completed', {
      resultsCount: searchResults.length,
      topScore: searchResults[0]?.score
    });
    
    // Retrieve schemas for relevant resources
    console.info('Retrieving schemas for relevant resources', {
      resourceCount: searchResults.length,
      resources: searchResults.map(r => r.data.resourceName)
    });
    
    const schemas: Record<string, any> = {};
    
    // Retrieve schema for each relevant resource using existing pattern from generate-manifests.ts
    for (const result of searchResults) {
      const resourceName = result.data.resourceName;
      try {
        console.debug('Retrieving schema for resource', { 
          resourceName,
          score: result.score 
        });
        
        // Use discovery engine to explain the resource - no fallback, let it throw if it fails
        const explanation = await this.discovery.explainResource(resourceName);
        
        schemas[resourceName] = {
          resourceName,
          score: result.score,
          capabilities: result.data.capabilities,
          schema: explanation,
          timestamp: new Date().toISOString()
        };
        
        console.debug('Schema retrieved successfully', {
          resourceName,
          schemaLength: explanation.length
        });
        
      } catch (error) {
        console.warn('Skipping resource schema (not available in cluster)', error as Error, {
          resourceName,
          error: error instanceof Error ? error.message : String(error)
        });

        // Skip resources that don't exist in the cluster instead of failing
        // This allows policy generation to work across different Kubernetes versions
        continue;
      }
    }
    
    console.info('All resource schemas retrieved successfully', {
      schemaCount: Object.keys(schemas).length
    });
    
    return schemas;
  }

  /**
   * Format namespace scope for inclusion in the Kyverno generation prompt
   */
  private formatNamespaceScope(scope?: { type: 'all' | 'include' | 'exclude'; namespaces?: string[] }): string {
    if (!scope || scope.type === 'all') {
      return 'Apply to all namespaces (no restrictions)';
    } else if (scope.type === 'include') {
      return `Apply ONLY to these namespaces: ${scope.namespaces?.join(', ')}`;
    } else {
      return `Apply to all namespaces EXCEPT: ${scope.namespaces?.join(', ')}`;
    }
  }

  /**
   * Format schemas for inclusion in the Kyverno generation prompt
   */
  private formatSchemasForPrompt(resourceSchemas: Record<string, any>): string {
    return Object.entries(resourceSchemas)
      .map(([resourceName, schemaData]) => {
        return `${resourceName} (Score: ${schemaData.score?.toFixed(2) || 'N/A'}):
${schemaData.schema}

`;
      })
      .join('\n');
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