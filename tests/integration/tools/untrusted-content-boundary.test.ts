/**
 * Integration Test: Untrusted-Content Boundary (PRD #811, M2 and M4/M5)
 *
 * Both channels of the PRD's threat model live here, because they are one
 * claim applied twice: *content the operator did not write arrives inside a
 * boundary the system prompt names and describes as data, and content the
 * operator did write does not*. Channel 1 is the engine's own tool output
 * (M2); Channel 2 is the caller-supplied field and the optional `evidence`
 * field M4 adds beside it. The Channel 2 tests are grouped at the bottom of
 * this file behind their own explanation.
 *
 * Two of the Channel 2 tests are about the ways the split can be undone rather
 * than about the split itself: one sends an `intent` that forges the boundary
 * token, so the caller cannot manufacture a region of their own in the channel
 * the prompts declare authoritative; the other hits the visualization endpoint
 * while the investigation is still running, which is the state where the whole
 * session record — `evidence` included — is serialised into a system prompt
 * that has no framing at all.
 *
 * PRD #811 Channel 1: `kubectl_logs`, `kubectl_events` and `kubectl_describe`
 * return text an attacker who can write to a workload controls, and their
 * results re-enter model context as plain tool-result text — no delimiter, and
 * nothing in the system prompt telling the model that such text is data to be
 * analysed rather than instruction to be followed. M2 closes that in both
 * `remediate` and `operate-analysis`.
 *
 * **What these tests assert, and why it is not a string match.** The claim is a
 * property: *attacker-writable text arrives inside a boundary the system prompt
 * names and describes as data*. Grepping for whichever marker M2 happens to
 * choose would pass vacuously the day someone changes it, and would need
 * rewriting rather than re-running. So each test plants a unique probe string in
 * cluster data, drives the real tool against a real cluster, and then reads the
 * prompt the server actually composed — see
 * `../helpers/model-prompt-capture.ts`. The delimiter is *derived from that
 * capture*: a candidate counts only if it opens the tool result block, closes
 * it, and is referred to by the system prompt in the same capture. Nothing here
 * knows what M2's syntax will be.
 *
 * **Why the debug capture is the observation point.** No REST response carries
 * what reached the model: `remediate` returns tool *names*
 * (`investigation.dataGathered`) and `operate` returns a tool-call *count*. The
 * `DEBUG_DOT_AI=true` capture the server already writes on every `toolLoop` is
 * the only place the composed prompt — system prompt, user message and every
 * tool result — is observable from outside the provider call. Both the deployed
 * chart and `vitest.integration.config.ts` set that flag, so the capture is
 * always there.
 *
 * Needs base cluster infrastructure only (no CNPG, Kyverno, Prometheus, Argo CD
 * or Flux), so `tests/integration/infrastructure/infra-profiles.sh` needs no
 * entry for this file. The `operate` tests do need an embeddings path for the
 * capability service — CI sets `USE_LOCAL_EMBEDDINGS=true` for every group, and
 * a local run without it (and without `OPENAI_API_KEY`) fails them in ~2ms with
 * "Capability service not available", which is an environment gap rather than a
 * regression.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeAll, describe, expect, test } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import type { OpenApiSpec, ToolEnvelope } from '../helpers/api-shapes.js';
import type { RestApiResponse } from '../helpers/http-client.js';
import {
  observeCallerFieldComposition,
  observeUntrustedBoundary,
  readModelPromptCapture,
} from '../helpers/model-prompt-capture.js';
import {
  UNTRUSTED_EVIDENCE_CLOSE,
  UNTRUSTED_EVIDENCE_OPEN,
} from '../../../src/core/untrusted-content.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** Namespaces this file owns. Distinct per tool so the two tests cannot collide. */
const REMEDIATE_NAMESPACE = 'untrusted-boundary-remediate';
const OPERATE_NAMESPACE = 'untrusted-boundary-operate';
/** Shared, read-only fixture for the Channel 2 tests (M4/M5). */
const CALLER_NAMESPACE = 'untrusted-boundary-caller';
const CALLER_DEPLOYMENT = 'caller-evidence-app';

