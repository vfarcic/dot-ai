# PRD: Intelligent CI/CD Workflow Generation

**Created**: 2025-12-10
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-12-16
**Supersedes**: PRD #226 (GitHub Actions CI/CD Pipeline Generation)

## Executive Summary

Create an MCP prompt that intelligently analyzes an entire repository and generates appropriate CI/CD workflows through an **interactive conversation**. Unlike template-based approaches or single-shot generators, this feature:
1. Thoroughly examines the codebase, existing automation, documentation, and project structure
2. **Presents findings and workflow options to the user for decision-making** (key differentiator from Dockerfile generation)
3. Generates workflows based on confirmed user choices

This interactive model is essential because CI/CD workflows involve **policy decisions** (PR vs direct push, release triggers, deployment strategy) that cannot be deduced from code alone—they reflect team preferences and organizational policies. Initial implementation supports GitHub Actions, with architecture designed for future CI platform expansion driven by user demand.

## Problem Statement

### Current Pain Points

1. **Template-based generators are too dumb**: Existing tools generate generic templates that don't understand the specific project's build process, testing strategy, or release workflow.

2. **Reinventing existing automation**: Generated workflows often create new commands (`go test ./...`) instead of using existing automation (`make test`) that the project maintainers chose for good reasons.

3. **One-size-fits-all assumptions**: Current approaches assume specific registries (GHCR), branching strategies (PRs), and workflow structures without asking.

4. **Missing context**: Generators don't analyze the full repository - they miss Makefiles, shell scripts, package.json scripts, documentation hints, and existing CI configurations.

5. **No workflow strategy consideration**: No distinction between PR workflows (test, lint, scan) and main branch workflows (build, push, release), leading to security issues or inefficient pipelines.

### Why PRD #226 Falls Short

PRD #226 (GitHub Actions CI/CD Pipeline Generation) is too prescriptive:
- Hardcoded to GitHub Actions only
- Assumes GHCR as container registry
- Doesn't ask about branching strategy
- Shallow code analysis (just "detect test commands")
- Single workflow approach regardless of PR vs direct-push workflows
- Treats tests as optional/secondary

This PRD supersedes #226 with a fundamentally different approach: **discover first, present options second, confirm choices third, generate fourth**.

## Solution Overview

Create `shared-prompts/generate-cicd.md` that instructs Claude to:

1. **Analyze the entire repository** - Source code, scripts, Makefiles, package managers, docs, existing CI, configuration files
2. **Discover existing automation** - Find and understand existing build/test/release mechanisms
3. **Detect what CAN be built/tested/deployed** - Identify capabilities, not assume workflow
4. **Present findings and workflow options** - Show what was discovered AND present choices for workflow decisions
5. **Confirm user choices** - Get explicit confirmation on policy decisions before generating
6. **Generate appropriate workflows** - Based on confirmed choices, not assumptions
7. **Defer to existing automation** - Use `make test` not `go test`, use `npm run build` not raw commands

### Key Distinction from Dockerfile Generation

**Dockerfile generation** can be mostly automated because decisions are **technical**:
- Language version → derivable from manifest files
- Build command → derivable from package.json/Makefile
- Runtime dependencies → derivable from code analysis
- Port → derivable from server configuration

**CI/CD generation** requires conversation because decisions are **policy-based**:
- PR workflow vs direct push → team preference
- What triggers releases → team preference
- What runs on PR vs merge → team preference
- Registry selection → organizational policy
- Deployment strategy → infrastructure choice

Even if we detect that tests exist and a Dockerfile exists, we cannot know:
- Should tests block PR merge, or just run on main?
- Should images be built on every PR (for validation) or only on merge?
- Should releases be automatic on tag, or manual dispatch?

**These are not technical questions with deterministic answers—they are workflow choices that require user input.**

### Key Principles

#### 1. Discover and Defer to Existing Automation

**Critical principle**: If the project has chosen an abstraction, use it.

| If project has... | Generate this | NOT this |
|-------------------|---------------|----------|
| `Makefile` with `test` target | `make test` | `go test ./...` |
| `package.json` with `test` script | `npm test` | `jest` |
| `./scripts/build.sh` | `./scripts/build.sh` | Inline build commands |
| `Taskfile.yml` | `task build` | Raw commands |

The maintainers chose that abstraction for a reason - it may set up fixtures, handle environment variables, run multiple tools, generate coverage, etc.

#### 2. Analyze Everything

The entire repository is context:

| What to Analyze | What It Reveals |
|-----------------|-----------------|
| Source code | Language, framework, structure, dependencies |
| `package.json`, `go.mod`, `Cargo.toml`, etc. | Dependencies, existing scripts, version requirements |
| `Makefile`, `Taskfile.yml`, shell scripts | **Existing automation to reuse** |
| `Dockerfile` | Build context, base images, registry hints |
| Docs (README, CONTRIBUTING) | Deployment process, environments, conventions |
| Existing CI files | What's already there, patterns they follow |
| `.env.example`, config files | Required environment variables |
| Test files | Testing framework, coverage setup |
| Git history/tags | Release patterns, versioning strategy |
| `Chart.yaml`, `values.yaml` | Helm chart definition |
| `kustomization.yaml` | Kustomize overlays |
| `k8s/`, `manifests/`, `deploy/` | Raw Kubernetes manifests |
| ArgoCD Application CRs | GitOps with ArgoCD |
| Flux resources | GitOps with Flux |

