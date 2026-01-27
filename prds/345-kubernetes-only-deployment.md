# PRD #345: Kubernetes-Only Deployment

**GitHub Issue**: [#345](https://github.com/vfarcic/dot-ai/issues/345)
**Status**: Not Started
**Priority**: Medium
**Created**: 2025-01-25

---

## Problem Statement

dot-ai currently supports multiple deployment mechanisms (Docker Compose, local development, etc.) but is fundamentally useless without a Kubernetes cluster. Maintaining these alternative deployment paths creates:
1. Code complexity for unused paths
2. Documentation maintenance burden
3. Confusion about the "right" way to deploy

---

## Solution Overview

Remove non-Kubernetes deployment options and establish Kubernetes as the only supported deployment model.

---

## Scope

### In Scope

- Remove Docker Compose configuration and related code
- Remove local/standalone deployment code paths (if any)
- Remove stdio MCP transport (keep HTTP only)
- Update documentation to reflect Kubernetes-only deployment
- Update README with clear Kubernetes prerequisites
- Clean up any environment handling for non-K8s scenarios

### Out of Scope

- Plugin architecture changes (covered by #342, #343)
- New Kubernetes deployment features
- Helm chart enhancements (unless needed for cleanup)

---

## Milestones

- [ ] **M1: Identify non-K8s code and config**
  - Audit codebase for Docker Compose files
  - Identify code paths that assume non-K8s deployment
  - Identify stdio transport usage (`StdioServerTransport`, `TRANSPORT_TYPE`)
  - List documentation referencing alternative deployments

- [ ] **M2: Remove non-K8s deployment code**
  - Delete Docker Compose files
  - Remove code paths for non-K8s scenarios
  - Clean up environment variable handling

- [ ] **M3: Remove stdio transport**
  - Remove `StdioServerTransport` import and code from `src/interfaces/mcp.ts`
  - Remove stdio transport handling from `src/mcp/server.ts`
  - Make HTTP the only transport (remove `TRANSPORT_TYPE` env var, hardcode HTTP)
  - Update any documentation referencing stdio transport

- [ ] **M4: Update documentation**
  - Update README with Kubernetes prerequisites
  - Remove/update docs referencing alternative deployments
  - Ensure getting started guide is Kubernetes-focused

- [ ] **M5: Verify and test**
  - Ensure Kubernetes deployment still works
  - No broken references to removed files
  - Integration tests pass

---

## Success Criteria

1. **No non-K8s deployment options**: Docker Compose and local deployment files removed
2. **HTTP-only transport**: stdio transport removed, HTTP is the only MCP transport
3. **Documentation clarity**: Clear that Kubernetes is required
4. **No broken functionality**: Kubernetes deployment works as before
5. **Clean codebase**: No dead code for non-K8s paths

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Users relying on Docker Compose | Document in changelog; provide migration path if needed |
| Local development workflow impacted | Ensure Kind/minikube workflow documented |
| Users expecting stdio transport for local MCP clients | Document that K8s cluster is required; use port-forward for local testing |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-01-25 | Kubernetes-only | dot-ai is useless without K8s; simplifies maintenance |
| 2026-01-27 | Remove stdio transport | K8s uses HTTP transport; stdio only used for local MCP clients which require K8s anyway; simplifies codebase |
