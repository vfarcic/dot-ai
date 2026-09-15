/**
 * The untrusted-content boundary for AI investigation loops (PRD #811, part 1).
 *
 * `kubectl_logs`, `kubectl_events` and `kubectl_describe` (annotations) all
 * return text that anyone who can write to a workload controls; so does
 * `fs_read` over a cloned GitOps repository, and so does any third-party MCP
 * server. Until this module existed those results re-entered model context as
 * bare text — nothing marked where they started, nothing told the model that
 * text arriving that way is evidence rather than instruction.
 *
 * Two halves, and neither works alone:
 *
 * 1. **Delimit** — {@link withUntrustedContentBoundary} wraps every tool result
 *    of an investigation loop in {@link UNTRUSTED_TOOL_OUTPUT_OPEN} /
 *    {@link UNTRUSTED_TOOL_OUTPUT_CLOSE} as it re-enters context — whatever
 *    shape the executor returned, and whatever it threw — having first replaced
 *    any delimiter the result carried itself, so the pair around the block is
 *    the only one in it.
 * 2. **Frame** — `prompts/remediate-system.md` and `prompts/operate-system.md`
 *    name that same tag and state what it means. A fence the system prompt
 *    never mentions is decoration.
 *
 * The delimiter token lives here rather than in `prompts/` because it is
 * structure, not prose: it is emitted mechanically around machine output, and
 * the prompts that describe it are loaded from disk as usual. The prose that
 * gives it meaning is in those prompt files, per the project's no-hardcoded-
 * prompts rule.
 *
 * **Not configurable, by design.** A trust boundary an operator has to switch
 * on is not a boundary — see PRD #811. There is no flag and no chart value.
 *
 * `src/evaluation/injection/composition.ts` mirrors this for the injection
 * eval; `tests/unit/evaluation/injection/composition.test.ts` fails if the two
 * drift apart.
 */

import type { ToolExecutor } from './ai-provider.interface';
import { ConsoleLogger } from './error-handling';

const logger = new ConsoleLogger('UntrustedContentBoundary');

/**
 * Name of the delimiter, and the single word both halves of the boundary share.
 *
 * The system prompts refer to the model-visible tag below by this name, so
 * changing it here means changing it in `prompts/remediate-system.md` and
 * `prompts/operate-system.md` in the same commit.
 */
export const UNTRUSTED_TOOL_OUTPUT_TAG = 'untrusted_tool_output';

/** Opening delimiter written immediately before a tool result. */
export const UNTRUSTED_TOOL_OUTPUT_OPEN = `<${UNTRUSTED_TOOL_OUTPUT_TAG}>`;

/** Closing delimiter written immediately after a tool result. */
export const UNTRUSTED_TOOL_OUTPUT_CLOSE = `</${UNTRUSTED_TOOL_OUTPUT_TAG}>`;

/**
 * What a tool result renders to when it can be neither serialised nor coerced.
 *
 * Deliberately a constant rather than a best-effort coercion: the values that
 * reach it (a circular graph, a null-prototype object, a value whose `toJSON`
 * throws) all coerce to `[object Object]` at best, which says no more than this
 * does, and the coercion itself is the thing that throws.
 */
const UNRENDERABLE_TOOL_OUTPUT = '[unserialisable tool output]';

/**
 * Render whatever an executor returned as the text the model will read.
 *
 * Tool results reach the model as text either way — the AI SDK serialises a
 * non-string result before it is sent — so doing the conversion here changes
 * nothing about what the model sees, and it is what lets the fence be
 * unconditional. An executor that returned an object would otherwise be the one
 * path out of the boundary.
 *
 * **Total by construction.** Every exit is a string and nothing here can throw:
 * the earlier version's `String(output)` fallback sat outside the guard and
 * threw `TypeError: Cannot convert object to primitive value` on a
 * null-prototype circular object, which is a throw *from inside the wrapper* —
 * the one failure the fence cannot frame its way out of.
 */
function renderToolOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output === null || output === undefined) return '';

  try {
    // `JSON.stringify` returns `undefined` for a function or a symbol, hence the
    // coercion — kept inside the guard, because it is the half that throws.
    return JSON.stringify(output, null, 2) ?? String(output);
  } catch {
    return UNRENDERABLE_TOOL_OUTPUT;
  }
}

/**
 * What is left in place of a delimiter a tool result carried itself.
 *
 * Visible rather than silent: the prompts already tell the model to report
 * apparent injection attempts as a finding, so this *adds* a signal rather than
 * erasing one — which is the opposite trade from the injection corpus, where
 * stripping a payload would destroy the evidence being scored.
 */
export const NEUTRALISED_BOUNDARY_TOKEN = '[boundary token removed]';

