/**
 * Tool Discovery and Execution Schemas
 *
 * Schemas for the /api/v1/tools and /api/v1/tools/:toolName endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { createSuccessResponseSchema, NotFoundErrorSchema, BadRequestErrorSchema, InternalServerErrorSchema } from './common';

/**
 * Tool parameter schema
 */
export const ToolParameterSchema = z.object({
  name: z.string().describe('Parameter name'),
  type: z.string().describe('Parameter type (string, number, boolean, object, array)'),
  description: z.string().describe('Parameter description'),
  required: z.boolean().describe('Whether the parameter is required'),
  default: z.any().optional().describe('Default value if not provided'),
  enum: z.array(z.string()).optional().describe('Allowed values for enum parameters'),
});

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

/**
 * Tool information schema
 * Matches ToolInfo from rest-registry.ts
 */
export const ToolInfoSchema = z.object({
  name: z.string().describe('Tool name/identifier'),
  description: z.string().describe('Tool description'),
  category: z.string().optional().describe('Tool category for grouping'),
  tags: z.array(z.string()).optional().describe('Tags for filtering'),
  parameters: z.array(ToolParameterSchema).optional().describe('Tool parameters'),
  inputSchema: z.record(z.string(), z.any()).optional().describe('JSON Schema for tool input'),
});

export type ToolInfo = z.infer<typeof ToolInfoSchema>;

/**
 * Tool discovery response data
 */
export const ToolDiscoveryDataSchema = z.object({
  tools: z.array(ToolInfoSchema).describe('List of available tools'),
  total: z.number().describe('Total number of tools'),
  categories: z.array(z.string()).optional().describe('Available categories'),
  tags: z.array(z.string()).optional().describe('Available tags'),
});

export type ToolDiscoveryData = z.infer<typeof ToolDiscoveryDataSchema>;

/**
 * Tool discovery response schema
 * GET /api/v1/tools
 */
export const ToolDiscoveryResponseSchema = createSuccessResponseSchema(ToolDiscoveryDataSchema);

export type ToolDiscoveryResponse = z.infer<typeof ToolDiscoveryResponseSchema>;

/**
 * Tool execution result data
 */
export const ToolExecutionDataSchema = z.object({
  result: z.any().describe('Tool execution result'),
  tool: z.string().describe('Name of the executed tool'),
  executionTime: z.number().optional().describe('Execution time in milliseconds'),
});

export type ToolExecutionData = z.infer<typeof ToolExecutionDataSchema>;

/**
 * Tool execution response schema
 * POST /api/v1/tools/:toolName
 */
export const ToolExecutionResponseSchema = createSuccessResponseSchema(ToolExecutionDataSchema);

export type ToolExecutionResponse = z.infer<typeof ToolExecutionResponseSchema>;

/**
 * Tool not found error
 */
export const ToolNotFoundErrorSchema = NotFoundErrorSchema.extend({
  error: z.object({
    code: z.literal('TOOL_NOT_FOUND'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * Invalid tool request error
 */
export const InvalidToolRequestErrorSchema = BadRequestErrorSchema.extend({
  error: z.object({
    code: z.literal('INVALID_REQUEST'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * Tool execution error
 */
export const ToolExecutionErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('EXECUTION_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * Tool discovery error
 */
export const ToolDiscoveryErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('DISCOVERY_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});
