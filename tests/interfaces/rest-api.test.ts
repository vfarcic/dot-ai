/**
 * Tests for REST API Gateway functionality
 * 
 * Covers tool registry, REST routing, OpenAPI generation, and MCP integration
 */

import { z } from 'zod';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { RestToolRegistry } from '../../src/interfaces/rest-registry';
import { RestApiRouter, HttpStatus } from '../../src/interfaces/rest-api';
import { OpenApiGenerator } from '../../src/interfaces/openapi-generator';
import { ConsoleLogger } from '../../src/core/error-handling';
import { DotAI } from '../../src/core/index';

// Mock DotAI
const mockDotAI = {
  getAnthropicApiKey: jest.fn().mockReturnValue('test-key'),
  getOpenAiApiKey: jest.fn().mockReturnValue('test-openai-key'),
} as unknown as DotAI;

// Mock tool schemas and handlers for testing
const testToolSchema = {
  intent: z.string().min(1).describe('Test intent parameter'),
  optional: z.boolean().optional().describe('Optional boolean parameter')
};

const testToolHandler = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Test tool executed successfully' }]
});

const anotherTestToolSchema = {
  name: z.string().describe('Name parameter'),
  count: z.number().describe('Count parameter')
};

const anotherTestToolHandler = jest.fn().mockResolvedValue({
  content: [{ type: 'text', text: 'Another test tool result' }]
});

describe('RestToolRegistry', () => {
  let registry: RestToolRegistry;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('test');
    registry = new RestToolRegistry(logger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register and retrieve tools', () => {
      registry.registerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: testToolSchema,
        handler: testToolHandler,
        category: 'Test',
        tags: ['test', 'demo']
      });

      expect(registry.hasTool('test-tool')).toBe(true);
      expect(registry.getToolCount()).toBe(1);
      expect(registry.getToolNames()).toEqual(['test-tool']);

      const tool = registry.getTool('test-tool');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('test-tool');
      expect(tool?.description).toBe('Test tool description');
      expect(tool?.category).toBe('Test');
      expect(tool?.tags).toEqual(['test', 'demo']);
    });

    it('should handle multiple tool registrations', () => {
      registry.registerTool({
        name: 'tool-1',
        description: 'First tool',
        inputSchema: testToolSchema,
        handler: testToolHandler,
        category: 'Category A'
      });

      registry.registerTool({
        name: 'tool-2',
        description: 'Second tool',
        inputSchema: anotherTestToolSchema,
        handler: anotherTestToolHandler,
        category: 'Category B'
      });

      expect(registry.getToolCount()).toBe(2);
      expect(registry.getCategories()).toEqual(['Category A', 'Category B']);
      expect(registry.getToolNames().sort()).toEqual(['tool-1', 'tool-2']);
    });

    it('should generate JSON schema from Zod schemas', () => {
      registry.registerTool({
        name: 'schema-test',
        description: 'Schema test tool',
        inputSchema: testToolSchema,
        handler: testToolHandler
      });

      const tools = registry.getAllTools();
      expect(tools).toHaveLength(1);
      
      const tool = tools[0];
      expect(tool.schema).toBeDefined();
      expect(tool.schema.type).toBe('object');
      expect(tool.schema.properties).toBeDefined();
      expect(tool.schema.properties?.intent).toBeDefined();
      expect(tool.schema.properties?.optional).toBeDefined();
    });

    it('should filter tools by category, tag, and search', () => {
      registry.registerTool({
        name: 'deployment-tool',
        description: 'Deploy applications to Kubernetes',
        inputSchema: testToolSchema,
        handler: testToolHandler,
        category: 'Deployment',
        tags: ['kubernetes', 'deployment']
      });

      registry.registerTool({
        name: 'monitoring-tool',
        description: 'Monitor system performance',
        inputSchema: anotherTestToolSchema,
        handler: anotherTestToolHandler,
        category: 'Monitoring',
        tags: ['monitoring', 'metrics']
      });

      // Test category filter
      const deploymentTools = registry.getToolsFiltered({ category: 'Deployment' });
      expect(deploymentTools).toHaveLength(1);
      expect(deploymentTools[0].name).toBe('deployment-tool');

      // Test tag filter
      const kubernetesTools = registry.getToolsFiltered({ tag: 'kubernetes' });
      expect(kubernetesTools).toHaveLength(1);
      expect(kubernetesTools[0].name).toBe('deployment-tool');

      // Test search filter
      const searchResults = registry.getToolsFiltered({ search: 'monitor' });
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].name).toBe('monitoring-tool');
    });

    it('should clear registry', () => {
      registry.registerTool({
        name: 'test-tool',
        description: 'Test tool',
        inputSchema: testToolSchema,
        handler: testToolHandler
      });

      expect(registry.getToolCount()).toBe(1);
      
      registry.clear();
      
      expect(registry.getToolCount()).toBe(0);
      expect(registry.getToolNames()).toEqual([]);
    });
  });
});