/**
 * Identifiers for one execution of this file.
 *
 * Two are needed and they must not be substrings of each other:
 *
 * - `runMarker` rides in the caller field (`issue` / `intent`), so it lands in
 *   the capture's user message. It is how the right capture is found among
 *   whatever else the server logged.
 * - `probe` is planted in *cluster* data — a container log line and a resource
 *   annotation — so the only way it can reach model context is through a tool
 *   result. That is the untrusted channel under test.
 */
const runId = Date.now();
const runMarker = `untrusted-boundary-run-${runId}`;
const probe = `untrusted-boundary-probe-${runId}`;

/** What these tests read off `data`, proven present by the assertions below. */
interface InvestigationPayload {
  result: {
    sessionId: string;
    investigation?: { dataGathered: string[] };
    analysis?: { commands: string[] };
  };
}

/** The slice of `GET /api/v1/sessions` the P1.4 test reads. */
interface SessionListPayload {
  sessions: Array<{ sessionId: string; status?: string; issue?: string }>;
  total: number;
}

/**
 * Unwrap the OpenAPI document from the test client's envelope.
 *
 * `HttpRestApiClient` wraps a raw JSON body as `{ success, data }`, so the spec
 * arrives one level down — the same unwrap `openapi.test.ts` does.
 */
const getOpenApiSpec = (response: RestApiResponse): OpenApiSpec =>
  (response.data as OpenApiSpec) ?? (response as unknown as OpenApiSpec);

/**
 * Read the tool schemas the server advertises over the MCP protocol itself.
 *
 * The REST surface and the MCP surface are registered from one `getToolDefs()`
 * table, but only this path exercises the MCP rendering of it — which is what
 * every MCP client (Claude Code, Cursor, the CLI) actually reads. The deployed
 * server speaks MCP on the same host and port as the REST API: anything that is
 * not a REST route is routed to the MCP transport.
 */
async function listMcpTools(): Promise<
  Array<{ name: string; inputSchema: unknown }>
