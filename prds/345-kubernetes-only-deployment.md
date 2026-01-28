# PRD #345: Kubernetes-Only Deployment

**GitHub Issue**: [#345](https://github.com/vfarcic/dot-ai/issues/345)
**Status**: In Progress
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

- [x] **M1: Identify non-K8s code and config**
  - [x] Audit codebase for Docker Compose files
  - [x] Identify code paths that assume non-K8s deployment
  - [x] Identify stdio transport usage (`StdioServerTransport`, `TRANSPORT_TYPE`)
  - [x] List documentation referencing alternative deployments

- [x] **M2: Remove non-K8s deployment code**
  - [x] Delete Docker Compose files
  - [x] Remove code paths for non-K8s scenarios
  - [x] Clean up environment variable handling

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

---

## Implementation Notes

### M1 Audit Results (2026-01-28)

#### Docker Compose Files to Delete
| File | Description |
|------|-------------|
| `docker-compose-dot-ai.yaml` | Main Docker Compose config |
| `.mcp-docker.json` | MCP config for Docker |

#### stdio Transport Code to Remove
| File | Lines | Content |
|------|-------|---------|
| `src/interfaces/mcp.ts` | 9 | `import { StdioServerTransport }` |
| `src/interfaces/mcp.ts` | 79 | `transport?: 'stdio' \| 'http'` type |
| `src/interfaces/mcp.ts` | 126, 435 | `'stdio'` fallback defaults |
| `src/interfaces/mcp.ts` | 445, 451-454 | `startStdioTransport()` method |
| `src/mcp/server.ts` | 144 | `TRANSPORT_TYPE \|\| 'stdio'` |
| `src/mcp/server.ts` | 178-186 | stdio keep-alive logic |
| `Dockerfile` | 45-47 | `ENV TRANSPORT_TYPE=stdio` |
| `server.json` | 15-17 | `"type": "stdio"` |

#### Local Deployment Detection to Simplify
| File | Lines | Content |
|------|-------|---------|
| `src/mcp/server.ts` | 23-41 | `detectDeploymentMethod()` - remove 'docker' and 'local' cases |

#### Documentation to Update/Delete
| File | Action |
|------|--------|
| `docs/setup/docker-setup.md` | DELETE |
| `docs/setup/npx-setup.md` | DELETE |
| `docs/setup/mcp-setup.md` | UPDATE - remove Docker/NPX references |
| `docs/guides/mcp-prompts-guide.md` | UPDATE - remove Docker Compose env reference |
| `docs/dev/development-setup.md` | UPDATE - remove Docker Qdrant reference |
| `docs/CLAUDE.md` | UPDATE - remove Docker anti-patterns |
| `README.md` | UPDATE - Kubernetes-only focus |

#### Config Files to Update
| File | Action |
|------|--------|
| `renovate.json` | Remove docker-compose reference (lines 16-18) |
| `.github/labeler.yml` | Remove docker-compose label rule |
| `assets/project-setup/templates/.github/labeler.yml.hbs` | Remove docker-compose pattern |
| `package.json` | Update test:integration:server script |

### M2 Implementation (2026-01-28)

#### Files Deleted
| File | Reason |
|------|--------|
| `.mcp-node.json` | Local node execution config - non-K8s |
| `.mcp-npx.json` | NPX execution config - non-K8s |

#### Files Modified
| File | Change |
|------|--------|
| `docker-compose-dot-ai.yaml` | Added deprecation notice (kept for blog post references) |
| `src/mcp/server.ts` | Removed `detectDeploymentMethod()` function entirely (deployment method tracking was non-functional - Helm env vars never set); simplified telemetry to not track deployment method; removed unused `existsSync` import |

#### Files Kept
| File | Reason |
|------|--------|
| `.mcp-docker.json` | Docker MCP config - kept for blog post references |
| `.mcp-kubernetes.json` | HTTP transport for K8s deployment |
| `.mcp.json` | HTTP transport for production |
