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
import { AIProvider } from './ai-provider.interface';
import { PatternVectorService } from './pattern-vector-service';
import { OrganizationalPattern } from './pattern-types';
import { VectorDBService } from './vector-db-service';
import { CapabilityVectorService } from './capability-vector-service';
import { PolicyVectorService } from './policy-vector-service';
import { PolicyIntent } from './organizational-types';
import { loadPrompt } from './shared-prompt-loader';
import { extractJsonFromAIResponse, execAsync } from './platform-utils';
import { HelmChartInfo } from './helm-types';
import { sanitizeChartInfo } from './helm-utils';

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
  suggestedAnswer?: any;
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
  relevantPolicies?: string[];  // Policy IDs that influenced question generation
}


export interface ResourceSolution {
  type: 'single' | 'combination';
  resources: ResourceSchema[];
  score: number;
  description: string;
  reasons: string[];
  questions: QuestionGroup;
  appliedPatterns?: string[]; // Pattern descriptions that influenced this solution
}

export interface HelmRecommendation {
  reason: string;
  suggestedTool: string;
  searchQuery: string;
}

export interface SolutionResult {
  solutions: ResourceSolution[];
  helmRecommendation: HelmRecommendation | null;
}

// Note: DiscoveryFunctions interface removed as it's no longer used in capability-based approach
// explainResource function is now passed directly to findBestSolutions

export interface ClusterResourceInfo {
  name: string;
  isDefault: boolean;
}

export interface ClusterOptions {
  namespaces: string[];
  storageClasses: ClusterResourceInfo[];
  ingressClasses: ClusterResourceInfo[];
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
  private aiProvider: AIProvider;
  private patternService?: PatternVectorService;
  private capabilityService?: CapabilityVectorService;
  private policyService?: PolicyVectorService;

  constructor(aiProvider?: AIProvider) {
    // Use provided AI provider or create from environment
    this.aiProvider = aiProvider || (() => {
      // Lazy import to avoid circular dependencies
      const { createAIProvider } = require('./ai-provider-factory');
      return createAIProvider();
    })();
    
    // Initialize capability service - fail gracefully if Vector DB unavailable
    try {
      // Use environment variable for collection name (allows using test data collection)
      const collectionName = process.env.QDRANT_CAPABILITIES_COLLECTION || 'capabilities';
      const capabilityVectorDB = new VectorDBService({ collectionName });
      this.capabilityService = new CapabilityVectorService(collectionName, capabilityVectorDB);
      console.log(`✅ Capability service initialized with Vector DB (collection: ${collectionName})`);
    } catch (error) {
      console.warn('⚠️ Vector DB not available, capabilities disabled:', error);
      this.capabilityService = undefined;
    }
    
    // Initialize pattern service only if Vector DB is available
    try {
      const vectorDB = new VectorDBService({ collectionName: 'patterns' });
      this.patternService = new PatternVectorService('patterns', vectorDB);
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
    _explainResource: (resource: string) => Promise<any>,
    interaction_id?: string
  ): Promise<SolutionResult> {
    if (!this.aiProvider.isInitialized()) {
      throw new Error('AI provider not initialized. API key required for AI-powered resource ranking.');
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
        group: cap.data.group || this.extractGroupFromResourceName(cap.data.resourceName),
        apiVersion: cap.data.apiVersion, // Use stored apiVersion from capability scan
        version: cap.data.version, // Just the version part (e.g., "v1beta1")
        resourceName: cap.data.resourceName,
        capabilities: cap.data // Include capability data for AI decision-making (includes namespaced, etc.)
      }));

      // Phase 1: Add missing pattern-suggested resources to available resources list
      const enhancedResources = await this.addMissingPatternResources(capabilityFilteredResources, relevantPatterns);

      // Phase 2: AI assembles and ranks complete solutions (replaces separate selection + ranking phases)
      const solutionResult = await this.assembleAndRankSolutions(intent, enhancedResources, relevantPatterns, interaction_id);

