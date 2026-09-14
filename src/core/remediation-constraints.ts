/**
 * Constrained Automatic Remediation (PRD #810)
 *
 * `remediate` with `mode: 'automatic'` normally hands the model's free-form
 * `action.command` string to `shell_exec` — `child_process.exec`, with no
 * allowlist and full shell metacharacter interpretation. The investigation loop
 * reads attacker-writable text (logs, events, annotations), so injected content
 * can steer both the command and the model's self-reported score that
 * authorizes it.
 *
 * When `remediation.constrainedExecution.enabled` is set (rendered by the chart
 * into DOT_AI_REMEDIATION_CONSTRAINED_EXEC), remediation may only run
 * *structured* kubectl operations: discrete typed fields handed to the
 * `kubectl_patch` / `kubectl_apply` / `kubectl_delete` plugin tools, which build
 * an argv array and hand it to `spawn` with no shell
 * (`packages/agentic-tools/src/tools/base.ts`, `runWithoutShell`). No string
 * reaches a shell. Anything not expressible that way is refused outright rather
 * than silently downgraded.
 *
 * Free-form `action.command` is refused in BOTH manual and automatic mode: a
 * command string that is never executed by this server is not a command, and
 * offering it for manual approval would reinstate the path the flag exists to
 * remove.
 *
 * The flag is opt-in and read at call time, never cached at module load: the
 * integration suite flips the env var on a running deployment.
 */

/** Verbs with a structured plugin tool behind them. */
export type KubectlVerb = 'patch' | 'apply' | 'delete';

/** Patch types accepted by the `kubectl_patch` plugin tool. */
export type KubectlPatchType = 'strategic' | 'merge' | 'json';

/**
 * Shell-free form of a remediation action. Every field is a discrete value
 * passed as one argv element (or on stdin) — never concatenated into a command
 * line.
 */
export interface KubectlAction {
  verb: KubectlVerb;
  kind?: string;
  name?: string;
  namespace?: string;
  /** verb: 'patch' */
  patch?: string;
  /** verb: 'patch' */
  patchType?: KubectlPatchType;
  /** verb: 'apply', or a delete expressed by manifest */
  manifest?: string;
}

/**
 * Env var rendered by `charts/templates/deployment.yaml` from the
 * `remediation.constrainedExecution.enabled` chart value.
 */
export const CONSTRAINED_EXECUTION_ENV_VAR =
  'DOT_AI_REMEDIATION_CONSTRAINED_EXEC';

/** Plugin tool names this module routes to, one per verb. */
export const STRUCTURED_TOOL_BY_VERB: Record<KubectlVerb, string> = {
  patch: 'kubectl_patch',
  apply: 'kubectl_apply',
  delete: 'kubectl_delete',
};

const KUBECTL_VERBS: KubectlVerb[] = ['patch', 'apply', 'delete'];
const PATCH_TYPES: KubectlPatchType[] = ['strategic', 'merge', 'json'];

/**
 * Whether automatic remediation is restricted to structured kubectl operations.
 * Disabled by default: the free-form `shell_exec` path stays exactly as it was.
 *
 * Read on every call rather than captured once — the value is flipped on a
 * running deployment by the integration tests, and a module-load constant would
 * make unit testing it impossible.
 */
export function isConstrainedExecutionEnabled(): boolean {
  return process.env[CONSTRAINED_EXECUTION_ENV_VAR] === 'true';
}

