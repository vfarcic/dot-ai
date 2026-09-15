/**
 * Reads what actually reached the model, from the running MCP server (PRD #811).
 *
 * `vitest.integration.config.ts` and the Helm deploy both set `DEBUG_DOT_AI=true`,
 * so every `toolLoop` writes the composed conversation to
 * `/app/tmp/debug-ai/{timestamp}_{id}_{operation}-raw_prompt.md` inside the
 * dot-ai pod (`src/core/providers/vercel-provider.ts` → `debugLogInteraction`).
 * That file is the only place outside the provider call where the *whole* prompt
 * — system prompt, user message, and every tool result that re-entered
 * context — is observable, which is exactly the surface PRD #811 part (1)
 * changes. No REST response exposes it: `remediate` returns tool *names*
 * (`investigation.dataGathered`) and `operate` returns a tool-call *count*.
 *
 * Caveat, stated rather than hidden: this is the provider's own rendering of
 * `result.response.messages`, not the bytes on the wire. It reproduces tool
 * result content verbatim, which is what the assertions here depend on, but it
 * flattens the message structure and inserts `[TOOL_USE: …]` / `[TOOL_RESULT:
 * …]` labels of its own — {@link CAPTURE_LABEL} — which this module strips
 * before looking for anything.
 */

import { execFileSync } from 'child_process';

/** Namespace and workload selector of the deployed MCP server. */
const SERVER_NAMESPACE = 'dot-ai';
const SERVER_SELECTOR = 'app.kubernetes.io/name=dot-ai';
const SERVER_CONTAINER = 'mcp-server';

/** Where `ensureDebugDirectory()` writes, given the image's `WORKDIR /app`. */
const DEBUG_DIR = '/app/tmp/debug-ai';

/**
 * Labels the debug writer inserts around each part. They are an artifact of the
 * capture format — the model never sees them — so they are stripped before
 * delimiter detection, and they can never be mistaken for M2's own framing.
 */
const CAPTURE_LABEL = /\[TOOL_(?:USE|RESULT): [^\]\n]*\]/g;

/** Start of a tool result block in the capture. */
const TOOL_RESULT_LABEL = '[TOOL_RESULT: ';

/** Start of a tool call block in the capture. */
const TOOL_USE_LABEL = '[TOOL_USE: ';

/**
 * Shapes a delimiter can take, independent of the vocabulary M2 picks.
 *
 * Every one of these is a plausible way to fence untrusted content, and the
 * point of listing shapes rather than strings is that this test does not care
 * which one ships:
 *
 * ```
 * <untrusted_tool_output> … </untrusted_tool_output>
 * <<<UNTRUSTED CLUSTER DATA>>> … <<<END UNTRUSTED CLUSTER DATA>>>
 * --- BEGIN UNTRUSTED DATA --- … --- END UNTRUSTED DATA ---
 * [BEGIN CLUSTER OUTPUT] … [END CLUSTER OUTPUT]
 * BEGIN UNTRUSTED TOOL OUTPUT … END UNTRUSTED TOOL OUTPUT
 * ```
 *
 * A candidate must carry a word of at least four letters — see
 * {@link delimiterKeyword}. A delimiter made only of punctuation (`<<<` alone)
 * has no name for the system prompt to refer to, so it cannot satisfy "a
 * boundary the system prompt identifies", and this module does not accept one.
 */
