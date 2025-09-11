# PRD: Kubernetes Remediation Tool

**Issue**: #97  
**Created**: 2025-01-10  
**Status**: In Progress  
**Priority**: High  
**Owner**: TBD  

## Executive Summary

Add a new MCP tool called `remediate` that receives Kubernetes issues and events, analyzes them using AI, and provides remediation recommendations or executes fixes. This tool will be callable from multiple sources including Kubernetes controllers, human agents via Claude Code, and CI/CD pipelines.

## Problem Statement

### Current Challenges
- Kubernetes operational issues require manual intervention, increasing MTTR
- No standardized approach to common cluster problems
- Knowledge of fixes is distributed across team members
- Repetitive issues consume significant operational time
- Lack of automated response to predictable failures

### User Impact
- **DevOps Teams**: Spend excessive time on repetitive incident response
- **On-call Engineers**: Face alert fatigue from issues that could be auto-remediated
- **Platform Teams**: Struggle to maintain consistent remediation practices across clusters

## Success Criteria

- Reduce MTTR for common Kubernetes issues by 50%
- Successfully auto-remediate 80% of targeted event types
- Provide actionable recommendations for 95% of analyzed issues
- Support both automated and manual approval workflows
- Zero false-positive remediations that cause service degradation

## Scope

### In Scope
- New MCP tool (`remediate`) for issue analysis and remediation
- AI-powered analysis using existing Claude integration
- Support for multiple trigger sources (controller, human, API)
- Manual and automatic remediation modes
- Structured remediation reporting and audit trails

### Out of Scope
- Kubernetes controller implementation (separate project)
- Notification/approval mechanisms (deferred to implementation phase)
- Multi-cluster orchestration (future enhancement)
- Custom resource definitions (controller project)

## Requirements

### Functional Requirements

1. **Issue Analysis**
   - Accept structured issue descriptions with context
   - Analyze logs, metrics, and related events
   - Identify root causes using AI

2. **Remediation Generation**
   - Generate specific remediation steps
   - Provide risk assessment for each action
   - Support multiple remediation strategies

3. **Execution Modes**
   - Manual mode: Return recommendations only
   - Automatic mode: Execute approved remediations
   - Hybrid mode: Auto-execute low-risk, manual for high-risk

4. **Integration Points**
   - HTTP/JSON API for external callers
   - MCP protocol compliance
   - Structured response format

### Non-Functional Requirements

- **Performance**: Response within 10 seconds for analysis
- **Reliability**: 99.9% availability for critical path
- **Security**: Multi-layer safety for read-only operations during investigation
  - AI prompt constraints (explicit read-only instructions)
  - Code enforcement (whitelist of safe operations)
  - RBAC constraints (read-only service account)
  - Command validation (parameterized, safe command construction)
- **Audit**: Complete investigation trail and all remediation actions
- **Scalability**: Handle 100+ concurrent remediation requests

## Technical Design

### Tool Interface

```typescript
interface RemediateInput {
  issue: string;           // Issue description
  context?: {             // Optional initial context
    event?: K8sEvent;
    logs?: string[];
    metrics?: Metrics;
    podSpec?: any;
    relatedEvents?: K8sEvent[];
  };
  mode?: 'manual' | 'automatic';
  policy?: string;        // Reference to calling policy
}

interface RemediateOutput {
  status: 'success' | 'failed';
  sessionId: string;
  investigation: {
    iterations: number;
    dataGathered: string[];
    analysisPath: string[];
  };
  analysis: {
    rootCause: string;
    confidence: number;
    factors: string[];
  };
  remediation: {
    summary: string;
    actions: RemediationAction[];
    risk: 'low' | 'medium' | 'high';
  };
  executed?: boolean;
  results?: ExecutionResult[];
}

// Safe data request interface - only read operations allowed
interface DataRequest {
  type: 'get' | 'describe' | 'logs' | 'events' | 'top'; // Whitelist of safe operations
  resource: string;
  namespace?: string;
  rationale: string;
}

interface RemediateSession {
  sessionId: string;
  issue: string;
  initialContext: any;
  iterations: [{
    step: number;
    aiAnalysis: string;
    dataRequests: DataRequest[];
    gatheredData: { [key: string]: any };
    complete: boolean;
  }];
  finalAnalysis?: RemediateOutput;
  created: Date;
  updated: Date;
}
```