#### 3. Detect App Definition & Deployment Mechanism

**Critical principle**: Understand how the app is packaged and deployed before generating CD steps.

**App Definition Detection**:

| Look For | Indicates |
|----------|-----------|
| `Chart.yaml`, `values.yaml`, `charts/` | Helm chart |
| `kustomization.yaml`, `overlays/` | Kustomize |
| Raw YAML in `k8s/`, `manifests/`, `deploy/` | Plain Kubernetes manifests |
| `docker-compose.yml` only | Not K8s-native (different workflow) |
| None of the above | Container-only (no K8s deployment) |

**Deployment Mechanism Detection**:

| Look For | Indicates |
|----------|-----------|
| Existing CI with `kubectl apply` | Direct kubectl deployment |
| Existing CI with `helm upgrade` | Helm-based deployment |
| ArgoCD Application CRs in repo | GitOps with ArgoCD |
| Flux Kustomization/HelmRelease in repo | GitOps with Flux |
| References to ArgoCD/Flux in docs | GitOps (confirm which) |
| No deployment steps in CI | Manual deployment or external system |

**Why This Matters for CD**:

| Deployment Mechanism | CI Should Do |
|---------------------|--------------|
| GitOps (ArgoCD/Flux) | Build image → Update image tag in Helm values or Kustomize overlay → Commit to GitOps repo → Let ArgoCD/Flux sync |
| Direct Helm | Build image → `helm upgrade` with new image tag |
| Direct kubectl | Build image → `kubectl apply` or `kubectl set image` |
| Manual | Build image → Push to registry → Stop (user deploys manually) |

**Critical**: If GitOps is detected, CI must NOT deploy directly. It updates manifests and lets the GitOps controller handle deployment.

#### 4. Present Findings for User Confirmation

**Critical principle**: Before generating anything, present analysis summary and get user confirmation.

After completing repository analysis, present findings to the user:

```
## Analysis Summary

I analyzed your repository and found:

**Language/Framework**: [Detected language] with [framework]
**Build Command**: [Command] (from [source])
**Test Command**: [Command] (from [source])
**Existing CI**: [What was found or "None detected"]

**App Definition**: [Helm chart in X / Kustomize in Y / Raw manifests / None]
**Container Registry**: [Detected registry or "Not detected"]
**Deployment Mechanism**: [GitOps with ArgoCD / Helm / kubectl / Manual / Not detected]

**Branching Strategy**: [PRs to main / Direct push / Not detected]

**Proposed Workflow**:
- [PR workflow description if applicable]
- [Release workflow description]

Is this correct? Would you like to change anything before I generate the workflow(s)?
```

**Why Confirmation Matters**:
- Catches analysis mistakes before they become workflow bugs
- Lets user clarify ambiguities ("We use npm test, not make test")
- Ensures user understands what will be generated
- Builds trust by showing the AI's reasoning

#### 5. Scripts Over Inline Commands (Local/CI Parity)

**Critical principle**: CI workflows should call project scripts, not contain inline command logic.

```yaml
# ❌ BAD - Logic in CI, can't run locally
- run: |
    jest --coverage --ci
    eslint src/ --format=stylish

# ✅ GOOD - CI calls project scripts
- run: npm test
- run: npm run lint
```

**Why this matters**:
- **Local/CI parity**: `npm test` works the same locally and in CI
- **CI platform portability**: Switch from GitHub Actions to GitLab CI? Just change orchestration, scripts stay the same
- **Easier debugging**: Run locally to debug, don't push-and-pray
- **Single source of truth**: Test logic in `package.json`/`Makefile`, not scattered in workflow files
- **Simpler workflows**: CI becomes just "checkout, setup runtime, run script"

**Separation of concerns**:

| Responsibility | Where it belongs |
|----------------|------------------|
| Test, build, lint logic | Project scripts (`npm test`, `make build`, `./scripts/release.sh`) |
| Checkout code | CI action/step |
| Setup runtime/tools | CI action/step |
| Caching | CI action/step |
| Secrets/credentials | CI |
| Artifacts, deployments | CI |

#### 6. Always Present Workflow Choices (Interactive Model)

**Critical principle**: CI/CD involves policy decisions that require user input, not just technical analysis.

Unlike Dockerfile generation where most decisions can be derived from code, CI/CD workflows require explicit user choices:

| Workflow Decision | Why It Requires User Input |
|-------------------|---------------------------|
| PR workflow scope | User decides: tests only? tests + lint? tests + lint + build image? |
| Release trigger | User decides: push to main? version tags? manual dispatch? |
| What runs where | User decides: tests on PR only? tests on both PR and main? |
| Container registry | Organizational policy, not derivable from code |
| Deployment strategy | Infrastructure choice: GitOps vs direct vs manual |
| Environment setup | User decides: DevBox vs native setup actions |

**The prompt MUST present these as choices with recommendations, not assume answers.**

