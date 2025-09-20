# PRD: REST API Gateway for MCP Tools

**Issue**: #110  
**Created**: 2025-01-19  
**Status**: Not Started  
**Priority**: Medium  
**Owner**: TBD  

## Executive Summary

Add a generic REST API gateway that automatically exposes all MCP tools via simple HTTP endpoints with auto-generated OpenAPI documentation. This removes the barrier for traditional applications to integrate with dot-ai tools by providing a standard REST interface alongside the existing MCP protocol.

## Problem Statement

### Current Challenges
- MCP protocol requires complex client implementation (SSE, JSON-RPC, session management)
- High barrier to entry for Kubernetes controllers, CI/CD pipelines, and traditional applications
- No standardized HTTP API for tool access outside of AI assistant integrations
- Difficult to test tools without implementing MCP protocol clients
- Limited integration options for systems that need simple HTTP endpoints

### User Impact
- **DevOps Engineers**: Cannot easily integrate dot-ai tools into automation scripts and pipelines
- **Kubernetes Controller Developers**: Must implement complex MCP clients instead of simple HTTP calls
- **Platform Teams**: Limited options for tool integration in existing HTTP-based infrastructure
- **QA/Testing Teams**: Difficult to create comprehensive integration tests without MCP protocol knowledge

## Success Criteria

- All existing MCP tools accessible via REST without code changes to tools
- Valid OpenAPI 3.0 specification auto-generated from tool schemas
- Zero maintenance required when new tools are added
- API versioning strategy prevents breaking changes
- REST API performance comparable to direct MCP tool invocation

## Scope

### In Scope
- Generic REST routing for all registered MCP tools
- Auto-generated OpenAPI specification from Zod schemas
- Tool registry system to track available tools and schemas
- API versioning strategy (/api/v1/ endpoints)
- Health check and tool discovery endpoints
- Integration with existing MCP server HTTP transport

### Out of Scope
- Authentication and authorization (deferred to future enhancement)
- Rate limiting and throttling (handled at infrastructure level)
- Webhook callbacks and async operations (tools remain synchronous)
- Custom API endpoints for specific tools (generic pattern only)
- Database persistence (stateless like existing MCP tools)

## Requirements

### Functional Requirements

1. **Generic Tool Access**
   - Single endpoint pattern: `POST /api/v1/tools/{toolName}`
   - Automatic routing to appropriate tool handler based on URL path
   - JSON request/response format for all tools
   - Error handling consistent with HTTP status codes

2. **Tool Discovery**
   - `GET /api/v1/tools` - List all available tools with descriptions
   - Include tool schemas and parameter definitions
   - Filter and search capabilities for large tool sets

3. **OpenAPI Documentation**
   - `GET /api/v1/openapi` - Serve OpenAPI 3.0 specification
   - Auto-generate schemas from existing Zod tool definitions
   - Include all tools as separate operations with proper schemas
   - Support for interactive API documentation

4. **API Versioning**
   - Version prefix in all endpoints (/api/v1/)
   - Backward compatibility for existing endpoint versions
   - Clear deprecation strategy for breaking changes

5. **Integration Points**
   - Extend existing MCP server HTTP transport
   - Route REST requests separately from MCP protocol messages
   - Reuse existing tool handlers without modification

### Non-Functional Requirements

- **Performance**: REST API response times within 10% of direct MCP calls
- **Reliability**: 99.9% availability matching existing MCP server
- **Compatibility**: Works alongside existing MCP protocol without conflicts
- **Maintainability**: Zero code changes required when new tools are added
- **Documentation**: Auto-generated OpenAPI spec always current with implementation

## Technical Design

### Architecture Integration

```
HTTP Clients → HTTP Transport → REST Router → Tool Registry → Tool Handlers
                              ↓                              ↓
                         MCP Protocol → MCP Server → Tool Handlers (shared)
```

### Core Components

1. **Tool Registry** (`src/interfaces/rest-registry.ts`)
   - Track all registered tools with metadata
   - Convert Zod schemas to JSON Schema for OpenAPI
   - Provide tool discovery and validation capabilities

2. **REST API Router** (`src/interfaces/rest-api.ts`)
   - Handle HTTP routing for REST endpoints
   - Parse and validate requests against tool schemas
   - Format responses in consistent JSON structure
   - Generate appropriate HTTP status codes

