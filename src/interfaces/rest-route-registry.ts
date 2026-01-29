/**
 * REST API Route Registry
 *
 * Central registry for all REST API routes with their metadata and schemas.
 * Provides single source of truth for routing, OpenAPI generation, and fixture validation.
 *
 * PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures
 */

import { z } from 'zod';
import { Logger } from '../core/error-handling';

/**
 * HTTP methods supported by the REST API
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Route handler function type
 */
export type RouteHandler<TParams, TQuery, TBody, TResponse> = (context: {
  params: TParams;
  query: TQuery;
  body: TBody;
  requestId: string;
}) => Promise<TResponse>;

/**
 * Route definition with full metadata for routing, documentation, and validation
 */
export interface RouteDefinition<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown,
  TResponse = unknown,
> {
  /** Route path with optional parameters (e.g., "/api/v1/visualize/:sessionId") */
  path: string;
  /** HTTP method */
  method: HttpMethod;
  /** Human-readable description for OpenAPI documentation */
  description: string;
  /** OpenAPI tags for grouping endpoints */
  tags: string[];
  /** Zod schema for path parameters */
  params?: z.ZodSchema<TParams>;
  /** Zod schema for query string parameters */
  query?: z.ZodSchema<TQuery>;
  /** Zod schema for request body */
  body?: z.ZodSchema<TBody>;
  /** Zod schema for successful response */
  response: z.ZodSchema<TResponse>;
  /** Zod schemas for error responses by HTTP status code */
  errorResponses?: Record<number, z.ZodSchema<unknown>>;
  /** Route handler function (optional - can be set during migration) */
  handler?: RouteHandler<TParams, TQuery, TBody, TResponse>;
}

/**
 * Result of matching a request path against registered routes
 */
export interface RouteMatch {
  /** The matched route definition */
  route: RouteDefinition<unknown, unknown, unknown, unknown>;
  /** Extracted path parameters */
  params: Record<string, string>;
}

/**
 * Internal storage for compiled route patterns
 */
interface CompiledRoute {
  definition: RouteDefinition<unknown, unknown, unknown, unknown>;
  regex: RegExp;
  paramNames: string[];
}

/**
 * Registry for managing REST API routes
 *
 * Provides:
 * - Route registration with Zod schemas
 * - Path matching with parameter extraction
 * - Route discovery for OpenAPI generation
 * - Schema access for fixture validation
 */
export class RestRouteRegistry {
  private routes: Map<string, CompiledRoute> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Generate a unique key for a route based on method and path pattern
   */
  private getRouteKey(method: HttpMethod, path: string): string {
    return `${method}:${path}`;
  }

  /**
   * Compile a path pattern into a regex for matching
   *
   * Converts path parameters like :sessionId into capture groups
   * Example: "/api/v1/visualize/:sessionId" -> /^\/api\/v1\/visualize\/([^/]+)$/
   */
  private compilePath(path: string): { regex: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];

