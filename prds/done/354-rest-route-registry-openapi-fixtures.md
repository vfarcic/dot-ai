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
1. Run mock server via Docker Compose: `docker compose up mock-api`
2. Point Playwright tests to `http://mock-api:3001`
3. Mock server returns realistic success fixtures for all endpoints
4. CI fails if fixtures don't match API - explicit notification of changes
5. (Future) Use scenario markers to trigger error/empty responses when needed

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

Fixtures live in `mock-server/fixtures/` (not in `src/`) to keep test data separate from production code:

```
mock-server/
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
├── server.ts                         # Mock server (Node.js http module)
├── validate.ts                       # Validation script (imports schemas from src/)
├── package.json
├── tsconfig.json
└── Dockerfile
```

### Mock Server Architecture

The mock server is a lightweight HTTP server (using Node.js built-in `http` module, consistent with the main project) that serves fixture data, distributed as a Docker image for easy consumption by dot-ai-ui and other consumers.

```
┌─────────────────┐         ┌─────────────────────┐
│   dot-ai-ui     │  HTTP   │   Mock MCP Server   │
│   (Playwright)  │ ──────► │   (from fixtures)   │
│                 │         │   localhost:3001    │
└─────────────────┘         └─────────────────────┘
```

**Key design decisions:**
- Mock server lives outside `src/` in `mock-server/` directory (not included in production image)
- Fixtures live in `mock-server/fixtures/` (not in `src/`) - they are test data, not production code
- Uses Node.js built-in `http` module (no Express) for consistency with main project
- Serves fixture data for all registered routes using same paths/params as real API
- Distributed as Docker image for CI/testing use
- Also runnable locally via `npm run mock-server` for development

### Scenario Selection via Markers (Deferred)

**Note:** Scenario marker support is deferred until UI testing reveals the need. Initial mock server serves success fixtures only.

**Design (to be implemented when needed):**
The mock server will use **convention-based scenario markers** embedded in request data:

**Markers:**
- `[error]` → returns error fixture (400/500)
- `[not-found]` → returns 404 fixture
- `[empty]` → returns success with empty data
- (no marker) → returns success fixture with realistic data

**How it works:**
The mock server scans all input (request body fields, query params, path params) for scenario markers and returns the appropriate fixture.

**Examples:**
```bash
# Success scenarios (default - implemented in M7)
POST /api/v1/tools/query  body: { intent: "Show me all pods" }
GET /api/v1/resources?kind=Pod&apiVersion=v1
GET /api/v1/sessions/qry-abc123

# Error scenarios (using markers - implemented in M10 if needed)
POST /api/v1/tools/query  body: { intent: "Show me all pods [error]" }
GET /api/v1/resources?kind=[error]
GET /api/v1/sessions/[not-found]

# Empty scenarios (implemented in M10 if needed)
GET /api/v1/resources?kind=[empty]
```

**Consumer usage (dot-ai-ui docker-compose.yml):**
```yaml
services:
  mock-api:
    image: ghcr.io/dot-ai/mock-server:latest
    ports:
      - "3001:3001"
```

## Success Criteria

1. **Complete OpenAPI coverage**: All REST endpoints documented in `/api/v1/openapi`
2. **Single source of truth**: Route definition includes schemas - no separate documentation
3. **Type-safe fixtures**: Fixture files validated against Zod schemas
4. **CI validation**: `npm run validate:fixtures` fails if fixtures don't match schemas
5. **Backward compatible**: Existing API behavior unchanged
6. **Mock server available**: dot-ai-ui can run mock server via Docker Compose
7. **Scenario selection** (deferred): Mock server will support scenario markers when UI testing reveals the need

## Out of Scope

- **Automatic fixture generation**: Fixtures are manually curated for realistic scenarios
- **Runtime request validation**: Schemas are for documentation/fixtures, not runtime validation (can be added later)
- **Stateful mock scenarios**: Mock server is stateless; each request returns fixture data independently

