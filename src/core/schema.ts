/**
 * Resource Schema Parser and Validator
 * 
 * Implements comprehensive schema parsing and validation for Kubernetes resources
 * Fetches structured OpenAPI schemas from Kubernetes API server and validates manifests
 */

import { ResourceExplanation } from './discovery';
import { 
  executeKubectl, 
  KubectlConfig 
} from './kubernetes-utils';
import { ClaudeIntegration } from './claude';

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
  version: string;
  description: string;
  properties: Map<string, SchemaField>;
  required: string[];
  namespace: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
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
  };
}

export interface QuestionGroup {
  required: Question[];
  basic: Question[];
  advanced: Question[];
  open: {
    question: string;
    placeholder: string;
  };
}

export interface ResourceSolution {
  id: string;
  type: 'single' | 'combination';
  resources: ResourceSchema[];
  score: number;
  description: string;
  reasons: string[];
  analysis: string;
  deploymentOrder: number[];
  dependencies: string[];
  questions: QuestionGroup;
}

export interface AIRankingConfig {
  claudeApiKey: string;
}

export interface DiscoveryFunctions {
  discoverResources: () => Promise<any>;
  explainResource: (resource: string) => Promise<any>;
}

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

    // Extract enum values
    const enumMatch = description.match(/(?:possible values|valid values|values)\s*(?:are)?:\s*([^.]+)/i);
    if (enumMatch) {
      const values = enumMatch[1]
        .split(/,|\s+and\s+/)
        .map(v => v.trim())
        .filter(v => v.length > 0);
      constraints.enum = values;
    }

    // Extract default values - handle multiple patterns: "(default: value)", "defaults to value", ". Default: value"
    const defaultMatch = description.match(/(?:\(default:\s*([^)]+)\)|(?:defaults?\s+to\s+(\w+))|(?:\.\s+default:\s*(\w+)))/i);
    if (defaultMatch) {
      const defaultValue = (defaultMatch[1] || defaultMatch[2] || defaultMatch[3]).trim();
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
      
      const result = await executeKubectl(args, { kubeconfig: config?.kubeconfig });
      
      // If we get here, validation passed
      // kubectl dry-run will throw an error if validation fails
      
      // Add best practice warnings by reading the manifest
      const fs = await import('fs');
      const yaml = await import('yaml');
      const manifestContent = yaml.parse(fs.readFileSync(manifestPath, 'utf8')) as any;
      this.addBestPracticeWarnings(manifestContent, warnings);
      
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

  constructor(config: AIRankingConfig) {
    this.config = config;
    this.claudeIntegration = new ClaudeIntegration(config.claudeApiKey);
  }

  /**
   * Find the best resource solution(s) for user intent using two-phase analysis
   */
  async findBestSolutions(
    intent: string, 
    discoverResources: () => Promise<any>,
    explainResource: (resource: string) => Promise<any>
  ): Promise<ResourceSolution[]> {
    if (!this.claudeIntegration.isInitialized()) {
      throw new Error('Claude integration not initialized. API key required for AI-powered resource ranking.');
    }

    try {
      // Phase 1: Get lightweight resource list and let AI select candidates
      const resourceMap = await discoverResources();
      const allResources = [...resourceMap.resources, ...resourceMap.custom];
      const candidates = await this.selectResourceCandidates(intent, allResources);

      // Phase 2: Fetch detailed schemas for selected candidates and rank
      const schemas = await this.fetchDetailedSchemas(candidates, explainResource);
      return await this.rankWithDetailedSchemas(intent, schemas);
    } catch (error) {
      throw new Error(`AI-powered resource solution analysis failed: ${error}`);
    }
  }

  /**
   * Phase 1: AI selects promising resource candidates from lightweight list
   */
  private async selectResourceCandidates(intent: string, resources: any[]): Promise<any[]> {
    // Normalize resource structures between standard resources and CRDs
    const normalizedResources = resources.map(resource => {
      // Handle both standard resources and CRDs
      const apiVersion = resource.apiVersion || 
                        (resource.group ? `${resource.group}/${resource.version}` : resource.version);
      const isNamespaced = resource.namespaced !== undefined ? 
                          resource.namespaced : 
                          resource.scope === 'Namespaced';
      
      return {
        ...resource,
        apiVersion,
        namespaced: isNamespaced
      };
    });

    const resourceSummary = normalizedResources.map((resource, index) => 
      `${index}: ${resource.kind} (${resource.apiVersion})
   Group: ${resource.group || 'core'}
   Namespaced: ${resource.namespaced}`
    ).join('\n\n');

    const fs = await import('fs');
    const path = await import('path');
    
    const promptPath = path.join(process.cwd(), 'prompts', 'resource-selection.md');
    const template = fs.readFileSync(promptPath, 'utf8');
    
    const selectionPrompt = template
      .replace('{intent}', intent)
      .replace('{resources}', resourceSummary);

    const response = await this.claudeIntegration.sendMessage(selectionPrompt);
    
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
    const parser = new SchemaParser();
    const errors: string[] = [];

    for (const resource of candidates) {
      try {
        const explanation = await explainResource(resource.kind);
        const schema = parser.parseResourceExplanation(explanation);
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
   * Phase 3: Rank resources with detailed schema information
   */
  private async rankWithDetailedSchemas(intent: string, schemas: ResourceSchema[]): Promise<ResourceSolution[]> {
    const prompt = await this.loadPromptTemplate(intent, schemas);
    const response = await this.claudeIntegration.sendMessage(prompt);
    const solutions = this.parseAISolutionResponse(response.content, schemas);
    
    // Generate AI-powered questions for each solution
    for (const solution of solutions) {
      solution.questions = await this.generateQuestionsWithAI(intent, solution);
    }
    
    return solutions;
  }

  /**
   * Load and format prompt template from file
   */
  private async loadPromptTemplate(intent: string, schemas: ResourceSchema[]): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    
    const promptPath = path.join(process.cwd(), 'prompts', 'resource-solution-ranking.md');
    const template = fs.readFileSync(promptPath, 'utf8');
    
    // Format resources for the prompt
    const resourcesText = schemas.map((schema, index) => 
      `${index}: ${schema.kind} (${schema.apiVersion})
   Group: ${schema.group || 'core'}
   Description: ${schema.description}
   Namespaced: ${schema.namespace}`
    ).join('\n\n');
    
    return template
      .replace('{intent}', intent)
      .replace('{resources}', resourcesText);
  }

  /**
   * Parse AI response into solution results
   */
  private parseAISolutionResponse(aiResponse: string, schemas: ResourceSchema[]): ResourceSolution[] {
    try {
      // Extract JSON from AI response (may be wrapped in markdown)
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
      
      const parsed = JSON.parse(jsonContent.trim());
      
      const solutions: ResourceSolution[] = parsed.solutions.map((solution: any) => {
        const isDebugMode = process.env.APP_AGENT_DEBUG === 'true';
        
        if (isDebugMode) {
          console.debug('DEBUG: solution object:', JSON.stringify(solution, null, 2));
          console.debug('DEBUG: solution.resourceIndexes type:', typeof solution.resourceIndexes);
          console.debug('DEBUG: solution.resourceIndexes value:', solution.resourceIndexes);
        }
        
        const resourcesWithIndex = solution.resourceIndexes.map((index: number) => ({ index, schema: schemas[index] }));
        const resources = resourcesWithIndex.filter((r: any) => r.schema).map((r: any) => r.schema);
        
        if (resources.length === 0) {
          if (isDebugMode) {
            console.debug('DEBUG: In error block, solution.resourceIndexes:', solution.resourceIndexes);
            console.debug('DEBUG: In error block, resourcesWithIndex:', resourcesWithIndex);
            console.debug('DEBUG: In error block, resources after filter:', resources);
          }
          
          const debugInfo = {
            requestedIndexes: solution.resourceIndexes,
            availableSchemas: schemas.map((s, i) => ({ index: i, kind: s.kind })),
            schemasCount: schemas.length,
            resourceMapping: resourcesWithIndex.map((r: any) => ({ index: r.index, found: !!r.schema, kind: r.schema?.kind || 'undefined' })),
            invalidIndexes: solution.resourceIndexes.filter((idx: number) => idx >= schemas.length || idx < 0)
          };
          throw new Error(`Invalid resource indexes: ${JSON.stringify(debugInfo, null, 2)}`);
        }
        
        return {
          id: `sol-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: solution.type,
          resources,
          score: solution.score,
          description: solution.description,
          reasons: solution.reasons || [],
          analysis: solution.analysis || '',
          deploymentOrder: solution.deploymentOrder || solution.resourceIndexes,
          dependencies: solution.dependencies || [],
          questions: { required: [], basic: [], advanced: [], open: { question: '', placeholder: '' } }
        };
      });

      // Sort by score descending
      return solutions.sort((a, b) => b.score - a.score);
      
    } catch (error) {
      // Enhanced error message with more context
      const errorMsg = `Failed to parse AI solution response: ${(error as Error).message}`;
      const contextMsg = `\nAI Response (first 500 chars): "${aiResponse.substring(0, 500)}..."`;
      const schemasMsg = `\nAvailable schemas: ${schemas.map(s => s.kind).join(', ')} (total: ${schemas.length})`;
      throw new Error(errorMsg + contextMsg + schemasMsg);
    }
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
   * Generate contextual questions using AI based on user intent and solution resources
   */
  private async generateQuestionsWithAI(intent: string, solution: ResourceSolution): Promise<QuestionGroup> {
    try {
      // Discover cluster options for dynamic questions
      const clusterOptions = await this.discoverClusterOptions();

      // Format resource details for the prompt
      const resourceDetails = solution.resources.map(resource => {
        const properties = Array.from(resource.properties.entries()).map(([key, field]) => {
          const nestedFields = Array.from(field.nested.entries()).map(([nestedKey, nestedField]) => 
            `    ${nestedKey}: ${nestedField.type} - ${nestedField.description}`
          ).join('\n');
          
          return `  ${key}: ${field.type} - ${field.description}${field.required ? ' (required)' : ''}${nestedFields ? '\n' + nestedFields : ''}`;
        }).join('\n');

        return `${resource.kind} (${resource.apiVersion}):
  Description: ${resource.description}
  Required fields: ${resource.required.join(', ')}
  Properties:
${properties}`;
      }).join('\n\n');

      // Format cluster options for the prompt
      const clusterOptionsText = `Available Namespaces: ${clusterOptions.namespaces.join(', ')}
Available Storage Classes: ${clusterOptions.storageClasses.length > 0 ? clusterOptions.storageClasses.join(', ') : 'None discovered'}
Available Ingress Classes: ${clusterOptions.ingressClasses.length > 0 ? clusterOptions.ingressClasses.join(', ') : 'None discovered'}
Available Node Labels: ${clusterOptions.nodeLabels.length > 0 ? clusterOptions.nodeLabels.slice(0, 10).join(', ') : 'None discovered'}`;

      // Load and format the question generation prompt
      const fs = await import('fs');
      const path = await import('path');
      
      const promptPath = path.join(process.cwd(), 'prompts', 'question-generation.md');
      const template = fs.readFileSync(promptPath, 'utf8');
      
      const questionPrompt = template
        .replace('{intent}', intent)
        .replace('{solution_description}', solution.description)
        .replace('{resource_details}', resourceDetails)
        .replace('{cluster_options}', clusterOptionsText);

      const response = await this.claudeIntegration.sendMessage(questionPrompt);
      
      // Extract JSON from response
      const jsonMatch = response.content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || [null, response.content];
      const jsonContent = jsonMatch[1] || response.content;
      
      const questions = JSON.parse(jsonContent);
      
      // Validate the response structure
      if (!questions.required || !questions.basic || !questions.advanced || !questions.open) {
        throw new Error('Invalid question structure from AI');
      }
      
      return questions as QuestionGroup;
    } catch (error) {
      console.warn(`Failed to generate AI questions for solution ${solution.id}: ${error}`);
      
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