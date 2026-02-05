/**
 * Knowledge Base REST API Response Schemas
 *
 * PRD #356: Knowledge Base System
 * Schemas for HTTP-only endpoints (not exposed via MCP)
 */

import { z } from 'zod';
import { createSuccessResponseSchema, ErrorResponseSchema } from './common';

/**
 * Delete by source response data
 */
export const DeleteBySourceDataSchema = z.object({
  sourceIdentifier: z.string().describe('The source identifier that was deleted'),
  chunksDeleted: z.number().describe('Number of chunks deleted'),
});

export type DeleteBySourceData = z.infer<typeof DeleteBySourceDataSchema>;

/**
 * Delete by source success response
 */
export const DeleteBySourceResponseSchema = createSuccessResponseSchema(DeleteBySourceDataSchema);

export type DeleteBySourceResponse = z.infer<typeof DeleteBySourceResponseSchema>;

/**
 * Delete by source error responses
 */
export const DeleteBySourceBadRequestErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('BAD_REQUEST'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const DeleteBySourcePluginUnavailableErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('PLUGIN_UNAVAILABLE'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const DeleteBySourceErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('DELETE_SOURCE_ERROR'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
