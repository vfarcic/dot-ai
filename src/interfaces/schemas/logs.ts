/**
 * Logs Endpoint Schemas
 *
 * Schemas for the /api/v1/logs endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 * PRD #328: Logs endpoint for UI
 */

import { z } from 'zod';
import { createSuccessResponseSchema, BadRequestErrorSchema, ServiceUnavailableErrorSchema, InternalServerErrorSchema } from './common';

/**
 * Logs response data
 * GET /api/v1/logs
 */
export const LogsDataSchema = z.object({
  logs: z.string().describe('Container log output'),
  container: z.string().describe('Container name'),
  containerCount: z.number().describe('Number of containers in the pod'),
});

export type LogsData = z.infer<typeof LogsDataSchema>;

export const LogsResponseSchema = createSuccessResponseSchema(LogsDataSchema);

export type LogsResponse = z.infer<typeof LogsResponseSchema>;

/**
 * Logs endpoint error schemas
 */
export const LogsBadRequestErrorSchema = BadRequestErrorSchema.extend({
  error: z.object({
    code: z.enum(['BAD_REQUEST', 'INVALID_PARAMETER']),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const LogsPluginUnavailableErrorSchema = ServiceUnavailableErrorSchema.extend({
  error: z.object({
    code: z.literal('PLUGIN_UNAVAILABLE'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const LogsErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('LOGS_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});
