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
 * exact wiring the harness exports and `.mcp-test.json` documents) and exercises
 * both PRD non-negotiables:
 *
 *   1. Opt-in (client passes `onprogress`, which makes the SDK inject a
 *      `progressToken`): notifications are observed during a long `recommend`
 *      call, and the tool result still arrives normally (progress is additive).
 *   2. Opt-out (no `onprogress`, no token): the call returns the same result
 *      shape, unaffected — the server no-ops on progress.
 *
 * Determinism note: the assertion targets the **semantic phase labels** emitted
 * at `findBestSolutions` boundaries (schema.ts), which fire regardless of the
 * ~20s heartbeat interval, so the test does not depend on wall-clock timing.
 * The time-based heartbeat itself is covered by the unit suite.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Progress } from '@modelcontextprotocol/sdk/types.js';

const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://localhost:3456';
const AUTH_TOKEN = process.env.DOT_AI_AUTH_TOKEN;

// A detailed, non-vague intent with `final: true` skips clarification and drives
// the full findBestSolutions pipeline (the reported freeze path).
const RECOMMEND_INTENT = 'deploy postgresql database';

// Parse the JSON payload a dot-ai tool returns over MCP (single text content).
function parseToolResult(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text: string }> })
    .content;
  const text = content?.find(c => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
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
    expect(process.env.KUBECONFIG).toContain('kubeconfig-test.yaml');
    ({ client, transport } = await connectClient());
  }, 60000);

  afterAll(async () => {
    await client?.close();
    await transport?.close();
  });

  // Tests share a single MCP client/session, so they are intentionally NOT run
  // as `describe.concurrent` against each other.
  test(
    'opt-in: emits notifications/progress during a long recommend call and still returns the result',
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
          // Demonstrates the client-side half of the fix: each notification
          // extends this request's own deadline (PRD "known limitation").
          resetTimeoutOnProgress: true,
          timeout: 60000,
          maxTotalTimeout: 300000,
        }
      );

      // Progress is out-of-band: the tool result still arrives, unchanged in shape.
      const payload = parseToolResult(result);
      expect(payload).toMatchObject({
        intent: RECOMMEND_INTENT,
        solutions: expect.any(Array),
      });

      // At least one progress notification arrived, and at least one carries a
      // semantic phase label emitted inside findBestSolutions.
      expect(notifications.length).toBeGreaterThan(0);
      const messages = notifications
        .map(n => n.message ?? '')
        .join('\n');
      expect(messages).toMatch(
        /organizational knowledge|cluster capabilities|configuration options|configuration questions/i
      );
    },
    300000
  );

  test(
    'opt-out: returns the same result shape and the server no-ops without a progressToken',
    async () => {
      const result = await client.callTool(
        {
          name: 'recommend',
          arguments: {
            stage: 'recommend',
            intent: RECOMMEND_INTENT,
            final: true,
            interaction_id: 'progress_optout',
          },
        },
        undefined,
        // No onprogress → no progressToken → progress plumbing is a no-op.
        { timeout: 300000 }
      );

      const payload = parseToolResult(result);
      expect(payload).toMatchObject({
        intent: RECOMMEND_INTENT,
        solutions: expect.any(Array),
      });
    },
    300000
  );
});