Example interaction:
```
ANALYSIS COMPLETE. Here's what I found:

✓ Tests: `make test` (from Makefile)
✓ Build: `npm run build` (from package.json)
✓ Dockerfile: Found (can build container image)
✓ Helm chart: Found in `charts/myapp/`

WORKFLOW CHOICES NEEDED:

1. PR Workflow - What should run on pull requests?
   ○ Tests + Lint only (Recommended - fast feedback)
   ○ Tests + Lint + Build image (validates full build)
   ○ Tests only

2. Release Trigger - What triggers a release?
   ○ Push to main branch (Recommended for continuous delivery)
   ○ Version tags (v1.0.0)
   ○ Manual workflow dispatch

3. Environment Setup - How should CI install required tools?
   ○ Native GitHub Actions (Recommended - fast, familiar)
   ○ DevBox (portable, same environment locally and in CI)

4. Deployment Strategy - How do you deploy?
   ○ GitOps (update manifests, let ArgoCD/Flux sync)
   ○ Direct Helm upgrade in CI
   ○ Manual (CI only builds and pushes image)

Please confirm your choices.
```

#### 7. Environment Setup: Detect First, Offer Choice

**Critical principle**: Respect existing tooling, offer alternatives when none exists.

**Detection order**:
1. **Project uses DevBox** (`devbox.json` exists) → Use `devbox shell` automatically
2. **Project uses mise** (`.mise.toml` exists) → Use mise automatically
3. **Project uses asdf** (`.tool-versions` exists) → Use asdf automatically
4. **No existing tool manager** → Ask user during interactive flow

**When asking, explain trade-offs**:

| Option | Pros | Cons |
|--------|------|------|
| **Native GitHub Actions** | Fast (cached), familiar, no new dependencies | CI-specific, tool versions in workflow file |
| **DevBox** | Same environment locally and CI, portable across CI platforms, single source of truth (`devbox.json`) | Adds DevBox dependency, Nix learning curve if debugging needed |

**If user chooses DevBox** and project doesn't have `devbox.json`:
- Generate `devbox.json` with detected tool requirements
- User can optionally use `devbox shell` locally for same environment

**If user chooses Native Actions**:
- Use `actions/setup-node`, `actions/setup-go`, etc.
- Read versions from project files (`.nvmrc`, `go.mod`, etc.)
- Use `apt-get` for CLI tools not covered by setup actions

#### 8. GitHub Actions First, Extensible Later

**Initial scope**: GitHub Actions only

**For other platforms**: Guide user to open a feature request issue

```
"Which CI/CD platform do you use?"
- GitHub Actions → [Supported - proceed]
- GitLab CI → [Not yet supported - would you like to open a feature request?]
- Jenkins → [Not yet supported - would you like to open a feature request?]
- Other → [Not yet supported - would you like to open a feature request?]
```

This lets user demand drive the roadmap while delivering value now.

## User Workflows

### Primary Workflow: Generate CI/CD for a Project

**Prerequisites**:
- Project is in a Git repository
- User is in project root directory

**Flow** (Three-Phase Interactive Model):

```
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 1: ANALYZE                                                │
│ Discover what CAN be built/tested/deployed                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 2: PRESENT & ASK                                          │
│ Show findings + present workflow choices for user decision      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PHASE 3: GENERATE                                               │
│ Create workflows based on confirmed user choices                │
└─────────────────────────────────────────────────────────────────┘
```

**Detailed Steps**:

```
PHASE 1: ANALYZE
================

1. User invokes CI/CD generation prompt

2. Prompt asks: "Which CI/CD platform do you use?"
   - GitHub Actions → proceed to analysis
   - Other → offer to open feature request issue

3. AI analyzes entire repository (silent, comprehensive):
   - Scans source files, scripts, configs
   - Identifies language(s), framework(s), version requirements
   - Discovers existing automation (Makefile, npm scripts, Taskfile, etc.)
   - Checks for existing CI configuration
   - Detects container registry hints
   - Detects app definition (Helm, Kustomize, raw manifests)
   - Detects deployment mechanism (GitOps, direct Helm, kubectl)
   - Detects existing tool managers (DevBox, mise, asdf)
   - Examines docs for workflow patterns


PHASE 2: PRESENT & ASK (Interactive)
====================================

4. AI presents analysis findings:
   ```
   ANALYSIS COMPLETE. Here's what I found:

   ✓ Language: Node.js 20 (from package.json engines)
   ✓ Tests: `make test` (from Makefile - runs npm test + lint)
   ✓ Build: `npm run build` (from package.json)
   ✓ Dockerfile: Found
   ✓ Helm chart: Found in `charts/myapp/`
   ✓ Tool manager: None detected
   ✓ Existing CI: None
   ```

5. AI presents workflow choices (ALWAYS ask these - they are policy decisions):

   ```
   WORKFLOW CHOICES NEEDED:

   1. PR Workflow - What should run on pull requests?
      ○ Tests + Lint only (Recommended - fast feedback)
      ○ Tests + Lint + Build image
      ○ Tests only
      ○ No PR workflow (direct push to main)

   2. Release Trigger - What triggers a release build?
      ○ Push to main branch (Recommended)
      ○ Version tags (v1.0.0)
      ○ Manual workflow dispatch
      ○ Both push to main AND version tags

   3. Container Registry - Where to push images?
      ○ GitHub Container Registry (GHCR)
      ○ Docker Hub
      ○ AWS ECR
      ○ Other (specify)

   4. Environment Setup - How should CI install tools?
      ○ Native GitHub Actions (Recommended - fast, familiar)
      ○ DevBox (portable, same environment locally and in CI)

   5. Deployment Strategy - How do you deploy?
      ○ GitOps with ArgoCD (update manifests, ArgoCD syncs)
      ○ GitOps with Flux
      ○ Direct Helm upgrade in CI
      ○ Manual (CI builds and pushes image only)

   Please select your choices (e.g., "1a, 2a, 3a, 4a, 5d")
   or describe your preferences.
   ```

6. User confirms choices or provides corrections


PHASE 3: GENERATE
=================

7. AI generates workflow(s) based on confirmed choices:
   - Uses project scripts (npm test, make build) - NOT inline commands
   - Implements selected environment setup (DevBox or native actions)
   - Creates appropriate workflow structure:
     - If PR workflow selected → `.github/workflows/ci.yml`
     - If release workflow selected → `.github/workflows/release.yml`
   - Deployment steps match selected mechanism
   - If DevBox chosen and no devbox.json → generates devbox.json too

8. AI validates generated workflow:
   - Syntax check
   - References correct files/scripts
   - Secrets/permissions documented
   - All user choices reflected

9. AI presents generated files with explanation:
   - Shows each file with comments
   - Lists required secrets to configure
   - Notes any manual setup steps

10. User reviews and commits workflow(s)
```

