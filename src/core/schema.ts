/**
 * Resource Schema Parser and Validator
 * 
 * Implements comprehensive schema parsing and validation for Kubernetes resources
 * Fetches structured OpenAPI schemas from Kubernetes API server and validates manifests
 */

import { ResourceExplanation } from './discovery';
import { 
  executeKubectl 
} from './kubernetes-utils';
import { ClaudeIntegration } from './claude';
import { PatternVectorService } from './pattern-vector-service';
import { OrganizationalPattern } from './pattern-types';
import { VectorDBService } from './vector-db-service';
import { CapabilityVectorService } from './capability-vector-service';
import { PolicyVectorService } from './policy-vector-service';
import { PolicyIntent } from './organizational-types';
import { loadPrompt } from './shared-prompt-loader';

// Core type definitions for schema structure
export interface FieldConstraints {
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  default?: any;
  pattern?: string;
}

export interface SchemaField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
  constraints?: FieldConstraints;
  nested: Map<string, SchemaField>;
}

export interface ResourceSchema {
  apiVersion: string;
  kind: string;
  group: string;
  version?: string;
  description: string;
  properties: Map<string, SchemaField>;
  required?: string[];
  namespace?: boolean;
  resourceName?: string; // Proper plural resource name for kubectl explain
  rawExplanation?: string; // Raw kubectl explain output for AI processing
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ResourceMapping {
  resourceKind: string;
  apiVersion: string;
  group?: string;
  fieldPath: string;
}

// Simple answer structure for manifest generation
export interface AnswerSet {
  [questionId: string]: any;
}

// Enhanced solution for single-pass workflow
export interface EnhancedSolution extends ResourceSolution {
  answers: AnswerSet;
  openAnswer: string;
}

export interface Question {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiselect' | 'boolean' | 'number';
  options?: string[];
  placeholder?: string;
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  answer?: any;
  // Note: resourceMapping removed - manifest generator handles field mapping
}

export interface QuestionGroup {
  required: Question[];
  basic: Question[];
  advanced: Question[];
  open: {
    question: string;
    placeholder: string;
    answer?: string;
  };
}


export interface PatternInfluence {
  patternId: string;
  description: string;
  influence: 'high' | 'medium' | 'low';
  matchedTriggers: string[];
  matchedConcept?: string; // NEW: Which concept led to this pattern match
}

export interface ResourceSolution {
  type: 'single' | 'combination';
  resources: ResourceSchema[];
  score: number;
  description: string;
  reasons: string[];
  analysis: string;
  questions: QuestionGroup;
  patternInfluences?: PatternInfluence[]; // NEW: Which patterns influenced this recommendation
  usedPatterns?: boolean; // NEW: Quick indicator if any patterns were used
}

export interface AIRankingConfig {
  claudeApiKey: string;
}

// Note: DiscoveryFunctions interface removed as it's no longer used in capability-based approach
// explainResource function is now passed directly to findBestSolutions

export interface ClusterOptions {
  namespaces: string[];
  storageClasses: string[];
  ingressClasses: string[];
  nodeLabels: string[];
  serviceAccounts?: { [namespace: string]: string[] };
}

/**
 * SchemaParser converts kubectl explain output to structured ResourceSchema
 */
export class SchemaParser {
  /**
   * Parse ResourceExplanation from discovery engine into structured schema
   */
  parseResourceExplanation(explanation: ResourceExplanation): ResourceSchema {
    const apiVersion = explanation.group 
      ? `${explanation.group}/${explanation.version}`
      : explanation.version;

    const properties = new Map<string, SchemaField>();
    const required: string[] = [];

    // Process all fields from the explanation
    for (const field of explanation.fields) {
      const parts = field.name.split('.');
      const topLevelField = parts[0];

      // Add to required if marked as required
      if (field.required && !required.includes(topLevelField)) {
        required.push(topLevelField);
      }

      // Create or get the top-level field
      if (!properties.has(topLevelField)) {
        properties.set(topLevelField, {
          name: topLevelField,
          type: this.normalizeType(field.type),
          description: field.description,
          required: field.required,
          constraints: this.parseFieldConstraints(field.type, field.description),
          nested: new Map()
        });
      }

      // Handle nested fields
      if (parts.length > 1) {
        this.addNestedField(properties.get(topLevelField)!, parts.slice(1), field);
      }
    }

    return {
      apiVersion,
      kind: explanation.kind,
      group: explanation.group,
      version: explanation.version,
      description: explanation.description,
      properties,
      required,
      namespace: true // Default to namespaced, could be enhanced with discovery data
    };
  }