/** Result of checking one action's structured form. */
export type KubectlActionValidation =
  | { valid: true; action: KubectlAction }
  | { valid: false; reason: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Fields that land in a bare positional argv slot, in the order kubectl reads
 * them. A leading `-` there is a flag to kubectl, not a resource name — an
 * argv array does not change that, which is why this check is separate from the
 * shell-free execution path.
 */
const POSITIONAL_FIELDS = ['kind', 'name', 'namespace'] as const;

/**
 * Reject a value that kubectl would parse as a flag.
 *
 * `{"verb":"delete","kind":"Pod","name":"--all","namespace":"prod"}` is a
 * well-formed structured action by every other measure, and it deletes every
 * pod in the namespace. `--kubeconfig=`/`--server=` in the same slot redirect
 * the client at another cluster. The plugin tools also put a `--` separator in
 * front of their positionals, so this is the second of two independent stops.
 */
function rejectsAsFlag(value: string): boolean {
  return value.trimStart().startsWith('-');
}

/**
 * Validate the structured form before trusting it.
 *
 * A `patch` with no `kind`/`name`/`patch` is not executable, so it counts as
 * unexpressible (which means refusal) rather than being handed to the plugin to
 * fail on. The same applies to an `apply` with no manifest and a `delete` with
 * neither a manifest nor a kind+name pair.
 */
export function validateKubectlAction(
  candidate: unknown
): KubectlActionValidation {
  if (candidate === undefined || candidate === null) {
    return {
      valid: false,
      reason: 'no structured kubectlAction was provided',
    };
  }

  if (typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, reason: 'kubectlAction is not an object' };
  }

  const raw = candidate as Record<string, unknown>;
  const verb = raw.verb;

  // Case-normalised so a model that writes "Patch" is not refused with a
  // confusing enum error; everything downstream keys off the lowercase form.
  const normalizedVerb = isNonEmptyString(verb)
    ? verb.trim().toLowerCase()
    : undefined;

  if (
    normalizedVerb === undefined ||
    !KUBECTL_VERBS.includes(normalizedVerb as KubectlVerb)
  ) {
    return {
      valid: false,
      reason: `kubectlAction.verb must be one of ${KUBECTL_VERBS.join(', ')} (got ${JSON.stringify(verb)})`,
    };
  }

  const action: KubectlAction = { verb: normalizedVerb as KubectlVerb };

  if (isNonEmptyString(raw.kind)) action.kind = raw.kind;
  if (isNonEmptyString(raw.name)) action.name = raw.name;
  if (isNonEmptyString(raw.namespace)) action.namespace = raw.namespace;
  if (isNonEmptyString(raw.patch)) action.patch = raw.patch;
  if (isNonEmptyString(raw.manifest)) action.manifest = raw.manifest;

  // `patch` and `manifest` are deliberately exempt: pflag consumes the value
  // after `--patch` unconditionally, a manifest travels on stdin, and a YAML
  // document legitimately starts with `---`.
  for (const field of POSITIONAL_FIELDS) {
    const value = action[field];
    if (value !== undefined && rejectsAsFlag(value)) {
      return {
        valid: false,
        reason: `kubectlAction.${field} must not start with '-' — kubectl would read it as a flag rather than a value (got ${JSON.stringify(value)})`,
      };
    }
  }

  if (raw.patchType !== undefined) {
    if (
      !isNonEmptyString(raw.patchType) ||
      !PATCH_TYPES.includes(raw.patchType as KubectlPatchType)
    ) {
      return {
        valid: false,
        reason: `kubectlAction.patchType must be one of ${PATCH_TYPES.join(', ')} (got ${JSON.stringify(raw.patchType)})`,
      };
    }
    action.patchType = raw.patchType as KubectlPatchType;
  }

  switch (action.verb) {
    case 'patch': {
      const missing = (['kind', 'name', 'patch'] as const).filter(
        field => action[field] === undefined
      );
      if (missing.length > 0) {
        return {
          valid: false,
          reason: `kubectlAction.verb 'patch' requires ${missing.join(', ')}`,
        };
      }
      return { valid: true, action };
    }
    case 'apply': {
      if (action.manifest === undefined) {
        return {
          valid: false,
          reason: "kubectlAction.verb 'apply' requires manifest",
        };
      }
      return { valid: true, action };
    }
    case 'delete': {
      if (
        action.manifest === undefined &&
        (action.kind === undefined || action.name === undefined)
      ) {
        return {
          valid: false,
          reason:
            "kubectlAction.verb 'delete' requires manifest, or both kind and name",
        };
      }
      return { valid: true, action };
    }
  }
}

/** A plugin tool call built from a validated structured action. */
export interface StructuredInvocation {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Map a validated structured action onto the input schema of its plugin tool.
 * The three schemas differ: `kubectl_patch` requires kind/name/patch and takes
 * patchType, `kubectl_apply` takes a manifest, `kubectl_delete` takes either a
 * manifest or a kind+name pair.
 */
export function buildStructuredInvocation(
  action: KubectlAction
): StructuredInvocation {
  const toolName = STRUCTURED_TOOL_BY_VERB[action.verb];

  switch (action.verb) {
    case 'patch':
      return {
        toolName,
        args: {
          kind: action.kind,
          name: action.name,
          patch: action.patch,
          ...(action.namespace ? { namespace: action.namespace } : {}),
          ...(action.patchType ? { patchType: action.patchType } : {}),
        },
      };
    case 'apply':
      return {
        toolName,
        args: {
          manifest: action.manifest,
          ...(action.namespace ? { namespace: action.namespace } : {}),
        },
      };
    case 'delete':
      return {
        toolName,
        args: {
          // kubectl_delete ignores kind/name when a manifest is present, so
          // send exactly one addressing form rather than both.
          ...(action.manifest
            ? { manifest: action.manifest }
            : { kind: action.kind, name: action.name }),
          ...(action.namespace ? { namespace: action.namespace } : {}),
        },
      };
  }
}

/**
 * Minimal shape of a remediation action this module needs. `RemediationAction`
 * in `src/tools/remediate.ts` is assignable to it; declaring it structurally
 * here keeps core free of a dependency on tools.
 */
export interface ConstrainableAction {
  description?: string;
  command?: string;
  gitSource?: unknown;
  kubectlAction?: unknown;
}

/** One action that cannot be run under the constraint, and why. */
export interface UnexpressibleAction {
  /** 1-based position in the execution set, matching the `action_N` ids. */
  position: number;
  description: string;
  reason: string;
}

export type ConstrainedExecutionCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      unexpressible: UnexpressibleAction[];
    };