> {
  const baseUrl = process.env.MCP_BASE_URL || 'http://localhost:3456';
  const authToken = process.env.DOT_AI_AUTH_TOKEN;
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/`), {
    requestInit: {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    },
  });
  const client = new Client(
    { name: 'untrusted-content-boundary-test', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    return tools as Array<{ name: string; inputSchema: unknown }>;
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * The boundary property, as one object so a failure prints every part of it at
 * once together with the diagnostics that say which part broke.
 */
const EXPECTED_BOUNDARY = {
  probeReachedModel: true,
  probeArrivedViaToolOutput: true,
  probeEnclosedInDelimiters: true,
  systemPromptNamesTheDelimiter: true,
  systemPromptFramesDelimitedContentAsData: true,
};

describe.concurrent('Untrusted-Content Boundary (PRD #811)', () => {
  const integrationTest = new IntegrationTest();

  beforeAll(async () => {
    // Verify we're using the test cluster
    const kubeconfig = process.env.KUBECONFIG;
    expect(kubeconfig).toContain('kubeconfig-test.yaml');

    // Clean state ONCE before all tests to prevent race conditions
    await integrationTest.kubectl(
      `delete namespace ${REMEDIATE_NAMESPACE} ${OPERATE_NAMESPACE} ${CALLER_NAMESPACE} --ignore-not-found`
    );

    // The Channel 2 tests (M4/M5) all read one healthy Deployment and never
    // change it, so it is created once here rather than four times. Nothing
    // about their claim depends on the workload being broken — the content
    // under test arrives through the caller's own fields, not through cluster
    // data — so this fixture only has to exist and be investigable.
    await integrationTest.kubectl(`create namespace ${CALLER_NAMESPACE}`);
    await integrationTest.kubectl(`apply -n ${CALLER_NAMESPACE} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${CALLER_DEPLOYMENT}
  namespace: ${CALLER_NAMESPACE}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${CALLER_DEPLOYMENT}
  template:
    metadata:
      labels:
        app: ${CALLER_DEPLOYMENT}
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
        ports:
        - containerPort: 80
EOF`);
    await integrationTest.kubectl(
      `wait --for=condition=available deployment/${CALLER_DEPLOYMENT} -n ${CALLER_NAMESPACE} --timeout=120s`
    );
  }, 180000);

  test('remediate composes attacker-writable tool output as delimited data the system prompt frames as untrusted', async () => {
    const podName = 'boundary-probe-pod';

    // SETUP: a workload whose own output carries the probe. The container
    // writes it to stdout and the Pod carries it as an annotation, so the
    // probe reaches the model whether the investigation reads logs or
    // describes the Pod — both are attacker-writable in the PRD's threat
    // model, and neither is reachable except through a tool result.
    await integrationTest.kubectl(`create namespace ${REMEDIATE_NAMESPACE}`);
    await integrationTest.kubectl(`apply -n ${REMEDIATE_NAMESPACE} -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: ${podName}
  namespace: ${REMEDIATE_NAMESPACE}
  annotations:
    dot-ai-test/telemetry-probe: "${probe}"
spec:
  restartPolicy: Always
  containers:
  - name: app
    image: busybox:1.36
    command: ["sh", "-c", "echo 'FATAL ${probe} configuration parse failed'; exit 1"]
EOF`);

    // Wait for the container to have crashed at least once, so there is both
    // a log to read and an event to describe.
    const deadline = Date.now() + 120000;
    let restartCount = 0;
    while (Date.now() < deadline && restartCount < 1) {
      const raw = await integrationTest.kubectl(
        `get pod ${podName} -n ${REMEDIATE_NAMESPACE} -o jsonpath={.status.containerStatuses[0].restartCount}`
      );
      restartCount = Number.parseInt(raw.trim(), 10) || 0;
      if (restartCount < 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    expect(restartCount).toBeGreaterThanOrEqual(1);

    // ACT: a real investigation through the real tool.
    const investigation = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/remediate', {
      issue: `pod ${podName} in namespace ${REMEDIATE_NAMESPACE} keeps restarting (${runMarker})`,
      interaction_id: `untrusted_boundary_remediate_${runId}`,
    });

    // The investigation ran and used kubectl tools — the precondition for the
    // claim. Without a tool call there is no untrusted tool output to frame.
    expect(investigation).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
          investigation: {
            dataGathered: expect.arrayContaining([
              expect.stringMatching(/^kubectl_\w+ \(call \d+\)$/),
            ]),
          },
        },
      },
    });

    // ASSERT: what actually reached the model.
    const capture = await readModelPromptCapture(
      'remediate-investigation',
      runMarker
    );

    expect(observeUntrustedBoundary(capture, probe)).toMatchObject(
      EXPECTED_BOUNDARY
    );
  }, 900000);

  test('operate analysis composes attacker-writable tool output as delimited data the system prompt frames as untrusted', async () => {
    const deploymentName = 'boundary-probe-app';

    // SETUP: the probe rides on the Deployment and on its Pod template, so
    // any read of either — `kubectl_get_resource_json`, `kubectl_describe` —
    // carries it into model context. A crash is not needed here: operate
    // analysis inspects the resource it is asked to change.
    await integrationTest.kubectl(`create namespace ${OPERATE_NAMESPACE}`);
    await integrationTest.kubectl(`apply -n ${OPERATE_NAMESPACE} -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${deploymentName}
  namespace: ${OPERATE_NAMESPACE}
  annotations:
    dot-ai-test/telemetry-probe: "${probe}"
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${deploymentName}
  template:
    metadata:
      labels:
        app: ${deploymentName}
      annotations:
        dot-ai-test/telemetry-probe: "${probe}"
    spec:
      containers:
      - name: nginx
        image: nginx:1.19
        ports:
        - containerPort: 80
EOF`);
    await integrationTest.kubectl(
      `wait --for=condition=available deployment/${deploymentName} -n ${OPERATE_NAMESPACE} --timeout=120s`
    );

    // ACT: a real analysis through the real tool. No execution: the analysis
    // phase is where the investigation tool loop runs.
    const analysis = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/operate', {
      intent: `scale deployment ${deploymentName} in namespace ${OPERATE_NAMESPACE} to 2 replicas (${runMarker})`,
      interaction_id: `untrusted_boundary_operate_${runId}`,
    });

    expect(analysis).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^opr-\d+-[a-f0-9]{8}$/),
          analysis: {
            commands: expect.arrayContaining([
              expect.stringContaining('kubectl'),
            ]),
          },
        },
      },
    });

    const capture = await readModelPromptCapture('operate-analysis', runMarker);

    expect(observeUntrustedBoundary(capture, probe)).toMatchObject(
      EXPECTED_BOUNDARY
    );
  }, 900000);

  /**
   * Channel 2 — the caller-supplied field (PRD #811, M4/M5).
   *
   * `remediate.issue` and `operate.intent` are each a single field mixing the
   * operator's instruction with any evidence the caller pasted in, and both are
   * interpolated into the user message bare — the channel both system prompts
   * now declare authoritative. M4 adds an optional `evidence` field so a caller
   * that *can* tell the two apart has somewhere to put the quoted half; M5 is
   * the claim that it changed nothing for the callers that do not.
   *
   * Two claims, one test each per tool, because they have opposite lifetimes:
   * the additive test is a permanent regression guard that must stay green
   * through M4 and after it, and the evidence test is the one that turns from
   * red to green when M4 lands. Folding them together would hide which of the
   * two moved.
   *
   * The delimiter is derived from the capture exactly as it is for Channel 1 —
   * see `observeCallerFieldComposition`. Nothing here names M4's syntax, and
   * per Design Decision #4 nothing here names the prompt-visible wording
   * either: the wire field stays `intent`, but the prose around it is expected
   * to stop saying the word, so a test that pinned the prefix would go red on a
   * change the PRD asks for.
   */

  /**
   * The wire contract for the existing caller field, which M4 may not change.
   *
   * Type and bounds only. The `description` is deliberately not pinned: M4 is
   * expected to reword it to explain the instruction/evidence split, and that
   * is not a breaking change for anyone.
   */
  const UNCHANGED_CALLER_FIELD = {
    type: 'string',
    minLength: 1,
    maxLength: 2000,
  };

  /** What a caller that sends no `evidence` must still get: today's composition. */
  const EXPECTED_ADDITIVE_COMPOSITION = {
    instructionReachedUserMessage: true,
    instructionOutsideDelimitedRegion: true,
    evidenceReachedUserMessage: false,
    evidenceInsideDelimitedRegion: false,
    delimitedRegionCount: 0,
  };

  /**
   * What a caller that sends `evidence` must get.
   *
   * The third line is the one that carries the claim. A test asserting only
   * that the evidence appears *somewhere* inside a fence would pass on an
   * implementation that fenced the whole user message — which would put the
   * operator's own instruction inside the region both system prompts tell the
   * model never to obey, breaking the tool while looking correct.
   */
  const EXPECTED_EVIDENCE_COMPOSITION = {
    instructionReachedUserMessage: true,
    instructionOutsideDelimitedRegion: true,
    evidenceReachedUserMessage: true,
    evidenceInsideDelimitedRegion: true,
    systemPromptFramesDelimitedContentAsData: true,
  };

  /**
   * Evidence a caller would plausibly have: text it captured from somewhere
   * else and is quoting, not an instruction it is giving.
   *
   * Multi-line on purpose — the whole string is what the assertions look for,
   * so an implementation that re-indented, escaped or split it fails rather
   * than passes.
   */
  const callerEvidence = (tag: string) =>
    `Operator-pasted container log:\nFATAL caller-evidence-payload-${tag} unable to reach database\nat bootstrap.go:41`;

  test('remediate composes a caller that sends only `issue` exactly as it does today', async () => {
    const marker = `caller-plain-rem-${runId}`;
    const issue = `deployment ${CALLER_DEPLOYMENT} in namespace ${CALLER_NAMESPACE} may be misconfigured (${marker})`;

    const investigation = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/remediate', {
      issue,
      interaction_id: `untrusted_boundary_caller_plain_rem_${runId}`,
    });

    expect(investigation).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
        },
      },
    });

    const capture = await readModelPromptCapture(
      'remediate-investigation',
      marker
    );

    // `instruction` is the WHOLE issue string, so finding it also proves it
    // arrived contiguous and unaltered.
    expect(
      observeCallerFieldComposition(capture, { instruction: issue })
    ).toMatchObject(EXPECTED_ADDITIVE_COMPOSITION);
  }, 900000);

  test('remediate composes caller-supplied `evidence` as delimited data and leaves `issue` outside the boundary', async () => {
    const marker = `caller-evidence-rem-${runId}`;
    const issue = `deployment ${CALLER_DEPLOYMENT} in namespace ${CALLER_NAMESPACE} may be misconfigured (${marker})`;
    const evidence = callerEvidence(marker);

    const investigation = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/remediate', {
      issue,
      evidence,
      interaction_id: `untrusted_boundary_caller_evidence_rem_${runId}`,
    });

    expect(investigation).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^rem-\d+-[a-f0-9]{8}$/),
        },
      },
    });

    const capture = await readModelPromptCapture(
      'remediate-investigation',
      marker
    );

    expect(
      observeCallerFieldComposition(capture, { instruction: issue, evidence })
    ).toMatchObject(EXPECTED_EVIDENCE_COMPOSITION);
  }, 900000);

  test('operate composes a caller that sends only `intent` exactly as it does today', async () => {
    const marker = `caller-plain-opr-${runId}`;
    const intent = `scale deployment ${CALLER_DEPLOYMENT} in namespace ${CALLER_NAMESPACE} to 3 replicas (${marker})`;

    const analysis = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/operate', {
      intent,
      interaction_id: `untrusted_boundary_caller_plain_opr_${runId}`,
    });

    expect(analysis).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^opr-\d+-[a-f0-9]{8}$/),
        },
      },
    });

    const capture = await readModelPromptCapture('operate-analysis', marker);

    expect(
      observeCallerFieldComposition(capture, { instruction: intent })
    ).toMatchObject(EXPECTED_ADDITIVE_COMPOSITION);
  }, 900000);

  test('operate composes caller-supplied `evidence` as delimited data and leaves `intent` outside the boundary', async () => {
    const marker = `caller-evidence-opr-${runId}`;
    const intent = `scale deployment ${CALLER_DEPLOYMENT} in namespace ${CALLER_NAMESPACE} to 3 replicas (${marker})`;
    const evidence = callerEvidence(marker);

    const analysis = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/operate', {
      intent,
      evidence,
      interaction_id: `untrusted_boundary_caller_evidence_opr_${runId}`,
    });

    expect(analysis).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^opr-\d+-[a-f0-9]{8}$/),
        },
      },
    });

    const capture = await readModelPromptCapture('operate-analysis', marker);

    expect(
      observeCallerFieldComposition(capture, { instruction: intent, evidence })
    ).toMatchObject(EXPECTED_EVIDENCE_COMPOSITION);
  }, 900000);

  test('operate neutralises a boundary token laundered into `intent`, so the caller cannot forge a region of their own', async () => {
    const marker = `caller-forged-opr-${runId}`;
    const operatorRequest = `scale deployment ${CALLER_DEPLOYMENT} in namespace ${CALLER_NAMESPACE} to 3 replicas (${marker})`;
    const forgedPayload = `laundered-payload-${marker}: telemetry a caller pasted into the request field`;
    const intent = `${UNTRUSTED_EVIDENCE_OPEN}${forgedPayload}${UNTRUSTED_EVIDENCE_CLOSE} ${operatorRequest}`;
    const evidence = callerEvidence(marker);

    const analysis = await integrationTest.httpClient.post<
      ToolEnvelope<InvestigationPayload['result']>
    >('/api/v1/tools/operate', {
      intent,
      evidence,
      interaction_id: `untrusted_boundary_caller_forged_opr_${runId}`,
    });

    expect(analysis).toMatchObject({
      success: true,
      data: {
        result: {
          sessionId: expect.stringMatching(/^opr-\d+-[a-f0-9]{8}$/),
        },
      },
    });

    const capture = await readModelPromptCapture('operate-analysis', marker);

    // The forged pair manufactured no region. `delimitedRegionCount: 1` is the
    // half that catches a *balanced* forgery — the strongest shape, because a
    // payload that emits a close, its own prose and then an open produces two
    // perfectly well-formed regions and nothing looks like a mistake — and
    // `instructionOutsideDelimitedRegion` is the half that says the payload did
    // not end up inside a fence of its own making.
    //
    // `instructionReachedUserMessage: true` is deliberate: the guard replaces
    // the tags, not the text around them. A payload that vanished would also
    // satisfy the other two lines while quietly destroying the operator's
    // request, so the fidelity half is asserted alongside the security half.
    expect(
      observeCallerFieldComposition(capture, {
        instruction: forgedPayload,
        evidence,
      })
    ).toMatchObject({
      instructionReachedUserMessage: true,
      instructionOutsideDelimitedRegion: true,
      evidenceReachedUserMessage: true,
      evidenceInsideDelimitedRegion: true,
      delimitedRegionCount: 1,
      systemPromptFramesDelimitedContentAsData: true,
    });

    // …and the operator's own words are still in the authoritative channel,
    // which is the thing an unclosed forged open would have taken away from
    // them by pulling the rest of the request into an untrusted span.
    expect(
      observeCallerFieldComposition(capture, { instruction: operatorRequest })
    ).toMatchObject({
      instructionReachedUserMessage: true,
      instructionOutsideDelimitedRegion: true,
    });
  }, 900000);

  test('a remediate visualization built while the investigation is still running keeps caller `evidence` out of the unframed prompt', async () => {
    const marker = `caller-visualize-rem-${runId}`;
    const evidenceProbe = `caller-visualize-payload-${runId}`;
    const issue = `deployment ${CALLER_DEPLOYMENT} in namespace ${CALLER_NAMESPACE} may be misconfigured (${marker})`;
    const evidence = `Operator-pasted container log:\nFATAL ${evidenceProbe} unable to reach database\nat bootstrap.go:41`;

    // Start the investigation and deliberately do NOT await it. The state under
    // test is the one every remediate session is in for as long as its
    // investigation runs: `evidence` is persisted on the session record at
    // creation, and `finalAnalysis` is only written when the loop returns. The
    // visualization endpoint falls back to the whole session record whenever
    // `finalAnalysis` is absent — investigation still running, investigation
    // failed, or `?reload=true` on such a session — and serialises it into its
    // *system* prompt, a loop with no untrusted-content framing of any kind.
    // Racing a real investigation is the honest way to reach that state; the
    // alternative was hand-writing a session file, which would be testing the
    // fixture rather than the product.
    const investigation = integrationTest.httpClient
      .post<ToolEnvelope<InvestigationPayload['result']>>(
        '/api/v1/tools/remediate',
        {
          issue,
          evidence,
          interaction_id: `untrusted_boundary_caller_visualize_rem_${runId}`,
        }
      )
      .catch((error: unknown) => ({ success: false, error }));

    // The session is created before the AI provider is, so it is listable
    // within a second or two — far inside the investigation's own runtime,
    // which is tens of seconds of model calls and kubectl round trips.
    const deadline = Date.now() + 120000;
    let sessionId = '';
    while (!sessionId && Date.now() < deadline) {
      const listed = await integrationTest.httpClient.get<SessionListPayload>(
        '/api/v1/sessions?status=investigating&limit=200'
      );
      sessionId =
        listed.data?.sessions?.find(entry => entry.issue === issue)
          ?.sessionId ?? '';
      if (!sessionId) await new Promise(resolve => setTimeout(resolve, 500));
    }

    expect(
      sessionId,
      'no investigating remediate session appeared for this issue'
    ).toMatch(/^rem-\d+-[a-f0-9]{8}$/);

    const visualization = await integrationTest.httpClient.get(
      `/api/v1/visualize/${sessionId}`
    );
    expect(visualization).toMatchObject({ success: true });

    const capture = await readModelPromptCapture('visualize-remediate', marker);

    // `wholeSessionRecordWasSerialised` is the precondition, asserted rather
    // than assumed: `toolName` exists only on the session record, never on the
    // `finalAnalysis` the endpoint prefers when there is one. If the
    // investigation had finished first this line fails, so a lost race reads as
    // "inconclusive" instead of passing vacuously — which is exactly what a
    // bare "evidence is absent" assertion would have done.
    expect({
      captureIsForThisSession: capture.includes(marker),
      wholeSessionRecordWasSerialised: capture.includes(
        '"toolName": "remediate"'
      ),
      evidenceReachedVisualizationPrompt: capture.includes(evidenceProbe),
    }).toMatchObject({
      captureIsForThisSession: true,
      wholeSessionRecordWasSerialised: true,
      evidenceReachedVisualizationPrompt: false,
    });

    // Let the abandoned investigation settle so its result cannot surface as an
    // unhandled rejection in another test's window. Nothing is asserted on it:
    // this test is about the session's mid-flight state, not its outcome.
    await investigation;
  }, 900000);

  test('`evidence` is an optional additive field on both tools across MCP, REST and the published OpenAPI spec', async () => {
    // `getToolDefs()` in `src/interfaces/mcp.ts` hands the SAME Zod object to
    // `registerRestTool` (which the OpenAPI generator reads) and to
    // `registerMcpTool`, so these three views cannot disagree about which
    // fields exist — but they are three different renderings of it, and the
    // published spec is a committed file that a schema change does not update
    // by itself. Checking all three is what makes "MCP and REST, with OpenAPI
    // regenerated" a testable claim rather than three separate hopes.
    const liveSpec = getOpenApiSpec(
      await integrationTest.httpClient.get('/api/v1/openapi')
    );
    const committedSpec = JSON.parse(
      readFileSync(join(process.cwd(), 'schema', 'openapi.json'), 'utf8')
    ) as OpenApiSpec;

    const mcpTools = await listMcpTools();

    const requestSchema = (spec: OpenApiSpec, tool: string) =>
      (spec.components?.schemas?.[`${tool}Request`] ?? {}) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
    const mcpSchema = (tool: string) =>
      (mcpTools.find(entry => entry.name === tool)?.inputSchema ?? {}) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };

    const surface = {
      restRemediateEvidence: requestSchema(liveSpec, 'remediate').properties
        ?.evidence,
      restRemediateEvidenceIsRequired: (
        requestSchema(liveSpec, 'remediate').required ?? []
      ).includes('evidence'),
      restRemediateIssue: requestSchema(liveSpec, 'remediate').properties
        ?.issue,

      restOperateEvidence: requestSchema(liveSpec, 'operate').properties
        ?.evidence,
      restOperateEvidenceIsRequired: (
        requestSchema(liveSpec, 'operate').required ?? []
      ).includes('evidence'),
      restOperateIntent: requestSchema(liveSpec, 'operate').properties?.intent,

      committedRemediateEvidence: requestSchema(committedSpec, 'remediate')
        .properties?.evidence,
      committedOperateEvidence: requestSchema(committedSpec, 'operate')
        .properties?.evidence,

      mcpRemediateEvidence: mcpSchema('remediate').properties?.evidence,
      mcpRemediateEvidenceIsRequired: (
        mcpSchema('remediate').required ?? []
      ).includes('evidence'),
      mcpRemediateIssue: mcpSchema('remediate').properties?.issue,

      mcpOperateEvidence: mcpSchema('operate').properties?.evidence,
      mcpOperateEvidenceIsRequired: (
        mcpSchema('operate').required ?? []
      ).includes('evidence'),
      mcpOperateIntent: mcpSchema('operate').properties?.intent,
    };

    expect(surface).toMatchObject({
      restRemediateEvidence: { type: 'string' },
      restRemediateEvidenceIsRequired: false,
      restRemediateIssue: UNCHANGED_CALLER_FIELD,

      restOperateEvidence: { type: 'string' },
      restOperateEvidenceIsRequired: false,
      restOperateIntent: UNCHANGED_CALLER_FIELD,

      committedRemediateEvidence: { type: 'string' },
      committedOperateEvidence: { type: 'string' },

      mcpRemediateEvidence: { type: 'string' },
      mcpRemediateEvidenceIsRequired: false,
      mcpRemediateIssue: UNCHANGED_CALLER_FIELD,

      mcpOperateEvidence: { type: 'string' },
      mcpOperateEvidenceIsRequired: false,
      mcpOperateIntent: UNCHANGED_CALLER_FIELD,
    });
  }, 120000);
});
