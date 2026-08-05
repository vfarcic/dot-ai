/**
 * Unit Tests: buildRemediationResponseShape() (PRD #710 M1, item 10)
 *
 * How an executed remediation is REPORTED is pure logic over the run's
 * outcome — no session, no cluster, no AI — so it is pinned here rather than
 * through the (expensive, fragile) integration path.
 *
 * What matters: a run is one of three shapes, and the default "here are the
 * kubectl commands we ran" story is a lie for two of them. Before PRD #710 a
 * gitSource action that succeeded WITHOUT opening a pull request (the manifests
 * already matched the base branch — decision 3; or no PR could be opened for the
 * remote — decision 7) fell through to that story and reported an empty list of
 * executed commands. These tests hold the three branches mutually exclusive and
 * exhaustive, and pin the flags that tell the agent whether kubectl output is
 * worth showing at all.
 */

import { describe, test, expect } from 'vitest';
import {
  buildRemediationResponseShape,
  type ExecutionResult,
  type GitOpsWithoutPr,
  type RemediateOutput,
  type RemediationAction,
  type RemediationResponseShapeInput,
} from '../../../src/tools/remediate';

const ROOT_CAUSE = 'Deployment Has A Bad Image Tag';

function kubectlAction(command: string): RemediationAction {
  return {
    description: `run ${command}`,
    command,
    risk: 'low',
    rationale: 'because',
  };
}

function gitSourceAction(): RemediationAction {
  return {
    description: 'patch the manifest in Git',
    risk: 'low',
    rationale: 'because',
    gitSource: {
      repoURL: 'https://github.com/acme/demo.git',
      repoPath: 'demo',
      branch: 'main',
      files: [{ path: 'manifests/app.yaml', content: 'x', description: 'd' }],
    },
  };
}

function result(action: string, success = true): ExecutionResult {
  return { action, success, timestamp: new Date(0) };
}

const PR_INFO: RemediateOutput['pullRequest'] = {
  url: 'https://github.com/acme/demo/pull/7',
  number: 7,
  branch: 'remediate/abc123',
  baseBranch: 'main',
  filesChanged: ['manifests/app.yaml', 'manifests/svc.yaml'],
};

const PUSHED_WITHOUT_PR: GitOpsWithoutPr = {
  kind: 'pushed_without_pr',
  branch: 'remediate/abc123',
  baseBranch: 'release-1',
};

const NO_CHANGES: GitOpsWithoutPr = {
  kind: 'no_changes',
  branch: 'remediate/abc123',
  baseBranch: 'main',
};

/** A successful single-gitSource-action run, with no kubectl command executed. */
function gitOpsRun(
  overrides: Partial<RemediationResponseShapeInput> = {}
): RemediationResponseShapeInput {
  return {
    overallSuccess: true,
    executedCommandCount: 0,
    gitOpsWithoutPr: [],
    actions: [gitSourceAction()],
    results: [result('action_1: patch the manifest in Git')],
    rootCause: ROOT_CAUSE,
    validationAttempted: false,
    ...overrides,
  };
}

/** A successful two-kubectl-command run. */
function kubectlRun(
  overrides: Partial<RemediationResponseShapeInput> = {}
): RemediationResponseShapeInput {
  return {
    overallSuccess: true,
    executedCommandCount: 2,
    gitOpsWithoutPr: [],
    actions: [
      kubectlAction('kubectl scale deploy/api --replicas=3'),
      kubectlAction('kubectl rollout restart deploy/api'),
    ],
    results: [
      result('action_1: run kubectl scale deploy/api --replicas=3'),
      result('action_2: run kubectl rollout restart deploy/api'),
    ],
    rootCause: ROOT_CAUSE,
    validationAttempted: false,
    ...overrides,
  };
}

