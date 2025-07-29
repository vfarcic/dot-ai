/**
 * Organizational Data Management Tool
 * 
 * Unified MCP tool for managing organizational knowledge: deployment patterns,
 * governance policies, AI memory, and other institutional data.
 * 
 * Currently implements: patterns
 * Future: policies, memory, config
 */

import { z } from 'zod';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../core/error-handling';
import { DotAI } from '../core/index';
import { Logger } from '../core/error-handling';
import { OrganizationalPattern, CreatePatternRequest } from '../core/pattern-types';
import { 
  createPattern,
  serializePattern,
  deserializePattern 
} from '../core/pattern-operations';
import { getAndValidateSessionDirectory } from '../core/session-utils';
import * as fs from 'fs';
import * as path from 'path';

// Tool metadata for MCP registration
export const ORGANIZATIONAL_DATA_TOOL_NAME = 'manageOrgData';
export const ORGANIZATIONAL_DATA_TOOL_DESCRIPTION = 'Manage organizational deployment patterns for AI recommendations. Use this tool to create, list, get, or delete organizational deployment patterns that guide AI recommendations. CRITICAL: DO NOT call this tool with placeholder or example data. When user wants to create a pattern, you MUST ask them for each required field ONE BY ONE and wait for their actual responses before calling this tool: description, triggers (array), suggestedResources (provide list), rationale, createdBy. Only call this tool after collecting all real user data.';

// Extensible schema - ready for future data types
export const ORGANIZATIONAL_DATA_TOOL_INPUT_SCHEMA = {
  dataType: z.enum(['pattern']).describe('Type of organizational data to manage (currently only "pattern" supported)'),
  operation: z.enum(['create', 'list', 'get', 'delete']).describe('Operation to perform on the organizational data'),
  
  // Pattern-specific fields (required for create operation)
  description: z.string().optional().describe('Pattern description for Vector DB embedding (required for create) - DO NOT use placeholder data. Must ask user: What is this pattern for and when should it be used?'),
  triggers: z.array(z.string()).optional().describe('User intent keywords that match this pattern (required for create) - DO NOT use placeholder data. Must ask user: What keywords or phrases should trigger this pattern?'),
  suggestedResources: z.array(z.string()).optional().describe('Kubernetes resource types to suggest (required for create) - DO NOT use placeholder data. Must ask user to choose from: Deployment, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, ConfigMap, Secret, PersistentVolume, PersistentVolumeClaim, HorizontalPodAutoscaler, NetworkPolicy, ServiceAccount'),
  rationale: z.string().optional().describe('Why this pattern is recommended (required for create) - DO NOT use placeholder data. Must ask user: Why does this combination of resources work well together?'),
  createdBy: z.string().optional().describe('Pattern creator identifier (required for create) - DO NOT use placeholder data. Must ask user: What is your name or team identifier?'),
  
  // Generic fields for get/delete operations
  id: z.string().optional().describe('Data item ID (required for get/delete operations)'),
  
  // Generic fields for list operations
  limit: z.number().optional().describe('Maximum number of items to return (default: 10)')
};

/**
 * Pattern storage service - simple file-based implementation
 * TODO: Replace with Vector DB integration in Phase 2
 */
class PatternStorageService {
  private patternsDir: string;

  constructor(args: any = {}) {
    const sessionDir = getAndValidateSessionDirectory(args, true);
    this.patternsDir = path.join(sessionDir, 'patterns');
    this.ensurePatternDirectory();
  }

  private ensurePatternDirectory(): void {
    if (!fs.existsSync(this.patternsDir)) {
      fs.mkdirSync(this.patternsDir, { recursive: true });
    }
  }

  async create(request: CreatePatternRequest): Promise<OrganizationalPattern> {
    const pattern = createPattern(request);
    const filePath = path.join(this.patternsDir, `${pattern.id}.json`);
    
    if (fs.existsSync(filePath)) {
      throw new Error(`Pattern already exists with ID: ${pattern.id}`);
    }
    
    fs.writeFileSync(filePath, serializePattern(pattern));
    return pattern;
  }