      // If Helm is recommended, return early - questions will be generated from Helm chart values later
      if (solutionResult.helmRecommendation) {
        console.log(`🎯 Helm installation recommended for "${intent}": ${solutionResult.helmRecommendation.suggestedTool}`);
        return solutionResult;
      }

      // Phase 3: Generate questions for each capability-based solution
      for (const solution of solutionResult.solutions) {
        solution.questions = await this.generateQuestionsWithAI(intent, solution, _explainResource, interaction_id);
      }

      return solutionResult;
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
      apiVersion?: string;
      version?: string;
      resourceName: string;
      capabilities: any;
    }>,
    patterns: OrganizationalPattern[],
    interaction_id?: string
  ): Promise<SolutionResult> {
    const prompt = await this.loadSolutionAssemblyPrompt(intent, availableResources, patterns);
    const response = await this.aiProvider.sendMessage(prompt, 'recommend-solution-assembly', {
      user_intent: intent ? `Kubernetes solution assembly for: ${intent}` : 'Kubernetes solution assembly',
      interaction_id: interaction_id || 'recommend_solution_assembly'
    });
    return this.parseSimpleSolutionResponse(response.content);
  }

  /**
   * Parse AI response for simple solution structure (no schema matching needed)
   */
  private parseSimpleSolutionResponse(aiResponse: string): SolutionResult {
    try {
      // Use robust JSON extraction
      const parsed = extractJsonFromAIResponse(aiResponse);

      // Handle Helm recommendation case (presence of helmRecommendation means Helm is needed)
      const helmRecommendation: HelmRecommendation | null = parsed.helmRecommendation || null;

      // If Helm is recommended (empty solutions + helmRecommendation present), return early
      if (helmRecommendation && (!parsed.solutions || parsed.solutions.length === 0)) {
        return {
          solutions: [],
          helmRecommendation
        };
      }

      const solutions: ResourceSolution[] = (parsed.solutions || []).map((solution: any) => {
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
          questions: { required: [], basic: [], advanced: [], open: { question: '', placeholder: '' } },
          appliedPatterns: solution.appliedPatterns || []
        };
      });

      // Sort by score descending
      const sortedSolutions = solutions.sort((a, b) => b.score - a.score);

      return {
        solutions: sortedSolutions,
        helmRecommendation
      };

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
      apiVersion?: string;
      version?: string;
      resourceName: string;
      capabilities: any;
    }>,
    patterns: OrganizationalPattern[]
  ): Promise<string> {
    // Format resources for the prompt with capability information
    const resourcesText = resources.map((resource, index) => {
      return `${index}: ${resource.kind.toUpperCase()}
   Group: ${resource.group || 'core'}
   API Version: ${resource.apiVersion || 'unknown'}
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

    return loadPrompt('resource-selection', {
      intent,
      resources: resourcesText,
      patterns: patternsContext
    });
  }

  /**
   * Add pattern-suggested resources that are missing from capability search results
   */
  private async addMissingPatternResources(
    capabilityResources: Array<{
      kind: string;
      group: string;
      resourceName: string;
      capabilities: any;
    }>,
    patterns: OrganizationalPattern[]
  ): Promise<Array<{
    kind: string;
    group: string;
    resourceName: string;
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
      resourceName: string; 
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

              missingPatternResources.push({
                kind,
                group,
                resourceName,
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

  // Note: constructApiVersionFromResourceName method removed - no longer needed
  // API versions are extracted from kubectl explain schema content during manifest generation

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

      // Discover storage classes with default marking
      let storageClasses: ClusterResourceInfo[] = [];
      try {
        const storageResult = await executeKubectl(['get', 'storageclass', '-o', 'json']);
        const storageData = JSON.parse(storageResult);
        storageClasses = (storageData.items || []).map((item: any) => ({
          name: item.metadata?.name || '',
          isDefault: item.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true'
        }));
      } catch {
        // Storage classes might not be available in all clusters
        storageClasses = [];
      }

      // Discover ingress classes with default marking
      let ingressClasses: ClusterResourceInfo[] = [];
      try {
        const ingressResult = await executeKubectl(['get', 'ingressclass', '-o', 'json']);
        const ingressData = JSON.parse(ingressResult);
        ingressClasses = (ingressData.items || []).map((item: any) => ({
          name: item.metadata?.name || '',
          isDefault: item.metadata?.annotations?.['ingressclass.kubernetes.io/is-default-class'] === 'true'
        }));
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
   * Format cluster options for inclusion in prompts
   */
  private formatClusterOptionsText(clusterOptions: ClusterOptions): string {
    const formatResourceList = (items: ClusterResourceInfo[]): string => {
      if (items.length === 0) return 'None discovered';
      return items.map(item => item.isDefault ? `${item.name} (default)` : item.name).join(', ');
    };

    return `Available Namespaces: ${clusterOptions.namespaces.join(', ')}
Available Storage Classes: ${formatResourceList(clusterOptions.storageClasses)}
Available Ingress Classes: ${formatResourceList(clusterOptions.ingressClasses)}
Available Node Labels: ${clusterOptions.nodeLabels.length > 0 ? clusterOptions.nodeLabels.slice(0, 10).join(', ') : 'None discovered'}`;
  }

  /**
   * Generate contextual questions using AI based on user intent and solution resources
   */
  private async generateQuestionsWithAI(intent: string, solution: ResourceSolution, _explainResource: (resource: string) => Promise<any>, interaction_id?: string): Promise<QuestionGroup> {
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
      const clusterOptionsText = this.formatClusterOptionsText(clusterOptions);

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

      // Build source_material for capabilities (Kubernetes resource-based solutions)
      const sourceMaterial = `## Source Material
You are generating questions for Kubernetes resources. The schemas below define the available configuration options.

## Resources in Solution
${resourceDetails}`;

      // Generate question prompt with variables
      const questionPrompt = loadPrompt('question-generation', {
        intent,
        solution_description: solution.description,
        source_material: sourceMaterial,
        cluster_options: clusterOptionsText,
        policy_context: policyContextText
      });

      const response = await this.aiProvider.sendMessage(questionPrompt, 'recommend-question-generation', {
        user_intent: `Generate deployment questions for: ${intent}`,
        interaction_id: interaction_id || 'recommend_question_generation'
      });
      
      // Use robust JSON extraction
      const questions = extractJsonFromAIResponse(response.content);
      
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

  /**
   * Generate contextual questions for Helm chart installation
   */
  async generateQuestionsForHelmChart(
    intent: string,
    chart: HelmChartInfo,
    description: string,
    interaction_id?: string
  ): Promise<QuestionGroup> {
    try {
      console.log(`📊 Generating questions for Helm chart: ${chart.repositoryName}/${chart.chartName}`);

      // Fetch chart values.yaml and README
      const { valuesYaml, readme } = await this.fetchHelmChartContent(chart);

      // Discover cluster options for dynamic questions
      const clusterOptions = await this.discoverClusterOptions();

      // Search for relevant policy intents
      let relevantPolicyResults: Array<{policy: PolicyIntent, score: number, matchType: string}> = [];
      if (this.policyService) {
        try {
          const policyResults = await this.policyService.searchPolicyIntents(
            `${intent} ${chart.chartName} helm chart installation`,
            { limit: 50 }
          );
          relevantPolicyResults = policyResults.map(result => ({
            policy: result.data,
            score: result.score,
            matchType: result.matchType
          }));
          console.log(`🛡️ Found ${relevantPolicyResults.length} relevant policy intents for Helm question generation`);
        } catch (error) {
          console.warn('⚠️ Policy search failed during Helm question generation:', error);
        }
      }

      // Build source_material for Helm chart
      const sourceMaterial = `## Source Material
You are generating questions for a Helm chart installation. The values.yaml and README below define the available configuration options.

## Chart Information
- Chart: ${chart.chartName}
- Repository: ${chart.repository}
- Version: ${chart.version || 'latest'}

## Values.yaml
\`\`\`yaml
${valuesYaml || '# No values.yaml available'}
\`\`\`

## README
${readme || 'No README available'}`;

      // Format organizational policies
      const policyContextText = relevantPolicyResults.length > 0
        ? relevantPolicyResults.map(result =>
            `- ID: ${result.policy.id}
  Description: ${result.policy.description}
  Rationale: ${result.policy.rationale}
  Triggers: ${result.policy.triggers?.join(', ') || 'None'}
  Score: ${result.score.toFixed(3)} (${result.matchType})`
          ).join('\n')
        : 'No organizational policies found for this request.';

      // Format cluster options for the prompt
      const clusterOptionsText = this.formatClusterOptionsText(clusterOptions);

      // Generate questions using the shared prompt
      const questionPrompt = loadPrompt('question-generation', {
        intent,
        solution_description: description,
        source_material: sourceMaterial,
        cluster_options: clusterOptionsText,
        policy_context: policyContextText
      });

      const response = await this.aiProvider.sendMessage(questionPrompt, 'helm-question-generation', {
        user_intent: `Generate Helm installation questions for: ${intent}`,
        interaction_id: interaction_id || 'helm_question_generation'
      });

      const questions = extractJsonFromAIResponse(response.content);

      if (!questions.required || !questions.basic || !questions.advanced) {
        throw new Error('Invalid question structure from AI');
      }

      if (!questions.open) {
        questions.open = {
          question: "Any additional configuration requirements?",
          placeholder: "e.g., custom values, specific settings..."
        };
      }

      console.log(`✅ Generated ${questions.required.length} required, ${questions.basic.length} basic, ${questions.advanced.length} advanced questions`);

      return questions as QuestionGroup;
    } catch (error) {
      console.warn(`Failed to generate questions for Helm chart: ${error}`);

      // Fallback to minimal questions
      return {
        required: [
          {
            id: 'name',
            question: 'What name should be used for this Helm release?',
            type: 'text',
            suggestedAnswer: chart.chartName
          },
          {
            id: 'namespace',
            question: 'Which namespace should this be installed in?',
            type: 'text',
            suggestedAnswer: 'default'
          }
        ],
        basic: [],
        advanced: [],
        open: {
          question: "Any additional configuration requirements?",
          placeholder: "e.g., custom values, specific settings..."
        }
      };
    }
  }

  /**
   * Fetch Helm chart values.yaml and README
   */
  async fetchHelmChartContent(chart: HelmChartInfo): Promise<{ valuesYaml: string; readme: string }> {
    let valuesYaml = '';
    let readme = '';

    // Sanitize chart info to prevent command injection
    const safeChart = sanitizeChartInfo(chart);
    const versionFlag = safeChart.version ? `--version ${safeChart.version}` : '';

    try {
      // Add repo and update
      await execAsync(`helm repo add ${safeChart.repositoryName} ${safeChart.repository} 2>/dev/null || true`);
      await execAsync('helm repo update 2>/dev/null || true');
    } catch {
      console.warn(`⚠️ Could not add/update Helm repo ${safeChart.repositoryName}`);
    }

    try {
      const { stdout } = await execAsync(
        `helm show values ${safeChart.repositoryName}/${safeChart.chartName} ${versionFlag}`.trim()
      );
      valuesYaml = stdout || '';
      console.log(`📄 Fetched values.yaml (${valuesYaml.length} chars)`);
    } catch (error) {
      console.warn(`⚠️ Could not fetch values.yaml: ${error}`);
    }

    try {
      const { stdout } = await execAsync(
        `helm show readme ${safeChart.repositoryName}/${safeChart.chartName} ${versionFlag}`.trim()
      );
      readme = stdout || '';
      console.log(`📄 Fetched README (${readme.length} chars)`);
    } catch {
      // README is optional
    }

    return { valuesYaml, readme };
  }
}

 