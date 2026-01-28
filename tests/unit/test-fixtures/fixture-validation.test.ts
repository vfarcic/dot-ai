/**
 * Unit Tests: Fixture Validation
 *
 * Validates all test fixtures against their corresponding Zod schemas.
 * This ensures fixtures remain valid when schemas change.
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { describe, test, expect } from 'vitest';

// Import schemas
import {
  ToolDiscoveryResponseSchema,
  ToolExecutionResponseSchema,
  ToolNotFoundErrorSchema,
  InvalidToolRequestErrorSchema,
} from '../../../src/interfaces/schemas/tools';

import {
  ResourceKindsResponseSchema,
  ResourceListResponseSchema,
  ResourceSearchResponseSchema,
  SingleResourceResponseSchema,
  NamespacesResponseSchema,
  ResourceSyncResponseSchema,
  ResourceNotFoundErrorSchema,
  ResourceBadRequestErrorSchema,
} from '../../../src/interfaces/schemas/resources';

import {
  EventsResponseSchema,
  EventsBadRequestErrorSchema,
} from '../../../src/interfaces/schemas/events';

import {
  LogsResponseSchema,
  LogsBadRequestErrorSchema,
} from '../../../src/interfaces/schemas/logs';

import {
  PromptsListResponseSchema,
  PromptGetResponseSchema,
  PromptNotFoundErrorSchema,
} from '../../../src/interfaces/schemas/prompts';

import {
  VisualizationResponseSchema,
  VisualizationNotFoundErrorSchema,
  VisualizationServiceUnavailableErrorSchema,
} from '../../../src/interfaces/schemas/visualization';

import {
  SessionResponseSchema,
  SessionNotFoundErrorSchema,
} from '../../../src/interfaces/schemas/sessions';

// Import fixtures
import {
  toolFixtures,
  resourceFixtures,
  eventsFixtures,
  logsFixtures,
  promptsFixtures,
  visualizationFixtures,
  sessionsFixtures,
} from '../../../src/test-fixtures';

describe('Fixture Validation', () => {
  describe('Tool Fixtures', () => {
    test('discovery success fixture matches ToolDiscoveryResponseSchema', () => {
      const result = ToolDiscoveryResponseSchema.safeParse(toolFixtures.discovery.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('discovery filtered fixture matches ToolDiscoveryResponseSchema', () => {
      const result = ToolDiscoveryResponseSchema.safeParse(toolFixtures.discovery.filtered);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('execution success fixture matches ToolExecutionResponseSchema', () => {
      const result = ToolExecutionResponseSchema.safeParse(toolFixtures.execution.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error not found fixture matches ToolNotFoundErrorSchema', () => {
      const result = ToolNotFoundErrorSchema.safeParse(toolFixtures.errors.notFound);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error invalid request fixture matches InvalidToolRequestErrorSchema', () => {
      const result = InvalidToolRequestErrorSchema.safeParse(toolFixtures.errors.invalidRequest);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });

  describe('Resource Fixtures', () => {
    test('kinds success fixture matches ResourceKindsResponseSchema', () => {
      const result = ResourceKindsResponseSchema.safeParse(resourceFixtures.kinds.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('list deployments fixture matches ResourceListResponseSchema', () => {
      const result = ResourceListResponseSchema.safeParse(resourceFixtures.list.deployments);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('list pods fixture matches ResourceListResponseSchema', () => {
      const result = ResourceListResponseSchema.safeParse(resourceFixtures.list.pods);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('list empty fixture matches ResourceListResponseSchema', () => {
      const result = ResourceListResponseSchema.safeParse(resourceFixtures.list.empty);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('search results fixture matches ResourceSearchResponseSchema', () => {
      const result = ResourceSearchResponseSchema.safeParse(resourceFixtures.search.results);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('single deployment fixture matches SingleResourceResponseSchema', () => {
      const result = SingleResourceResponseSchema.safeParse(resourceFixtures.single.deployment);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('namespaces success fixture matches NamespacesResponseSchema', () => {
      const result = NamespacesResponseSchema.safeParse(resourceFixtures.namespaces.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('sync success fixture matches ResourceSyncResponseSchema', () => {
      const result = ResourceSyncResponseSchema.safeParse(resourceFixtures.sync.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error not found fixture matches ResourceNotFoundErrorSchema', () => {
      const result = ResourceNotFoundErrorSchema.safeParse(resourceFixtures.errors.notFound);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error bad request fixture matches ResourceBadRequestErrorSchema', () => {
      const result = ResourceBadRequestErrorSchema.safeParse(resourceFixtures.errors.badRequest);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });

  describe('Events Fixtures', () => {
    test('pod events fixture matches EventsResponseSchema', () => {
      const result = EventsResponseSchema.safeParse(eventsFixtures.success.podEvents);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('warning events fixture matches EventsResponseSchema', () => {
      const result = EventsResponseSchema.safeParse(eventsFixtures.success.warningEvents);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('empty events fixture matches EventsResponseSchema', () => {
      const result = EventsResponseSchema.safeParse(eventsFixtures.success.empty);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error bad request fixture matches EventsBadRequestErrorSchema', () => {
      const result = EventsBadRequestErrorSchema.safeParse(eventsFixtures.errors.badRequest);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });

  describe('Logs Fixtures', () => {
    test('container logs fixture matches LogsResponseSchema', () => {
      const result = LogsResponseSchema.safeParse(logsFixtures.success.containerLogs);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error logs fixture matches LogsResponseSchema', () => {
      const result = LogsResponseSchema.safeParse(logsFixtures.success.errorLogs);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('empty logs fixture matches LogsResponseSchema', () => {
      const result = LogsResponseSchema.safeParse(logsFixtures.success.empty);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error bad request fixture matches LogsBadRequestErrorSchema', () => {
      const result = LogsBadRequestErrorSchema.safeParse(logsFixtures.errors.badRequest);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });

  describe('Prompts Fixtures', () => {
    test('list success fixture matches PromptsListResponseSchema', () => {
      const result = PromptsListResponseSchema.safeParse(promptsFixtures.list.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('get success fixture matches PromptGetResponseSchema', () => {
      const result = PromptGetResponseSchema.safeParse(promptsFixtures.get.success);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error not found fixture matches PromptNotFoundErrorSchema', () => {
      const result = PromptNotFoundErrorSchema.safeParse(promptsFixtures.errors.notFound);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });

  describe('Visualization Fixtures', () => {
    test('mermaid visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.mermaid);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('cards visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.cards);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('table visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.table);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('code visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.code);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('diff visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.diff);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('bar chart visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.barChart);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('empty visualization fixture matches VisualizationResponseSchema', () => {
      const result = VisualizationResponseSchema.safeParse(visualizationFixtures.success.empty);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error not found fixture matches VisualizationNotFoundErrorSchema', () => {
      const result = VisualizationNotFoundErrorSchema.safeParse(visualizationFixtures.errors.notFound);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error AI not configured fixture matches VisualizationServiceUnavailableErrorSchema', () => {
      const result = VisualizationServiceUnavailableErrorSchema.safeParse(visualizationFixtures.errors.aiNotConfigured);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });

  describe('Sessions Fixtures', () => {
    test('query session fixture matches SessionResponseSchema', () => {
      const result = SessionResponseSchema.safeParse(sessionsFixtures.success.query);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('remediate session fixture matches SessionResponseSchema', () => {
      const result = SessionResponseSchema.safeParse(sessionsFixtures.success.remediate);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('recommend session fixture matches SessionResponseSchema', () => {
      const result = SessionResponseSchema.safeParse(sessionsFixtures.success.recommend);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('operate session fixture matches SessionResponseSchema', () => {
      const result = SessionResponseSchema.safeParse(sessionsFixtures.success.operate);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error not found fixture matches SessionNotFoundErrorSchema', () => {
      const result = SessionNotFoundErrorSchema.safeParse(sessionsFixtures.errors.notFound);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });

    test('error expired fixture matches SessionNotFoundErrorSchema', () => {
      const result = SessionNotFoundErrorSchema.safeParse(sessionsFixtures.errors.expired);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Validation errors:', JSON.stringify(result.error.format(), null, 2));
      }
    });
  });
});
