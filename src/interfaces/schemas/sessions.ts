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

/**
 * Session List Endpoint Schemas
 * GET /api/v1/sessions
 * PRD #425: Session List API and SSE Streaming
 */

/**
 * Query parameters for listing sessions
 */
export const SessionListQuerySchema = z.object({
  status: z.string().optional().describe('Filter by session status (e.g., analysis_complete, failed, investigating)'),
  limit: z.coerce.number().int().min(1).max(200).default(50).describe('Max results per page'),
  offset: z.coerce.number().int().min(0).default(0).describe('Pagination offset'),
});

export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;

/**
 * Session summary (no finalAnalysis to keep responses lean)
 */
export const SessionSummarySchema = z.object({
  sessionId: z.string().describe('Session ID'),
  status: z.string().optional().describe('Session status'),
  issue: z.string().optional().describe('Issue being investigated'),
  mode: z.string().optional().describe('Remediation mode (manual/automatic)'),
  toolName: z.string().optional().describe('Tool that created this session'),
  createdAt: z.string().describe('Session creation timestamp'),
  updatedAt: z.string().describe('Session last update timestamp'),
});

export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/**
 * Session list response data
 */
export const SessionListDataSchema = z.object({
  sessions: z.array(SessionSummarySchema).describe('List of session summaries'),
  total: z.number().describe('Total number of sessions matching the filter'),
  limit: z.number().describe('Max results per page'),
  offset: z.number().describe('Pagination offset'),
});

export type SessionListData = z.infer<typeof SessionListDataSchema>;

export const SessionListResponseSchema = createSuccessResponseSchema(SessionListDataSchema);

export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

export const SessionListErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('SESSION_LIST_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

/**
 * SSE Streaming Endpoint Schema
 * GET /api/v1/events/remediations
 * PRD #425: Real-time remediation session events via Server-Sent Events
 */
export const RemediationSSEEventSchema = z.object({
  event: z.enum(['session-created', 'session-updated']).describe('SSE event type'),
  data: z.object({
    sessionId: z.string().describe('Session ID'),
    toolName: z.string().describe('Tool that owns the session'),
    status: z.string().describe('Current session status'),
    issue: z.string().describe('Issue being investigated'),
    timestamp: z.string().describe('Event timestamp'),
  }),
}).describe('SSE event for remediation session changes (Content-Type: text/event-stream)');

export type RemediationSSEEvent = z.infer<typeof RemediationSSEEventSchema>;
