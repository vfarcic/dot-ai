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

export interface ResourceSolution {
  type: 'single' | 'combination';
  resources: ResourceSchema[];
  score: number;
  description: string;
  reasons: string[];
  analysis: string;
  deploymentOrder: number[];
  dependencies: string[];
}

export interface AIRankingConfig {
  claudeApiKey: string;
}

export interface DiscoveryFunctions {
  discoverResources: () => Promise<any>;
  explainResource: (resource: string) => Promise<any>;
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
    const resourceSummary = resources.map((resource, index) => 
      `${index}: ${resource.kind} (${resource.apiVersion || (resource.group ? `${resource.group}/${resource.version}` : resource.version)})
   Group: ${resource.group || 'core'}
   Namespaced: ${resource.namespaced || resource.scope === 'Namespaced'}`
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
      // Extract JSON from response
      const jsonMatch = response.content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || [null, response.content];
      const jsonContent = jsonMatch[1] || response.content;
      const selectedResources = JSON.parse(jsonContent);
      
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
      throw new Error(`Could not fetch schemas for any selected resources. Errors: ${errors.join(', ')}`);
    }

    if (errors.length > 0) {
      console.warn(`Some resources could not be analyzed: ${errors.join(', ')}`);
    }

    return schemas;
  }

  /**
   * Phase 3: Rank resources with detailed schema information
   */
  private async rankWithDetailedSchemas(intent: string, schemas: ResourceSchema[]): Promise<ResourceSolution[]> {
    const prompt = await this.loadPromptTemplate(intent, schemas);
    const response = await this.claudeIntegration.sendMessage(prompt);
    return this.parseAISolutionResponse(response.content, schemas);
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
      const jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [null, aiResponse];
      const jsonContent = jsonMatch[1] || aiResponse;
      
      const parsed = JSON.parse(jsonContent);
      
      const solutions: ResourceSolution[] = parsed.solutions.map((solution: any) => {
        const resources = solution.resourceIndexes.map((index: number) => schemas[index]).filter(Boolean);
        
        if (resources.length === 0) {
          throw new Error(`Invalid resource indexes: ${solution.resourceIndexes}`);
        }
        
        return {
          type: solution.type,
          resources,
          score: solution.score,
          description: solution.description,
          reasons: solution.reasons || [],
          analysis: solution.analysis || '',
          deploymentOrder: solution.deploymentOrder || solution.resourceIndexes,
          dependencies: solution.dependencies || []
        };
      });

      // Sort by score descending
      return solutions.sort((a, b) => b.score - a.score);
      
    } catch (error) {
      throw new Error(`Failed to parse AI solution response: ${error}`);
    }
  }
} 