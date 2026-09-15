/**
 * Unit Test: remediation.constrainedExecution renders into the container env (PRD #810).
 *
 * The chart value is the user-facing contract and DOT_AI_REMEDIATION_CONSTRAINED_EXEC
 * is the internal detail (CLAUDE.md rule 7), so what has to hold is: the env var is
 * absent unless the value is on, and present as "true" when it is.
 *
 * The third case is the nil-safety one. `remediation` is a map with a default, and
 * `--set remediation=null` removes the whole map — so a guard written as
 * `.Values.remediation.constrainedExecution.enabled` nil-pointers and the install
 * fails outright. The guard is written in the nil-safe `((.Values.x).y).z` form so
 * that dropping the map disables the feature instead of breaking the render.
 */

import { describe, test, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as yaml from 'js-yaml';

const ENV_NAME = 'DOT_AI_REMEDIATION_CONSTRAINED_EXEC';

interface DeploymentResource {
  kind: 'Deployment';
  metadata: { name: string };
  spec: {
    template: {
      spec: {
        containers: Array<{
          name: string;
          env?: Array<{ name: string; value?: string }>;
        }>;
      };
    };
  };
}

function mcpServerEnv(setValues: string[] = []): Array<{
  name: string;
  value?: string;
}> {
  // No shell: each --set flag and its value is its own argv element, the same
  // argv discipline runWithoutShell uses in packages/agentic-tools/src/tools/base.ts.
  // Interpolating the values into a shell string would re-introduce the quoting
  // hole this PR removes from the kubectl/helm invocations.
  const args = [
    'template',
    'test-release',
    './charts',
    ...setValues.flatMap(v => ['--set', v]),
  ];
  const output = execFileSync('helm', args, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const docs = yaml.loadAll(output).filter(Boolean) as Array<
    Record<string, unknown>
  >;
  const deployments = docs.filter(
    doc => doc.kind === 'Deployment'
  ) as unknown as DeploymentResource[];
  const main = deployments.find(
    d =>
      !d.metadata.name.includes('plugin') &&
      !d.metadata.name.includes('dex') &&
      !d.metadata.name.includes('local-embeddings')
  );
  expect(main).toBeDefined();
  const container = main!.spec.template.spec.containers.find(
    c => c.name === 'mcp-server'
  );
  expect(container).toBeDefined();
  return container!.env ?? [];
}

function constrainedExecEntries(setValues: string[] = []) {
  return mcpServerEnv(setValues).filter(e => e.name === ENV_NAME);
}

describe('remediation.constrainedExecution', () => {
  test('is off by default — the env var is not rendered at all', () => {
    expect(constrainedExecEntries()).toEqual([]);
  });

  test('renders the env var as "true" when enabled', () => {
    expect(
      constrainedExecEntries(['remediation.constrainedExecution.enabled=true'])
    ).toEqual([{ name: ENV_NAME, value: 'true' }]);
  });

  test('renders when the whole remediation map is removed', () => {
    // `--set remediation=null` drops the default map. A non-nil-safe guard makes
    // helm fail here with "nil pointer evaluating interface {}.constrainedExecution".
    expect(constrainedExecEntries(['remediation=null'])).toEqual([]);
  });
});