describe('RestApiRouter', () => {
  let registry: RestToolRegistry;
  let router: RestApiRouter;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('test');
    registry = new RestToolRegistry(logger);
    router = new RestApiRouter(registry, mockDotAI, logger);

    // Register test tools
    registry.registerTool({
      name: 'test-tool',
      description: 'Test tool for API testing',
      inputSchema: testToolSchema,
      handler: testToolHandler,
      category: 'Test',
      tags: ['api', 'test']
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('API Path Parsing', () => {
    it('should identify API requests correctly', () => {
      expect(router.isApiRequest('/api/v1/tools')).toBe(true);
      expect(router.isApiRequest('/api/v1/tools/test-tool')).toBe(true);
      expect(router.isApiRequest('/api/v1/openapi')).toBe(true);
      expect(router.isApiRequest('/other/path')).toBe(false);
      expect(router.isApiRequest('/mcp/message')).toBe(false);
    });
  });

  describe('Tool Discovery Endpoint', () => {
    it('should handle tool discovery requests', async () => {
      const { req, res } = createMockRequestResponse('GET', '/api/v1/tools');
      
      await router.handleRequest(req, res);
      
      const response = JSON.parse(res.writtenData);
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.tools).toHaveLength(1);
      expect(response.data.tools[0].name).toBe('test-tool');
      expect(response.data.total).toBe(1);
      expect(response.meta.version).toBe('v1');
    });

    it('should handle tool discovery with filters', async () => {
      // Add another tool
      registry.registerTool({
        name: 'other-tool',
        description: 'Another test tool',
        inputSchema: anotherTestToolSchema,
        handler: anotherTestToolHandler,
        category: 'Other'
      });

      const { req, res } = createMockRequestResponse('GET', '/api/v1/tools?category=Test');
      
      await router.handleRequest(req, res);
      
      const response = JSON.parse(res.writtenData);
      expect(response.success).toBe(true);
      expect(response.data.tools).toHaveLength(1);
      expect(response.data.tools[0].name).toBe('test-tool');
    });
  });

  describe('Tool Execution Endpoint', () => {
    it('should execute tools successfully', async () => {
      const requestBody = { intent: 'test intent', optional: true };
      const { req, res } = createMockRequestResponse('POST', '/api/v1/tools/test-tool');
      
      await router.handleRequest(req, res, requestBody);
      
      expect(testToolHandler).toHaveBeenCalledWith(
        requestBody,
        mockDotAI,
        logger,
        expect.any(String)
      );
      
      const response = JSON.parse(res.writtenData);
      expect(response.success).toBe(true);
      expect(response.data.tool).toBe('test-tool');
      expect(response.data.result).toBeDefined();
      expect(response.data.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle tool not found', async () => {
      const { req, res } = createMockRequestResponse('POST', '/api/v1/tools/nonexistent-tool');
      
      await router.handleRequest(req, res, {});
      
      const response = JSON.parse(res.writtenData);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('TOOL_NOT_FOUND');
      expect(res.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('should handle invalid request body', async () => {
      const { req, res } = createMockRequestResponse('POST', '/api/v1/tools/test-tool');
      
      await router.handleRequest(req, res, null);
      
      const response = JSON.parse(res.writtenData);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_REQUEST');
      expect(res.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should handle method not allowed', async () => {
      const { req, res } = createMockRequestResponse('GET', '/api/v1/tools/test-tool');
      
      await router.handleRequest(req, res);
      
      const response = JSON.parse(res.writtenData);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(res.statusCode).toBe(HttpStatus.METHOD_NOT_ALLOWED);
    });
  });

  describe('CORS Handling', () => {
    it('should handle CORS preflight requests', async () => {
      const { req, res } = createMockRequestResponse('OPTIONS', '/api/v1/tools');
      
      await router.handleRequest(req, res);
      
      expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
      expect(res.statusCode).toBe(HttpStatus.OK);
    });
  });
});

describe('OpenApiGenerator', () => {
  let registry: RestToolRegistry;
  let generator: OpenApiGenerator;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('test');
    registry = new RestToolRegistry(logger);
    generator = new OpenApiGenerator(registry, logger);

    // Register test tools
    registry.registerTool({
      name: 'test-tool',
      description: 'Test tool for OpenAPI generation',
      inputSchema: testToolSchema,
      handler: testToolHandler,
      category: 'Test'
    });

    registry.registerTool({
      name: 'another-tool',
      description: 'Another tool for testing',
      inputSchema: anotherTestToolSchema,
      handler: anotherTestToolHandler,
      category: 'Other'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Specification Generation', () => {
    it('should generate valid OpenAPI 3.0 specification', () => {
      const spec = generator.generateSpec();
      
      expect(spec.openapi).toBe('3.0.0');
      expect(spec.info.title).toBe('DevOps AI Toolkit REST API');
      expect(spec.info.version).toBe('1.0.0');
      expect(spec.servers).toHaveLength(1);
      expect(spec.servers[0].url).toBe('http://localhost:3456');
    });

    it('should include all registered tools as paths', () => {
      const spec = generator.generateSpec();
      
      expect(spec.paths['/api/v1/tools']).toBeDefined();
      expect(spec.paths['/api/v1/tools/test-tool']).toBeDefined();
      expect(spec.paths['/api/v1/tools/another-tool']).toBeDefined();
      expect(spec.paths['/api/v1/openapi']).toBeDefined();
      
      // Check tool endpoints have POST methods
      expect(spec.paths['/api/v1/tools/test-tool'].post).toBeDefined();
      expect(spec.paths['/api/v1/tools/another-tool'].post).toBeDefined();
      
      // Check discovery endpoint has GET method
      expect(spec.paths['/api/v1/tools'].get).toBeDefined();
    });

    it('should generate component schemas for all tools', () => {
      const spec = generator.generateSpec();
      
      expect(spec.components?.schemas).toBeDefined();
      expect(spec.components?.schemas?.['test-toolRequest']).toBeDefined();
      expect(spec.components?.schemas?.['another-toolRequest']).toBeDefined();
      expect(spec.components?.schemas?.['RestApiResponse']).toBeDefined();
      expect(spec.components?.schemas?.['ToolExecutionResponse']).toBeDefined();
      expect(spec.components?.schemas?.['ToolDiscoveryResponse']).toBeDefined();
    });

    it('should include appropriate tags', () => {
      const spec = generator.generateSpec();
      
      expect(spec.tags).toBeDefined();
      const tagNames = spec.tags?.map(tag => tag.name) || [];
      expect(tagNames).toContain('Tool Discovery');
      expect(tagNames).toContain('Documentation');
      expect(tagNames).toContain('Test');
      expect(tagNames).toContain('Other');
    });

    it('should cache generated specifications', () => {
      // First call
      const spec1 = generator.generateSpec();
      
      // Second call should return the same object reference (cached)
      const spec2 = generator.generateSpec();
      
      // The specs should be identical (from cache)
      expect(spec1).toEqual(spec2);
      expect(spec1).toBe(spec2); // Same object reference indicates caching
    });

    it('should invalidate cache when requested', () => {
      // First call
      const spec1 = generator.generateSpec();
      
      // Second call should return same cached object
      const spec2 = generator.generateSpec();
      expect(spec1).toBe(spec2);
      
      // Invalidate cache
      generator.invalidateCache();
      
      // Third call should generate new spec
      const spec3 = generator.generateSpec();
      expect(spec3).toEqual(spec1); // Content should be the same
      expect(spec3).not.toBe(spec1); // But should be different object (regenerated)
    });
  });

  describe('Configuration Management', () => {
    it('should use custom configuration', () => {
      const customGenerator = new OpenApiGenerator(registry, logger, {
        title: 'Custom API',
        version: '2.0.0',
        serverUrl: 'https://api.example.com'
      });
      
      const spec = customGenerator.generateSpec();
      expect(spec.info.title).toBe('Custom API');
      expect(spec.info.version).toBe('2.0.0');
      expect(spec.servers[0].url).toBe('https://api.example.com');
    });

    it('should allow configuration updates', () => {
      generator.updateConfig({ title: 'Updated API' });
      
      const spec = generator.generateSpec();
      expect(spec.info.title).toBe('Updated API');
    });
  });
});

describe('Integration Tests', () => {
  let registry: RestToolRegistry;
  let router: RestApiRouter;
  let generator: OpenApiGenerator;
  let logger: ConsoleLogger;

  beforeEach(() => {
    logger = new ConsoleLogger('test');
    registry = new RestToolRegistry(logger);
    router = new RestApiRouter(registry, mockDotAI, logger);
    generator = new OpenApiGenerator(registry, logger);

    // Register test tool
    registry.registerTool({
      name: 'integration-test',
      description: 'Tool for integration testing',
      inputSchema: testToolSchema,
      handler: testToolHandler,
      category: 'Integration'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should serve OpenAPI spec through REST endpoint', async () => {
    const { req, res } = createMockRequestResponse('GET', '/api/v1/openapi');
    
    await router.handleRequest(req, res);
    
    const response = JSON.parse(res.writtenData);
    expect(response.openapi).toBe('3.0.0');
    expect(response.paths['/api/v1/tools/integration-test']).toBeDefined();
    expect(res.statusCode).toBe(HttpStatus.OK);
  });

  it('should reflect registry changes in API responses', async () => {
    // Initial state
    let { req, res } = createMockRequestResponse('GET', '/api/v1/tools');
    await router.handleRequest(req, res);
    let response = JSON.parse(res.writtenData);
    expect(response.data.tools).toHaveLength(1);

    // Add another tool
    registry.registerTool({
      name: 'dynamic-tool',
      description: 'Dynamically added tool',
      inputSchema: anotherTestToolSchema,
      handler: anotherTestToolHandler
    });

    // Check updated state
    ({ req, res } = createMockRequestResponse('GET', '/api/v1/tools'));
    await router.handleRequest(req, res);
    response = JSON.parse(res.writtenData);
    expect(response.data.tools).toHaveLength(2);
  });
});

// Helper function to create mock HTTP request/response objects
function createMockRequestResponse(method: string, url: string, body?: any): {
  req: IncomingMessage;
  res: ServerResponse & { writtenData: string; statusCode: number; headers: Record<string, string> };
} {
  const req = new Readable() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = {};

  const res = {
    writtenData: '',
    statusCode: 200,
    headers: {} as Record<string, string>,
    writeHead: jest.fn((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) {
        Object.assign(res.headers, headers);
      }
    }),
    setHeader: jest.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    end: jest.fn((data?: string) => {
      if (data) {
        res.writtenData = data;
      }
    }),
    headersSent: false
  } as unknown as ServerResponse & { 
    writtenData: string; 
    statusCode: number; 
    headers: Record<string, string>;
  };

  return { req, res };
}