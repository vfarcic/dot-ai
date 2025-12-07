# PRD #257: Bearer Token Authentication

## Overview

**Problem**: The MCP server exposed via HTTP (Kubernetes, Docker, or any network deployment) has no authentication mechanism. Anyone with the URL can access and use the server, posing a security risk for production deployments.

**Solution**: Implement optional Bearer token authentication at the application level. When enabled, clients must include an `Authorization: Bearer <token>` header with requests. The token is configured via environment variable, making it work consistently across all deployment types (npx, Docker, Kubernetes).

**Priority**: High

**GitHub Issue**: [#257](https://github.com/vfarcic/dot-ai/issues/257)

## User Stories

1. **As a platform engineer**, I want to secure my MCP server with authentication so that only authorized users can access it.

2. **As a developer**, I want to configure my MCP client with an auth token so that I can connect to a secured MCP server.

3. **As an existing user**, I want authentication to be optional so that my current setup continues to work without changes.

## Design Decisions

### Authentication Method
- **Bearer Token**: Simple, widely supported, works with MCP client header configuration
- Single static token (can be extended to multiple tokens later)
- Token comparison using constant-time comparison to prevent timing attacks

### Configuration
- **Environment Variable**: `DOT_AI_AUTH_TOKEN`
- When set: Authentication is required
- When empty/unset: Authentication is disabled (backward compatible)

### Error Handling
- Missing/invalid token returns HTTP 401 Unauthorized
- Clear error message indicating authentication is required

## Technical Approach

### Server-Side Implementation
1. Add middleware to check `Authorization` header on incoming requests
2. Extract token from `Bearer <token>` format
3. Compare against configured `DOT_AI_AUTH_TOKEN` environment variable
4. Return 401 if token is missing, malformed, or doesn't match

### Client Configuration
MCP clients configure auth via headers:
```json
{
  "mcpServers": {
    "dot-ai": {
      "type": "http",
      "url": "https://dot-ai.example.com",
      "headers": {
        "Authorization": "Bearer ${DOT_AI_TOKEN}"
      }
    }
  }
}
```

### Deployment Configuration

**npx**:
```bash
DOT_AI_AUTH_TOKEN="your-secret-token" npx @vfarcic/dot-ai
```

**Docker**:
```bash
docker run -e DOT_AI_AUTH_TOKEN="your-secret-token" ...
```

**Kubernetes (Helm)**:
```yaml
secrets:
  auth:
    token: "your-secret-token"
```

## Success Criteria

1. Authentication works across all deployment types (npx, Docker, Kubernetes)
2. Existing deployments without token configured continue to work
3. Clear 401 error when authentication fails
4. Documentation updated for all setup guides

## Milestones

- [x] Implement Bearer token middleware in MCP server
- [x] Add Helm chart support for auth token secret
- [x] Update documentation for all deployment types
- [x] Integration tests for authenticated requests

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-07 | PRD created |
| 2025-12-07 | Implemented Bearer token middleware (`src/interfaces/auth.ts`) with constant-time comparison. Added Helm chart support (`secrets.auth.token`). Updated test infrastructure to include auth token. Removed `--no-cluster` mode from test runner. |

## Out of Scope (Future Enhancements)

- Multiple tokens / API key management
- OAuth2 / OIDC integration
- Token rotation mechanisms
- Rate limiting per token
- Audit logging of authentication events
