---
name: generate-cicd
description: Generate intelligent CI/CD workflows through interactive conversation by analyzing repository structure and user preferences
category: development
---

# Generate CI/CD Workflows

Generate appropriate CI/CD workflows for the current project through an interactive conversation. This prompt analyzes your entire repository, presents findings, asks about workflow preferences, and generates workflows based on your confirmed choices.

## Instructions

You are helping a developer set up CI/CD workflows for their project. Unlike template-based generators, you will:

1. **Analyze** the entire repository - source code, automation, configs, docs, existing CI
2. **Present findings** and workflow options to the user for decision-making
3. **Generate** workflows based on confirmed user choices

This interactive model is essential because CI/CD workflows involve **policy decisions** (PR vs direct push, release triggers, deployment strategy) that cannot be deduced from code alone—they reflect team preferences and organizational policies.

### Key Rules

**Verify everything**: Before adding any step, secret, or configuration, verify it by examining the actual codebase. Never assume. Ask when uncertain.

**Always present workflow choices**: CI/CD involves policy decisions that require user input. Even if you detect tests and a Dockerfile, you cannot know whether tests should run on PR or main, what triggers releases, which registry to use, or how to deploy. These are workflow choices that require user input.

---

## Best Practices

Apply these practices when generating workflows.

### Use Project Automation, Not Inline Commands

CI workflows should call project automation, not contain inline command logic.

```yaml
# ❌ BAD - Logic in CI, can't run locally the same way
- run: |
    jest --coverage --ci
    eslint src/ --format=stylish

# ✅ GOOD - CI calls project automation
- run: npm test
- run: npm run lint
```

**Why**: Local/CI parity, CI platform portability, easier debugging, single source of truth.

**When project automation doesn't exist**, ask the user:

```text
I didn't find automation for [operation]. Would you like me to:
1. Add it to the project (recommended for local/CI parity)
2. Use inline command in workflow
```

### Actions for Infrastructure, Project Commands for Logic

| Category | Examples | Approach |
|----------|----------|----------|
| **CI Infrastructure** | checkout, setup runtime, cache, registry login | ✅ Use actions |
| **Project Logic** | build, test, lint, docker build, deploy | ✅ Use project automation |

### Secret Handling

Secrets are only accessible from the org/owner that has them configured. Fork PRs cannot access base repo secrets.

Use conditional to skip steps when secrets unavailable:

```yaml
- name: Run integration tests
  if: secrets.API_KEY != ''
  run: npm run test:integration
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

When the generated workflow requires secrets, document them clearly:

```markdown
## Required Secrets

| Secret Name | Description | How to Create |
|-------------|-------------|---------------|
| `REGISTRY_USERNAME` | Container registry username | Your registry account username |
| `REGISTRY_TOKEN` | Container registry access token | Registry settings > Access Tokens |

**To create secrets via CLI:**
gh secret set REGISTRY_USERNAME
gh secret set REGISTRY_TOKEN
```

Show the `gh secret set` commands as guidance, but do NOT execute them.

### Security

| Practice | Description |
|----------|-------------|
| **Minimal permissions** | Use `permissions:` block, grant only what's needed |
| **OIDC over long-lived tokens** | For cloud providers, prefer OIDC federation |
| **Pin action versions** | Use SHA or version tags, never `@latest` |
| **Disable credential persistence** | Use `persist-credentials: false` on `actions/checkout` |
| **Prevent script injection** | Never interpolate untrusted inputs (branch names, PR titles) directly into `run:` commands |
| **Avoid `pull_request_target`** | This trigger has access to secrets but can checkout fork code - dangerous combination |
| **Environment protection** | Use GitHub environments with required reviewers for production deployments |

### Testing

| Practice | Description |
|----------|-------------|
| **Fail fast** | Run quick checks (lint) before slow ones (tests) |
| **Test before build** | Don't waste time building if tests fail |
| **Parallel jobs** | Run independent checks concurrently |
| **Test matrix** | Consider multiple versions/platforms if relevant |

### Caching

Implement appropriate caching based on detected package manager and lock files.

---

## Process

**IMPORTANT**: Execute this process SEQUENTIALLY. Each step may change the direction of the conversation. Do NOT batch all questions upfront - ask questions one phase at a time and wait for user responses before proceeding.

The workflow follows three phases:

```text
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

### Step 0: Determine CI Platform (BLOCKING GATE)

**CRITICAL**: This is a blocking gate. Ask about CI platform FIRST and ALONE. Do NOT ask any other questions or perform any analysis until the user confirms they want GitHub Actions.

Ask the user which CI/CD platform they use. Present ONLY these options:

1. **GitHub Actions**
2. **Other**

**If GitHub Actions** → Proceed to Step 1 (analysis)

**If Other** → STOP. Ask which platform they use, then respond:

```text
[Platform] is not yet supported. Would you like me to open a feature
request issue at https://github.com/dot-ai-app/dot-ai/issues so we
can prioritize adding it?

1. Yes, open a feature request
2. No, I'll use a different approach
```

Then handle the user's response (create issue or end conversation). Do NOT proceed to repository analysis for unsupported platforms.

