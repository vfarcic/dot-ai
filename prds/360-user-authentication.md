# PRD: User Authentication & Access Control

**Status**: Planning
**Priority**: High
**GitHub Issue**: [#360](https://github.com/vfarcic/dot-ai/issues/360)
**Created**: 2026-01-30
**Last Updated**: 2026-01-30

---

## Problem Statement

The MCP server currently supports only a **single shared auth token** for all users. This design limitation prevents enterprise deployments where:

- Individual user identity needs to be verified before granting MCP access
- Access should be restricted to authorized users only
- Audit logs need to track which specific user performed operations
- Different users may need different permission levels

**Current State:**
- Single `AUTH_TOKEN` environment variable shared by all users
- Anyone with the token has full access
- No way to identify individual users in audit logs
- No mechanism to revoke access for specific users

**User Impact:**
- Enterprise security teams cannot approve MCP deployment without user-level access control
- Compliance requirements for user identity tracking cannot be met
- No accountability - cannot determine who performed specific operations
- Credential sharing creates security risks

## Proposed Solution

Implement **user authentication** as an alternative to the existing single token mode. The two modes would coexist:

| Mode | Authentication | Audit Identity | Use Case |
|------|----------------|----------------|----------|
| **Single Token** (existing) | Shared token | Anonymous | Small teams, simple setups |
| **User Authentication** (new) | Individual user credentials | Specific user | Enterprise, compliance needs |

### Authentication Options (MVP - pick one)

The implementation should support at least one of these authentication mechanisms:

1. **API Keys per User** - Each user gets a unique API key
   - Simple to implement
   - Easy to manage and revoke
   - Suitable for programmatic access

2. **OIDC/OAuth2 Integration** - Integrate with enterprise identity providers
   - Leverages existing enterprise SSO
   - More complex to implement
   - Industry standard for enterprise auth

3. **Client Certificates** - mTLS authentication
   - Strong security
   - Complex certificate management
   - Good for service-to-service auth

**Recommendation**: Start with API keys per user for MVP, add OIDC integration as a follow-up.

### Key Design Principles

1. **Backward Compatible**: Single token mode continues to work unchanged
2. **Opt-in**: User authentication is enabled via configuration, not forced
3. **Audit Integration**: User identity flows through to all audit logs
4. **Foundation for Permissions**: Provides identity that PRD #361 (User-Specific Permissions) builds upon

## Success Criteria

### Must Have (MVP)
- [ ] Users can authenticate with individual credentials (API keys or equivalent)
- [ ] Unauthorized users are rejected before accessing any MCP tools
- [ ] Audit logs include authenticated user identity
- [ ] Existing single token mode continues to work
- [ ] Admin can create/revoke user credentials
- [ ] Integration tests validating authentication flow

### Nice to Have (Future)
- [ ] OIDC/OAuth2 integration for enterprise SSO
- [ ] Role-based access (admin vs regular user)
- [ ] Session management (token expiration, refresh)
- [ ] Rate limiting per user
- [ ] Self-service credential management UI

### Success Metrics
- Unauthorized access attempts are rejected 100% of the time
- All authenticated operations traceable to specific user in audit logs
- No regression in single token mode functionality
- Authentication adds <50ms latency to connection establishment

## User Journey

### Current State (Single Token)
1. Admin sets `AUTH_TOKEN=shared-secret` on MCP server
2. All users configure MCP client with the same token
3. Users connect and use MCP tools
4. Audit logs show operations but not who performed them

### Future State (User Authentication)
1. Admin enables user authentication mode
2. Admin creates credentials for Alice and Bob
3. Alice configures MCP client with her credentials
4. Alice connects - server verifies her identity
5. Alice uses MCP tools - all operations logged with her identity
6. Admin can revoke Alice's access without affecting Bob

### User Personas

**Persona 1: Enterprise Security Admin**
- Needs to approve MCP deployment for their organization
- Requires user-level access control and audit trails
- Wants integration with existing identity systems (future)

**Persona 2: Platform Team Lead**
- Manages MCP access for their team
- Needs to onboard/offboard team members
- Wants to track who is using MCP and how

**Persona 3: Solo Developer (Existing User)**
- Uses single token mode locally
- Should see no changes to their workflow
- May later adopt user auth for personal audit trails

## Technical Scope

### Core Components

**1. Authentication Module (New: `src/core/auth/`)**
- Authentication strategy interface (pluggable auth methods)
- API key authenticator implementation
- User session/context management
- Credential validation and verification

**2. User Management (New: `src/core/users/`)**
- User storage (file-based for MVP, database optional)
- Credential generation and hashing
- User CRUD operations
- Credential revocation

**3. MCP Integration (`src/interfaces/mcp.ts`)**
- Authentication middleware for MCP connections
- User context propagation to tool handlers
- Backward compatibility with single token mode

**4. Audit Integration**
- Include user identity in all audit log entries
- Track authentication events (login, failed attempts, logout)

### Configuration

```yaml
# Example configuration
auth:
  mode: "user"  # "token" (existing) or "user" (new)

  # For mode: "token" (existing behavior)
  token: "shared-secret"

  # For mode: "user" (new)
  users:
    storage: "file"  # or "database" in future
    path: "./users.json"
```

### API Changes

**New Admin Operations:**
- Create user: `POST /admin/users`
- List users: `GET /admin/users`
- Revoke user: `DELETE /admin/users/{id}`
- Regenerate credentials: `POST /admin/users/{id}/regenerate`

**MCP Client Configuration:**
```json
{
  "mcpServers": {
    "dot-ai": {
      "url": "https://mcp.company.com",
      "auth": {
        "type": "api_key",
        "key": "user-specific-api-key"
      }
    }
  }
}
```

## Dependencies

**Internal Dependencies:**
- None - this is a foundational change

**External Dependencies:**
- None for MVP (API keys)
- OIDC library if adding OAuth2 support later

**Dependent PRDs:**
- PRD #361 (User-Specific Permissions) depends on this PRD for user identity

## Milestones

### Milestone 1: Authentication Infrastructure
**Objective**: Build core authentication module with pluggable architecture

**Deliverables:**
- [ ] Authentication strategy interface
- [ ] API key authenticator implementation
- [ ] User context/session management
- [ ] Unit tests for authentication logic

**Success Criteria:**
- Can authenticate a user with API key
- Invalid credentials are rejected
- User context available after authentication

---

### Milestone 2: User Management
**Objective**: Enable admin to manage user credentials

**Deliverables:**
- [ ] User storage (file-based)
- [ ] Credential generation with secure hashing
- [ ] User CRUD operations
- [ ] CLI commands for user management (or admin API)

**Success Criteria:**
- Admin can create new users with generated credentials
- Admin can list existing users
- Admin can revoke user credentials
- Credentials stored securely (hashed)

---

### Milestone 3: MCP Integration
**Objective**: Integrate authentication with MCP connection flow

**Deliverables:**
- [ ] Authentication middleware for MCP connections
- [ ] User context propagation to tool handlers
- [ ] Backward compatibility with single token mode
- [ ] Configuration for auth mode selection

**Success Criteria:**
- MCP connections authenticated before tool access
- Single token mode still works when configured
- User identity available in tool handlers

---

### Milestone 4: Audit Integration
**Objective**: Include user identity in audit logs

**Deliverables:**
- [ ] User identity in operation audit logs
- [ ] Authentication event logging (success, failure)
- [ ] Audit log schema update for user fields

**Success Criteria:**
- All operations traceable to specific user
- Failed authentication attempts logged
- Audit logs queryable by user

---

### Milestone 5: Integration Testing & Documentation
**Objective**: Validate end-to-end flow and document for users

**Deliverables:**
- [ ] Integration tests for authentication flow
- [ ] Integration tests for user management
- [ ] Tests for backward compatibility (single token)
- [ ] Documentation for setup and configuration
- [ ] Security considerations documented

**Success Criteria:**
- All integration tests passing
- Single token mode regression tests passing
- Users can set up auth following documentation

---

## Open Questions

### 1. Initial Authentication Method
**Question**: Which authentication method should we implement first?

**Options:**
- API keys (simpler, good for programmatic access)
- OIDC/OAuth2 (enterprise-friendly, more complex)

**Current Thinking**: API keys for MVP, OIDC as follow-up

**Decision Point**: Before Milestone 1

---

### 2. User Storage
**Question**: How should user data be stored?

**Options:**
- File-based (simple, good for small deployments)
- Database (scalable, better for large deployments)
- External identity provider only (no local storage)

**Current Thinking**: File-based for MVP, database optional later

**Decision Point**: Before Milestone 2

---

### 3. Admin Interface
**Question**: How should admins manage users?

**Options:**
- CLI commands only
- REST API for admin operations
- Both CLI and API

**Current Thinking**: CLI commands for MVP, API later

**Decision Point**: Before Milestone 2

---

## Related Resources

- **GitHub Issue**: [#360](https://github.com/vfarcic/dot-ai/issues/360)
- **Dependent PRD**: [#361 - User-Specific Permissions](./361-user-specific-permissions.md)
- **Supersedes**: [#180 - Dynamic Credential Management](./done/180-dynamic-credential-management.md) (partially)

---

## Version History

- **v1.0** (2026-01-30): Initial PRD creation with 5 milestones