const DELIMITER_SHAPES: RegExp[] = [
  /<\/?[A-Za-z][A-Za-z0-9_.:-]{2,60}>/g,
  /<{2,}\/?[^\n<>]{3,80}>{2,}/g,
  /[-=*#~_]{3,}[^\n]{0,80}?[-=*#~_]{3,}/g,
  /\[[A-Za-z][A-Za-z0-9 _/:-]{2,60}\]/g,
  /\b(?:BEGIN|END)[ _-][A-Z][A-Z0-9 _-]{2,60}\b/g,
];

/**
 * Fence-shaped tokens kubectl and Helm print as placeholders.
 *
 * `kubectl describe` writes `Labels: <none>` a few lines into almost every
 * resource, which matches the first shape above. Without this list a run whose
 * output happened to say `<none>` on both sides of the probe could be read as a
 * delimiter, and the guard would go green on unframed output.
 */
const PLACEHOLDER_KEYWORDS = new Set([
  'none',
  'nil',
  'null',
  'unknown',
  'unset',
  'empty',
  'invalid',
  'pending',
  'terminating',
  'default',
  'value',
  'true',
  'false',
  'error',
]);

/**
 * How far into a tool result block an opening fence may sit, and how far from
 * its end a closing fence may sit.
 *
 * A fence wraps the *whole* result, so it is at the edges. Requiring that is
 * the second half of the defence against a coincidental match: a placeholder
 * that survives {@link PLACEHOLDER_KEYWORDS} still has to appear both in the
 * first {@link FENCE_WINDOW} characters and in the last {@link FENCE_WINDOW}.
 * The allowance is generous because the debug writer renders a tool result as
 * JSON, so `{ "type": "json", "value": "` precedes the fence.
 */
const FENCE_WINDOW = 400;

/**
 * Prose that tells the model a delimited region is data.
 *
 * Deliberately a wide alternation, for the same reason
 * `src/evaluation/injection/composition.ts` keeps `FRAMING_MARKER_PATTERN`
 * wide: a false positive costs one glance at this constant, while a narrow
 * pattern turns an honest M2 wording into a red test. It is not imported from
 * there because that module is the *eval harness's* mirror of production and M2
 * edits it; a guard must not be able to go green by editing the thing it
 * guards.
 */
const DATA_FRAMING_PROSE =
  /untrusted|\bnot\b[^.\n]{0,40}\binstruction|\binstruction[^.\n]{0,40}\bnot\b|never\s+(?:follow|obey|execute|comply|act\s+on|trust|treat)|never\s+(?:an?\s+)?(?:instruction|directive|command|order)|do(?:es)?\s+not\s+(?:follow|obey|execute|comply|grant|carry|confer|trust)|must\s+not\s+(?:be\s+)?(?:follow|obey|execut|comply|act|trust)|no\s+authority|not\s+authoritative|ignore\s+(?:any|all)\s+(?:instruction|directive|command)|data\s+to\s+be\s+analy[sz]ed|treat[^.\n]{0,60}\bas\s+data\b|\b(?:is|are|as)\s+data\b/i;

/** Run kubectl against the test cluster, returning '' on failure. */
function kubectl(args: string[]): string {
  const kubeconfig = process.env.KUBECONFIG || './kubeconfig-test.yaml';
  try {
    return execFileSync('kubectl', [`--kubeconfig=${kubeconfig}`, ...args], {
      encoding: 'utf8',
      // Captures carry the full system prompt plus every kubectl result, so the
      // 1MB execSync default is not enough.
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return '';
  }
}

/** Run a shell command inside the MCP server container. */
function execInServer(script: string): string {
  const pod = kubectl([
    'get',
    'pods',
    '-n',
    SERVER_NAMESPACE,
    '-l',
    SERVER_SELECTOR,
    '-o',
    'jsonpath={.items[0].metadata.name}',
  ]).trim();

  if (!pod) return '';

  return kubectl([
    'exec',
    '-n',
    SERVER_NAMESPACE,
    pod,
    '-c',
    SERVER_CONTAINER,
    '--',
    'sh',
    '-c',
    script,
  ]);
}

/**
 * Fetch the debug capture for one `toolLoop` run.
 *
 * `operation` is the `toolLoop` operation name (`remediate-investigation`,
 * `operate-analysis`); `runMarker` is a string the caller put in the tool's
 * `issue`/`intent` so it lands in the capture's user message, which is what
 * makes the lookup pick this run's capture and not a concurrent one's.
 *
 * Polls because the file is written when `generateText` returns, and although
 * that happens before the tool's HTTP response is sent, nothing in the contract
 * guarantees the ordering.
 */
export async function readModelPromptCapture(
  operation: string,
  runMarker: string,
  timeoutMs = 30000
): Promise<string> {
  if (!/^[A-Za-z0-9_-]+$/.test(runMarker)) {
    throw new Error(
      `runMarker must be shell-and-grep safe ([A-Za-z0-9_-]), got "${runMarker}"`
    );
  }

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // Newest match wins: a retried run leaves an older capture behind.
    const capture = execInServer(
      `f=$(grep -l -- '${runMarker}' ${DEBUG_DIR}/*_${operation}-raw_prompt.md 2>/dev/null | tail -1); ` +
        `[ -n "$f" ] && cat "$f"`
    );
    if (capture.trim().length > 0) return capture;

    if (Date.now() >= deadline) {
      const listing = execInServer(`ls -1 ${DEBUG_DIR} 2>/dev/null | tail -20`);
      throw new Error(
        `No debug capture for operation "${operation}" containing "${runMarker}" ` +
          `appeared in ${DEBUG_DIR} within ${timeoutMs}ms. ` +
          `Last 20 files in that directory: ${listing.trim() || '(none)'}`
      );
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * What a capture says about the untrusted-content boundary (PRD #811, M2).
 *
 * The first five fields are the claim; the rest are diagnostics that ride along
 * so a failed `toMatchObject` prints why rather than just what.
 */
export interface UntrustedBoundaryObservation {
  /** The planted string reached model context at all. */
  probeReachedModel: boolean;
  /** It reached it through a tool result, not through the user message. */
  probeArrivedViaToolOutput: boolean;
  /** A named delimiter opens before it and closes after it. */
  probeEnclosedInDelimiters: boolean;
  /** The system prompt refers to that same delimiter. */
  systemPromptNamesTheDelimiter: boolean;
  /** The system prompt says delimited content is data, not instruction. */
  systemPromptFramesDelimitedContentAsData: boolean;

  /** Which tool carried the probe, e.g. `kubectl_logs`. */
  carrierTool: string | null;
  /** The opening delimiter found, verbatim. */
  delimiter: string | null;
  /** The word inside it that the system prompt is checked against. */
  delimiterKeyword: string | null;
  /** Text immediately before the probe inside its tool result block. */
  contextBeforeProbe: string;
  /** Text immediately after the probe inside its tool result block. */
  contextAfterProbe: string;
  /** Length of the system prompt the capture recorded, as a sanity check. */
  systemPromptLength: number;
}

/** Longest word of four or more characters inside a delimiter candidate. */
function delimiterKeyword(candidate: string): string | null {
  const words = candidate.match(/[A-Za-z][A-Za-z0-9_]{3,}/g) ?? [];
  if (words.length === 0) return null;
  return words.reduce((longest, word) =>
    word.length > longest.length ? word : longest
  );
}

/** Every delimiter-shaped token in `text`, capture labels already removed. */
function delimiterCandidates(text: string): string[] {
  const stripped = text.replace(CAPTURE_LABEL, ' ');
  const found = new Set<string>();
  for (const shape of DELIMITER_SHAPES) {
    for (const match of stripped.matchAll(shape)) {
      const keyword = delimiterKeyword(match[0]);
      if (keyword && !PLACEHOLDER_KEYWORDS.has(keyword.toLowerCase())) {
        found.add(match[0]);
      }
    }
  }
  return [...found];
}

/**
 * Decide whether the capture shows `probe` arriving inside a boundary the
 * system prompt describes.
 *
 * The delimiter is *derived from the capture*, never matched against a literal
 * this file chose: a candidate qualifies only if its keyword also appears after
 * the probe (a closing delimiter) and in the system prompt (the prompt refers
 * to it). That is what makes the assertion survive whatever syntax M2 picks,
 * and what makes it impossible to satisfy by adding framing prose alone or a
 * wrapper alone.
 */
export function observeUntrustedBoundary(
  capture: string,
  probe: string
): UntrustedBoundaryObservation {
  const systemStart = capture.indexOf('System: ');
  const userStart = capture.indexOf('\n\nuser: ', systemStart);
  const systemPrompt =
    systemStart >= 0 && userStart > systemStart
      ? capture.slice(systemStart + 'System: '.length, userStart)
      : '';
  const conversation = userStart > 0 ? capture.slice(userStart) : capture;

  const probeIndex = conversation.indexOf(probe);
  const blockStart =
    probeIndex < 0
      ? -1
      : conversation.lastIndexOf(TOOL_RESULT_LABEL, probeIndex);

  const base = {
    probeReachedModel: probeIndex >= 0,
    probeArrivedViaToolOutput: blockStart >= 0,
    probeEnclosedInDelimiters: false,
    systemPromptNamesTheDelimiter: false,
    systemPromptFramesDelimitedContentAsData:
      DATA_FRAMING_PROSE.test(systemPrompt),
    carrierTool: null as string | null,
    delimiter: null as string | null,
    delimiterKeyword: null as string | null,
    contextBeforeProbe: '',
    contextAfterProbe: '',
    systemPromptLength: systemPrompt.length,
  };

  if (probeIndex < 0 || blockStart < 0) return base;

  // The block runs from its own label to whichever part starts next.
  const probeEnd = probeIndex + probe.length;
  const followers = [
    conversation.indexOf(TOOL_RESULT_LABEL, probeEnd),
    conversation.indexOf(TOOL_USE_LABEL, probeEnd),
  ].filter(index => index >= 0);
  const blockEnd =
    followers.length > 0 ? Math.min(...followers) : conversation.length;

  const before = conversation.slice(blockStart, probeIndex);
  const after = conversation.slice(probeEnd, blockEnd);

  const labelEnd = conversation.indexOf(']', blockStart) + 1;
  const carrier = conversation
    .slice(blockStart, labelEnd)
    .replace(TOOL_RESULT_LABEL, '')
    .replace(']', '');

  // A fence wraps the whole result, so look for it only at the block's edges.
  const head = conversation.slice(
    labelEnd,
    Math.min(probeIndex, labelEnd + FENCE_WINDOW)
  );
  const tail = conversation.slice(
    Math.max(probeEnd, blockEnd - FENCE_WINDOW),
    blockEnd
  );

  const opening = delimiterCandidates(head).find(candidate => {
    const keyword = delimiterKeyword(candidate)!;
    // The closing half, and the system prompt's reference to it, are matched on
    // the keyword rather than the whole token: `<x>` closes as `</x>` and
    // `BEGIN X` closes as `END X`, so the literal never repeats.
    return tail.toLowerCase().includes(keyword.toLowerCase());
  });

  const keyword = opening ? delimiterKeyword(opening) : null;

  return {
    ...base,
    probeEnclosedInDelimiters: Boolean(opening),
    systemPromptNamesTheDelimiter: Boolean(
      keyword && systemPrompt.toLowerCase().includes(keyword.toLowerCase())
    ),
    carrierTool: carrier || null,
    delimiter: opening ?? null,
    delimiterKeyword: keyword,
    // Trimmed to keep a failure message readable while still showing whether
    // anything at all sits between the tool label and the planted text.
    contextBeforeProbe: before.slice(-400),
    contextAfterProbe: after.slice(0, 400),
  };
}
