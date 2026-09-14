/**
 * Unit Tests: Constrained Automatic Remediation (PRD #810)
 *
 * The integration suite can only observe the *outcome* of a constrained run —
 * the cluster changed, or it did not. The security property is narrower than
 * that: with `remediation.constrainedExecution.enabled` set, `shell_exec` must
 * never be invoked, for any action, whatever the model proposed and whatever
 * content steered it. "Nothing happened to the cluster" is weak evidence for
 * that; "the shell tool was never called" is the real claim, and it is only
 * observable here.
 *
 * So these tests pin, directly against `executeRemediationCommands`:
 *   - flag on + free-form action  ⇒ no plugin tool invoked at all, refusal set
 *   - flag on + structured action ⇒ the matching kubectl_* tool, right arguments
 *   - flag on + gitSource action  ⇒ PR path still runs; GitOps is not refused
 *   - flag off                    ⇒ shell_exec, byte-identical to before
 *
 * plus the pure validation and routing logic in
 * `src/core/remediation-constraints.ts`.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildStructuredInvocation,
  checkConstrainedExecution,
  CONSTRAINED_EXECUTION_ENV_VAR,
  isConstrainedExecutionEnabled,
  validateKubectlAction,
  type KubectlAction,
} from '../../../src/core/remediation-constraints';
import {
  executeRemediationCommands,
  type RemediateOutput,
  type RemediateSession,
  type RemediationAction,
} from '../../../src/tools/remediate';
import type { Logger } from '../../../src/core/error-handling';
import type { GenericSessionManager } from '../../../src/core/generic-session-manager';
import type { RemediateSessionData } from '../../../src/tools/remediate';

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
  SESSION_EVENTS: { SESSION_UPDATED: 'session:updated' },
}));

async function pluginRegistry() {
  return await import('../../../src/core/plugin-registry');
}

async function internalTools() {
  return await import('../../../src/core/internal-tools');
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

function freeFormAction(
  command = 'helm rollback web 1 --namespace prod'
): RemediationAction {
  return {
    description: 'Roll the Helm release back to revision 1',
    command,
    risk: 'medium',
    rationale: 'The damage is in Helm release history, not in a resource',
  };
}

function structuredPatchAction(): RemediationAction {
  return {
    description: 'Raise the memory limit on container 0',
    risk: 'medium',
    rationale: 'The container is OOMKilled at its current limit',
    kubectlAction: {
      verb: 'patch',
      kind: 'deployment',
      name: 'api',
      namespace: NAMESPACE,
      patchType: 'json',
      patch: '[{"op":"replace","path":"/spec/replicas","value":3}]',
    },
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
      files: [
        { path: 'apps/demo.yaml', content: 'x', description: 'fixed the tag' },
      ],
    },
  };
}

/**
 * A session parked at analysis_complete with the given actions, and no
 * validationIntent — post-execution validation runs a whole second AI
 * investigation, which is not what these tests are about.
 */
function sessionWith(actions: RemediationAction[]): RemediateSession {
  const finalAnalysis: RemediateOutput = {
    status: 'awaiting_user_approval',
    sessionId: 'sess-810',
    investigation: { iterations: 3, dataGathered: ['kubectl_get (call 1)'] },
    analysis: {
      rootCause: 'Something Is Broken',
      confidence: 0.95,
      factors: ['a factor'],
    },
    remediation: { summary: 'fix it', actions, risk: 'medium' },
  };

  return {
    sessionId: 'sess-810',
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
    'req-810'
  );
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

/** Every plugin tool name invoked during the call, in order. */
async function invokedTools(): Promise<string[]> {
  const { invokePluginTool } = await pluginRegistry();
  return vi.mocked(invokePluginTool).mock.calls.map(call => call[1] as string);
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

  const { createInternalToolExecutor } = await internalTools();
  vi.mocked(createInternalToolExecutor).mockReturnValue(
    vi.fn(async () => ({
      status: 'created',
      prNumber: 7,
      prUrl: 'https://github.com/acme/demo/pull/7',
      branch: 'remediate/abc',
      baseBranch: 'main',
      filesChanged: ['apps/demo.yaml'],
    })) as unknown as ReturnType<typeof createInternalToolExecutor>
  );
});