describe('GitOps with a pull request', () => {
  test('tells the PR story and suppresses the kubectl output', () => {
    const shape = buildRemediationResponseShape(
      gitOpsRun({ pullRequestInfo: PR_INFO })
    );

    expect(shape.message).toBe(
      'Successfully created PR for 1 GitOps remediation action(s)'
    );
    expect(shape.showExecutedCommands).toBe(false);
    expect(shape.showActualKubectlCommands).toBe(false);
    // Pinned exactly, blank separators included: every line is a static literal
    // or a field of the input, so ordering and spacing cost nothing to hold. The
    // rootCause is lower-cased into the follow-up call, as it always was.
    expect(shape.nextSteps).toEqual([
      'Changes have been pushed to a Git branch for GitOps reconciliation:',
      `  PR: ${PR_INFO!.url}`,
      '  Branch: remediate/abc123 → main',
      '  Files changed: manifests/app.yaml, manifests/svc.yaml',
      '',
      'Next steps:',
      '  1. Review and merge the PR in your Git repository',
      '  2. Wait for Argo CD/Flux to sync the changes',
      '  3. Verify the issue is resolved after reconciliation',
      '',
      `You can verify the fix by running: remediate("Verify that ${ROOT_CAUSE.toLowerCase()} has been resolved")`,
    ]);
    // No kubectl ran, so no command list is offered — an invariant of this
    // branch, not just of the wording above.
    expect(shape.nextSteps.join('\n')).not.toContain('kubectl commands were');
  });

  test('a PR alongside a pushed-only branch tells only the PR story (known gap)', () => {
    // KNOWN GAP, pinned as accepted rather than fixed — both halves predate PRD
    // #710 and its extraction of this function deliberately preserved them:
    //
    //   1. hasOnlyGitOps only requires executedCommandCount === 0 and a PR, so it
    //      wins outright. The second action's branch — pushed, still needing a
    //      manual PR — is never mentioned in nextSteps, and the user learns about
    //      it only from `results`.
    //   2. `pullRequestInfo` is a single value assigned per gitSource action in
    //      executeRemediationCommands(), so two opened PRs leave only the LAST
    //      one here, while the message counts ALL actions ("2 ... action(s)").
    //
    // Fixing either means changing what the response says, which is a decision
    // for its own PRD. Until then this test documents the behavior so a future
    // change to it is deliberate rather than accidental.
    const PUSHED_OTHER: GitOpsWithoutPr = {
      kind: 'pushed_without_pr',
      branch: 'remediate/def456',
      baseBranch: 'release-1',
    };
    const shape = buildRemediationResponseShape(
      gitOpsRun({
        pullRequestInfo: PR_INFO,
        gitOpsWithoutPr: [PUSHED_OTHER],
        actions: [gitSourceAction(), gitSourceAction()],
        results: [
          result('action_1: patch the manifest in Git (PR created)'),
          result('action_2: patch the manifest in Git (branch pushed)'),
        ],
      })
    );

    expect(shape.message).toBe(
      'Successfully created PR for 2 GitOps remediation action(s)'
    );
    expect(shape.showExecutedCommands).toBe(false);
    expect(shape.showActualKubectlCommands).toBe(false);
    expect(shape.nextSteps).toEqual([
      'Changes have been pushed to a Git branch for GitOps reconciliation:',
      `  PR: ${PR_INFO!.url}`,
      '  Branch: remediate/abc123 → main',
      '  Files changed: manifests/app.yaml, manifests/svc.yaml',
      '',
      'Next steps:',
      '  1. Review and merge the PR in your Git repository',
      '  2. Wait for Argo CD/Flux to sync the changes',
      '  3. Verify the issue is resolved after reconciliation',
      '',
      `You can verify the fix by running: remediate("Verify that ${ROOT_CAUSE.toLowerCase()} has been resolved")`,
    ]);
    // Gap 1 stated as its own assertion: the pushed-only branch is absent, and no
    // manual pull request is asked for anywhere.
    expect(shape.nextSteps.join('\n')).not.toContain('remediate/def456');
    expect(shape.nextSteps.join('\n')).not.toMatch(/opened manually|manually/i);
  });

  test('a kubectl command alongside the PR falls back to the kubectl story', () => {
    // hasOnlyGitOps requires executedCommandCount === 0. A mixed run really did
    // execute commands, so those — not the PR — are what the agent must show.
    const shape = buildRemediationResponseShape(
      kubectlRun({ executedCommandCount: 1, pullRequestInfo: PR_INFO })
    );

    expect(shape.message).toBe('Successfully executed 2 remediation actions');
    expect(shape.showExecutedCommands).toBe(true);
    expect(shape.showActualKubectlCommands).toBe(true);
    expect(shape.nextSteps[0]).toBe(
      'The following kubectl commands were executed to remediate the issue:'
    );
  });
});