### Workflow: Project Uses Unsupported CI Platform

```
1. User invokes CI/CD generation prompt

2. AI asks: "Which CI/CD platform do you use?"
   User selects: "GitLab CI"

3. AI responds:
   "GitLab CI is not yet supported. Would you like me to open a feature
   request issue so we can prioritize adding it?

   - Yes, open a feature request
   - No, I'll use a different approach"

4. If yes → AI creates GitHub issue with:
   - Title: "Feature Request: GitLab CI support for CI/CD generation"
   - Body: Project context, user's use case
   - Label: "enhancement"
```

## Technical Design

### Prompt Template Structure

**File**: `shared-prompts/generate-cicd.md`

The prompt follows the same structure as `generate-dockerfile.md`:

1. **Critical Principles** - Non-negotiable rules
2. **Best Practices Reference** - Tables of practices to apply
3. **Process** - Step-by-step workflow
4. **Checklists** - Verification criteria

### Critical Principles Section

```markdown
## Critical Principles

These are non-negotiable rules that override all other guidance.

### Discover and Defer to Existing Automation

**ABSOLUTE RULE**: Before generating ANY command in the workflow, check if
the project already has automation for that task.

**Required Process**:
1. Search for Makefile, Taskfile.yml, package.json scripts, shell scripts
2. If automation exists for a task → use it
3. Only generate raw commands if no existing automation found
4. When multiple automation options exist → ask the user

**Why**: Existing automation often handles setup, fixtures, environment
variables, coverage, and cleanup that raw commands would miss.

### Verify Everything Before Adding It

**ABSOLUTE RULE**: Before adding ANY step, secret, or configuration,
verify it by examining the actual codebase.

**Never assume. Always verify. Ask when uncertain.**

### Security First for PR Workflows

**ABSOLUTE RULE**: PR workflows from forks must not have write access
to secrets or registries.

**Required**: Split workflows if project uses PRs - PR workflow (read-only)
vs main workflow (write access).
```

### Best Practices Reference Section

```markdown
## Best Practices Reference

Apply these practices when relevant to the project.

### Workflow Security

| Practice | Description |
|----------|-------------|
| **Minimal permissions** | Use `permissions:` block, grant only what's needed |
| **No secrets in PR workflows** | PRs from forks can't access secrets safely |
| **OIDC over long-lived tokens** | For cloud providers, prefer OIDC federation |
| **Pin action versions** | Use SHA or version tags, never `@latest` |
| **Audit third-party actions** | Prefer official actions or well-known publishers |

### Caching Strategies

| Language | Cache Path | Cache Key |
|----------|------------|-----------|
| Node.js | `~/.npm` or `node_modules` | `package-lock.json` hash |
| Go | `~/.cache/go-build`, `~/go/pkg/mod` | `go.sum` hash |
| Python | `~/.cache/pip` | `requirements.txt` or `poetry.lock` hash |
| Rust | `~/.cargo`, `target/` | `Cargo.lock` hash |
| Java/Maven | `~/.m2/repository` | `pom.xml` hash |

### Testing Best Practices

| Practice | Description |
|----------|-------------|
| **Fail fast** | Run quick checks (lint) before slow ones (tests) |
| **Test before build** | Don't waste time building if tests fail |
| **Parallel jobs** | Run independent checks concurrently |
| **Test matrix** | Consider multiple versions/platforms if relevant |

### Container Registry Authentication

| Registry | Authentication Method |
|----------|----------------------|
| GHCR | `GITHUB_TOKEN` (built-in) |
| Docker Hub | Username + access token in secrets |
| AWS ECR | OIDC or `aws-actions/configure-aws-credentials` |
| GCP Artifact Registry | OIDC or service account key |
| Azure ACR | OIDC or service principal |

### Image Tagging Strategy

| Tag Type | When to Use | Example |
|----------|-------------|---------|
| Git SHA | Always (immutable reference) | `abc1234` |
| Semantic version | On version tags | `v1.2.3` |
| `latest` | On main branch only | `latest` |
| Branch name | Feature branches (optional) | `feature-xyz` |
```

### Process Section

