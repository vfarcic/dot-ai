/**
 * REST API Route Definitions
 *
 * Central registration of all REST API routes with their Zod schemas.
 * This is the single source of truth for routing, OpenAPI generation, and fixture validation.
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { RestRouteRegistry, RouteDefinition } from '../rest-route-registry';
import {
  // Tool schemas
  ToolDiscoveryResponseSchema,
  ToolExecutionResponseSchema,
  ToolNotFoundErrorSchema,
  InvalidToolRequestErrorSchema,
  ToolExecutionErrorSchema,
  // Resource schemas
  ResourceKindsResponseSchema,
  ResourceSearchResponseSchema,
  ResourceListResponseSchema,
  SingleResourceResponseSchema,
  NamespacesResponseSchema,
  ResourceSyncRequestSchema,
  ResourceSyncResponseSchema,
  ResourceBadRequestErrorSchema,
  ResourcePluginUnavailableErrorSchema,
  // Events schemas
  EventsResponseSchema,
  EventsBadRequestErrorSchema,
  EventsPluginUnavailableErrorSchema,
  // Logs schemas
  LogsResponseSchema,
  LogsBadRequestErrorSchema,
  LogsPluginUnavailableErrorSchema,
  // Prompts schemas
  PromptsListResponseSchema,
  PromptGetResponseSchema,
  PromptGetRequestSchema,
  PromptNotFoundErrorSchema,
  // Visualization schemas
  VisualizationResponseSchema,
  VisualizationNotFoundErrorSchema,
  VisualizationServiceUnavailableErrorSchema,
  // Sessions schemas
  SessionResponseSchema,
  SessionNotFoundErrorSchema,
  // Common schemas
  NotFoundErrorSchema,
  InternalServerErrorSchema,
} from '../schemas';

/**
 * Query parameter schemas for various endpoints
 */
const ToolDiscoveryQuerySchema = z.object({
  category: z.string().optional().describe('Filter tools by category'),
  tag: z.string().optional().describe('Filter tools by tag'),
  search: z.string().optional().describe('Search tools by name or description'),
});

const ResourceSearchQuerySchema = z.object({
  q: z.string().describe('Search query'),
  limit: z.coerce.number().optional().default(20).describe('Maximum results to return'),
  offset: z.coerce.number().optional().default(0).describe('Offset for pagination'),
});

const ResourceListQuerySchema = z.object({
  kind: z.string().describe('Resource kind (e.g., Pod, Deployment)'),
  apiVersion: z.string().describe('API version (e.g., v1, apps/v1)'),
  namespace: z.string().optional().describe('Filter by namespace'),
  limit: z.coerce.number().optional().describe('Maximum results to return'),
  offset: z.coerce.number().optional().describe('Offset for pagination'),
});

const SingleResourceQuerySchema = z.object({
  kind: z.string().describe('Resource kind'),
  apiVersion: z.string().describe('API version'),
  name: z.string().describe('Resource name'),
  namespace: z.string().optional().describe('Namespace (for namespaced resources)'),
});

const ResourceKindsQuerySchema = z.object({
  namespace: z.string().optional().describe('Filter kinds by namespace'),
});

const EventsQuerySchema = z.object({
  name: z.string().describe('Resource name'),
  kind: z.string().describe('Resource kind'),
  namespace: z.string().optional().describe('Resource namespace'),
});

const LogsQuerySchema = z.object({
  name: z.string().describe('Pod name'),
  namespace: z.string().describe('Pod namespace'),
  container: z.string().optional().describe('Container name (defaults to first container)'),
  tailLines: z.coerce.number().optional().describe('Number of lines from end'),
  previous: z.coerce.boolean().optional().describe('Get logs from previous container instance'),
});

const VisualizationQuerySchema = z.object({
  reload: z.coerce.boolean().optional().describe('Force regeneration of visualization'),
});

/**
 * Path parameter schemas
 */
const ToolNameParamsSchema = z.object({
  toolName: z.string().describe('Name of the tool to execute'),
});

const PromptNameParamsSchema = z.object({
  promptName: z.string().describe('Name of the prompt'),
});

const SessionIdParamsSchema = z.object({
  sessionId: z.string().describe('Session ID'),
});

/**
 * OpenAPI schema placeholder - returns raw OpenAPI spec object
 */
const OpenApiResponseSchema = z.object({
  openapi: z.string(),
  info: z.object({
    title: z.string(),
    description: z.string(),
    version: z.string(),
  }),
  paths: z.record(z.string(), z.any()),
}).passthrough();

/**
 * All route definitions for the REST API
 */