  /**
   * Add nested field to the schema structure
   */
  private addNestedField(parentField: SchemaField, fieldParts: string[], field: any): void {
    const currentPart = fieldParts[0];
    
    if (!parentField.nested.has(currentPart)) {
      parentField.nested.set(currentPart, {
        name: `${parentField.name}.${currentPart}`,
        type: this.normalizeType(field.type),
        description: field.description,
        required: field.required,
        constraints: this.parseFieldConstraints(field.type, field.description),
        nested: new Map()
      });
    }

    // Continue recursively if there are more field parts
    if (fieldParts.length > 1) {
      this.addNestedField(parentField.nested.get(currentPart)!, fieldParts.slice(1), field);
    }
  }

  /**
   * Normalize field types from kubectl explain output
   */
  private normalizeType(type: string): string {
    const lowerType = type.toLowerCase();
    
    // Map kubectl types to standard types
    const typeMap: { [key: string]: string } = {
      'object': 'object',
      'string': 'string',
      'integer': 'integer',
      'int32': 'integer',
      'int64': 'integer',
      'boolean': 'boolean',
      'array': 'array',
      '[]string': 'array',
      '[]object': 'array',
      'map[string]string': 'object',
      'map[string]object': 'object'
    };

    return typeMap[lowerType] || 'string';
  }

  /**
   * Parse field constraints from description text
   */
  parseFieldConstraints(type: string, description: string): FieldConstraints {
    const constraints: FieldConstraints = {};

    // Extract minimum/maximum values
    const minMatch = description.match(/(?:minimum|min):\s*(\d+)/i);
    if (minMatch) {
      constraints.minimum = parseInt(minMatch[1]);
    }

    const maxMatch = description.match(/(?:maximum|max):\s*(\d+)/i);
    if (maxMatch) {
      constraints.maximum = parseInt(maxMatch[1]);
    }

    // Extract enum values - Fixed: Avoid catastrophic backtracking
    const enumMatch = description.match(/(possible values|valid values|values)\s*(?:are)?:\s*([^.]+)/i);
    if (enumMatch) {
      const values = enumMatch[2]
        .split(/,|\s+and\s+/)
        .map(v => v.trim())
        .filter(v => v.length > 0);
      constraints.enum = values;
    }

    // Extract default values - Fixed: Use simpler non-catastrophic patterns
    let defaultMatch = description.match(/\(default:\s*([^)]+)\)/i);
    if (!defaultMatch) {
      defaultMatch = description.match(/defaults?\s+to\s+(\w+)/i);
    }
    if (!defaultMatch) {
      defaultMatch = description.match(/\.\s+default:\s*(\w+)/i);
    }
    if (defaultMatch) {
      const defaultValue = defaultMatch[1].trim();
      if (type === 'integer') {
        const parsed = parseInt(defaultValue);
        if (!isNaN(parsed)) {
          constraints.default = parsed;
        }
      } else {
        constraints.default = defaultValue;
      }
    }

    // Extract string length constraints
    const minLengthMatch = description.match(/min length:\s*(\d+)/i);
    if (minLengthMatch) {
      constraints.minLength = parseInt(minLengthMatch[1]);
    }

    const maxLengthMatch = description.match(/max length:\s*(\d+)/i);
    if (maxLengthMatch) {
      constraints.maxLength = parseInt(maxLengthMatch[1]);
    }

    return constraints;
  }
}

/**
 * ManifestValidator validates Kubernetes manifests using kubectl dry-run
 */
export class ManifestValidator {
  /**
   * Validate a manifest using kubectl dry-run
   * This uses the actual Kubernetes API server validation for accuracy
   */
  async validateManifest(manifestPath: string, config?: { kubeconfig?: string; dryRunMode?: 'client' | 'server' }): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const dryRunMode = config?.dryRunMode || 'server';
      const args = ['apply', '--dry-run=' + dryRunMode, '-f', manifestPath];
      
      await executeKubectl(args, { kubeconfig: config?.kubeconfig });
      
      // If we get here, validation passed
      // kubectl dry-run will throw an error if validation fails
      
      // Add best practice warnings by reading the manifest
      const fs = await import('fs');
      const yaml = await import('yaml');
      const documents = yaml.parseAllDocuments(fs.readFileSync(manifestPath, 'utf8'));
      // Process all documents for best practice warnings
      documents.forEach(doc => {
        if (doc.contents) {
          this.addBestPracticeWarnings(doc.toJS(), warnings);
        }
      });
      
      return {
        valid: true,
        errors,
        warnings
      };
      
    } catch (error: any) {
      // Parse kubectl error output for validation issues
      const errorMessage = error.message || '';
      
      if (errorMessage.includes('validation failed')) {
        errors.push('Kubernetes validation failed: ' + errorMessage);
      } else if (errorMessage.includes('unknown field')) {
        errors.push('Unknown field in manifest: ' + errorMessage);
      } else if (errorMessage.includes('required field')) {
        errors.push('Missing required field: ' + errorMessage);
      } else {
        errors.push('Validation error: ' + errorMessage);
      }
      
      return {
        valid: false,
        errors,
        warnings
      };
    }
  }

  /**
   * Add best practice warnings
   */
  private addBestPracticeWarnings(manifest: any, warnings: string[]): void {
    // Check for missing labels
    if (!manifest.metadata?.labels) {
      warnings.push('Consider adding labels to metadata for better resource organization');
    }

    // Check for missing namespace in namespaced resources
    if (!manifest.metadata?.namespace && manifest.kind !== 'Namespace') {
      warnings.push('Consider specifying a namespace for better resource isolation');
    }
  }
}

