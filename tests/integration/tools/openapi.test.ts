/**
 * Integration Test: OpenAPI Specification Endpoint
 *
 * Tests the OpenAPI specification endpoint via REST API.
 * Validates that:
 * - The endpoint is accessible WITHOUT authentication (public documentation)
 * - The OpenAPI schema has the correct structure
 * - All registered tools are documented
 *
 * NOTE: This test specifically validates that the OpenAPI endpoint bypasses
 * authentication to allow public API documentation access.
 */

import { describe, test, expect } from 'vitest';
import { HttpRestApiClient } from '../helpers/http-client.js';
import { IntegrationTest } from '../helpers/test-base.js';

describe.concurrent('OpenAPI Specification Integration', () => {
  // Create an HTTP client WITHOUT authentication headers
  // This validates that the OpenAPI endpoint is publicly accessible
  const unauthenticatedClient = new HttpRestApiClient({
    // Explicitly don't pass auth headers - this is the key test
  });

  // Also test with authenticated client for comparison
  const integrationTest = new IntegrationTest();

  // Helper to extract OpenAPI spec from wrapped response
  // The HTTP client wraps raw JSON responses in { success: true, data: <response> }
  const getOpenApiSpec = (response: any) => response.data || response;

  describe('Public Access (No Authentication)', () => {
    test('should return OpenAPI specification without authentication', async () => {
      // This is the key test: OpenAPI endpoint should work WITHOUT auth
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      // Should succeed without authentication
      expect(spec).toMatchObject({
        openapi: '3.0.0',
        info: expect.objectContaining({
          title: expect.any(String),
          description: expect.any(String),
          version: expect.any(String)
        }),
        servers: expect.arrayContaining([
          expect.objectContaining({
            url: expect.any(String),
            description: expect.any(String)
          })
        ]),
        paths: expect.any(Object),
        components: expect.objectContaining({
          schemas: expect.any(Object)
        }),
        tags: expect.any(Array)
      });
    });

    test('should include all registered MCP tools in paths', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      // Verify essential tool endpoints exist
      const paths = spec.paths as Record<string, any>;

      // Check for tool discovery endpoint
      expect(paths).toHaveProperty('/api/v1/tools');
      expect(paths['/api/v1/tools']).toHaveProperty('get');

      // Check for OpenAPI endpoint itself
      expect(paths).toHaveProperty('/api/v1/openapi');
      expect(paths['/api/v1/openapi']).toHaveProperty('get');

      // Check for MCP protocol endpoints
      expect(paths).toHaveProperty('/');
      expect(paths['/']).toHaveProperty('get'); // SSE stream
      expect(paths['/']).toHaveProperty('post'); // JSON-RPC

      // Check for known tool endpoints (sample validation)
      expect(paths).toHaveProperty('/api/v1/tools/version');
      expect(paths['/api/v1/tools/version']).toHaveProperty('post');

      expect(paths).toHaveProperty('/api/v1/tools/recommend');
      expect(paths['/api/v1/tools/recommend']).toHaveProperty('post');

      expect(paths).toHaveProperty('/api/v1/tools/remediate');
      expect(paths['/api/v1/tools/remediate']).toHaveProperty('post');
    });

    test('should include proper component schemas', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      const schemas = spec.components?.schemas as Record<string, any>;

      // Verify base response schemas exist
      expect(schemas).toHaveProperty('RestApiResponse');
      expect(schemas).toHaveProperty('ToolExecutionResponse');
      expect(schemas).toHaveProperty('ToolDiscoveryResponse');
      expect(schemas).toHaveProperty('ToolInfo');
      expect(schemas).toHaveProperty('ErrorResponse');

      // Verify MCP JSON-RPC schemas exist
      expect(schemas).toHaveProperty('McpJsonRpcRequest');
      expect(schemas).toHaveProperty('McpJsonRpcResponse');
      expect(schemas).toHaveProperty('McpJsonRpcError');

      // Verify tool request schemas exist (sample validation)
      expect(schemas).toHaveProperty('versionRequest');
      expect(schemas).toHaveProperty('recommendRequest');
    });

    test('should include proper tags for grouping', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      const tags = spec.tags as Array<{ name: string; description: string }>;

      // Verify expected tags exist
      const tagNames = tags.map(t => t.name);

      expect(tagNames).toContain('MCP Protocol');
      expect(tagNames).toContain('Tool Discovery');
      expect(tagNames).toContain('Documentation');
    });
  });

  describe('Schema Validation', () => {
    test('should have valid OpenAPI 3.0 info section', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      expect(spec.info).toMatchObject({
        title: 'DevOps AI Toolkit REST API',
        description: expect.stringContaining('REST API gateway'),
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
        contact: {
          name: expect.any(String),
          url: expect.any(String),
          email: expect.stringContaining('@')
        },
        license: {
          name: 'MIT',
          url: expect.stringContaining('LICENSE')
        }
      });
    });

    test('should have valid path definitions with proper HTTP methods', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      const paths = spec.paths as Record<string, any>;

      // Tool execution endpoints should only accept POST
      const versionPath = paths['/api/v1/tools/version'];
      expect(versionPath).toHaveProperty('post');
      expect(versionPath).not.toHaveProperty('get');
      expect(versionPath).not.toHaveProperty('put');
      expect(versionPath).not.toHaveProperty('delete');

      // Tool discovery endpoint should only accept GET
      const toolsPath = paths['/api/v1/tools'];
      expect(toolsPath).toHaveProperty('get');
      expect(toolsPath).not.toHaveProperty('post');

      // OpenAPI endpoint should only accept GET
      const openApiPath = paths['/api/v1/openapi'];
      expect(openApiPath).toHaveProperty('get');
      expect(openApiPath).not.toHaveProperty('post');
    });

    test('should have proper request/response schemas for tools', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);

      const paths = spec.paths as Record<string, any>;
      const versionEndpoint = paths['/api/v1/tools/version']?.post;

      // Verify request body schema reference
      expect(versionEndpoint).toHaveProperty('requestBody');
      expect(versionEndpoint.requestBody).toMatchObject({
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/versionRequest'
            }
          }
        }
      });

      // Verify response schema reference
      expect(versionEndpoint).toHaveProperty('responses');
      expect(versionEndpoint.responses).toHaveProperty('200');
      expect(versionEndpoint.responses['200'].content['application/json'].schema).toMatchObject({
        $ref: '#/components/schemas/ToolExecutionResponse'
      });
    });
  });

  describe('Authenticated Access Comparison', () => {
    test('should return same OpenAPI spec with or without authentication', async () => {
      // Get spec without auth
      const unauthResponse = await unauthenticatedClient.get('/api/v1/openapi');
      const unauthSpec = getOpenApiSpec(unauthResponse);

      // Get spec with auth (using the authenticated client from IntegrationTest)
      const authResponse = await integrationTest.httpClient.get('/api/v1/openapi');
      const authSpec = getOpenApiSpec(authResponse);

      // Both should return the same OpenAPI spec structure
      expect(unauthSpec.openapi).toBe(authSpec.openapi);
      expect(unauthSpec.info.title).toBe(authSpec.info.title);
      expect(Object.keys(unauthSpec.paths)).toEqual(Object.keys(authSpec.paths));
    });
  });

  describe('Error Handling', () => {
    test('should reject POST method on OpenAPI endpoint', async () => {
      // OpenAPI endpoint should only accept GET, not POST
      const response = await unauthenticatedClient.post('/api/v1/openapi', {});

      expect(response).toMatchObject({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: expect.stringContaining('GET')
        }
      });
    });
  });

  /**
   * PRD #354: Route Registry Integration
   * Validates that OpenAPI generator correctly integrates with RestRouteRegistry.
   * Uses minimal representative examples - individual endpoint functionality is
   * tested in their respective integration tests.
   */
  describe('Route Registry Integration (PRD #354)', () => {
    test('should generate OpenAPI paths from route registry with proper structure', async () => {
      const response = await unauthenticatedClient.get('/api/v1/openapi');
      const spec = getOpenApiSpec(response);
      const paths = spec.paths as Record<string, any>;

      // Verify parameterized route converts :param to {param} format
      expect(paths).toHaveProperty('/api/v1/visualize/{sessionId}');
      const vizEndpoint = paths['/api/v1/visualize/{sessionId}']?.get;
      expect(vizEndpoint).toBeDefined();

      // Verify path parameter is documented
      expect(vizEndpoint.parameters).toBeDefined();
      const sessionIdParam = vizEndpoint.parameters.find(
        (p: any) => p.name === 'sessionId' && p.in === 'path'
      );
      expect(sessionIdParam).toMatchObject({
        name: 'sessionId',
        in: 'path',
        required: true,
      });

      // Verify response schema reference exists
      expect(vizEndpoint.responses['200'].content['application/json'].schema.$ref).toBeDefined();

      // Verify error responses are documented
      expect(vizEndpoint.responses).toHaveProperty('404');

      // Verify tags from route registry are included
      expect(vizEndpoint.tags).toContain('Visualization');
    });
  });
});
