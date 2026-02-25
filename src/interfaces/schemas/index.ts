/**
 * REST API Response Schemas
 *
 * Central export for all REST API Zod schemas.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 *
 * Usage:
 * ```typescript
 * import { VisualizationResponseSchema, ToolDiscoveryResponseSchema } from '../schemas';
 * ```
 */

// Common schemas
export {
  MetaSchema,
  ErrorDetailsSchema,
  RestApiResponseSchema,
  ErrorResponseSchema,
  NotFoundErrorSchema,
  BadRequestErrorSchema,
  MethodNotAllowedErrorSchema,
  ServiceUnavailableErrorSchema,
  InternalServerErrorSchema,
  createSuccessResponseSchema,
  type Meta,
  type ErrorDetails,
  type RestApiResponse,
  type ErrorResponse,
} from './common';

// Tool schemas
export {
  ToolParameterSchema,
  ToolInfoSchema,
  ToolDiscoveryDataSchema,
  ToolDiscoveryResponseSchema,
  ToolExecutionDataSchema,
  ToolExecutionResponseSchema,
  ToolNotFoundErrorSchema,
  InvalidToolRequestErrorSchema,
  ToolExecutionErrorSchema,
  ToolDiscoveryErrorSchema,
  type ToolParameter,
  type ToolInfo,
  type ToolDiscoveryData,
  type ToolDiscoveryResponse,
  type ToolExecutionData,
  type ToolExecutionResponse,
} from './tools';

// Visualization schemas
export {
  VisualizationTypeSchema,
  CodeContentSchema,
  TableContentSchema,
  CardItemSchema,
  CardsContentSchema,
  DiffContentSchema,
  BarChartDataItemSchema,
  BarChartContentSchema,
  VisualizationContentSchema,
  VisualizationSchema,
  VisualizationResponseDataSchema,
  VisualizationResponseSchema,
  VisualizationNotFoundErrorSchema,
  VisualizationServiceUnavailableErrorSchema,
  VisualizationInternalErrorSchema,
  type VisualizationType,
  type CodeContent,
  type TableContent,
  type CardItem,
  type CardsContent,
  type DiffContent,
  type BarChartDataItem,
  type BarChartContent,
  type VisualizationContent,
  type Visualization,
  type VisualizationResponseData,
  type VisualizationResponse,
} from './visualization';

// Resource schemas
export {
  ResourceKindSchema,
  ResourceKindsDataSchema,
  ResourceKindsResponseSchema,
  ResourceSummarySchema,
  ResourceSearchDataSchema,
  ResourceSearchResponseSchema,
  ResourceListDataSchema,
  ResourceListResponseSchema,
  SingleResourceDataSchema,
  SingleResourceResponseSchema,
  NamespacesDataSchema,
  NamespacesResponseSchema,
  ResourceSyncRequestSchema,
  ResourceSyncDataSchema,
  ResourceSyncResponseSchema,
  ResourceNotFoundErrorSchema,
  ResourceBadRequestErrorSchema,
  ResourcePluginUnavailableErrorSchema,
  ResourceKindsErrorSchema,
  ResourceSearchErrorSchema,
  ResourceListErrorSchema,
  SingleResourceErrorSchema,
  NamespacesErrorSchema,
  ResourceSyncErrorSchema,
  type ResourceKind,
  type ResourceKindsData,
  type ResourceKindsResponse,
  type ResourceSummary,
  type ResourceSearchData,
  type ResourceSearchResponse,
  type ResourceListData,
  type ResourceListResponse,
  type SingleResourceData,
  type SingleResourceResponse,
  type NamespacesData,
  type NamespacesResponse,
  type ResourceSyncRequest,
  type ResourceSyncData,
  type ResourceSyncResponse,
} from './resources';

// Events schemas
export {
  EventInvolvedObjectSchema,
  KubernetesEventSchema,
  EventsDataSchema,
  EventsResponseSchema,
  EventsBadRequestErrorSchema,
  EventsPluginUnavailableErrorSchema,
  EventsErrorSchema,
  type EventInvolvedObject,
  type KubernetesEvent,
  type EventsData,
  type EventsResponse,
} from './events';

// Logs schemas
export {
  LogsDataSchema,
  LogsResponseSchema,
  LogsBadRequestErrorSchema,
  LogsPluginUnavailableErrorSchema,
  LogsErrorSchema,
  type LogsData,
  type LogsResponse,
} from './logs';

// Sessions schemas
export {
  SessionMetadataSchema,
  SessionDataSchema,
  SessionResponseDataSchema,
  SessionResponseSchema,
  SessionNotFoundErrorSchema,
  SessionRetrievalErrorSchema,
  type SessionMetadata,
  type SessionData,
  type SessionResponseData,
  type SessionResponse,
} from './sessions';

// Prompts schemas
export {
  PromptArgumentSchema,
  PromptInfoSchema,
  PromptsListDataSchema,
  PromptsListResponseSchema,
  PromptMessageSchema,
  PromptGetDataSchema,
  PromptGetResponseSchema,
  PromptGetRequestSchema,
  PromptNotFoundErrorSchema,
  PromptValidationErrorSchema,
  PromptsListErrorSchema,
  PromptGetErrorSchema,
  type PromptArgument,
  type PromptInfo,
  type PromptsListData,
  type PromptsListResponse,
  type PromptMessage,
  type PromptGetData,
  type PromptGetResponse,
  type PromptGetRequest,
} from './prompts';

// Knowledge schemas
export {
  DeleteBySourceDataSchema,
  DeleteBySourceResponseSchema,
  DeleteBySourceBadRequestErrorSchema,
  DeleteBySourcePluginUnavailableErrorSchema,
  DeleteBySourceErrorSchema,
  // Knowledge Ask schemas (PRD #356)
  KnowledgeAskRequestSchema,
  KnowledgeAskSourceSchema,
  KnowledgeAskChunkSchema,
  KnowledgeAskDataSchema,
  KnowledgeAskResponseSchema,
  KnowledgeAskBadRequestErrorSchema,
  KnowledgeAskAIUnavailableErrorSchema,
  KnowledgeAskPluginUnavailableErrorSchema,
  KnowledgeAskErrorSchema,
  type DeleteBySourceData,
  type DeleteBySourceResponse,
  type KnowledgeAskRequest,
  type KnowledgeAskSource,
  type KnowledgeAskChunk,
  type KnowledgeAskData,
  type KnowledgeAskResponse,
} from './knowledge';

// Embeddings schemas (PRD #384)
export {
  EmbeddingMigrationRequestSchema,
  CollectionMigrationResultSchema,
  EmbeddingMigrationDataSchema,
  EmbeddingMigrationResponseSchema,
  EmbeddingMigrationBadRequestErrorSchema,
  EmbeddingMigrationServiceUnavailableErrorSchema,
  EmbeddingMigrationErrorSchema,
  type EmbeddingMigrationRequest,
  type CollectionMigrationResult,
  type EmbeddingMigrationData,
  type EmbeddingMigrationResponse,
} from './embeddings';
