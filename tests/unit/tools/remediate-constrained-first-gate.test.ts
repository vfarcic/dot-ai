/**
 * Unit Tests: the FIRST constrained-execution gate (PRD #810)
 *
 * `checkConstrainedExecution` is called twice on purpose, and the review
 * confirmed both are load-bearing: `executeChoice: 1` reaches
 * `executeRemediationCommands` without passing through `handleRemediateTool`'s
 * automatic-mode branch, and `conductInvestigation` has already persisted
 * `finalAnalysis` by then — so the second gate is live even after the first
 * refuses.
 *
 * Only the second was unit-covered. The first — automatic mode, high
 * confidence, low risk, the path that runs without a human in the loop — was
 * observable only end-to-end. This file drives the whole of
 * `handleRemediateTool` with the AI, plugin, session and RBAC layers stubbed,
 * so a regression that dropped the gate (or wired it after execution rather
 * than before) fails here rather than on a cluster.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONSTRAINED_EXECUTION_ENV_VAR } from '../../../src/core/remediation-constraints';

const toolLoop = vi.fn();
const createSession = vi.fn();
const updateSession = vi.fn();
const getSession = vi.fn();

vi.mock('../../../src/core/ai-provider-factory', () => ({
  createAIProvider: vi.fn(() => ({ toolLoop })),
}));

vi.mock('../../../src/core/generic-session-manager', () => ({
  // `handleRemediateTool` does `new GenericSessionManager('rem')`, so the mock
  // has to be constructible.
  GenericSessionManager: class {
    createSession = createSession;
    updateSession = updateSession;
    getSession = getSession;
  },
}));

vi.mock('../../../src/core/plugin-registry', () => ({
  invokePluginTool: vi.fn(),
  isPluginInitialized: vi.fn(() => true),
  getPluginManager: vi.fn(() => ({
    getDiscoveredTools: () => [
      {
        name: 'kubectl_get',
        description: 'get resources',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    ],
    createToolExecutor: vi.fn(() => vi.fn()),
  })),
}));

vi.mock('../../../src/core/mcp-client-registry', () => ({
  isMcpClientInitialized: vi.fn(() => false),
  getMcpClientManager: vi.fn(() => null),
}));

vi.mock('../../../src/core/internal-tools', () => ({
  getInternalTools: vi.fn(() => []),
  createInternalToolExecutor: vi.fn(() => vi.fn()),
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

import { handleRemediateTool } from '../../../src/tools/remediate';

const SESSION_ID = 'rem-first-gate';

/** A free-form action: nothing but a shell command can express it. */
const FREE_FORM_ACTION = {
  description: 'Roll the Helm release back to revision 1',
  command: 'helm rollback web 1 --namespace prod',
  risk: 'low',
  rationale: 'The damage is in Helm release history, not in a resource',
};

/** The same fix, expressed structurally. */
const STRUCTURED_ACTION = {
  description: 'Scale the API deployment back up',
  risk: 'low',
  rationale: 'It was scaled to zero',
  kubectlAction: {
    verb: 'patch',
    kind: 'deployment',
    name: 'api',
    namespace: 'prod',
    patchType: 'merge',
    patch: '{"spec":{"replicas":3}}',
  },
};

function aiAnalysis(actions: unknown[]): string {
  return JSON.stringify({
    issueStatus: 'active',
    rootCause: 'The API deployment is scaled to zero',
    confidence: 0.95,
    factors: ['replicas: 0'],
    remediation: {
      summary: 'Scale it back up',
      actions,
      // `low` keeps makeExecutionDecision on the automatic path with the
      // default maxRiskLevel, so the gate is what stops execution, not risk.
      risk: 'low',
    },
  });
}

async function remediateAutomatically(
  actions: unknown[]
): Promise<Record<string, unknown>> {
  toolLoop.mockResolvedValue({
    status: 'success',
    finalMessage: aiAnalysis(actions),
    iterations: 2,
    toolCallsExecuted: [{ tool: 'kubectl_get' }],
  });

  const response = await handleRemediateTool({
    issue: 'the api deployment is down',
    mode: 'automatic',
  });
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env[CONSTRAINED_EXECUTION_ENV_VAR];

  const session = {
    sessionId: SESSION_ID,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    data: {
      toolName: 'remediate',
      issue: 'the api deployment is down',
      mode: 'automatic',
      status: 'investigating',
    },
  };
  createSession.mockReturnValue(session);
  getSession.mockReturnValue(session);
});

afterEach(() => {
  delete process.env[CONSTRAINED_EXECUTION_ENV_VAR];
});

describe('handleRemediateTool() first gate, automatic mode', () => {
  test('refuses before executing when an action is only expressible as a shell command', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const { invokePluginTool } =
      await import('../../../src/core/plugin-registry');

    const result = await remediateAutomatically([FREE_FORM_ACTION]);

    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      executed: false,
    });
    expect(result.fallbackReason).toMatch(/constrain/i);
    // Refused BEFORE execution: no plugin tool ran at all, shell or otherwise.
    expect(invokePluginTool).not.toHaveBeenCalled();
  });

  test('refuses the whole set when only one of several actions is free-form', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const { invokePluginTool } =
      await import('../../../src/core/plugin-registry');

    const result = await remediateAutomatically([
      STRUCTURED_ACTION,
      FREE_FORM_ACTION,
    ]);

    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      executed: false,
    });
    expect(invokePluginTool).not.toHaveBeenCalled();
  });

  test('refuses a structured action whose name kubectl would read as a flag', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const { invokePluginTool } =
      await import('../../../src/core/plugin-registry');

    const result = await remediateAutomatically([
      {
        description: 'Delete the stuck pod',
        risk: 'low',
        rationale: 'it is stuck',
        kubectlAction: {
          verb: 'delete',
          kind: 'Pod',
          name: '--all',
          namespace: 'prod',
        },
      },
    ]);

    expect(result).toMatchObject({
      status: 'awaiting_user_approval',
      executed: false,
    });
    expect(result.fallbackReason).toMatch(/must not start with '-'/);
    expect(invokePluginTool).not.toHaveBeenCalled();
  });

  test('lets a fully structured set through to execution', async () => {
    process.env[CONSTRAINED_EXECUTION_ENV_VAR] = 'true';
    const { invokePluginTool } =
      await import('../../../src/core/plugin-registry');
    vi.mocked(invokePluginTool).mockResolvedValue({
      sessionId: 'plugin-session',
      success: true,
      result: { success: true, data: 'deployment.apps/api patched' },
      state: {},
    });

    await remediateAutomatically([STRUCTURED_ACTION]);

    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'kubectl_patch',
      {
        kind: 'deployment',
        name: 'api',
        namespace: 'prod',
        patch: '{"spec":{"replicas":3}}',
        patchType: 'merge',
      }
    );
  });

  test('with the flag off, the same free-form action still reaches shell_exec', async () => {
    const { invokePluginTool } =
      await import('../../../src/core/plugin-registry');
    vi.mocked(invokePluginTool).mockResolvedValue({
      sessionId: 'plugin-session',
      success: true,
      result: { success: true, data: 'rollback complete' },
      state: {},
    });

    await remediateAutomatically([FREE_FORM_ACTION]);

    expect(invokePluginTool).toHaveBeenCalledWith(
      'agentic-tools',
      'shell_exec',
      {
        command: 'helm rollback web 1 --namespace prod',
      }
    );
  });
});