describe('GitOps without a pull request (PRD #710 decisions 3 and 7)', () => {
  test('a pushed branch asks for a manual PR without blaming the host', () => {
    const shape = buildRemediationResponseShape(
      gitOpsRun({ gitOpsWithoutPr: [PUSHED_WITHOUT_PR] })
    );

    expect(shape.message).toBe(
      'Pushed 1 GitOps remediation action(s) to a branch — a pull request must be opened manually'
    );
    expect(shape.showExecutedCommands).toBe(false);
    expect(shape.showActualKubectlCommands).toBe(false);
    expect(shape.nextSteps).toEqual([
      'Changes were pushed to a Git branch, but a pull request could not be opened automatically for this remote:',
      '  Branch: remediate/abc123 → release-1',
      '',
      'Next steps:',
      '  1. Open a pull request (or merge request) for the branch above in your Git host',
      '  2. Review and merge it',
      '  3. Wait for Argo CD/Flux to sync the changes',
      '',
      `You can verify the fix by running: remediate("Verify that ${ROOT_CAUSE.toLowerCase()} has been resolved")`,
    ]);
    // The parser is anchored, so a github.com remote in an unexpected shape lands
    // here too — asserting the repository "is not hosted on GitHub" would then be
    // plainly false to the user looking at their GitHub repo. Held as a rule so a
    // future rewording of the list above cannot reintroduce the claim.
    expect(shape.nextSteps.join('\n')).not.toMatch(/not hosted/i);
    expect(shape.nextSteps.join('\n')).not.toContain('kubectl commands were');
  });

  test('an empty diff reports "no changes" rather than a successful remediation', () => {
    const shape = buildRemediationResponseShape(
      gitOpsRun({ gitOpsWithoutPr: [NO_CHANGES] })
    );

    expect(shape.message).toBe(
      'No changes needed: the manifests in Git already match the desired state'
    );
    expect(shape.showExecutedCommands).toBe(false);
    expect(shape.showActualKubectlCommands).toBe(false);
    // The last line re-investigates rather than verifying a fix — nothing was
    // changed, so there is no fix to verify.
    expect(shape.nextSteps).toEqual([
      'No changes were needed: the manifests in Git already match the desired state, so nothing was pushed and no pull request was created.',
      '  Base branch checked: main',
      '',
      'Next steps:',
      '  1. Check whether Argo CD/Flux has actually synced that state to the cluster',
      '  2. If the issue persists, the root cause is elsewhere — investigate again',
      '',
      `You can re-investigate by running: remediate("Verify that ${ROOT_CAUSE.toLowerCase()} has been resolved")`,
    ]);
  });

  test('a pushed branch wins over a no-changes action in the same run', () => {
    // Deliberate and documented: a manual PR is the actionable half, so it is
    // the story. Nothing is lost — `results` still carries both actions.
    const shape = buildRemediationResponseShape(
      gitOpsRun({
        gitOpsWithoutPr: [NO_CHANGES, PUSHED_WITHOUT_PR],
        results: [
          result('action_1: no changes needed'),
          result('action_2: branch pushed, manual PR needed'),
        ],
      })
    );

    expect(shape.message).toBe(
      'Pushed 2 GitOps remediation action(s) to a branch — a pull request must be opened manually'
    );
    expect(shape.nextSteps).toContain('  Branch: remediate/abc123 → release-1');
    expect(shape.nextSteps.join('\n')).not.toContain('Base branch checked');
  });

  test('a failed action anywhere in the run drops it out of the GitOps story', () => {
    // hasOnlyGitOpsWithoutPr requires overallSuccess: with a failure in the run
    // the user needs the failure story, not "no changes needed".
    const shape = buildRemediationResponseShape(
      gitOpsRun({
        overallSuccess: false,
        gitOpsWithoutPr: [NO_CHANGES],
        actions: [gitSourceAction(), kubectlAction('kubectl delete pod/api-0')],
        results: [
          result('action_1: no changes needed'),
          result('action_2: run kubectl delete pod/api-0', false),
        ],
      })
    );

    expect(shape.message).toBe('Executed 2 actions with 1 failures');
    expect(shape.showExecutedCommands).toBe(true);
    expect(shape.showActualKubectlCommands).toBe(true);
    expect(shape.nextSteps[0]).toBe(
      'The following kubectl commands were attempted:'
    );
  });
});