/**
 * ResourceRecommender determines which resources best meet user needs using AI
 */
export class ResourceRecommender {
  private claudeIntegration: ClaudeIntegration;
  private config: AIRankingConfig;
  private patternService?: PatternVectorService;
  private capabilityService?: CapabilityVectorService;
  private policyService?: PolicyVectorService;

  constructor(config: AIRankingConfig) {
    this.config = config;
    this.claudeIntegration = new ClaudeIntegration(config.claudeApiKey);
    
    // Initialize capability service - fail gracefully if Vector DB unavailable
    try {
      const capabilityVectorDB = new VectorDBService({ collectionName: 'capabilities' });
      this.capabilityService = new CapabilityVectorService(capabilityVectorDB);
      console.log('✅ Capability service initialized with Vector DB');
    } catch (error) {
      console.warn('⚠️ Vector DB not available, capabilities disabled:', error);
      this.capabilityService = undefined;
    }
    
    // Initialize pattern service only if Vector DB is available
    try {
      const vectorDB = new VectorDBService({ collectionName: 'patterns' });
      this.patternService = new PatternVectorService(vectorDB);
      console.log('✅ Pattern service initialized with Vector DB');
    } catch (error) {
      console.warn('⚠️ Vector DB not available, patterns disabled:', error);
      this.patternService = undefined;
    }
    
    // Initialize policy service only if Vector DB is available
    try {
      const policyVectorDB = new VectorDBService({ collectionName: 'policies' });
      this.policyService = new PolicyVectorService(policyVectorDB);
      console.log('✅ Policy service initialized with Vector DB');
    } catch (error) {
      console.warn('⚠️ Vector DB not available, policies disabled:', error);
      this.policyService = undefined;
    }
  }

  /**
   * Find the best resource solution(s) for user intent using two-phase analysis
   */
  async findBestSolutions(
    intent: string,
    _explainResource: (resource: string) => Promise<any>
  ): Promise<ResourceSolution[]> {
    if (!this.claudeIntegration.isInitialized()) {
      throw new Error('Claude integration not initialized. API key required for AI-powered resource ranking.');
    }

    try {
      // Phase 0: Search for relevant organizational patterns
      const relevantPatterns = await this.searchRelevantPatterns(intent);

      // Phase 1a: Replace mass resource discovery with capability-based pre-filtering
      if (!this.capabilityService) {
        // Capability service not available - fail fast with clear guidance
        throw new Error(
          `Capability service not available for intent "${intent}". Please scan your cluster first:\n` +
          `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })\n` +
          `Note: Vector DB is required for capability-based recommendations.`
        );
      }

      let relevantCapabilities: any[] = [];
      
      if (this.capabilityService) {
        try {
          relevantCapabilities = await this.capabilityService.searchCapabilities(intent, { limit: 50 });
        } catch (error) {
          // Capability search failed - fail fast with clear guidance
          throw new Error(
            `Capability search failed for intent "${intent}". Please scan your cluster first:\n` +
            `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })\n` +
            `Error: ${error}`
          );
        }
      } else {
        console.warn('⚠️ Capability service not available (Vector DB not reachable), proceeding without capabilities');
      }
      
      if (relevantCapabilities.length === 0) {
        // Fail fast with clear user guidance if no capabilities found
        throw new Error(
          `No capabilities found for "${intent}". Please scan your cluster first:\n` +
          `Run: manageOrgData({ dataType: "capabilities", operation: "scan" })`
        );
      }

      console.log(`🎯 Found ${relevantCapabilities.length} relevant capabilities (vs 415+ mass discovery)`);
      
      // Create normalized resource objects from capability matches
      const capabilityFilteredResources = relevantCapabilities.map(cap => ({
        kind: this.extractKindFromResourceName(cap.data.resourceName),
        group: this.extractGroupFromResourceName(cap.data.resourceName),
        apiVersion: this.constructApiVersionFromResourceName(cap.data.resourceName),
        resourceName: cap.data.resourceName,
        namespaced: true, // Default assumption, could be enhanced
        capabilities: cap.data // Include capability data for AI decision-making
      }));

      // Phase 1: Add missing pattern-suggested resources to available resources list
      const enhancedResources = await this.addMissingPatternResources(capabilityFilteredResources, relevantPatterns);

      // Phase 2: AI assembles and ranks complete solutions (replaces separate selection + ranking phases)
      const solutions = await this.assembleAndRankSolutions(intent, enhancedResources, relevantPatterns);
      
      // Phase 3: Generate questions for each solution
      for (const solution of solutions) {
        solution.questions = await this.generateQuestionsWithAI(intent, solution, _explainResource);
      }
      
      return solutions;
    } catch (error) {
      throw new Error(`AI-powered resource solution analysis failed: ${error}`);
    }
  }