## Milestones

- [x] M1: Create RestRouteRegistry class with route registration and matching
- [x] M2: Define Zod schemas for all existing REST endpoint responses
- [x] M3: Migrate existing endpoints to registry-based routing
- [x] M4: Update OpenAPI generator to include registry routes
- [x] M5: Create fixture files with realistic scenarios for all endpoints
- [x] M6: Add fixture validation script and CI integration
- [x] M7: Create mock server with Docker image (serves success fixtures only - no scenario markers yet)
- [x] M8: Notify dot-ai-ui project (write `../dot-ai-ui/tmp/feature-response.md` with usage instructions)
- [x] M9: Validate through Web UI and gather feedback on scenario needs
- [~] M10: Add scenario marker support (deferred - UI confirmed not needed for current phase; will be separate PRD if needed)

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

## Decision Log

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-01-28 | Build custom mock server instead of relying on Prism/MSW | Prism generates random data from schemas; we need curated realistic fixtures. MSW requires consumers to wire up mocking themselves. A runnable Docker image is simpler for consumers. | M7 scope changed from "export fixtures" to "create mock server with Docker image" |
| 2026-01-28 | Support scenario selection via `?_scenario=<name>` query param | Single response per endpoint is too limiting for testing different scenarios (success, error, empty). Scenario param allows tests to select specific fixture without server restart. | Added to M7 requirements |
| 2026-01-28 | Mock server lives outside `src/` in `mock-server/` directory | Keep mock server separate from production code to ensure it's never included in the production Docker image | Architectural decision for project structure |
| 2026-01-28 | Start with stateless fixtures | Stateful flows add complexity; stateless fixtures with consistent IDs across scenarios are sufficient for initial UI testing needs | Explicit out-of-scope decision |
| 2026-01-28 | Add M9 for Web UI validation | Need feedback loop with actual consumer to validate the mock server meets their needs before considering PRD complete | Added new milestone |
| 2026-01-29 | Move fixtures from `src/test-fixtures/` to `mock-server/fixtures/` | Fixtures are test data, not production code. Keeping them in `mock-server/` makes the mock server self-contained and keeps `src/` clean. Validation script imports schemas from `src/` to validate fixtures. | Changed fixture location, simplified project structure |
| 2026-01-29 | Use Node.js http module instead of Express | Main project uses Node.js built-in `http` module. Mock server should be consistent with existing patterns rather than introducing new dependencies. | Removed Express dependency from mock server |
| 2026-01-29 | Replace `?_scenario` query param with convention-based markers | UI code shouldn't need modification to work with mock server. Using markers like `[error]`, `[not-found]`, `[empty]` in request data (body fields, query params, path params) allows tests to control scenarios while keeping UI code unchanged. | Changed scenario selection mechanism from query param to request data markers |
| 2026-01-29 | Defer scenario marker support until UI feedback | YAGNI - start with success fixtures only, add error/empty scenarios when actual testing reveals the need. Added M10 as conditional milestone for scenario support. | M7 simplified to success-only, M10 added for deferred scenario work |
| 2026-01-29 | Manual publishing via skill instead of CI | Mock server changes infrequently; CI publishing adds overhead. Created `/publish-mock-server` skill for on-demand multi-arch builds to `ghcr.io/vfarcic/dot-ai-mock-server:latest` | Simpler workflow, always uses `latest` tag |
| 2026-01-29 | UI validation complete - no additional endpoints needed | dot-ai-prd-14-playwright-e2e-testing confirmed 4 endpoints sufficient for current testing. Future endpoints will be requested via separate PRDs. | M9 complete, M10 deferred to future PRD |

## References

- Feature request from dot-ai-ui: `tmp/feature-request.md`
- Existing OpenAPI generator: `src/interfaces/openapi-generator.ts`
- Existing REST API router: `src/interfaces/rest-api.ts`
