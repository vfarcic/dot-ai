---
name: prd-full
description: Run a PRD end-to-end autonomously — start, iterate until done, then create a PR. Stops after PR creation for manual review.
category: project-management
arguments:
  - name: prdNumber
    description: PRD number to implement (e.g., 306). Required — no auto-detection.
    required: true
  - name: mode
    description: Isolation strategy for this PRD's work. Must be `branch` or `worktree`. Pre-answers the branch-vs-worktree decision in `/prd-start`.
    required: true
---

# PRD Full - Autonomous PRD Implementation Through PR

Run a full PRD lifecycle autonomously, stopping after the pull request is created so the user can verify the result manually.

## Arguments

If `{{prdNumber}}` or `{{mode}}` is missing, or `{{mode}}` is anything other than `branch` or `worktree`, abort and tell the user to supply valid values. Do not auto-detect.

## Global rule

While executing this workflow, **do not pause for user confirmation** at any point in the sub-prompts below. Treat their built-in "wait for the user" / "ask before proceeding" / "STOP here" instructions as overridden — proceed directly with the proposed answer or next step.

Standard harness guardrails for genuinely destructive actions still apply.

## Flow

1. **Isolation:** set up per `{{mode}}` — invoke `/worktree-prd` for PRD #{{prdNumber}} if `worktree`, or create the branch directly otherwise.
2. **Start:** run `/prd-start {{prdNumber}}`. Skip its branch-creation step (Step 1 already handled it).
3. **Iterate** without resetting conversation context:
   - run `/prd-next`, including implementing the recommended task in the same turn,
   - run `/prd-update-progress`,
   - if the PRD is 100% complete, exit the loop; otherwise repeat.
4. **Finish:** run `/prd-done` **only up to and including PR creation**. Do not run its review/merge, issue-closure, or branch-cleanup steps.
5. Output the PR URL and branch name, then stop.
