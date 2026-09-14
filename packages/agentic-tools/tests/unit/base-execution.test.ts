/**
 * Execution-path tests for `executeKubectl` / `executeHelm`.
 *
 * These are the regression tests for the command-injection defect found in the
 * PRD #810 security audit (finding B1): `executeKubectl` used to assemble a
 * command *string* with `escapeShellArg` — which double-quoted its input and
 * escaped only `"` and `\` — and run it through `sh -c`. Inside double quotes
 * `sh` still expands `$(...)` and backticks, so a model-authored `kind`, `name`
 * or `patch` value reached a live shell.
 *
 * Asserting on the command string the old code built would not have caught
 * that: the string *looked* quoted. So these tests execute for real, through a
 * stub binary placed on PATH that prints the argv it was handed, and check two
 * things the old implementation failed:
 *
 *   1. the injected payload arrives as one literal argv element, byte for byte
 *   2. the injected command did not run — no side-effect file appears
 *
 * Under `sh -c` both assertions fail: `$(touch …)` runs before exec and its
 * (empty) output is substituted into the argument.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeKubectl, executeHelm } from '../../src/tools/base';

/**
 * A stub that prints one argv element per line, then anything on stdin under a
 * marker. Standing in for the real binary lets the test observe exactly what
 * `execve` received.
 */
const STUB = `#!/bin/sh
for arg in "$@"; do
  printf 'ARG:%s\\n' "$arg"
done
if [ ! -t 0 ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    printf 'STDIN:%s\\n' "$line"
  done
fi
exit 0
`;

let binDir: string;
let originalPath: string | undefined;

beforeAll(() => {
  binDir = mkdtempSync(join(tmpdir(), 'dot-ai-argv-'));
  for (const name of ['kubectl', 'helm']) {
    const file = join(binDir, name);
    writeFileSync(file, STUB);
    chmodSync(file, 0o755);
  }
  originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath ?? ''}`;
});

afterAll(() => {
  process.env.PATH = originalPath;
  rmSync(binDir, { recursive: true, force: true });
});

afterEach(() => {
  // Every payload below writes its marker into binDir (an absolute path), so a
  // shell anywhere in the chain leaves evidence regardless of cwd.
  for (const entry of readdirSync(binDir)) {
    if (entry.startsWith('PWNED')) {
      rmSync(join(binDir, entry), { force: true });
    }
  }
});

function argvOf(output: string): string[] {
  return output
    .split('\n')
    .filter(line => line.startsWith('ARG:'))
    .map(line => line.slice('ARG:'.length));
}

function stdinOf(output: string): string[] {
  return output
    .split('\n')
    .filter(line => line.startsWith('STDIN:'))
    .map(line => line.slice('STDIN:'.length));
}

describe('executeKubectl runs without a shell', () => {
  it('passes command substitution through as a literal argv element', async () => {
    const marker = join(binDir, 'PWNED-substitution');
    const hostileName = `web$(touch ${marker})`;

    const output = await executeKubectl([
      'patch',
      '--',
      'Deployment',
      hostileName,
    ]);

    expect(argvOf(output)).toEqual(['patch', '--', 'Deployment', hostileName]);
    expect(existsSync(marker)).toBe(false);
  });

  it('passes backtick substitution through as a literal argv element', async () => {
    const marker = join(binDir, 'PWNED-backtick');
    const hostileName = `web\`touch ${marker}\``;

    const output = await executeKubectl(['delete', '--', 'Pod', hostileName]);

    expect(argvOf(output)).toEqual(['delete', '--', 'Pod', hostileName]);
    expect(existsSync(marker)).toBe(false);
  });

  it('passes quotes, semicolons, pipes and globs through literally', async () => {
    const marker = join(binDir, 'PWNED-chain');
    const payloads = [
      `x"; touch ${marker}; echo "`,
      `x' ; touch ${marker} ; echo '`,
      `x | touch ${marker}`,
      `x && touch ${marker}`,
      `x\\$(touch ${marker})`,
      '*',
      '~',
      '$HOME',
    ];

    for (const payload of payloads) {
      const output = await executeKubectl(['patch', '--patch', payload]);
      // One argv element, byte for byte: no word splitting, no glob expansion,
      // no tilde or variable expansion, no substitution.
      expect(argvOf(output)).toEqual(['patch', '--patch', payload]);
    }

    expect(existsSync(marker)).toBe(false);
  });

  it('keeps a newline inside one argument instead of splitting on it', async () => {
    const marker = join(binDir, 'PWNED-newline');
    const payload = `x\ntouch ${marker}`;

    const output = await executeKubectl(['patch', '--patch', payload]);

    // The stub prints each argument on its own line, so a payload containing a
    // newline shows up as one ARG: line followed by its own continuation —
    // what matters is that the shell never saw it as a second command.
    expect(output).toContain(`ARG:${payload}`);
    expect(existsSync(marker)).toBe(false);
  });

  it('keeps kubeconfig/context/namespace config as discrete argv elements', async () => {
    const output = await executeKubectl(['get', 'pods'], {
      kubeconfig: '/tmp/a b/kube config.yaml',
      context: 'ctx$(id)',
      namespace: 'ns with space',
    });

    expect(argvOf(output)).toEqual([
      '--kubeconfig',
      '/tmp/a b/kube config.yaml',
      '--context',
      'ctx$(id)',
      '--namespace',
      'ns with space',
      'get',
      'pods',
    ]);
  });

  it('still pipes stdin, with a hostile manifest left untouched', async () => {
    const marker = join(binDir, 'PWNED-stdin');
    const manifest = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      `  name: "$(touch ${marker})"`,
      'data:',
      '  a: "`id`"',
    ].join('\n');

    const output = await executeKubectl(['apply', '-f', '-'], {
      stdin: manifest,
    });

    expect(argvOf(output)).toEqual(['apply', '-f', '-']);
    expect(stdinOf(output)).toEqual(manifest.split('\n'));
    expect(existsSync(marker)).toBe(false);
  });

  it('reports a missing binary rather than a shell error', async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = join(binDir, 'empty');
    try {
      await expect(executeKubectl(['get', 'pods'])).rejects.toThrow(
        /kubectl binary not found/
      );
    } finally {
      process.env.PATH = savedPath;
    }
  });
});

describe('executeHelm runs without a shell', () => {
  it('passes command substitution through as a literal argv element', async () => {
    const marker = join(binDir, 'PWNED-helm');
    const hostileRelease = `rel$(touch ${marker})`;

    const output = await executeHelm(['status', hostileRelease], {
      namespace: 'ns$(id)',
    });

    expect(argvOf(output)).toEqual([
      '--namespace',
      'ns$(id)',
      'status',
      hostileRelease,
    ]);
    expect(existsSync(marker)).toBe(false);
  });
});
