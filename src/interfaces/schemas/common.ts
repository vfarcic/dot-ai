/**
 * Common REST API Response Schemas
 *
 * Base schemas used by all REST API endpoints.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';

/**
 * Response metadata schema
 */
export const MetaSchema = z.object({
  timestamp: z.string().describe('ISO 8601 timestamp of the response'),
  requestId: z
    .string()
    .optional()
    .describe('Unique request identifier for tracing'),
  version: z.string().describe('API version'),
});

export type Meta = z.infer<typeof MetaSchema>;

/**
 * Error details schema
 */
export const ErrorDetailsSchema = z.object({
  code: z.string().describe('Machine-readable error code'),
  message: z.string().describe('Human-readable error message'),
  details: z.any().optional().describe('Additional error context'),
});

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

/**
 * Base REST API response schema
 * All endpoint responses extend this structure
 */
export const RestApiResponseSchema = z.object({
  success: z.boolean().describe('Whether the request was successful'),
  data: z.any().optional().describe('Response payload'),
  error: ErrorDetailsSchema.optional().describe(
    'Error information if success is false'
  ),
  meta: MetaSchema.optional().describe('Response metadata'),
});

export type RestApiResponse = z.infer<typeof RestApiResponseSchema>;

/**
 * Success response factory - creates a typed success response schema
 */
export function createSuccessResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T
) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: MetaSchema.optional(),
  });
}

/**
 * Error response schema for failed requests
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: ErrorDetailsSchema,
  meta: MetaSchema.optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Common error response schemas by HTTP status
 */
export const NotFoundErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.literal('NOT_FOUND'),
  }),
});

export const BadRequestErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.enum([
      'BAD_REQUEST',
      'INVALID_REQUEST',
      'MISSING_PARAMETER',
      'INVALID_PARAMETER',
      'VALIDATION_ERROR',
    ]),
  }),
});

export const MethodNotAllowedErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.literal('METHOD_NOT_ALLOWED'),
  }),
});

export const ServiceUnavailableErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.enum([
      'AI_NOT_CONFIGURED',
      'PLUGIN_UNAVAILABLE',
      'VECTOR_DB_UNAVAILABLE',
      'SERVICE_UNAVAILABLE',
    ]),
  }),
});

export const InternalServerErrorSchema = ErrorResponseSchema.extend({
  error: ErrorDetailsSchema.extend({
    code: z.enum([
      'INTERNAL_ERROR',
      'DISCOVERY_ERROR',
      'EXECUTION_ERROR',
      'OPENAPI_ERROR',
      'SYNC_ERROR',
      'RESOURCE_KINDS_ERROR',
      'SEARCH_ERROR',
      'LIST_RESOURCES_ERROR',
      'NAMESPACES_ERROR',
      'RESOURCE_ERROR',
      'EVENTS_ERROR',
      'LOGS_ERROR',
      'PROMPTS_LIST_ERROR',
      'PROMPT_GET_ERROR',
      'VISUALIZATION_ERROR',
      'SESSION_RETRIEVAL_ERROR',
    ]),
  }),
});
