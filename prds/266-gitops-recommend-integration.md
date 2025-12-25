# PRD: GitOps Integration in Recommend Workflow

**Issue**: [#266](https://github.com/vfarcic/dot-ai/issues/266)
**Status**: Draft
**Priority**: Medium
**Created**: 2025-12-10

---

## Problem Statement

PRD #264 and #265 establish the `gitops` tool for standalone use with existing packages. However, users who generate packages through the `recommend` tool must currently:

1. Run `recommend` to generate a Helm chart or Kustomize overlay
2. Separately invoke `gitops` tool to create GitOps resources
3. Manually ensure paths and configurations align

This creates a disconnected workflow when the user's intent is end-to-end: "deploy X via GitOps."

---

## Solution Overview

Add an optional `deployViaGitOps` stage to the `recommend` workflow that delegates to the `gitops` tool's generator infrastructure.

**Key principle**: No code duplication. The recommend integration uses the exact same generators from PRD #264/#265.

### Workflow Extension

```
[Existing recommend workflow]
  intent → chooseSolution → answerQuestions → generateManifests
                                                      ↓
                                           [outputFormat: helm/kustomize]
                                                      ↓
                                    [NEW: deployViaGitOps stage - optional]
                                                      ↓
                                           Select provider (Argo CD/Flux)
                                                      ↓
                                           Provider-specific questions
                                                      ↓
                                           Generate GitOps resources
                                                      ↓
                                           Output: package + GitOps manifests
```

---

## User Journey

```
User: "Deploy a web application with PostgreSQL"

→ recommend tool generates solution, asks configuration questions
→ "What output format?"
   - Raw manifests
   - Helm Chart (user selects)
   - Kustomize
→ [Existing] System generates Helm chart
→ [NEW] "Would you like to deploy via GitOps?"
   - No, just save the package
   - Yes (user selects)
→ [NEW] "Which GitOps tool?"
   - Argo CD
   - Flux
→ [NEW] GitOps configuration questions (from gitops tool)
→ System generates:
   - Helm chart at ./my-app/
   - GitOps manifest at ./my-app/argocd-application.yaml (or flux-gitops.yaml)
→ User gets complete package ready for Git commit
```

---

## Technical Design

### New Stage in Recommend Workflow

```typescript
// Add to recommend tool stages
type RecommendStage =
  | 'recommend'
  | 'chooseSolution'
  | 'answerQuestion:required'
  | 'answerQuestion:basic'
  | 'answerQuestion:advanced'
  | 'answerQuestion:open'
  | 'generateManifests'
  | 'deployViaGitOps';        // NEW
```

### GitOps Question (Post-Packaging)

After `generateManifests` with Helm or Kustomize output:

```typescript
const gitopsDeploymentQuestion = {
  id: 'deployViaGitOps',
  question: 'Would you like to deploy via GitOps?',
  type: 'select',
  options: [
    { value: 'none', label: 'No', description: 'Just save the packaged output' },
    { value: 'yes', label: 'Yes', description: 'Generate GitOps resources for deployment' }
  ],
  default: 'none',
  condition: 'outputFormat !== "raw"'  // Only show for Helm/Kustomize
};
```

### Delegation to GitOps Generators

```typescript
// src/tools/recommend/gitops-integration.ts

import { providers } from '../gitops/generators';
import { GitOpsConfig } from '../gitops/generators/types';

async function handleDeployViaGitOps(
  session: RecommendSession,
  params: RecommendParams
): Promise<RecommendResult> {

  // If user hasn't selected GitOps, ask
  if (!session.gitopsEnabled) {
    return askGitOpsQuestion(session);
  }

  // If user hasn't selected provider, ask
  if (!session.gitopsProvider) {
    return askProviderQuestion(session);
  }

  // Get the selected provider's generator
  const generator = providers.get(session.gitopsProvider);
  if (!generator) {
    throw new Error(`Unknown GitOps provider: ${session.gitopsProvider}`);
  }

  // If provider questions not answered, ask them
  const providerQuestions = generator.getQuestions();
  const unansweredQuestions = getUnansweredQuestions(providerQuestions, session.gitopsAnswers);
  if (unansweredQuestions.length > 0) {
    return askProviderQuestions(session, unansweredQuestions);
  }

  // All questions answered - generate GitOps resources
  const config: GitOpsConfig = {
    package: {
      path: session.outputPath,
      type: session.outputFormat,  // 'helm' or 'kustomize'
      name: session.solutionName,
      confidence: 'high'
    },
    gitRepoUrl: session.gitopsAnswers.gitRepoUrl,
    gitRepoPath: session.gitopsAnswers.gitRepoPath,
    targetRevision: session.gitopsAnswers.targetRevision || 'HEAD',
    destinationNamespace: session.gitopsAnswers.destinationNamespace,
    outputPath: session.gitopsAnswers.outputPath,
    providerConfig: session.gitopsAnswers
  };

  const output = generator.generate(config);

  // Save GitOps manifest alongside package
  const gitopsManifestPath = path.join(session.outputPath, output.filename);
  await writeFile(gitopsManifestPath, output.manifests);

  return {
    success: true,
    stage: 'complete',
    message: `Generated ${session.outputFormat} package and ${generator.providerName} GitOps resources`,
    files: [
      ...session.generatedFiles,
      { path: gitopsManifestPath, description: output.description }
    ]
  };
}
```

### Shared Questions

The integration reuses shared questions from the gitops tool:

```typescript
// Reuse from gitops tool
import { sharedQuestions } from '../gitops/questions';
import { getProviderQuestions } from '../gitops/generators';

// In recommend integration, we skip detection (package already known)
// and go straight to shared + provider questions
```

### Modified Output Structure

When GitOps is enabled, output includes GitOps manifest:

**Helm + Argo CD:**
```
<outputPath>/
├── Chart.yaml
├── values.yaml
├── templates/
│   └── ...
└── argocd-application.yaml    # Generated by Argo CD provider
```

**Kustomize + Flux:**
```
<outputPath>/
├── kustomization.yaml
├── base/
│   └── ...
└── flux-gitops.yaml           # Generated by Flux provider (GitRepository + Kustomization)
```

---

## Success Criteria

1. **Optional Stage**: Users can skip GitOps and just get the package (backward compatible)
2. **Provider Choice**: Users can select Argo CD or Flux
3. **Reuses Generators**: Uses exact same `GitOpsGenerator` implementations from #264/#265
4. **No Duplication**: Zero duplicated GitOps generation code
5. **Combined Output**: Package and GitOps manifest saved together
6. **Seamless Flow**: Single workflow from intent to GitOps-ready deployment

---

## Out of Scope

1. **Standalone GitOps**: Covered by PRD #264 and #265
2. **New Providers**: Adding providers is handled by #264/#265, integration inherits automatically
3. **Git Push**: Actually pushing to Git repository
4. **Detection**: Not needed - package is already generated by recommend

---

## Dependencies

| Dependency | Relationship |
|------------|--------------|
| **PRD #248** | Required - provides Helm/Kustomize packaging in recommend |
| **PRD #264** | Required - provides GitOpsGenerator interface and Argo CD generator |
| **PRD #265** | Optional - provides Flux generator (integration works without it) |

---

## Supersedes

This PRD, along with #264 and #265, supersedes:
- **#254** (Argo CD Integration for Third-Party Helm Charts)
- **#255** (Argo CD Integration for Packaged Recommendations)
- **#256** (Flux Integration for GitOps Deployments)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex workflow | Users confused by many stages | GitOps is opt-in; clear stage progression |
| Session management | State lost between stages | Use existing recommend session infrastructure |
| Generator API changes | Integration breaks | Both use same types; changes caught at compile time |

---

## Milestones

- [ ] **M1**: Add `deployViaGitOps` stage to recommend workflow
- [ ] **M2**: GitOps opt-in question after packaging
- [ ] **M3**: Provider selection question
- [ ] **M4**: Integration with shared questions and provider-specific questions
- [ ] **M5**: Delegation to GitOpsGenerator.generate()
- [ ] **M6**: Combined output (package + GitOps manifest)
- [ ] **M7**: Integration tests for recommend → GitOps flow
- [ ] **M8**: Documentation with end-to-end examples