```markdown
## Process

### Step 0: Determine CI Platform

Ask the user which CI/CD platform they use:
- **GitHub Actions** → Proceed with generation
- **Other** → Offer to open feature request, explain not yet supported

### Step 1: Comprehensive Repository Analysis

**Analyze everything. The entire repository is context.**

#### 1.1 Discover Existing Automation

**Priority**: This is the most critical analysis step.

Search for and read:
- `Makefile` → Parse targets, understand what each does
- `Taskfile.yml` → Parse tasks
- `package.json` → Read `scripts` section thoroughly
- `scripts/` directory → Read shell scripts, understand their purpose
- `build.gradle`, `pom.xml` → Build tool configurations
- Any file that defines how to build/test/release

**Document what you find**: "Project uses `make test` for testing,
`make build` for building, `./scripts/release.sh` for releases."

#### 1.2 Language and Framework Detection

- Identify primary language(s) from source files and manifests
- Detect frameworks from dependencies
- Note version requirements from manifest files or version files

#### 1.3 Existing CI Analysis

Check for existing CI configuration:
- `.github/workflows/` → Existing GitHub Actions
- `.gitlab-ci.yml` → GitLab CI
- `Jenkinsfile` → Jenkins
- `.circleci/` → CircleCI

If found, analyze what's already configured and why.

#### 1.4 Container and Registry Detection

- Read `Dockerfile` for base images, build patterns
- Search for registry references in existing CI, scripts, docs
- Look for `docker-compose.yml` patterns

#### 1.5 Branching and Release Strategy

- Check for branch protection patterns in existing CI
- Look at git tags for versioning patterns
- Read CONTRIBUTING.md, docs for workflow hints
- Check if PRs are mentioned in documentation

#### 1.6 Environment and Secrets

- Find `.env.example`, `.env.sample` files
- Search code for required environment variables
- Identify what secrets the workflow will need

#### 1.7 App Definition Detection

Identify how the application is packaged for deployment:

- Check for `Chart.yaml`, `values.yaml`, `charts/` directory → Helm chart
- Check for `kustomization.yaml`, `overlays/`, `base/` → Kustomize
- Check for raw YAML in `k8s/`, `manifests/`, `deploy/` → Plain manifests
- Check for `docker-compose.yml` only → Not K8s-native
- If none found → Container-only (CI builds image, no K8s deployment)

**Document what you find**: "Project uses Helm chart in `charts/myapp/` with values for dev/staging/prod environments."

#### 1.8 Deployment Mechanism Detection

Identify how the application is deployed:

- Check existing CI for `kubectl apply`, `helm upgrade`, etc.
- Look for ArgoCD Application CRs in repo
- Look for Flux Kustomization or HelmRelease resources
- Check docs for deployment instructions
- If no deployment detected → ask user

**Document what you find**: "Project uses GitOps with ArgoCD - Application CR in `argocd/` points to `charts/myapp/`."

**Critical for GitOps**: If ArgoCD/Flux is detected, CI must NOT deploy directly. Instead:
1. Build and push image
2. Update image tag in Helm `values.yaml` or Kustomize overlay
3. Commit change to GitOps repo (same repo or separate)
4. ArgoCD/Flux handles actual deployment

### Step 2: Present Findings for Confirmation

**Before asking clarifying questions or generating workflows, present analysis summary.**

```markdown
## Analysis Summary

I analyzed your repository and found:

**Language/Framework**: Node.js 20 with Express
**Build Command**: `npm run build` (from package.json)
**Test Command**: `make test` (from Makefile - runs npm test + lint)
**Existing CI**: None detected

**App Definition**: Helm chart in `charts/myapp/`
**Container Registry**: GHCR (detected from existing Dockerfile comments)
**Deployment Mechanism**: GitOps with ArgoCD (found Application CR in `argocd/`)
**GitOps Repo**: Same repository (monorepo)

**Branching Strategy**: Feature branches with PRs (detected from CONTRIBUTING.md)

**Proposed Workflow**:
- PR workflow: Run `make test`, security scan
- Release workflow: Build image → Push to GHCR → Update `charts/myapp/values.yaml` with new image tag → Commit

Is this correct? Would you like to change anything?
```

**User can**:
- Confirm findings → proceed to generation
- Correct mistakes → "We use `npm test` directly, not `make test`"
- Clarify ambiguities → "Registry is actually ECR, not GHCR"
- Request changes → "Don't include security scan"

### Step 3: Ask Clarifying Questions

**Only ask what couldn't be determined from analysis and wasn't clarified during confirmation.**

Potential questions (ask only if needed):

1. **Branching strategy** (if unclear):
   "I couldn't determine your branching strategy. Do you:
   - Use feature branches with pull requests
   - Push directly to main
   - Use a different workflow"

2. **Container registry** (if not detected):
   "I didn't find registry configuration. Which container registry do you use?
   - GitHub Container Registry (GHCR)
   - Docker Hub
   - AWS ECR
   - Google Artifact Registry
   - Other"

3. **Automation priority** (if multiple exist):
   "I found both `make test` and `npm test`. Which is the primary test command?"

4. **Release trigger** (if ambiguous):
   "How do you trigger releases?
   - Git tags (v1.0.0)
   - Pushes to main/release branch
   - Manual workflow dispatch"

5. **App definition format** (if not detected or multiple found):
   "How is your application packaged for Kubernetes deployment?
   - Helm chart
   - Kustomize
   - Raw Kubernetes manifests
   - Not deployed to Kubernetes (container only)"

6. **Deployment mechanism** (if not detected):
   "How do you deploy to Kubernetes?
   - GitOps with ArgoCD
   - GitOps with Flux
   - Direct helm upgrade in CI
   - Direct kubectl apply in CI
   - Manual deployment (CI only builds and pushes image)"

7. **GitOps repo location** (if GitOps detected but unclear):
   "Where are your GitOps manifests stored?
   - Same repository (monorepo)
   - Separate GitOps repository (provide URL)"

### Step 4: Generate Workflow(s)

Based on analysis and answers, generate appropriate workflow(s).

#### If PRs are used (split workflow):

**File 1**: `.github/workflows/ci.yml` (PR workflow)
- Triggers: `pull_request` to main/master
- Jobs: lint, test, security scan
- No secrets that could leak to fork PRs
- Read-only permissions

**File 2**: `.github/workflows/release.yml` (main/release workflow)
- Triggers: `push` to main, version tags
- Jobs: build, push to registry, deploy (based on deployment mechanism)
- Full secret access
- Write permissions as needed

#### If direct push to main (unified workflow):

**File**: `.github/workflows/ci.yml`
- Triggers: `push` to main
- Jobs: lint → test → build → push → deploy (with dependencies)
- Conditional steps based on branch/tag

#### Deployment Steps by Mechanism

**GitOps (ArgoCD/Flux)**:
```yaml
- name: Update image tag in Helm values
  run: |
    yq -i '.image.tag = "${{ github.sha }}"' charts/myapp/values.yaml

