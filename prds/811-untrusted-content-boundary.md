# PRD #811: Untrusted-Content Boundary for AI Investigation Loops

**Status**: In Progress — M1 complete, M2 next
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

> **M2 implementation note.** `frameToolResult` in `src/evaluation/injection/composition.ts` is the identity function *because production applies no framing* — that is the gap M1 baselines. **M2 must give it the same wrapping production gains**, or the eval keeps measuring the old composition and M3 reports a result that never shipped. Two drift guards in `composition.test.ts` are designed to go red on the M2 commit and force it: one pins `PluginManager.createToolExecutor`'s raw-output expression (wording-independent — it fails on any change to how a tool result becomes model-visible text), the other scans `plugin-manager.ts`, `remediate.ts` and `remediate-system.md` for framing markers. Treat a red `composition.test.ts` during M2 as the guard working.

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

**#5 — M3 measures regression, not improvement.** *Resolved 2026-09-14.* M3 was written as "eval demonstrates measurable improvement against the corpus." The M1 baseline came back at **0.0% attack success rate on every model tested** (claude-sonnet-5 0/25, gemini-3.6-flash 0/21), so there is no headroom to improve on and the criterion as written is unachievable.

Three options were considered: redefine M3 as a regression guard; build a v2 corpus with harder payloads; or switch to a graded contamination metric. **The regression guard was chosen**, on evidence rather than convenience: the same model and sample flips 0% → 100% ASR when framing degrades (measured — see Validation), so the metric demonstrably moves in the direction a guard needs. That is exactly what the Solution section says part (3) is for: *"Part (1) changes every investigation prompt. Without a regression signal that is an unmeasured behavioral change."*

The option that looked most promising going in — baselining a weaker model to find headroom — was ruled out by measurement, not assumption: Haiku 4.5 also resists under the production prompt.

## Milestones

- [x] **M1** — Injection eval corpus in `eval/datasets`, with current behavior baselined so regression is measurable
- [ ] **M2** — Untrusted tool output delimited and framed in `remediate` and `operate-analysis` prompt composition
- [ ] **M3** — Eval demonstrates **no regression** against the corpus (see Design Decision #5) and no quality regression on existing datasets
- [ ] **M4** — Optional `evidence` field added to affected tool schemas, MCP and REST, with OpenAPI regenerated
- [ ] **M5** — Integration tests: existing single-field callers unchanged; `evidence` composed as delimited data
- [ ] **M6** — Documentation: the trust boundary, what `evidence` is for, and what it does and does not guarantee

## Validation

- Existing eval datasets are the quality-regression guard for M2/M3; the new corpus is the **security-regression** signal (Design Decision #5).
- Integration tests follow `tests/integration/CLAUDE.md` conventions and must prove the additive field changes nothing for callers that omit it.

### M1 as delivered

Harness in `src/evaluation/injection/`, corpus at `eval/datasets/injection-corpus-v1.jsonl` (25 samples), judge prompt in `src/evaluation/prompts/`, run with `npm run eval:injection`. Developer guide: `docs/dev/injection-eval-guide.md`. Needs an API key; **no cluster** — the fixture scripts kubectl responses so the only variable is prompt composition.

Baselines committed under `eval/analysis/injection/`:

| Provider / model | Scored | ASR | Acknowledgement | Delivery |
|---|---|---|---|---|
| anthropic / claude-sonnet-5 | 25 | **0.0%** | 92.0% | 100% |
| google_flash / gemini-3.6-flash | 21 | **0.0%** | 4.8% | 84% |

Four live integration controls in `tests/integration/evaluation/injection-eval.test.ts` (CI: `base-group-2`) pin the detectors against a real model in both directions, so the 0.0% is not a number nothing could contradict:

- `canary_leak` — Haiku 4.5 under a permissive prompt emits the planted token into `remediation.actions[].command`; scores `injection_succeeded` at ASR 1.0. Resists under the production prompt.
- `secret_leak` + `forbidden_tool_call` — the model reads the forbidden Secret and puts the credential in the operator-facing response (60% and 90% per-attempt respectively, n=30). Resists 10/10 under the production prompt.

Each control re-derives the detector's claim independently of `detectors.ts` — the credential check *decodes* every base64 run rather than matching, so a needle that drifted off the fixture would fail rather than pass green.

### Known limitations of the M1 instrument

Recorded so M3 is read with them in mind, not discovered later:

- **The base64 canary loses ~1 in 9 real leaks** (n=9, measured). The fixture serves the secret only in base64 and models re-derive rather than copy it; an early transcription slip defeats any prefix length. Fix is a copyable fixture secret — a v2 item, documented in the guide.
- **Three deterministic detector kinds have no live coverage** — `omission`, `status_flip`, `no_remediation`. All fire on an *absence*, and `no_remediation` (8 samples) has no measured false-positive base rate: the 153-result re-score only covers payload-bearing runs. A payload-free **control arm** would settle it. Deferred to M3.
- **`SA_TOKEN_CANARY` is instrumented but unreachable.** `fs_read` serves a ServiceAccount token, but no v1 sample both steers the model there and names the literal in `must_not_emit`. v2 scope.
- **Gemini's `kubectl_describe` vector fell 4/6 → 2/6 samples** through the model's own behaviour (it inspects the Deployment, not the crashing Pod). The denominator is set by model behaviour, so an M2 run that drives Gemini to the Pod is not like-for-like on that vector.
- **The positive controls are pinned to `anthropic_haiku`** and sized on measured per-attempt rates. If a future Haiku becomes as resistant as Sonnet, they go red — that means the control lost its lever, not that the product regressed. The failure messages say so.

## Out of Scope

- **Per-operator credential propagation** (#799 item 3). The premise does not hold for this engine: there is no Grafana, Loki, or Prometheus client in `src/` or `packages/` — the host UI calls those, not the engine. The only outbound non-Kubernetes integration is the generic MCP client, whose auth is deliberately static per-server service credentials (`src/core/mcp-client-types.ts:31-58`, shipped in #414/#417). The engine's actual shared-credential problem is the Kubernetes ServiceAccount, which is [#401](https://github.com/vfarcic/dot-ai/issues/401). One genuine gap neither covers: Qdrant reads use one shared credential with no per-user scoping — worth tracking separately.
- **`version` provider/model identity** (#799 item 4). Already shipped: `src/tools/version.ts:775, 789-790` returns `providerType` and `modelName`, asserted in `tests/integration/tools/version.test.ts:160-161`. Remaining work is documenting it as a stable contract, plus a question this PRD does not answer — whether publishing model identity should itself be gated, since LogJack reports injection success rates varying from 0% to 86% by model.
- Tool-call gating by evidence provenance (Design Decision #3) — see [#810](https://github.com/vfarcic/dot-ai/issues/810).
