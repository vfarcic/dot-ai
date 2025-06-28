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

export interface RankingResult {
  schema: ResourceSchema;
  score: number;
  reasons: string[];
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
 * ResourceRanker ranks resources based on user intent and capabilities
 */
export class ResourceRanker {
  /**
   * Rank resources by how well they match user intent
   */
  rankResourcesByIntent(intent: string, schemas: ResourceSchema[]): RankingResult[] {
    const rankings: RankingResult[] = [];

    for (const schema of schemas) {
      const score = this.calculateCapabilityScore(intent, schema);
      const reasons = this.extractScoringReasons(intent, schema);
      
      rankings.push({
        schema,
        score,
        reasons
      });
    }

    // Sort by score descending
    return rankings.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate capability score based on intent matching
   */
  calculateCapabilityScore(intent: string, schema: ResourceSchema): number {
    let score = 0;
    const intentLower = intent.toLowerCase();
    const description = schema.description.toLowerCase();
    const kind = schema.kind.toLowerCase();

    // Keyword scoring
    const keywords = {
      // Deployment-related keywords
      'scalable': kind === 'deployment' ? 10 : 0,
      'replica': kind === 'deployment' ? 8 : 0,
      'declarative': description.includes('declarative') ? 5 : 0,
      'update': description.includes('update') ? 3 : 0,
      
      // Service-related keywords
      'expose': kind === 'service' ? 10 : 0,
      'load': kind === 'service' ? 8 : 0,
      'network': kind === 'service' ? 6 : 0,
      'traffic': kind === 'service' ? 5 : 0,
      
      // Pod-related keywords (typically lower score for production)
      'container': kind === 'pod' ? 3 : 0,
      'simple': kind === 'pod' ? 2 : 0,
      
      // Auto-scaling keywords
      'auto-scaling': kind === 'deployment' ? 8 : 0,
      'scaling': kind === 'deployment' ? 6 : 0,
      
      // Production keywords (favor higher-level abstractions)
      'production': kind === 'deployment' ? 5 : kind === 'pod' ? -3 : 0,
      'availability': kind === 'deployment' ? 4 : 0
    };

    // Add scores for matching keywords
    for (const [keyword, points] of Object.entries(keywords)) {
      if (intentLower.includes(keyword)) {
        score += points;
      }
    }

    // Base scores by resource type
    const baseScores: { [key: string]: number } = {
      'deployment': 5,
      'service': 5,
      'configmap': 3,
      'secret': 3,
      'pod': 1 // Lower base score for direct pod usage
    };

    score += baseScores[kind] || 0;

    return Math.max(0, score);
  }

  /**
   * Extract reasons for scoring
   */
  extractScoringReasons(intent: string, schema: ResourceSchema): string[] {
    const reasons: string[] = [];
    const intentLower = intent.toLowerCase();
    const description = schema.description.toLowerCase();
    const kind = schema.kind.toLowerCase();

    // Check for keyword matches
    const reasonKeywords = [
      'scalable', 'replica', 'declarative', 'update', 'expose', 
      'load', 'network', 'traffic', 'auto-scaling', 'scaling',
      'production', 'availability', 'container'
    ];

    for (const keyword of reasonKeywords) {
      if (intentLower.includes(keyword)) {
        if ((keyword === 'scalable' || keyword === 'replica') && kind === 'deployment') {
          reasons.push(keyword);
        } else if (keyword === 'expose' && kind === 'service') {
          reasons.push(keyword);
        } else if (description.includes(keyword)) {
          reasons.push(keyword);
        } else if (intentLower.includes(keyword)) {
          reasons.push(keyword);
        }
      }
    }

    return [...new Set(reasons)]; // Remove duplicates
  }
} 