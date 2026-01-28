# PRD #354: REST API Route Registry with Auto-Generated OpenAPI and Test Fixtures

## Problem Statement

The dot-ai REST API has two maintenance problems:

1. **Documentation drift**: REST endpoints are defined in `rest-api.ts` (large switch statement) while OpenAPI documentation is generated separately in `openapi-generator.ts`. Adding a new endpoint requires manual updates to both files, and they frequently fall out of sync. Currently, only tool endpoints (`/api/v1/tools/*`) are documented in OpenAPI - other endpoints like `/api/v1/visualize`, `/api/v1/sessions`, `/api/v1/resources`, `/api/v1/events`, and `/api/v1/logs` are undocumented.

2. **No mock server support**: Consumers like dot-ai-ui need mock servers for Playwright testing and UI development. Without accurate OpenAPI schemas covering all endpoints, they cannot auto-generate mocks. Manual fixtures would drift from the actual API over time.

## Solution Overview

Create a **REST route registry** where each endpoint is defined with its metadata (path, method, request/response schemas, description). The OpenAPI spec and fixture validation are auto-generated from this single source of truth.

### Core Principle

Route definition = documentation. When you add a new endpoint to the registry, it's automatically:
- Routed to the correct handler
- Documented in OpenAPI
- Validated for fixture compatibility

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     REST Route Registry                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Route Definition:                                        │    │
│  │  - path: "/api/v1/visualize/:sessionId"                 │    │
│  │  - method: "GET"                                         │    │
│  │  - params: { sessionId: z.string() }                    │    │
│  │  - response: VisualizationResponseSchema                │    │
│  │  - description: "Get visualization for session"         │    │
│  │  - handler: handleVisualize                             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │   Router    │    │   OpenAPI   │    │  Fixture    │
   │  (handles   │    │  Generator  │    │  Validator  │
   │  requests)  │    │  (auto-gen) │    │  (CI check) │
   └─────────────┘    └─────────────┘    └─────────────┘
```

## User Journey

### For API Developers (Internal)

**Before:**
1. Add endpoint handler in `rest-api.ts` switch statement
2. Manually add path matching in `parseApiPath()`
3. Forget to update OpenAPI generator
4. Consumer reports missing documentation months later

**After:**
1. Define route in registry with schemas
2. OpenAPI automatically updated
3. If fixtures exist, CI validates they match schemas
4. Done - can't forget documentation

### For API Consumers (dot-ai-ui)

**Before:**
1. Fetch `/api/v1/openapi` - incomplete, missing most endpoints
2. Manually inspect code to understand response shapes
3. Create manual fixtures that drift over time
4. Tests fail randomly when API changes

**After:**
1. Fetch `/api/v1/openapi` - complete specification of all endpoints
2. Use `openapi-typescript` to generate types
3. Use Prism or MSW for mock server
4. Create fixture files validated against schemas
5. CI fails if fixtures don't match API - explicit notification of changes

## Technical Design

### Route Registry Interface

```typescript
// src/interfaces/rest-route-registry.ts

interface RouteDefinition<TParams, TQuery, TBody, TResponse> {
  path: string;                          // e.g., "/api/v1/visualize/:sessionId"
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  tags: string[];                        // OpenAPI tags for grouping
  params?: z.ZodSchema<TParams>;         // Path parameters
  query?: z.ZodSchema<TQuery>;           // Query parameters
  body?: z.ZodSchema<TBody>;             // Request body
  response: z.ZodSchema<TResponse>;      // Response schema
  errorResponses?: Record<number, z.ZodSchema<any>>; // Error response schemas
  handler: RouteHandler<TParams, TQuery, TBody, TResponse>;
}

class RestRouteRegistry {
  private routes: Map<string, RouteDefinition<any, any, any, any>>;

  register<TParams, TQuery, TBody, TResponse>(
    route: RouteDefinition<TParams, TQuery, TBody, TResponse>
  ): void;

  // Used by router to handle requests
  findRoute(method: string, path: string): RouteMatch | null;

  // Used by OpenAPI generator
  getAllRoutes(): RouteDefinition<any, any, any, any>[];

  // Used by fixture validator
  getResponseSchema(method: string, path: string): z.ZodSchema<any> | null;
}
```

### Example Route Registration

```typescript
// src/interfaces/routes/visualize.ts

import { z } from 'zod';
import { registry } from '../rest-route-registry';
import { VisualizationResponseSchema } from '../schemas/visualization';

registry.register({
  path: '/api/v1/visualize/:sessionId',
  method: 'GET',
  description: 'Get structured visualization data for a session',
  tags: ['Visualization'],
  params: z.object({
    sessionId: z.string().describe('Session ID from a previous tool call')
  }),
  query: z.object({
    reload: z.boolean().optional().describe('Force regeneration of visualization')
  }),
  response: VisualizationResponseSchema,
  errorResponses: {
    404: SessionNotFoundErrorSchema,
    503: AINotConfiguredErrorSchema
  },
  handler: handleVisualize
});
```

### OpenAPI Generation

The existing `OpenApiGenerator` will be updated to read from the route registry:

```typescript
// src/interfaces/openapi-generator.ts

class OpenApiGenerator {
  constructor(
    private toolRegistry: RestToolRegistry,    // Existing tool registry
    private routeRegistry: RestRouteRegistry,  // New route registry
    private logger: Logger
  ) {}

