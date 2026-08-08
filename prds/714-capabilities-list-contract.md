# PRD #714: Capabilities List Contract, Readiness Signal, and Published Response Shape

## Status

Draft

## Problem

`dot-ai-controller` reconciles the `capabilities` collection by listing what the cluster has, listing what the MCP server already stored, diffing the two, and scanning the difference. On a fresh install the collection can stay empty indefinitely while every status surface reports health. Reported in [discussion #709](https://github.com/vfarcic/dot-ai/discussions/709) by @FlorianGerdes, who hit it repeatedly on fresh `dot-ai-stack` installs and found that restarting the controller was the only reliable fix.

Most of the defect is controller-side and is owned by [dot-ai-controller#55](https://github.com/vfarcic/dot-ai-controller/issues/55). This PRD covers the three things the **server** is responsible for. Each one is a case of the server being technically correct while giving a machine consumer nothing it can act on.

### 1. The `list` array is capped at 100, with no way to ask for more

`src/core/capability-operations.ts:102`:

```ts
const limit =
  Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;
```

A client asking for 10 000 silently receives 100. The controller needs the complete set to compute a diff; a truncated list makes every unreturned resource look missing, which drives a full re-scan of the cluster on every reconcile — hundreds of AI inference calls per cycle.

The cap reads as a display guard rather than a deliberate API limit: the same response carries `clientInstructions` telling an agent to "display capability list with IDs prominently visible" (`capability-operations.ts:141-150`), and the description advertises "default: 100" (`capability-tools.ts:77`) rather than a maximum. Nothing in the code or PRD history states an intent to bound machine consumers.

Raising it is cheap on the read path, because the expensive part already happens unconditionally. `getCapabilitiesCount()` calls `getAllData()` with no limit (`capability-vector-service.ts:214-218`), which resolves to `limit ?? 10000` (`base-vector-service.ts:312-316`) — a full 10 000-document scroll **with payloads** on every single `list` call, including `limit: 1`. The cap trims what gets serialized, not what gets read. So the marginal cost of returning more is response size, not database work; and there is an unrelated efficiency bug sitting right there, since counting does not need payloads at all.

Note that `totalCount` is *not* capped, and is therefore already an accurate signal a client could use.

### 2. The response shape has never been published, so consumers hand-write it wrong

The REST layer wraps tool output (`src/interfaces/rest-api.ts:918-930`):

```ts
const response: ToolExecutionResponse = {
  success: true,
  data: { result: transformedResult, tool: toolName, executionTime },
  meta: { ... },
};
```

and the tool output is itself `{ success, operation, dataType, data: { capabilities, totalCount, returnedCount, limit }, ... }` (`capability-operations.ts:113-151`). The real path is therefore `data.result.data.capabilities`, as this repo's own integration tests assert (`tests/integration/tools/manage-org-data-capabilities.test.ts:157`).

That shape exists only in the implementation and in test assertions. It was never published, so [dot-ai-controller PRD #34](https://github.com/vfarcic/dot-ai-controller/blob/main/prds/done/34-autonomous-capability-scanning.md#L136-L158) documented it by hand as `data.result.capabilities` — one level too shallow — and the controller, its unit fixtures, and its e2e mock MCP server all faithfully implemented the wrong spec. The mock validated the bug, so CI stayed green for the entire life of the defect.

Two further details a hand-written contract cannot be expected to get right:

- **`id` is not the resource identity.** It is a deterministic UUID, `sha256("capability-" + resourceName)` reformatted 8-4-4-4-12 (`src/core/capabilities.ts:328-337`). The field carrying `Kind.group` is `resourceName` (`capability-operations.ts:125`, produced at `capability-scan-workflow.ts:581`). PRD #34's example elided the array contents entirely (`"capabilities": [...]`), so nothing signalled this.
- **`success` at the envelope is not the operation result.** `manageOrgData` catches every error and returns normally (`src/tools/organizational-data.ts:868-905`), so the envelope's `success: true` means only "the handler did not throw." An unreachable Qdrant produces `{ success: false, error: { message: 'Vector DB (Qdrant) connection required' } }` at `data.result` (`capability-operations.ts:884-897`) under **HTTP 200 with envelope `success: true`**.

  Reading the inner flag does correctly separate the two states that matter: an absent collection returns inner `success: true` with an empty array (`capability-operations.ts:903-913`), which is the honest answer on a fresh install, whereas an unreachable backend returns inner `success: false`. The contract is sound — it is just undiscoverable, and the one client that most needs it got it wrong.

### 3. Readiness does not check the capability subsystem — this is what makes it flaky

`src/interfaces/mcp.ts:723-727`:

```ts
if (req.url === '/healthz' && req.method === 'GET') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok' }));
```

A static literal, and the chart points **both** probes at it (`charts/templates/deployment.yaml:265-278`). The pod is Ready as soon as the HTTP listener binds — before Qdrant is reachable, before the collection exists, before embeddings can serve a vector.

Local embeddings make this worse rather than better. `validateEmbeddingService` checks `getStatus().available` (`organizational-data.ts:96-125`), which returns a flag set at construction from environment configuration (`src/core/embedding-service.ts:308-309`, `432-434`). It is a "was this configured" check, not a "can this serve a request" check, so it passes while the TEI pod is still pulling its model.

This is the root of "flaky" rather than "broken." Everything downstream — retries, resync intervals, better error surfacing — is compensation for a Ready signal that does not mean ready. A consumer ordering itself behind this pod has no way to wait for the subsystem it actually depends on.

The check already exists and is not wired to anything. `src/tools/version.ts:388-445` computes `vectorDBHealthy`, `collectionAccessible`, `storedCount`, and `systemReady` for the `version` tool — the exact signal a readiness probe needs.

## Solution

Four changes, independent of each other and of the controller work:

1. **Let a machine consumer request the whole set.** Raise the ceiling well above cluster-realistic resource counts, keep the default at 10 for interactive callers, and stop pretending a silently-truncated list is a successful answer.
2. **Add an identity-only projection.** The controller needs `resourceName` and nothing else; today the cheapest way to get 400 of those is 400 full records with descriptions and capability arrays. A projection keeps the payload proportional to the need.
3. **Publish the response shape as a consumable artifact**, so downstream repos build mocks from the real contract instead of from prose. This is the change that prevents recurrence; the other three fix instances.
4. **Add a readiness endpoint that verifies the capability subsystem**, reusing `version.ts`'s diagnostics, and point the chart's `readinessProbe` at it while `livenessProbe` stays on `/healthz`.

## Design decisions to settle

1. **The cap becomes a real maximum, and truncation becomes visible.** `returnedCount` and `totalCount` are both already in the response (`capability-operations.ts:136-138`), so a client *can* detect truncation — but only if it knows to look. Since a diff computed from a truncated list is actively harmful, the response should make the condition explicit (a `truncated: boolean`, or the existing pair documented as the mandatory check) rather than leaving it inferable. The consuming guard is specified in dot-ai-controller#55.

2. **Do not change HTTP status codes.** Returning 503 for "Vector DB connection required" would be a better contract in isolation, but every existing consumer — dot-ai-ui, dot-ai-cli, the agent tool loop — is built against "`manageOrgData` returns 200 and you read the inner flag." Changing it is a silent breaking change across four repos for a problem that is fully solved by documenting the inner flag. Rejected; the inner `success` is the contract and gets published as such.

3. **Readiness is a new path, not a change to `/healthz`.** `/healthz` keeps its current always-200 behavior for liveness — a subsystem outage must not restart the pod, since restarting fixes nothing and drops in-flight scan sessions. `/readyz` carries the substantive check. Both stay unauthenticated for kubelet.

4. **`/readyz` must not be expensive.** The probe runs every 5s. `version.ts`'s check calls `healthCheck()`, `collectionExists()`, and a count — and today counting scrolls 10 000 documents with payloads (decision 5). The probe therefore needs a cached result with a short TTL, or the count must get cheap first. A readiness probe that scrolls the whole collection twelve times a minute is a regression, not a fix.

5. **Fix `getCapabilitiesCount()` while in this code.** Counting by fetching every document with payloads (`capability-vector-service.ts:214-218` → `base-vector-service.ts:312-316`) is wrong independently of this PRD, and it gates both decision 4 and the cost argument for raising the limit. Qdrant exposes a count API; the plugin boundary is `packages/agentic-tools/src/qdrant/operations.ts`, so this needs a `vector_count` operation rather than a change to `vector_list`. Per the MCP-vs-plugin split, the count belongs in the plugin.

6. **Whether the limit ceiling is configurable is deliberately deferred.** A hardcoded high ceiling (10 000, matching every other internal limit in the codebase — `manage-knowledge.ts:485`, `rest-api.ts:3135`, `embedding-migration-handler.ts:123`) needs no new chart value and no new user-facing contract. Adding `capabilities.listLimit` to `charts/values.yaml` would be a permanently-supported knob for a number no operator has a reason to tune. If a real cluster ever exceeds 10 000 resource types, pagination is the correct answer, not a bigger number.

7. **The published contract must be executable, not prose.** PRD #34 proves prose fails: it was written in good faith, reviewed, and wrong in three ways. Whatever ships — a JSON fixture generated from a real response, an OpenAPI schema for the tool result, or a golden file the integration suite regenerates — has to be something the controller's tests can consume directly, so a shape change in this repo breaks the controller's build rather than its production behavior. The specific mechanism is open question 1.

## Scope

**In scope**

1. Raise the `list` ceiling for `dataType: 'capabilities'` (`capability-operations.ts:100-103`); default stays 10; update the parameter description (`capability-tools.ts:77`) to state the maximum rather than only the default.
2. Make truncation explicit in the response (decision 1).
3. Identity-only projection for `list`, returning `resourceName` (and `id` for delete-by-id callers) without descriptions, capability arrays, or printer columns.
4. `vector_count` in `packages/agentic-tools`, and `getCapabilitiesCount()` rewritten to use it (decision 5).
5. `GET /readyz`, unauthenticated, reusing the diagnostics at `version.ts:388-445` with a short-TTL cache (decisions 3, 4). `charts/templates/deployment.yaml:272-278` repointed; `livenessProbe` unchanged.
6. A machine-consumable contract artifact for the `capabilities` `list` / `scan` / `progress` / `delete` responses (decision 7), covering the envelope nesting, `resourceName` vs `id`, and the inner-`success` rule.
7. Integration coverage: a list above 100 returns everything; truncation is flagged; the projection returns the documented fields; `/readyz` is not-ready while Qdrant is unreachable and ready once the collection is accessible.
8. Docs: `docs/` coverage of the readiness endpoint and the list contract; chart comments; changelog fragment in `changelog.d/`.

**Out of scope**

- Pagination (offset/cursor) for `list`. Decision 6 — a raised ceiling covers every realistic cluster, and pagination is the right answer only past that.
- Changing HTTP status codes for operation-level failures (decision 2).
- Making the scan synchronous, or adding a completion webhook. `handleFireAndForgetScan` (`organizational-data.ts:186-255`) stays fire-and-forget; the `progress` operation is the completion signal and the controller consuming it is dot-ai-controller#55's work.
- Durable scan sessions. `handleCapabilityProgress` reads session files from the pod filesystem (`capability-operations.ts:512-545`), so progress does not survive a restart and would break with more than one replica. The chart pins `replicas: 1` (`charts/templates/deployment.yaml:13`), so this is not currently a bug — but it is a real constraint on the controller's polling, recorded here and tracked as open question 3 rather than fixed by this PRD.
- Any change to how `resourceName` is derived (`capability-scan-workflow.ts:576-599`). The controller's `Kind.group` convention and this one already agree; changing either is a data migration.
- The unrelated embeddings dimension/model mismatch in #617.

## Success Criteria

- A `list` for 10 000 capabilities returns all of them on a cluster with several hundred resource types, and a client that asks for more than the ceiling can tell that its list was truncated without comparing two counters it was never told about.
- The identity-only projection returns a payload proportional to the number of resources, not to their descriptions.
- `list` no longer scrolls the entire collection with payloads just to produce `totalCount`.
- `/readyz` reports not-ready while Qdrant is unreachable or the collection is inaccessible, reports ready once capability operations can actually serve, and costs no meaningful work at a 5s probe interval.
- A pod that is Ready can serve a capability scan trigger — the condition that made #709 a race no longer exists.
- The contract artifact is consumed by dot-ai-controller's tests, such that changing the response shape here fails that build. Verified by actually wiring it up, not by publishing it and assuming.
- `npm run test:integration` green.

## Milestones

- [ ] **M1 — Cheap counting.** `vector_count` in the plugin; `getCapabilitiesCount()` rewritten. Unblocks M2's cost argument and M4's probe. Unit coverage in `packages/agentic-tools/tests/unit/`.
- [ ] **M2 — Listing a machine can trust.** Ceiling raised, default unchanged, truncation explicit, identity-only projection. Integration coverage for each.
- [ ] **M3 — Published contract.** The artifact from decision 7, generated from real responses and covering the envelope nesting, `resourceName` vs `id`, and the inner-`success` rule. Settles open question 1.
- [ ] **M4 — Readiness.** `GET /readyz` with cached diagnostics; chart `readinessProbe` repointed; integration coverage for both states.
- [ ] **M5 — Docs and release.** Readiness endpoint and list contract documented; chart comments; changelog fragment. Then confirm on #709 with the specific paths and field names, since the reporter is running a downstream fork and needs to know which of their patches this supersedes.

## Open questions

1. **What form should the published contract take?** A generated JSON fixture is the least ceremony and the easiest for Go tests to unmarshal against. An OpenAPI schema for the tool result is more discoverable and fits `scripts/generate-openapi.sh`, but `manageOrgData` is one endpoint with a union of result shapes across operations, so the schema would be loose enough to have let PRD #34's error through anyway. Leaning fixture, because the failure mode to prevent is specifically "someone hand-wrote the JSON," and only a real captured response prevents that. Worth settling before M3.

2. **Should the identity projection be a new `operation`, or a parameter on `list`?** A `fields` parameter generalizes but invites bikeshedding about which fields; a distinct operation (`listIds`) is blunt and self-documenting. The controller is the only known consumer, which argues for the blunt option — but dot-ai-ui also lists capabilities and may want the light payload for its table view. Worth asking whether dot-ai-ui wants it before choosing.

3. **Does the controller's `progress` polling need durable sessions?** With `replicas: 1` and filesystem sessions, polling works today but reports "session not found" after any MCP restart — which is precisely when the controller most needs to know a scan died. The controller can treat that as "unknown, re-diff on next resync," which is correct and needs nothing here. But if the answer for dot-ai-stack is ever more than one replica, progress breaks silently. Confirm the intended replica story before dot-ai-controller#55 builds polling on top of it.

4. **Is `/readyz` the right name given the plugin already uses it?** `agentic-tools` serves `/health` and `/ready` on its own port (per #617's logs). Matching that (`/ready`) is more consistent within the stack; `/readyz` matches Kubernetes convention and the existing `/healthz` in this process. Minor, but worth being deliberate since it becomes a chart contract.