### Architecture Integration

```
External Callers → MCP Server → Remediate Tool → AI Investigation Loop:
                                      ↓              ↓
                                Session Storage ← → Claude AI
                                      ↓              ↓
                           Safe K8s Data Gatherer ← → Multi-Layer Safety
                                      ↓                     ↓
                                Kubernetes API    RBAC Read-Only SA
```

### Investigation Loop Architecture

```
1. Issue + Initial Context → Session Storage
2. AI Analysis → Data Requests (validated against whitelist)
3. Code Validates & Fetches Data (read-only) → Session Storage  
4. Updated Session → AI Analysis
5. Repeat until AI declares analysis complete
6. Return comprehensive remediation plan
```

### Multi-Layer Safety Architecture

```
Layer 1: AI Prompt Instructions (explicit read-only constraints)
    ↓
Layer 2: Code Enforcement (whitelist validation)
    ↓  
Layer 3: Command Construction (parameterized, safe building)
    ↓
Layer 4: Kubernetes RBAC (read-only service account)
```

### Key Components

1. **Tool Handler** (`src/tools/remediate.ts`)
   - Input validation
   - Session management and persistence
   - AI investigation loop orchestration
   - Final analysis compilation

2. **Safe Data Gatherer** (`src/core/k8s-safe-data-gatherer.ts`)
   - Multi-layer safety enforcement:
     - Operation whitelist validation
     - Parameterized command construction
     - Input sanitization and validation
   - Read-only Kubernetes API operations (get, describe, logs, events, top)
   - Context enrichment based on validated AI requests
   - Session-based data storage

3. **AI Investigation Engine**
   - Iterative analysis with full session context
   - Read-only operation constraints in prompts
   - Adaptive data gathering requests (safety validated)
   - Comprehensive root cause analysis
   - Investigation completion detection

4. **Safety Validator** (`src/core/safety-validator.ts`)
   - Data request validation against whitelist
   - Command construction safety checks
   - Audit trail of all validation decisions
   - Error handling for unsafe requests

5. **Remediation Engine** (Milestone 2)
   - Action generation based on complete analysis
   - Risk assessment
   - Execution orchestration

6. **Audit Logger**
   - Track all investigation steps and decisions
   - Record safety validation outcomes
   - Complete investigation trail
   - Compliance reporting

## Implementation Milestones

### Milestone 1: AI-Driven Investigation & Analysis ⬜
**Deliverable**: Complete analysis tool with AI-driven context enrichment loop
- [ ] Create tool handler with investigation loop architecture
- [ ] Implement session-based state management for investigation tracking
- [ ] Add multi-layer safety enforcement for read-only operations
- [ ] Add read-only Kubernetes API integration for context enrichment
- [ ] Implement AI-driven data gathering request/response cycle
- [ ] Integrate comprehensive analysis with Claude AI
- [ ] Add unit tests with 80% coverage

### Milestone 2: Execution Capabilities ⬜
**Deliverable**: Tool can execute remediations in automatic mode
- [ ] Add execution engine with rollback support
- [ ] Create audit logging system
- [ ] Integration testing with test cluster
- [ ] Safety mechanisms and approval workflows

### Milestone 3: Production Optimization ⬜
**Deliverable**: Production-ready tool with monitoring and performance features
- [ ] Performance optimization for large contexts
- [ ] Rate limiting and circuit breakers
- [ ] Comprehensive error handling
- [ ] Monitoring and alerting setup

### Milestone 4: Production Readiness ⬜
**Deliverable**: Production-ready tool with monitoring and safety features
- [ ] Rate limiting and circuit breakers
- [ ] Comprehensive error handling
- [ ] Monitoring and alerting setup
- [ ] Documentation and runbooks

