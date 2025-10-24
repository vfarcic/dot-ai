# PRD: Dynamic Credential Management for MCP Multi-User Support

**Status**: Planning
**Priority**: High
**GitHub Issue**: [#180](https://github.com/vfarcic/dot-ai/issues/180)
**Created**: 2025-10-24
**Last Updated**: 2025-10-24

---

## Problem Statement

The DevOps AI Toolkit MCP server currently relies exclusively on environment variables for credentials (Kubernetes config, Anthropic API keys, OpenAI API keys, etc.). This design prevents several critical deployment scenarios:

**Current Limitations:**
- Cannot run a single MCP server instance serving multiple users with different credentials
- Cannot support remote/hosted MCP deployments where users connect with their own cluster access
- Forces credential sharing when multiple users want to use the same MCP instance
- No support for dynamic credential switching without server restart

**User Impact:**
- Teams cannot deploy a shared MCP service that respects individual user access controls
- Enterprise deployments blocked due to credential isolation requirements
- Developers must run local MCP instances even when centralized deployment would be more efficient
- No way to audit which user performed which operations with which credentials

## Proposed Solution

Implement a **layered credential resolution system** that supports both local and remote deployment models:

### Deployment Model 1: Local Single-User (Current Behavior)
- Uses environment variables exclusively
- No changes to existing workflow
- Credentials loaded at server startup

### Deployment Model 2: Remote Multi-User (New Capability)
- Server starts with optional "shared" credentials via environment variables (e.g., shared Anthropic API key)
- Clients provide additional/override credentials during MCP connection handshake
- Per-connection credential isolation in memory
- Audit trail of credential usage by connection/user

### Key Design Principles

**Layered Resolution:**
```
Final Credential = ENV_VAR (default) ?? CLIENT_PROVIDED (override)
```

**Example Scenarios:**
1. **Shared AI, Individual Clusters**: Company sets `ANTHROPIC_API_KEY` in env, users provide their kubeconfig during connection
2. **All Individual**: User provides both Anthropic key and kubeconfig during connection
3. **Legacy Local**: User sets all env vars, no client-provided credentials needed (current behavior)

**Security Requirements:**
- ✅ Credential isolation between connections
- ✅ Encryption in transit (TLS for credential transmission)
- ✅ No credential persistence to disk
- ✅ Audit logging (who accessed what with which credentials)
- ✅ Credential validation before use
- ✅ Automatic credential cleanup on connection close

## Success Criteria

### Must Have (MVP)
- [ ] MCP client can provide credentials during connection initialization
- [ ] Layered credential resolution working (env vars + client overrides)
- [ ] Credential isolation: one connection's credentials never leak to another
- [ ] Support for at minimum: Kubernetes config, Anthropic API key
- [ ] Audit logging: track which connection used which credentials for which operations
- [ ] Integration tests validating multi-user scenarios
- [ ] Documentation for setting up remote multi-user deployments

### Nice to Have (Future)
- [ ] Support for OpenAI API keys, Vector DB credentials
- [ ] Credential caching/reuse within a connection session
- [ ] Admin API to view active connections and credential types (not values)
- [ ] Rate limiting per credential set
- [ ] Credential expiration/rotation support
- [ ] OAuth/OIDC integration for user identity

### Success Metrics
- Single MCP server can handle 10+ concurrent users with different credentials
- Zero credential leakage incidents in security testing
- Audit logs successfully trace all operations to user credentials
- Documentation enables team deployment within 15 minutes

## User Journey

### Current State (Before)
1. DevOps engineer wants to use MCP with their cluster
2. Must set environment variables: `KUBECONFIG`, `ANTHROPIC_API_KEY`, etc.
3. Starts local MCP server instance
4. Connects Claude Code to local MCP server
5. **Problem**: Colleague wants to use MCP with different cluster → must run separate server instance

### Future State (After)
1. Company deploys shared MCP server with `ANTHROPIC_API_KEY` environment variable
2. DevOps engineer installs Claude Code
3. Configures Claude Code MCP connection with:
   - Remote MCP server URL (e.g., `https://mcp.company.com`)
   - Personal Kubernetes config file path
4. Claude Code establishes connection, sending kubeconfig during handshake
5. Engineer uses MCP tools - operations use their kubeconfig + shared Anthropic key
6. **Benefit**: Colleague connects to same server with their own kubeconfig → works independently

### User Personas

**Persona 1: Enterprise Platform Team**
- Wants to deploy centralized MCP service for 50+ developers
- Needs each developer to use their own Kubernetes cluster credentials
- Wants to provide shared Anthropic API key to control costs
- Requires audit trail for compliance

**Persona 2: Solo Developer (Existing User)**
- Uses MCP locally with environment variables
- Doesn't want workflow disruption
- Should see no changes unless opting into remote deployment

**Persona 3: SaaS Provider**
- Wants to offer MCP as a service to customers
- Each customer brings their own cluster credentials
- Needs strong isolation guarantees
- Requires per-customer rate limiting and usage tracking

## Technical Scope

### Core Components to Modify

**1. MCP Protocol Layer (`src/interfaces/mcp.ts`)**
- Extend MCP initialization to accept credential payload
- Implement credential validation and parsing
- Add credential encryption for transit (TLS enforcement)

**2. Core Service Layer (New: `src/core/credential-manager.ts`)**
- Credential resolution logic (env vars + client overrides)
- Per-connection credential storage (in-memory only)
- Credential isolation enforcement
- Automatic cleanup on connection close

**3. Kubernetes Client Layer (`src/core/kubernetes.ts`)**
- Modify to accept per-request credentials instead of global config
- Support both kubeconfig content and file path
- Validate kubeconfig before use

**4. AI Integration Layer (`src/core/claude.ts`, OpenAI equivalent)**
- Modify to accept per-request API keys
- Support credential override from connection context

**5. Audit Logging (New: `src/core/audit-logger.ts`)**
- Log credential usage events (connection, operations, disconnection)
- Never log credential values, only metadata (hash, type, timestamp)
- Support structured logging for SIEM integration

**6. MCP Client Updates**
- Add credential configuration to Claude Code MCP settings
- UI/config for specifying which credentials to send
- Secure credential storage in client (OS keychain integration)

### Integration Points

**Existing Systems:**
- ✅ Kubernetes client library (needs per-request credential support)
- ✅ Claude AI SDK (already supports per-request API keys)
- ✅ OpenAI SDK (needs verification of per-request API key support)
- ✅ Qdrant client (future: needs per-request credential support)
- ✅ MCP protocol specification (may need extension proposal)

**New Systems:**
- 🆕 Credential encryption/decryption (TLS layer)
- 🆕 Audit log storage (file-based initially, database optional)
- 🆕 Connection management (track active connections + credentials)

### Technical Risks & Mitigation

**Risk 1: Credential Leakage Between Connections**
- **Mitigation**: Strong isolation using per-connection context objects, comprehensive security testing
- **Validation**: Integration tests with concurrent users, security audit

**Risk 2: MCP Protocol Extension Not Standardized**
- **Mitigation**: Use MCP's initialization options if possible, propose extension to MCP spec if needed
- **Fallback**: Custom handshake after MCP connection but before tool calls

**Risk 3: Performance Overhead from Per-Request Credential Resolution**
- **Mitigation**: Cache resolved credentials per connection, benchmark performance impact
- **Acceptance Criteria**: <10ms overhead per request

**Risk 4: Kubernetes Client Library Limitations**
- **Mitigation**: Research `@kubernetes/client-node` support for dynamic config switching
- **Fallback**: Create separate client instances per connection (acceptable for MVP)

**Risk 5: Credential Storage in Claude Code Client**
- **Mitigation**: Use OS keychain APIs, document security best practices
- **Note**: This is primarily a client-side concern, server design should be agnostic

## Dependencies

**Internal Dependencies:**
- None blocking - this is a core infrastructure change

**External Dependencies:**
- MCP protocol specification review (may need community input for extension)
- `@kubernetes/client-node` library capabilities for dynamic config
- Claude Code client updates (if extending MCP protocol significantly)

**Documentation Dependencies:**
- Update MCP server setup documentation
- Create remote deployment guide
- Document credential configuration patterns
- Add security best practices guide

## Milestones

### Milestone 1: Technical Design & Spike (Week 1)
**Objective**: Validate technical approach and identify blockers

**Deliverables:**
- [ ] Research MCP protocol extension options (initialization params vs custom handshake)
- [ ] Spike: Kubernetes client library dynamic config switching (prove feasibility)
- [ ] Spike: Claude AI SDK per-request API key override (verify existing support)
- [ ] Design credential manager architecture (module structure, interfaces)
- [ ] Design audit log schema and format
- [ ] Security review of isolation approach with team/community

**Success Criteria:**
- Technical approach validated or alternative identified
- No critical blockers identified
- Team consensus on architecture

---

### Milestone 2: Core Credential Management Infrastructure (Week 2)
**Objective**: Build credential manager and connection isolation

**Deliverables:**
- [ ] Implement `credential-manager.ts` with layered resolution logic
- [ ] Implement per-connection credential storage (in-memory, isolated)
- [ ] Implement credential validation (kubeconfig parsing, API key format check)
- [ ] Implement automatic cleanup on connection close
- [ ] Unit tests for credential manager (isolation, resolution, cleanup)

**Success Criteria:**
- Credential manager can resolve credentials from env + client overrides
- Tests prove credentials from connection A never visible to connection B
- Memory cleanup verified (no credential leaks after connection close)

---

### Milestone 3: MCP Protocol Integration (Week 2-3)
**Objective**: Enable credential transmission from client to server

**Deliverables:**
- [ ] Extend MCP initialization handler to accept credential payload
- [ ] Implement credential encryption/decryption (TLS enforcement)
- [ ] Wire credential manager into MCP connection lifecycle
- [ ] Integration tests: MCP client sends credentials → server receives and stores correctly

**Success Criteria:**
- Client can send credentials during MCP handshake
- Server correctly stores credentials per connection
- TLS enforced for credential transmission
- Integration tests pass for credential flow

---

### Milestone 4: Kubernetes Integration (Week 3)
**Objective**: Use per-connection credentials for Kubernetes operations

**Deliverables:**
- [ ] Modify Kubernetes client layer to accept per-request credentials
- [ ] Implement dynamic kubeconfig switching (client instance per connection or equivalent)
- [ ] Update all Kubernetes tool handlers to use connection credentials
- [ ] Integration tests: Multiple concurrent users with different kubeconfigs

**Success Criteria:**
- User A's kubectl commands use User A's kubeconfig
- User B's kubectl commands use User B's kubeconfig
- Operations never cross-contaminate credentials
- All existing Kubernetes tests pass with new credential model

---

### Milestone 5: AI Provider Integration (Week 4)
**Objective**: Use per-connection credentials for AI API calls

**Deliverables:**
- [ ] Modify Claude AI integration to accept per-request API keys
- [ ] Modify OpenAI integration to accept per-request API keys (if supported)
- [ ] Update all AI tool handlers to use connection credentials
- [ ] Integration tests: Multiple concurrent users with different AI API keys

**Success Criteria:**
- User A's AI calls use User A's Anthropic key (or shared if not provided)
- User B's AI calls use User B's Anthropic key (or shared if not provided)
- Layered resolution working: client key overrides env var key
- All existing AI integration tests pass

---

### Milestone 6: Audit Logging (Week 4)
**Objective**: Track credential usage for security and compliance

**Deliverables:**
- [ ] Implement `audit-logger.ts` with structured logging
- [ ] Log connection events (connect, disconnect, credential types)
- [ ] Log operation events (tool calls with credential metadata, not values)
- [ ] Implement credential hashing for audit trail (never log actual credentials)
- [ ] Add audit log configuration (file path, format, rotation)
- [ ] Integration tests: Verify audit log completeness

**Success Criteria:**
- Every connection event logged with timestamp, credential types, user identifier
- Every tool call logged with operation, credential hash, outcome
- Audit log parseable for SIEM integration
- No credential values ever appear in logs (verified by tests)

---

### Milestone 7: Integration Testing & Security Validation (Week 5)
**Objective**: Prove multi-user scenarios work securely

**Deliverables:**
- [ ] Comprehensive integration test: 10 concurrent users with different credentials
- [ ] Security test: Attempt credential leakage between connections (must fail)
- [ ] Security test: Verify credential cleanup after connection close
- [ ] Performance test: Measure overhead of per-request credential resolution
- [ ] End-to-end test: Real MCP client → server → Kubernetes operation
- [ ] Security audit of credential handling code

**Success Criteria:**
- All integration tests pass
- Zero credential leakage in security tests
- Performance overhead <10ms per request
- Security audit finds no critical issues

---

### Milestone 8: Documentation & Deployment Guide (Week 5-6)
**Objective**: Enable users to deploy and use remote multi-user MCP

**Deliverables:**
- [ ] Update `README.md` with credential configuration examples
- [ ] Create `docs/remote-deployment.md` guide (setup, configuration, security)
- [ ] Create `docs/credential-management.md` detailed reference
- [ ] Update MCP tool documentation with credential requirements
- [ ] Create example deployment configurations (Docker, Kubernetes)
- [ ] Security best practices guide (TLS setup, credential rotation, audit log monitoring)

**Success Criteria:**
- New user can deploy remote MCP server following guide in <15 minutes
- All credential configuration options documented with examples
- Security concerns addressed in best practices guide
- Existing users understand how to migrate from env-only setup

---

### Milestone 9: Client Integration (Week 6-7)
**Objective**: Update MCP clients to support credential configuration

**Note**: This milestone may depend on Claude Code or other MCP client maintainers

**Deliverables:**
- [ ] Design credential configuration UI/config schema for Claude Code
- [ ] Implement credential storage in Claude Code (OS keychain integration)
- [ ] Implement credential transmission during MCP handshake
- [ ] Document client-side credential configuration
- [ ] Test end-to-end: Claude Code → Remote MCP → Kubernetes with user credentials

**Success Criteria:**
- User can configure credentials in Claude Code settings
- Credentials securely stored in OS keychain
- Claude Code successfully sends credentials to MCP server
- End-to-end workflow functional

---

### Milestone 10: Beta Release & Feedback (Week 8)
**Objective**: Deploy to beta users and gather feedback

**Deliverables:**
- [ ] Deploy beta remote MCP server for team testing
- [ ] Onboard 5-10 beta users with documentation
- [ ] Gather feedback on usability, performance, security concerns
- [ ] Fix critical issues identified during beta
- [ ] Update documentation based on feedback

**Success Criteria:**
- Beta users successfully connect with individual credentials
- No security incidents during beta period
- Performance acceptable for production use
- Documentation sufficient for self-service onboarding

---

## Open Questions

### 1. MCP Protocol Extension
**Question**: Does the MCP protocol specification support custom initialization parameters for credentials, or do we need to propose an extension?

**Research Needed**: Review MCP spec, check with community

**Decision Point**: Week 1 (Milestone 1)

---

### 2. Credential Types Priority
**Question**: Which credential types should be supported in MVP vs deferred to future releases?

**Options**:
- MVP: Kubernetes config + Anthropic API key only
- MVP: All current credentials (add OpenAI, Qdrant)

**Current Thinking**: Start with Kubernetes + Anthropic (most critical for enterprise use case), add others in follow-up

**Decision Point**: Week 1 (Milestone 1)

---

### 3. Credential Transmission Format
**Question**: How should credentials be serialized for transmission?

**Options**:
- JSON object in MCP initialization params
- Base64-encoded credential bundle
- Individual parameters per credential type

**Current Thinking**: JSON object for flexibility and extensibility

**Decision Point**: Week 1 (Milestone 1)

---

### 4. Audit Log Storage
**Question**: Where should audit logs be stored for production deployments?

**Options**:
- File-based (simple, MVP-friendly)
- Database (PostgreSQL, better queryability)
- External logging service (Elasticsearch, Splunk)

**Current Thinking**: File-based for MVP, document integration points for external systems

**Decision Point**: Week 4 (Milestone 6)

---

### 5. User Identity
**Question**: How do we identify users in audit logs when credentials are provided programmatically?

**Options**:
- Credential hash only (minimal identity)
- Optional user identifier field in credential payload
- Integrate with OAuth/OIDC for real identity

**Current Thinking**: Optional user identifier field (client can provide email, username, etc.)

**Decision Point**: Week 4 (Milestone 6)

---

### 6. Credential Rotation
**Question**: How should credential rotation be handled for long-lived connections?

**Options**:
- Require reconnection with new credentials
- Support mid-connection credential refresh
- Automatic expiration and re-prompt

**Current Thinking**: Defer to future release, require reconnection for MVP

**Decision Point**: Post-MVP

---

### 7. Rate Limiting & Quotas
**Question**: Should we implement per-credential-set rate limiting?

**Use Case**: Prevent abuse if shared MCP server is exposed

**Current Thinking**: Defer to future release, rely on Kubernetes RBAC and AI provider rate limits for MVP

**Decision Point**: Post-MVP

---

## Implementation Progress Log

### 2025-10-24: PRD Created
- Defined problem statement and solution approach
- Established 10 major milestones for implementation
- Identified 7 open questions requiring decisions
- GitHub issue #180 created and linked

---

## Related Resources

- **GitHub Issue**: [#180](https://github.com/vfarcic/dot-ai/issues/180)
- **MCP Protocol Specification**: https://spec.modelcontextprotocol.io/
- **Kubernetes Client Library**: https://github.com/kubernetes-client/javascript
- **Security Best Practices**: TBD (to be created in Milestone 8)

---

## Appendix: Example Configurations

### Example 1: Shared Anthropic Key, Individual Kubeconfigs

**Server Environment Variables:**
```bash
export ANTHROPIC_API_KEY=sk-ant-company-shared-key
```

**Client Configuration (Claude Code MCP Settings):**
```json
{
  "mcpServers": {
    "dot-ai": {
      "url": "https://mcp.company.com",
      "credentials": {
        "kubeconfig": "/Users/alice/.kube/config"
      }
    }
  }
}
```

**Result**: Alice's operations use company Anthropic key + Alice's kubeconfig

---

### Example 2: All Individual Credentials

**Server Environment Variables:**
```bash
# No credentials set
```

**Client Configuration (Claude Code MCP Settings):**
```json
{
  "mcpServers": {
    "dot-ai": {
      "url": "https://mcp.company.com",
      "credentials": {
        "kubeconfig": "/Users/bob/.kube/config",
        "anthropic_api_key": "sk-ant-bob-personal-key"
      }
    }
  }
}
```

**Result**: Bob's operations use Bob's Anthropic key + Bob's kubeconfig

---

### Example 3: Legacy Local Setup (No Changes)

**Server Environment Variables:**
```bash
export KUBECONFIG=/Users/charlie/.kube/config
export ANTHROPIC_API_KEY=sk-ant-charlie-key
```

**Client Configuration (Claude Code MCP Settings):**
```json
{
  "mcpServers": {
    "dot-ai": {
      "command": "npm",
      "args": ["run", "start:mcp"]
    }
  }
}
```

**Result**: Charlie's local MCP uses env vars, no client credentials needed (current behavior preserved)

---

## Version History

- **v1.0** (2025-10-24): Initial PRD creation with 10 milestones and 7 open questions
