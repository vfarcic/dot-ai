# PRD: REST API Gateway for MCP Tools

**Issue**: #110  
**Created**: 2025-01-19  
**Status**: In Progress - Production Readiness  
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

### Milestone 1: Core REST Infrastructure ✅
**Deliverable**: Basic REST routing with tool registry working
- [x] Create tool registry system to track registered tools
- [x] Implement REST API router with generic tool endpoint
- [x] Integrate with existing MCP server HTTP transport
- [x] Add basic error handling and HTTP status codes
- [x] Unit tests for core functionality

### Milestone 2: OpenAPI Generation ✅
**Deliverable**: Auto-generated OpenAPI specification available
- [x] Build OpenAPI generator from tool registry
- [x] Convert Zod schemas to OpenAPI schema format
- [x] Implement `/api/v1/openapi` endpoint
- [x] Add tool discovery endpoint
- [x] Validate generated OpenAPI specification

### Milestone 3: API Versioning ✅
**Deliverable**: Version strategy implemented and documented
- [x] Implement API version prefix (/api/v1/)
- [x] Add version detection and routing logic
- [x] Create version compatibility testing framework
- [x] Document versioning and deprecation strategy
- [x] Update all endpoints to use versioned paths

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

## Decision Log

### 2025-09-21: JSON Response Format Enhancement
**Problem**: MCP tools return `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` format, which creates JSON-in-string anti-pattern for REST API consumers.

**Decision**: Transform MCP responses by parsing the JSON string back to proper JSON objects before sending REST API responses.

**Rationale**: 
- All MCP tools consistently use `JSON.stringify()` for content.text field
- REST API consumers expect proper JSON objects, not escaped JSON strings
- Parsing transformation is safe with fallback to original text if parsing fails
- Dramatically improves developer experience and API usability

**Implementation**: Added JSON parsing logic in `RestApiRouter.handleToolExecution()` with error handling and logging.

## Open Questions

1. **Schema Validation**: ✅ Resolved - Using existing Zod validation in tool handlers, REST layer passes through
2. **Response Formatting**: ✅ Resolved - Consistent wrapper with transformed JSON content for better developer experience  
3. **Error Handling**: How detailed should error messages be for security/debugging balance?
4. **Caching Strategy**: Should we cache tool schemas or regenerate OpenAPI on each request?

## Progress Log

### 2025-09-21: Core Implementation Complete
**Duration**: ~4 hours (estimated from implementation session)
**Commits**: Multiple implementation commits + test fixes
**Primary Focus**: Complete REST API Gateway implementation and testing

**Completed PRD Items**:
- [x] Tool Registry System - Evidence: `src/interfaces/rest-registry.ts` with metadata tracking, Zod→JSON Schema conversion, filtering capabilities
- [x] REST API Router - Evidence: `src/interfaces/rest-api.ts` with generic POST /api/v1/tools/{toolName} pattern, JSON transformation, error handling
- [x] MCP Integration - Evidence: `src/interfaces/mcp.ts` extended with unified tool registration for both MCP and REST protocols
- [x] OpenAPI Generation - Evidence: `src/interfaces/openapi-generator.ts` with dynamic spec generation from tool registry
- [x] API Versioning - Evidence: All endpoints use /api/v1/ prefix, version metadata in responses
- [x] Comprehensive Testing - Evidence: `tests/interfaces/rest-api.test.ts` with 100+ test cases, 960/960 tests passing

**Critical Bug Fixes Completed**:
1. **Tool Registration Issue**: Fixed bug where only 1 of 9 MCP tools was exposed via REST API (all tools now properly registered)
2. **JSON Response Format**: Transformed JSON-in-string responses to proper JSON objects for better developer experience
3. **Port Conflicts**: Fixed test port conflicts to allow concurrent manual server testing
4. **Port 0 Handling**: Fixed falsy operator bug preventing dynamic port assignment in tests

**Manual Testing Validation**:
- ✅ Tool Discovery: All 9 tools discoverable with proper filtering by category/tags/search
- ✅ OpenAPI Spec: 11 endpoints generated with complete schemas and metadata
- ✅ Tool Execution: Both simple (version - 1.8s) and complex (AI recommend - 150s) tools working
- ✅ Error Handling: Proper HTTP status codes and structured error responses
- ✅ JSON Responses: Clean JSON objects instead of escaped JSON strings

**Architecture Achievements**:
- **Zero Tool Changes Required**: All 9 existing MCP tools work via REST without modification
- **Automatic Schema Generation**: OpenAPI spec stays current with tool schema changes
- **Dual Protocol Support**: MCP and REST protocols work simultaneously without conflicts
- **Production-Grade Error Handling**: Proper HTTP status codes, structured errors, comprehensive logging

**Next Session Priorities**:
- Performance testing and optimization (Milestone 4)
- Comprehensive documentation and usage examples
- Integration with monitoring and alerting systems
- Load testing with realistic workloads

### 2025-01-19: PRD Creation
- Initial PRD created following analysis of MCP protocol complexity
- Identified need for universal HTTP access to dot-ai tools
- Separated from integration testing framework for clear scope boundaries
- Established dependency relationship with future integration testing PRD

---

*This PRD is a living document and will be updated as the implementation progresses.*