afterEach(() => {
  delete process.env[CONSTRAINED_EXECUTION_ENV_VAR];
});

describe('isConstrainedExecutionEnabled()', () => {
  test('is off by default, so the free-form path is unchanged', () => {
    expect(isConstrainedExecutionEnabled()).toBe(false);
  });

  test('is on only for the exact string "true"', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    expect(isConstrainedExecutionEnabled()).toBe(true);

    for (const value of ['True', 'TRUE', '1', 'yes', '', 'false']) {
      process.env[CONSTRAINED_EXECUTION_ENV_VAR] = value;
      expect(isConstrainedExecutionEnabled()).toBe(false);
    }
  });

  test('is read at call time, not captured at module load', () => {
    expect(isConstrainedExecutionEnabled()).toBe(false);
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    // The integration suite flips this env var on a running deployment, so a
    // value cached at import would silently disable the control.
    expect(isConstrainedExecutionEnabled()).toBe(true);
  });
});

describe('validateKubectlAction()', () => {
  test('accepts a fully specified patch', () => {
    const result = validateKubectlAction({
      verb: 'patch',
      kind: 'deployment',
      name: 'api',
      namespace: NAMESPACE,
      patch: '{"spec":{"replicas":3}}',
      patchType: 'merge',
    });
    expect(result).toMatchObject({
      valid: true,
      action: { verb: 'patch', kind: 'deployment', name: 'api' },
    });
  });

  test('rejects a patch with no name — it has no target, so it is not executable', () => {
    const result = validateKubectlAction({
      verb: 'patch',
      kind: 'deployment',
      patch: '{"spec":{"replicas":3}}',
    });
    expect(result).toMatchObject({ valid: false });
    expect((result as { reason: string }).reason).toMatch(/name/);
  });

  test('rejects a patch with no payload and a patch with no kind', () => {
    expect(
      validateKubectlAction({ verb: 'patch', kind: 'deployment', name: 'api' })
    ).toMatchObject({ valid: false });
    expect(
      validateKubectlAction({
        verb: 'patch',
        name: 'api',
        patch: '{"spec":{"replicas":3}}',
      })
    ).toMatchObject({ valid: false });
  });

  test('treats a whitespace-only field as absent', () => {
    expect(
      validateKubectlAction({
        verb: 'patch',
        kind: 'deployment',
        name: '   ',
        patch: '{"spec":{"replicas":3}}',
      })
    ).toMatchObject({ valid: false });
  });

  test('rejects verbs with no structured plugin tool behind them', () => {
    for (const verb of ['scale', 'rollout', 'exec', 'create', '']) {
      expect(validateKubectlAction({ verb })).toMatchObject({ valid: false });
    }
  });

  test('rejects a patchType outside the accepted set', () => {
    expect(
      validateKubectlAction({
        verb: 'patch',
        kind: 'deployment',
        name: 'api',
        patch: '{}',
        patchType: 'shell',
      })
    ).toMatchObject({ valid: false });
  });

  test('rejects a missing, non-object or array kubectlAction', () => {
    expect(validateKubectlAction(undefined)).toMatchObject({ valid: false });
    expect(validateKubectlAction(null)).toMatchObject({ valid: false });
    expect(validateKubectlAction('kubectl patch deploy api')).toMatchObject({
      valid: false,
    });
    expect(validateKubectlAction([{ verb: 'patch' }])).toMatchObject({
      valid: false,
    });
  });

  test('requires a manifest for apply', () => {
    expect(validateKubectlAction({ verb: 'apply' })).toMatchObject({
      valid: false,
    });
    expect(
      validateKubectlAction({ verb: 'apply', manifest: 'kind: ConfigMap\n' })
    ).toMatchObject({ valid: true });
  });

  test('accepts delete addressed either by kind+name or by manifest, and nothing less', () => {
    expect(
      validateKubectlAction({ verb: 'delete', kind: 'pod', name: 'api-x' })
    ).toMatchObject({ valid: true });
    expect(
      validateKubectlAction({ verb: 'delete', manifest: 'kind: Pod\n' })
    ).toMatchObject({ valid: true });
    expect(
      validateKubectlAction({ verb: 'delete', kind: 'pod' })
    ).toMatchObject({ valid: false });
  });
});