3. **OpenAPI Generator** (`src/interfaces/openapi-generator.ts`)
   - Convert tool registry to OpenAPI 3.0 specification
   - Transform Zod schemas to OpenAPI schema format
   - Include comprehensive API documentation

4. **MCP Server Integration** (`src/interfaces/mcp.ts`)
   - Extend HTTP transport to handle REST routes
   - Route `/api/*` requests to REST handler
   - Maintain backward compatibility with MCP protocol

### API Design

#### Tool Execution
```http
POST /api/v1/tools/remediate
Content-Type: application/json

{
  "issue": "Pod crashloop in namespace prod",
  "mode": "automatic",
  "confidenceThreshold": 0.8
}
```

#### Tool Discovery
```http
GET /api/v1/tools

{
  "tools": [
    {
      "name": "remediate",
      "description": "AI-powered Kubernetes issue analysis",
      "schema": { ... }
    }
  ]
}
```

#### OpenAPI Specification
```http
GET /api/v1/openapi

{
  "openapi": "3.0.0",
  "info": { ... },
  "paths": {
    "/tools/remediate": {
      "post": { ... }
    }
  }
}
```

## Implementation Milestones

### Milestone 1: Core REST Infrastructure ⬜
**Deliverable**: Basic REST routing with tool registry working
- [ ] Create tool registry system to track registered tools
- [ ] Implement REST API router with generic tool endpoint
- [ ] Integrate with existing MCP server HTTP transport
- [ ] Add basic error handling and HTTP status codes
- [ ] Unit tests for core functionality

### Milestone 2: OpenAPI Generation ⬜
**Deliverable**: Auto-generated OpenAPI specification available
- [ ] Build OpenAPI generator from tool registry
- [ ] Convert Zod schemas to OpenAPI schema format
- [ ] Implement `/api/v1/openapi` endpoint
- [ ] Add tool discovery endpoint
- [ ] Validate generated OpenAPI specification

### Milestone 3: API Versioning ⬜
**Deliverable**: Version strategy implemented and documented
- [ ] Implement API version prefix (/api/v1/)
- [ ] Add version detection and routing logic
- [ ] Create version compatibility testing framework
- [ ] Document versioning and deprecation strategy
- [ ] Update all endpoints to use versioned paths

### Milestone 4: Production Readiness ⬜
**Deliverable**: REST API ready for production deployment
- [ ] Performance testing and optimization
- [ ] Comprehensive error handling and logging
- [ ] Integration with existing monitoring and alerts
- [ ] Documentation and usage examples
- [ ] Load testing with realistic workloads

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| Performance overhead from REST layer | Medium | Low | Profile and optimize critical paths, cache schema conversions |
| OpenAPI generation complexity | Medium | Medium | Use proven libraries, validate against real tools, comprehensive testing |
| Breaking changes in tool schemas | High | Medium | API versioning, backward compatibility testing, deprecation strategy |
| Integration conflicts with MCP protocol | High | Low | Careful route separation, comprehensive integration testing |

## Dependencies

- Existing MCP server HTTP transport functionality
- Tool handler functions and Zod schema definitions
- JSON Schema conversion library (zod-to-json-schema)
- OpenAPI specification generation utilities

## Future Enhancements

1. **Authentication & Authorization**: API keys, OAuth, RBAC
2. **Rate Limiting**: Request throttling and quota management
3. **Webhook Support**: Async operations with callback URLs
4. **Custom Endpoints**: Tool-specific optimized endpoints
5. **GraphQL Gateway**: Alternative query-based interface
6. **SDK Generation**: Auto-generated client libraries for multiple languages

## Open Questions

1. **Schema Validation**: Should we validate requests against Zod schemas or rely on tool handlers?
2. **Response Formatting**: Consistent wrapper format vs. tool-specific responses?
3. **Error Handling**: How detailed should error messages be for security/debugging balance?
4. **Caching Strategy**: Should we cache tool schemas or regenerate OpenAPI on each request?

## Progress Log

### 2025-01-19
- Initial PRD created following analysis of MCP protocol complexity
- Identified need for universal HTTP access to dot-ai tools
- Separated from integration testing framework for clear scope boundaries
- Established dependency relationship with future integration testing PRD

---

*This PRD is a living document and will be updated as the implementation progresses.*