  generateSpec(): OpenApiSpec {
    return {
      // ... existing info, servers, etc.
      paths: {
        ...this.generateToolPaths(),    // Existing tool endpoints
        ...this.generateRoutePaths()    // New: all registered routes
      },
      components: {
        schemas: {
          ...this.generateToolSchemas(),
          ...this.generateRouteSchemas()  // Schemas from Zod → JSON Schema
        }
      }
    };
  }

  private generateRoutePaths(): Record<string, any> {
    const paths: Record<string, any> = {};

    for (const route of this.routeRegistry.getAllRoutes()) {
      const openApiPath = this.convertPathToOpenApi(route.path);
      paths[openApiPath] = this.routeToOpenApiOperation(route);
    }

    return paths;
  }
}
```

### Fixture Validation

```typescript
// src/test-fixtures/validate.ts

import { routeRegistry } from '../interfaces/rest-route-registry';
import fixtures from './fixtures.json';

export function validateFixtures(): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const [endpoint, scenarios] of Object.entries(fixtures)) {
    const schema = routeRegistry.getResponseSchema('GET', endpoint);

    if (!schema) {
      results.push({ endpoint, error: 'No schema found for endpoint' });
      continue;
    }

    for (const [scenario, data] of Object.entries(scenarios)) {
      const result = schema.safeParse(data);
      if (!result.success) {
        results.push({
          endpoint,
          scenario,
          error: result.error.format()
        });
      }
    }
  }

  return results;
}
```

### Fixture File Structure

```
src/test-fixtures/
├── fixtures/
│   ├── visualize/
│   │   ├── success-mermaid.json      # Visualization with mermaid diagram
│   │   ├── success-cards.json        # Visualization with cards
│   │   ├── success-table.json        # Visualization with table
│   │   ├── empty.json                # No visualizations
│   │   └── error-not-found.json      # 404 response
│   ├── sessions/
│   │   ├── query-session.json        # Query tool session
│   │   ├── remediate-session.json    # Remediate tool session
│   │   └── error-expired.json        # Session expired error
│   ├── resources/
│   │   ├── deployments-list.json     # List of deployments
│   │   ├── pods-with-status.json     # Pods with live status
│   │   └── empty.json                # No resources
│   ├── events/
│   │   ├── pod-events.json           # Events for a pod
│   │   └── empty.json                # No events
│   └── logs/
│       ├── container-logs.json       # Pod logs
│       └── error-not-found.json      # Pod not found
├── index.ts                          # Exports all fixtures with types
└── validate.ts                       # Validation script
```

### Exported Package Interface

```typescript
// src/test-fixtures/index.ts

// Re-export response types for consumers
export type { VisualizationResponse } from '../interfaces/rest-api';
export type { RestApiResponse } from '../interfaces/rest-api';

// Export fixture data
export { default as visualizeFixtures } from './fixtures/visualize';
export { default as sessionsFixtures } from './fixtures/sessions';
export { default as resourcesFixtures } from './fixtures/resources';
export { default as eventsFixtures } from './fixtures/events';
export { default as logsFixtures } from './fixtures/logs';

// Export all fixtures as single object
export { default as allFixtures } from './fixtures';
```

Update `package.json` exports:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./mcp": "./dist/mcp/server.js",
    "./test-fixtures": "./dist/test-fixtures/index.js"
  }
}
```

## Success Criteria

1. **Complete OpenAPI coverage**: All REST endpoints documented in `/api/v1/openapi`
2. **Single source of truth**: Route definition includes schemas - no separate documentation
3. **Type-safe fixtures**: Fixture files validated against Zod schemas
4. **CI validation**: `npm run validate:fixtures` fails if fixtures don't match schemas
5. **Backward compatible**: Existing API behavior unchanged
6. **Consumable by UI**: dot-ai-ui can import fixtures and types from package

## Out of Scope

- **Mock server implementation**: Consumers use off-the-shelf tools (Prism, MSW)
- **Automatic fixture generation**: Fixtures are manually curated for realistic scenarios
- **Runtime request validation**: Schemas are for documentation/fixtures, not runtime validation (can be added later)

## Milestones

- [x] M1: Create RestRouteRegistry class with route registration and matching
- [x] M2: Define Zod schemas for all existing REST endpoint responses
- [x] M3: Migrate existing endpoints to registry-based routing
- [x] M4: Update OpenAPI generator to include registry routes
- [ ] M5: Create fixture files with realistic scenarios for all endpoints
- [ ] M6: Add fixture validation script and CI integration
- [ ] M7: Export fixtures and types from package
- [ ] M8: Notify dot-ai-ui project (write `../dot-ai-ui/tmp/feature-response.md` with usage instructions)

## Dependencies

- **Zod**: Already used in codebase for schema validation
- **zod-to-json-schema**: Already a dependency, converts Zod to OpenAPI-compatible JSON Schema

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large refactor of rest-api.ts | Medium | Incremental migration - registry and switch can coexist |
| Schema definitions are tedious | Low | Start with response schemas only, add request schemas incrementally |
| Fixtures become stale | Medium | CI validation catches drift; fixtures are validated on every build |
| Breaking OpenAPI consumers | Low | New routes are additive; existing tool endpoints unchanged |

## Timeline

High priority - unblocks dot-ai-ui development and testing.

## References

- Feature request from dot-ai-ui: `tmp/feature-request.md`
- Existing OpenAPI generator: `src/interfaces/openapi-generator.ts`
- Existing REST API router: `src/interfaces/rest-api.ts`