describe('buildStructuredInvocation()', () => {
  test('maps a patch onto the kubectl_patch schema', () => {
    const action: KubectlAction = {
      verb: 'patch',
      kind: 'deployment',
      name: 'api',
      namespace: NAMESPACE,
      patch: '{"spec":{"replicas":3}}',
      patchType: 'merge',
    };
    expect(buildStructuredInvocation(action)).toEqual({
      toolName: 'kubectl_patch',
      args: {
        kind: 'deployment',
        name: 'api',
        namespace: NAMESPACE,
        patch: '{"spec":{"replicas":3}}',
        patchType: 'merge',
      },
    });
  });

  test('omits namespace and patchType when absent rather than sending undefined', () => {
    expect(
      buildStructuredInvocation({
        verb: 'patch',
        kind: 'clusterrole',
        name: 'viewer',
        patch: '{}',
      })
    ).toEqual({
      toolName: 'kubectl_patch',
      args: { kind: 'clusterrole', name: 'viewer', patch: '{}' },
    });
  });

  test('maps an apply onto the kubectl_apply schema', () => {
    expect(
      buildStructuredInvocation({
        verb: 'apply',
        manifest: 'kind: ConfigMap\n',
        namespace: NAMESPACE,
      })
    ).toEqual({
      toolName: 'kubectl_apply',
      args: { manifest: 'kind: ConfigMap\n', namespace: NAMESPACE },
    });
  });

  test('sends delete exactly one addressing form — kubectl_delete ignores kind/name when a manifest is present', () => {
    expect(
      buildStructuredInvocation({
        verb: 'delete',
        kind: 'pod',
        name: 'api-x',
        manifest: 'kind: Pod\n',
        namespace: NAMESPACE,
      })
    ).toEqual({
      toolName: 'kubectl_delete',
      args: { manifest: 'kind: Pod\n', namespace: NAMESPACE },
    });

    expect(
      buildStructuredInvocation({ verb: 'delete', kind: 'pod', name: 'api-x' })
    ).toEqual({
      toolName: 'kubectl_delete',
      args: { kind: 'pod', name: 'api-x' },
    });
  });
});

describe('checkConstrainedExecution()', () => {
  test('allows everything when the flag is off', () => {
    expect(checkConstrainedExecution([freeFormAction()])).toEqual({
      allowed: true,
    });
  });

  test('refuses a free-form action with a reason naming the constraint and the shell', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const check = checkConstrainedExecution([freeFormAction()]);

    expect(check.allowed).toBe(false);
    const reason = (check as { reason: string }).reason;
    // Both halves matter: /constrain/i is what tells this refusal apart from
    // the RBAC denial, which writes the same fallbackReason field.
    expect(reason).toMatch(/constrain/i);
    expect(reason).toMatch(/shell|free-form|command/i);
    expect(reason).toContain('Roll the Helm release back to revision 1');
  });

  test('allows a valid structured action', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    expect(checkConstrainedExecution([structuredPatchAction()])).toEqual({
      allowed: true,
    });
  });

  test('allows a gitSource action — it opens a PR and never reaches a shell', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    expect(checkConstrainedExecution([gitOpsAction()])).toEqual({
      allowed: true,
    });
  });

  test('refuses an action whose structured form is incomplete', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const incomplete: RemediationAction = {
      description: 'patch with no target',
      risk: 'low',
      rationale: 'why',
      kubectlAction: { verb: 'patch' } as KubectlAction,
    };
    const check = checkConstrainedExecution([incomplete]);
    expect(check.allowed).toBe(false);
  });

  test('refuses the whole set when only one action is unexpressible', () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const check = checkConstrainedExecution([
      structuredPatchAction(),
      gitOpsAction(),
      freeFormAction(),
    ]);

    expect(check.allowed).toBe(false);
    // Position is 1-based and matches the action_N ids in the results.
    expect((check as { unexpressible: unknown[] }).unexpressible).toMatchObject(
      [{ position: 3 }]
    );
  });
});

describe('executeRemediationCommands() with the flag off', () => {
  test('still hands the free-form command to shell_exec, unchanged', async () => {
    const result = await execute([freeFormAction()]);

    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'shell_exec',
      {
        command: 'helm rollback web 1 --namespace prod',
      }
    );
    expect(result).toMatchObject({ status: 'success', executed: true });
  });
});

