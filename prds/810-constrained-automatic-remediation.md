# PRD #810: Constrained Execution Path for Automatic Remediation

**Status**: Draft
**Priority**: High
**GitHub Issue**: [#810](https://github.com/vfarcic/dot-ai/issues/810)
**Created**: 2026-09-14
**Last Updated**: 2026-09-14
**Related Issues**: [#799](https://github.com/vfarcic/dot-ai/issues/799) (the feature request whose analysis surfaced this); [#811](https://github.com/vfarcic/dot-ai/issues/811) (untrusted-content boundary — the other half); [#392](https://github.com/vfarcic/dot-ai/issues/392) (tool-level RBAC, the existing `apply`-verb gate); [#401](https://github.com/vfarcic/dot-ai/issues/401) (per-user kubectl identity)

---

## Problem

`remediate` supports `mode: 'automatic'` (`src/tools/remediate.ts:66-71`), in which the engine executes remediation without human approval. The path is:

1. The investigation loop reads cluster state — including `kubectl_logs`, `kubectl_events`, and `kubectl_describe` (annotations). All three return **attacker-writable text**.
2. The model emits a free-form `action.command` string (schema in `prompts/remediate-system.md:55-80`; type `RemediationAction` at `src/tools/remediate.ts:153-157`).
3. That string is passed to `shell_exec` (`src/tools/remediate.ts:1115`), which is `child_process.exec` with **no allowlist, no kubectl restriction, and full shell metacharacter interpretation** (`packages/agentic-tools/src/tools/shell-exec.ts:44-48`).

The only gate on step 3 is `shouldExecuteAutomatically()` (`src/tools/remediate.ts:1713-1746`), which compares the model's **own self-reported** `confidence` and `risk` against caller-supplied thresholds.

That gate is self-referential: the same model output that proposes the command also supplies the score authorizing it. Content injected into the investigation stream steers the analysis, and therefore steers its own authorization. This is the architecture benchmarked by [LogJack](https://arxiv.org/abs/2604.15368) ("LLM debugging agents that consume cloud logs and execute remediation commands"), which reports RCE succeeding on 6 of 8 evaluated models and command-execution rates from 0% to 86% depending on model.

### What already limits the blast radius

These are real and should not be undone:

- **`mode` defaults to `'manual'`** (`src/tools/remediate.ts:69`). Automatic execution is already opt-in at the call site; the default path requires explicit human approval.
- **Write tools are excluded from the investigation loop.** `KUBECTL_INVESTIGATION_TOOL_NAMES` (`src/tools/remediate.ts:238-255`) exposes only read and dry-run tools. The model cannot mutate anything *during* investigation.
- **Tool-level RBAC** (PRD #392) requires the `apply` verb on `remediate` before automatic execution proceeds (`src/tools/remediate.ts:1621-1633`).

### What those do not cover

RBAC's `apply` verb is a per-**user** tool permission, not a per-**command** one. A user authorized to remediate at all inherits the entire arbitrary-command surface. Nothing constrains *what* the approved command may do.

## Solution

Add an opt-in Helm value that, when enabled, restricts automatic-mode execution to **structured kubectl operations with no shell interpretation**.

```yaml
# Automatic Remediation Hardening (PRD #810)
# When enabled, mode:'automatic' may only execute structured kubectl operations.
# Free-form shell commands are refused and downgraded to awaiting_user_approval.
# Manual mode is unaffected — it already requires explicit human approval.
remediation:
  constrainedExecution:
    enabled: false
```

Rendered into the container env by `charts/templates/deployment.yaml` as `DOT_AI_REMEDIATION_CONSTRAINED_EXEC`, following the `rbac.enforcement.enabled` → `DOT_AI_RBAC_ENABLED` precedent (`charts/values.yaml:406-408`, `charts/templates/deployment.yaml:185-189`).

### Behavior when enabled

- The remediation action schema gains a structured form: a kubectl verb drawn from a fixed set (`patch`, `apply`, `delete`, `scale`, `rollout`), plus resource/namespace/payload as discrete typed fields.
- Execution routes through the existing structured plugin tools (`kubectl_patch`, `kubectl_apply`, `kubectl_delete`), **not** `shell_exec`. No string is handed to a shell.
- An action that cannot be expressed in the structured form is **refused, not downgraded silently** — the result returns `status: 'awaiting_user_approval'` with a `fallbackReason` naming the constraint, matching how the existing RBAC denial path behaves (`src/tools/remediate.ts:1617`, `1633`).
- GitOps remediation (`gitSource`, which produces a PR rather than a live mutation) is unaffected — it never reaches `shell_exec`.

### Behavior when disabled (default)

Byte-identical to today. This is stated as a hard requirement below.

## Backward Compatibility (Non-Negotiable)

**Users who do not set `remediation.constrainedExecution.enabled` see zero change.** Same schema, same prompt, same execution path, same results.

This is a deliberate, documented tradeoff, and the PRD is explicit about its cost: **by default the `mode: 'automatic'` → `shell_exec` path remains exactly as described in the Problem section.** The docs must say so plainly, so it is an operator-owned risk rather than a silent one. Revisiting the default is out of scope here and belongs in a follow-up once adoption data exists.

## Design Decisions

**#1 — Opt-in rather than secure-by-default.** *Resolved 2026-09-14.* Matches the `rbac.enforcement.enabled` precedent and the project's standing backward-compatibility rule. Cost accepted and documented above.

**#2 — Structured kubectl rather than allowlisting shell strings.** *Resolved 2026-09-14.* Validating shell strings against an allowlist leaks through quoting, chaining, and command substitution; it is a weak guarantee to hand an operator who deliberately enabled a security control. Since the feature is opt-in, nobody is broken by choosing the stronger form, so implementation effort was the only cost being traded.

**#3 — The self-referential confidence/risk gate.** *Open.* Constraining *what* may execute does not fix *who authorizes* it — the model still scores its own proposal. An independent check was scoped out of this PRD to keep it shippable. Decide whether it becomes a follow-up PRD or a later milestone here.

**#4 — Prompt variant selection.** *Open.* `prompts/remediate-system.md` currently teaches free-form command strings including heredocs (lines 131-139). Options: (a) a separate hardened system prompt loaded when the flag is on, (b) a conditional partial in the existing prompt. (a) keeps the default path untouched and is the leaning recommendation; (b) avoids divergence between two prompts. Note that per project rules, either way the prompt lives in `prompts/` and is loaded dynamically — not hardcoded.

## Milestones

- [ ] **M1** — Structured action schema defined and validated; free-form and structured forms coexist behind the flag
- [ ] **M2** — Hardened prompt variant produces structured actions reliably (Design Decision #4 resolved)
- [ ] **M3** — Execution routes to structured `kubectl_*` plugin tools; `shell_exec` unreachable when flag is on
- [ ] **M4** — Refusal path returns `awaiting_user_approval` with a clear `fallbackReason`; no silent downgrades
- [ ] **M5** — Helm value wired end to end (`charts/values.yaml` → `deployment.yaml` → env), flag off by default
- [ ] **M6** — Integration tests: flag off reproduces current behavior exactly; flag on executes structured actions and refuses unexpressible ones
- [ ] **M7** — Documentation covers the flag, what it constrains, and — explicitly — what the default leaves open

## Validation

- Integration tests live in `tests/integration/tools/remediate.test.ts`, following the `toMatchObject` / `beforeAll` cleanup conventions in `tests/integration/CLAUDE.md`.
- The flag-off suite is the backward-compatibility proof and must pass unchanged.
- An injection-driven case — telemetry containing a planted instruction, flag on, asserting refusal — depends on the corpus built in [#811](https://github.com/vfarcic/dot-ai/issues/811) and is the cross-PRD integration point.

## Out of Scope

- Changing the default (see Backward Compatibility).
- An independent risk assessor (Design Decision #3).
- Manual mode, which already requires human approval.
- Per-command RBAC, which overlaps [#401](https://github.com/vfarcic/dot-ai/issues/401).
