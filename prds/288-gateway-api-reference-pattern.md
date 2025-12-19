---
issue_url: https://github.com/irizzante/dot-ai/issues/3
status: in-progress
created: 2025-12-19
scope: medium
---

# Gateway API: Reference Pattern with `-http` Suffix

![Status: In Progress](https://img.shields.io/badge/status-In%20Progress-yellow)

## Problem Statement

The current Gateway API implementation creates a per-application Gateway resource for each dot-ai deployment, which violates Gateway API design principles and best practices:

1. **Infrastructure proliferation**: Each Gateway typically provisions a new cloud load balancer, resulting in unnecessary costs and complexity
2. **Separation of concerns violation**: Gateway API explicitly separates platform/infra team responsibilities (Gateway management) from application team responsibilities (HTTPRoute management)
3. **Anti-pattern**: Analogous to creating an IngressController per application instead of referencing a shared one
4. **kGateway naming collision**: Kong's Gateway implementation creates Envoy deployments with the same name as the Gateway resource, causing conflicts when the deployment name matches the Gateway name

## Solution Overview

Refactor the Helm chart to reference existing Gateway resources by default (following Gateway API best practices where platform teams manage shared Gateway infrastructure and application teams create HTTPRoutes that reference them). The chart will optionally support Gateway creation for development/testing scenarios.

**Key changes**:
- Replace `gateway.enabled` with `gateway.name` (reference), `gateway.namespace` (cross-namespace support), and `gateway.create` (optional creation)
- Apply `-http` suffix to created Gateway names to prevent kGateway Envoy deployment naming collisions
- Update HTTPRoute to reference either existing Gateway or created Gateway with suffix
- Maintain backward compatibility through clear validation messages
- Update all documentation to emphasize reference pattern as recommended approach

## Requirements & Constraints

| ID      | Type       | Description                                                                                      |
|---------|------------|--------------------------------------------------------------------------------------------------|
| REQ-001 | Functional | Helm chart must support referencing existing Gateway resources via `gateway.name`               |
| REQ-002 | Functional | Helm chart must support optional Gateway creation via `gateway.create: true`                    |
| REQ-003 | Functional | Created Gateways must have `-http` suffix to prevent kGateway naming collisions                 |
| REQ-004 | Functional | HTTPRoute must correctly reference Gateway in both modes (reference and create)                  |
| REQ-005 | Functional | Support cross-namespace Gateway references via `gateway.namespace`                               |
| REQ-006 | Functional | Maintain mutual exclusivity between Ingress and Gateway API                                      |
| REQ-007 | Functional | Provide clear validation errors for misconfiguration scenarios                                   |
| CON-001 | Constraint | Must not break existing SSE streaming timeout configuration (3600s)                              |
| CON-002 | Constraint | Must preserve all existing Gateway features (listeners, TLS, annotations, timeouts)              |
| CON-003 | Constraint | Must maintain deployment-method aware routing (standard vs toolhive)                             |
| CON-004 | Constraint | Chart must work with Gateway API v1 (stable) CRDs                                                |

## Implementation Steps

| ID       | Task                                                                                               | Status | Completed |
|----------|----------------------------------------------------------------------------------------------------|--------|-----------|
| TASK-001 | Update `charts/values.yaml`: replace `gateway.enabled` with `gateway.name`, `gateway.namespace`, `gateway.create: false` | ⬜     |           |
| TASK-002 | Update `charts/values.yaml`: add comprehensive inline comments explaining new structure and fields | ⬜     |           |
| TASK-003 | Update `charts/templates/gateway.yaml`: change condition to `gateway.create`, apply `-http` suffix | ⬜     |           |
| TASK-004 | Update `charts/templates/httproute.yaml`: change condition to `or gateway.name gateway.create`    | ⬜     |           |
| TASK-005 | Update `charts/templates/httproute.yaml`: add parentRef name resolution logic                      | ⬜     |           |
| TASK-006 | Update `charts/templates/httproute.yaml`: add cross-namespace reference support                   | ⬜     |           |
| TASK-007 | Update validation logic: require `gateway.name` when `create: false`, `className` when `create: true` | ⬜     |           |
| TASK-008 | Update validation logic: mutual exclusivity check for `or gateway.name gateway.create`            | ⬜     |           |
| TASK-009 | Update `tests/unit/helm/gateway-api.test.ts`: Gateway creation tests with `create: true` and `-http` suffix | ⬜     |           |
| TASK-010 | Update `tests/unit/helm/gateway-api.test.ts`: HTTPRoute tests split into reference and creation modes | ⬜     |           |
| TASK-011 | Update `tests/unit/helm/gateway-api.test.ts`: add cross-namespace reference tests                 | ⬜     |           |
| TASK-012 | Update `tests/unit/helm/gateway-api.test.ts`: update validation and mutual exclusivity tests      | ⬜     |           |
| TASK-013 | Update `docs/setup/kubernetes-setup.md`: rewrite Gateway API section emphasizing reference approach | ⬜     |           |
| TASK-014 | Update `docs/setup/kubernetes-setup.md`: update configuration reference table with new fields     | ⬜     |           |
| TASK-015 | Update `examples/gateway-api/README.md`: add ReferenceGrant documentation for cross-namespace refs | ⬜     |           |
| TASK-016 | Update `examples/gateway-api/basic-http.yaml`: demonstrate reference pattern with platform Gateway YAML | ⬜     |           |
| TASK-017 | Update `examples/gateway-api/https-cert-manager.yaml`: demonstrate reference pattern              | ⬜     |           |
| TASK-018 | Update `examples/gateway-api/external-dns.yaml`: demonstrate creation mode with annotations       | ⬜     |           |

## Success Criteria

| ID       | Criteria                                                                                              |
|----------|-------------------------------------------------------------------------------------------------------|
| TEST-001 | All 25+ unit tests in `tests/unit/helm/gateway-api.test.ts` pass                                     |
| TEST-002 | `helm template` with `gateway.name: "cluster-gateway"` creates only HTTPRoute (no Gateway)           |
| TEST-003 | `helm template` with `gateway.create: true` creates Gateway with `-http` suffix and matching HTTPRoute |
| TEST-004 | HTTPRoute parentRef correctly references `gateway.name` when in reference mode                        |
| TEST-005 | HTTPRoute parentRef correctly references `<fullname>-http` when in creation mode                      |
| TEST-006 | Cross-namespace Gateway reference includes `namespace` field in HTTPRoute parentRef                   |
| TEST-007 | Validation error when `gateway.create: false` and `gateway.name` is empty                            |
| TEST-008 | Validation error when `gateway.create: true` and `gateway.className` is empty                        |
| TEST-009 | Mutual exclusivity validation prevents both `ingress.enabled` and Gateway usage                       |
| TEST-010 | SSE timeout configuration (3600s) preserved in HTTPRoute when specified                               |
| TEST-011 | Deployment-method routing (standard vs toolhive) works correctly in both modes                        |

## Dependencies

| ID      | Dependency                                                           | Type     |
|---------|----------------------------------------------------------------------|----------|
| DEP-001 | Gateway API v1 CRDs must be installed in target cluster              | Required |
| DEP-002 | GatewayClass resource must exist when using `gateway.create: true`   | Required |
| DEP-003 | Gateway resource must exist when using reference mode                | Required |
| DEP-004 | ReferenceGrant required for cross-namespace Gateway references       | Optional |
| DEP-005 | Existing test infrastructure (`helm template` + YAML parsing)        | Required |

## Risk Assessment

| ID       | Risk                                                                 | Impact | Mitigation                                                              |
|----------|----------------------------------------------------------------------|--------|-------------------------------------------------------------------------|
| RISK-001 | Breaking change may confuse users of Gateway API feature            | Medium | Provide clear validation errors with actionable messages                |
| RISK-002 | `-http` suffix may not be discoverable when debugging               | Low    | Keep as implementation detail, users reference created Gateway by name  |
| RISK-003 | Cross-namespace references require ReferenceGrant knowledge          | Medium | Document ReferenceGrant requirements with working examples              |
| RISK-004 | Test coverage gaps may leave edge cases unvalidated                  | Medium | Ensure comprehensive test matrix covering all mode combinations         |
| RISK-005 | Documentation may not clearly convey reference vs creation modes     | High   | Structure docs with reference pattern first, creation as advanced topic |

## Alternatives Considered

| ID      | Alternative                                    | Pros                              | Cons                                          | Decision                        |
|---------|------------------------------------------------|-----------------------------------|-----------------------------------------------|---------------------------------|
| ALT-001 | Support both old and new config patterns       | No breaking change                | Adds complexity, perpetuates anti-pattern     | Rejected: Clean break preferred |
| ALT-002 | Nested structure: `gateway.reference.name`     | More explicit separation          | More verbose, less common in Helm charts      | Rejected: Flat structure simpler|
| ALT-003 | Configurable suffix instead of hardcoded `-http` | More flexible                   | Adds unnecessary configuration surface        | Rejected: Implementation detail |
| ALT-004 | Auto-generate ReferenceGrant for cross-namespace | Automatic setup                | Platform team responsibility, RBAC complexity | Rejected: Document only approach|

## Affected Files

| ID       | File Path                              | Changes                                                          |
|----------|----------------------------------------|------------------------------------------------------------------|
| FILE-001 | charts/values.yaml                     | Replace `gateway.enabled` with `name`, `namespace`, `create`     |
| FILE-002 | charts/templates/gateway.yaml          | Conditional on `create`, apply `-http` suffix to name            |
| FILE-003 | charts/templates/httproute.yaml        | Update condition, parentRef logic, cross-namespace support       |
| FILE-004 | charts/templates/_helpers.tpl          | Update validation logic (if applicable)                          |
| FILE-005 | tests/unit/helm/gateway-api.test.ts    | Update all tests, add reference mode tests, verify suffix        |
| FILE-006 | docs/setup/kubernetes-setup.md         | Rewrite Gateway API section, update config table                 |
| FILE-007 | examples/gateway-api/README.md         | Add ReferenceGrant docs, explain modes                           |
| FILE-008 | examples/gateway-api/basic-http.yaml   | Show reference pattern with platform Gateway YAML               |
| FILE-009 | examples/gateway-api/https-cert-manager.yaml | Update for reference pattern                               |
| FILE-010 | examples/gateway-api/external-dns.yaml | Update for creation mode example                                 |

## Assumptions

| ID             | Assumption                                                                  | Rationale                                                    |
|----------------|-----------------------------------------------------------------------------|--------------------------------------------------------------|
| ASSUMPTION-001 | Platform teams are willing to create shared Gateway resources              | Standard Gateway API practice, industry norm                 |
| ASSUMPTION-002 | Gateway API v1 is available in target Kubernetes clusters (1.26+)          | Gateway API is stable and widely adopted                     |
| ASSUMPTION-003 | `-http` suffix is acceptable naming convention                             | Follows common patterns (nginx-ingress, istio-gateway, etc.) |
| ASSUMPTION-004 | Users prefer clear validation errors over backward compatibility           | Better UX to fail fast with guidance than silent surprises   |
| ASSUMPTION-005 | Cross-namespace Gateway usage is uncommon but should be supported          | Edge case but valid Gateway API feature                      |

## Related Specifications

- [Gateway API v1 Specification](https://gateway-api.sigs.k8s.io/)
- [Gateway API Best Practices](https://gateway-api.sigs.k8s.io/guides/best-practices/)
- [Original PR #286: Add Gateway API Support](https://github.com/vfarcic/dot-ai/pull/286)
- [Issue #281: Kubernetes Gateway API Support PRD](https://github.com/vfarcic/dot-ai/issues/281)

## Work Log

_No entries yet_
