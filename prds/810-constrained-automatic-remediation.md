# PRD #810: Constrained Execution Path for Automatic Remediation

**Status**: Implementation complete, pending merge — M1–M7 landed on `prd-810-constrained-automatic-remediation` via PR [#822](https://github.com/vfarcic/dot-ai/pull/822), with CI green on every check including all eight integration groups. Two blocking security findings (shell reachability through the structured plugin tools, and kubectl flag injection) were found by audit and review and are fixed — see [Security findings during implementation](#security-findings-during-implementation). Design Decision #4 resolved; #3 carried forward as a follow-up.
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
- **Write tools are excluded from the investigation loop.** `KUBECTL_INVESTIGATION_TOOL_NAMES` (`src/tools/remediate.ts:238-255`) exposes only read and dry-run tools, so no *Kubernetes* mutation is reachable during investigation.

  > **Correction (during implementation).** As originally written this bullet said "the model cannot mutate anything *during* investigation", and that was **false until this PR**. The read-only investigation tools took model-authored strings (e.g. `kubectl_get`'s `resource`) and `executeKubectl` assembled them into a command string run through `sh -c`, so a resource name containing `$(…)` was arbitrary command execution — on the **default, flag-off, manual-mode** path, before any of this PRD's gating applied. The argv rewrite described under [Security findings during implementation](#security-findings-during-implementation) closes it, and the bullet is true as restated above only because of that rewrite. This materially changes how the pre-existing risk should be read: the read-only allowlist bounded the *Kubernetes* verbs, never the *process* surface.
- **Tool-level RBAC** (PRD #392) requires the `apply` verb on `remediate` before automatic execution proceeds (`src/tools/remediate.ts:1621-1633`).

### What those do not cover

RBAC's `apply` verb is a per-**user** tool permission, not a per-**command** one. A user authorized to remediate at all inherits the entire arbitrary-command surface. Nothing constrains *what* the approved command may do.

## Solution

Add an opt-in Helm value that, when enabled, restricts remediation execution to **structured kubectl operations with no shell interpretation**. Automatic mode is the reason the control exists; manual mode is covered too, because a command the server refuses to run should not be offered for approval (see "Behavior when enabled").

```yaml
# Automatic Remediation Hardening (PRD #810)
# When enabled, remediation may only execute structured kubectl operations.
# Free-form shell commands are refused in BOTH manual and automatic mode
# and downgraded to awaiting_user_approval.
remediation:
  constrainedExecution:
    enabled: false
```

Rendered into the container env by `charts/templates/deployment.yaml` as `DOT_AI_REMEDIATION_CONSTRAINED_EXEC`, following the `rbac.enforcement.enabled` → `DOT_AI_RBAC_ENABLED` precedent (`charts/values.yaml:406-408`, `charts/templates/deployment.yaml:185-189`).

### Behavior when enabled

- The remediation action schema gains a structured form: a kubectl verb drawn from a fixed set — **`patch`, `apply`, `delete`** — plus resource/namespace/payload as discrete typed fields (`KubectlAction` in `src/core/remediation-constraints.ts`).
  - **Verb set, as shipped.** An earlier draft of this section listed `scale` and `rollout` as separate verbs, contradicting the next bullet, which named only the three plugin tools that exist. Three is what shipped, because there are no `kubectl_scale` / `kubectl_rollout` plugin tools to route to, and adding them would have widened the plugin surface for no gain: both operations *are* patches at the API level. The hardened prompt teaches them in that form — `kubectl scale` as a `spec.replicas` patch, `kubectl rollout restart` as a pod-template `kubectl.kubernetes.io/restartedAt` annotation patch (`prompts/remediate-system-constrained.md`). The same reduction applies to `set image`, `label`, `annotate` and `edit`.
- Execution routes through the existing structured plugin tools (`kubectl_patch`, `kubectl_apply`, `kubectl_delete`), **not** `shell_exec`. No string is handed to a shell. (See [Security findings during implementation](#security-findings-during-implementation) — this was **not** true of the plugin tools as they existed when this PRD was written, and the argv rewrite that made it true is load-bearing.)
- An action that cannot be expressed in the structured form is **refused, not downgraded silently** — the result returns `status: 'awaiting_user_approval'` with a `fallbackReason` naming the constraint, matching how the existing RBAC denial path behaves (`src/tools/remediate.ts:1617`, `1633`). The refusal is all-or-nothing across the action set: executing the expressible half is itself the silent downgrade this control exists to prevent.
- **Both manual and automatic mode are constrained.** A free-form `command` is refused either way. A command string this server will never execute is not something it should offer for human approval — doing so would reinstate the path the flag removes. (Decided during implementation; see the Out of Scope note below.)
- GitOps remediation (`gitSource`, which produces a PR rather than a live mutation) is unaffected — it never reaches `shell_exec`.

### Behavior when disabled (default)

Byte-identical to today. This is stated as a hard requirement below.

## Backward Compatibility (Non-Negotiable)

**Users who do not set `remediation.constrainedExecution.enabled` see zero change.** Same schema, same prompt, same execution path, same results.

This is a deliberate, documented tradeoff, and the PRD is explicit about its cost: **by default the `mode: 'automatic'` → `shell_exec` path remains exactly as described in the Problem section.** The docs must say so plainly, so it is an operator-owned risk rather than a silent one. Revisiting the default is out of scope here and belongs in a follow-up once adoption data exists.

## Design Decisions

**#1 — Opt-in rather than secure-by-default.** *Resolved 2026-09-14.* Matches the `rbac.enforcement.enabled` precedent and the project's standing backward-compatibility rule. Cost accepted and documented above.

**#2 — Structured kubectl rather than allowlisting shell strings.** *Resolved 2026-09-14.* Validating shell strings against an allowlist leaks through quoting, chaining, and command substitution; it is a weak guarantee to hand an operator who deliberately enabled a security control. Since the feature is opt-in, nobody is broken by choosing the stronger form, so implementation effort was the only cost being traded.

**#3 — The self-referential confidence/risk gate.** *Open — carried forward as a follow-up.* Constraining *what* may execute does not fix *who authorizes* it. This ships unchanged: `shouldExecuteAutomatically()` still compares the model's own self-reported `confidence` and `risk` against caller-supplied thresholds, and the same model output supplies both the proposal and the score that authorizes it. Content injected into the investigation stream therefore still steers its own authorization — it simply can no longer steer a shell command. An independent check was scoped out to keep this PRD shippable; it is recorded under [Follow-ups](#follow-ups) rather than left dangling as undecided, and the docs state the residual risk explicitly (`docs/ai-engine/tools/remediate.md`, "What the constraint does not cover").

**#4 — Prompt variant selection.** *Resolved 2026-09-14 — option (a).* A separate `prompts/remediate-system-constrained.md` is loaded dynamically when the flag is on (`src/tools/remediate.ts`, prompt selection); `prompts/remediate-system.md` is untouched, so the default path stays byte-identical. That was the deciding factor: option (b) would have edited the file every default-path investigation depends on.

The cost, identified in code review and recorded here rather than left implicit: **the two prompts duplicate each other.** 208 of the default prompt's 249 lines appear verbatim in the 330-line constrained variant (investigation strategy, GitOps handling, risk assessment, the no-issue example). An edit to one silently skips the other, and nothing fails when they drift.

If that drift becomes real, option (b) is closer to hand than this PRD assumed: `prompts/partials/` already exists in this codebase and is loaded the same dynamic way — `loadPrompt('partials/visualization-output')` in `src/tools/query.ts:257`. Factoring the shared 208 lines into a partial with a swappable execution-contract section is essentially option (b), and does not require a new mechanism. Revisit on the first prompt edit that has to be made twice.

## Milestones

- [x] **M1** — Structured action schema defined and validated; free-form and structured forms coexist behind the flag
  - `KubectlAction` + `validateKubectlAction` in `src/core/remediation-constraints.ts`. Validation rejects unknown verbs, missing required fields per verb, non-string and whitespace-only values, and — added after the security audit — `kind`/`name`/`namespace` beginning with `-`.
- [x] **M2** — Hardened prompt variant produces structured actions reliably (Design Decision #4 resolved)
  - `prompts/remediate-system-constrained.md`, loaded dynamically when the flag is on. Resolved as option (a); see Design Decision #4 for the duplication cost. The prompt is **not** load-bearing for the guarantee — a model that ignores it and emits `command` is refused by the gate, not executed.
- [x] **M3** — Execution routes to structured `kubectl_*` plugin tools; `shell_exec` unreachable when flag is on
  - Routing was correct from the first implementation, but the milestone was **not** actually met until the argv rewrite: the plugin tools assembled a command string and ran it through `sh -c`. See [Security findings during implementation](#security-findings-during-implementation).
- [x] **M4** — Refusal path returns `awaiting_user_approval` with a clear `fallbackReason`; no silent downgrades
  - Two gates, both live and both fail-closed: `handleRemediateTool` (automatic entry) and `executeRemediationCommands` (reached by `executeChoice: 1` without passing the first). All-or-nothing across the action set.
- [x] **M5** — Helm value wired end to end (`charts/values.yaml` → `deployment.yaml` → env), flag off by default
  - `helm template` with `--set remediation.constrainedExecution.enabled=true` renders `DOT_AI_REMEDIATION_CONSTRAINED_EXEC: "true"`; the default render omits the variable entirely. Both outputs are captured verbatim in the docs.
- [x] **M6** — Integration tests: flag off reproduces current behavior exactly; flag on executes structured actions and refuses unexpressible ones
  - **The flag-off suite is the backward-compatibility proof, and it passed unchanged** — same schema, same prompt file, same `shell_exec` arguments. The pre-existing unit suite also passes unmodified.
  - Flag-on coverage in `tests/integration/tools/remediate.test.ts`, in the non-concurrent `Constrained Automatic Execution (PRD #810)` suite so it runs under the flipped env var: the chart renders the variable only when enabled; a structured patch executes and actually fixes the cluster; an unexpressible fix (`helm rollback`) is refused **in both automatic and manual mode**, proven by re-reading Helm state rather than by trusting the reported status; and a GitOps-managed resource opens a PR instead of being refused, exempted for the right reason (actions carry `gitSource` and no `command`).
  - The manual-mode half of that case is worth calling out: it reaches execution through `executeChoice: 1`, a **different entry point** than `mode: 'automatic'`, so it exercises the second gate rather than re-testing the first. It also pins that the *investigation* is not gated — the analysis comes back normally with no `fallbackReason`; the refusal belongs at execution.
  - Not integration-testable and covered by unit tests instead: the flag-injection guard (`name: "--all"`), which would require the model to emit a hostile structured action on demand.
- [x] **M7** — Documentation covers the flag, what it constrains, and — explicitly — what the default leaves open
  - `docs/ai-engine/tools/remediate.md`, "Constraining Automatic Execution". Three sections carry the honest boundaries: what changes when it is on, **what the constraint does not cover** (form not target; `apply` as the widest surface; the self-scoring gate), and **what the default leaves open**. The "no shell" guarantee is explicitly scoped to `remediate` — `operate` still executes AI-authored command strings through a shell on its own human-approved path (`src/core/command-executor.ts`).

## Validation

- Integration tests live in `tests/integration/tools/remediate.test.ts`, following the `toMatchObject` / `beforeAll` cleanup conventions in `tests/integration/CLAUDE.md`.
- The flag-off suite is the backward-compatibility proof and must pass unchanged.
- An injection-driven case — telemetry containing a planted instruction, flag on, asserting refusal — depends on the corpus built in [#811](https://github.com/vfarcic/dot-ai/issues/811) and is the cross-PRD integration point.

## Security findings during implementation

A security audit and a code review ran independently against the first implementation. **Both reached the same verdict: the control did not hold.** The routing was right, the gate was in the right place and `shell_exec` really was unreachable from `remediate` — but the premise underneath the whole design was false. Recorded here because a reader six months from now needs to know *why* the current execution code looks the way it does, and must not undo it.

### The structured plugin tools were not shell-free

`kubectl_patch` / `kubectl_apply` / `kubectl_delete` did not build an argv array. `executeKubectl` (`packages/agentic-tools/src/tools/base.ts`) concatenated every argument into a single command **string** via `buildKubectlCommand` and ran it through `spawn('sh', ['-c', command])` (stdin path) or `execAsync(command)` (no-stdin path). The only defence was `escapeShellArg`, which wrapped a value in **double** quotes and escaped only `"` and `\`. Inside double quotes `sh` still performs `$(…)`, backtick and `$VAR` expansion.

So every model-authored `kind`, `name`, `namespace` and `patch` reached a live shell. Both reviewers reproduced it. A perfectly well-formed action — no `command` field, so the new gate passed it — with a field value such as `name: "api$(…)"` or a `patch` payload carrying a substitution executed arbitrary commands in the plugin container, which holds the cluster credentials. The net effect of *enabling* the control would have been to move the attacker from "free-form shell command" to "shell command smuggled inside a kubectl argument": narrower in ergonomics, identical in consequence. That is precisely the "weak guarantee to hand an operator who deliberately enabled a security control" that Design Decision #2 rejects.

It also reached further than this PRD's own path: the same helper served the **read-only investigation tools** on the default, flag-off, manual-mode path — see the correction under "What already limits the blast radius".

**Fixed by an argv rewrite, not by better escaping.** `runWithoutShell(binary, argv, options)` does one `spawn(binary, argv)` — no `sh -c`, no `exec` — for kubectl *and* helm, with stdin piped natively (the only reason the old code reached for a shell). `buildKubectlCommand` / `buildHelmCommand` still exist but build display and log strings only; nothing executes them. `escapeShellArg` is display-only and was switched to POSIX single quoting so it is not a live footgun if reused.

**Do not undo this.** Escaping was considered and rejected: it would have left the "no shell" sentence in the docs, the prompt and the module header needing a footnote, and it would have kept `escapeShellArg` on the security surface. `spawn(binary, argv)` hands argv straight to `execve`, so `$(…)`, backticks, quotes, pipes, `;`, `&&`, `*`, `~` and newlines inside an argument are literal bytes. The regression test that pins this is `packages/agentic-tools/tests/unit/base-execution.test.ts`: it puts a stub `kubectl` on `PATH` that prints its argv and asserts each payload arrives as one literal argv element. It was verified to fail 7 of 8 against the pre-fix code. **Asserting on the command string would not have caught the defect — the old string looked correctly quoted.**

### kubectl flag injection via positional fields

Independent of the above and surviving the argv fix: nothing rejected a field that looks like a flag, and no `--` separator preceded the positionals. `{"verb":"delete","kind":"pods","name":"--all","namespace":"prod"}` passed validation and ran `kubectl delete pods --all -n prod` — every pod in the namespace, from an action whose description named one stuck pod. `--kubeconfig=…` / `--server=…` in `name` redirect the client the same way.

Fixed on both sides, deliberately: a `--` separator after the flags in `kubectl-patch.ts`, `kubectl-delete.ts` and their two dry-run twins, **and** a validator that rejects `^-` in `kind`, `name` and `namespace` (`rejectsAsFlag`). `patch` and `manifest` are exempt by design — pflag consumes the `--patch` value unconditionally, a manifest travels on stdin, and a YAML document legitimately starts with `---`.

Not applied to the read-only kubectl tools (`kubectl_get`, `kubectl_describe`, `kubectl_logs`, `kubectl_events`, …): their `args: string[]` passthrough is a documented free-form flag channel, so a `--` would break the contract without closing anything the channel does not already allow. See [Follow-ups](#follow-ups).

### Also corrected before merge

- **Displayed was not what executed.** An action carrying both a benign `command` and a hostile `kubectlAction` displayed the `command` while executing the `kubectlAction`. The "exactly one of" rule in the prompt is guidance to the model, not an invariant. Display now follows execution when the flag is on.
- **The approval line hid the payload.** The human-facing summary rendered target and verb but never the patch body or manifest — in the one moment the refusal design leans on a human reading the proposal. A truncated payload preview is now included.
- **Choice-2 routing misclassified structured actions.** Both filters keyed on `command`, which structured actions do not have, so a mixed set took the GitOps-only branch and silently hid its kubectl half.

### Fixed during automated review on PR #822

Raised by CodeRabbit against the pushed branch and fixed before merge:

- **`runWithoutShell` capped stdout but not stderr** — a regression the argv rewrite itself introduced, since the `execAsync` path it replaced applied `maxBuffer` per-stream to both. Both streams now have independent counters. Overflow **rejects and kills the child** rather than truncating, deliberately: `isIgnorableStderr` classifies by substring, so a silently dropped tail could flip an ignorable stderr into a hard failure or the reverse. Do not "optimise" this into a truncate.
- **`helm template` nil-pointered on `--set remediation=null`**, now a nil-safe parenthesized lookup. Note this makes the chart inconsistent — see [Follow-ups](#follow-ups).
- **A new unit test wrote to the system temp dir**, violating the `./tmp` rule in `CLAUDE.md`.
- **The rollout-restart prompt example hardcoded a `restartedAt` timestamp** a model could copy verbatim, yielding a no-op patch that rolls nothing while reporting success. Now a placeholder plus an instruction to generate the value and confirm it differs from the live one.
- **A helm unit test interpolated values into an `execSync` command string** — the same pattern this PRD removes from production code. Converted to `execFileSync` with an argv array.

One finding was **declined**: `executeChoice: 2` not being gated, rated Major/CWE-78. It is a documented, deliberate scope decision rather than an oversight — see [Follow-ups](#follow-ups) — and the reasoning is recorded on the [review thread](https://github.com/vfarcic/dot-ai/pull/822#discussion_r4010687324).

### Unrelated fixes carried in the same PR

Both were pre-existing failures on `main`, not caused by this work, fixed here under the standing rule that CI must be green regardless of cause. Recorded so a future reader is not puzzled by their presence in a PRD-810 PR:

- **Dependency audit.** The `Security Analysis` check was failing on 13 advisories in transitive dependencies. Only `fast-uri` needed an override and a major bump — 3.1.5 is the last 3.x ever published, so there is no fixed 3.x — and its ajv compatibility was smoke-tested on the real consumer path. Separately, `packages/agentic-tools` carried 7 advisories of its own including a **high in a production dependency**, because that job only audits the root workspace. See [Follow-ups](#follow-ups).
- **`/readyz` reported a healthy collection as inaccessible.** `READINESS_COLLECTION_INFO_TIMEOUT_MS = 1000` bounded **four** sequential Qdrant round trips — `collectionExists()` (`getCollections()` + `getCollection()`) and `getCapabilitiesCount()` (`getCollections()` + an `exact: true` count that scans the collection) — under one shared deadline. Worse, the count only feeds the optional `storedCount`, so a slow *count* falsified the *health signal*; the inner `catch` conflated them the same way. Now budgeted independently with a tri-state existence result, so the count decides only `storedCount` while a genuinely absent or undetermined collection still reports `false`. `collectionAccessible` is not part of `ready`, so the endpoint's status code was never affected.

## Follow-ups

Recorded so they are not lost. **None are implemented by this PRD.**

- **An independent authorization check for automatic execution** (Design Decision #3). The model still scores its own proposal. Needs its own PRD or a later milestone here.
- **`executeChoice: 2` is not gated by the constraint** (`src/tools/remediate.ts`). It returns the actions to the calling agent with instructions to run them with the agent's own Bash tool, so a steered free-form command can still reach a shell — on the operator's workstation rather than in the cluster. Human-selected, so outside this PRD's automatic threat model, but it deserves its own issue. `executeChoice: 1` is safe: it re-enters `executeRemediationCommands`, which re-runs the gate.
- **`fallbackReason` echoes model-authored text.** The refusal string embeds `action.description`, which is model output shaped by cluster content, and returns it to the calling agent verbatim. Nothing executes it, so this is a content-boundary concern — it belongs to [#811](https://github.com/vfarcic/dot-ai/issues/811), not here.
- **Read-only kubectl tools keep a free-form `args: string[]` flag channel.** Deliberate — it is their documented contract — and shell-free after the argv rewrite, so it can no longer reach a shell. But the values are still model-authored, and the channel bounds nothing about which kubectl flags may be passed.
- **Prompt duplication between `remediate-system.md` and `remediate-system-constrained.md`** (Design Decision #4). Revisit via `prompts/partials/` on the first edit that has to be made twice.
- **The chart now has one nil-safe value guard and 84 that are not**, across 16 files in `charts/templates/`. Introduced by the fix above. Either sweep them or revert the one — the inconsistency is the problem, not the guard.
- **`Security Analysis` only audits the root workspace.** It runs `npm ci` at the root, so `packages/agentic-tools` is never audited — which is how a high-severity advisory in one of its production dependencies went unflagged until someone looked by hand.
- **The remaining 7 files in `tests/unit/helm/` still build shell command strings** for `execSync`. `tests/unit/helm/k8s-doc.ts` is precedent for a shared non-test module in that directory, so a `helm-template.ts` helper would land in an established slot. Two things to settle before freezing a signature: the files disagree on stderr handling (`stdio: ['ignore','pipe','pipe']` vs. `encoding` alone), which changes what a failed render prints while debugging; and `gateway-api.test.ts` and `gitops-allowed-repo-hosts.test.ts` build commands inline across several lines and may carry per-test flags a simple signature would not cover.
- **`IntegrationTest.kubectl` swallows command failures** (`tests/integration/helpers/test-base.ts`), returning `error.stdout || ''` so every failure looks like empty output. Making it strict is cross-cutting: 65 call sites across 5 test files, and some polling loops *depend* on the swallow — `if (podsJson && podsJson.trim() !== '')` reads empty as "not ready yet" and would start throwing mid-poll. Needs its own full-suite run to validate.
- **The model intermittently invents `helm rollback --to-revision`, which does not exist** (`helm rollback <RELEASE> [REVISION]` takes the revision positionally). Seen as a non-deterministic integration failure on the flag-off free-form path; `prompts/remediate-system.md` does not mention the flag, and teaching the positional form there is the likely fix. Pre-existing and unrelated to this PRD — noted because it is exactly the class of defect the free-form path produces and the structured path cannot: a hallucinated flag is a shell command that fails, where a hallucinated verb is a refusal.

## Out of Scope

- Changing the default (see Backward Compatibility).
- An independent risk assessor (Design Decision #3) — now recorded under [Follow-ups](#follow-ups).
- Per-command RBAC — *what* a structured operation may target — which overlaps [#401](https://github.com/vfarcic/dot-ai/issues/401). The constraint bounds the **form** of what executes, not the target: a structured `delete` of `kind: Namespace, name: kube-system`, or an `apply` of a ClusterRoleBinding granting cluster-admin, are both well-formed and both execute. The ServiceAccount's ClusterRole (`charts/templates/clusterrole.yaml`) remains the real ceiling on blast radius. Documented as such rather than implied to be covered.
- Validating the contents of an `apply` manifest. `apply` accepts a full model-authored YAML document and nothing inspects it — not the kind, not RBAC rules inside it, not a `metadata.namespace` overriding the namespace field. It is genuinely narrower than a shell string (it travels on stdin, and what it can express is bounded by the Kubernetes API rather than by whatever binaries are on `PATH`), but it is the widest surface the constraint admits, and operators are told so.

> **No longer out of scope: manual mode.** The original draft excluded manual mode on the reasoning that it already requires human approval. That was reversed during implementation: with the flag on, free-form commands are refused in **both** modes. Offering a command for approval that the server will never execute reinstates exactly the path the flag removes, and it puts the human in the position of rubber-stamping model-authored text that untrusted telemetry may have steered. Manual mode still returns the full analysis, so nothing is hidden — the operator simply runs it themselves rather than having the server do it. See "Behavior when enabled".