  /**
   * Phase 2: AI assembles and ranks complete solutions (replaces separate selection + ranking)
   */
  private async assembleAndRankSolutions(
    intent: string, 
    availableResources: Array<{
      kind: string;
      group: string;
      apiVersion: string; 
      resourceName: string;
      namespaced: boolean;
      capabilities: any;
    }>,
    patterns: OrganizationalPattern[]
  ): Promise<ResourceSolution[]> {
    const prompt = await this.loadSolutionAssemblyPrompt(intent, availableResources, patterns);
    const response = await this.claudeIntegration.sendMessage(prompt, 'solution-assembly');
    return this.parseSimpleSolutionResponse(response.content);
  }

  /**
   * Parse AI response for simple solution structure (no schema matching needed)
   */
  private parseSimpleSolutionResponse(aiResponse: string): ResourceSolution[] {
    try {
      // Use robust JSON extraction
      const parsed = this.extractJsonFromAIResponse(aiResponse);
      
      const solutions: ResourceSolution[] = parsed.solutions.map((solution: any) => {
        const isDebugMode = process.env.DOT_AI_DEBUG === 'true';
        
        if (isDebugMode) {
          console.debug('DEBUG: solution object:', JSON.stringify(solution, null, 2));
        }
        
        // Convert resource references to ResourceSchema format for compatibility
        const resources: ResourceSchema[] = (solution.resources || []).map((resource: any) => ({
          kind: resource.kind,
          apiVersion: resource.apiVersion,
          group: resource.group || '',
          resourceName: resource.resourceName, // Preserve resourceName from AI response
          description: `${resource.kind} resource from ${resource.group || 'core'} group`,
          properties: new Map(),
          namespace: true // Default assumption for new architecture
        }));
        
        return {
          type: solution.type,
          resources,
          score: solution.score,
          description: solution.description,
          reasons: solution.reasons || [],
          analysis: solution.analysis || '',
          questions: { required: [], basic: [], advanced: [], open: { question: '', placeholder: '' } },
          patternInfluences: solution.patternInfluences || [],
          usedPatterns: solution.usedPatterns || false
        };
      });

      // Sort by score descending
      return solutions.sort((a, b) => b.score - a.score);
      
    } catch (error) {
      // Enhanced error message with more context
      const errorMsg = `Failed to parse AI solution response: ${(error as Error).message}`;
      const contextMsg = `\nAI Response (first 500 chars): "${aiResponse.substring(0, 500)}..."`;
      throw new Error(errorMsg + contextMsg);
    }
  }

  /**
   * Load and format solution assembly prompt from file
   */
  private async loadSolutionAssemblyPrompt(
    intent: string, 
    resources: Array<{
      kind: string;
      group: string;
      apiVersion: string;
      resourceName: string;
      namespaced: boolean;
      capabilities: any;
    }>,
    patterns: OrganizationalPattern[]
  ): Promise<string> {
    const template = loadPrompt('resource-selection');
    
    // Format resources for the prompt with capability information
    const resourcesText = resources.map((resource, index) => {
      return `${index}: ${resource.kind.toUpperCase()} (${resource.apiVersion})
   Group: ${resource.group || 'core'}
   Namespaced: ${resource.namespaced}
   Resource Name: ${resource.resourceName}
   Capabilities: ${Array.isArray(resource.capabilities.capabilities) ? resource.capabilities.capabilities.join(', ') : 'Not specified'}
   Providers: ${Array.isArray(resource.capabilities.providers) ? resource.capabilities.providers.join(', ') : resource.capabilities.providers || 'kubernetes'}
   Complexity: ${resource.capabilities.complexity || 'medium'}
   Use Case: ${resource.capabilities.useCase || resource.capabilities.description || 'General purpose'}
   Description: ${resource.capabilities.description || 'Kubernetes resource'}
   Confidence: ${resource.capabilities.confidence || 1.0}`;
    }).join('\n\n');

    // Format organizational patterns for AI context
    const patternsContext = patterns.length > 0 
      ? patterns.map(pattern => 
          `- ID: ${pattern.id}
            Description: ${pattern.description}
            Suggested Resources: ${pattern.suggestedResources?.join(', ') || 'Not specified'}
            Rationale: ${pattern.rationale}
            Triggers: ${pattern.triggers?.join(', ') || 'None'}`
        ).join('\n')
      : 'No organizational patterns found for this request.';
    
    return template
      .replace('{intent}', intent)
      .replace('{resources}', resourcesText)
      .replace('{patterns}', patternsContext);
  }

