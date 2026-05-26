---
name: dot-ai-prd-full
description: Run a PRD end-to-end autonomously — start, iterate until done, then create a PR. Stops after PR creation for manual review.
user-invocable: true
---

# prd-full

Run a PRD end-to-end autonomously — start, iterate until done, then create a PR. Stops after PR creation for manual review.

## Arguments

- `prdNumber` (required): PRD number to implement (e.g., 306). Required — no auto-detection.
- `mode` (required): Isolation strategy for this PRD's work. Must be `branch` or `worktree`. Pre-answers the branch-vs-worktree decision in `/prd-start`.
