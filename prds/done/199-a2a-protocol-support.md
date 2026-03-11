# PRD: Agent-to-Agent (A2A) Protocol Support

**GitHub Issue**: [#199](https://github.com/vfarcic/dot-ai/issues/199)
**Status**: Planning
**Priority**: Low
**Created**: 2025-10-31
**Owner**: TBD

---

## Overview

### Problem Statement

The DevOps AI Toolkit is currently only accessible via the Model Context Protocol (MCP), which is designed for human → AI assistant → tool workflows. As agent orchestration platforms and multi-agent systems evolve, there's potential demand for agent-to-agent integration patterns where autonomous agents discover and delegate to specialized agents (like this DevOps agent) without human intervention.

While MCP adequately serves current use cases, the lack of A2A protocol support may limit future integration opportunities with:
- Agent orchestration platforms that standardize on A2A
- Agent marketplaces with dynamic discovery mechanisms
- Complex multi-agent workflows requiring peer-to-peer agent delegation

### Solution Overview

Add Agent-to-Agent (A2A) protocol support as a secondary interface alongside the existing MCP server, enabling the DevOps AI Toolkit to participate in agent-to-agent collaboration patterns. The implementation will:

1. Create a unified server that supports both MCP and A2A protocols simultaneously
2. Expose existing tool capabilities (recommend, remediate, manageOrgData, projectSetup) via A2A
3. Implement A2A-specific features: capability advertising, agent discovery metadata, identity verification
4. Maintain full feature parity between MCP and A2A interfaces

### Success Criteria

- [ ] A2A server runs alongside MCP server and accepts A2A protocol requests
- [ ] All four core tools (recommend, remediate, manageOrgData, projectSetup) are accessible via A2A
- [ ] Agent capability discovery returns accurate metadata about DevOps agent skills
- [ ] A2A clients can authenticate and perform K8s operations with same functionality as MCP
- [ ] Documentation guides agent developers on connecting via A2A
- [ ] Zero performance degradation to existing MCP functionality

---

## User Impact

### Target Users

**Primary**: Agent platform developers building multi-agent systems
- Need K8s deployment capabilities in agent orchestrations
- Want autonomous agent-to-agent delegation patterns
- Building platforms where agents discover/call each other

**Secondary**: Enterprise DevOps teams with agent orchestration
- Running multiple specialized agents (planning, deployment, monitoring)
- Need K8s expertise agent in their agent network
- Automating workflows without human-in-the-loop

**Tertiary**: Existing MCP users (no change)
- Continue using MCP interface as today
- Transparent to current workflows

### User Journey

#### Before (Current State)
1. User wants to integrate DevOps AI into agent platform
2. Platform uses A2A protocol for agent communication
3. **Blocked**: No A2A interface available
4. User must build custom wrapper or use different protocol

#### After (With A2A Support)
1. User's agent platform searches for "kubernetes deployment" capability
2. A2A discovery returns DevOps AI agent metadata
3. Platform agent sends A2A request: "Deploy PostgreSQL with HA"
4. DevOps AI agent processes via A2A → returns deployment plan
5. Platform agent executes or delegates further
6. Seamless integration into multi-agent workflows

### Value Proposition

**For Agent Developers**:
- Standards-based integration (A2A protocol)
- Discover DevOps capabilities dynamically
- Delegate K8s operations to specialized agent

**For Enterprises**:
- Position DevOps AI as "K8s expert agent" in agent networks
- Enable autonomous DevOps workflows
- Future-proof for agent orchestration trends

**For Project**:
- Expand addressable use cases beyond MCP
- Position for agent marketplace/platform integrations
- Strategic differentiation in agent ecosystem

---

## Technical Scope

### Core Components

**1. A2A Server Interface**
- Implement A2A protocol transport layer
- Handle A2A message format (discovery, requests, responses)
- Run on separate port from MCP server (e.g., :3001 for A2A, :3000 for MCP)

**2. Unified Tool Adapter**
- Shared core logic for tools (no duplication)
- Protocol-agnostic tool implementations
- Adapters for MCP vs A2A message formats

**3. Capability Advertising**
- A2A discovery endpoint returning agent metadata
- List of capabilities: recommend, remediate, manageOrgData, projectSetup
- Semantic tags: kubernetes, deployment, remediation, policy, setup

**4. Authentication & Authorization**
- Support agent identity verification (API keys, certificates)
- Maintain K8s RBAC for cluster operations
- Trust model for agent-to-agent calls

**5. Session Management**
- Handle A2A conversation continuation
- Map to existing session patterns (e.g., workflow sessionIds)
- Support async operations for long-running tasks

### Tool Mapping

| MCP Tool | A2A Capability | Notes |
|----------|----------------|-------|
| `recommend` | `kubernetes.deployment.recommend` | Deploy apps based on cluster capabilities |
| `remediate` | `kubernetes.issue.remediate` | Diagnose and fix K8s issues |
| `manageOrgData` | `kubernetes.policy.manage` | Manage org patterns, policies, capabilities |
| `projectSetup` | `project.setup.audit` | Repository auditing and file generation |

### Architecture

```
┌─────────────────────────────────────────┐
│         DevOps AI Toolkit Agent         │
├─────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐  │
│  │ MCP Interface│    │ A2A Interface│  │
│  │   (Port      │    │   (Port      │  │
│  │    3000)     │    │    3001)     │  │
│  └──────┬───────┘    └──────┬───────┘  │
│         │                   │           │
│         └───────┬───────────┘           │
│                 │                       │
│         ┌───────▼───────────┐          │
│         │  Tool Adapter     │          │
│         │  (Protocol-       │          │
│         │   agnostic)       │          │
│         └───────┬───────────┘          │
│                 │                       │
│    ┌────────────┼────────────┐         │
│    │            │            │         │
│ ┌──▼──┐  ┌─────▼────┐  ┌───▼─────┐   │
│ │Recom│  │Remediate │  │ManageOrg│   │
│ │mend │  │          │  │Data     │   │
│ └─────┘  └──────────┘  └─────────┘   │
└─────────────────────────────────────────┘
         │
         ▼
   Kubernetes Cluster
```

### Integration Points

- **Existing MCP Server**: No changes, continue as-is
- **Core Tool Logic**: Shared between MCP and A2A
- **Kubernetes Client**: Unchanged, same cluster operations
- **Claude AI Integration**: Same AI reasoning for both protocols
- **Vector DB (Qdrant)**: Shared capability discovery data

### Out of Scope

- ❌ Removing or deprecating MCP support
- ❌ A2A-specific features beyond protocol compliance
- ❌ Agent marketplace registration/hosting
- ❌ Complex agent orchestration logic (delegating to other agents)
- ❌ Changes to existing tool behavior or K8s operations

---

## Implementation Plan

### Phase 1: Foundation ✅
- [ ] Research A2A protocol specification and reference implementations
- [ ] Design unified server architecture supporting both MCP and A2A
- [ ] Create protocol adapter abstraction layer
- [ ] Set up A2A server with basic request handling

**Success Criteria**: A2A server starts, handles basic requests, returns mock responses

### Phase 2: Core Tool Integration ✅
- [ ] Implement tool adapter for `recommend` tool via A2A
- [ ] Implement tool adapter for `remediate` tool via A2A
- [ ] Implement tool adapter for `manageOrgData` tool via A2A
- [ ] Implement tool adapter for `projectSetup` tool via A2A
- [ ] Validate feature parity with MCP versions

**Success Criteria**: All four tools accessible via A2A with identical functionality to MCP

### Phase 3: A2A-Specific Features ✅
- [ ] Implement capability discovery endpoint
- [ ] Create agent metadata (name, description, capabilities, semantic tags)
- [ ] Add agent authentication/authorization support
- [ ] Implement session management for A2A conversations

**Success Criteria**: Agents can discover DevOps AI, authenticate, and maintain sessions

### Phase 4: Testing & Documentation ✅
- [ ] Write integration tests for A2A protocol endpoints
- [ ] Create example A2A client for testing
- [ ] Document A2A setup and configuration
- [ ] Create agent developer guide for connecting via A2A
- [ ] Update architecture documentation

**Success Criteria**: Comprehensive test coverage, clear documentation for agent developers

### Phase 5: Production Ready ✅
- [ ] Performance testing (ensure no MCP degradation)
- [ ] Security audit (agent identity, authorization)
- [ ] Deployment configuration (port management, environment variables)
- [ ] Monitoring and observability for A2A requests
- [ ] Feature ready for external testing

**Success Criteria**: Production-ready A2A interface, monitored, secure, performant

---

## Dependencies

### Technical Dependencies
- **A2A Protocol Library**: Need A2A TypeScript SDK or implement protocol manually
- **Authentication System**: Agent identity verification mechanism
- **Port Configuration**: Manage dual-protocol server setup

### External Dependencies
- **A2A Standard Maturity**: Protocol specification and ecosystem adoption
- **Agent Platform Demand**: Actual user requests for A2A support
- **Reference Implementations**: Example A2A agents for testing

### Internal Dependencies
- **Core Tool Stability**: Existing tools must be stable before adding protocol
- **Team Availability**: Low priority means opportunistic development

---

## Risks & Mitigation

### Risk 1: Limited A2A Ecosystem Adoption
**Impact**: High effort, low usage if A2A doesn't gain traction
**Likelihood**: Medium
**Mitigation**:
- Keep implementation lightweight (adapter pattern, minimal code)
- Monitor agent platform trends before heavy investment
- Defer Phase 3-5 until demand signals emerge

### Risk 2: Protocol Specification Changes
**Impact**: Breaking changes if A2A standard evolves
**Likelihood**: Medium (early-stage protocol)
**Mitigation**:
- Version A2A interface explicitly
- Design adapter layer to isolate protocol changes
- Follow A2A community discussions actively

### Risk 3: Maintenance Burden
**Impact**: Two protocols to maintain, test, document
**Likelihood**: High
**Mitigation**:
- Maximize code sharing between MCP and A2A (adapter pattern)
- Comprehensive integration tests for both protocols
- Clear ownership and documentation

### Risk 4: Security Concerns
**Impact**: Agent-to-agent calls introduce new attack surface
**Likelihood**: Medium
**Mitigation**:
- Implement robust agent authentication
- Same K8s RBAC as MCP (no new cluster permissions)
- Security audit before production release

### Risk 5: Performance Degradation
**Impact**: A2A server impacts MCP performance
**Likelihood**: Low
**Mitigation**:
- Separate server processes/ports
- Load testing for both protocols
- Monitor resource usage independently

---

## Open Questions

- [ ] **Q1**: Which A2A protocol version/implementation should we target? (Google's Agent Protocol, OpenAI's Agent Protocol, other?)
- [ ] **Q2**: Should A2A server run in same process as MCP or separate process?
- [ ] **Q3**: What authentication mechanism for agent-to-agent calls? (API keys, mTLS, OAuth for agents?)
- [ ] **Q4**: Do we need to support async A2A operations for long-running K8s tasks?
- [ ] **Q5**: Should we register with any agent marketplaces/directories, or just support the protocol?
- [ ] **Q6**: What metrics/observability specifically for A2A vs MCP usage?

---

## Success Metrics

### Adoption Metrics (Long-term)
- **A2A Request Volume**: Number of requests via A2A vs MCP
- **Agent Integrations**: Number of agent platforms connecting via A2A
- **Discovery Hits**: Frequency of capability discovery queries

### Technical Metrics
- **Feature Parity**: 100% of MCP tool functionality available via A2A
- **Response Time**: A2A requests <10% slower than equivalent MCP calls
- **Error Rate**: A2A error rate <1% for valid requests
- **Uptime**: A2A server availability >99.9%

### User Satisfaction
- **Documentation Clarity**: Agent developers can integrate in <1 hour
- **Issue Reports**: <5 A2A-specific bugs reported per quarter
- **Community Feedback**: Positive reception from agent platform developers

---

## Timeline & Prioritization

**Priority**: Low (opportunistic development)

**Estimated Effort**: 3-4 weeks (1 engineer, part-time)

**Proposed Timeline**:
- **Weeks 1-2**: Phase 1 (Foundation) + Phase 2 (Core Tools)
- **Week 3**: Phase 3 (A2A Features)
- **Week 4**: Phase 4 (Testing/Docs) + Phase 5 (Production)

**Go/No-Go Decision Points**:
1. After Phase 1: Is A2A ecosystem showing adoption signals?
2. After Phase 3: Is there actual user demand or platform interest?
3. Before Phase 5: Do benefits justify maintenance burden?

**Recommendation**: Park at Phase 2 completion unless:
- Multiple user requests for A2A support
- Major agent platform adopts A2A standard
- Strategic partnership opportunity requires A2A

---

## Related PRDs & Context

- **Related Issues**: None yet (first A2A discussion)
- **Related Features**: All existing MCP tools (recommend, remediate, manageOrgData, projectSetup)
- **Documentation**: [A2A Protocol Specification](https://example.com/a2a-spec) (TBD)

---

## Notes

**Key Insight**: A2A support is primarily strategic positioning rather than immediate functional need. MCP adequately handles current use cases, including integration into autonomous agents. A2A becomes valuable when agent orchestration platforms standardize on the protocol and dynamic agent discovery becomes common.

**Decision Rationale for Low Priority**:
- No current user demand for A2A
- MCP ecosystem has stronger momentum (Anthropic backing, multiple clients)
- Agent marketplaces/registries don't widely exist yet
- Implementation would be premature optimization given ecosystem maturity

**When to Revisit**:
- Major agent orchestration platform announces A2A support
- Multiple enterprise users request A2A integration
- Agent marketplace emerges requiring A2A for listing
- Competitor gains advantage through A2A positioning