  /**
   * Add pattern-suggested resources that are missing from capability search results
   */
  private async addMissingPatternResources(
    capabilityResources: Array<{
      kind: string;
      group: string; 
      apiVersion: string;
      resourceName: string;
      namespaced: boolean;
      capabilities: any;
    }>,
    patterns: OrganizationalPattern[]
  ): Promise<Array<{
    kind: string;
    group: string;
    apiVersion: string; 
    resourceName: string;
    namespaced: boolean;
    capabilities: any;
  }>> {
    if (!patterns.length) {
      return capabilityResources;
    }

    // Extract all resource names already in capability results
    const existingResourceNames = new Set(capabilityResources.map(r => r.resourceName));

    // Collect missing pattern resources
    const missingPatternResources: Array<{
      kind: string;
      group: string;
      apiVersion: string;
      resourceName: string; 
      namespaced: boolean;
      capabilities: any;
    }> = [];

    for (const pattern of patterns) {
      if (pattern.suggestedResources) {
        for (const suggestedResource of pattern.suggestedResources) {
          // Skip null/undefined resources
          if (!suggestedResource || typeof suggestedResource !== 'string') {
            continue;
          }
          
          // Convert pattern resource format to resource name (e.g., "resourcegroups.azure.upbound.io" -> resourceName)
          const resourceName = suggestedResource.includes('.') ? suggestedResource : `${suggestedResource}.core`;
          
          // Only add if not already present in capability results
          if (!existingResourceNames.has(resourceName)) {
            try {
              // Parse resource components
              const parts = suggestedResource.split('.');
              const kind = parts[0]; // Use resource name as-is: resourcegroups, servicemonitors, etc.
              const group = parts.length > 1 ? parts.slice(1).join('.') : '';
              const version = 'v1beta1'; // Default version for CRDs, could be enhanced
              const apiVersion = group ? `${group}/${version}` : version;

              missingPatternResources.push({
                kind,
                group,
                apiVersion,
                resourceName,
                namespaced: true, // Default assumption for pattern resources
                capabilities: {
                  resourceName,
                  description: `Resource suggested by organizational pattern: ${pattern.description}`,
                  capabilities: [`organizational pattern`, pattern.description.toLowerCase()],
                  providers: this.inferProvidersFromResourceName(suggestedResource),
                  complexity: 'medium',
                  useCase: `Pattern-suggested resource for: ${pattern.rationale}`,
                  confidence: 1.0, // High confidence since it's from organizational pattern
                  source: 'organizational-pattern',
                  patternId: pattern.id
                }
              });

              existingResourceNames.add(resourceName);
            } catch (error) {
              console.warn(`Failed to parse pattern resource ${suggestedResource}:`, error);
            }
          }
        }
      }
    }

    return [...capabilityResources, ...missingPatternResources];
  }

  /**
   * Infer cloud providers from resource name
   */
  private inferProvidersFromResourceName(resourceName: string): string[] {
    if (resourceName.includes('azure')) return ['azure'];
    if (resourceName.includes('aws')) return ['aws'];
    if (resourceName.includes('gcp') || resourceName.includes('google')) return ['gcp'];
    return ['kubernetes'];
  }

  /**
   * Extract Kubernetes kind from resource name (e.g., "sqls.devopstoolkit.live" -> "SQL")
   */
  private extractKindFromResourceName(resourceName: string): string {
    // For CRDs like "sqls.devopstoolkit.live", the kind is usually the singular of the plural
    // For core resources like "pods", return as-is
    if (!resourceName.includes('.')) {
      return resourceName; // Core resources like "pods", "services"
    }
    
    // For CRDs, extract the resource part (before first dot)
    const resourcePart = resourceName.split('.')[0];
    // Convert plural to singular and capitalize (sqls -> SQL)
    return resourcePart.toUpperCase();
  }

  /**
   * Extract group from resource name (e.g., "sqls.devopstoolkit.live" -> "devopstoolkit.live")
   */
  private extractGroupFromResourceName(resourceName: string): string {
    if (!resourceName.includes('.')) {
      return 'core'; // Core resources have no group
    }
    
    // Return everything after the first dot
    return resourceName.substring(resourceName.indexOf('.') + 1);
  }

  /**
   * Construct API version from resource name (simplified approach)
   */
  private constructApiVersionFromResourceName(resourceName: string): string {
    if (!resourceName.includes('.')) {
      return 'v1'; // Core resources typically use v1
    }
    
    // For CRDs, construct group/version format
    const group = this.extractGroupFromResourceName(resourceName);
    return `${group}/v1beta1`; // Default to v1beta1 for CRDs
  }

