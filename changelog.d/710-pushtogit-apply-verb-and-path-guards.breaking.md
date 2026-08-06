**Breaking change.** Direct push to Git via `pushToGit` now requires the `apply` verb on `recommend`; pull request mode needs only `execute`. Any deployment with `rbac.enforcement.enabled: true` whose users push directly with a viewer-level (`execute`-only) binding stops working on upgrade. The obvious remedy — granting `apply` — also unblocks `deployManifests`, which is usually the opposite of what such an operator wants. The intended migration is to adopt PR mode, not to widen the binding. Exposure is bounded because `rbac.enforcement.enabled` defaults to `false`. See the [authorization upgrade section](https://devopstoolkit.ai/docs/mcp/ai-engine/setup/authorization) for the full guidance.

Two more path-safety behavior changes ship alongside this:

- `pushToGit` refuses a `targetPath` that traverses, or itself is, a symbolic link in the GitOps repository.
- `pushToGit` and `remediate` now refuse to write any path that resolves inside the git control directory (`.git`), including through a symlink committed in the repository; the whole batch of files is validated before any of it is written.
