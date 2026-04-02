## PRD: MCP Client Outbound Authentication (v4.0 — Shipped)

> **Status**: Implemented and shipped in dot-ai v1.15.0 (2026-04-01).
> Implementation: PR #417. Original proposal: PR #415 (closed), PR #416 (this doc).
> Validated in production on a K3s cluster running upstream `dot-ai-stack:0.82.0` with OAuth `client_credentials` auth to Context Forge MCP server (88 tools discovered).

---

**Priority**: High
**Depends on**: [PRD #380 - MCP OAuth Authentication & User Identity](https://github.com/vfarcic/dot-ai/blob/main/prds/done/380-gateway-auth-rbac.md)

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Proposed Solution](#proposed-solution)
- [Identity Chain](#identity-chain)
- [Authentication Modes](#authentication-modes)
- [Helm Configuration](#helm-configuration)
- [Key Design Principles](#key-design-principles)
- [Milestone Summary](#milestone-summary)
- [Milestones](#milestones)
- [Technical Scope](#technical-scope--modified-modules)
- [Security Considerations](#security-considerations)
- [Alternatives Considered](#alternatives-considered)
- [References](#references)
- [Decision Log](#decision-log)

---

## Problem Statement

dot-ai's MCP client cannot authenticate to MCP servers that require authorization. PR #410 implemented MCP client integration with an explicit "in-cluster trust model" — all outbound connections are unauthenticated. This works when MCP servers run in the same cluster without auth, but breaks for any deployment following zero-trust principles.

- `parseMcpServerConfig()` returns only `name`, `endpoint`, `attachTo`, and `timeout` — no auth fields
- `connectAndDiscover()` creates `StreamableHTTPClientTransport` with only `reconnectionOptions` — neither `authProvider` nor `requestInit` is passed
- The MCP SDK (`@modelcontextprotocol/sdk ^1.27.1`) already supports both via `StreamableHTTPClientTransportOptions`
- MCP servers requiring authentication cannot be used

dot-ai enforces security-by-design for its own inbound connections — OAuth via Dex, RBAC enforcement (#392), namespace-level impersonation (#401). The same principle should apply outbound when dot-ai acts as an MCP client.

## Proposed Solution

Use the MCP SDK's built-in authentication support in `StreamableHTTPClientTransport`. The SDK provides two mechanisms that cover all deployment scenarios without inventing custom auth plumbing:

### 1. `authProvider` — MCP-Spec-Compliant Servers (Primary)

For MCP servers that implement the [MCP Authorization spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) — including other dot-ai instances — the SDK's `OAuthClientProvider` interface handles authentication:

```typescript
// Simple case: static token (service account, API key)
// StaticTokenAuthProvider implements the full OAuthClientProvider interface
const authProvider: OAuthClientProvider = new StaticTokenAuthProvider(process.env.MCP_AUTH_TOKEN);

// Full OAuth case: client_credentials grant for server-to-server auth
// SDK discovers auth server via RFC 9728 metadata from the MCP endpoint
```

### 2. `requestInit.headers` — Non-Spec Servers (Fallback)

For MCP servers that don't implement the MCP Authorization spec, static headers via `requestInit`:

```typescript
const transport = new StreamableHTTPClientTransport(
  new URL(config.endpoint),
  {
    requestInit: {
      headers: config.headers, // e.g., { "X-API-Key": "abc123" }
    },
  }
);
```

### Architecture

```text
                                     MCP Authorization Spec
                                    ┌──────────────────────────────┐
                                    │                              │
  User ──► dot-ai ──► MCP Client ──┤  authProvider (OAuth)        │──► MCP Server (spec-compliant)
           (PRD #380)  Manager      │  - client_credentials grant  │    e.g., another dot-ai instance
           OAuth/Dex               │  - RFC 9728 discovery        │
                                    │  - automatic refresh         │
                                    │                              │
                                    ├──────────────────────────────┤
                                    │                              │
                                    │  authProvider (static)       │──► MCP Server (API key / JWT)
                                    │  - StaticTokenAuthProvider   │    e.g., service account tokens
                                    │  - implements OAuthClient    │
                                    ├──────────────────────────────┤
                                    │                              │
                                    │  requestInit.headers         │──► MCP Server (custom auth)
                                    │  - from K8s Secret env var   │    e.g., legacy systems
                                    │                              │
                                    ├──────────────────────────────┤
                                    │                              │
                                    │  (no auth)                   │──► MCP Server (in-cluster trust)
                                    │  - current behavior          │    e.g., same-cluster, no auth
                                    │                              │
                                    └──────────────────────────────┘
```

## Identity Chain

This PRD fills the weakest link in dot-ai's identity chain:

```text
User ──[OAuth/Dex]──► dot-ai ──[SubjectAccessReview]──► Tool Check ──[Impersonation]──► K8s API
                      (PRD #380)   (PRD #392)                          (PRD #401)
                          │
                          └──[MCP Client Auth (this PRD)]──► MCP Server
```

| Layer | Direction | Mechanism | PRD | Status |
|-------|-----------|-----------|-----|--------|
| Authentication | Inbound (user → dot-ai) | OAuth via Dex, MCP Authorization spec | #380 | Complete |
| Tool-level authz | Internal | SubjectAccessReview | #392 | Complete |
| Namespace-level authz | Outbound (dot-ai → K8s API) | User impersonation (`--as`) | #401 | Draft |
| MCP client auth | Outbound (dot-ai → MCP servers) | `authProvider` / `requestInit` | **#414** | **Complete (v1.15.0)** |

## Authentication Modes

| Target Server | Auth Mechanism | Config | When to Use |
|---------------|---------------|--------|-------------|
| MCP-spec-compliant (OAuth) | `authProvider` with `client_credentials` | `mcpServers.*.auth.oauth` | Another dot-ai instance, or any server implementing MCP Authorization spec |
| Static token / API key | `authProvider` with `StaticTokenAuthProvider` | `mcpServers.*.auth.token.existingSecret` | MCP servers with service account JWTs, API key auth |
| Custom headers | `requestInit.headers` | `mcpServers.*.auth.headers.existingSecret` | Legacy systems, non-standard auth schemes |
| No auth (in-cluster trust) | None | No auth config | Same-cluster trust model (backward compatible) |

## Helm Configuration

The implementation exclusively uses `existingSecret` references. Inline tokens in Helm values are intentionally not supported — tokens in values files risk being committed to git and appear in Helm release metadata.

### Environment Variable Name Mapping

Server names are auto-mapped to environment variable names: uppercase, replace non-alphanumeric characters with underscores, collapse consecutive underscores.

| Auth Type | Server Name | Env Var Name |
|-----------|-------------|-------------|
| Token | `context-forge` | `MCP_AUTH_CONTEXT_FORGE` |
| Headers | `legacy-server` | `MCP_HEADERS_LEGACY_SERVER` |
| OAuth secret | `context-forge` | `MCP_OAUTH_SECRET_CONTEXT_FORGE` |

### Pattern 1: Static Bearer Token

```yaml
mcpServers:
  context-forge:
    enabled: true
    endpoint: "http://context-forge.ai-ops.svc:4444/mcp"
    attachTo:
      - remediate
      - query
    auth:
      token:
        existingSecret:
          name: context-forge-auth
          key: bearer-token
```

### Pattern 2: Custom Auth Headers

```yaml
mcpServers:
  legacy-server:
    enabled: true
    endpoint: "http://legacy-mcp.tools.svc:8080/mcp"
    attachTo:
      - operate
    auth:
      headers:
        existingSecret:
          name: legacy-auth
          key: auth-headers    # JSON: {"X-API-Key":"abc123"}
```

### Pattern 3: OAuth client_credentials

```yaml
mcpServers:
  upstream-dot-ai:
    enabled: true
    endpoint: "https://dot-ai.example.com/mcp"
    attachTo:
      - query
      - remediate
    auth:
      oauth:
        clientId: "dot-ai-downstream"
        scope: "mcp:tools"
        existingSecret:
          name: upstream-oauth-creds
          key: client-secret
```

**Key design point**: Auth credentials are stored in Kubernetes **Secrets** (not the ConfigMap). The ConfigMap holds only routing config (`name`, `endpoint`, `attachTo`). The chart auto-injects env vars from `existingSecret` references — no manual `extraEnv` needed.

## Key Design Principles

1. **MCP spec compliance** — use the SDK's `OAuthClientProvider` interface, not custom auth plumbing
2. **Security by design** — credentials in Kubernetes Secrets, never ConfigMaps
3. **Backward compatible** — no auth config = no auth = current behavior (MCP spec states authorization is OPTIONAL)
4. **Standard mechanisms only** — `authProvider` and `requestInit.headers` are SDK-native
5. **Forward-compatible with per-user identity** — when #401 delivers user impersonation, `authProvider` could use the user's OAuth context
6. **Token privilege restriction** — per MCP spec, servers MUST NOT pass through client tokens to upstream APIs
7. **Fail-fast on misconfiguration** — configured auth with absent or empty credentials is a hard startup failure, not silent degradation to unauthenticated
8. **Observable by default** — auth state per MCP server visible in startup logs without enabling debug mode

## Milestone Summary

| Milestone | Scope | Status |
|-----------|-------|--------|
| **M1** | Static `authProvider` — `StaticTokenAuthProvider` wrapping `OAuthClientProvider` | **Complete** |
| **M2** | `requestInit.headers` fallback — custom HTTP headers for non-spec servers | **Complete** |
| **M3** | Helm chart — `existingSecret` references, env var injection | **Complete** |
| **M4** | OAuth `client_credentials` — full OAuth flow with RFC 9728 discovery | **Complete** |
| **M5** | Tests, observability, docs — integration tests, auth status logging | **Complete** |

---

## Milestones

### M1: Static `authProvider` for Token-Based Auth ✅
Support static Bearer tokens via `StaticTokenAuthProvider` (wrapping `OAuthClientProvider`).

- [x] Add `auth` configuration to `McpServerConfig` interface (`McpServerAuthConfig`)
- [x] Create `StaticTokenAuthProvider` implementing `OAuthClientProvider`
- [x] Validate mutual exclusivity of auth modes
- [x] Pass `authProvider` to `StreamableHTTPClientTransport`
- [x] No auth config = current behavior exactly

### M2: `requestInit.headers` Fallback for Non-Spec Servers ✅
Support custom HTTP headers for MCP servers that don't use standard Bearer auth.

- [x] Read headers from `MCP_HEADERS_<SERVER_NAME>` env vars (JSON-encoded)
- [x] Pass `requestInit: { headers }` to transport
- [x] Runtime validation: fail fast on malformed config
- [x] **Security Invariant:** Empty or missing auth credentials is a hard startup failure

### M3: Helm Chart — Auth Secrets & Configuration ✅
Helm chart support for externally-managed auth secrets via `existingSecret` references.

- [x] `auth.token.existingSecret`, `auth.headers.existingSecret`, `auth.oauth` in values schema
- [x] Auto-derived `MCP_AUTH_*` / `MCP_HEADERS_*` / `MCP_OAUTH_SECRET_*` env var injection from Secrets
- [x] Backward-compatible: no auth = no change

### M4: OAuth `authProvider` for MCP-Spec-Compliant Servers ✅
Full OAuth `client_credentials` flow via `OAuthClientProvider`.

- [x] OAuth flow: client_credentials grant with RFC 9728 discovery
- [x] Token storage: in-memory with automatic refresh
- [x] Implement `invalidateCredentials` to clear cached tokens on auth failure
- [x] Support optional `scope` parameter
- [x] `clientSecretEnvVar` auto-derived from server name (e.g., `MCP_OAUTH_SECRET_CONTEXT_FORGE`)

### M5: Integration Tests, Observability & Documentation ✅
- [x] Auth status logging at startup
- [x] Unit tests: auth config parsing, transport creation (`tests/unit/core/mcp-client-auth.test.ts`)
- [x] Integration tests: auth/no-auth paths (`tests/integration/tools/mcp-client-auth.test.ts`)
- [x] Helm template tests (`tests/unit/helm/mcp-auth.test.ts`)

## Technical Scope — Modified Modules

| Location | File | What Changed |
|----------|------|-------------|
| TypeScript interface | `src/core/mcp-client-types.ts` | Added `McpServerAuthConfig`, `McpOAuthConfig` to `McpServerConfig` |
| Client manager | `src/core/mcp-client-manager.ts` | Auth config parsing, `StaticTokenAuthProvider`, OAuth `client_credentials`, `requestInit.headers` |
| Server entry | `src/mcp/server.ts` | MCP discovery fail-fast (`process.exit(1)`) |
| Helm helpers | `charts/templates/_helpers.tpl` | Auth env var name derivation, Secret→env injection |
| Helm deployment | `charts/templates/deployment.yaml` | `MCP_AUTH_*` / `MCP_HEADERS_*` / `MCP_OAUTH_SECRET_*` env var injection |
| Helm values | `charts/values.yaml` | `auth` schema in `mcpServers` with examples |
| Tests | `tests/unit/core/mcp-client-auth.test.ts` | Auth config parsing, transport creation |
| Tests | `tests/integration/tools/mcp-client-auth.test.ts` | OAuth token lifecycle |
| Tests | `tests/unit/helm/mcp-auth.test.ts` | Helm template rendering with auth config |

## Security Considerations

- **Token storage**: K8s Secrets (encrypted at rest), never ConfigMaps or version control
- **Token privilege restriction**: Each hop requires its own token per MCP spec
- **Defense in depth**: Network (Cilium) → Application auth (this PRD) → Tool RBAC (#392) → Namespace (#401)
- **OAuth security**: PKCE applies to `authorization_code` flows only (not `client_credentials`). Tokens stored in-memory only.
- **Sidecar exposure**: All containers in the same pod can read `MCP_AUTH_*` env vars — inherent to the env-var injection pattern
- **Fail-fast on missing credentials**: Configured auth with absent credentials is a hard failure, not silent degradation

## Alternatives Considered

| Alternative | Why Not |
|-------------|---------|
| Custom `headers` field in ConfigMap | Tokens in ConfigMaps are unencrypted, visible via `kubectl describe` |
| Custom auth middleware | Reinvents what the MCP SDK already provides |
| Disable auth on target servers | Violates defense-in-depth and zero-trust |
| Proxy/sidecar injection (e.g., Envoy) | Operational complexity for a problem the SDK already solves |
| Inline tokens in Helm values | Risk of git commit; visible in Helm release metadata |

## References

### MCP Specification
- [MCP Authorization Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP SDK OAuthClientProvider interface](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/client/auth.ts)

### Finalized RFCs (normative)
- [RFC 8414 — OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/rfc8414/)
- [RFC 7591 — OAuth 2.0 Dynamic Client Registration](https://datatracker.ietf.org/doc/rfc7591/)
- [RFC 9728 — OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/rfc9728/)
- [RFC 6750 — OAuth 2.0 Bearer Token Usage](https://datatracker.ietf.org/doc/rfc6750/)
- [RFC 8707 — Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/rfc8707/)
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/rfc7636/)
- [RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens](https://datatracker.ietf.org/doc/rfc9068/)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/rfc9700/)

### Kubernetes
- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Lead with `authProvider`, not `requestInit.headers` | MCP SDK's native auth interface. Standards-compliant. |
| 2026-03-26 | Use `OAuthClientProvider` for static tokens (not just OAuth) | `StaticTokenAuthProvider` wraps the full interface — follows SDK pattern |
| 2026-03-26 | Keep `requestInit.headers` as fallback | Some servers need custom headers. SDK supports both. |
| 2026-03-26 | Auth credentials in Secrets, never ConfigMap | ConfigMaps are unencrypted, visible via `kubectl describe`. |
| 2026-03-26 | `existingSecret` only — no chart-managed secrets | Tokens in Helm values risk git commits. |
| 2026-03-26 | `client_credentials` does not use PKCE | PKCE is `authorization_code` only. |
| 2026-04-01 | v1.15.0 shipped — all milestones complete | Implementation via PR #417. PRD doc updated to reflect shipped state. |
| 2026-04-01 | `clientSecretEnvVar` auto-derived from server name | Chart auto-computes env var name (e.g., `MCP_OAUTH_SECRET_CONTEXT_FORGE` from server name `context-forge`), no manual mapping needed. |