  /**
   * Phase 0: Search for relevant organizational patterns using multi-concept approach
   * Returns empty array if Vector DB is not available - this is completely optional
   */
  private async searchRelevantPatterns(intent: string): Promise<OrganizationalPattern[]> {
    // If pattern service is not available, skip pattern search entirely
    if (!this.patternService) {
      console.log('📋 Pattern service unavailable, skipping pattern search - using pure AI recommendations');
      return [];
    }

    try {
      // Search patterns directly with user intent (vector search handles semantic concepts)
      const patternResults = await this.patternService.searchPatterns(intent, { limit: 5 });
      return patternResults.map(result => result.data);
    } catch (error) {
      // Pattern search is non-blocking - if it fails, continue without patterns
      console.warn('❌ Pattern search failed, continuing without patterns:', error);
      return [];
    }
  }


  // REMOVED: selectResourceCandidates - replaced by single-phase assembleAndRankSolutions
  // REMOVED: fetchDetailedSchemas - no longer needed in single-phase architecture

  /**
      const basic = `${index}: ${resource.kind} (${resource.apiVersion})
   Group: ${resource.group || 'core'}
   Namespaced: ${resource.namespaced}`;
      
      // Include rich capability context if available (from capability-based pre-filtering)
      if (resource.capabilities) {
        const cap = resource.capabilities;
        return `${basic}
   Resource Name: ${resource.resourceName || 'Not specified'}
   Capabilities: ${cap.capabilities?.join(', ') || 'Not specified'}
   Providers: ${cap.providers?.join(', ') || 'Not specified'}
   Complexity: ${cap.complexity || 'Not specified'}
   Use Case: ${cap.useCase || 'Not specified'}
   Description: ${cap.description || 'Not specified'}
   Confidence: ${cap.confidence || 'N/A'}`;
      }
      
      return basic;
    }).join('\n\n');

    // Format organizational patterns for AI context
    const patternsContext = patterns.length > 0 
      ? patterns.map(pattern => 
          `- ID: ${pattern.id}
            Description: ${pattern.description}
            Suggested Resources: ${pattern.suggestedResources?.join(', ') || 'Not specified'}
            Rationale: ${pattern.rationale}
            Triggers: ${pattern.triggers?.join(', ') || 'None'}`
        ).join('\n')
      : 'No organizational patterns found for this request.';


    const template = loadPrompt('resource-selection');
    
    const selectionPrompt = template
      .replace('{intent}', intent)
      .replace('{resources}', resourceSummary)
      .replace('{patterns}', patternsContext);


    const response = await this.claudeIntegration.sendMessage(selectionPrompt, 'resource-selection');
    
    try {
      // Extract JSON from response with robust parsing
      let jsonContent = response.content;
      
      // First try to find JSON array wrapped in code blocks
      const codeBlockMatch = response.content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (codeBlockMatch) {
        jsonContent = codeBlockMatch[1];
      } else {
        // Try to find JSON array that starts with [ and find the matching closing ]
        const startIndex = response.content.indexOf('[');
        if (startIndex !== -1) {
          let bracketCount = 0;
          let endIndex = startIndex;
          
          for (let i = startIndex; i < response.content.length; i++) {
            if (response.content[i] === '[') bracketCount++;
            if (response.content[i] === ']') bracketCount--;
            if (bracketCount === 0) {
              endIndex = i;
              break;
            }
          }
          
          if (bracketCount === 0) {
            jsonContent = response.content.substring(startIndex, endIndex + 1);
          }
        }
      }
      
      const selectedResources = JSON.parse(jsonContent.trim());
      
      if (!Array.isArray(selectedResources)) {
        throw new Error('AI response is not an array');
      }
      
      // Validate that each resource has required fields
      for (const resource of selectedResources) {
        if (!resource.kind || !resource.apiVersion) {
          throw new Error(`AI selected invalid resource: ${JSON.stringify(resource)}`);
        }
      }
      
      return selectedResources;
    } catch (error) {
      throw new Error(`AI failed to select resources in valid JSON format. Error: ${(error as Error).message}. AI response: "${response.content.substring(0, 200)}..."`);
    }
  }

  /**
   * Phase 2: Fetch detailed schemas for selected candidates
   */
  private async fetchDetailedSchemas(candidates: any[], explainResource: (resource: string) => Promise<any>): Promise<ResourceSchema[]> {
    const schemas: ResourceSchema[] = [];
    const errors: string[] = [];

    for (const resource of candidates) {
      try {
        const explanation = await explainResource(resource.kind);
        
        // Parse GROUP, KIND, VERSION from kubectl explain output
        const lines = explanation.split('\n');
        const groupLine = lines.find((line: string) => line.startsWith('GROUP:'));
        const kindLine = lines.find((line: string) => line.startsWith('KIND:'));
        const versionLine = lines.find((line: string) => line.startsWith('VERSION:'));
        
        const group = groupLine ? groupLine.replace('GROUP:', '').trim() : '';
        const kind = kindLine ? kindLine.replace('KIND:', '').trim() : resource.kind;
        const version = versionLine ? versionLine.replace('VERSION:', '').trim() : 'v1';
        
        // Build apiVersion from group and version
        const apiVersion = group ? `${group}/${version}` : version;
        
        // Create a simple schema with raw explanation for AI processing
        const schema: ResourceSchema = {
          kind: kind,
          apiVersion: apiVersion,
          group: group,
          description: explanation.split('\n').find((line: string) => line.startsWith('DESCRIPTION:'))?.replace('DESCRIPTION:', '').trim() || '',
          properties: new Map<string, SchemaField>(),
          rawExplanation: explanation // Include raw explanation for AI
        };
        schemas.push(schema);
      } catch (error) {
        errors.push(`${resource.kind}: ${(error as Error).message}`);
      }
    }

    if (schemas.length === 0) {
      throw new Error(`Could not fetch schemas for any selected resources. Candidates: ${candidates.map(c => c.kind).join(', ')}. Errors: ${errors.join(', ')}`);
    }

    if (errors.length > 0) {
      console.warn(`Some resources could not be analyzed: ${errors.join(', ')}`);
      console.warn(`Successfully fetched schemas for: ${schemas.map(s => s.kind).join(', ')}`);
    }

    return schemas;
  }




