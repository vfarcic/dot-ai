## PRD: MCP Client Outbound Authentication (v3.0)

> **Context**: This PRD was developed alongside PR #415 (now closed) which implemented Milestones 1-4. Posting here for review and discussion before resubmitting. This PRD has been through a 4-reviewer expert panel (security architecture, MCP SDK/TypeScript, Helm/K8s patterns, and platform engineering).

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
// (clientMetadata, tokens, saveTokens, redirectToAuthorization, saveCodeVerifier,
// codeVerifier) while returning a fixed token from tokens().
const authProvider: OAuthClientProvider = new StaticTokenAuthProvider(process.env.MCP_AUTH_TOKEN);

// Full OAuth case: MCP-spec-compliant servers
const authProvider: OAuthClientProvider = {
  // Full OAuth 2.1 flow: 401 challenge → resource metadata discovery →
  // authorization server discovery → token exchange → automatic refresh
  // clientMetadata, tokens, saveTokens, redirectToAuthorization,
  // saveCodeVerifier, codeVerifier all required by the interface
  // ...
};
```

The SDK exports `OAuthClientProvider` as the auth provider interface. Implementations must satisfy all required methods: `clientMetadata`, `tokens()`, `saveTokens()`, `redirectToAuthorization()`, `saveCodeVerifier()`, and `codeVerifier()`. For static token use cases, a `StaticTokenAuthProvider` wrapper implements the full interface while returning a fixed token.

Since PRD #380 implemented the MCP Authorization spec for inbound auth via Dex, dot-ai already has the OAuth infrastructure. The same `OAuthClientProvider` approach can be used outbound — dot-ai authenticates to a target MCP server using the standard OAuth flow, not custom header injection.

### 2. `requestInit.headers` — Non-Spec Servers (Fallback)

For MCP servers that don't implement the MCP Authorization spec (service-to-service JWT auth, legacy systems, custom auth schemes), static headers via `requestInit` provide a fallback:

```typescript
const transport = new StreamableHTTPClientTransport(
  new URL(config.endpoint),
  {
    requestInit: {
      headers: config.headers, // e.g., { Authorization: "Bearer <token>" }
    },
    reconnectionOptions: { ... },
  }
);
```

Headers should come from Kubernetes Secrets (not ConfigMaps or Helm values) to keep tokens out of version control and unencrypted stores.

### Architecture

```text
                                     MCP Authorization Spec
                                    ┌──────────────────────────────┐
                                    │                              │
  User ──► dot-ai ──► MCP Client ──┤  authProvider (OAuth)        │──► MCP Server (spec-compliant)
           (PRD #380)  Manager      │  - OAuthClientProvider       │    e.g., another dot-ai instance
           OAuth/Dex               │  - 401 → token exchange      │
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
                                    │  - { Authorization: "..." }  │    e.g., legacy systems
                                    │  - from K8s Secret           │
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
                          └──[??? currently unauthenticated]──► MCP Server
                              ▲
                              │
                           This PRD fills this gap
```

| Layer | Direction | Mechanism | PRD | Status |
|-------|-----------|-----------|-----|--------|
| Authentication | Inbound (user → dot-ai) | OAuth via Dex, MCP Authorization spec | #380 | Complete |
| Tool-level authz | Internal | SubjectAccessReview | #392 | Complete |
| Namespace-level authz | Outbound (dot-ai → K8s API) | User impersonation (`--as`) | #401 | Draft |
| MCP client auth | Outbound (dot-ai → MCP servers) | `authProvider` / `requestInit` | This PRD | Proposed |

## Authentication Modes

| Target Server | Auth Mechanism | Config | When to Use |
|---------------|---------------|--------|-------------|
| MCP-spec-compliant (OAuth) | `authProvider` with `OAuthClientProvider` | `mcpServers.*.auth.oauth` | Another dot-ai instance, or any server implementing MCP Authorization spec |
| Static token / API key | `authProvider` with `StaticTokenAuthProvider` | `mcpServers.*.auth.existingSecret` | MCP servers with service account JWTs, API key auth |
| Custom headers | `requestInit.headers` | `mcpServers.*.auth.headers` (from Secret) | Legacy systems, non-standard auth schemes, multiple custom headers |
| No auth (in-cluster trust) | None | No auth config | Same-cluster trust model (current behavior) |

## Helm Configuration

The implementation exclusively uses `existingSecret` references. Inline tokens in Helm values (chart-managed secrets) are intentionally not supported — tokens in values files risk being committed to git and appear in Helm release metadata, violating security-by-design.

### Pattern 1: Existing Secret Reference (Static Token / Production / GitOps)

```yaml
mcpServers:
  my-mcp-server:
    enabled: true
    endpoint: "http://my-mcp-server.namespace.svc:8080/mcp"
    attachTo:
      - remediate
      - query
    auth:
      # Reference existing Secret (for Vault/ESO, SealedSecrets, SOPS)
      existingSecret:
        name: my-mcp-auth-secret
        key: token    # Secret key containing the Bearer token string
```

### Pattern 2: OAuth (MCP-Spec-Compliant Servers)

```yaml
mcpServers:
  another-dotai:
    enabled: true
    endpoint: "https://other-dotai.example.com/mcp"
    attachTo:
      - query
    auth:
      oauth:
        clientId: "dot-ai-client"
        audience: "https://other-dotai.example.com"  # Optional: RFC 8707 resource indicator
        clientSecret:
          existingSecret:
            name: dotai-oauth-client
            key: client-secret
```

### TLS / Custom CA Bundle

For cross-cluster OAuth or MCP servers behind private CAs:

```yaml
mcpServers:
  cross-cluster-mcp:
    enabled: true
    endpoint: "https://mcp.internal.corp:8443/mcp"
    attachTo:
      - query
    auth:
      existingSecret:
        name: cross-cluster-token
        key: token
      tls:
        caBundle:
          existingSecret:
            name: internal-ca-cert
            key: ca.crt
```

**Key design point**: Auth credentials are stored in Kubernetes **Secrets** (not the ConfigMap). The ConfigMap continues to hold only routing config (`name`, `endpoint`, `attachTo`).

### Environment Variable Name Mapping

Server names in `mcpServers` are mapped to environment variable names: convert to uppercase, then replace any character that is not `A-Z` or `0-9` (including hyphens, dots, slashes, and spaces) with underscores. Consecutive underscores are collapsed to a single underscore.

| Server Name | Token Env Var | Headers Env Var |
|-------------|--------------|-----------------|
| `my-mcp-server` | `MCP_AUTH_MY_MCP_SERVER` | `MCP_HEADERS_MY_MCP_SERVER` |
| `another-dotai` | `MCP_AUTH_ANOTHER_DOTAI` | `MCP_HEADERS_ANOTHER_DOTAI` |

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

| Milestone | Scope | Key Deliverable |
|-----------|-------|-----------------|
| **M1** | Static `authProvider` | `StaticTokenAuthProvider` wrapping `OAuthClientProvider` for Bearer tokens from K8s Secrets |
| **M2** | `requestInit.headers` fallback | Custom HTTP headers for non-spec servers; fail-fast on missing credentials |
| **M3** | Helm chart configuration | `existingSecret` references, env var injection, optional TLS CA bundle |
| **M4** | OAuth `client_credentials` | Full OAuth flow reusing #380 infrastructure; `invalidateCredentials`, discovery caching, RFC 8707 `audience` |
| **M5** | Tests, observability, docs | Auth status logging, integration tests, operator documentation |

---

## Milestones

### M1: Static `authProvider` for Token-Based Auth
Support static Bearer tokens via `StaticTokenAuthProvider` (wrapping `OAuthClientProvider`). Covers the most common enterprise use case — service account tokens.

- [ ] Add `auth` configuration to `McpServerConfig` interface
- [ ] Create `StaticTokenAuthProvider` implementing `OAuthClientProvider`
- [ ] Validate mutual exclusivity: `existingSecret` and `oauth` reject configs specifying both
- [ ] Pass `authProvider` to `StreamableHTTPClientTransport`
- [ ] No auth config = current behavior exactly

### M2: `requestInit.headers` Fallback for Non-Spec Servers
Support custom HTTP headers for MCP servers that don't use standard Bearer auth.

- [ ] Read headers from `MCP_HEADERS_<SERVER_NAME>` env vars (JSON-encoded)
- [ ] Pass `requestInit: { headers }` to transport
- [ ] Runtime validation: `Record<string, string>`, fail fast on malformed config

- [ ] **Security Invariant:** Empty or missing auth credentials MUST be a hard startup failure, not a silent degradation to unauthenticated mode.

### M3: Helm Chart — Auth Secrets & Configuration
Helm chart support for externally-managed auth secrets via `existingSecret` references.

- [ ] `auth.existingSecret` and `auth.oauth` in values schema
- [ ] `MCP_AUTH_*` / `MCP_HEADERS_*` env var injection from Secrets
- [ ] Optional `auth.tls.caBundle.existingSecret` for custom CA certificates
- [ ] Backward-compatible: no auth = no change

### M4: OAuth `authProvider` for MCP-Spec-Compliant Servers
Full OAuth `client_credentials` flow via `OAuthClientProvider`. Reuses existing #380 infrastructure. Note: `client_credentials` does not use PKCE — PKCE applies only to `authorization_code` flows (future #401).

- [ ] OAuth flow: 401 challenge → resource metadata discovery → token exchange
- [ ] Token storage: in-memory with automatic refresh
- [ ] Implement `invalidateCredentials` on both auth providers to clear cached tokens on auth failure
- [ ] Support optional `audience` / `resource` parameter per RFC 8707
- [ ] Implement `saveDiscoveryState` / `discoveryState` to cache RFC 9728 discovery results
- [ ] `codeVerifier()` returns `undefined` for non-PKCE providers

### M5: Integration Tests, Observability & Documentation
- [ ] Auth status logging: startup log per MCP server (e.g., "Authenticated (OAuth)", "Authenticated (Static)", "Unauthenticated")
- [ ] Test fixture: minimal MCP server with auth middleware
- [ ] Integration tests: auth/no-auth paths, invalid token errors
- [ ] Operator documentation for all auth patterns

## Technical Scope — Modified Modules

| Location | File | What Changes |
|----------|------|-------------|
| TypeScript interface | `src/core/mcp-client-types.ts` | Add `auth` config to `McpServerConfig` |
| Client manager | `src/core/mcp-client-manager.ts` | Read auth config, create `OAuthClientProvider`, pass to transport |
| Helm values | `charts/values.yaml` | Add `auth` schema to `mcpServers` |
| Helm template | `charts/templates/secret.yaml` | Add MCP auth Secret (conditional) |
| Helm template | `charts/templates/deployment.yaml` | Inject `MCP_AUTH_*` / `MCP_HEADERS_*` env vars from Secrets |
| Tests | `tests/unit/core/mcp-client-manager.test.ts` | Auth config parsing, transport creation |
| Tests | `tests/unit/helm/mcp-auth.test.ts` | Helm template rendering with auth config |

## Security Considerations

- **Token storage**: K8s Secrets (encrypted at rest), never ConfigMaps or version control
- **Token privilege restriction**: Each hop requires its own token per MCP spec
- **Defense in depth**: Network (Cilium) → Application auth (this PRD) → Tool RBAC (#392) → Namespace (#401)
- **OAuth security**: PKCE applies to `authorization_code` flows only (not `client_credentials`). Tokens stored in-memory only.
- **Sidecar exposure**: All containers in the same pod can read `MCP_AUTH_*` / `MCP_HEADERS_*` env vars — inherent to the env-var injection pattern
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
- [RFC 8707 — Resource Indicators for OAuth 2.0](https://datatracker.ietf.org/doc/rfc8707/) — `resource` parameter now MUST per MCP spec 2025-11-25
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/rfc7636/)
- [RFC 9068 — JWT Profile for OAuth 2.0 Access Tokens](https://datatracker.ietf.org/doc/rfc9068/)
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/rfc9700/) (finalized Jan 2025)

### Draft Specifications (informational alignment)
- [OAuth 2.1 (draft-ietf-oauth-v2-1)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1) — consolidates the above; referenced by MCP spec but still a Working Group Internet-Draft
- [OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document-00)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00) — referenced by MCP spec 2025-11-25

### Kubernetes
- [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-26 | Lead with `authProvider`, not `requestInit.headers` | MCP SDK's native auth interface. Standards-compliant. Enables future OAuth and per-user identity. |
| 2026-03-26 | Use `OAuthClientProvider` for static tokens (not just OAuth) | `StaticTokenAuthProvider` wraps the full `OAuthClientProvider` interface — follows SDK's intended pattern |
| 2026-03-26 | Keep `requestInit.headers` as fallback | Some servers need custom headers (e.g., multiple non-Authorization headers). SDK supports both simultaneously. |
| 2026-03-26 | Auth credentials in Secrets, never ConfigMap | ConfigMaps are unencrypted, visible via `kubectl describe`. Follows #380's Dex secret patterns. |
| 2026-03-26 | `existingSecret` only — no chart-managed secrets | Tokens in Helm values risk git commits and appear in Helm release metadata. |
| 2026-03-26 | `client_credentials` does not use PKCE | PKCE is an `authorization_code` flow concern. Will be addressed in #401 (per-user auth code flows). |
| 2026-03-26 | Reference finalized RFCs, cite OAuth 2.1 as informational | OAuth 2.1 is still a Working Group Internet-Draft (draft-15). Individual behaviors are backed by finalized RFCs (9700, 7636, 8707, 8414, 9728). |