export const routeDefinitions: RouteDefinition<unknown, unknown, unknown, unknown>[] = [
  // ============================================
  // Tool Endpoints
  // ============================================
  {
    path: '/api/v1/tools',
    method: 'GET',
    description: 'Discover available tools with optional filtering by category, tag, or search term',
    tags: ['Tools'],
    query: ToolDiscoveryQuerySchema,
    response: ToolDiscoveryResponseSchema,
    errorResponses: {
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/tools/:toolName',
    method: 'POST',
    description: 'Execute a tool with the provided parameters',
    tags: ['Tools'],
    params: ToolNameParamsSchema,
    body: z.record(z.string(), z.any()).describe('Tool execution parameters'),
    response: ToolExecutionResponseSchema,
    errorResponses: {
      400: InvalidToolRequestErrorSchema,
      404: ToolNotFoundErrorSchema,
      500: ToolExecutionErrorSchema,
    },
  },

  // ============================================
  // OpenAPI Endpoint
  // ============================================
  {
    path: '/api/v1/openapi',
    method: 'GET',
    description: 'Get the OpenAPI 3.0 specification for this API',
    tags: ['Documentation'],
    response: OpenApiResponseSchema,
    errorResponses: {
      500: InternalServerErrorSchema,
    },
  },

  // ============================================
  // Resource Endpoints
  // ============================================
  {
    path: '/api/v1/resources',
    method: 'GET',
    description: 'List resources filtered by kind and optional namespace',
    tags: ['Resources'],
    query: ResourceListQuerySchema,
    response: ResourceListResponseSchema,
    errorResponses: {
      400: ResourceBadRequestErrorSchema,
      503: ResourcePluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/resources/kinds',
    method: 'GET',
    description: 'List all resource kinds available in the cluster with counts',
    tags: ['Resources'],
    query: ResourceKindsQuerySchema,
    response: ResourceKindsResponseSchema,
    errorResponses: {
      503: ResourcePluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/resources/search',
    method: 'GET',
    description: 'Search for resources using semantic search',
    tags: ['Resources'],
    query: ResourceSearchQuerySchema,
    response: ResourceSearchResponseSchema,
    errorResponses: {
      400: ResourceBadRequestErrorSchema,
      503: ResourcePluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/resources/sync',
    method: 'POST',
    description: 'Sync resources from the Kubernetes controller',
    tags: ['Resources'],
    body: ResourceSyncRequestSchema,
    response: ResourceSyncResponseSchema,
    errorResponses: {
      400: ResourceBadRequestErrorSchema,
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/resource',
    method: 'GET',
    description: 'Get a single resource with full details including live status',
    tags: ['Resources'],
    query: SingleResourceQuerySchema,
    response: SingleResourceResponseSchema,
    errorResponses: {
      400: ResourceBadRequestErrorSchema,
      404: NotFoundErrorSchema,
      503: ResourcePluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/namespaces',
    method: 'GET',
    description: 'List all namespaces in the cluster',
    tags: ['Resources'],
    response: NamespacesResponseSchema,
    errorResponses: {
      503: ResourcePluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },

  // ============================================
  // Events Endpoint
  // ============================================
  {
    path: '/api/v1/events',
    method: 'GET',
    description: 'Get Kubernetes events for a specific resource',
    tags: ['Observability'],
    query: EventsQuerySchema,
    response: EventsResponseSchema,
    errorResponses: {
      400: EventsBadRequestErrorSchema,
      503: EventsPluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },

  // ============================================
  // Logs Endpoint
  // ============================================
  {
    path: '/api/v1/logs',
    method: 'GET',
    description: 'Get container logs from a pod',
    tags: ['Observability'],
    query: LogsQuerySchema,
    response: LogsResponseSchema,
    errorResponses: {
      400: LogsBadRequestErrorSchema,
      503: LogsPluginUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },

  // ============================================
  // Prompts Endpoints
  // ============================================
  {
    path: '/api/v1/prompts',
    method: 'GET',
    description: 'List all available prompts',
    tags: ['Prompts'],
    response: PromptsListResponseSchema,
    errorResponses: {
      500: InternalServerErrorSchema,
    },
  },
  {
    path: '/api/v1/prompts/:promptName',
    method: 'POST',
    description: 'Get a prompt with rendered template arguments',
    tags: ['Prompts'],
    params: PromptNameParamsSchema,
    body: PromptGetRequestSchema,
    response: PromptGetResponseSchema,
    errorResponses: {
      404: PromptNotFoundErrorSchema,
      500: InternalServerErrorSchema,
    },
  },

  // ============================================
  // Visualization Endpoint
  // ============================================
  {
    path: '/api/v1/visualize/:sessionId',
    method: 'GET',
    description: 'Get structured visualization data for a session',
    tags: ['Visualization'],
    params: SessionIdParamsSchema,
    query: VisualizationQuerySchema,
    response: VisualizationResponseSchema,
    errorResponses: {
      404: VisualizationNotFoundErrorSchema,
      503: VisualizationServiceUnavailableErrorSchema,
      500: InternalServerErrorSchema,
    },
  },

  // ============================================
  // Sessions Endpoint
  // ============================================
  {
    path: '/api/v1/sessions/:sessionId',
    method: 'GET',
    description: 'Get raw session data for any tool type (remediate, query, recommend, etc.)',
    tags: ['Sessions'],
    params: SessionIdParamsSchema,
    response: SessionResponseSchema,
    errorResponses: {
      404: SessionNotFoundErrorSchema,
      500: InternalServerErrorSchema,
    },
  },
];

/**
 * Register all routes with the provided registry
 */
export function registerAllRoutes(registry: RestRouteRegistry): void {
  for (const route of routeDefinitions) {
    registry.register(route);
  }
}

/**
 * Get route count - useful for validation
 */
export function getRouteCount(): number {
  return routeDefinitions.length;
}