  /**
   * Discover cluster options for dynamic question generation
   */
  private async discoverClusterOptions(): Promise<ClusterOptions> {
    try {
      const { executeKubectl } = await import('./kubernetes-utils');
      
      // Discover namespaces
      const namespacesResult = await executeKubectl(['get', 'namespaces', '-o', 'jsonpath={.items[*].metadata.name}']);
      const namespaces = namespacesResult.split(/\s+/).filter(Boolean);

      // Discover storage classes
      let storageClasses: string[] = [];
      try {
        const storageResult = await executeKubectl(['get', 'storageclass', '-o', 'jsonpath={.items[*].metadata.name}']);
        storageClasses = storageResult.split(/\s+/).filter(Boolean);
      } catch {
        // Storage classes might not be available in all clusters
        storageClasses = [];
      }

      // Discover ingress classes
      let ingressClasses: string[] = [];
      try {
        const ingressResult = await executeKubectl(['get', 'ingressclass', '-o', 'jsonpath={.items[*].metadata.name}']);
        ingressClasses = ingressResult.split(/\s+/).filter(Boolean);
      } catch {
        // Ingress classes might not be available
        ingressClasses = [];
      }

      // Get common node labels
      let nodeLabels: string[] = [];
      try {
        const nodesResult = await executeKubectl(['get', 'nodes', '-o', 'json']);
        const nodes = JSON.parse(nodesResult);
        const labelSet = new Set<string>();
        
        nodes.items?.forEach((node: any) => {
          Object.keys(node.metadata?.labels || {}).forEach(label => {
            if (!label.startsWith('kubernetes.io/') && !label.startsWith('node.kubernetes.io/')) {
              labelSet.add(label);
            }
          });
        });
        
        nodeLabels = Array.from(labelSet);
      } catch {
        nodeLabels = [];
      }

      return {
        namespaces,
        storageClasses,
        ingressClasses,
        nodeLabels
      };
    } catch (error) {
      console.warn('Failed to discover cluster options, using defaults:', error);
      return {
        namespaces: ['default'],
        storageClasses: [],
        ingressClasses: [],
        nodeLabels: []
      };
    }
  }

  /**
   * Extract JSON object from AI response with robust parsing
   */
  private extractJsonFromAIResponse(aiResponse: string): any {
    let jsonContent = aiResponse;
    
    // First try to find JSON wrapped in code blocks
    const codeBlockMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    } else {
      // Try to find JSON that starts with { and find the matching closing }
      const startIndex = aiResponse.indexOf('{');
      if (startIndex !== -1) {
        let braceCount = 0;
        let endIndex = startIndex;
        
        for (let i = startIndex; i < aiResponse.length; i++) {
          if (aiResponse[i] === '{') braceCount++;
          if (aiResponse[i] === '}') braceCount--;
          if (braceCount === 0) {
            endIndex = i;
            break;
          }
        }
        
        if (braceCount === 0) {
          jsonContent = aiResponse.substring(startIndex, endIndex + 1);
        }
      }
    }
    
