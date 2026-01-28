/**
 * Sessions Endpoint Schemas
 *
 * Schemas for the /api/v1/sessions/:sessionId endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { createSuccessResponseSchema, NotFoundErrorSchema, InternalServerErrorSchema } from './common';

/**
 * Session metadata
 */
export const SessionMetadataSchema = z.object({
  id: z.string().describe('Session ID'),
  createdAt: z.string().describe('Session creation timestamp'),
  expiresAt: z.string().optional().describe('Session expiration timestamp'),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * Generic session data
 * Sessions can contain different data based on the tool that created them
 */
export const SessionDataSchema = z.object({
  toolName: z.string().optional().describe('Tool that created this session'),
  intent: z.string().optional().describe('User intent for this session'),
  // Additional fields vary by tool type
}).passthrough(); // Allow additional properties

export type SessionData = z.infer<typeof SessionDataSchema>;

/**
 * Session response data
 * GET /api/v1/sessions/:sessionId
 */
export const SessionResponseDataSchema = z.object({
  id: z.string().describe('Session ID'),
  data: SessionDataSchema.describe('Session data'),
  createdAt: z.string().optional().describe('Session creation timestamp'),
  expiresAt: z.string().optional().describe('Session expiration timestamp'),
});

export type SessionResponseData = z.infer<typeof SessionResponseDataSchema>;

export const SessionResponseSchema = createSuccessResponseSchema(SessionResponseDataSchema);

export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * Session endpoint error schemas
 */
export const SessionNotFoundErrorSchema = NotFoundErrorSchema.extend({
  error: z.object({
    code: z.literal('SESSION_NOT_FOUND'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const SessionRetrievalErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('SESSION_RETRIEVAL_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});