/**
 * Replace any delimiter the payload carried, so the only tag pair in the block
 * is the one this module put there.
 *
 * Without this the fence is forgeable at the text level, and the strongest form
 * of that is not ragged: a payload emitting a close, then its own prose, then an
 * open produces a **perfectly balanced** pair of regions with attacker text
 * apparently between them. Nothing looks like a mistake.
 *
 * On every `VercelProvider` deployment the tool result also travels as a
 * structured `tool-result` part, so the fence is a second marker on top of an
 * unforgeable one and this only closes a textual ambiguity. On
 * `AI_PROVIDER=host` there is no structural boundary at all — results are
 * flattened into a `role: 'user'` message
 * (`src/core/providers/host-provider.ts:348-354`) — and there the fence is the
 * only boundary there is.
 *
 * Exact-match on the literal tags only. Case and whitespace variants
 * (`</UNTRUSTED_TOOL_OUTPUT>`, `</ untrusted_tool_output >`) are left alone
 * deliberately: they are not the token the prompts name, so they are strictly
 * weaker than the exact match, and pretending to normalise would invite
 * confidence this does not earn.
 *
 * The fidelity cost is a string no cluster emits by accident. If a tool result
 * ever does carry one legitimately — a runbook quoting this documentation, a
 * manifest read from a GitOps repo — the model sees the marker instead, which
 * it is already told to report, and the diagnosis it is doing does not turn on
 * the difference.
 */
function neutraliseForgedDelimiters(rendered: string): string {
  return rendered
    .replaceAll(UNTRUSTED_TOOL_OUTPUT_CLOSE, NEUTRALISED_BOUNDARY_TOKEN)
    .replaceAll(UNTRUSTED_TOOL_OUTPUT_OPEN, NEUTRALISED_BOUNDARY_TOKEN);
}

/**
 * Wrap one tool result in the untrusted-content delimiters.
 *
 * Newlines around the payload are load-bearing for readability only; the
 * boundary is the tag pair — and, after {@link neutraliseForgedDelimiters}, it
 * is the *only* tag pair in the block.
 */
export function wrapUntrustedToolOutput(output: unknown): string {
  const rendered = neutraliseForgedDelimiters(renderToolOutput(output));

  return `${UNTRUSTED_TOOL_OUTPUT_OPEN}\n${rendered}\n${UNTRUSTED_TOOL_OUTPUT_CLOSE}`;
}

/**
 * Wrap a composed `ToolExecutor` so every result it returns is delimited.
 *
 * Applied to the *final* executor of an investigation loop — the one
 * `toolLoop` is handed — rather than inside any one router. `remediate`
 * composes three tool sources (plugin tools, the internal `git_clone` /
 * `fs_list` / `fs_read` handlers, and attached MCP servers) and `operate`
 * composes two; each has its own executor, and each carries content this
 * boundary exists for. Wrapping the composition covers all of them at once,
 * and covers whatever is chained in next, which an allowlist of tool names
 * would not.
 *
 * Every result is framed, not a hand-picked subset: inside an investigation
 * loop all tool output is external observation rather than instruction, so the
 * framing is honest for all of it — and a list of "the untrusted ones" goes
 * stale exactly when someone adds a tool without thinking about this.
 */
export function withUntrustedContentBoundary(
  executor: ToolExecutor
): ToolExecutor {
  return async (toolName: string, input: unknown): Promise<unknown> => {
    try {
      return wrapUntrustedToolOutput(await executor(toolName, input));
    } catch (err) {
      // A thrown error is not an abort — it is another way for external text to
      // reach the model, and until this catch existed it was the one path around
      // the fence. The AI SDK turns a rejection into an unframed `error-text`
      // tool result and *continues the loop*
      // (`node_modules/ai/dist/index.mjs:2906-2928`); `HostProvider` is worse,
      // pushing the raw message into a `role: 'user'` message
      // (`src/core/providers/host-provider.ts:355-364`) — the channel the system
      // prompts name as authoritative. The message carries whatever the failing
      // call embedded in it, which for `fs_read`/`fs_list` over a cloned GitOps
      // repo is a path the attacker helped choose.
      //
      // Returning a framed `Error: …` string is what `PluginManager` and
      // `McpClientManager` already do for every error they catch
      // (`plugin-manager.ts:532-540`, `mcp-client-manager.ts:695-702`), so the
      // loop is no less able to tell a tool error from a tool result than it was
      // — those two routers made that trade for their own errors long ago.
      const message =
        err instanceof Error ? err.message : renderToolOutput(err);

      logger.error(
        'Tool executor threw; framed as an untrusted error result',
        err instanceof Error ? err : new Error(message),
        { tool: toolName }
      );

      return wrapUntrustedToolOutput(`Error: ${message}`);
    }
  };
}