    return JSON.parse(jsonContent.trim());
  }

  /**
   * Generate contextual questions using AI based on user intent and solution resources
   */
  private async generateQuestionsWithAI(intent: string, solution: ResourceSolution, _explainResource: (resource: string) => Promise<any>): Promise<QuestionGroup> {
    try {
      // Discover cluster options for dynamic questions
      const clusterOptions = await this.discoverClusterOptions();
      
      // Search for relevant policy intents based on the selected resources
      let relevantPolicyResults: Array<{policy: PolicyIntent, score: number, matchType: string}> = [];
      if (this.policyService) {
        try {
          const resourceContext = solution.resources.map(r => `${r.kind} ${r.description}`).join(' ');
          const policyResults = await this.policyService.searchPolicyIntents(
            `${intent} ${resourceContext}`,
            { limit: 50 }
          );
          relevantPolicyResults = policyResults.map(result => ({
            policy: result.data,
            score: result.score,
            matchType: result.matchType
          }));
          console.log(`🛡️ Found ${relevantPolicyResults.length} relevant policy intents for question generation`);
        } catch (error) {
          console.warn('⚠️ Policy search failed during question generation, proceeding without policies:', error);
        }
      } else {
        console.log('🛡️ Policy service unavailable, skipping policy search - proceeding without policy guidance');
      }

      // Fetch resource schemas for each resource in the solution
      const resourcesWithSchemas = await Promise.all(solution.resources.map(async (resource) => {
        // Validate that resource has resourceName field for kubectl explain
        if (!resource.resourceName) {
          throw new Error(`Resource ${resource.kind} is missing resourceName field. This indicates a bug in solution construction.`);
        }
        
        try {
          // Use resourceName for kubectl explain - this should be the plural form like 'pods', 'services', etc.
          const schemaExplanation = await _explainResource(resource.resourceName);
          
          return {
            ...resource,
            rawExplanation: schemaExplanation
          };
        } catch (error) {
          console.warn(`Failed to fetch schema for ${resource.kind}: ${error}`);
          return resource;
        }
      }));

      // Format resource details for the prompt using raw explanation when available
      const resourceDetails = resourcesWithSchemas.map(resource => {
        if (resource.rawExplanation) {
          // Use raw kubectl explain output for comprehensive field information
          return `${resource.kind} (${resource.apiVersion}):
  Description: ${resource.description}
  
  Complete Schema Information:
${resource.rawExplanation}`;
        } else {
          // Fallback to properties map if raw explanation is not available
          const properties = Array.from(resource.properties.entries()).map(([key, field]) => {
            const nestedFields = Array.from(field.nested.entries()).map(([nestedKey, nestedField]) => 
              `    ${nestedKey}: ${nestedField.type} - ${nestedField.description}`
            ).join('\n');
            
            return `  ${key}: ${field.type} - ${field.description}${field.required ? ' (required)' : ''}${nestedFields ? '\n' + nestedFields : ''}`;
          }).join('\n');

          return `${resource.kind} (${resource.apiVersion}):
  Description: ${resource.description}
  Required fields: ${resource.required?.join(', ') || 'none specified'}
  Properties:
${properties}`;
        }
      }).join('\n\n');

      // Format cluster options for the prompt
      const clusterOptionsText = `Available Namespaces: ${clusterOptions.namespaces.join(', ')}
Available Storage Classes: ${clusterOptions.storageClasses.length > 0 ? clusterOptions.storageClasses.join(', ') : 'None discovered'}
Available Ingress Classes: ${clusterOptions.ingressClasses.length > 0 ? clusterOptions.ingressClasses.join(', ') : 'None discovered'}
Available Node Labels: ${clusterOptions.nodeLabels.length > 0 ? clusterOptions.nodeLabels.slice(0, 10).join(', ') : 'None discovered'}`;

      // Format organizational policies for AI context with relevance scores
      const policyContextText = relevantPolicyResults.length > 0 
        ? relevantPolicyResults.map(result => 
            `- ID: ${result.policy.id}
  Description: ${result.policy.description}
  Rationale: ${result.policy.rationale}
  Triggers: ${result.policy.triggers?.join(', ') || 'None'}
  Score: ${result.score.toFixed(3)} (${result.matchType})`
          ).join('\n')
        : 'No organizational policies found for this request.';

      // Load and format the question generation prompt
      const template = loadPrompt('question-generation');
      
      const questionPrompt = template
        .replace('{intent}', intent)
        .replace('{solution_description}', solution.description)
        .replace('{resource_details}', resourceDetails)
        .replace('{cluster_options}', clusterOptionsText)
        .replace('{policy_context}', policyContextText);

      const response = await this.claudeIntegration.sendMessage(questionPrompt, 'question-generation');
      
      // Use robust JSON extraction
      const questions = this.extractJsonFromAIResponse(response.content);
      
      // Validate the response structure
      if (!questions.required || !questions.basic || !questions.advanced || !questions.open) {
        throw new Error('Invalid question structure from AI');
      }
      
      return questions as QuestionGroup;
    } catch (error) {
      // Re-throw errors about missing resourceName - these are bugs, not generation failures
      if (error instanceof Error && error.message.includes('missing resourceName field')) {
        throw error;
      }
      
      console.warn(`Failed to generate AI questions for solution: ${error}`);
      
      // Fallback to basic open question
      return {
        required: [],
        basic: [],
        advanced: [],
        open: {
          question: "Is there anything else about your requirements or constraints that would help us provide better recommendations?",
          placeholder: "e.g., specific security requirements, performance needs, existing infrastructure constraints..."
        }
      };
    }
  }
}

 