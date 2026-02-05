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

// ============================================
// Knowledge Ask Schemas (PRD #356)
// HTTP-only endpoint for AI-synthesized answers
// ============================================

/**
 * Knowledge Ask request body
 */
export const KnowledgeAskRequestSchema = z.object({
  query: z.string().min(1).describe('The question to answer from the knowledge base'),
  limit: z.number().optional().default(20).describe('Maximum chunks to retrieve (default: 20)'),
  uriFilter: z.string().optional().describe('Optional: filter to specific document URI'),
});

export type KnowledgeAskRequest = z.infer<typeof KnowledgeAskRequestSchema>;

/**
 * Source reference in knowledge ask response
 */
export const KnowledgeAskSourceSchema = z.object({
  uri: z.string().describe('Source document URI'),
  title: z.string().optional().describe('Document title if available from metadata'),
});

export type KnowledgeAskSource = z.infer<typeof KnowledgeAskSourceSchema>;

/**
 * Chunk in knowledge ask response
 */
export const KnowledgeAskChunkSchema = z.object({
  content: z.string().describe('Chunk text content'),
  uri: z.string().describe('Source document URI'),
  score: z.number().describe('Relevance score from semantic search'),
  chunkIndex: z.number().describe('Position of chunk within source document'),
});

export type KnowledgeAskChunk = z.infer<typeof KnowledgeAskChunkSchema>;

/**
 * Knowledge Ask response data
 */
export const KnowledgeAskDataSchema = z.object({
  answer: z.string().describe('AI-synthesized answer to the question'),
  sources: z.array(KnowledgeAskSourceSchema).describe('Deduplicated source documents used'),
  chunks: z.array(KnowledgeAskChunkSchema).describe('Original chunks for transparency'),
});

export type KnowledgeAskData = z.infer<typeof KnowledgeAskDataSchema>;

/**
 * Knowledge Ask success response
 */
export const KnowledgeAskResponseSchema = createSuccessResponseSchema(KnowledgeAskDataSchema);

export type KnowledgeAskResponse = z.infer<typeof KnowledgeAskResponseSchema>;

/**
 * Knowledge Ask error responses
 */
export const KnowledgeAskBadRequestErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('BAD_REQUEST'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const KnowledgeAskAIUnavailableErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('AI_UNAVAILABLE'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const KnowledgeAskPluginUnavailableErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.literal('PLUGIN_UNAVAILABLE'),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const KnowledgeAskErrorSchema = ErrorResponseSchema.extend({
  error: z.object({
    code: z.enum(['SEARCH_ERROR', 'SYNTHESIS_ERROR']),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
