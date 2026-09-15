/**
 * Unit Tests: PRD #810 security-audit and code-review fixes
 *
 * Companion to `remediate-constrained-execution.test.ts`, which pins the
 * original control (shell_exec unreachable, all-or-nothing refusal, structured
 * routing). This file pins the things the audit and the review found missing
 * from it:
 *
 *   B2 — a `kind`/`name`/`namespace` beginning with `-` is a kubectl FLAG, not
 *        a value. `{"verb":"delete","kind":"Pod","name":"--all"}` is a
 *        well-formed structured action that deletes the whole namespace, and
 *        moving to an argv array does not stop it.
 *   R3 — what the user is shown must be what executes. Nothing forces the model
 *        to emit exactly one of `command`/`kubectlAction`, so an action
 *        carrying both was displayed as one and executed as the other.
 *   R4 — the approval line must carry the payload, not just the target.
 *   R5 — `executeChoice: 2` classified actions by `command`, which a structured
 *        action does not have.
 *   R7 — a verb the model capitalised must not be refused with an enum error.
 *   R8 — the two refusal sites must return the same shape.
 *
 * plus the flag-off display strings the review found unpinned, including the
 * pre-existing `"undefined"` rendering for a gitSource-only action, which is
 * the backward-compatibility claim that matters most.
 *
 * The B1 fix (kubectl executed through `spawn` with an argv array and no
 * shell) is pinned where it lives, in
 * `packages/agentic-tools/tests/unit/base-execution.test.ts` — that suite runs
 * the real binary through a stub on PATH, because asserting on the command
 * string the old code built would not have caught the defect.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CONSTRAINED_EXECUTION_ENV_VAR,
  PAYLOAD_PREVIEW_CHARS,
  summarizeKubectlAction,
  validateKubectlAction,
} from '../../../src/core/remediation-constraints';
import {
  buildRemediationResponseShape,
  executeRemediationCommands,
  executeUserChoice,
  type ExecutionResult,
  type RemediateOutput,
  type RemediateSession,
  type RemediateSessionData,
  type RemediationAction,
} from '../../../src/tools/remediate';
import type { Logger } from '../../../src/core/error-handling';
import type { GenericSessionManager } from '../../../src/core/generic-session-manager';

vi.mock('../../../src/core/plugin-registry', () => ({
  invokePluginTool: vi.fn(),
  getPluginManager: vi.fn(() => null),
  isPluginInitialized: vi.fn(() => true),
}));

vi.mock('../../../src/core/internal-tools', () => ({
  getInternalTools: vi.fn(() => []),
  createInternalToolExecutor: vi.fn(),
  cleanupOldClones: vi.fn(),
}));

vi.mock('../../../src/core/session-events', () => ({
  getSessionEventBus: vi.fn(() => ({ publish: vi.fn() })),
  SESSION_EVENTS: {
    SESSION_UPDATED: 'session:updated',
    SESSION_CREATED: 'session:created',
  },
}));

vi.mock('../../../src/interfaces/request-context', () => ({
  getCurrentIdentity: vi.fn(() => undefined),
}));

vi.mock('../../../src/core/rbac', () => ({
  checkToolAccess: vi.fn(async () => ({ allowed: true })),
}));

async function pluginRegistry() {
  return await import('../../../src/core/plugin-registry');
}

const NAMESPACE = 'prod';

const silentLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
} as unknown as Logger;

const sessionManagerStub = {
  updateSession: vi.fn(),
  createSession: vi.fn(),
} as unknown as GenericSessionManager<RemediateSessionData>;

function structuredPatch(): NonNullable<RemediationAction['kubectlAction']> {
  return {
    verb: 'patch',
    kind: 'deployment',
    name: 'api',
    namespace: NAMESPACE,
    patchType: 'merge',
    patch: '{"spec":{"replicas":3}}',
  };
}

function sessionWith(actions: RemediationAction[]): RemediateSession {
  const finalAnalysis: RemediateOutput = {
    status: 'awaiting_user_approval',
    sessionId: 'sess-810-hardening',
    investigation: { iterations: 2, dataGathered: ['kubectl_get (call 1)'] },
    analysis: {
      rootCause: 'Something Is Broken',
      confidence: 0.95,
      factors: ['a factor'],
    },
    remediation: { summary: 'fix it', actions, risk: 'medium' },
  };

  return {
    sessionId: 'sess-810-hardening',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    data: {
      toolName: 'remediate',
      issue: 'something is broken',
      mode: 'automatic',
      status: 'analysis_complete',
      finalAnalysis,
    },
  };
}

async function execute(
  actions: RemediationAction[]
): Promise<Record<string, unknown>> {
  const response = await executeRemediationCommands(
    sessionWith(actions),
    sessionManagerStub,
    silentLogger,
    'req-810-hardening'
  );
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env[CONSTRAINED_EXECUTION_ENV_VAR];

  const { invokePluginTool } = await pluginRegistry();
  vi.mocked(invokePluginTool).mockResolvedValue({
    sessionId: 'plugin-session',
    success: true,
    result: { success: true, data: 'resource updated' },
    state: {},
  });
});

afterEach(() => {
  delete process.env[CONSTRAINED_EXECUTION_ENV_VAR];
});

// ---------------------------------------------------------------------------
// B2 — a leading dash is a flag, not a name
// ---------------------------------------------------------------------------

describe('validateKubectlAction() — kubectl flag injection (audit B2)', () => {
  test('refuses a delete whose name is --all, which would empty the namespace', () => {
    const result = validateKubectlAction({
      verb: 'delete',
      kind: 'Pod',
      name: '--all',
      namespace: NAMESPACE,
    });

    expect(result).toMatchObject({ valid: false });
    expect(result.valid === false && result.reason).toMatch(
      /name must not start with '-'/
    );
  });

  test.each([
    ['kind', '--all'],
    ['kind', '-f'],
    ['name', '--all'],
    ['name', '--kubeconfig=/tmp/evil.yaml'],
    ['name', '--grace-period=0'],
    ['namespace', '--server=https://evil.example.com'],
    // Leading whitespace does not launder it: kubectl trims nothing, but a
    // value that *looks* clean in a log and starts with a dash after trimming
    // is exactly the shape worth refusing.
    ['name', '  --all'],
  ])('refuses %s = %j', (field, value) => {
    const result = validateKubectlAction({
      verb: 'patch',
      kind: 'deployment',
      name: 'api',
      namespace: NAMESPACE,
      patch: '{}',
      [field]: value,
    });

    expect(result).toMatchObject({ valid: false });
    expect(result.valid === false && result.reason).toContain(
      `kubectlAction.${field} must not start with '-'`
    );
  });

  test('still accepts a YAML manifest starting with ---', () => {
    const manifest = '---\napiVersion: v1\nkind: ConfigMap\n';
    const result = validateKubectlAction({ verb: 'apply', manifest });

    expect(result).toMatchObject({ valid: true, action: { manifest } });
  });

  test('still accepts a patch payload, which pflag consumes as --patch value', () => {
    const result = validateKubectlAction({
      verb: 'patch',
      kind: 'deployment',
      name: 'api',
      patch: '-not-really-a-flag',
    });

    expect(result).toMatchObject({ valid: true });
  });

  test('refuses the whole set, so a hostile name never reaches a plugin tool', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const { invokePluginTool } = await pluginRegistry();

    const result = await execute([
      {
        description: 'Delete the stuck pod',
        risk: 'medium',
        rationale: 'it is stuck',
        kubectlAction: {
          verb: 'delete',
          kind: 'Pod',
          name: '--all',
          namespace: NAMESPACE,
        },
      },
    ]);

    expect(invokePluginTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      executed: false,
    });
  });
});

// ---------------------------------------------------------------------------
// R7 — verb case
// ---------------------------------------------------------------------------

describe('validateKubectlAction() — verb casing (review R7)', () => {
  test.each(['Patch', 'PATCH', ' patch '])(
    'accepts %j and normalises it to the lowercase verb',
    verb => {
      const result = validateKubectlAction({
        verb,
        kind: 'deployment',
        name: 'api',
        patch: '{}',
      });

      expect(result).toMatchObject({ valid: true, action: { verb: 'patch' } });
    }
  );

  test('still refuses a verb with no structured tool behind it', () => {
    const result = validateKubectlAction({ verb: 'Exec', kind: 'pod' });

    expect(result).toMatchObject({ valid: false });
    expect(result.valid === false && result.reason).toContain(
      'must be one of patch, apply, delete'
    );
  });
});

// ---------------------------------------------------------------------------
// R4 — the approval line must show the payload
// ---------------------------------------------------------------------------

describe('summarizeKubectlAction() (review R4)', () => {
  test('shows the patch body, not just the target', () => {
    expect(summarizeKubectlAction(structuredPatch())).toBe(
      'kubectl patch deployment/api -n prod --type=merge (structured) patch={"spec":{"replicas":3}}'
    );
  });

  test('shows the manifest for an apply', () => {
    expect(
      summarizeKubectlAction({
        verb: 'apply',
        namespace: NAMESPACE,
        manifest: 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n',
      })
    ).toBe(
      'kubectl apply -n prod (structured manifest) manifest=apiVersion: v1 kind: ConfigMap metadata: name: cfg'
    );
  });

  test('truncates a long payload rather than flooding the approval text', () => {
    const patch = `{"spec":{"x":"${'a'.repeat(500)}"}}`;
    const rendered = summarizeKubectlAction({
      verb: 'patch',
      kind: 'deployment',
      name: 'api',
      patchType: 'merge',
      patch,
    })!;

    expect(rendered).toContain('…');
    expect(rendered.split('patch=')[1]).toHaveLength(
      PAYLOAD_PREVIEW_CHARS + 1 // the ellipsis
    );
  });

  test('renders a delete by name without a payload clause', () => {
    expect(
      summarizeKubectlAction({
        verb: 'delete',
        kind: 'pod',
        name: 'api-7d9f',
        namespace: NAMESPACE,
      })
    ).toBe('kubectl delete pod/api-7d9f -n prod (structured)');
  });

  test('returns undefined for anything that would not execute', () => {
    expect(summarizeKubectlAction(undefined)).toBeUndefined();
    expect(summarizeKubectlAction({ verb: 'patch' })).toBeUndefined();
    expect(
      summarizeKubectlAction({ verb: 'delete', kind: 'Pod', name: '--all' })
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R3 — displayed must equal executed
// ---------------------------------------------------------------------------

describe('action display (review R3)', () => {
  /** An action carrying a benign command AND a destructive structured form. */
  function conflictingAction(): RemediationAction {
    return {
      description: 'Scale the API deployment',
      risk: 'medium',
      rationale: 'it is under-provisioned',
      command:
        'kubectl patch deployment api -n prod --type=merge -p \'{"spec":{"replicas":3}}\'',
      kubectlAction: {
        verb: 'delete',
        kind: 'secret',
        name: 'db-credentials',
        namespace: NAMESPACE,
      },
    };
  }

  function executedLines(action: RemediationAction): string[] {
    const results: ExecutionResult[] = [
      {
        action: 'action_1: Scale the API deployment',
        success: true,
        timestamp: new Date(0),
      },
    ];

    return buildRemediationResponseShape({
      overallSuccess: true,
      executedCommandCount: 1,
      gitOpsWithoutPr: [],
      actions: [action],
      results,
      rootCause: 'Something Is Broken',
      validationAttempted: false,
    }).nextSteps;
  }

  test('flag on: the executed-commands list shows the structured form that runs', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';

    const lines = executedLines(conflictingAction()).join('\n');

    expect(lines).toContain(
      'kubectl delete secret/db-credentials -n prod (structured) ✓'
    );
    expect(lines).not.toContain('replicas');
  });

  test('flag off: the command string is shown, exactly as before', () => {
    const lines = executedLines(conflictingAction()).join('\n');

    expect(lines).toContain(
      '  1. kubectl patch deployment api -n prod --type=merge -p \'{"spec":{"replicas":3}}\' ✓'
    );
    expect(lines).not.toContain('db-credentials');
  });

  test('flag on: the structured form runs, matching what was displayed', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const { invokePluginTool } = await pluginRegistry();

    await execute([conflictingAction()]);

    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'kubectl_delete',
      { kind: 'secret', name: 'db-credentials', namespace: NAMESPACE }
    );
  });

  test('flag on with no structured form: falls back to the command string rather than showing nothing', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';

    const lines = executedLines({
      description: 'Roll back the release',
      risk: 'medium',
      rationale: 'history is damaged',
      command: 'helm rollback web 1 --namespace prod',
    }).join('\n');

    expect(lines).toContain('helm rollback web 1 --namespace prod');
  });
});

