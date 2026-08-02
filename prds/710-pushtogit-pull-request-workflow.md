# PRD #710: Pull Request Workflow for `pushToGit`

## Status

Draft

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

2. **The binding must be cluster-scoped.** The `deployManifests` check passes only `{toolName, verb}` with no namespace (`recommend.ts:243-246`), and `check-access.ts:96` sets `namespace` on the SubjectAccessReview only when one is supplied — so the review is cluster-scoped and a namespaced `RoleBinding` will not satisfy it. The PR-mode check inherits the same shape. `ClusterRoleBinding` is required.

3. **Static token users bypass RBAC entirely** (`check-access.ts:70-73`, `authorization.md:20`). Any caller presenting `DOT_AI_AUTH_TOKEN` is allowed unconditionally and bindings are irrelevant. So the gate covers OAuth end users only; any automation, CI job, or UI path authenticating with the static token retains direct push regardless of role bindings.

4. **`rbac.enforcement.enabled` must be on.** Otherwise `isRbacEnabled()` returns false and every authenticated user has full access (`check-access.ts:77-79`) — the new verb check becomes a no-op along with all the existing ones.

Items 1 and 3 are the substantive argument *for* the server-side switch in open question 1: the RBAC route's enforcement is only as strong as a binding audit plus token discipline, whereas a process-level switch cannot be widened by a stray RoleBinding or sidestepped by a token.

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

4. **Mode selection.** A `pullRequest: boolean` parameter is the selector; RBAC is the enforcement. Open question 1 covers whether an operator also needs a server-side switch to force PR mode for users who *do* hold `apply`.

5. **Response and session shape.** Mirror remediate's `pullRequest: { url, number, branch, baseBranch, filesChanged }` (`remediate.ts:212-219`), nested under `gitPush`. Do **not** add a value to the session `stage` enum (`recommend.ts:57`) — it is consumed by dot-ai-ui for page-refresh support, and a new value is a breaking change for a downstream consumer. `stage: 'pushed'` stays; `gitPush.pullRequest` carries the new information.

6. **Any new configuration is a first-class chart value, not an env var.** The project is Kubernetes-only, so `charts/values.yaml` is the configuration interface; the `DOT_AI_*` env vars throughout the codebase are legacy from when it ran in multiple environments. If open question 1 concludes a switch is needed, it ships as a value — `gitops.pullRequestMode: client|always|never` (no `gitops` top-level key exists yet) — rendered into the container env by `charts/templates/deployment.yaml`, exactly as `rbac.enforcement.enabled` renders `DOT_AI_RBAC_ENABLED` (`deployment.yaml:174-177`). The env var is an internal implementation detail with no user-facing contract. Documenting it under `extraEnv` is not an acceptable interim step.

7. **Non-GitHub hosts.** `api.github.com` and the `github\.com[/:]` regex are hardcoded (`internal-tools.ts:334,351`). GitLab, Bitbucket, and GitHub Enterprise Server fall into the existing success-with-error branch (`internal-tools.ts:337-346`): the branch is pushed, the PR is not created. For a never-touch-`main` workflow that partial success is defensible, but the response must state it unambiguously rather than reading as a completed PR. GHES support is out of scope (open question 2).

## Scope

**In scope**

1. `createPullRequest()` extracted into `src/core/git-utils.ts`; `handleGitCreatePr` reduced to a path-validating wrapper; the hardcoded `'User-Agent': 'dot-ai-remediate'` (`internal-tools.ts:358`) generalized.
2. Empty-diff handling in the shared helper (decision 3), benefiting remediate as well.
3. PR mode on the `pushToGit` stage: server-generated head branch, PR against the base branch, `gitPush.pullRequest` in the response and session, no auto-merge.
4. RBAC: direct push requires `apply` on `recommend`; PR mode requires `execute`. `buildAgentInstructions` and `NEXT_ACTIONS` (`generate-manifests.ts:42`, `:130`) updated to present only the permitted mode.
5. Clone relocated from `os.tmpdir()` to `./tmp/gitops-clones/<solutionId>/` — satisfies the project's `./tmp` convention, makes the path acceptable to `validatePathWithinClones`, and inherits TTL cleanup from `cleanupOldClones` (`internal-tools.ts:439`).
6. Removal of the unused `PUSHTOGIT_TOOL_*` constants (`push-to-git.ts:33-61`).
7. Integration coverage for PR mode and for the RBAC gate; unit coverage for branch naming and empty-diff.
8. Docs: `docs/ai-engine/tools/recommend.md:410-460` (PR-mode example), `docs/ai-engine/setup/authorization.md` (the verb rule for the two modes **and** the four enforcement limits above, since an operator relying on the gate needs to know what can defeat it), `charts/values.yaml:235-253` (GitHub App needs `Pull requests: write` alongside `Contents: write`). OpenAPI regenerates from the Zod schema via `scripts/generate-openapi.sh`.

