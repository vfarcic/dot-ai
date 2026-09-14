# PRD #811: Untrusted-Content Boundary for AI Investigation Loops

**Status**: Draft
**Priority**: Medium
**GitHub Issue**: [#811](https://github.com/vfarcic/dot-ai/issues/811)
**Created**: 2026-09-14
**Last Updated**: 2026-09-14
**Related Issues**: [#799](https://github.com/vfarcic/dot-ai/issues/799) (the originating feature request — this PRD is the engine-side response to its items 1 and 2); [#810](https://github.com/vfarcic/dot-ai/issues/810) (constrained automatic execution — the other half); [#401](https://github.com/vfarcic/dot-ai/issues/401) (per-user kubectl identity)

---

## Problem

The engine reasons over attacker-writable text and has no mechanism — at any point in the request lifecycle — to distinguish it from operator instruction.

**Two channels carry untrusted content, and the larger one is internal.**

*Channel 1 — the engine's own tool calls.* `kubectl_logs`, `kubectl_events`, and `kubectl_describe` (annotations) all return text an attacker can write, and all three sit in the investigation tool sets of both `remediate` (`src/tools/remediate.ts:238-255`) and `operate-analysis` (`src/tools/operate-analysis.ts:182-202`). Results re-enter model context as plain tool-result text with no delimiting and no framing. This channel is entirely engine-internal: no host UI can label or intercept it, because the host never sees it.

*Channel 2 — the caller-supplied field.* `remediate.issue`, `query.intent`, and `recommend.intent` are each a single field mixing the operator's instruction with any evidence the caller pasted in. `src/tools/remediate.ts:341` interpolates it bare:

```ts
userMessage: `Investigate this Kubernetes issue: ${session.data.issue}`
```

No delimiter, no "treat as data" framing, no separation between what was asked and what was quoted.

**Field naming is load-bearing here.** The [GrafanaGhost](https://cyberscoop.com/grafanaghost-grafana-prompt-injection-vulnerability-data-exfiltration/) disclosure (Noma Security, April 2026) reports that embedding the keyword **`INTENT`** inside an injected payload was part of what made the target model treat planted instructions as authoritative. This project's field is named `intent`.

**Why this is not fixable by a host UI.** Issue #799 makes this point correctly: only the engine controls prompt composition, so only the engine can carry a trust distinction through it. A label emitted by a host has nowhere to land today.

## Solution

Three parts, in dependency order.

### 1. Delimit and frame untrusted tool output (the substantive fix)

Wrap results from log/event/describe tools in explicit delimiters when they re-enter context, and state in the system prompt that delimited content is data to be analyzed and never instruction to be followed.

This is the part that actually addresses Channel 1, and it is not opt-in: a trust boundary an operator has to switch on is not a boundary. It ships to everyone.

Per project rules, the framing lives in `prompts/` (see `prompts/remediate-system.md`, `prompts/operate-system.md`) and is loaded dynamically — never hardcoded.

### 2. Additive `evidence` field

Add an **optional** `evidence` field alongside the existing `issue`/`intent` on the affected tools, so a caller that can distinguish instruction from quoted telemetry at capture time has somewhere to put the latter. Content arriving via `evidence` is composed into the prompt using the same delimiting as (1).

### 3. Injection eval corpus

Part (1) changes every investigation prompt. Without a regression signal that is an unmeasured behavioral change, so the corpus is a deliverable of this PRD rather than a follow-up. `eval/datasets` is the home; [LogJack](https://arxiv.org/abs/2604.15368)'s payload taxonomy is a reasonable starting structure.

## Backward Compatibility

**Part 2 is fully additive.** Existing callers — every MCP client (Claude Code, Cursor, the CLI) and dot-ai-grafana — keep sending `issue`/`intent` alone and keep working unchanged.

**Part 1 is a behavioral change for all users**, with no API or config change. Nothing breaks, but model behavior shifts: remediations may become more conservative or change shape. That risk is managed by part 3, not by a flag.

## Design Decisions

**#1 — Fail-closed default for unlabeled content.** *Resolved 2026-09-14: deferred.* Issue #799 specifies that a missing integrity label MUST default to `attacker-influenced`. Adopting that on day one would classify 100% of current traffic as untrusted, since every existing caller sends everything in one field. The `evidence` field therefore ships additive first. Fail-closed remains the correct end state and should return as a chart value once adoption exists — deliberately deferred, not rejected.

**#2 — Three-valued integrity enum vs. a binary split.** *Open.* #799 proposes `'operator' | 'vendor' | 'attacker-influenced'`. Nothing in the engine currently consumes `vendor` differently from `operator`, so the third value may be unused surface area on arrival. Decide whether to ship the full enum for host-contract stability or a binary trusted/untrusted split that can widen later.

**#3 — Taint tracking through model reasoning is out of scope.** *Resolved 2026-09-14.* #799 proposes gating "any tool call whose justification traces back to `attacker-influenced` evidence." Justification cannot be traced through model weights; there is no implementable version of this. The tractable analogue is capability-based — constraining what the loop can do — which is [#810](https://github.com/vfarcic/dot-ai/issues/810).

**#4 — Whether `evidence` should be renamed.** *Open.* Given the GrafanaGhost keyword finding, consider whether the *instruction* field should stop being called `intent` in prompt-visible text, independent of the wire field name.

## Milestones

- [ ] **M1** — Injection eval corpus in `eval/datasets`, with current behavior baselined so regression is measurable
- [ ] **M2** — Untrusted tool output delimited and framed in `remediate` and `operate-analysis` prompt composition
- [ ] **M3** — Eval demonstrates measurable improvement against the corpus with no quality regression on existing datasets
- [ ] **M4** — Optional `evidence` field added to affected tool schemas, MCP and REST, with OpenAPI regenerated
- [ ] **M5** — Integration tests: existing single-field callers unchanged; `evidence` composed as delimited data
- [ ] **M6** — Documentation: the trust boundary, what `evidence` is for, and what it does and does not guarantee

## Validation

- Existing eval datasets are the quality-regression guard for M2/M3; the new corpus is the security-improvement signal.
- Integration tests follow `tests/integration/CLAUDE.md` conventions and must prove the additive field changes nothing for callers that omit it.

## Out of Scope

- **Per-operator credential propagation** (#799 item 3). The premise does not hold for this engine: there is no Grafana, Loki, or Prometheus client in `src/` or `packages/` — the host UI calls those, not the engine. The only outbound non-Kubernetes integration is the generic MCP client, whose auth is deliberately static per-server service credentials (`src/core/mcp-client-types.ts:31-58`, shipped in #414/#417). The engine's actual shared-credential problem is the Kubernetes ServiceAccount, which is [#401](https://github.com/vfarcic/dot-ai/issues/401). One genuine gap neither covers: Qdrant reads use one shared credential with no per-user scoping — worth tracking separately.
- **`version` provider/model identity** (#799 item 4). Already shipped: `src/tools/version.ts:775, 789-790` returns `providerType` and `modelName`, asserted in `tests/integration/tools/version.test.ts:160-161`. Remaining work is documenting it as a stable contract, plus a question this PRD does not answer — whether publishing model identity should itself be gated, since LogJack reports injection success rates varying from 0% to 86% by model.
- Tool-call gating by evidence provenance (Design Decision #3) — see [#810](https://github.com/vfarcic/dot-ai/issues/810).