### Milestone 5: Initial Deployment ⬜
**Deliverable**: Tool deployed and handling real issues
- [ ] Deploy to staging environment
- [ ] Run in shadow mode for validation
- [ ] Progressive rollout to production
- [ ] Success metrics achieved

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| AI generates incorrect remediation | High | Medium | Manual approval for high-risk actions, extensive testing |
| Remediation causes cascade failure | High | Low | Circuit breakers, gradual rollout, automatic rollback |
| Performance degradation under load | Medium | Medium | Rate limiting, queue management, horizontal scaling |
| Integration complexity with controllers | Medium | Low | Well-defined interface contract, extensive documentation |

## Dependencies

- Existing Claude AI integration
- Kubernetes API access with appropriate RBAC
- MCP server infrastructure
- Session storage system (for state management)

## Future Enhancements

1. **Pattern Learning**: Learn from successful remediations
2. **Custom Remediation Scripts**: User-defined fix procedures
3. **Multi-cluster Support**: Coordinate fixes across clusters
4. **Predictive Remediation**: Fix issues before they occur
5. **Integration Marketplace**: Pre-built integrations with monitoring tools

## Open Questions

1. **Approval Mechanism**: Slack vs UI vs webhook - to be determined during implementation
2. **Notification Channels**: Specific integrations to be determined based on user feedback
3. **Investigation Loop Limits**: Maximum iterations and timeout strategies - determine during testing
4. **Session Cleanup**: Retention policy for investigation session files - determine based on storage constraints
5. **RBAC Configuration**: Specific permissions needed for read-only service account - finalize during implementation

## Resolved Decisions

1. **✅ Context Enrichment Strategy**: AI-driven investigation loop with read-only data gathering
   - **Date**: 2025-01-11
   - **Decision**: Use AI ↔ Code iteration loop for comprehensive analysis
   - **Rationale**: Quality-first approach, AI can reason about investigation paths that code cannot anticipate
   - **Impact**: Milestone restructure, enhanced analysis capabilities in M1

2. **✅ State Management**: Session-based persistence using file storage
   - **Date**: 2025-01-11  
   - **Decision**: Follow existing tool patterns (recommend tool) for session management
   - **Rationale**: Consistency with existing architecture, auditability, resumability
   - **Impact**: Investigation state persisted across iterations, complete audit trail

3. **✅ Safety Architecture**: Multi-layer read-only operation enforcement
   - **Date**: 2025-01-11
   - **Decision**: Implement 4-layer safety system for investigation phase
   - **Rationale**: Critical safety requirement to prevent accidental cluster modifications during analysis
   - **Impact**: Additional validation components, enhanced security requirements, RBAC constraints

## Progress Log

### 2025-01-10
- Initial PRD created based on architectural discussions
- Core concept validated with stakeholder
- Decision to separate controller and MCP tool implementation
- Defined interface contract between components

### 2025-01-11
- **DECISION**: AI-driven investigation loop architecture adopted
- **RATIONALE**: Quality over speed - comprehensive analysis requires adaptive data gathering that only AI can reason through
- **IMPACT**: Combined context enrichment into Milestone 1, restructured milestone plan
- **SCOPE**: Tool performs complete analysis in single call with internal iteration loop
- **CONSTRAINTS**: Read-only operations only during investigation phase for safety
- **ARCHITECTURE**: AI ↔ Code loop: AI requests data → Code fetches safely → AI analyzes → Repeat until complete
- **STATE MANAGEMENT**: Session-based persistence following existing tool patterns (like recommend tool)
- **SAFETY**: Multi-layer safety enforcement for read-only operations
  - AI prompt constraints (explicit read-only instructions)
  - Code enforcement (whitelist of safe operations: get, describe, logs, events, top)
  - RBAC constraints (read-only service account permissions)
  - Command validation (parameterized, safe command construction)
- **DECISION**: Complete investigation history stored in session files for auditability and resumability

---

*This PRD is a living document and will be updated as the implementation progresses.*