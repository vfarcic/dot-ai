/**
 * Test Fixtures Entry Point
 *
 * Exports fixtures and types for consumers to use in their tests.
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 *
 * Usage:
 * ```typescript
 * import { allFixtures, toolFixtures, VisualizationResponse } from '@anthropic/dot-ai/test-fixtures';
 *
 * // Use fixtures in tests
 * const mockResponse = toolFixtures.discovery.success;
 *
 * // Type check responses
 * const visualization: VisualizationResponse = visualizationFixtures.success.mermaid;
 * ```
 */

// Export all fixtures
export {
  allFixtures,
  toolFixtures,
  resourceFixtures,
  eventsFixtures,
  logsFixtures,
  promptsFixtures,
  visualizationFixtures,
  sessionsFixtures,
} from './fixtures';

// Re-export response types for consumers
export type {
  // Common types
  Meta,
  ErrorDetails,
  RestApiResponse,
  ErrorResponse,
} from '../interfaces/schemas/common';

export type {
  // Tool types
  ToolParameter,
  ToolInfo,
  ToolDiscoveryData,
  ToolDiscoveryResponse,
  ToolExecutionData,
  ToolExecutionResponse,
} from '../interfaces/schemas/tools';

export type {
  // Visualization types
  VisualizationType,
  CodeContent,
  TableContent,
  CardItem,
  CardsContent,
  DiffContent,
  BarChartDataItem,
  BarChartContent,
  VisualizationContent,
  Visualization,
  VisualizationResponseData,
  VisualizationResponse,
} from '../interfaces/schemas/visualization';

export type {
  // Resource types
  ResourceKind,
  ResourceKindsData,
  ResourceKindsResponse,
  ResourceSummary,
  ResourceSearchData,
  ResourceSearchResponse,
  ResourceListData,
  ResourceListResponse,
  SingleResourceData,
  SingleResourceResponse,
  NamespacesData,
  NamespacesResponse,
  ResourceSyncRequest,
  ResourceSyncData,
  ResourceSyncResponse,
} from '../interfaces/schemas/resources';

export type {
  // Events types
  EventInvolvedObject,
  KubernetesEvent,
  EventsData,
  EventsResponse,
} from '../interfaces/schemas/events';

export type {
  // Logs types
  LogsData,
  LogsResponse,
} from '../interfaces/schemas/logs';

export type {
  // Sessions types
  SessionMetadata,
  SessionData,
  SessionResponseData,
  SessionResponse,
} from '../interfaces/schemas/sessions';

export type {
  // Prompts types
  PromptArgument,
  PromptInfo,
  PromptsListData,
  PromptsListResponse,
  PromptMessage,
  PromptGetData,
  PromptGetResponse,
  PromptGetRequest,
} from '../interfaces/schemas/prompts';

// Export default as allFixtures for convenience
export { allFixtures as default } from './fixtures';