// ---------------------------------------------------------------------------
// Flag-off display, byte for byte (review: unpinned backward compatibility)
// ---------------------------------------------------------------------------

describe('flag-off display strings are unchanged', () => {
  const rootCause = 'Something Is Broken';

  function shapeFor(
    actions: RemediationAction[],
    results: ExecutionResult[],
    executedCommandCount: number
  ) {
    return buildRemediationResponseShape({
      overallSuccess: results.every(r => r.success),
      executedCommandCount,
      gitOpsWithoutPr: [],
      actions,
      results,
      rootCause,
      validationAttempted: false,
    });
  }

  test('a command action renders as the command, with its own outcome mark', () => {
    const shape = shapeFor(
      [
        {
          description: 'scale up',
          risk: 'low',
          rationale: 'r',
          command: 'kubectl scale deployment/api --replicas=3 -n prod',
        },
        {
          description: 'restart',
          risk: 'low',
          rationale: 'r',
          command: 'kubectl rollout restart deployment/api -n prod',
        },
      ],
      [
        { action: 'action_1: scale up', success: true, timestamp: new Date(0) },
        {
          action: 'action_2: restart',
          success: false,
          error: 'boom',
          timestamp: new Date(0),
        },
      ],
      2
    );

    expect(shape.nextSteps).toContain(
      '  1. kubectl scale deployment/api --replicas=3 -n prod ✓'
    );
    expect(shape.nextSteps).toContain(
      '  2. kubectl rollout restart deployment/api -n prod ✗'
    );
  });

  /**
   * A gitSource-only action carries neither a `command` nor a `kubectlAction`,
   * so it renders as undefined and the executed-commands listing drops it.
   * Pinned because the listing renumbers what survives the filter: a kubectl
   * action sharing a set with a GitOps action must come out as `1.`, not `2.`.
   *
   * (The pre-approval summary built in `conductInvestigation` does NOT filter,
   * so the same action interpolates the literal string "undefined" there. That
   * is pre-existing, out of PRD #810's scope, and has no unit-reachable seam —
   * it is behind a live AI investigation.)
   */
  test('a gitSource-only action is dropped from the executed list, and the rest renumber', () => {
    const shape = shapeFor(
      [
        {
          description: 'fix the manifest in Git',
          risk: 'low',
          rationale: 'Argo CD owns it',
          gitSource: {
            repoURL: 'https://github.com/acme/demo.git',
            repoPath: 'session-abc/acme-demo',
            branch: 'main',
            files: [{ path: 'a.yaml', content: 'x', description: 'd' }],
          },
        },
        {
          description: 'scale up',
          risk: 'low',
          rationale: 'r',
          command: 'kubectl scale deployment/api --replicas=3 -n prod',
        },
      ],
      [
        {
          action: 'action_1: fix the manifest in Git',
          success: true,
          timestamp: new Date(0),
        },
        { action: 'action_2: scale up', success: true, timestamp: new Date(0) },
      ],
      1
    );

    expect(shape.nextSteps.filter(line => /^ {2}\d+\./.test(line))).toEqual([
      '  1. kubectl scale deployment/api --replicas=3 -n prod ✓',
    ]);
    expect(shape.nextSteps.join('\n')).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// R5 — executeChoice: 2 routing and instructions
// ---------------------------------------------------------------------------

describe('executeChoice: 2 under the constraint (review R5)', () => {
  async function choiceTwo(
    actions: RemediationAction[]
  ): Promise<Record<string, unknown>> {
    const session = sessionWith(actions);
    const manager = {
      getSession: vi.fn(() => session),
      updateSession: vi.fn(),
      createSession: vi.fn(),
    } as unknown as GenericSessionManager<RemediateSessionData>;
    const response = await executeUserChoice(
      manager,
      session.sessionId,
      2,
      silentLogger,
      'req-810-choice2'
    );
    return JSON.parse(response.content[0].text) as Record<string, unknown>;
  }

  function structuredAction(): RemediationAction {
    return {
      description: 'Scale the API deployment',
      risk: 'medium',
      rationale: 'under-provisioned',
      kubectlAction: structuredPatch(),
    };
  }

  function gitOpsAction(): RemediationAction {
    return {
      description: 'Fix the image tag in Git',
      risk: 'low',
      rationale: 'Argo CD owns this resource',
      gitSource: {
        repoURL: 'https://github.com/acme/demo.git',
        repoPath: 'session-abc/acme-demo',
        branch: 'main',
        files: [{ path: 'apps/demo.yaml', content: 'x', description: 'd' }],
      },
    };
  }

  test('a mixed set no longer hides the kubectl half behind the GitOps message', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';

    const result = await choiceTwo([gitOpsAction(), structuredAction()]);

    // The bug: `kubectlActions` filtered on `command`, so a structured action
    // counted as neither, the GitOps-only branch fired, and the patch vanished.
    expect(result.message).not.toBe(
      'GitOps remediation detected - use automatic execution (choice 1) for PR creation'
    );
    expect(result.message).toBe('Ready for agent execution');

    const nextSteps = (
      result.instructions as { nextSteps: string[] }
    ).nextSteps.join('\n');
    expect(nextSteps).toContain('kubectlAction');
    expect(nextSteps).toContain('gitSource');
  });

  test('a GitOps-only set still routes to the PR message', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';

    const result = await choiceTwo([gitOpsAction()]);

    expect(result.message).toBe(
      'GitOps remediation detected - use automatic execution (choice 1) for PR creation'
    );
  });

  test('a structured-only set is not told to run command strings that do not exist', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';

    const result = await choiceTwo([structuredAction()]);

    const nextSteps = (result.instructions as { nextSteps: string[] })
      .nextSteps;
    expect(nextSteps[0]).not.toContain(
      'Execute the kubectl commands shown in the remediation section'
    );
    expect(nextSteps[0]).toContain('kubectlAction');
    expect(nextSteps[0]).toContain(
      'instead of interpolating them into a shell string'
    );
  });

  test('a command-only set keeps the original instruction, byte for byte', async () => {
    const result = await choiceTwo([
      {
        description: 'scale up',
        risk: 'low',
        rationale: 'r',
        command: 'kubectl scale deployment/api --replicas=3 -n prod',
      },
    ]);

    const nextSteps = (result.instructions as { nextSteps: string[] })
      .nextSteps;
    expect(nextSteps[0]).toBe(
      'STEP 1: Execute the kubectl commands shown in the remediation section using your Bash tool'
    );
  });
});

// ---------------------------------------------------------------------------
// R8 — the two refusal sites agree on a shape
// ---------------------------------------------------------------------------

describe('refusal shape (review R8)', () => {
  test('carries the analysis, the session and the same status/executed pair as the first gate', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';

    const result = await execute([
      {
        description: 'Roll the Helm release back',
        risk: 'medium',
        rationale: 'history is damaged',
        command: 'helm rollback web 1 --namespace prod',
      },
    ]);

    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      sessionId: 'sess-810-hardening',
      executed: false,
      results: [],
    });
    // `...finalAnalysis` is what the first gate spreads, so the refusal carries
    // the full analysis rather than three hand-picked fields.
    expect(result).toMatchObject({
      investigation: { iterations: 2 },
      analysis: { rootCause: 'Something Is Broken', confidence: 0.95 },
      remediation: { summary: 'fix it', risk: 'medium' },
    });
    expect(result.fallbackReason).toMatch(/constrain/i);
    expect(result.guidance).toBe(result.fallbackReason);
  });
});