describe('executeRemediationCommands() with the flag on', () => {
  beforeEach(() => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
  });

  test('never invokes shell_exec for a free-form action, and refuses instead', async () => {
    const result = await execute([freeFormAction()]);

    // The claim, stated directly: no plugin tool ran at all, so nothing could
    // have reached a shell.
    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      executed: false,
      results: [],
    });
    expect(result.fallbackReason).toMatch(/constrain/i);
    expect(result.fallbackReason).toMatch(/shell|free-form|command/i);
  });

  test('never invokes shell_exec when only one action of several is free-form', async () => {
    const result = await execute([
      structuredPatchAction(),
      freeFormAction(),
      gitOpsAction(),
    ]);

    // All-or-nothing: the expressible patch must not run either, or the refusal
    // becomes a partial execution nobody planned.
    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).not.toHaveBeenCalled();
    const { createInternalToolExecutor } = await internalTools();
    expect(createInternalToolExecutor).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      executed: false,
    });
  });

  test('routes a structured patch to kubectl_patch with the discrete fields', async () => {
    const result = await execute([structuredPatchAction()]);

    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).toHaveBeenCalledTimes(1);
    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'kubectl_patch',
      {
        kind: 'deployment',
        name: 'api',
        namespace: NAMESPACE,
        patchType: 'json',
        patch: '[{"op":"replace","path":"/spec/replicas","value":3}]',
      }
    );
    expect(await invokedTools()).not.toContain('shell_exec');
    expect(result).toMatchObject({ status: 'success', executed: true });
  });

  test('routes a structured apply to kubectl_apply', async () => {
    await execute([
      {
        description: 'create the missing ConfigMap',
        risk: 'low',
        rationale: 'the deployment mounts it',
        kubectlAction: {
          verb: 'apply',
          manifest: 'kind: ConfigMap\nmetadata:\n  name: app-config\n',
          namespace: NAMESPACE,
        },
      },
    ]);

    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'kubectl_apply',
      {
        manifest: 'kind: ConfigMap\nmetadata:\n  name: app-config\n',
        namespace: NAMESPACE,
      }
    );
    expect(await invokedTools()).not.toContain('shell_exec');
  });

  test('routes a structured delete to kubectl_delete', async () => {
    await execute([
      {
        description: 'delete the stuck pod',
        risk: 'medium',
        rationale: 'the ReplicaSet will recreate it',
        kubectlAction: {
          verb: 'delete',
          kind: 'pod',
          name: 'api-7d9f-x2k',
          namespace: NAMESPACE,
        },
      },
    ]);

    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'kubectl_delete',
      { kind: 'pod', name: 'api-7d9f-x2k', namespace: NAMESPACE }
    );
    expect(await invokedTools()).not.toContain('shell_exec');
  });

  test('executes every action of a multi-action structured set', async () => {
    await execute([
      structuredPatchAction(),
      {
        description: 'delete the stale pod',
        risk: 'low',
        rationale: 'so the new template takes effect',
        kubectlAction: { verb: 'delete', kind: 'pod', name: 'api-old' },
      },
    ]);

    expect(await invokedTools()).toEqual(['kubectl_patch', 'kubectl_delete']);
  });

  test('leaves the GitOps path alone — a gitSource action still opens a PR', async () => {
    const result = await execute([gitOpsAction()]);

    // A naive "refuse anything without kubectlAction" check would break Argo CD
    // and Flux remediation, which never touches a shell in the first place.
    const { invokePluginTool } = await pluginRegistry();
    expect(invokePluginTool).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'success',
      executed: true,
      pullRequest: { number: 7 },
    });
  });

  test('reports a failing structured action as a failed action, not as a shell fallback', async () => {
    const { invokePluginTool } = await pluginRegistry();
    vi.mocked(invokePluginTool).mockResolvedValue({
      sessionId: 'plugin-session',
      success: true,
      result: { success: false, error: 'deployments.apps "api" not found' },
      state: {},
    });

    const result = await execute([structuredPatchAction()]);

    expect(await invokedTools()).toEqual(['kubectl_patch']);
    expect(result).toMatchObject({
      status: 'failed',
      results: [{ success: false }],
    });
  });
});