/**
 * A gitSource action opens a pull request instead of mutating the cluster and
 * never reaches `shell_exec`, so the constraint does not apply to it. This is
 * the same branch condition `executeRemediationCommands` routes on.
 */
export function isGitOpsAction<T extends ConstrainableAction>(
  action: T
): action is T & { gitSource: NonNullable<T['gitSource']> } {
  return Boolean(action.gitSource) && !action.command;
}

/**
 * Gate the whole execution set.
 *
 * Refusal is all-or-nothing on purpose: executing the expressible half of a
 * remediation and skipping the rest would leave the cluster in a state nobody
 * planned for, and would be exactly the silent downgrade this control exists to
 * prevent.
 */
export function checkConstrainedExecution(
  actions: ConstrainableAction[]
): ConstrainedExecutionCheck {
  if (!isConstrainedExecutionEnabled()) {
    return { allowed: true };
  }

  const unexpressible: UnexpressibleAction[] = [];

  actions.forEach((action, index) => {
    if (isGitOpsAction(action)) {
      return;
    }

    const validation = validateKubectlAction(action.kubectlAction);
    if (!validation.valid) {
      unexpressible.push({
        position: index + 1,
        description: action.description || '(no description)',
        reason: validation.reason,
      });
    }
  });

  if (unexpressible.length === 0) {
    return { allowed: true };
  }

  const listed = unexpressible
    .map(item => `${item.position}. ${item.description} — ${item.reason}`)
    .join('; ');

  const reason =
    `Execution refused by constrained remediation execution ` +
    `(remediation.constrainedExecution.enabled=true): ${unexpressible.length} of ${actions.length} ` +
    `remediation action(s) can only be expressed as a free-form shell command, and free-form ` +
    `commands are never run under this constraint — only structured kubectl ` +
    `${KUBECTL_VERBS.join('/')} operations are. Actions without a structured form: ${listed}. ` +
    `Review the proposed remediation and apply it yourself, or express the fix as a kubectl ` +
    `patch/apply/delete.`;

  return { allowed: false, reason, unexpressible };
}

/** How much of a patch body or manifest the one-liner shows. */
export const PAYLOAD_PREVIEW_CHARS = 120;

/**
 * Render the start of a payload on one line.
 *
 * Whitespace is collapsed so a multi-document YAML manifest cannot break the
 * listing it appears in, and the result is truncated — this is a review aid,
 * not the payload itself.
 */
function previewPayload(label: string, value: string | undefined): string {
  if (!value) {
    return '';
  }

  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (collapsed === '') {
    return '';
  }

  const shown =
    collapsed.length > PAYLOAD_PREVIEW_CHARS
      ? `${collapsed.slice(0, PAYLOAD_PREVIEW_CHARS)}…`
      : collapsed;

  return ` ${label}=${shown}`;
}

/**
 * Human-readable one-liner for a structured action, for the places that used to
 * print `action.command`. Deliberately not a shell command: it is display text,
 * and nothing ever executes it.
 *
 * It carries the payload as well as the target (PRD #810 review finding R4):
 * in manual mode this string is the whole of what the operator sees before
 * approving, and "patch deployment/api" without the patch body asks them to
 * approve a change they cannot read.
 */
export function summarizeKubectlAction(candidate: unknown): string | undefined {
  const validation = validateKubectlAction(candidate);
  if (!validation.valid) {
    return undefined;
  }

  const action = validation.action;
  const target = [action.kind, action.name].filter(Boolean).join('/');
  const namespace = action.namespace ? ` -n ${action.namespace}` : '';

  switch (action.verb) {
    case 'patch':
      return `kubectl patch ${target}${namespace} --type=${action.patchType || 'strategic'} (structured)${previewPayload('patch', action.patch)}`;
    case 'apply':
      return `kubectl apply${namespace} (structured manifest)${previewPayload('manifest', action.manifest)}`;
    case 'delete':
      return action.manifest
        ? `kubectl delete${namespace} (structured manifest)${previewPayload('manifest', action.manifest)}`
        : `kubectl delete ${target}${namespace} (structured)`;
  }
}