**Out of scope**

- Auto-merge in any form. Explicitly rejected by the requester and by this design.
- Repository allowlisting (open question 3) — related, separately motivated, own issue.
- GitHub Enterprise Server / GitLab / Bitbucket PR APIs (open question 2).
- Helm solutions — still rejected at `push-to-git.ts:135-151`; PRD #403 owns that. Crossplane claims are raw manifests, so the reporter's case is unaffected.
- Operate's GitOps path (PRD #363). It should consume `createPullRequest()` when built, but nothing here depends on it.

## Success Criteria

- A `pushToGit` call in PR mode against a branch-protected repository creates a feature branch, opens a PR, and returns its URL and number without ever writing to the protected branch.
- The head branch is server-generated and cannot be influenced by any client-supplied parameter.
- With `apply` denied, direct push is refused and PR mode still succeeds — the workflow is enforced server-side, not by client cooperation.
- The four conditions the gate depends on (additive bindings, cluster-scoped binding required, static-token bypass, `rbac.enforcement.enabled`) are documented where an operator configuring PR-only will read them, not left implied.
- Re-running `pushToGit` with unchanged manifests produces a clear "no changes" result, not a GitHub 422.
- Remediate's PR behavior is byte-for-byte unchanged after the extraction, with the empty-diff path additionally fixed.
- No auto-merge path exists.
- `npm run test:integration` green.

## Milestones

- [ ] **M1 — Extract the shared helper.** `createPullRequest()` in `git-utils.ts`; `handleGitCreatePr` becomes a wrapper; empty-diff handled (decision 3); remediate regression coverage confirms no behavior change.
- [ ] **M2 — PR mode.** Server-generated branch, PR creation, `gitPush.pullRequest` in response and session, clone relocated to `./tmp/gitops-clones/`. Dead `PUSHTOGIT_TOOL_*` constants removed.
- [ ] **M3 — Authorization.** `apply` required for direct push, `execute` sufficient for PR mode; `buildAgentInstructions` and `NEXT_ACTIONS` present only the permitted mode. Settles open question 1, since the enforcement limits decide whether a server-side switch is also needed.
- [ ] **M4 — Tests.** Integration coverage extending the existing `GitOps Push Workflow` suite (`tests/integration/tools/recommend.test.ts:756`), following the real-PR pattern from `tests/integration/tools/remediate.test.ts:1277` — create, assert, then close the PR and delete the branch, with `DOT_AI_GIT_CREATE_DRAFT_PRS=true` (`internal-tools.ts:365-370`) keeping CodeRabbit off test PRs. Plus the RBAC gate and unit coverage for branch naming and empty-diff.
- [ ] **M5 — Docs.** Tool docs (PR-mode example), authorization docs (verb rule for the two modes plus the four enforcement limits and the client-reconnect note), chart comments; regenerate OpenAPI; changelog fragment in `changelog.d/`.

## Open questions

1. **Does an operator need to force PR mode for users who hold `apply`?** RBAC covers the reporter's case: revoke `apply` and PR mode is the only path. It does not cover two situations — a platform team that wants operators to retain `apply` for `deployManifests` while still barring direct push to Git, and the enforcement limits above (additive bindings, static-token bypass), which make the RBAC route only as strong as a binding audit plus token discipline. Either would need a server-side switch — per decision 6, a chart value `gitops.pullRequestMode: client|always|never`, defaulting to `client` for backward compatibility — which cannot be widened by a stray binding or sidestepped by a token.

   Worth confirming with the reporter before adding configuration surface that may be unnecessary. Their `deployManifests` is already fully blocked, so the first situation does not apply to them; whether the second does is a question about how many bindings and tokens their landing zone actually has. Note that a chart value is a supported-indefinitely contract, so the cost of guessing wrong here is higher than it would be for a bare env var — which is a further reason to settle the question before M3 rather than adding the knob speculatively.

2. **GitHub Enterprise Server.** The reporter is on github.com, so this is not blocking. Deriving the API base from the remote host is a small change; the question is whether to fold it in here or defer until someone asks.

3. **Repository allowlist.** `repoUrl` is entirely client-controlled and authenticated with a shared server token, so any authenticated user can push to any repository that token can reach. The reporter mitigates this with a repo-scoped `GithubAccessToken` via External Secrets, but for a shared platform service an allowlist is the natural companion control — as a chart value per decision 6. Deliberately out of scope here — it needs its own issue rather than being smuggled into this one.

4. **Is `execute` genuinely sufficient for PR mode?** The argument is that a PR is a proposal and the human merge gate is the real control. It assumes the target repository actually enforces review. Against an unprotected repository with auto-merge configured on the GitHub side, PR mode is effectively direct push by a slower route. Worth stating explicitly in the authorization docs rather than leaving implied.
