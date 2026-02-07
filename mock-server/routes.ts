/**
 * Mock Server Route Definitions
 *
 * Defines all API routes and their fixture mappings.
 * Fixtures are added incrementally based on Web UI feedback.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RouteDefinition {
  path: string;
  method: HttpMethod;
  description: string;
  fixture?: string; // Path to fixture file (relative to fixtures/)
}

/**
 * All API routes supported by the mock server.
 * Routes without a fixture will return 501 Not Implemented.
 */
export const routes: RouteDefinition[] = [
  // Tool Endpoints
  {
    path: '/api/v1/tools',
    method: 'GET',
    description: 'Discover available tools',
    // fixture: 'tools/discovery-success.json',
  },
  {
    path: '/api/v1/tools/manageKnowledge',
    method: 'POST',
    description: 'Manage knowledge base (ingest, search, delete)',
    fixture: 'tools/manageKnowledge-ingest-success.json',
  },
  {
    path: '/api/v1/tools/:toolName',
    method: 'POST',
    description: 'Execute a tool',
    // fixture: 'tools/execution-success.json',
  },

  // OpenAPI Endpoint
  {
    path: '/api/v1/openapi',
    method: 'GET',
    description: 'Get OpenAPI specification',
    // fixture: 'openapi/spec.json',
  },

  // Resource Endpoints
  {
    path: '/api/v1/resources',
    method: 'GET',
    description: 'List resources by kind',
    fixture: 'resources/list-pods.json',
  },
  {
    path: '/api/v1/resources/kinds',
    method: 'GET',
    description: 'List available resource kinds',
    fixture: 'resources/kinds-success.json',
  },
  {
    path: '/api/v1/resources/search',
    method: 'GET',
    description: 'Search resources',
    fixture: 'resources/search-results.json',
  },
  {
    path: '/api/v1/resources/sync',
    method: 'POST',
    description: 'Sync resources from cluster',
    // fixture: 'resources/sync-success.json',
  },
  {
    path: '/api/v1/resource',
    method: 'GET',
    description: 'Get a single resource',
    // fixture: 'resources/single-deployment.json',
  },
  {
    path: '/api/v1/namespaces',
    method: 'GET',
    description: 'List namespaces',
    fixture: 'resources/namespaces-success.json',
  },

  // Events Endpoint
  {
    path: '/api/v1/events',
    method: 'GET',
    description: 'Get events for a resource',
    // fixture: 'events/pod-events.json',
  },

  // Logs Endpoint
  {
    path: '/api/v1/logs',
    method: 'GET',
    description: 'Get container logs',
    // fixture: 'logs/container-logs.json',
  },

  // Prompts Endpoints
  {
    path: '/api/v1/prompts',
    method: 'GET',
    description: 'List available prompts',
    // fixture: 'prompts/list-success.json',
  },
  {
    path: '/api/v1/prompts/:promptName',
    method: 'POST',
    description: 'Get a prompt with arguments',
    // fixture: 'prompts/get-success.json',
  },

  // Knowledge Base Endpoints
  {
    path: '/api/v1/knowledge/source/:sourceIdentifier',
    method: 'DELETE',
    description: 'Delete all knowledge base chunks for a source identifier',
    fixture: 'knowledge/delete-source-success.json',
  },
  {
    path: '/api/v1/knowledge/ask',
    method: 'POST',
    description: 'Ask a question and receive an AI-synthesized answer from the knowledge base',
    fixture: 'knowledge/ask-success.json',
  },

  // Visualization Endpoint
  {
    path: '/api/v1/visualize/:sessionId',
    method: 'GET',
    description: 'Get visualization for a session',
    fixture: 'visualization/success-mermaid.json',
  },

  // Sessions Endpoint
  {
    path: '/api/v1/sessions/:sessionId',
    method: 'GET',
    description: 'Get session data',
    // fixture: 'sessions/query-session.json',
  },
];

/**
 * Compiled route with regex for path matching
 */
interface CompiledRoute {
  definition: RouteDefinition;
  regex: RegExp;
  paramNames: string[];
}

/**
 * Compile a path pattern into a regex
 */
function compilePath(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];

  const regexPattern = path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

  return { regex: new RegExp(`^${regexPattern}$`), paramNames };
}

// Pre-compile all routes
const compiledRoutes: CompiledRoute[] = routes.map((route) => {
  const { regex, paramNames } = compilePath(route.path);
  return { definition: route, regex, paramNames };
});

/**
 * Match a request to a route definition
 */
export function matchRoute(
  method: string,
  path: string
): { route: RouteDefinition; params: Record<string, string> } | null {
  const upperMethod = method.toUpperCase();

  for (const compiled of compiledRoutes) {
    if (compiled.definition.method !== upperMethod) {
      continue;
    }

    const match = compiled.regex.exec(path);
    if (match) {
      const params: Record<string, string> = {};
      compiled.paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      return { route: compiled.definition, params };
    }
  }

  return null;
}

/**
 * Get all routes (for documentation/debugging)
 */
export function getAllRoutes(): RouteDefinition[] {
  return routes;
}
