# PRD: User-Specific Permissions

**Status**: Planning
**Priority**: High
**GitHub Issue**: [#361](https://github.com/vfarcic/dot-ai/issues/361)
**Created**: 2026-01-30
**Last Updated**: 2026-01-30
**Depends On**: [PRD #360 - User Authentication](./360-user-authentication.md)

---

## Problem Statement

In multi-user MCP deployments, there is a **mismatch between what the AI sees and what the user can do**:

1. The **dot-ai-controller** scans the entire cluster with admin access and stores all resources in Qdrant
2. When a user connects, the **AI queries Qdrant** and sees the full cluster view
3. The AI suggests actions based on this full view
4. The user's **kubeconfig has limited RBAC permissions**
5. The suggested action **fails** because the user can't perform it

**Example Scenario:**
```
User: "Fix the failing pod"
AI: *queries Qdrant, sees pod in kube-system*
AI: "I'll restart the pod in kube-system"
AI: *tries kubectl with user's kubeconfig, fails*
AI: "Sorry, permission denied. Let me try something else..."
```

**User Impact:**
- Frustrating experience with repeated permission failures
- AI suggests irrelevant actions user cannot perform
- Potential information leakage (user learns about resources they shouldn't see)
- Wasted time on actions that will fail

## Proposed Solution

Implement a **permission profile system** that aligns the AI's view with the user's actual capabilities:

1. **Extract Permissions**: When user connects, inspect their kubeconfig to determine what they can access
2. **Cache Profile**: Store permissions as a session-scoped profile (not per-operation, for performance)
3. **Filter DB Queries**: All Qdrant queries filtered by user's permission profile
4. **Inform AI**: Inject permission context into AI prompts so AI knows what's allowed

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      Connection Time                             │
├─────────────────────────────────────────────────────────────────┤
│  1. User provides kubeconfig                                     │
│  2. Extract permissions via K8s SelfSubjectAccessReview API     │
│  3. Build permission profile:                                    │
│     - Allowed namespaces                                         │
│     - Allowed resource types per namespace                       │
│     - Allowed verbs (get, list, create, delete, etc.)           │
│  4. Cache profile for session                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Runtime (Every Request)                     │
├─────────────────────────────────────────────────────────────────┤
│  DB Queries:                                                     │
│  - Add filter: WHERE namespace IN (user.allowed_namespaces)     │
│  - User only sees resources they can access                      │
│                                                                  │
│  AI Prompts:                                                     │
│  - Include: "User can access: dev, staging namespaces"          │
│  - Include: "User can: get/list pods, deployments"              │
│  - Include: "User cannot: delete pods, access secrets"          │
│                                                                  │
│  Operations:                                                     │
│  - Use appropriate kubeconfig (from PRD #360 user context)      │
│  - Operations succeed because AI only suggests allowed actions   │
└─────────────────────────────────────────────────────────────────┘
```

### Desired Outcome

```
User: "Fix the failing pod"
AI: *knows user can only access "dev" namespace*
AI: *queries Qdrant filtered to "dev" namespace*
AI: "I see a failing pod in dev namespace. I'll restart it."
AI: *succeeds because user has permission*
```

## Success Criteria

### Must Have (MVP)
- [ ] Extract namespace-level permissions from kubeconfig at connection time
- [ ] Cache permission profile for session duration
- [ ] Filter Qdrant queries by user's allowed namespaces
- [ ] Include permission context in AI prompts
- [ ] Integration tests validating permission filtering

### Nice to Have (Future)
- [ ] Resource-type level permission granularity (not just namespaces)
- [ ] Verb-level permissions (can list but not delete)
- [ ] Permission profile refresh without reconnection
- [ ] Admin override to grant additional permissions
- [ ] Permission analytics (what permissions are commonly needed)

### Success Metrics
- Zero AI suggestions for resources user cannot access
- DB queries return only permitted resources
- AI prompts accurately reflect user capabilities
- Permission extraction adds <500ms to connection time

## Technical Scope

### Permission Extraction

Use Kubernetes `SelfSubjectAccessReview` and `SelfSubjectRulesReview` APIs:

```bash
# What can I do in namespace X?
kubectl auth can-i --list -n <namespace>

# Can I do specific action?
kubectl auth can-i get pods -n <namespace>
```

**Extraction Process:**
1. List all namespaces in cluster
2. For each namespace, check if user can `get pods` (basic access indicator)
3. For allowed namespaces, optionally check specific resource permissions
4. Build permission profile

**Permission Profile Schema:**
```typescript
interface PermissionProfile {
  userId: string;
  extractedAt: Date;
  expiresAt: Date;

  // Namespace-level (MVP)
  allowedNamespaces: string[];

  // Resource-level (future)
  permissions?: {
    [namespace: string]: {
      [resourceType: string]: string[];  // allowed verbs
    }
  };
}
```

### DB Query Filtering

**Current Query (unfiltered):**
```
Find resources matching "failing pod"
```

**Filtered Query:**
```
Find resources matching "failing pod"
WHERE namespace IN ["dev", "staging"]
```

Implementation in Qdrant queries:
- Add namespace filter to all resource queries
- Filter applied at query time, not post-processing
- Efficient: Qdrant supports filtering natively

### AI Prompt Injection

Add permission context to system prompts:

```markdown
## User Permissions

The current user has the following Kubernetes access:

**Allowed Namespaces:** dev, staging
**Cluster-wide Access:** No

When suggesting actions:
- Only reference resources in allowed namespaces
- Do not suggest operations the user cannot perform
- If user asks about resources outside their access, explain the limitation
```

### Core Components

**1. Permission Extractor (New: `src/core/permissions/extractor.ts`)**
- Connect to K8s with user's kubeconfig
- Query SelfSubjectAccessReview/SelfSubjectRulesReview
- Build permission profile
- Handle extraction errors gracefully

**2. Permission Cache (New: `src/core/permissions/cache.ts`)**
- Store permission profiles per user session
- TTL-based expiration
- Memory-efficient storage

**3. Query Filter (Modify: `src/core/qdrant/` or equivalent)**
- Inject namespace filter into all resource queries
- Get filter criteria from user's permission profile

**4. Prompt Enhancer (Modify: prompt generation)**
- Include permission context in AI system prompts
- Format permissions for AI consumption

## Dependencies

**Internal Dependencies:**
- **PRD #360 (User Authentication)**: Required for user identity and kubeconfig association

**External Dependencies:**
- Kubernetes API access for permission extraction
- User's kubeconfig must be available at connection time

## Milestones

### Milestone 1: Permission Extraction
**Objective**: Extract user permissions from kubeconfig at connection time

**Deliverables:**
- [ ] Permission extractor using K8s SelfSubjectAccessReview API
- [ ] Namespace-level permission detection
- [ ] Permission profile schema and builder
- [ ] Unit tests for extraction logic
- [ ] Graceful handling of extraction failures

**Success Criteria:**
- Can determine which namespaces user can access
- Extraction completes in <500ms for typical RBAC setups
- Errors don't block connection (degrade gracefully)

---

### Milestone 2: Permission Caching
**Objective**: Cache permission profiles for session duration

**Deliverables:**
- [ ] Permission cache with TTL support
- [ ] Integration with user session from PRD #360
- [ ] Cache invalidation on session end
- [ ] Memory-efficient storage

**Success Criteria:**
- Permissions cached after extraction
- Cache lookup is fast (<1ms)
- Cache cleaned up on session end

---

### Milestone 3: DB Query Filtering
**Objective**: Filter Qdrant queries by user's allowed namespaces

**Deliverables:**
- [ ] Namespace filter injection for resource queries
- [ ] Integration with Qdrant query layer
- [ ] Verification that filtered results match expectations
- [ ] Performance testing to ensure minimal overhead

**Success Criteria:**
- All resource queries filtered by user permissions
- User only sees resources in allowed namespaces
- Query performance within acceptable bounds (<100ms overhead)

---

### Milestone 4: AI Prompt Enhancement
**Objective**: Include permission context in AI prompts

**Deliverables:**
- [ ] Permission context formatter for AI prompts
- [ ] Integration with prompt generation
- [ ] Testing that AI respects permission boundaries
- [ ] Clear messaging when user asks about inaccessible resources

**Success Criteria:**
- AI prompts include user's permission context
- AI suggestions stay within user's permissions
- AI explains limitations when asked about inaccessible resources

---

### Milestone 5: Integration Testing & Documentation
**Objective**: Validate end-to-end permission flow

**Deliverables:**
- [ ] Integration tests with different RBAC configurations
- [ ] Tests validating DB filtering works correctly
- [ ] Tests validating AI respects permissions
- [ ] Documentation for permission system
- [ ] Troubleshooting guide for permission issues

**Success Criteria:**
- End-to-end tests passing
- Different RBAC scenarios covered
- Documentation enables understanding of permission system

---

## Open Questions

### 1. Permission Granularity
**Question**: What level of permission granularity should MVP support?

**Options:**
- Namespace-level only (simpler, covers most cases)
- Resource-type level (more precise, more complex extraction)
- Verb-level (most precise, most complex)

**Current Thinking**: Namespace-level for MVP, expand granularity based on feedback

**Decision Point**: Before Milestone 1

---

### 2. Permission Refresh
**Question**: How should permissions be updated if user's RBAC changes mid-session?

**Options:**
- Require reconnection (simplest)
- Periodic refresh (background)
- On-demand refresh (user-triggered)

**Current Thinking**: Require reconnection for MVP

**Decision Point**: Before Milestone 2

---

### 3. Extraction Failure Handling
**Question**: What happens if permission extraction fails?

**Options:**
- Block connection entirely
- Allow connection with no permissions (fail-safe)
- Allow connection with warning (fail-open)

**Current Thinking**: Allow connection with warning, but filter aggressively

**Decision Point**: Before Milestone 1

---

### 4. Cluster-wide Resources
**Question**: How to handle cluster-scoped resources (not namespaced)?

**Options:**
- Separate permission check for cluster resources
- Exclude cluster resources entirely in MVP
- Include if user has cluster-admin role

**Current Thinking**: Exclude cluster resources in MVP unless user has broad access

**Decision Point**: Before Milestone 3

---

## Related Resources

- **GitHub Issue**: [#361](https://github.com/vfarcic/dot-ai/issues/361)
- **Depends On**: [PRD #360 - User Authentication](./360-user-authentication.md)
- **Supersedes**: [#180 - Dynamic Credential Management](./done/180-dynamic-credential-management.md) (partially)
- **Kubernetes RBAC Docs**: https://kubernetes.io/docs/reference/access-authn-authz/rbac/
- **SelfSubjectAccessReview API**: https://kubernetes.io/docs/reference/kubernetes-api/authorization-resources/self-subject-access-review-v1/

---

## Version History

- **v1.0** (2026-01-30): Initial PRD creation with 5 milestones