- name: Commit and push
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add charts/myapp/values.yaml
    git commit -m "chore: update image tag to ${{ github.sha }}"
    git push
```
Note: ArgoCD/Flux will detect the change and sync automatically.

**Direct Helm**:
```yaml
- name: Deploy with Helm
  run: |
    helm upgrade --install myapp ./charts/myapp \
      --set image.tag=${{ github.sha }} \
      --namespace myapp
```

**Direct kubectl**:
```yaml
- name: Deploy with kubectl
  run: |
    kubectl set image deployment/myapp \
      myapp=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
      --namespace myapp
```

**Manual (no deployment)**:
- Workflow ends after pushing image to registry
- Add comment explaining user deploys manually

### Step 5: Validate Generated Workflow

Before presenting to user:

1. **Syntax validation**: Ensure valid YAML and GitHub Actions syntax
2. **Reference check**: Verify referenced scripts/files exist
3. **Secret references**: List required secrets clearly
4. **Permission check**: Ensure permissions block is minimal
5. **Deployment check**: Verify deployment steps match detected mechanism

### Step 6: Present to User

Provide:
1. Generated workflow file(s) with explanatory comments
2. Summary of what was detected and decisions made
3. Required secrets to configure
4. Any manual setup steps needed
```

### Checklists Section

```markdown
## Checklists

### Repository Analysis Checklist

- [ ] Searched for and read Makefile/Taskfile/package.json scripts
- [ ] Identified primary language(s) and version requirements
- [ ] Checked for existing CI configuration
- [ ] Analyzed Dockerfile and registry hints
- [ ] Determined branching strategy (PRs vs direct push)
- [ ] Identified required environment variables and secrets
- [ ] Detected app definition format (Helm, Kustomize, raw manifests, none)
- [ ] Detected deployment mechanism (GitOps, direct Helm, direct kubectl, manual)
- [ ] If GitOps: identified whether same repo or separate GitOps repo
- [ ] Presented findings to user for confirmation before generating

### Generated Workflow Checklist

- [ ] Uses existing automation (make, npm scripts) instead of raw commands
- [ ] Has minimal `permissions:` block
- [ ] PR workflow has no write permissions to secrets/registry (if split)
- [ ] Uses pinned action versions (SHA or version tag)
- [ ] Implements appropriate caching for the language
- [ ] Fails fast (lint before test, test before build)
- [ ] Has clear, descriptive job and step names
- [ ] Comments explain non-obvious decisions
- [ ] Required secrets are documented
- [ ] Deployment steps match detected mechanism (GitOps vs direct vs manual)
- [ ] If GitOps: updates manifests and commits, does NOT deploy directly
- [ ] If GitOps with separate repo: includes steps to clone/push to GitOps repo

### Security Checklist

- [ ] PR workflows don't expose secrets to fork PRs
- [ ] No hardcoded credentials or tokens
- [ ] Uses OIDC where possible for cloud providers
- [ ] Third-party actions are from trusted sources
- [ ] Permissions follow principle of least privilege
```

## Implementation Milestones

### Milestone 0: Pre-Implementation Best Practices Review
**Before implementing the prompt, discuss and validate best practices:**

- [ ] Review workflow security practices - are they complete? Any missing?
- [ ] Review caching strategies - any missing languages/ecosystems?
- [ ] Review testing best practices - anything to add?
- [ ] Review container registry authentication - all major registries covered?
- [ ] Review image tagging strategy - align with common org standards?
- [ ] Review DevBox integration - correct approach for `devbox.json` generation?
- [ ] Identify any missing best practice categories
- [ ] Validate interactive Q&A flow - are the right questions being asked?
- [ ] Review example workflow output format - clear and well-commented?

**This checkpoint ensures we're encoding correct practices before they become part of the prompt.**

### Milestone 1: Prompt Template Created
- [ ] `shared-prompts/generate-cicd.md` created with full structure
- [ ] Critical principles documented
- [ ] Best practices reference tables validated and complete
- [ ] Process steps detailed
- [ ] Checklists defined

