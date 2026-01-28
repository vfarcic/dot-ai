/**
 * Events Endpoint Schemas
 *
 * Schemas for the /api/v1/events endpoint.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 * PRD #328: Events endpoint for UI
 */

import { z } from 'zod';
import { createSuccessResponseSchema, BadRequestErrorSchema, ServiceUnavailableErrorSchema, InternalServerErrorSchema } from './common';

/**
 * Kubernetes event involved object reference
 */
export const EventInvolvedObjectSchema = z.object({
  kind: z.string().describe('Resource kind'),
  name: z.string().describe('Resource name'),
  namespace: z.string().optional().describe('Resource namespace'),
  uid: z.string().optional().describe('Resource UID'),
});

export type EventInvolvedObject = z.infer<typeof EventInvolvedObjectSchema>;

/**
 * Kubernetes event schema
 */
export const KubernetesEventSchema = z.object({
  lastTimestamp: z.string().optional().describe('Last time the event occurred'),
  type: z.string().describe('Event type (Normal, Warning)'),
  reason: z.string().describe('Short reason for the event'),
  message: z.string().describe('Human-readable description'),
  involvedObject: EventInvolvedObjectSchema.describe('Object this event is about'),
  count: z.number().optional().describe('Number of times this event has occurred'),
  firstTimestamp: z.string().optional().describe('First time the event occurred'),
});

export type KubernetesEvent = z.infer<typeof KubernetesEventSchema>;

/**
 * Events response data
 * GET /api/v1/events
 */
export const EventsDataSchema = z.object({
  events: z.array(KubernetesEventSchema).describe('List of events'),
  count: z.number().describe('Number of events returned'),
});

export type EventsData = z.infer<typeof EventsDataSchema>;

export const EventsResponseSchema = createSuccessResponseSchema(EventsDataSchema);

export type EventsResponse = z.infer<typeof EventsResponseSchema>;

/**
 * Events endpoint error schemas
 */
export const EventsBadRequestErrorSchema = BadRequestErrorSchema.extend({
  error: z.object({
    code: z.literal('BAD_REQUEST'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const EventsPluginUnavailableErrorSchema = ServiceUnavailableErrorSchema.extend({
  error: z.object({
    code: z.literal('PLUGIN_UNAVAILABLE'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const EventsErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('EVENTS_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});
