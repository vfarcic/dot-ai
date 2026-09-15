/**
 * Integration Test: Untrusted-Content Boundary (PRD #811, M2)
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
 * entry for this file.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { IntegrationTest } from '../helpers/test-base.js';
import type { ToolEnvelope } from '../helpers/api-shapes.js';
import {
  observeUntrustedBoundary,
  readModelPromptCapture,
} from '../helpers/model-prompt-capture.js';

/** Namespaces this file owns. Distinct per tool so the two tests cannot collide. */
const REMEDIATE_NAMESPACE = 'untrusted-boundary-remediate';
const OPERATE_NAMESPACE = 'untrusted-boundary-operate';

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
      `delete namespace ${REMEDIATE_NAMESPACE} ${OPERATE_NAMESPACE} --ignore-not-found`
    );
  });

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
});
