# PRD #706: Parallelize Per-Solution Question Generation in `recommend`

## Status

Draft

## Problem

`recommend` generates configuration questions one solution at a time, serially. This is the single longest stretch of a `recommend` call — the report in [#704](https://github.com/vfarcic/dot-ai/discussions/704) measured ~150s end to end with the bulk of it here, and it is the point where clients observably freeze.

### Root cause (verified against the code)

`src/core/schema.ts:857-865`:

```ts
// Phase 3: Generate questions for each capability-based solution
for (const solution of solutionResult.solutions) {
  solution.questions = await this.generateQuestionsWithAI(
    intent,
    solution,
    _explainResource,
    interaction_id
  );
}
```

Each iteration is a full LLM round-trip (`schema.ts:1447`). Nothing in the loop depends on a prior iteration: `generateQuestionsWithAI` (`schema.ts:1314`) takes one solution and returns that solution's questions.

**The codebase already parallelizes the inner fan-out of this same function.** `schema.ts:1349-1350` runs `Promise.all` over `solution.resources` to fetch resource schemas. The outer loop being serial is an inconsistency, not a deliberate constraint.

### Concurrency is small and bounded

`prompts/resource-selection.md:55` instructs the model to *"Generate 2-5 different solutions"*, and `src/tools/recommend.ts:525` applies a defensive `slice(0, 5)`. So N is 2-5 in practice with a hard ceiling of 5 in the response path.

This resolves what would otherwise be the main design risk: the burst is at most a handful of concurrent generations, so a plain `Promise.all` is acceptable and a semaphore/bounded-concurrency helper is unnecessary complexity.

### Related waste (cheap to fix alongside)

Questions are generated for **every** solution at `schema.ts:857`, but `recommend.ts:525` then discards everything past the top 5. The 2-5 instruction is a soft prompt directive, not enforced — if the model over-generates, that question-generation work is paid for in both latency and tokens and then thrown away. Applying the cap *before* generation rather than after makes the waste structurally impossible.

### Not in this loop (avoid optimizing the wrong thing)

- `src/tools/recommend.ts:527` — also a `for` loop over solutions, but pure file writing and summary building. No AI calls.
- `generateQuestionsForHelmChart` (`schema.ts:1543`) — a single call on one chart, invoked from `src/tools/choose-solution.ts:80`, a different tool. Unaffected.

## Solution

Replace the serial loop at `schema.ts:857-865` with concurrent generation via `Promise.all`, and apply the top-5 cap before generating rather than after.

## Design decisions to settle

1. **Partial failure semantics.** Today a throw on any solution aborts the whole `recommend` — `generateQuestionsWithAI` throws on malformed input (e.g. `schema.ts:1352`, missing `resourceName`). `Promise.all` preserves that behavior exactly; `Promise.allSettled` would let the remaining solutions through with one missing its questions. Preserving current behavior is the safe default, but it should be an explicit choice rather than a side effect of which method gets used.
2. **Retry budget interaction.** Concurrent calls share the retry configuration in `src/core/ai-retry-config.ts`. With N ≤ 5 this should be a non-issue, but confirm a provider-side 429 on one solution doesn't cascade.
3. **Tracing.** `withAITracing` wraps each `sendMessage`. Confirm concurrent spans nest sanely and `interaction_id` correlation still holds when the calls interleave.

## Interaction with #705

[#705](https://github.com/vfarcic/dot-ai/issues/705) makes long calls *survivable* by emitting progress so proxies stop dropping connections. This PRD makes them *shorter*. Different axes — neither subsumes the other, and a `recommend` that still takes 150s but reports progress is fixed for the load balancer while remaining slow.

**Whichever lands second must account for the other.** #705 scope item 3 proposes `progress`/`total` counters across the per-solution loop, which assumes ordered completion. Once generation is concurrent, the counters still read correctly as "N of M done" but per-solution phase *labels* lose their sequencing and should become completion-ordered rather than index-ordered.

## Scope

**In scope**

1. Concurrent question generation at `src/core/schema.ts:857-865` via `Promise.all`.
2. Apply the top-5 cap before generation instead of after (`recommend.ts:525`), so questions are never generated for discarded solutions.
3. An explicit, documented decision on partial-failure semantics.
4. Integration test coverage asserting all solutions still receive questions and existing failure behavior is preserved.

**Out of scope**

- Bounded-concurrency / semaphore infrastructure — unnecessary at N ≤ 5.
- Progress reporting — #705.
- Any change to prompt content or the number of solutions the model produces.
- The Helm question path (`schema.ts:1543`) — single call, not a loop.

## Success Criteria

- Wall-clock time for the question-generation phase of `recommend` drops to roughly the slowest single generation rather than the sum, on a multi-solution intent.
- Every returned solution still carries its questions, with identical content to the serial implementation.
- Failure behavior is unchanged from today unless deliberately changed under decision 1, in which case the new behavior is documented.
- No question generation occurs for solutions discarded by the top-5 cap.
- `npm run test:integration` green.

## Milestones

- [ ] **M1 — Cap before generate.** Move the top-5 cap ahead of question generation so discarded solutions never incur an AI call.
- [ ] **M2 — Parallelize.** Replace the serial loop with `Promise.all`; settle and document partial-failure semantics.
- [ ] **M3 — Verify tracing.** Confirm concurrent `withAITracing` spans and `interaction_id` correlation behave correctly when calls interleave.
- [ ] **M4 — Tests.** Integration coverage for multi-solution intents: all solutions receive questions, content matches serial behavior, failure path preserved. `npm run test:integration` green.
- [ ] **M5 — Measure.** Record before/after wall-clock on a representative multi-solution intent. Changelog fragment in `changelog.d/`.

## Open questions

1. **Partial failure** — preserve today's abort-on-first-error, or degrade gracefully with `allSettled`? (Decision 1 above.)
2. **Should the top-5 cap move into the prompt contract** as an enforced limit rather than a post-hoc slice, so the model's output shape and the response path can't drift?