### Milestone 2: Repository Analysis Working
- [ ] Discovers existing automation (Makefile, npm scripts, etc.)
- [ ] Detects language/framework correctly
- [ ] Finds existing CI configuration
- [ ] Identifies registry and branching patterns
- [ ] Asks appropriate clarifying questions

### Milestone 3: GitHub Actions Generation Working
- [ ] Generates valid workflow syntax
- [ ] Creates split workflows for PR-based projects
- [ ] Creates unified workflow for direct-push projects
- [ ] Uses existing automation commands (not raw commands)
- [ ] Implements proper caching for detected languages

### Milestone 4: Tested with Real Projects
- [ ] Tested with Node.js/TypeScript project (this repo)
- [ ] Tested with Go project
- [ ] Tested with Python project
- [ ] Validates workflow runs successfully on GitHub Actions
- [ ] Verifies caching works correctly

### Milestone 5: Documentation Complete
- [ ] `docs/mcp-guide.md` updated with CI/CD generation guide
- [ ] Troubleshooting section for common issues
- [ ] Feature request process documented for unsupported platforms

### Milestone 6: PRD #226 Retired
- [ ] Close #226 with reference to this PRD
- [ ] Update any dependent PRDs to reference #263
- [ ] Archive or note supersession in old PRD file

## Success Criteria

### Functional Requirements
- [ ] Discovers and uses existing automation (Makefile, npm scripts, etc.)
- [ ] Generates valid GitHub Actions workflow syntax
- [ ] Implements three-phase interactive flow (Analyze → Present & Ask → Generate)
- [ ] Always presents workflow choices for policy decisions (PR scope, release trigger, deployment strategy)
- [ ] Detects existing tool managers (DevBox, mise, asdf) and uses them automatically
- [ ] Offers DevBox vs native actions choice when no tool manager detected
- [ ] Uses project scripts in generated workflows, not inline commands
- [ ] Guides users to feature request for unsupported CI platforms

### Quality Requirements
- [ ] Generated workflows follow security best practices
- [ ] Appropriate caching implemented for each language
- [ ] PR workflows don't leak secrets to forks
- [ ] Workflows are readable and maintainable
- [ ] Comments explain non-obvious decisions
- [ ] Local/CI parity: all test/build commands can run locally with same result
- [ ] If DevBox chosen, generated `devbox.json` includes all required tools

### Integration Requirements
- [ ] Works seamlessly in Claude Code workflow
- [ ] Integrates with PRD #248 (Helm/Kustomize packaging) outputs
- [ ] Published images work with recommend tool for deployment

## Risks & Mitigation

### Risk: Over-complex Repository Analysis
**Impact**: Slow generation, analysis paralysis
**Probability**: Medium
**Mitigation**:
- Set clear stopping points for analysis
- Prioritize Makefile/scripts discovery over deep code analysis
- Have fallback to asking user if analysis is inconclusive

### Risk: Existing Automation Has Bugs
**Impact**: Generated workflow inherits existing problems
**Probability**: Low
**Mitigation**:
- Validate that referenced scripts exist
- Note in output that workflow uses existing automation
- User can override if needed

### Risk: Security Issues in Generated Workflows
**Impact**: Secrets leaked, unauthorized access
**Probability**: Medium (common mistake)
**Mitigation**:
- Security checklist is mandatory
- PR vs main workflow split is emphasized
- Permissions block always minimal

### Risk: Feature Request Volume for Other CI Platforms
**Impact**: Many requests, unclear prioritization
**Probability**: High (GitLab CI is popular)
**Mitigation**:
- Track feature requests with labels
- Prioritize based on request volume
- Architecture supports adding new platforms

## Dependencies

### Prerequisites
- Project is in a Git repository
- User has GitHub account (for GitHub Actions)

### Related PRDs
- **PRD #248** (Helm/Kustomize Packaging): CI can build and push Helm charts
- **PRD #255** (Argo CD Integration): CI triggers GitOps workflows
- **PRD #256** (Flux Integration): CI triggers Flux reconciliation
- **PRD #225** (Dockerfile Generation): CI builds images from generated Dockerfiles

### Supersedes
- **PRD #226** (GitHub Actions CI/CD Pipeline Generation): This PRD replaces #226 with expanded scope and intelligent analysis approach

## Future Enhancements

### Phase 2: Additional CI Platforms (User-Demand Driven)
- GitLab CI support
- Jenkins Pipeline support
- CircleCI support
- Azure DevOps Pipelines support

### Phase 3: Advanced Features
- Multi-environment deployments (dev, staging, prod)
- Deployment approvals and gates
- Rollback workflows
- Notification integrations (Slack, Teams)
- Cost optimization recommendations

### Phase 4: GitOps Integration
- Auto-update image tags in Helm values
- Auto-update Kustomize overlays
- Trigger Argo CD/Flux sync after push

## Work Log

### 2025-12-10: PRD Creation
**Completed Work**:
- Created PRD #263 to supersede #226
- Defined intelligent analysis approach
- Documented "discover and defer" principle
- Created comprehensive best practices reference
- Defined 6 major milestones
- Established GitHub Actions first, extensible architecture

**Design Decisions**:
- Full repository analysis over template matching
- Defer to existing automation (Makefile, npm scripts)
- Ask only what can't be deduced
- GitHub Actions first, feature request for others
- Split vs unified workflow based on branching strategy
- Security-first approach for PR workflows