### Step 1: Comprehensive Repository Analysis

**Analyze everything. The entire repository is context.**

#### 1.1 Language and Framework Detection

- Identify primary language(s) from source files and dependency manifests
- Detect frameworks from dependencies
- Note version requirements

#### 1.2 Discover and Understand Existing Automation

Find what automation exists and **read scripts to understand how they work** - what arguments they accept, what they handle internally, how they should be called. Don't just note that a script exists; understand it.

- If automation exists for a task → use it in the generated workflow
- Only generate raw commands if no existing automation found
- When multiple automation options exist → ask the user

**Why this matters**: Existing automation often handles setup, fixtures, environment variables, and cleanup that raw commands would miss. The maintainers chose their build system for a reason.

#### 1.3 Existing CI Analysis

Check for existing CI configuration. If found:
- Analyze what's already configured and why
- During Step 2, ask user whether to update existing workflows or create new ones

#### 1.4 Container and Registry Detection

- Check for Dockerfile and container configuration
- Search for registry references in existing CI, automation, or docs
- If no Dockerfile but project could benefit from containerization, suggest using `/generate-dockerfile` prompt

#### 1.5 Branching and Release Strategy

- Check for patterns in existing CI triggers
- Look at git tags for versioning patterns
- Check documentation for workflow hints

#### 1.6 Environment and Secrets

- Find environment variable documentation or examples
- Search code for required environment variables
- Identify what secrets the workflow will need

#### 1.7 App Definition Detection

Identify how the application is packaged for deployment:
- Helm charts
- Kustomize configurations
- Plain Kubernetes manifests
- Container-only (no K8s deployment)

#### 1.8 Deployment Mechanism Detection

Identify how the application is deployed:
- GitOps (ArgoCD, Flux)
- Direct deployment (Helm, kubectl)
- Manual deployment
- External system

**For GitOps**:
- CI must NOT deploy directly - it updates manifests, GitOps controller syncs
- Determine if GitOps resources (ArgoCD Application, Flux Kustomization) exist
- If not, may need to create them (same repo or separate cluster-config repo)
- Determine where manifests live for image tag updates

If unclear, ask user during Step 2.

#### 1.9 Tool Manager Detection

Check for existing tool/environment managers (DevBox, mise, asdf, etc.). If found, use them automatically. If none, will ask user during interactive Q&A.

### Step 2: Present Findings for Confirmation

**Before generating workflows, present analysis summary.** Include only what's relevant to this project - the example below is illustrative, not a template to fill out:

```markdown
## Analysis Summary

I analyzed your repository and found:

**Language/Framework**: Node.js 20 with Express
**Build Command**: `npm run build` (from package.json)
**Test Command**: `npm test` (from package.json)
**Existing CI**: GitHub Actions workflow found (ci.yml)

**App Definition**: Helm chart in `charts/myapp/`
**Deployment Mechanism**: GitOps with ArgoCD

Is this correct? Would you like to change anything?
```

**User can**:
- Confirm findings → proceed to workflow choices
- Correct mistakes
- Clarify ambiguities

### Step 3: Present Workflow Choices

**Present choices relevant to this project based on analysis.** These are policy decisions that require user input. Only ask about what's applicable - for example, don't ask about container registry if there's no Dockerfile, or deployment strategy if it's a library.

Common choices include:
- **PR Workflow**: What should run on pull requests?
- **Release Trigger**: What triggers a release build?
- **Release Validation**: Should release workflow re-run checks that already passed in PR? (Re-run all = safest/slowest, Skip validation = fastest, Security scans only = compromise)
- **Container Registry**: Where to push images? (if containerized)
- **Environment Setup**: Native GitHub Actions or DevBox?
- **Deployment Strategy**: GitOps, direct, or manual? (if deployed)

Ask clarifying questions as needed:
- If branching strategy unclear: "Do you use feature branches with pull requests, or push directly to main?"
- If multiple automation options exist: "I found multiple ways to run tests. Which is the primary test command?"
- If GitOps detected but repo location unclear: "Where are your GitOps manifests stored - same repository or separate?"

### Step 4: Generate Workflow(s)

Generate appropriate workflow(s) based on analysis and confirmed user choices.

### Step 5: Validate Generated Workflow

Before presenting to user:

1. **Syntax validation**: Ensure valid YAML and GitHub Actions syntax
2. **Reference check**: Verify referenced automation exists
3. **Secret documentation**: List required secrets clearly
4. **Permission check**: Ensure permissions block is minimal
5. **Deployment check**: Verify deployment steps match selected mechanism

### Step 6: Present to User

Provide:

1. **Generated workflow file(s)** with explanatory comments
2. **Summary** of what was detected and decisions made
3. **Required secrets** to configure (with setup guidance)
4. **Required permissions and settings** - Based on what the workflow does, identify what permissions or repository settings are needed and provide instructions to configure them. Don't wait for the workflow to fail - tell users upfront what to configure.

### Step 7: Validate

After user approves, commit the workflows following the project's established process. Trigger the workflows, monitor runs, and iterate on any failures until they pass.

