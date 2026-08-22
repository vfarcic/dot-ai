# Capabilities response contract (PRD #714)

Machine-consumable golden fixtures for the `manageOrgData` **capabilities**
`list` / `progress` / `delete` responses. These files are the published,
test-enforced wire contract: downstream consumers (notably
[`dot-ai-controller`](https://github.com/vfarcic/dot-ai-controller)) unmarshal them in
their own tests, so changing the response shape in this repo fails those builds until the
contract is updated deliberately.

## Files

| Fixture | What it pins |
| --- | --- |
| `list-full.json` | Full capability projection (id, resourceName, apiVersion, capabilities, description, …). |
| `list-identity-only.json` | `identityOnly` projection — **only** `id` + `resourceName` per item (the diff payload). |
| `list-truncated.json` | `truncated: true` with `returnedCount < totalCount` — an incomplete list a diff must not trust. |
| `list-empty.json` | Collection not yet initialized — empty list, `success: true`. |
| `list-backend-unavailable.json` | Qdrant unreachable — outer `success: true`, inner `data.result.success: false`. |
| `delete.json` | Successful delete acknowledgement (`deletedCapability`). |
| `progress-completed.json` | Completed scan progress envelope. |

## The four invariants these fixtures encode

1. **Envelope nesting.** The REST layer wraps every tool result in a
   `ToolExecutionResponse`. The real payload therefore lives at
   `data.result.data.*` — for a list, the items are at
   `data.result.data.capabilities`, with `totalCount`, `returnedCount`, `limit`, and
   `truncated` alongside.

2. **`resourceName` vs `id`.** `id` is the deterministic capability UUID
   (`sha256("capability-" + resourceName)`); `resourceName` carries the `Kind.group`
   identity used to match capabilities when computing a diff. Match on `resourceName`,
   not `id`, when reconciling against cluster resources.

3. **Inner-success rule.** The outer envelope `success` only means the handler did not
   throw. The real operation result is `data.result.success`. When the backend is
   unreachable it is `false` (see `list-backend-unavailable.json`) even though the outer
   envelope is `success: true`. Consumers must read the inner flag before trusting `data`.

4. **`truncated` is authoritative; `totalCount` is not a completeness oracle.**
   `truncated` is derived from the list read itself and is the only reliable "more remain"
   signal. When `truncated` is `false`, `totalCount == returnedCount` exactly (the read
   covered the whole set). When `truncated` is `true`, `totalCount` comes from a separate,
   non-atomic count and may momentarily disagree with the page while a scan writes
   concurrently — a diffing consumer must key off `truncated`, not `returnedCount <
   totalCount`.

## Regenerating

Fixtures are generated from the **real** handlers (no live cluster required) and guarded
on every unit-test run by
[`tests/unit/contracts/capabilities-contract.test.ts`](../../tests/unit/contracts/capabilities-contract.test.ts).
A shape change makes that test fail until the contract is regenerated:

```sh
npm run generate:contracts
```

Metadata fields (`meta.timestamp`, `meta.requestId`, `meta.version`,
`data.executionTime`) are pinned to fixed values so the fixtures stay deterministic; real
responses carry live values in those fields.