  async list(limit: number = 10): Promise<OrganizationalPattern[]> {
    const files = fs.readdirSync(this.patternsDir)
      .filter(file => file.endsWith('.json'))
      .slice(0, limit);
    
    const patterns: OrganizationalPattern[] = [];
    for (const file of files) {
      try {
        const filePath = path.join(this.patternsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const pattern = deserializePattern(content);
        patterns.push(pattern);
      } catch (error) {
        // Skip invalid pattern files
        continue;
      }
    }
    
    // Sort by creation date (newest first)
    return patterns.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async get(id: string): Promise<OrganizationalPattern | null> {
    const filePath = path.join(this.patternsDir, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return deserializePattern(content);
    } catch (error) {
      throw new Error(`Failed to read pattern ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async delete(id: string): Promise<boolean> {
    const filePath = path.join(this.patternsDir, `${id}.json`);
    
    if (!fs.existsSync(filePath)) {
      return false;
    }
    
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete pattern ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async count(): Promise<number> {
    const files = fs.readdirSync(this.patternsDir)
      .filter(file => file.endsWith('.json'));
    return files.length;
  }
}

/**
 * Handle pattern operations
 */
async function handlePatternOperation(
  operation: string,
  args: any,
  logger: Logger,
  requestId: string
): Promise<any> {
  const storageService = new PatternStorageService(args);

  switch (operation) {
    case 'create': {
      // Validate required fields for pattern creation
      const requiredFields = ['description', 'triggers', 'suggestedResources', 'rationale', 'createdBy'];
      const missingFields = requiredFields.filter(field => !args[field]);
      
      if (missingFields.length > 0) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Missing required fields for pattern creation: ${missingFields.join(', ')}`,
          {
            operation: 'pattern_create_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: { provided: Object.keys(args), missing: missingFields }
          }
        );
      }

      const createRequest: CreatePatternRequest = {
        description: args.description,
        triggers: args.triggers,
        suggestedResources: args.suggestedResources,
        rationale: args.rationale,
        createdBy: args.createdBy
      };

      const pattern = await storageService.create(createRequest);
      
      logger.info('Pattern created successfully', { 
        requestId, 
        patternId: pattern.id,
        description: pattern.description.substring(0, 50) + (pattern.description.length > 50 ? '...' : ''),
        triggersCount: pattern.triggers.length,
        resourcesCount: pattern.suggestedResources.length
      });

      return {
        success: true,
        operation: 'create',
        dataType: 'pattern',
        data: {
          id: pattern.id,
          description: pattern.description,
          triggers: pattern.triggers,
          suggestedResources: pattern.suggestedResources,
          rationale: pattern.rationale,
          createdAt: pattern.createdAt,
          createdBy: pattern.createdBy
        },
        message: `Pattern created successfully with ID: ${pattern.id}`
      };
    }

    case 'list': {
      const limit = args.limit || 10;
      const patterns = await storageService.list(limit);
      const totalCount = await storageService.count();

      logger.info('Patterns listed successfully', { 
        requestId, 
        returnedCount: patterns.length,
        totalCount,
        limit
      });

      return {
        success: true,
        operation: 'list',
        dataType: 'pattern',
        data: {
          patterns: patterns.map(p => ({
            id: p.id,
            description: p.description.substring(0, 100) + (p.description.length > 100 ? '...' : ''),
            triggersCount: p.triggers.length,
            resourcesCount: p.suggestedResources.length,
            createdAt: p.createdAt,
            createdBy: p.createdBy
          })),
          totalCount,
          returnedCount: patterns.length,
          limit
        },
        message: `Found ${patterns.length} of ${totalCount} total patterns`
      };
    }

    case 'get': {
      if (!args.id) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Pattern ID is required for get operation',
          {
            operation: 'pattern_get_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: args
          }
        );
      }

      const pattern = await storageService.get(args.id);
      
      if (!pattern) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          `Pattern not found with ID: ${args.id}`,
          {
            operation: 'pattern_get',
            component: 'OrganizationalDataTool',
            requestId,
            input: { id: args.id }
          }
        );
      }

      logger.info('Pattern retrieved successfully', { 
        requestId, 
        patternId: pattern.id,
        description: pattern.description.substring(0, 50) + (pattern.description.length > 50 ? '...' : '')
      });

      return {
        success: true,
        operation: 'get',
        dataType: 'pattern',
        data: pattern,
        message: `Retrieved pattern: ${pattern.description.substring(0, 50)}${pattern.description.length > 50 ? '...' : ''}`
      };
    }

    case 'delete': {
      if (!args.id) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          'Pattern ID is required for delete operation',
          {
            operation: 'pattern_delete_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: args
          }
        );
      }

      // Get pattern info before deletion for logging
      const pattern = await storageService.get(args.id);
      const deleted = await storageService.delete(args.id);
      
      if (!deleted) {
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.MEDIUM,
          `Pattern not found with ID: ${args.id}`,
          {
            operation: 'pattern_delete',
            component: 'OrganizationalDataTool',
            requestId,
            input: { id: args.id }
          }
        );
      }

      logger.info('Pattern deleted successfully', { 
        requestId, 
        patternId: args.id,
        description: pattern?.description?.substring(0, 50) + (pattern?.description && pattern.description.length > 50 ? '...' : '') || 'unknown'
      });

      return {
        success: true,
        operation: 'delete',
        dataType: 'pattern',
        data: { id: args.id },
        message: `Pattern deleted successfully: ${args.id}`
      };
    }

    default:
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        `Unsupported pattern operation: ${operation}`,
        {
          operation: 'pattern_operation_validation',
          component: 'OrganizationalDataTool',
          requestId,
          input: { operation, supportedOperations: ['create', 'list', 'get', 'delete'] }
        }
      );
  }
}