    // Escape special regex characters except for parameter placeholders
    const regexPattern = path
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, paramName) => {
        paramNames.push(paramName);
        return '([^/]+)'; // Capture group for parameter value
      });

    const regex = new RegExp(`^${regexPattern}$`);

    return { regex, paramNames };
  }

  /**
   * Register a route in the registry
   *
   * @param route - Route definition with path, method, schemas, and metadata
   * @throws Error if route with same method and path is already registered
   */
  register<TParams, TQuery, TBody, TResponse>(
    route: RouteDefinition<TParams, TQuery, TBody, TResponse>
  ): void {
    const key = this.getRouteKey(route.method, route.path);

    if (this.routes.has(key)) {
      throw new Error(
        `Route already registered: ${route.method} ${route.path}`
      );
    }

    const { regex, paramNames } = this.compilePath(route.path);

    this.routes.set(key, {
      definition: route as RouteDefinition<unknown, unknown, unknown, unknown>,
      regex,
      paramNames,
    });

    this.logger.debug('Route registered in REST route registry', {
      method: route.method,
      path: route.path,
      tags: route.tags,
      paramNames,
    });
  }

  /**
   * Find a matching route for the given method and path
   *
   * Checks routes in order:
   * 1. Exact matches (no parameters)
   * 2. Parameterized routes (extracts parameter values)
   *
   * @param method - HTTP method
   * @param path - Request path to match
   * @returns RouteMatch with route and extracted params, or null if no match
   */
  findRoute(method: string, path: string): RouteMatch | null {
    const upperMethod = method.toUpperCase() as HttpMethod;

    // First pass: try exact match (more efficient for non-parameterized routes)
    const exactKey = this.getRouteKey(upperMethod, path);
    const exactMatch = this.routes.get(exactKey);
    if (exactMatch) {
      return {
        route: exactMatch.definition,
        params: {},
      };
    }

    // Second pass: try parameterized routes
    for (const [key, compiled] of this.routes) {
      // Skip if method doesn't match
      if (!key.startsWith(`${upperMethod}:`)) {
        continue;
      }

      const match = compiled.regex.exec(path);
      if (match) {
        // Extract parameter values from capture groups
        const params: Record<string, string> = {};
        compiled.paramNames.forEach((name, index) => {
          params[name] = match[index + 1]; // +1 because match[0] is full match
        });

        return {
          route: compiled.definition,
          params,
        };
      }
    }

    return null;
  }

  /**
   * Find allowed methods for a path (ignoring method)
   *
   * Used to return METHOD_NOT_ALLOWED with proper Allow header
   * when a path matches but method doesn't.
   *
   * @param path - Request path to match
   * @returns Array of allowed methods, or empty array if path doesn't match any route
   */
  findAllowedMethods(path: string): HttpMethod[] {
    const methods: HttpMethod[] = [];

    for (const compiled of this.routes.values()) {
      const match = compiled.regex.exec(path);
      if (match) {
        methods.push(compiled.definition.method);
      }
    }

    return methods;
  }

  /**
   * Get all registered route definitions
   *
   * Used by OpenAPI generator to document all endpoints
   */
  getAllRoutes(): RouteDefinition<unknown, unknown, unknown, unknown>[] {
    return Array.from(this.routes.values()).map((r) => r.definition);
  }

  /**
   * Get the response schema for a specific route
   *
   * Used by fixture validator to validate fixture data
   *
   * @param method - HTTP method
   * @param pathPattern - Route path pattern (e.g., "/api/v1/visualize/:sessionId")
   * @returns Zod schema for the response, or null if route not found
   */
  getResponseSchema(
    method: string,
    pathPattern: string
  ): z.ZodSchema<unknown> | null {
    const key = this.getRouteKey(method.toUpperCase() as HttpMethod, pathPattern);
    const route = this.routes.get(key);
    return route?.definition.response ?? null;
  }

  /**
   * Get the error response schema for a specific route and status code
   *
   * @param method - HTTP method
   * @param pathPattern - Route path pattern
   * @param statusCode - HTTP status code
   * @returns Zod schema for the error response, or null if not defined
   */
  getErrorResponseSchema(
    method: string,
    pathPattern: string,
    statusCode: number
  ): z.ZodSchema<unknown> | null {
    const key = this.getRouteKey(method.toUpperCase() as HttpMethod, pathPattern);
    const route = this.routes.get(key);
    return route?.definition.errorResponses?.[statusCode] ?? null;
  }

  /**
   * Check if a route is registered
   */
  hasRoute(method: string, pathPattern: string): boolean {
    const key = this.getRouteKey(method.toUpperCase() as HttpMethod, pathPattern);
    return this.routes.has(key);
  }

  /**
   * Get the number of registered routes
   */
  getRouteCount(): number {
    return this.routes.size;
  }

  /**
   * Get all unique tags from registered routes
   */
  getTags(): string[] {
    const tags = new Set<string>();
    for (const compiled of this.routes.values()) {
      for (const tag of compiled.definition.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get routes filtered by tag
   */
  getRoutesByTag(
    tag: string
  ): RouteDefinition<unknown, unknown, unknown, unknown>[] {
    return this.getAllRoutes().filter((route) => route.tags.includes(tag));
  }

  /**
   * Clear all registered routes
   */
  clear(): void {
    this.routes.clear();
    this.logger.debug('REST route registry cleared');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalRoutes: number;
    tags: string[];
    routesByMethod: Record<HttpMethod, number>;
  } {
    const routesByMethod: Record<HttpMethod, number> = {
      GET: 0,
      POST: 0,
      PUT: 0,
      DELETE: 0,
    };

    for (const compiled of this.routes.values()) {
      routesByMethod[compiled.definition.method]++;
    }

    return {
      totalRoutes: this.routes.size,
      tags: this.getTags(),
      routesByMethod,
    };
  }
}
