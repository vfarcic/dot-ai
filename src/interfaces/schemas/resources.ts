/**
 * Resource Endpoint Schemas
 *
 * Schemas for resource-related endpoints:
 * - GET /api/v1/resources/kinds
 * - GET /api/v1/resources/search
 * - GET /api/v1/resources (list)
 * - GET /api/v1/resource (single)
 * - POST /api/v1/resources/sync
 * - GET /api/v1/namespaces
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 * PRD #328: Resource endpoints for UI
 */

import { z } from 'zod';
import { createSuccessResponseSchema, BadRequestErrorSchema, NotFoundErrorSchema, ServiceUnavailableErrorSchema, InternalServerErrorSchema } from './common';

/**
 * Resource kind with count
 */
export const ResourceKindSchema = z.object({
  kind: z.string().describe('Resource kind (e.g., "Pod", "Deployment")'),
  apiVersion: z.string().describe('API version (e.g., "v1", "apps/v1")'),
  count: z.number().describe('Number of resources of this kind'),
  apiGroup: z.string().optional().describe('API group (e.g., "apps", "networking.k8s.io")'),
});

export type ResourceKind = z.infer<typeof ResourceKindSchema>;

/**
 * Resource kinds response data
 * GET /api/v1/resources/kinds
 */
export const ResourceKindsDataSchema = z.object({
  kinds: z.array(ResourceKindSchema).describe('List of resource kinds with counts'),
});

export type ResourceKindsData = z.infer<typeof ResourceKindsDataSchema>;

export const ResourceKindsResponseSchema = createSuccessResponseSchema(ResourceKindsDataSchema);

export type ResourceKindsResponse = z.infer<typeof ResourceKindsResponseSchema>;

/**
 * Resource summary for list/search results
 */
export const ResourceSummarySchema = z.object({
  name: z.string().describe('Resource name'),
  namespace: z.string().optional().describe('Namespace (for namespaced resources)'),
  kind: z.string().describe('Resource kind'),
  apiVersion: z.string().describe('API version'),
  apiGroup: z.string().optional().describe('API group'),
  labels: z.record(z.string(), z.string()).optional().describe('Resource labels'),
  createdAt: z.string().optional().describe('Creation timestamp'),
  score: z.number().optional().describe('Search relevance score (for search results)'),
  status: z.any().optional().describe('Live status from Kubernetes API'),
});

export type ResourceSummary = z.infer<typeof ResourceSummarySchema>;

/**
 * Resource search response data
 * GET /api/v1/resources/search
 */
export const ResourceSearchDataSchema = z.object({
  resources: z.array(ResourceSummarySchema).describe('Matching resources'),
  total: z.number().describe('Total number of matches'),
  limit: z.number().describe('Requested limit'),
  offset: z.number().describe('Requested offset'),
});

export type ResourceSearchData = z.infer<typeof ResourceSearchDataSchema>;

export const ResourceSearchResponseSchema = createSuccessResponseSchema(ResourceSearchDataSchema);

export type ResourceSearchResponse = z.infer<typeof ResourceSearchResponseSchema>;

/**
 * Resource list response data
 * GET /api/v1/resources
 */
export const ResourceListDataSchema = z.object({
  resources: z.array(ResourceSummarySchema).describe('List of resources'),
  total: z.number().describe('Total number of resources'),
  limit: z.number().optional().describe('Applied limit'),
  offset: z.number().optional().describe('Applied offset'),
});

export type ResourceListData = z.infer<typeof ResourceListDataSchema>;

export const ResourceListResponseSchema = createSuccessResponseSchema(ResourceListDataSchema);

export type ResourceListResponse = z.infer<typeof ResourceListResponseSchema>;

/**
 * Single resource response data
 * GET /api/v1/resource
 */
export const SingleResourceDataSchema = z.object({
  resource: z.record(z.string(), z.any()).describe('Full Kubernetes resource object'),
});

export type SingleResourceData = z.infer<typeof SingleResourceDataSchema>;

export const SingleResourceResponseSchema = createSuccessResponseSchema(SingleResourceDataSchema);

export type SingleResourceResponse = z.infer<typeof SingleResourceResponseSchema>;

/**
 * Namespaces response data
 * GET /api/v1/namespaces
 */
export const NamespacesDataSchema = z.object({
  namespaces: z.array(z.string()).describe('List of namespace names'),
});

export type NamespacesData = z.infer<typeof NamespacesDataSchema>;

export const NamespacesResponseSchema = createSuccessResponseSchema(NamespacesDataSchema);

export type NamespacesResponse = z.infer<typeof NamespacesResponseSchema>;

/**
 * Resource sync request body
 * POST /api/v1/resources/sync
 */
export const ResourceSyncRequestSchema = z.object({
  operation: z.enum(['upsert', 'delete', 'resync', 'health']).describe('Sync operation type'),
  resources: z.array(z.record(z.string(), z.any())).optional().describe('Resources to sync'),
});

export type ResourceSyncRequest = z.infer<typeof ResourceSyncRequestSchema>;

/**
 * Resource sync response data
 */
export const ResourceSyncDataSchema = z.object({
  upserted: z.number().optional().describe('Number of resources upserted'),
  deleted: z.number().optional().describe('Number of resources deleted'),
  healthy: z.boolean().optional().describe('Health check result'),
  message: z.string().optional().describe('Operation message'),
});

export type ResourceSyncData = z.infer<typeof ResourceSyncDataSchema>;

export const ResourceSyncResponseSchema = createSuccessResponseSchema(ResourceSyncDataSchema);

export type ResourceSyncResponse = z.infer<typeof ResourceSyncResponseSchema>;

/**
 * Resource endpoint error schemas
 */
export const ResourceNotFoundErrorSchema = NotFoundErrorSchema.extend({
  error: z.object({
    code: z.literal('NOT_FOUND'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const ResourceBadRequestErrorSchema = BadRequestErrorSchema.extend({
  error: z.object({
    code: z.enum(['BAD_REQUEST', 'MISSING_PARAMETER', 'INVALID_PARAMETER']),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const ResourcePluginUnavailableErrorSchema = ServiceUnavailableErrorSchema.extend({
  error: z.object({
    code: z.literal('PLUGIN_UNAVAILABLE'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const ResourceKindsErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('RESOURCE_KINDS_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const ResourceSearchErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('SEARCH_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const ResourceListErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('LIST_RESOURCES_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const SingleResourceErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('RESOURCE_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const NamespacesErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('NAMESPACES_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const ResourceSyncErrorSchema = InternalServerErrorSchema.extend({
  error: z.object({
    code: z.literal('SYNC_ERROR'),
    message: z.string(),
    details: z.any().optional(),
  }),
});
