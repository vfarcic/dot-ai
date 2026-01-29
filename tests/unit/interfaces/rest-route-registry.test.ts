/**
 * Unit Tests: REST Route Registry
 *
 * Tests the RestRouteRegistry class for route registration,
 * path matching, and parameter extraction.
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { RestRouteRegistry } from '../../../src/interfaces/rest-route-registry';
import { Logger } from '../../../src/core/error-handling';

// Mock logger for testing
const mockLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Sample Zod schemas for testing
const SessionParamsSchema = z.object({
  sessionId: z.string(),
});

const QueryParamsSchema = z.object({
  reload: z.boolean().optional(),
});

const VisualizationResponseSchema = z.object({
  title: z.string(),
  visualizations: z.array(z.object({
    id: z.string(),
    label: z.string(),
    type: z.string(),
  })),
  insights: z.array(z.string()),
});

describe('RestRouteRegistry', () => {
  let registry: RestRouteRegistry;

  beforeEach(() => {
    registry = new RestRouteRegistry(mockLogger);
  });

  describe('Initial State', () => {
    test('should start with zero routes', () => {
      expect(registry.getRouteCount()).toBe(0);
    });

    test('should return empty array for getAllRoutes', () => {
      expect(registry.getAllRoutes()).toEqual([]);
    });

    test('should return empty array for getTags', () => {
      expect(registry.getTags()).toEqual([]);
    });

    test('should return zero counts in stats', () => {
      const stats = registry.getStats();
      expect(stats).toMatchObject({
        totalRoutes: 0,
        tags: [],
        routesByMethod: {
          GET: 0,
          POST: 0,
          PUT: 0,
          DELETE: 0,
        },
      });
    });
  });

  describe('Route Registration', () => {
    test('should register a simple route', () => {
      registry.register({
        path: '/api/v1/tools',
        method: 'GET',
        description: 'List all tools',
        tags: ['Tools'],
        response: z.object({ tools: z.array(z.string()) }),
      });

      expect(registry.getRouteCount()).toBe(1);
      expect(registry.hasRoute('GET', '/api/v1/tools')).toBe(true);
    });

    test('should register a route with path parameters', () => {
      registry.register({
        path: '/api/v1/visualize/:sessionId',
        method: 'GET',
        description: 'Get visualization for session',
        tags: ['Visualization'],
        params: SessionParamsSchema,
        response: VisualizationResponseSchema,
      });

      expect(registry.getRouteCount()).toBe(1);
      expect(registry.hasRoute('GET', '/api/v1/visualize/:sessionId')).toBe(true);
    });

    test('should register routes with different methods on same path', () => {
      registry.register({
        path: '/api/v1/resources',
        method: 'GET',
        description: 'List resources',
        tags: ['Resources'],
        response: z.object({ resources: z.array(z.any()) }),
      });

      registry.register({
        path: '/api/v1/resources',
        method: 'POST',
        description: 'Create resource',
        tags: ['Resources'],
        body: z.object({ kind: z.string() }),
        response: z.object({ success: z.boolean() }),
      });

      expect(registry.getRouteCount()).toBe(2);
      expect(registry.hasRoute('GET', '/api/v1/resources')).toBe(true);
      expect(registry.hasRoute('POST', '/api/v1/resources')).toBe(true);
    });

    test('should throw error when registering duplicate route', () => {
      registry.register({
        path: '/api/v1/tools',
        method: 'GET',
        description: 'List tools',
        tags: ['Tools'],
        response: z.any(),
      });

      expect(() => {
        registry.register({
          path: '/api/v1/tools',
          method: 'GET',
          description: 'Duplicate',
          tags: ['Tools'],
          response: z.any(),
        });
      }).toThrow('Route already registered: GET /api/v1/tools');
    });

    test('should track tags from registered routes', () => {
      registry.register({
        path: '/api/v1/visualize/:sessionId',
        method: 'GET',
        description: 'Get visualization',
        tags: ['Visualization', 'Sessions'],
        response: VisualizationResponseSchema,
      });

      registry.register({
        path: '/api/v1/resources',
        method: 'GET',
        description: 'List resources',
        tags: ['Resources'],
        response: z.any(),
      });

      const tags = registry.getTags();
      expect(tags).toEqual(['Resources', 'Sessions', 'Visualization']);
    });
  });

  describe('Route Matching - Exact Paths', () => {
    beforeEach(() => {
      registry.register({
        path: '/api/v1/tools',
        method: 'GET',
        description: 'List tools',
        tags: ['Tools'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/openapi',
        method: 'GET',
        description: 'Get OpenAPI spec',
        tags: ['Documentation'],
        response: z.any(),
      });
    });

    test('should match exact path', () => {
      const match = registry.findRoute('GET', '/api/v1/tools');
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe('/api/v1/tools');
      expect(match!.params).toEqual({});
    });

    test('should match case-insensitive method', () => {
      const match = registry.findRoute('get', '/api/v1/tools');
      expect(match).not.toBeNull();
      expect(match!.route.method).toBe('GET');
    });

    test('should return null for non-matching path', () => {
      const match = registry.findRoute('GET', '/api/v1/unknown');
      expect(match).toBeNull();
    });

    test('should return null for wrong method', () => {
      const match = registry.findRoute('POST', '/api/v1/tools');
      expect(match).toBeNull();
    });
  });

  describe('Route Matching - Parameterized Paths', () => {
    beforeEach(() => {
      registry.register({
        path: '/api/v1/visualize/:sessionId',
        method: 'GET',
        description: 'Get visualization',
        tags: ['Visualization'],
        params: SessionParamsSchema,
        query: QueryParamsSchema,
        response: VisualizationResponseSchema,
      });

      registry.register({
        path: '/api/v1/tools/:toolName',
        method: 'POST',
        description: 'Execute tool',
        tags: ['Tools'],
        params: z.object({ toolName: z.string() }),
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/sessions/:sessionId',
        method: 'GET',
        description: 'Get session',
        tags: ['Sessions'],
        params: SessionParamsSchema,
        response: z.any(),
      });
    });

    test('should match parameterized path and extract single param', () => {
      const match = registry.findRoute('GET', '/api/v1/visualize/abc-123');
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe('/api/v1/visualize/:sessionId');
      expect(match!.params).toEqual({ sessionId: 'abc-123' });
    });

    test('should extract params with special characters', () => {
      const match = registry.findRoute('GET', '/api/v1/visualize/session-123+session-456');
      expect(match).not.toBeNull();
      expect(match!.params).toEqual({ sessionId: 'session-123+session-456' });
    });

    test('should match different routes with same pattern', () => {
      const vizMatch = registry.findRoute('GET', '/api/v1/visualize/viz-session');
      expect(vizMatch!.route.path).toBe('/api/v1/visualize/:sessionId');
      expect(vizMatch!.params).toEqual({ sessionId: 'viz-session' });

      const sessionMatch = registry.findRoute('GET', '/api/v1/sessions/sess-abc');
      expect(sessionMatch!.route.path).toBe('/api/v1/sessions/:sessionId');
      expect(sessionMatch!.params).toEqual({ sessionId: 'sess-abc' });
    });

    test('should match POST with different param name', () => {
      const match = registry.findRoute('POST', '/api/v1/tools/version');
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe('/api/v1/tools/:toolName');
      expect(match!.params).toEqual({ toolName: 'version' });
    });

    test('should not match parameterized path without param value', () => {
      const match = registry.findRoute('GET', '/api/v1/visualize/');
      expect(match).toBeNull();
    });

    test('should not match parameterized path with extra segments', () => {
      const match = registry.findRoute('GET', '/api/v1/visualize/abc/extra');
      expect(match).toBeNull();
    });
  });

  describe('Route Matching - Multiple Parameters', () => {
    beforeEach(() => {
      registry.register({
        path: '/api/v1/namespaces/:namespace/resources/:resourceName',
        method: 'GET',
        description: 'Get resource in namespace',
        tags: ['Resources'],
        params: z.object({
          namespace: z.string(),
          resourceName: z.string(),
        }),
        response: z.any(),
      });
    });

    test('should extract multiple path parameters', () => {
      const match = registry.findRoute('GET', '/api/v1/namespaces/default/resources/my-pod');
      expect(match).not.toBeNull();
      expect(match!.params).toEqual({
        namespace: 'default',
        resourceName: 'my-pod',
      });
    });

    test('should preserve parameter order', () => {
      const match = registry.findRoute('GET', '/api/v1/namespaces/kube-system/resources/coredns');
      expect(match!.params.namespace).toBe('kube-system');
      expect(match!.params.resourceName).toBe('coredns');
    });
  });

  describe('Schema Access', () => {
    const testResponseSchema = z.object({
      data: z.string(),
    });

    const notFoundErrorSchema = z.object({
      error: z.literal('not_found'),
    });

    beforeEach(() => {
      registry.register({
        path: '/api/v1/test/:id',
        method: 'GET',
        description: 'Test endpoint',
        tags: ['Test'],
        params: z.object({ id: z.string() }),
        response: testResponseSchema,
        errorResponses: {
          404: notFoundErrorSchema,
        },
      });
    });

    test('should get response schema by path pattern', () => {
      const schema = registry.getResponseSchema('GET', '/api/v1/test/:id');
      expect(schema).toBe(testResponseSchema);
    });

    test('should return null for non-existent route', () => {
      const schema = registry.getResponseSchema('GET', '/api/v1/unknown');
      expect(schema).toBeNull();
    });

    test('should get error response schema', () => {
      const schema = registry.getErrorResponseSchema('GET', '/api/v1/test/:id', 404);
      expect(schema).toBe(notFoundErrorSchema);
    });

    test('should return null for non-existent error status', () => {
      const schema = registry.getErrorResponseSchema('GET', '/api/v1/test/:id', 500);
      expect(schema).toBeNull();
    });
  });

  describe('getAllRoutes', () => {
    test('should return all registered routes', () => {
      registry.register({
        path: '/api/v1/a',
        method: 'GET',
        description: 'Route A',
        tags: ['A'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/b',
        method: 'POST',
        description: 'Route B',
        tags: ['B'],
        response: z.any(),
      });

      const routes = registry.getAllRoutes();
      expect(routes).toHaveLength(2);
      expect(routes.map(r => r.path)).toContain('/api/v1/a');
      expect(routes.map(r => r.path)).toContain('/api/v1/b');
    });

    test('should include full route definition', () => {
      registry.register({
        path: '/api/v1/test',
        method: 'GET',
        description: 'Test description',
        tags: ['Test', 'Example'],
        response: z.object({ success: z.boolean() }),
      });

      const routes = registry.getAllRoutes();
      expect(routes[0]).toMatchObject({
        path: '/api/v1/test',
        method: 'GET',
        description: 'Test description',
        tags: ['Test', 'Example'],
      });
    });
  });

  describe('getRoutesByTag', () => {
    beforeEach(() => {
      registry.register({
        path: '/api/v1/viz',
        method: 'GET',
        description: 'Viz',
        tags: ['Visualization'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/resources',
        method: 'GET',
        description: 'Resources',
        tags: ['Resources', 'Kubernetes'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/events',
        method: 'GET',
        description: 'Events',
        tags: ['Resources', 'Kubernetes'],
        response: z.any(),
      });
    });

    test('should filter routes by tag', () => {
      const vizRoutes = registry.getRoutesByTag('Visualization');
      expect(vizRoutes).toHaveLength(1);
      expect(vizRoutes[0].path).toBe('/api/v1/viz');
    });

    test('should return multiple routes with same tag', () => {
      const k8sRoutes = registry.getRoutesByTag('Kubernetes');
      expect(k8sRoutes).toHaveLength(2);
    });

    test('should return empty array for unknown tag', () => {
      const routes = registry.getRoutesByTag('Unknown');
      expect(routes).toEqual([]);
    });
  });

  describe('clear', () => {
    test('should remove all registered routes', () => {
      registry.register({
        path: '/api/v1/a',
        method: 'GET',
        description: 'A',
        tags: ['A'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/b',
        method: 'GET',
        description: 'B',
        tags: ['B'],
        response: z.any(),
      });

      expect(registry.getRouteCount()).toBe(2);

      registry.clear();

      expect(registry.getRouteCount()).toBe(0);
      expect(registry.getAllRoutes()).toEqual([]);
      expect(registry.getTags()).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('should return accurate statistics', () => {
      registry.register({
        path: '/api/v1/get1',
        method: 'GET',
        description: 'Get 1',
        tags: ['A'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/get2',
        method: 'GET',
        description: 'Get 2',
        tags: ['B'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/post1',
        method: 'POST',
        description: 'Post 1',
        tags: ['A', 'B'],
        response: z.any(),
      });

      registry.register({
        path: '/api/v1/delete1',
        method: 'DELETE',
        description: 'Delete 1',
        tags: ['C'],
        response: z.any(),
      });

      const stats = registry.getStats();
      expect(stats).toMatchObject({
        totalRoutes: 4,
        tags: ['A', 'B', 'C'],
        routesByMethod: {
          GET: 2,
          POST: 1,
          PUT: 0,
          DELETE: 1,
        },
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle paths with special regex characters', () => {
      registry.register({
        path: '/api/v1/test.json',
        method: 'GET',
        description: 'JSON endpoint',
        tags: ['Test'],
        response: z.any(),
      });

      const match = registry.findRoute('GET', '/api/v1/test.json');
      expect(match).not.toBeNull();
      expect(match!.route.path).toBe('/api/v1/test.json');
    });

    test('should not match when dot is not escaped properly', () => {
      registry.register({
        path: '/api/v1/test.json',
        method: 'GET',
        description: 'JSON endpoint',
        tags: ['Test'],
        response: z.any(),
      });

      // Should not match with different character in place of dot
      const match = registry.findRoute('GET', '/api/v1/testXjson');
      expect(match).toBeNull();
    });

    test('should handle empty tags array', () => {
      registry.register({
        path: '/api/v1/untagged',
        method: 'GET',
        description: 'No tags',
        tags: [],
        response: z.any(),
      });

      expect(registry.getRouteCount()).toBe(1);
      expect(registry.getTags()).toEqual([]);
    });

    test('should handle param names with underscores', () => {
      registry.register({
        path: '/api/v1/items/:item_id/sub/:sub_item_id',
        method: 'GET',
        description: 'Nested items',
        tags: ['Items'],
        params: z.object({
          item_id: z.string(),
          sub_item_id: z.string(),
        }),
        response: z.any(),
      });

      const match = registry.findRoute('GET', '/api/v1/items/123/sub/456');
      expect(match!.params).toEqual({
        item_id: '123',
        sub_item_id: '456',
      });
    });
  });
});