**Key Differences from PRD #226**:
- Analyze entire repo, not just detect test commands
- Defer to existing automation instead of generating raw commands
- Ask about branching strategy to determine workflow structure
- Support multiple registries, not just GHCR
- Split workflows for security when PRs are used
- Best practices reference section (like Dockerfile prompt)

**Next Steps**:
- Close PRD #226 with reference to this PRD
- Begin implementation of prompt template

### 2025-12-10: PRD Update - App Definition & Deployment Detection
**Completed Work**:
- Added app definition detection (Helm, Kustomize, raw manifests)
- Added deployment mechanism detection (GitOps, direct Helm, direct kubectl, manual)
- Added user confirmation step before generating workflows
- Added GitOps-specific workflow generation patterns
- Updated checklists to include new analysis items
- Added clarifying questions for deployment mechanism

**Design Decisions**:
- **Confirmation before generation**: Present analysis summary and get user approval before generating any workflows. This catches mistakes early and builds trust.
- **GitOps-aware CD**: If ArgoCD/Flux detected, CI must NOT deploy directly. Instead, update image tags in Helm values or Kustomize overlays and commit. GitOps controller handles actual deployment.
- **Same repo vs separate repo**: For GitOps, detect if manifests are in same repository (monorepo) or separate GitOps repository, as this affects workflow steps.
- **Deployment mechanism hierarchy**: GitOps > Direct Helm > Direct kubectl > Manual. Each has different CI responsibilities.

**Key Additions**:
1. Step 1.7: App Definition Detection
2. Step 1.8: Deployment Mechanism Detection
3. Step 2: Present Findings for Confirmation (new step)
4. Step 4: Deployment Steps by Mechanism (GitOps, Helm, kubectl, manual)
5. New clarifying questions for app definition and deployment
6. Updated checklists for deployment validation

### 2025-12-16: PRD Update - Interactive Q&A Model & Environment Setup

**Completed Work**:
- Fundamentally restructured the approach from "ask only what can't be deduced" to "always present workflow choices"
- Added three-phase interactive workflow model (Analyze → Present & Ask → Generate)
- Added "Scripts Over Inline Commands" principle for local/CI parity
- Added DevBox as environment setup option with smart detection
- Updated User Workflows section with complete interactive flow
- Renumbered Key Principles (now 8 principles instead of 6)

**Design Decisions**:

1. **Interactive Q&A Model (Key Architectural Change)**:
   - **Decision**: CI/CD generation requires conversation because workflow decisions are policy-based, not technical
   - **Rationale**: Unlike Dockerfile generation where most decisions can be derived from code (language version, build command, ports), CI/CD involves team preferences:
     - Should tests run on PR, main, or both?
     - What triggers a release?
     - Which registry to use?
     - How to deploy?
   - **Impact**: Changed from "ask only what can't be deduced" to "always present workflow choices with recommendations"
   - **Contrast with Dockerfile**: Dockerfile generation can be mostly automated; CI/CD generation must be conversational

2. **Scripts Over Inline Commands (Local/CI Parity)**:
   - **Decision**: CI workflows should call project scripts (`npm test`, `make build`), not contain inline command logic
   - **Rationale**:
     - Same commands work locally and in CI
     - Easier to switch CI platforms (scripts are portable, CI config is not)
     - Single source of truth for test/build logic
     - Easier debugging (run locally, don't push-and-pray)
   - **Impact**: Added new Key Principle #5 with examples and separation of concerns table

3. **DevBox as Environment Setup Option**:
   - **Decision**: Offer DevBox as a choice during interactive Q&A, don't prescribe it
   - **Rationale**:
     - DevBox provides true local/CI environment parity via `devbox shell`
     - But adds dependency most projects don't have
     - Native GitHub Actions (setup-node, setup-go) are fast, familiar, well-cached
     - Trade-off should be user's choice, not our prescription
   - **Detection Order**: DevBox → mise → asdf → ask user
   - **Impact**: Added Key Principle #7 with detection logic and trade-off table
   - **If user chooses DevBox**: Generate `devbox.json` if not present

4. **Three-Phase Workflow Model**:
   - **Decision**: Restructure flow into explicit phases: Analyze → Present & Ask → Generate
   - **Rationale**: Makes the interactive nature explicit and ensures user confirmation before generation
   - **Impact**: Updated User Workflows section with visual flow diagram and detailed steps

**Rejected Alternatives**:

1. **DevBox as default for all projects**: Rejected because it adds unnecessary dependency for simple projects. Native setup actions are simpler and faster for most use cases.

2. **Fully automated CI generation (like Dockerfile)**: Rejected because CI/CD decisions are fundamentally different from containerization decisions. Technical choices can be derived; policy choices require user input.

3. **`devbox run` for command execution**: Rejected in favor of `devbox shell` + normal scripts. The goal is environment setup parity, not command wrapping. Users still run `npm test`, not `devbox run npm test`.

**Key Principle Changes**:
- Principle #5: Changed from "Ask What Can't Be Deduced" → "Scripts Over Inline Commands"
- Principle #6: New - "Always Present Workflow Choices (Interactive Model)"
- Principle #7: New - "Environment Setup: Detect First, Offer Choice"
- Principle #8: Renumbered from #6 - "GitHub Actions First, Extensible Later"

**Next Steps**:
- Begin implementation of `shared-prompts/generate-cicd.md`
- Implement three-phase interactive flow
- Add DevBox generation capability
