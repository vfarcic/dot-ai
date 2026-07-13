# PRD #627: Fix GitHub Copilot Provider Token-Type Support

## Status

Draft

## Problem

The GitHub Copilot provider (PRD #587 / PR #591, shipped in v1.20.0) advertises
fine-grained Personal Access Tokens (`github_pat_*`) as a supported credential —
in code (`src/core/providers/copilot-token-exchanger.ts` `SUPPORTED_PREFIXES`)
and in docs (`docs/ai-engine/setup/deployment.md`, `docs/CHANGELOG.md`). In
practice `api.githubcopilot.com` rejects Personal Access Tokens, so any user who
supplies a `github_pat_*` token has **every** AI call fail. The failure surfaces
to the user as an opaque `server error (500). The server encountered an internal
error` with no actionable detail.

This is the likely root cause of issue #617 (default `dot-ai-stack` install on
the Copilot provider, every query returns 500).

## Evidence

Tested directly against the live GitHub endpoints with a fine-grained PAT
(`github_pat_*`):

| Endpoint | Used by | Result |
|---|---|---|
| `POST api.githubcopilot.com/v1/messages` (Claude path) | shipped code | `400 — Personal Access Tokens are not supported for this endpoint` |
| `POST api.githubcopilot.com/chat/completions` (OpenAI path) | shipped code | `400 — Personal Access Tokens are not supported for this endpoint` |
| `GET api.githubcopilot.com/models` | — | `400 — Personal Access Tokens are not supported for this endpoint` |
| `GET api.github.com/copilot_internal/v2/token` (exchange) | PRD #587 original design | `403 — Resource not accessible by personal access token` |

- The **direct-inference** endpoint (what the shipped code uses) rejects PATs
  **categorically by token type**.
- The **exchange** endpoint rejects this PAT with a **permission-style** 403 —
  could be a missing "Copilot Requests" permission on this specific token, or
  categorical. Unconfirmed (the test token's exact permissions are unknown).
- Classic PATs (`ghp_*`) are already rejected by the resolver and, per the 400
  wording, by the API too.

## Unverified

We have **not** confirmed that `gho_` (OAuth) or `ghu_` (GitHub App) tokens
actually work end-to-end — no such token was available to test. The fix and any
user-facing workaround depend on this, so it must be verified before we tell
users which token type to use. Note the PRD #587 "supported token types" table
claimed `github_pat_` worked "per empirical testing," and that claim did not
hold up — so the same table cannot be trusted for `gho_`/`ghu_` without
independent verification.

## Root Cause Hypothesis

PRD #587 was designed around a token-exchange flow (`gho_*` →
`api.github.com/copilot_internal/v2/token` → short-lived token →
`api.githubcopilot.com`) and listed `github_pat_*` as validated. PR #591 shipped
a **direct-token** implementation (exchange dropped — the exchange endpoint 404s
for some account types). The `github_pat_*` entry and docs carried over from the
exchange-era design but are invalid for the direct-token architecture, which
categorically rejects PATs. To be confirmed with the PR author (see Open
Questions).

## Open Questions (for PR author @Amoenus)

1. Which token type was validated with a **real inference call** (returning a
   completion) — against which endpoint, account type (individual vs Copilot
   Business/Enterprise), and token permissions?
2. Was token-exchange intentionally removed (the code comment says the exchange
   endpoint 404s for some accounts), making the `CHANGELOG.md` description of
   "transparently exchanging the long-lived token" stale?
3. For a fine-grained PAT specifically — did one *with the Copilot Requests
   permission* ever complete a real inference, or was support inferred from
   GitHub's documentation?

## Solution

Three workstreams; (A) and (B) are independent of the Open Questions outcome.

### A. Align token-type support with reality
- Remove `github_pat_*` from `SUPPORTED_PREFIXES` (keep `gho_`, `ghu_`) — unless
  the author confirms a working PAT configuration, in which case document the
  exact requirements instead.
- Update the resolver's doc comment and thrown error message.
- Update `docs/ai-engine/setup/deployment.md` supported-formats line.
- Resolve `docs/CHANGELOG.md` correction (token-exchange + PAT claims) — pending
  decision on editing released changelog history (default: fix forward).

### B. Surface upstream provider errors instead of a blanket 500
- When an AI provider call fails with an upstream status + body (e.g. Copilot's
  `400 Personal Access Tokens are not supported`), propagate that message to the
  client/logs rather than collapsing to `An internal server error occurred`
  (`src/interfaces/rest-api.ts:417`).
- Valuable regardless of (A) — it would have let the reporter self-diagnose in
  seconds.

### C. (Decision) Restore PAT support via token-exchange?
- If PATs matter to users, consider reintroducing the exchange flow, guarded for
  accounts where the endpoint 404s. Larger scope; pursue only with demonstrated
  demand.

## Milestones

- [ ] Author feedback gathered (or timed out) on Open Questions
- [ ] `gho_`/`ghu_` happy path verified end-to-end (real inference)
- [ ] Token-type validation + error messages corrected, with unit tests
- [ ] Upstream provider errors surfaced (no opaque 500 for auth failures), with tests
- [ ] Docs aligned (`deployment.md`; `CHANGELOG.md` decision resolved)
- [ ] Integration test covering the token-rejection path
- [ ] Issue #617 resolved and reporter confirmed (or workaround accepted)

## Risks

- Removing `github_pat_*` could remove a working path *if* a permissioned PAT
  works in some configuration → mitigated by consulting the author first.
- Editing released `CHANGELOG.md` history → default to leaving it and fixing
  forward.

## References

- Issue #617 (bug report)
- PRD #587 (original Copilot provider), PR #591 (implementation)
- `src/core/providers/copilot-token-exchanger.ts`
- `src/core/providers/vercel-provider.ts:264-348`
- `src/interfaces/rest-api.ts:402-419`
