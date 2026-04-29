### Integration tests now create draft PRs to skip automated reviews

The remediate tool's GitOps test path creates real PRs against `vfarcic/dot-ai` to verify the end-to-end flow. These transient PRs were briefly triggering CodeRabbit reviews. The PR creation in `handleGitCreatePr` now honors a `DOT_AI_GIT_CREATE_DRAFT_PRS=true` env var (set only on the integration test pod) to create those PRs as drafts, which CodeRabbit skips by configuration. Production behavior is unchanged.
