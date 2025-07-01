/**
 * JSON Schema Validation System for MCP Tools
 * 
 * Provides centralized validation for MCP function inputs and outputs
 * using lightweight JSON schema validation without external dependencies.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ValidationError {
  path: string;
  message: string;
  value?: any;
}

export class SchemaValidator {
  /**
   * Validate data against a JSON schema
   */
  static validate(data: any, schema: JSONSchema, path: string = 'root'): ValidationError[] {
    const errors: ValidationError[] = [];

    // Handle null/undefined values
    if (data === null || data === undefined) {
      errors.push({
        path,
        message: 'Value is required but null/undefined',
        value: data
      });
      return errors;
    }

    // Type validation
    const dataType = this.getJsonType(data);
    if (schema.type && schema.type !== dataType) {
      // Handle special case for integer vs number
      if (schema.type === 'number' && dataType === 'number') {
        // Continue validation for numbers
      } else if (schema.type === 'integer' && dataType === 'number') {
        // Integer validation will be handled in validateNumber
      } else {
        errors.push({
          path,
          message: `Expected type '${schema.type}' but got '${dataType}'`,
          value: data
        });
        return errors; // Stop further validation on type mismatch
      }
    }

    // Type-specific validation
    switch (schema.type) {
      case 'object':
        errors.push(...this.validateObject(data, schema, path));
        break;
      case 'array':
        errors.push(...this.validateArray(data, schema, path));
        break;
      case 'string':
        errors.push(...this.validateString(data, schema, path));
        break;
      case 'number':
      case 'integer':
        errors.push(...this.validateNumber(data, schema, path));
        break;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value: data
      });
    }

    return errors;
  }

  /**
   * Validate MCP tool input parameters
   */
  static validateToolInput(toolName: string, args: any, schema: JSONSchema): void {
    const errors = this.validate(args, schema, 'input');
    
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.path}: ${e.message}`).join('; ');
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid parameters for tool '${toolName}': ${errorMessages}`
      );
    }
  }

  /**
   * Validate MCP tool output data
   */
  static validateToolOutput(toolName: string, data: any, schema: JSONSchema): void {
    const errors = this.validate(data, schema, 'output');
    
    if (errors.length > 0) {
      const errorMessages = errors.map(e => `${e.path}: ${e.message}`).join('; ');
      throw new McpError(
        ErrorCode.InternalError,
        `Invalid output from tool '${toolName}': ${errorMessages}`
      );
    }
  }

  /**
   * Validate solution data with enhanced open question enforcement
   */
  static validateSolutionData(solutionData: any): ValidationError[] {
    const errors = this.validate(solutionData, MCPToolSchemas.SOLUTION_DATA, 'solution_data');
    
    // Add enhanced validation for open question answers
    if (solutionData?.questions?.open?.answer !== undefined) {
      const answer = solutionData.questions.open.answer;
      
      if (typeof answer === 'string') {
        const trimmed = answer.trim();
        if (trimmed === '') {
          errors.push({
            path: 'solution_data.questions.open.answer',
            message: 'Open question answer cannot be empty. Use "none" or "n/a" if no requirements.',
            value: answer
          });
        }
      }
    }
    
    return errors;
  }

  private static getJsonType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private static validateObject(data: any, schema: JSONSchema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!schema.properties) return errors;

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in data)) {
          errors.push({
            path: `${path}.${requiredProp}`,
            message: 'Required property is missing',
          });
        }
      }
    }

    // Validate each property
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propName in data) {
        const propPath = `${path}.${propName}`;
        errors.push(...this.validate(data[propName], propSchema, propPath));
      }
    }

    return errors;
  }

  private static validateArray(data: any, schema: JSONSchema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!Array.isArray(data)) {
      errors.push({
        path,
        message: 'Expected array',
        value: data
      });
      return errors;
    }

    // Validate each item if items schema is provided
    if (schema.items) {
      data.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        errors.push(...this.validate(item, schema.items!, itemPath));
      });
    }

    return errors;
  }

  private static validateString(data: any, schema: JSONSchema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof data !== 'string') {
      errors.push({
        path,
        message: 'Expected string',
        value: data
      });
      return errors;
    }

    // Length validation
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String length must be at least ${schema.minLength}`,
        value: data
      });
    }

    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String length must be at most ${schema.maxLength}`,
        value: data
      });
    }

    // Pattern validation
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push({
          path,
          message: `String does not match pattern: ${schema.pattern}`,
          value: data
        });
      }
    }

    return errors;
  }

  private static validateNumber(data: any, schema: JSONSchema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (typeof data !== 'number') {
      errors.push({
        path,
        message: 'Expected number',
        value: data
      });
      return errors;
    }

    // Integer validation
    if (schema.type === 'integer' && !Number.isInteger(data)) {
      errors.push({
        path,
        message: 'Expected integer',
        value: data
      });
    }

    // Range validation
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path,
        message: `Number must be at least ${schema.minimum}`,
        value: data
      });
    }

    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path,
        message: `Number must be at most ${schema.maximum}`,
        value: data
      });
    }

    return errors;
  }
}

/**
 * MCP Tool Schema Definitions
 * 
 * Centralized schema definitions for all MCP tools
 */
export class MCPToolSchemas {
  // Input schema for recommend tool
  static readonly RECOMMEND_INPUT: JSONSchema = {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        description: 'What the user wants to deploy, create, run, or setup on Kubernetes (based on their description). Ask the user to describe their application first, then use their response here. Examples: "deploy a web application", "create a database cluster", "run my Node.js API", "setup a Redis cache", "launch a microservice", "build a CI/CD pipeline", "deploy a WordPress site", "create a monitoring stack", "run a Python Flask app", "setup MongoDB", "deploy a React frontend", "create a load balancer"',
        minLength: 1,
        maxLength: 1000
      }
    },
    required: ['intent']
  };

  // Input schema for enhance_solution tool
  static readonly ENHANCE_SOLUTION_INPUT: JSONSchema = {
    type: 'object',
    properties: {
      solution_data: {
        type: 'string',
        description: 'JSON string containing the solution to enhance',
        minLength: 1
      }
    },
    required: ['solution_data']
  };

  // Output schema for MCP responses
  static readonly MCP_RESPONSE_OUTPUT: JSONSchema = {
    type: 'object',
    properties: {
      content: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['text']
            },
            text: {
              type: 'string',
              minLength: 1
            }
          },
          required: ['type', 'text']
        }
      }
    },
    required: ['content']
  };

  // Schema for solution data structure (used in enhance_solution)
  static readonly SOLUTION_DATA: JSONSchema = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['single', 'multi', 'enhanced'] },
      score: { type: 'number', minimum: 0, maximum: 100 },
      description: { type: 'string', minLength: 1 },
      questions: {
        type: 'object',
        properties: {
          open: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              placeholder: { type: 'string' },
              answer: { 
                type: 'string',
                minLength: 1,
                description: 'User response to the open question. Can be "none", "n/a", or any meaningful response. Empty strings are not allowed.'
              }
            },
            required: ['answer']
          }
        },
        required: ['open']
      }
    },
    required: ['questions']
  };

  /**
   * Get input schema for a specific tool
   */
  static getInputSchema(toolName: string): JSONSchema {
    switch (toolName) {
      case 'recommend':
        return this.RECOMMEND_INPUT;
      case 'enhance_solution':
        return this.ENHANCE_SOLUTION_INPUT;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Get output schema for MCP responses
   */
  static getOutputSchema(): JSONSchema {
    return this.MCP_RESPONSE_OUTPUT;
  }
}