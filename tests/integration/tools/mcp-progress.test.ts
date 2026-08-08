/**
 * Integration Test: MCP Progress Notifications (PRD #705)
 *
 * Unlike every other tool test in this suite — which drives the server through
 * the REST path (`POST /api/v1/tools/<tool>` via `HttpRestApiClient`) — progress
 * notifications only exist on the **MCP protocol path**. `_meta.progressToken`,
 * `notifications/progress`, and the SSE stream that carries them never touch the
 * REST router (`isApiRequest` short-circuits `/api/v1/...` before any of this).
 *
 * So this test cannot use `IntegrationTest`/`httpClient`. It connects a real MCP
 * `Client` over `StreamableHTTPClientTransport` to the same server-under-test
 * (`MCP_BASE_URL`, root path, `Authorization: Bearer ${DOT_AI_AUTH_TOKEN}` — the
 * exact wiring the harness exports and `.mcp-test.json` documents) and covers the
 * three claims the PRD rests on:
 *
 *   1. Semantic phases (`recommend`): notifications arrive during the long call,
 *      including inside the question-generation loop — the freeze point reported
 *      in #704 — and the tool result still arrives unchanged.
 *   2. Heartbeat alone (`query`): a `toolLoop` tool emits **no** semantic phases,
 *      so liveness there comes purely from the time-based heartbeat. This is what
 *      makes the PRD's "all `toolLoop` tools get the same liveness for free"
 *      claim verified rather than asserted.
 *   3. Opt-out (`version`): no `onprogress` → no token → no notifications, and the
 *      result is unaffected. Driven against the fastest tool because this asserts
 *      the *absence* of behavior; a second full `recommend` would cost ~100s of
 *      the group's critical path to prove the same no-op.
 *
 * Timing: the harness deploys the chart with `mcp.progress.heartbeatIntervalMs=2000`
 * (`run-integration-tests.sh`) instead of the 20s default, so a heartbeat is
 * guaranteed to land inside the lifetime of a normal tool call. The semantic-phase
 * assertions in test 1 do not depend on that — they fire at `findBestSolutions`
 * boundaries regardless of wall-clock timing.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Progress } from '@modelcontextprotocol/sdk/types.js';
import packageJson from '../../../package.json';

const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:3456';
const AUTH_TOKEN = process.env.DOT_AI_AUTH_TOKEN;

// A detailed, non-vague intent with `final: true` skips clarification and drives
// the full findBestSolutions pipeline (the reported freeze path). The test cluster
// has the CNPG operator, so this resolves to CRD-based solutions rather than the
// Helm branch — asserted explicitly below rather than assumed.
const RECOMMEND_INTENT = 'deploy postgresql database';

// Total phase count `recommend` reports on every notification
// (RECOMMEND_PROGRESS_PHASES in src/interfaces/request-context.ts).
const RECOMMEND_TOTAL_PHASES = 4;

// Parse the JSON payload a dot-ai tool returns over MCP (single text content).
function parseToolResult(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text: string }> })
    .content;
  const text = content?.find(c => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

// MCP requires `progress` to increase on every notification for a token, and a
// bar that ticks past 100% is the bug this guards (PRD #705).
function assertMonotonicWithinTotal(notifications: Progress[]): void {
  const values = notifications.map(n => n.progress);
  expect({
    strictlyIncreasing: values.every((v, i) => i === 0 || v > values[i - 1]),
    exceedsTotal: notifications.some(
      n => n.total !== undefined && n.progress > n.total
    ),
  }).toMatchObject({
    strictlyIncreasing: true,
    exceedsTotal: false,
  });
}

async function connectClient(): Promise<{
  client: Client;
  transport: StreamableHTTPClientTransport;
}> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_BASE_URL), {
    requestInit: AUTH_TOKEN
      ? { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
      : undefined,
  });
  const client = new Client({ name: 'progress-integration-test', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

describe('MCP Progress Notifications (PRD #705)', () => {
  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    // Verify we're pointed at the test cluster/harness (mirrors recommend.test.ts).
    expect({ kubeconfig: process.env.KUBECONFIG }).toMatchObject({
      kubeconfig: expect.stringContaining('kubeconfig-test.yaml'),
    });
    ({ client, transport } = await connectClient());
  }, 60000);

  afterAll(async () => {
    await client?.close();
    await transport?.close();
  });

  // Tests share a single MCP client/session, so they are intentionally NOT run
  // as `describe.concurrent` against each other.
  test(
    'semantic phases: recommend reports every phase including the question-generation loop, and still returns its result',
    async () => {
      const notifications: Progress[] = [];

      const result = await client.callTool(
        {
          name: 'recommend',
          arguments: {
            stage: 'recommend',
            intent: RECOMMEND_INTENT,
            final: true,
            interaction_id: 'progress_optin',
          },
        },
        undefined,
        {
          // Registering onprogress makes the SDK inject `_meta.progressToken`.
          onprogress: progress => notifications.push(progress),
          // The client-side half of the fix for bare SDK clients: each
          // notification extends this request's own deadline. Claude Code does
          // not need this — it resets its own idle timeout on every notification.
          resetTimeoutOnProgress: true,
          timeout: 60000,
          maxTotalTimeout: 300000,
        }
      );

      // Progress is out-of-band: the tool result still arrives, unchanged in shape.
      const payload = parseToolResult(result);
      expect(payload).toMatchObject({
        intent: RECOMMEND_INTENT,
        // Solution content is AI-generated, but every solution carries the same
        // deterministic keys (mirrors recommend.test.ts).
        solutions: expect.arrayContaining([
          expect.objectContaining({
            solutionId: expect.stringMatching(/^sol-\d+-[a-f0-9]{8}$/),
            type: expect.any(String),
            score: expect.any(Number),
            description: expect.any(String),
            reasons: expect.any(Array),
          }),
        ]),
      });

      // Precondition for the freeze-point assertion below. findBestSolutions
      // returns early when Helm is recommended, and the question-generation loop
      // never runs — so assert the branch explicitly instead of letting the test
      // go green without ever exercising the window this PR exists to fix.
      expect({ helmInstallation: payload.helmInstallation }).toMatchObject({
        helmInstallation: undefined,
      });

      // The three fixed phases are deterministic, non-AI strings emitted at the
      // findBestSolutions boundaries, and each carries the total from the first
      // notification onward so a client can render a bar immediately.
      const phaseOf = (message: string) =>
        notifications.find(n => n.message === message);
      expect(phaseOf('Searching organizational knowledge…')).toMatchObject({
        progress: 1,
        total: RECOMMEND_TOTAL_PHASES,
        message: 'Searching organizational knowledge…',
      });
      expect(phaseOf('Searching cluster capabilities…')).toMatchObject({
        progress: 2,
        total: RECOMMEND_TOTAL_PHASES,
        message: 'Searching cluster capabilities…',
      });
      expect(phaseOf('Generating configuration options…')).toMatchObject({
        progress: 3,
        total: RECOMMEND_TOTAL_PHASES,
        message: 'Generating configuration options…',
      });

      // The reported freeze point (#704): the serial per-solution loop at
      // schema.ts. Without this the whole feature could ship untriggered.
      const questionPhase = notifications.find(
        n =>
          typeof n.message === 'string' &&
          n.message.startsWith('Generating configuration questions (')
      );
      expect(questionPhase).toMatchObject({
        total: RECOMMEND_TOTAL_PHASES,
        message: expect.stringMatching(
          /^Generating configuration questions \(\d+\/\d+\)…$/
        ),
      });

      assertMonotonicWithinTotal(notifications);
    },
    300000
  );

  test(
    'heartbeat only: a toolLoop tool with no semantic phases still emits progress for liveness',
    async () => {
      const notifications: Progress[] = [];

      // `query` never calls reportProgress — it has no semantic phases at all.
      // Every notification it produces therefore comes from the time-based
      // heartbeat, which is the entire liveness mechanism for query, remediate,
      // operate, and impact-analysis.
      const result = await client.callTool(
        {
          name: 'query',
          arguments: {
            intent: 'What databases can I deploy?',
            interaction_id: 'progress_heartbeat',
          },
        },
        undefined,
        {
          onprogress: progress => notifications.push(progress),
          resetTimeoutOnProgress: true,
          timeout: 60000,
          maxTotalTimeout: 300000,
        }
      );

      const payload = parseToolResult(result);
      expect(payload).toMatchObject({
        success: true,
        sessionId: expect.stringMatching(/^qry-\d+-[a-f0-9]+$/),
      });

      // Heartbeat notifications reuse the tool name as their label, since no
      // semantic phase has ever set a message on this token.
      expect({
        receivedHeartbeat: notifications.length > 0,
        allHeartbeats: notifications.every(
          n => n.message === 'query in progress…'
        ),
      }).toMatchObject({
        receivedHeartbeat: true,
        allHeartbeats: true,
      });

      assertMonotonicWithinTotal(notifications);
    },
    300000
  );

  test(
    'opt-out: no progressToken means no notifications and an unchanged result',
    async () => {
      const notifications: unknown[] = [];

      // Tap the transport rather than registering onprogress — that would inject
      // a progressToken and defeat the point. Wrap the client's own handler
      // instead of replacing it, or responses stop being dispatched and the call
      // never resolves. Restored in `finally`.
      const clientOnMessage = transport.onmessage;
      transport.onmessage = message => {
        if (
          (message as { method?: string })?.method === 'notifications/progress'
        ) {
          notifications.push(message);
        }
        clientOnMessage?.(message);
      };

      let payload: Record<string, unknown>;
      try {
        const result = await client.callTool(
          {
            name: 'version',
            arguments: {},
          },
          undefined,
          // No onprogress → no progressToken → progress plumbing is a no-op.
          { timeout: 60000 }
        );
        payload = parseToolResult(result);
      } finally {
        transport.onmessage = clientOnMessage;
      }

      // The result is what the tool returns with the progress plumbing inert.
      expect(payload).toMatchObject({
        status: 'success',
        system: {
          version: {
            version: packageJson.version,
          },
          vectorDB: {
            connected: true,
          },
        },
      });

      // Observed on the wire, not via onprogress: proves the server sent nothing,
      // rather than merely that we did not subscribe.
      expect({ notifications }).toMatchObject({ notifications: [] });
    },
    120000
  );
});
