## New `/prd-full` Prompt — Autonomous PRD Execution Through PR

A new shared prompt, `/prd-full`, runs an entire PRD lifecycle without prompting for confirmation between steps and stops once a pull request has been created. Composes the existing `/prd-start`, `/prd-next`, `/prd-update-progress`, and `/prd-done` prompts with a global "do not pause" rule and a hard stop after PR creation, so the user can review the result before merging.

Required arguments: `prdNumber` (the PRD to implement) and `mode` (`branch` or `worktree`, pre-answering the isolation choice that `/prd-start` would otherwise ask).
