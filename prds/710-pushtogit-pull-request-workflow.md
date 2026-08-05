# PRD #710: Pull Request Workflow for `pushToGit`

## Status

Ready. All four open questions were answered by the reporter on 2026-08-04 ([comment](https://github.com/vfarcic/dot-ai/issues/710#issuecomment-5175923379)) — see [Resolved questions](#resolved-questions). No configuration surface is being added, so M1 can start.

## Problem

`pushToGit` pushes commits straight onto the target branch. Reported in [#710](https://github.com/vfarcic/dot-ai/issues/710) by a team running dot-ai as a shared platform service on EKS landing-zone clusters (Dex/GitHub SSO, RBAC enforced, Bedrock provider, `deployManifests` deliberately blocked so that **all** mutations flow through Git). Their GitOps repositories have branch protection, so the one path they left open is the one that doesn't work.

### Direct push is the only mode

`src/tools/push-to-git.ts:172` resolves the push target from a client-supplied parameter:

```ts
const branch = args.branch || 'main';
```

and `pushRepo` (`src/core/git-utils.ts:497`) commits and pushes to exactly that branch. There is no branch creation, no PR, and no place to put one — the client picks the destination and the server complies.

### The capability already exists, one tool over

`git_create_pr` (`src/core/internal-tools.ts:267`) does branch + commit + push + `POST /repos/{owner}/{repo}/pulls`, and remediate uses it today (`src/tools/remediate.ts:822-831`). But it is **not reusable as-is** from `pushToGit`:

1. **It never clones.** `repoPath` must be an existing checkout that `git_clone` produced earlier in remediate's investigation loop.
2. **Its path scope is incompatible.** `validatePathWithinClones` (`internal-tools.ts:47`) hard-scopes `repoPath` under `./tmp/gitops-clones/`. `pushToGit` clones into `os.tmpdir()` (`push-to-git.ts:202-205`) and deletes it in a `finally`, so that path would be rejected outright.

The genuinely shared logic is the second half of `handleGitCreatePr` (`internal-tools.ts:315-400`): checkout base → push to a new branch → resolve `origin` → create the PR. That belongs in `git-utils.ts`.

### `pushToGit` has no authorization gate — the more urgent half

`deployManifests` requires the `apply` verb (`recommend.ts:241-262`). `pushToGit` requires nothing beyond tool-level `execute` on `recommend` (`src/interfaces/mcp.ts:274`, `src/interfaces/rest-api.ts:837`).

For the reporter's deployment that is a live hole. They blocked `deployManifests` via RBAC precisely so that mutations can only land through a reviewed Git change — but today any `dotai-viewer` (execute-only) user can push straight to `main` of any repository the server token can write, which in their architecture *is* a cluster mutation with the review step skipped.

This is not incidental to the feature request. "The server controls the workflow, the client does not pick" cannot be delivered by a client-supplied flag alone: a client that omits the flag still gets direct push. Authorization is the only layer that can actually enforce it.

## Solution

Three changes, in dependency order:

1. **Extract** the PR-creation half of `git_create_pr` into `git-utils.ts` as a `createPullRequest()` helper. `handleGitCreatePr` becomes a thin path-validating wrapper; remediate's behavior is unchanged.
2. **Add PR mode to the `pushToGit` stage** (option A from the issue) — server-generated head branch, PR opened against the base branch, PR URL and number returned, no auto-merge.
3. **Gate the two modes on the existing verbs**: direct push is a mutation and requires `apply`; branch + PR is a proposal behind a human gate and needs only `execute`.

Point 3 is what makes the workflow server-controlled. Deny `apply` and PR mode is the only reachable path — enforced server-side, with no new configuration surface and no new verbs. `buildAgentInstructions` (`generate-manifests.ts:42`) already does RBAC-aware option presentation, so the agent gets steered to the permitted mode rather than discovering it via an error.

### What the RBAC gate does and does not cover

The enforcement is real but conditional, and every condition is an operator responsibility rather than something this codebase can guarantee. All four must be documented alongside the feature, because a platform team that assumes "viewer means no direct push" without checking them has a false sense of a control.

1. **Kubernetes RBAC is additive, never subtractive** (`docs/ai-engine/setup/authorization.md:174`). A `dotai-viewer` binding does not remove `apply` — it merely fails to grant it. A user also bound to `dotai-operator` or `dotai-admin` anywhere gets the union, and direct push is available again. Forcing PR mode therefore requires auditing that *no* broader binding exists, not just adding a narrow one. This is the most likely way an operator believes they are protected and is not.

2. **The binding must be cluster-scoped.** The `deployManifests` check passes only `{toolName, verb}` with no namespace (`recommend.ts:243-246`), and `src/core/rbac/check-access.ts:99` sets `namespace` on the SubjectAccessReview only when one is supplied — so the review is cluster-scoped and a namespaced `RoleBinding` will not satisfy it. The PR-mode check inherits the same shape. `ClusterRoleBinding` is required.

3. **Static token users bypass RBAC entirely** (`src/core/rbac/check-access.ts:71-75`, `authorization.md:198`). Any caller presenting `DOT_AI_AUTH_TOKEN` is allowed unconditionally and bindings are irrelevant. So the gate covers OAuth end users only; any automation, CI job, or UI path authenticating with the static token retains direct push regardless of role bindings.

4. **`rbac.enforcement.enabled` must be on.** It defaults to `false` (`charts/values.yaml:327`); otherwise `isRbacEnabled()` returns false and every authenticated user has full access (`src/core/rbac/check-access.ts:77-80`) — the new verb check becomes a no-op along with all the existing ones.

Items 1 and 3 were the substantive argument *for* a server-side switch: the RBAC route's enforcement is only as strong as a binding audit plus token discipline, whereas a process-level switch cannot be widened by a stray RoleBinding or sidestepped by a token. The reporter has confirmed neither applies to their deployment (resolved question 1), so no switch ships — but all four limits are still documented, because the next operator to configure PR-only will not have audited their bindings.

Operational note for the docs: MCP clients register tools at session startup, so a binding change requires a client reconnect before it takes effect (`authorization.md:194`).

### Why not option B (standalone tool)

Mechanically it is cheap — `PUSHTOGIT_TOOL_NAME` / `_DESCRIPTION` / `_INPUT_SCHEMA` already exist at `push-to-git.ts:33-61` and are imported nowhere, leftover scaffolding from PRD #395. Wiring them into `mcp.ts` and the REST registry is a small change.

It is still the wrong trade:

- Every other recommend stage (`chooseSolution`, `answerQuestion`, `generateManifests`, `deployManifests`) is a stage, and `deployManifests` — the other mutating one — is a stage guarded by a verb. Splitting only this one breaks the pattern.
- It adds a tool to every MCP client's tool list and a REST route for something that can only ever run against an existing `recommend` session.
- Its one real benefit is a distinct RBAC `resourceName`, and verb granularity inside option A yields the same enforcement. Granting `pushToGit` without `recommend` is meaningless anyway — you need `recommend` to produce the solution.

The dead constants should be deleted as part of this work rather than left as a decoy.

## Design decisions to settle

1. **`branch` changes meaning in PR mode.** Today it is the push target (`push-to-git.ts:172`). In PR mode it is the *base*, and the head branch is server-generated. A client-supplied head must be impossible, not merely discouraged — so `branch` is reinterpreted as base rather than a second branch parameter being added. Direct-push callers see no change.

2. **Head branch naming.** Remediate uses `remediate/${sessionId.slice(0, 12)}-${Date.now()}` (`remediate.ts:830`). The issue proposes `dot-ai/<solutionId>-<timestamp>`. Whatever is chosen must be validated against git ref rules if any component derives from user input; `sanitizeIntentForLabel` (`src/core/solution-utils.ts`) already exists if a readable intent slug is wanted in the name.

3. **Empty-diff handling — a real bug, not a hypothetical.** `pushRepo` returns early *without pushing* when the commit is empty (`git-utils.ts:545-551`). `handleGitCreatePr` does not check for that and calls the GitHub API with a head branch that never reached the remote, surfacing a raw 422 body. Re-running `pushToGit` with unchanged manifests is entirely plausible in a landing-zone flow, so PR mode needs an explicit "no changes" result. Fixing it in the shared helper fixes it for remediate too.

4. **Mode selection.** A `pullRequest: boolean` parameter is the selector; RBAC is the enforcement. The parameter has to be threaded through three places, not one: `RECOMMEND_TOOL_INPUT_SCHEMA` (`recommend.ts:43-49`, alongside the other pushToGit params), the stage dispatch that builds `PushToGitArgs` (`recommend.ts:268-283`), and `NEXT_ACTIONS[2]` (`generate-manifests.ts:141-146`) so the agent knows the option exists. Resolved question 1 confirms no server-side switch is needed on top of it.

5. **Response and session shape.** Mirror remediate's `pullRequest: { url, number, branch, baseBranch, filesChanged }` (`remediate.ts:212-219`), nested under `gitPush`. Do **not** add a value to the session `stage` enum (`recommend.ts:57`) — it is consumed by dot-ai-ui for page-refresh support, and a new value is a breaking change for a downstream consumer. `stage: 'pushed'` stays; `gitPush.pullRequest` carries the new information.

6. **No new configuration parameter ships.** Resolved question 1 removed the only candidate (`gitops.pullRequestMode`), so this work adds no config surface at all. The rule stands for anything that does get added later: the project is Kubernetes-only, so `charts/values.yaml` is the configuration interface and a new parameter is a first-class value rendered into the container env by `charts/templates/deployment.yaml`, exactly as `rbac.enforcement.enabled` renders `DOT_AI_RBAC_ENABLED` (`deployment.yaml:174-177`). The env var is an internal implementation detail with no user-facing contract, and documenting a new parameter under `extraEnv` is not an acceptable interim step. Note that `DOT_AI_GIT_CREATE_DRAFT_PRS` (`internal-tools.ts:365-370`) moves into the extracted helper unchanged — it is a pre-existing test-only switch, not a new parameter, and must not acquire a chart value.

7. **Non-GitHub hosts.** `api.github.com` and the `github\.com[/:]` regex are hardcoded (`internal-tools.ts:334,351`). GitLab, Bitbucket, and GitHub Enterprise Server fall into the existing success-with-error branch (`internal-tools.ts:337-346`): the branch is pushed, the PR is not created. For a never-touch-`main` workflow that partial success is defensible, but the response must state it unambiguously rather than reading as a completed PR. GHES support is out of scope (resolved question 2).

8. **Commit and PR attribution must come from the authenticated identity, not from client parameters.** `authorName` and `authorEmail` are passed straight from client args into the commit (`push-to-git.ts:293-299`) with no fallback to `getCurrentIdentity()`, so any caller can attribute a commit to anyone. Today that is merely untidy; in PR mode it undermines the feature's whole point, because the commit author and PR body are the reviewer's only answer to *who asked for this*. So: when an OAuth identity is present it is the source of truth for the git author, and client-supplied `authorName`/`authorEmail` do not override it. The PR body carries `solutionId`, the solution intent, the target path, and the requesting user's email; the PR title comes from `commitMessage`. Direct-push mode gets the same author treatment — there is no reason for it to stay spoofable.

9. **Repeat runs must not silently accumulate PRs.** Decision 3 covers the unchanged-manifest case. The other case is a re-run with *changed* manifests — entirely normal when a user revises answers and regenerates — which under a timestamped branch name opens a second branch and a second PR while the first stays open, leaving two PRs proposing the same claim for a reviewer to reconcile. `session.gitPush` already records the previous branch, so the information needed to do better is on hand. Decision: if the session records a previous PR-mode push and its PR is still open, push the new commit to that same head branch so the existing PR updates in place; open a new PR only when there is no recorded branch or its PR is closed or merged. The response must make clear which happened.

10. **The shared helper cannot assume the base ref is present locally.** `handleGitClone` clones with `depth: 1` and no `--branch` (`internal-tools.ts:154`), so only the default branch's ref exists in a remediate clone, and `handleGitCreatePr`'s `git.checkout(baseBranch)` (`internal-tools.ts:318`) therefore fails for any non-default base — a latent remediate bug that predates this work. `pushToGit`'s PR mode is unaffected because it clones with `--branch <base>`, so this bites only the extracted helper's other caller. Since M1 is touching exactly this line, `createPullRequest()` fetches the base ref when it is missing rather than assuming a caller-prepared checkout. Its contract states the requirement explicitly either way.

## Scope

**In scope**

1. `createPullRequest()` extracted into `src/core/git-utils.ts`; `handleGitCreatePr` reduced to a path-validating wrapper; the hardcoded `'User-Agent': 'dot-ai-remediate'` (`internal-tools.ts:358`) generalized.
2. Empty-diff handling in the shared helper (decision 3) and base-ref fetch when the base is absent from a shallow clone (decision 10) — both benefiting remediate as well.
3. PR mode on the `pushToGit` stage: server-generated head branch, PR against the base branch, `gitPush.pullRequest` in the response and session, identity-derived commit author and attributed PR body (decision 8), existing-PR reuse on re-run (decision 9), no auto-merge.
4. RBAC: direct push requires `apply` on `recommend`; PR mode requires `execute`. `buildAgentInstructions` and `NEXT_ACTIONS` (`generate-manifests.ts:42`, `:130`) updated to present only the permitted mode.
5. Clone relocated from `os.tmpdir()` to `./tmp/gitops-clones/<solutionId>/`, for the project's `./tmp` convention and nothing else. Two rationales that look like they apply do not: `validatePathWithinClones` stays inside `handleGitCreatePr`, and `pushToGit` calls `createPullRequest()` directly, so that validator is never in `pushToGit`'s path; and `cleanupOldClones` (`internal-tools.ts:439`) only runs at the start of a remediate investigation, so a recommend-only deployment would never prune. `pushToGit`'s existing `finally` rm (`push-to-git.ts:381-393`) is stronger than TTL and stays — the relocation must not be taken as a reason to drop it.
6. Removal of the unused `PUSHTOGIT_TOOL_*` constants (`push-to-git.ts:33-61`).
7. Integration coverage for PR mode, re-run behavior, attribution, and the RBAC gate; unit coverage for branch naming, empty-diff, and base-ref fetch.
8. Docs: `docs/ai-engine/tools/recommend.md:410-460` (PR-mode example), `docs/ai-engine/setup/authorization.md` (the verb rule for the two modes, the four enforcement limits above since an operator relying on the gate needs to know what can defeat it, and the upgrade note from item 9), `charts/values.yaml:235-253` (GitHub App needs `Pull requests: write` alongside `Contents: write`). OpenAPI regenerates from the Zod schema via `scripts/generate-openapi.sh`.
9. Breaking-change handling for the new gate. Today `execute` on `recommend` is sufficient to push to Git; after M3 direct push requires `apply`. Any deployment with `rbac.enforcement.enabled: true` whose users push directly to Git with a viewer-level binding stops working on upgrade — and the obvious remedy, granting `apply`, also unblocks `deployManifests`, which is usually the opposite of what such an operator wants (see the limitation recorded under resolved question 1). Exposure is bounded because the value defaults to `false`, and the migration is normally to adopt PR mode rather than to widen the binding. This needs an explicit breaking-change changelog fragment and an upgrade paragraph in the authorization docs, not just a mention in release notes.

**Out of scope**

- Auto-merge in any form. Explicitly rejected by the requester and by this design.
- Repository allowlisting, and with it the credential-exposure problem behind it (resolved question 3) — related, separately motivated, needs its own issue. PR mode does not mitigate it.
- GitHub Enterprise Server / GitLab / Bitbucket PR APIs (resolved question 2).
- Helm solutions — still rejected at `push-to-git.ts:135-151`; PRD #403 owns that. Crossplane claims are raw manifests, so the reporter's case is unaffected.
- Operate's GitOps path (PRD #363). It should consume `createPullRequest()` when built, but nothing here depends on it.

## Success Criteria

- A `pushToGit` call in PR mode against a branch-protected repository creates a feature branch, opens a PR, and returns its URL and number without ever writing to the protected branch.
- The head branch is server-generated and cannot be influenced by any client-supplied parameter.
- With `apply` denied, direct push is refused and PR mode still succeeds — the workflow is enforced server-side, not by client cooperation.
- The four conditions the gate depends on (additive bindings, cluster-scoped binding required, static-token bypass, `rbac.enforcement.enabled`) are documented where an operator configuring PR-only will read them, not left implied.
- Re-running `pushToGit` with unchanged manifests produces a clear "no changes" result, not a GitHub 422.
- Re-running `pushToGit` with *changed* manifests updates the open PR instead of opening a second one, and the response says which happened.
- The commit author and PR body identify the authenticated user who requested the push, and a client-supplied `authorName`/`authorEmail` cannot override that identity.
- Remediate's PR behavior is unchanged after the extraction apart from two deliberate fixes: the empty-diff path and a non-default `baseBranch` in a shallow clone, both of which are broken today.
- No auto-merge path exists.
- An operator upgrading a deployment with `rbac.enforcement.enabled: true` learns from the changelog and the authorization docs that direct push now requires `apply`, and what to do instead of widening the binding.
- `npm run test:integration` green.

## Milestones

**Progress as of 2026-08-05:** M1–M4 complete. M5 complete except the changelog fragment, which is created during `/prd-done` per this project's release workflow rather than in-milestone. M6 is not started — it files a public issue describing a live credential-exposure path in shipped v1.25.0 and is awaiting a decision on disclosure. Nine commits on `prd-710-pull-request-workflow-for-pushtogit`; integration groups `recommend` (6/6) and `rbac` (34/34) green; unit suite 755 passing.

Three deliberate deviations from the plan, all ratified:
1. **`remediate.ts` changed in M1**, which the milestone did not anticipate. Adding the `no_changes` union member turned its `else` branch into a type error, and the old code would have reported an empty diff as a *failure*. It now switches on `status`. Verified behavior-preserving by a differential harness over 8,640 input combinations (0 mismatches).
2. **A third user-visible remediate change** beyond the two the success criteria allow: the `pushed_without_pr` message was reworded from "the repository is not hosted on GitHub" to "a pull request could not be opened automatically for this remote", because the anchored parser now also declines github.com URLs in shapes it cannot parse — the old sentence had become sometimes false.
3. **Empty diff now reports top-level `status: 'no_changes'` in direct push too**, not just PR mode. It previously returned `manifests_pushed` with `commitSha: undefined` — claiming success for a push that never happened.

- [x] **M1 — Extract the shared helper.** `createPullRequest()` in `git-utils.ts`; `handleGitCreatePr` becomes a wrapper; empty-diff handled (decision 3); base ref fetched when absent (decision 10); remediate regression coverage confirms no behavior change beyond those two fixes.
- [x] **M2 — PR mode.** Server-generated branch, PR creation, `gitPush.pullRequest` in response and session, identity-derived author and attributed PR body (decision 8), existing-PR reuse on re-run (decision 9), clone relocated to `./tmp/gitops-clones/`. Dead `PUSHTOGIT_TOOL_*` constants removed.
- [x] **M3 — Authorization.** `apply` required for direct push, `execute` sufficient for PR mode; `buildAgentInstructions` and `NEXT_ACTIONS` present only the permitted mode. Breaking change for RBAC-enabled deployments (scope item 9) — the changelog fragment and upgrade guidance land with this milestone, not after it.
- [x] **M4 — Tests.** Integration coverage extending the existing `GitOps Push Workflow` suite (`tests/integration/tools/recommend.test.ts:756`), following the real-PR pattern from `tests/integration/tools/remediate.test.ts:1277` — create, assert, then close the PR and delete the branch, with `DOT_AI_GIT_CREATE_DRAFT_PRS=true` (`internal-tools.ts:365-370`) keeping CodeRabbit off test PRs. Plus re-run behavior (unchanged manifests → no-changes; changed manifests → same PR updated) and attribution assertions. The RBAC gate reuses the existing per-tool `execute`/`apply` fixtures in `tests/integration/tools/rbac.test.ts` — `recommendExecuteUser` and `recommendApplyUser` and their `resourceNames`-scoped ClusterRoles (`rbac.test.ts:33-45,197-208`) are exactly the two identities this gate needs, so no new harness. Unit coverage for branch naming, empty-diff, and base-ref fetch.
- [ ] **M5 — Docs.** Tool docs (PR-mode example), authorization docs (verb rule for the two modes, the four enforcement limits, the client-reconnect note, and the upgrade paragraph), chart comments; regenerate OpenAPI; breaking-change changelog fragment in `changelog.d/`.
- [ ] **M6 — File the follow-up issue** for repository allowlisting with the credential-exposure framing from resolved question 3. Not a code change here, but the reason this PRD is allowed to defer it, so it should not be left implicit.

## Resolved questions

All four were answered by the reporter on 2026-08-04 ([comment](https://github.com/vfarcic/dot-ai/issues/710#issuecomment-5175923379)).

1. **Does an operator need to force PR mode for users who hold `apply`? — No switch ships.** The reporter's static `DOT_AI_AUTH_TOKEN` bypass is disabled (empty value; Dex/JWT is the only active auth path) and they have defined no broader operator or admin ClusterRole that a viewer group could be unioned with, so enforcement limits 1 and 3 — the two that argued for a process-level switch — do not apply to them. The verb gate alone is sufficient. They noted one outstanding item on their side: an admin-vs-viewer runtime test before they consider it fully confirmed. So `gitops.pullRequestMode` is **not** built; it is recorded here as the shape a switch would take if a second deployment needs one.

   Two limitations to keep on record rather than rediscover. First, the shipped `dotai-operator` and `dotai-admin` ClusterRoles grant `apply` on `tools` with no `resourceNames` (`charts/templates/rbac-enforcement.yaml`), so `apply` is all-or-nothing across tools unless an operator writes a custom `resourceNames`-scoped role — which is already the established pattern in the RBAC integration tests (`tests/integration/tools/rbac.test.ts:163-176`), so per-tool separation is available to anyone who needs it. Second, and irreducible: `deployManifests` and direct Git push are both `apply` on `recommend`, so no binding can separate them. A platform team that wants operators to keep `deployManifests` while being barred from direct push cannot be served by RBAC as designed.

   If that team ever appears, the better escape hatch is a **distinct verb** (e.g. `push`) rather than the chart value, because it stays inside the RBAC model and composes with `resourceNames` instead of adding a parallel configuration mechanism. Its cost is a real one — adding the verb to the shipped ClusterRoles is a public RBAC contract change — which is why `apply` is the right call now that nobody needs the distinction.

2. **GitHub Enterprise Server — not applicable.** The reporter is on github.com. Deferred; deriving the API base from the remote host stays a small change whenever someone asks.

3. **Repository allowlist — out of scope, but the stated reason for deferring was wrong and the follow-up issue needs reframing.** The original framing was that `repoUrl` is client-controlled against a shared token, so any authenticated user can push anywhere that token can reach, and that the reporter's repo-scoped `GithubAccessToken` via External Secrets handles it. It bounds the blast radius; it does not close the hole. `getAuthenticatedUrl` (`git-utils.ts:64-68`) embeds the server's token as HTTP basic auth into whatever URL the client supplied, and `pushToGit` validates `targetPath` but never the host — so any user with `execute` on `recommend` can name `https://attacker.example/x.git` and have the server deliver `DOT_AI_GIT_TOKEN`, or a GitHub App installation token, to a host they control. A repo-scoped token narrows what the attacker gains but is still a live credential for that repository, and the token also lands in the clone's `.git/config`.

   This is pre-existing behavior in v1.25.0, is not introduced or worsened by PR mode, and is not mitigated by it — which is why it stays out of scope here. It does mean the follow-up issue is a credential-exposure issue with an allowlist as one remedy, not a tidiness issue. Worth noting the codebase already solves the adjacent problem for PRD #621's per-request override tokens with a host-bound `GIT_ASKPASS` helper (`git-utils.ts:262-293`), keeping the token off the argv and out of `.git/config`; even that binds to the client-supplied host, so it defeats redirect-based leakage rather than a directly named attacker host. The env/GitHub-App path that `pushToGit` uses has neither protection.

4. **Is `execute` genuinely sufficient for PR mode? — Yes, in the reporter's deployment.** An org-wide ruleset blocks direct pushes and requires a PR on every repository, a required status check validates the generated claim before merge is possible, and there is no auto-merge, so a human must take a deliberate action to merge. They do not mandate a second formal approver anywhere in the org and consider that a uniform platform policy choice rather than a gap here.

   The authorization docs should therefore describe the gate honestly: what `execute` + PR mode guarantees is that **a human must act**, not that a second human reviews. Against an unprotected repository, or one with auto-merge configured GitHub-side, PR mode is direct push by a slower route.