/**
 * Main tool handler - routes to appropriate data type handler
 */
export async function handleOrganizationalDataTool(
  args: any,
  _dotAI: DotAI | null,
  logger: Logger,
  requestId: string
): Promise<any> {
  try {
    logger.info('Processing organizational-data tool request', { 
      requestId, 
      dataType: args.dataType,
      operation: args.operation
    });

    // Validate required parameters
    if (!args.dataType) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        'dataType parameter is required',
        {
          operation: 'organizational_data_validation',
          component: 'OrganizationalDataTool',
          requestId,
          input: args
        }
      );
    }

    if (!args.operation) {
      throw ErrorHandler.createError(
        ErrorCategory.VALIDATION,
        ErrorSeverity.HIGH,
        'operation parameter is required',
        {
          operation: 'organizational_data_validation',
          component: 'OrganizationalDataTool',
          requestId,
          input: args
        }
      );
    }

    // Route to appropriate handler based on data type
    let result;
    switch (args.dataType) {
      case 'pattern':
        result = await handlePatternOperation(args.operation, args, logger, requestId);
        break;
      
      // Future data types will be added here:
      // case 'policy':
      //   result = await handlePolicyOperation(args.operation, args, logger, requestId);
      //   break;
      // case 'memory':
      //   result = await handleMemoryOperation(args.operation, args, logger, requestId);
      //   break;
      
      default:
        throw ErrorHandler.createError(
          ErrorCategory.VALIDATION,
          ErrorSeverity.HIGH,
          `Unsupported data type: ${args.dataType}. Currently supported: pattern`,
          {
            operation: 'data_type_validation',
            component: 'OrganizationalDataTool',
            requestId,
            input: { dataType: args.dataType, supportedTypes: ['pattern'] }
          }
        );
    }

    logger.info('Organizational-data tool request completed successfully', { 
      requestId, 
      dataType: args.dataType,
      operation: args.operation,
      success: result.success
    });

    // Return consistent MCP response format
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(result, null, 2)
      }]
    };

  } catch (error) {
    logger.error('Organizational-data tool request failed', error as Error);

    // Handle errors consistently
    if (error instanceof Error && 'category' in error) {
      // Already an AppError, format for MCP response
      const appError = error as any;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: {
              message: appError.message,
              category: appError.category,
              severity: appError.severity,
              code: appError.code
            },
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    }

    // Generic error handling
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: {
            message: errorMessage,
            category: 'OPERATION',
            severity: 'HIGH'
          },
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }
}