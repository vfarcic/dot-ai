# PRD #587: GitHub Copilot Provider with OAuth Device Flow

**Status**: Open
**Created**: 2026-05-25
**GitHub Issue**: [#587](https://github.com/vfarcic/dot-ai/issues/587)
**Priority**: Medium
**Complexity**: Medium
**Contributor**: [@Amoenus](https://github.com/Amoenus)

---

## Problem Statement

The removal of the `host` provider eliminated the only zero-API-key path for running
dot-ai. Users with GitHub Copilot subscriptions — an extremely common developer
subscription — have no native way to use dot-ai against their existing subscription.
The `custom` provider can technically point at `api.githubcopilot.com`, but it
requires a long-lived static token that doesn't exist in Copilot's standard
subscription flow.

### Current Pain Points

**1. No Copilot provider**

GitHub Copilot is an OpenAI-compatible API at `https://api.githubcopilot.com`. The
existing `openai`/`custom` provider almost works, but the Copilot API requires a
`github_pat_*` token with `copilot` scope or an OAuth token from GitHub's device
flow. There is no env var or helm value that guides users toward this configuration,
and the "right" model names differ from standard OpenAI (Copilot exposes both Claude
and GPT-family models).

**2. No device flow bootstrap**

Copilot's programmatic API does not issue permanent static API keys for individual
subscriptions. Tokens are short-lived OAuth tokens. In a Kubernetes deployment where
you cannot open an interactive browser session at deploy time, there is currently no
viable path to authorize dot-ai against Copilot without external token rotation
machinery (cron jobs, secret stores, etc.).

**3. Kubernetes-specific token management problem**

Static token injection via Kubernetes Secrets requires either:
- A CI/CD pipeline that rotates the secret on token expiry
- A Bitwarden/Vault operator that pulls fresh tokens
- An external sidecar that handles the OAuth flow

All of these shift the burden to the operator and require infrastructure that defeats
the "single Helm command" deployment story.

### User Impact

- Developers with Copilot Individual/Business subscriptions cannot use their existing
  subscription — they must sign up for a separate Anthropic/OpenAI account
- Self-hosted Kubernetes deployments have no workable token lifecycle story for
  Copilot without external tooling
- The `host` provider removal (which was the previous "no separate API key" option)
  left this segment of users without a supported path

---

## Solution Overview

Two-phase implementation:

**Phase 1 — `copilot` provider (static PAT)**
A first-class `copilot` provider in `ai-provider-factory.ts` that:
- Uses `createOpenAI()` from `@ai-sdk/openai` (already a dependency — no new packages)
- Points at `https://api.githubcopilot.com`
- Sets `Authorization: Bearer <token>` from `GITHUB_COPILOT_TOKEN` env var
- Ships with a curated default model mapping (`claude-sonnet-4-6` and `gpt-4o` are
  both available via the Copilot API)
- Exposes Helm values consistent with other providers (`secrets.copilot.apiKey`)

**Phase 2 — OAuth device flow bootstrap**
When `AI_PROVIDER=copilot` and no token env var is set, run GitHub's
[device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
at startup:
- Request a device code from `https://github.com/login/device/code`
- Log the user code and verification URL prominently (stdout + structured log)
- Poll `https://github.com/login/oauth/access_token` until authorization completes
- Persist the token to a configurable path (`COPILOT_TOKEN_CACHE_PATH`, default
  `./tmp/copilot-token.json`) for reuse across restarts
- If a cached token exists and is not expired, skip the flow entirely
- Surface clear error messaging when the device code expires without authorization

---

## User Stories

### Primary User Stories

1. **As a GitHub Copilot subscriber**, I want to use my existing subscription as the
   AI backend for dot-ai so I don't need to sign up for a separate API service.
   - **Acceptance**: Setting `AI_PROVIDER=copilot` and `GITHUB_COPILOT_TOKEN=<pat>`
     results in a working dot-ai instance backed by the Copilot API.

2. **As a Kubernetes operator**, I want dot-ai to handle its own Copilot
   authorization on first boot so I don't need external token rotation machinery.
   - **Acceptance**: Deploying with `AI_PROVIDER=copilot` and no token configured
     causes the pod to log a device code + URL. Authorizing from any browser
     completes the flow and the pod continues startup.

3. **As a developer evaluating dot-ai**, I want to try it with my Copilot
   subscription without providing a credit card or creating a new API account.
   - **Acceptance**: The docs/quickstart covers Copilot as a supported provider
     alongside Anthropic and OpenAI.

### Secondary User Stories

4. **As an operator**, I want the Copilot token persisted across pod restarts so
   authorization is a one-time action per deployment.
   - **Acceptance**: Token cached to a volume-mounted path. Pod restarts within
     token validity use the cached token without re-running the device flow.

5. **As an operator**, I want the device flow to be skippable via a static PAT so I
   can use Bitwarden/Vault secrets management if I prefer.
   - **Acceptance**: `GITHUB_COPILOT_TOKEN` env var fully bypasses the device flow.
     Both paths produce an identical runtime experience.

6. **As a developer**, I want clear log output when the device flow is waiting so I
   know the pod hasn't crashed.
   - **Acceptance**: While polling, the pod logs the remaining time and a reminder of
     the verification URL at a reasonable interval (every 30s).

---

## Technical Approach

### Phase 1: `copilot` Provider

#### Files Changed

**`src/core/ai-provider-factory.ts`**

Add a `copilot` case to the provider switch. API key read from
`GITHUB_COPILOT_TOKEN` (or `COPILOT_API_KEY` as alias). Falls through to
`NoOpAIProvider` if neither is set and device flow is disabled (Phase 1 only).

```typescript
case 'copilot': {
  const token = process.env.GITHUB_COPILOT_TOKEN ?? process.env.COPILOT_API_KEY;
  if (!token) {
    logger.warn('AI_PROVIDER=copilot but no GITHUB_COPILOT_TOKEN set. Falling back to NoOp.');
    return new NoOpAIProvider();
  }
  return new VercelProvider({
    provider: 'copilot',
    apiKey: token,
    baseURL: 'https://api.githubcopilot.com',
    model: process.env.AI_MODEL ?? CURRENT_MODELS.copilot,
  });
}
```

**`src/core/model-config.ts`**

Add Copilot model entry:

```typescript
copilot: 'claude-sonnet-4-6',  // Also available: gpt-4o, o3, claude-opus-4-5
```

**`src/core/providers/vercel-provider.ts`**

Add `copilot` to the `initializeModel()` switch using `createOpenAI()` with
custom `baseURL` and `Authorization` header — identical pattern to the existing
`kimi` provider which also uses `createOpenAICompatible()`:

```typescript
case 'copilot':
  return createOpenAI({
    baseURL: 'https://api.githubcopilot.com',
    apiKey: this.config.apiKey,
    headers: {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Copilot-Integration-Id': 'vscode-chat',
      'Editor-Version': 'dot-ai/1.0',
    },
  })(this.config.model);
```

Note: The `Copilot-Integration-Id` header is required by the Copilot API for
programmatic access. `vscode-chat` is the accepted value for chat completions.

#### Helm Values (`charts/values.yaml`)

```yaml
secrets:
  copilot:
    apiKey: ""          # Set GITHUB_COPILOT_TOKEN directly, or via secretRef
    secretRef:
      name: ""
      key: ""
```

#### No New Dependencies

`@ai-sdk/openai` is already in `package.json`. The Copilot API is fully
OpenAI-compatible. Zero new npm packages required for Phase 1.

---

### Phase 2: Device Flow Bootstrap

#### New File: `src/core/providers/copilot-auth.ts`

Encapsulates the device flow entirely. Uses Node 18+ native `fetch` — no
additional HTTP library required.

**Interface:**

```typescript
export interface CopilotTokenResult {
  accessToken: string;
  expiresAt: Date;
  refreshToken?: string;
}

export async function acquireCopilotToken(opts: {
  clientId: string;       // GitHub OAuth App client ID registered for dot-ai
  cachePath: string;      // File path for token persistence
  logger: Logger;
}): Promise<CopilotTokenResult>
```

**Flow:**

```
1. Check cachePath — if valid (not expired), return cached token
2. POST https://github.com/login/device/code
   { client_id, scope: "copilot" }
3. Log device_code.verification_uri + user_code prominently
4. Poll https://github.com/login/oauth/access_token every interval seconds
   until access_token received or expiry
5. On success: write token + expiry to cachePath, return token
6. On expiry: throw descriptive error with restart instructions
```

**Token Cache Schema (`copilot-token.json`):**

```json
{
  "accessToken": "ghu_...",
  "expiresAt": "2026-05-26T12:00:00Z",
  "acquiredAt": "2026-05-25T12:00:00Z"
}
```

#### Integration into Factory

In `ai-provider-factory.ts`, Phase 2 adds a fallback in the `copilot` case when
no static token is present:

```typescript
case 'copilot': {
  const staticToken = process.env.GITHUB_COPILOT_TOKEN ?? process.env.COPILOT_API_KEY;
  const token = staticToken ?? await acquireCopilotToken({
    clientId: COPILOT_OAUTH_CLIENT_ID,
    cachePath: process.env.COPILOT_TOKEN_CACHE_PATH ?? './tmp/copilot-token.json',
    logger,
  });
  // ... create VercelProvider with token
}
```

Factory must become `async` for Phase 2, or the device flow runs in a separate
init step before factory construction. Prefer a pre-init pattern to avoid
making the synchronous factory async.

#### Kubernetes Deployment Considerations

- Token cache path should map to a PVC or emptyDir volume mount
- Helm chart should expose `copilot.tokenCachePath` value
- Readiness probe should remain unhealthy until device flow completes
  (pod shows `Pending` authorization state, not `CrashLoopBackOff`)
- Liveness probe should not trigger during the device flow polling window
  (configurable timeout, default 5 minutes)

---

## Alternatives Considered

### Use `custom` Provider with Manual Token Management

Users can already set `AI_PROVIDER=custom` and `CUSTOM_LLM_BASE_URL=https://api.githubcopilot.com`.
This works with a static PAT but:
- Requires knowing the undocumented Copilot API headers
- Provides no guidance on the required `Copilot-Integration-Id` header
- No default model mapping for Copilot-available models
- No device flow support

**Rejected**: Too much operator knowledge required, no path to device flow.

### Ship a Separate Token Refresh Sidecar

A sidecar container running the OAuth flow and writing the token to a shared volume.
- Avoids making the main process async
- Cleanly separates concerns

**Rejected for now**: Increases deployment complexity. Phase 1 static PAT is enough
for most users. Device flow in-process is simpler for the initial contribution.
Sidecar approach is valid as a follow-up if the in-process approach proves
problematic.

### Use OpenRouter as Copilot Proxy

OpenRouter supports some of the same models (Claude, GPT-4). Users could use
OpenRouter with a static key instead.

**Rejected**: Introduces a third-party intermediary, has per-token cost, and doesn't
solve the "I already have Copilot" use case.

---

## Implementation Plan

### Phase 1 (Small, mergeable independently)

| Task | Files | Effort |
|------|-------|--------|
| Add `copilot` model entry | `src/core/model-config.ts` | 5 min |
| Add `copilot` case to factory | `src/core/ai-provider-factory.ts` | 15 min |
| Add Copilot provider init in Vercel provider | `src/core/providers/vercel-provider.ts` | 20 min |
| Add Helm values for copilot secret | `charts/values.yaml` | 10 min |
| Write integration test | `tests/integration/` | 60 min |
| Update docs | `docs/` | 30 min |

Estimated total: ~2.5 hours

### Phase 2 (Separate PR, builds on Phase 1)

| Task | Files | Effort |
|------|-------|--------|
| Implement `copilot-auth.ts` device flow | `src/core/providers/copilot-auth.ts` | 3 hours |
| Integrate into factory pre-init | `src/core/ai-provider-factory.ts` | 1 hour |
| Token cache read/write with expiry | `src/core/providers/copilot-auth.ts` | 1 hour |
| Helm values for cache path + probes | `charts/values.yaml` | 30 min |
| Integration tests (mock device flow) | `tests/integration/` | 2 hours |
| Update docs (k8s setup, volume mount) | `docs/` | 1 hour |

Estimated total: ~8.5 hours

### Open Questions for Maintainer

1. **Preferred env var name**: `GITHUB_COPILOT_TOKEN` (explicit) or `COPILOT_API_KEY`
   (matches existing `*_API_KEY` pattern)? Proposal: support both, prefer
   `GITHUB_COPILOT_TOKEN` as primary.

2. **OAuth Client ID**: Device flow requires a registered GitHub OAuth App. Should
   dot-ai register its own app (requires vfarcic to create and maintain it), or
   should users provide their own `COPILOT_OAUTH_CLIENT_ID`? Recommendation: register
   one for dot-ai for best UX, but expose the env var as an override.

3. **Phase scope**: Implement both phases in one PR or split? Splitting is cleaner
   for review but Phase 1 alone is marginally useful (still needs a PAT). Leaning
   toward splitting.

4. **Factory async migration**: `createFromEnv()` is currently synchronous. Phase 2
   needs async for the device flow. Preferred approach: pre-init helper that runs
   device flow and injects result into env before factory is called, keeping factory
   sync. Alternative: make factory async (broader impact, touches all callers).

---

## Success Metrics

- `AI_PROVIDER=copilot` works end-to-end with a GitHub PAT (Phase 1)
- Device flow completes and pod reaches `Running` state without manual token
  injection (Phase 2)
- Zero new npm dependencies added (Phase 1)
- All existing integration tests continue to pass
- Copilot provider documented in the quickstart and AI model configuration docs

---

## References

- [GitHub Copilot API — Chat Completions](https://docs.github.com/en/copilot/using-github-copilot/using-claude-sonnet-in-github-copilot)
- [GitHub OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
- [Vercel AI SDK — OpenAI Provider](https://sdk.vercel.ai/providers/ai-sdk-providers/openai)
- [Existing `kimi` provider pattern](../src/core/providers/vercel-provider.ts) — closest analogue
- [PRD #176 — Embedding Architecture](./176-embedding-architecture-standardization.md) — provider pattern reference