describe('the kubectl story', () => {
  test('lists each command with its outcome and shows the commands', () => {
    const shape = buildRemediationResponseShape(
      kubectlRun({
        results: [
          result('action_1: run kubectl scale deploy/api --replicas=3'),
          result('action_2: run kubectl rollout restart deploy/api', false),
        ],
        overallSuccess: false,
      })
    );

    expect(shape.message).toBe('Executed 2 actions with 1 failures');
    expect(shape.nextSteps).toEqual([
      'The following kubectl commands were attempted:',
      '  1. kubectl scale deploy/api --replicas=3 ✓',
      '  2. kubectl rollout restart deploy/api ✗',
      'Some remediation commands failed - check the results above',
      'Review the error messages and address any underlying issues',
      'You may need to run additional commands or investigate further',
    ]);
    expect(shape.showExecutedCommands).toBe(true);
    expect(shape.showActualKubectlCommands).toBe(true);
  });

  test('numbers commands 1..n while reading outcomes by action position', () => {
    // A gitSource action carries no `command`, so it is filtered out of the
    // listing — but the ✓/✗ still comes from its own slot in `results`, which is
    // aligned with `actions`, not with the filtered list.
    const shape = buildRemediationResponseShape(
      kubectlRun({
        executedCommandCount: 1,
        actions: [gitSourceAction(), kubectlAction('kubectl get pods')],
        results: [
          result('action_1: patch the manifest in Git'),
          result('action_2: run kubectl get pods', false),
        ],
        overallSuccess: false,
      })
    );

    expect(shape.nextSteps).toContain('  1. kubectl get pods ✗');
  });

  test('a successful run points at a verification call', () => {
    const shape = buildRemediationResponseShape(kubectlRun());

    expect(shape.message).toBe('Successfully executed 2 remediation actions');
    expect(shape.nextSteps).toEqual([
      'The following kubectl commands were executed to remediate the issue:',
      '  1. kubectl scale deploy/api --replicas=3 ✓',
      '  2. kubectl rollout restart deploy/api ✓',
      `You can verify the fix by running: remediate("Verify that ${ROOT_CAUSE.toLowerCase()} has been resolved")`,
      'Monitor your cluster to ensure the issue is fully resolved',
    ]);
  });

  test('an attempted validation replaces the verification call with its results', () => {
    const shape = buildRemediationResponseShape(
      kubectlRun({ validationAttempted: true })
    );

    expect(shape.message).toBe('Successfully executed 2 remediation actions');
    expect(shape.nextSteps.slice(-2)).toEqual([
      'Automatic validation has been completed - see validation results above',
      'Monitor your cluster to ensure the issue remains resolved',
    ]);
    expect(shape.nextSteps.join('\n')).not.toContain('You can verify the fix');
  });

  test('a run with no gitSource action and no commands still gets the kubectl story', () => {
    // The exhaustive fallthrough: nothing executed, no PR, no gitOpsWithoutPr —
    // an empty command list beats an unhandled branch.
    const shape = buildRemediationResponseShape(
      kubectlRun({ executedCommandCount: 0, actions: [], results: [] })
    );

    expect(shape.message).toBe('Successfully executed 0 remediation actions');
    expect(shape.showExecutedCommands).toBe(true);
    expect(shape.nextSteps[0]).toBe(
      'The following kubectl commands were executed to remediate the issue:'
    );
  });
});
