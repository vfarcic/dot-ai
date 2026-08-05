/**
 * Unit Test: gitops.allowedRepoHosts renders into the container env (PRD #710).
 *
 * The chart value is the user-facing contract and DOT_AI_GITOPS_ALLOWED_REPO_HOSTS
 * is the internal detail (CLAUDE.md rule 7), so what has to hold is: the value is
 * always rendered, its default is github.com, and an EMPTY list reaches the
 * server as an explicit empty string — the server reads absent as "use the secure
 * default" and empty as "deny everything", so the two must not collapse into one.
 */

import { describe, test, expect } from 'vitest';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';

const ENV_NAME = 'DOT_AI_GITOPS_ALLOWED_REPO_HOSTS';

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
  const setArgs = setValues.map(v => `--set '${v}'`).join(' ');
  const output = execSync(
    `helm template test-release ./charts ${setArgs} 2>&1`,
    {
      encoding: 'utf-8',
    }
  );
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

function allowedHostsEntries(setValues: string[] = []) {
  return mcpServerEnv(setValues).filter(e => e.name === ENV_NAME);
}

describe('gitops.allowedRepoHosts', () => {
  test('defaults to github.com', () => {
    expect(allowedHostsEntries()).toEqual([
      { name: ENV_NAME, value: 'github.com' },
    ]);
  });

  test('renders a multi-host list comma-separated', () => {
    expect(
      allowedHostsEntries(['gitops.allowedRepoHosts={github.com,gitlab.corp}'])
    ).toEqual([{ name: ENV_NAME, value: 'github.com,gitlab.corp' }]);
  });

  test('renders an EMPTY list as an empty value, not as an absent var', () => {
    // Absent means "use the secure default" to the server, so an operator's
    // explicit `[]` (deny everything) must still produce the variable.
    expect(allowedHostsEntries(['gitops.allowedRepoHosts={}'])).toEqual([
      { name: ENV_NAME, value: '' },
    ]);
  });

  test('is rendered exactly once', () => {
    expect(allowedHostsEntries()).toHaveLength(1);
  });
});
