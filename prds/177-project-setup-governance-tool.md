# PRD #177: Project Setup & Governance Tool (MCP)

**GitHub Issue**: [#178](https://github.com/vfarcic/dot-ai/issues/178)
**Status**: In Progress - Milestone 1 Complete
**Priority**: High
**Created**: 2025-10-23
**Last Updated**: 2025-10-23 (Milestone 1: Core Tool Infrastructure Complete)

---

## Resolved Design Decisions

### Decision 1: MCP Cannot Write Files Directly (2025-10-23)
**Rationale**: MCP servers run remotely or sandboxed and cannot access client file systems. The MCP protocol is request/response based - servers return data, clients perform I/O operations.

**Impact**:
- Tool returns file data structures instead of writing files
- AI client uses its Write tool to create files
- Cleaner separation of concerns (MCP = logic, client = I/O)
- Works reliably whether MCP runs locally or remotely

**Implementation**: All workflow stages return file content data, never perform direct file operations.

---

### Decision 2: Client Provides File Inventory (2025-10-23)
**Rationale**: MCP cannot scan client file systems due to security sandboxing and remote operation. The client (AI assistant) has file system access and must provide file information.

**Impact**:
- MCP provides list of files to check (discovery stage)
- Client scans repository using Glob/Read tools
- Client reports findings back to MCP (analysis stage)
- Enables gap analysis without requiring MCP file system access

**Implementation**: Three-stage workflow separates discovery, analysis, and generation concerns.

---

### Decision 3: Three-Stage Workflow - Discovery → Analysis → Generation (2025-10-23)
**Rationale**:
- **Discovery**: MCP tells client what files to check for (based on scope)
- **Analysis**: Client reports existing files, MCP identifies gaps
- **Generation**: MCP returns **only missing files**, not all 90 artifacts

**Impact**:
- Efficient: Only generates what's needed
- Transparent: Client knows exactly what will be created
- Resumable: Session state maintained across stages
- Scalable: Works for any scope (governance, docker, kubernetes, etc.)

**Benefits**:
- No file conflicts (never overwrites existing files)
- Faster execution (skip unnecessary generation)
- Better user experience (clear what's missing vs exists)

**Implementation**: Stage-based routing in handler, session management for context preservation.

---

## Problem Statement

Every software project needs proper governance documentation, development infrastructure, and best practices configuration, but creating these artifacts from scratch is time-consuming, error-prone, and requires deep knowledge of current best practices across multiple domains.

### Current State
- **New Projects**: Developers start with minimal structure (README, LICENSE), missing critical governance and community files
- **Existing Projects**: Many lack proper governance documentation, blocking CNCF submissions and enterprise adoption
- **Best Practices Gap**: Keeping up with evolving best practices across governance, security, CI/CD, containers, and cloud native is challenging
- **Manual Process**: Creating 90+ configuration files manually is tedious and inconsistent across projects
- **No Validation**: No automated way to audit project completeness against industry standards

### Problems to Solve
1. **Setup Overhead**: 40+ hours to research and create comprehensive project infrastructure from scratch
2. **Inconsistency**: Each project reinvents the wheel with varying quality and completeness
3. **Knowledge Barrier**: New maintainers don't know what files are needed or current best practices
4. **Audit Gap**: No automated way to assess existing project health and identify missing artifacts
5. **CNCF Readiness**: Projects struggle to meet CNCF Sandbox requirements (governance, security, community files)
6. **Maintenance Burden**: Keeping templates and configurations up-to-date with evolving best practices

---

## Proposed Solution

Create an MCP tool called `projectSetup` that intelligently audits existing repositories or bootstraps new projects with comprehensive governance, infrastructure, and best practices artifacts. The tool uses AI to understand context, ask relevant questions, and generate high-quality files based on authoritative sources and current best practices.

### Key Capabilities

**Dual Operation Modes:**
- **Audit Mode**: Scan existing repository, identify gaps, generate missing artifacts
- **New Mode**: Bootstrap complete repository structure from scratch

**Intelligent Analysis:**
- Auto-detect project type (language, framework, deployment target)
- Scan for existing files and configurations
- Gap analysis against best practices and compliance requirements
- Context-aware question generation

**Best Practices Integration:**
- Research and apply current best practices for each artifact
- Use authoritative templates (CNCF, OpenSSF, Contributor Covenant)
- Include explanatory comments referencing source documentation
- Version-tracked templates that evolve with industry standards

**90+ Artifact Coverage:**
- Legal & licensing (LICENSE, NOTICE, COPYRIGHT)
- Governance (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, MAINTAINERS, GOVERNANCE, ROADMAP)
- Community (SUPPORT, ADOPTERS, CHANGELOG)
- Documentation (ARCHITECTURE, DEVELOPMENT, RELEASE, TROUBLESHOOTING)
- GitHub infrastructure (issue templates, workflows, automation)
- Container configuration (Dockerfile, docker-compose)
- Code quality (linting, formatting, testing configs)
- Language-specific configs (Node.js, Python, Go, Rust)
- Kubernetes manifests and Helm charts
- GitOps (Argo CD, Flux)
- Infrastructure as Code (Terraform, Crossplane)
- Security & compliance (scanning configs, SBOM)

---

## Success Criteria

### Tool Functionality
- [ ] Discovery stage returns complete file inventory list for each scope (governance, docker, k8s, etc.)
- [ ] Analysis stage correctly identifies gaps (only missing files, never existing ones)
- [ ] Generation stage returns only missing files, never attempts to update existing ones
- [ ] Tool works correctly when MCP runs remotely (no file system access required)
- [ ] Client can resume workflow across multiple MCP calls using sessionId
- [ ] Audit mode successfully identifies missing artifacts in existing repositories
- [ ] New mode creates complete repository structure from scratch
- [ ] Project type detection works with client-provided file contents (95%+ accuracy)
- [ ] Generates all 90 artifact types with best practices applied
- [ ] Interactive questionnaire adapts to user responses and detected context
- [ ] Validates completeness against CNCF Sandbox and OpenSSF standards

### Quality & Best Practices
- [ ] All generated files include explanatory comments and source references
- [ ] Templates based on authoritative sources (CNCF, OpenSSF, official docs)
- [ ] Generated files pass validation checks (linting, schema validation)
- [ ] Best practices documentation maintained for each artifact category
- [ ] Template versioning tracks evolution of best practices

### User Experience
- [ ] Session continuity allows resuming interrupted workflows
- [ ] Preview mode shows files before generation
- [ ] Clear instructions guide client through each workflow stage
- [ ] Validation report shows compliance score and recommendations
- [ ] Average time to complete governance setup: <15 minutes (vs 40+ hours manual)

### Integration Testing (Required for All Milestones)
- [ ] Each milestone includes integration tests validating the implemented functionality
- [ ] Integration tests cover full workflow stages (discovery → analysis → generation)
- [ ] Tests validate returned data structures match specifications
- [ ] Tests ensure only missing files are generated (no overwrites)
- [ ] Integration tests run successfully in CI/CD pipeline

---

## User Impact

### New Project Creators
**Before**: Spend 40+ hours researching and creating governance docs, CI/CD configs, and best practices files
**After**: AI calls MCP tool → answers questions → receives file contents → AI writes files. Complete setup in <15 minutes.

**Workflow Example**:
```
User: "Set up governance for my new TypeScript project"

1. [Discovery] AI → MCP: Request governance file list
2. [Discovery] MCP → AI: Check for these 6 files [CONTRIBUTING.md, SECURITY.md, ...]
3. [Scan] AI scans repo using Glob → finds none
4. [Analysis] AI → MCP: No existing files, project is TypeScript
5. [Analysis] MCP → AI: Need 6 governance files (4 critical, 2 recommended)
6. [Questions] MCP asks: maintainer name, email, license type
7. [Generation] MCP → AI: Here are 6 complete files with best practices
8. [Write] AI uses Write tool to create all 6 files
9. [Summary] AI: "Created 6 governance files, CNCF Sandbox ready!"

Time: <15 minutes (vs 40+ hours manual)
```

### Existing Project Maintainers (CNCF Submission)
**Before**: Manual audit against CNCF requirements, create 20+ governance files from scratch, uncertainty about completeness
**After**: AI audits repo via MCP, receives only missing files, writes them. CNCF-ready in <30 minutes.

**Workflow Example**:
```
User: "Audit my repo for CNCF Sandbox submission"

1. [Discovery] AI → MCP: Audit mode, governance scope
2. [Discovery] MCP → AI: Check for these governance files
3. [Scan] AI finds: README.md, LICENSE (2/6 files)
4. [Analysis] AI → MCP: Found 2 files, missing 4
5. [Analysis] MCP → AI: Missing 4 critical files
6. [Generation] MCP → AI: Here are the 4 missing files only
7. [Write] AI creates 4 files (skips README.md, LICENSE)
8. [Summary] AI: "Added 4 missing files. Now 6/6 governance files complete."

Time: <30 minutes
```

### Platform Engineering Teams
**Before**: Manually maintain template repositories, keep best practices updated across dozens of projects, inconsistent structure
**After**: Single MCP tool ensures consistency, AI agents apply latest best practices to all projects uniformly

### Open Source Contributors
**Before**: Uncertain what files to create, outdated examples from blog posts, missing critical security/governance
**After**: AI assistant guides through discovery → analysis → generation flow, ensures current best practices

---

## Technical Implementation

### MCP Tool Interface

**IMPORTANT ARCHITECTURAL CONSTRAINT**: MCP servers cannot write files directly. The tool returns file data structures that the AI client writes using its own tools (Write, Edit). This ensures the tool works correctly whether MCP runs locally or remotely.

```typescript
// Tool definition in src/interfaces/mcp.ts
server.tool(
  'projectSetup',
  'Audit repository health and generate missing governance, infrastructure, or configuration artifacts with best practices. Returns file data for client to write - MCP does not write files directly.',
  {
    mode: z.enum(['audit', 'new']).describe('Audit existing repo or create new project'),
    scope: z.enum(['all', 'governance', 'docker', 'ci-cd', 'kubernetes', 'gitops', 'quality']).optional(),

    // Session management for multi-stage workflow
    sessionId: z.string().optional().describe('Continue previous session'),
    stage: z.enum(['discovery', 'analysis', 'questions', 'generate']).optional()
      .describe('Current workflow stage - defaults to discovery if omitted'),

    // Client-provided data (for analysis stage)
    existingFiles: z.array(z.string()).optional()
      .describe('List of files found in repository (client provides after discovery stage)'),
    projectType: z.string().optional()
      .describe('Detected project type (typescript, python, go, rust, etc.)'),
    projectInfo: z.record(z.any()).optional()
      .describe('Project metadata from package files (name, description, version, etc.)'),

    // User responses (for questions stage)
    response: z.string().optional().describe('Answer to previous question'),

    // Options
    interactive: z.boolean().optional().default(true)
      .describe('Ask questions vs use defaults'),
    preview: z.boolean().optional().default(false)
      .describe('Preview files before generation'),
  },
  async (params) => {
    return projectSetupHandler(params);
  }
);
```

**Key Changes from Original Design**:
- ✅ Removed `autoDetect` - client provides detection results instead
- ✅ Removed `updateExisting` - tool only creates missing files, never updates existing ones
- ✅ Added `stage` - explicit workflow stage control (discovery → analysis → questions → generate)
- ✅ Added `existingFiles`, `projectType`, `projectInfo` - client-provided context
- ✅ Clarified in description that MCP returns data, doesn't write files

### Workflow Stages

The workflow is split into distinct stages to accommodate the MCP architectural constraint (server cannot access client file system). Each stage has clear responsibilities and handoff points.

---

**Stage 1: Discovery** (MCP returns file checklist)

**MCP Action**: Return comprehensive list of files to check based on mode and scope

**Client Action**: Use Glob/Read tools to scan repository for these files

**MCP Returns**:
```typescript
{
  success: true,
  stage: 'discovery',
  sessionId: 'proj-{timestamp}-{uuid}',
  scope: 'governance' | 'docker' | 'ci-cd' | ...,
  requiredFiles: string[],         // Files to check for this scope (e.g., ['CONTRIBUTING.md', 'SECURITY.md', ...])
  projectDetectionFiles: string[],  // Files to read for project type detection (e.g., ['package.json', 'go.mod'])
  nextStage: 'analysis',
  instructions: 'Scan your repository for these files and report which exist. Read projectDetectionFiles to determine project type.'
}
```

---

**Stage 2: Analysis** (MCP performs gap analysis)

**Client Action**: Send list of existing files and project metadata to MCP

**MCP Action**:
- Compare existing files vs required files
- Identify gaps (critical, recommended, optional)
- Determine if questions needed or can use defaults

**MCP Returns**:
```typescript
{
  success: true,
  stage: 'analysis',
  sessionId: string,
  gaps: {
    critical: string[],     // Required files (e.g., CNCF Sandbox requirements)
    recommended: string[],  // Best practice files
    optional: string[]      // Nice-to-have files
  },
  existingFiles: string[],
  missingFilesCount: number,
  detectedProjectType: string,  // 'typescript', 'python', 'go', 'rust', etc.
  nextStage: 'questions' | 'generate',  // Skip questions if not interactive
  summary: string  // Human-readable gap analysis summary
}
```

---

**Stage 3: Questions** (Optional - Interactive Customization)

**MCP Action**: Ask context-specific questions for template customization

**Client Action**: Present questions to user, collect responses, send back to MCP

**MCP Behavior**: Follows existing interactive question pattern from other tools

**Skip if**: `interactive: false` - MCP uses sensible defaults based on project type

---

**Stage 4: Generation** (MCP returns file contents)

**Client Action**: Request file generation (optionally after answering questions)

**MCP Action**:
- Load templates for missing files only
- Apply best practices and user context
- Generate file contents with variable substitution
- Include explanatory comments and source citations

**MCP Returns**:
```typescript
{
  success: true,
  stage: 'complete',
  sessionId: string,
  files: [
    {
      path: string,            // Relative path (e.g., 'CONTRIBUTING.md', '.github/workflows/test.yml')
      content: string,          // Complete file content ready to write
      action: 'create',         // Always 'create' (tool never updates existing files)
      priority: 'critical' | 'recommended' | 'optional',
      reason: string,           // Why this file is needed (e.g., 'Required for CNCF Sandbox')
      bestPracticeSource: string // Citation (e.g., 'CNCF Sandbox requirements', 'OpenSSF Security Policy Template')
    },
    // ... more files (only missing ones)
  ],
  summary: {
    toCreate: number,   // Files to be created
    existing: number,   // Files that already exist (skipped)
    total: number       // Total files in scope
  },
  instructions: 'Use Write tool to create these files in your repository. Files are ready to write as-is.'
}
```

---

**Stage 5: Validation** (Client-side, Optional)

**Client Action**:
- Write files using Write tool
- Optionally run linters, schema validators
- Optionally commit changes to git

**MCP Role**: None for basic validation. Future enhancement could add a validation endpoint.

**Notes**:
- File writing happens on client side using native tools
- Git integration (commits, PRs) handled by client
- Validation can be re-triggered by calling MCP with validation scope

---

**Removed**: ~~Stage 6: Integration~~ - MCP never writes files or creates commits directly

### Template System

**Directory Structure:**
```
src/templates/
├── best-practices/         # Documentation of best practices
│   ├── governance.md
│   ├── docker.md
│   ├── ci-cd.md
│   ├── kubernetes.md
│   └── security.md
├── governance/            # Governance file templates
│   ├── contributing.md.template
│   ├── code-of-conduct.md.template
│   ├── security.md.template
│   ├── maintainers.md.template
│   ├── governance.md.template
│   └── roadmap.md.template
├── github/               # GitHub community templates
│   ├── bug-report.md.template
│   ├── feature-request.md.template
│   ├── pull-request.md.template
│   └── workflows/
├── docker/              # Container templates
│   ├── dockerfile.template
│   └── dockerignore.template
├── kubernetes/          # K8s manifest templates
│   ├── deployment.yaml.template
│   └── service.yaml.template
├── code-quality/       # Linting, testing configs
│   ├── typescript/
│   ├── python/
│   └── go/
└── metadata.json       # Template versions and sources
```

**Template Variables:**
- `{projectName}` - Project name
- `{projectDescription}` - Short description
- `{maintainerName}` - Primary maintainer name
- `{maintainerEmail}` - Primary maintainer email
- `{licenseType}` - License (MIT, Apache-2.0, etc.)
- `{year}` - Current year
- Custom variables per template type

### Best Practices Sources

**Governance:**
- CNCF Sandbox/Incubating/Graduated requirements
- Linux Foundation best practices
- Contributor Covenant (Code of Conduct)
- OpenSSF Security Policy Template

**Containers:**
- Docker official best practices
- Google Container Best Practices
- CNCF security whitepaper
- Distroless/minimal image guidelines

**CI/CD:**
- GitHub Actions security hardening
- OpenSSF Scorecard recommendations
- Sigstore for artifact signing
- SLSA framework compliance

**Kubernetes:**
- Kubernetes official documentation
- CNCF production readiness checklist
- NSA Kubernetes Hardening Guide
- Pod Security Standards

**Code Quality:**
- Language-specific official style guides
- ESLint/Prettier for TypeScript
- Black/Ruff for Python
- golangci-lint for Go

---

## Milestones

**CRITICAL REQUIREMENT: Integration Testing for All Milestones**

Every milestone MUST include integration tests that validate the implemented functionality. Integration tests should:
- ✅ Test the complete workflow (discovery → analysis → generation where applicable)
- ✅ Validate returned data structures match API specifications
- ✅ Ensure only missing files are generated (no overwrites)
- ✅ Verify template content includes best practices and source citations
- ✅ Test error handling and edge cases
- ✅ Run successfully in CI/CD pipeline before marking milestone complete

**See**: `tests/integration/CLAUDE.md` for comprehensive integration testing standards and patterns.

---

### Milestone 1: Core Tool Infrastructure ✅
**Success Criteria**: Basic tool framework operational with audit and new modes

**Deliverables:**
- [x] MCP tool definition and handler in `src/interfaces/mcp.ts`
- [x] Workflow engine in `src/tools/project-setup.ts` with stage-based routing
- [x] Session management (create, resume, complete) across workflow stages
- [x] File registry system (catalog of all possible artifacts by scope) - Basic implementation with discovery-config.json
- [x] Gap analysis engine (compare required vs existing files)
- [x] Template loading system (Handlebars integration via shared-prompt-loader)
- [x] File generation engine (returns file data, doesn't write)
- [ ] Basic validation framework - **Deferred to future milestone**

**Integration Tests (Required):**
- [x] Test discovery stage: Returns correct file list for each scope
- [x] Test analysis stage: Correctly identifies gaps given existing files
- [x] Test generation stage: Returns only missing file contents
- [x] Test session continuity: Can resume workflow with sessionId
- [ ] Test multiple scopes: governance, docker, ci-cd - **Deferred: Currently supports README.md only**
- [ ] Test both modes: audit and new project creation - **Deferred: Mode distinction not yet implemented**
- [x] Validate response structures match specifications

**Validation**: ✅ Tool completes full discovery → analysis → generation workflow, core integration tests pass (7/7 tests passing)

**Notes**:
- MCP returns data structures, never writes files
- Client provides file inventory from scanning
- Only generates missing files, never existing ones

---

### Milestone 2: Legal & Licensing Artifacts (3 artifacts)
**Success Criteria**: All legal/licensing files generated with appropriate templates

**Artifacts:**
- [ ] `LICENSE` or `LICENSE.md` - Auto-detect existing or prompt for license type (MIT, Apache-2.0, GPL-3.0, BSD-3-Clause)
- [ ] `NOTICE` - Attribution file for Apache license or third-party code inclusion
- [ ] `COPYRIGHT` - Copyright statement template

**Best Practices Research:**
- [ ] Document license compatibility matrix
- [ ] CNCF acceptable licenses
- [ ] Attribution requirements for common licenses
- [ ] When NOTICE vs COPYRIGHT is needed

**Validation**: Generated license files pass OSI validation, proper year and copyright holder substitution

---

### Milestone 3: Core Governance Artifacts (6 artifacts)
**Success Criteria**: Complete governance documentation meeting CNCF Sandbox requirements

**Artifacts:**
- [ ] `CONTRIBUTING.md` - Development workflow, PR process, coding standards, testing requirements
- [ ] `CODE_OF_CONDUCT.md` - Contributor Covenant v2.1 with customized enforcement contacts
- [ ] `SECURITY.md` - Vulnerability reporting process following OpenSSF template
- [ ] `MAINTAINERS.md` - Maintainer list with roles, responsibilities, and succession process
- [ ] `GOVERNANCE.md` - Decision-making process, voting, conflict resolution
- [ ] `ROADMAP.md` - 6-12 month vision with short/medium/long-term goals

**Best Practices Research:**
- [ ] CNCF governance best practices from graduated projects
- [ ] Contributor Covenant adoption and customization guide
- [ ] OpenSSF vulnerability disclosure best practices
- [ ] Roadmap formats and update cadences

**Validation**: All files exist, CNCF Sandbox checklist passes, links are valid

---

### Milestone 4: Community & Support Artifacts (3 artifacts)
**Success Criteria**: Community engagement infrastructure operational

**Artifacts:**
- [ ] `SUPPORT.md` - How to get help, where to ask questions, response time expectations
- [ ] `ADOPTERS.md` - Template for organizations/users to list themselves, contribution instructions
- [ ] `CHANGELOG.md` - Keep a Changelog format structure with version history template

**Best Practices Research:**
- [ ] Community support channel options (Discussions, Slack, Discord)
- [ ] Adopters list formats from successful CNCF projects
- [ ] Semantic versioning and changelog automation

**Validation**: Files provide clear community engagement paths, adopters list includes contribution instructions

---

### Milestone 5: Documentation Artifacts (5 artifacts)
**Success Criteria**: Comprehensive project documentation structure

**Artifacts:**
- [ ] `README.md` - Enhancement/validation (badges, quick start, links to governance docs, how to contribute)
- [ ] `ARCHITECTURE.md` - System architecture, component interactions, design decisions, extension points
- [ ] `DEVELOPMENT.md` - Local development setup, debugging, IDE configuration, common workflows
- [ ] `RELEASE.md` - Release process, version numbering (SemVer), release checklist, maintainer procedures
- [ ] `TROUBLESHOOTING.md` - Common issues, solutions, debugging tips, FAQ

**Best Practices Research:**
- [ ] README badge standards and shield.io integration
- [ ] Architecture documentation patterns (C4 model, ADRs)
- [ ] Development environment reproducibility
- [ ] Release process automation best practices

**Validation**: README passes markdown linting, all internal links valid, documentation structure navigable

---

### Milestone 6: GitHub Issue Templates (3 artifacts)
**Success Criteria**: Structured issue reporting with proper templates

**Artifacts:**
- [ ] `.github/ISSUE_TEMPLATE/bug_report.md` - Bug description, reproduction steps, environment, logs
- [ ] `.github/ISSUE_TEMPLATE/feature_request.md` - Problem statement, proposed solution, alternatives
- [ ] `.github/ISSUE_TEMPLATE/config.yml` - Template chooser configuration, external links

**Best Practices Research:**
- [ ] GitHub issue template YAML schema
- [ ] Required vs optional fields
- [ ] Template emoji and visual design
- [ ] Linking to external resources (discussions, docs)

**Validation**: Templates render correctly in GitHub UI, required fields enforced

---

### Milestone 7: GitHub Pull Request Template (1 artifact)
**Success Criteria**: PR checklist ensures quality and completeness

**Artifacts:**
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` - Description, related issues, change type, testing checklist, docs updated, breaking changes

**Best Practices Research:**
- [ ] PR template patterns from high-velocity projects
- [ ] Checklist items for quality assurance
- [ ] Semantic PR titles and conventional commits

**Validation**: Template appears on PR creation, checklist items functional

---

### Milestone 8: GitHub Community Files (3 artifacts)
**Success Criteria**: GitHub community features configured

**Artifacts:**
- [ ] `.github/CODEOWNERS` - Auto-assign reviewers by file path patterns
- [ ] `.github/FUNDING.yml` - GitHub Sponsors, Open Collective, Patreon links
- [ ] `.github/release.yml` - Release notes configuration and automation

**Best Practices Research:**
- [ ] CODEOWNERS syntax and team assignment
- [ ] Funding platform options and best practices
- [ ] Automated release notes generation

**Validation**: CODEOWNERS correctly assigns reviewers, funding button appears, release notes generate correctly

---

### Milestone 9: GitHub Workflows - Testing (1 artifact)
**Success Criteria**: Automated testing on every PR

**Artifacts:**
- [ ] `.github/workflows/test.yml` - Run tests on PR, multiple Node.js/Python/Go versions, code coverage reporting

**Best Practices Research:**
- [ ] GitHub Actions security hardening (pinned versions, minimal permissions)
- [ ] Matrix testing across language versions
- [ ] Code coverage integration (Codecov, Coveralls)
- [ ] Caching strategies for faster CI

**Validation**: Workflow runs successfully, test results reported, coverage tracked

---

### Milestone 10: GitHub Workflows - Build (1 artifact)
**Success Criteria**: Automated build validation

**Artifacts:**
- [ ] `.github/workflows/build.yml` - Build project, create artifacts, validate compilation

**Best Practices Research:**
- [ ] Build artifact storage and retention
- [ ] Multi-platform builds (Linux, macOS, Windows)
- [ ] Docker image building in CI

**Validation**: Build succeeds, artifacts available for download

---

### Milestone 11: GitHub Workflows - Release (1 artifact)
**Success Criteria**: Automated release process with semantic versioning

**Artifacts:**
- [ ] `.github/workflows/release.yml` - Semantic release, changelog generation, artifact publishing, Docker image push

**Best Practices Research:**
- [ ] Semantic versioning automation (semantic-release)
- [ ] Changelog generation from commits
- [ ] Multi-platform artifact publishing
- [ ] Container image signing (Cosign)

**Validation**: Release workflow creates GitHub release, publishes artifacts, updates changelog

---

### Milestone 12: GitHub Workflows - Security (1 artifact)
**Success Criteria**: OpenSSF Scorecard for security posture

**Artifacts:**
- [ ] `.github/workflows/scorecard.yml` - OpenSSF Scorecard analysis, security best practices validation

**Best Practices Research:**
- [ ] OpenSSF Scorecard checks and scoring
- [ ] Security best practices for GitHub repositories
- [ ] SLSA provenance generation

**Validation**: Scorecard runs successfully, score reported, security recommendations provided

---

### Milestone 13: GitHub Automation (3 artifacts)
**Success Criteria**: Automated dependency updates and issue management

**Artifacts:**
- [ ] `.github/dependabot.yml` - Automated dependency updates for language package managers and GitHub Actions
- [ ] `.github/labeler.yml` - Auto-label PRs based on changed files
- [ ] `.github/stale.yml` - Auto-close stale issues/PRs after inactivity period

**Best Practices Research:**
- [ ] Dependabot configuration for security vs feature updates
- [ ] Label taxonomy and automation
- [ ] Stale issue policies and community impact

**Validation**: Dependabot creates PRs, labels applied automatically, stale issues marked correctly

---

### Milestone 14: Container Configuration (3 artifacts)
**Success Criteria**: Production-ready container images with best practices

**Artifacts:**
- [ ] `Dockerfile` - Multi-stage build, non-root user, minimal base image (distroless/alpine), security scanning
- [ ] `.dockerignore` - Exclude build artifacts, dependencies, secrets from Docker context
- [ ] `docker-compose.yml` - Local development environment with dependencies (databases, caches, etc.)

**Best Practices Research:**
- [ ] Multi-stage Docker builds for size optimization
- [ ] Distroless vs Alpine vs Ubuntu base images
- [ ] Non-root user execution for security
- [ ] Layer caching strategies
- [ ] Docker security scanning (Trivy, Snyk)

**Validation**: Dockerfile builds successfully, image size optimized, security scan passes, container runs as non-root

---

### Milestone 15: Version Control Configuration (2 artifacts)
**Success Criteria**: Project ignores and editor consistency configured

**Artifacts:**
- [ ] `.gitignore` - Language-specific ignores (node_modules, __pycache__, build artifacts), OS ignores, IDE ignores, secrets patterns
- [ ] `.editorconfig` - Indentation, line endings, charset consistency across editors

**Best Practices Research:**
- [ ] GitHub official .gitignore templates
- [ ] Secrets detection patterns
- [ ] EditorConfig specification
- [ ] Multi-language project ignore patterns

**Validation**: .gitignore prevents committed artifacts, .editorconfig enforced by editors

---

### Milestone 16: Version Management Files (4 artifacts)
**Success Criteria**: Language runtime versions locked for consistency

**Artifacts:**
- [ ] `.nvmrc` or `.node-version` - Node.js version specification for nvm/volta/fnm
- [ ] `.python-version` - Python version for pyenv
- [ ] `.ruby-version` - Ruby version for rbenv/rvm
- [ ] `.go-version` - Go version for gvm/goenv

**Best Practices Research:**
- [ ] Version pinning vs range specifications
- [ ] LTS vs latest versions
- [ ] Version manager compatibility

**Validation**: Version files specify supported runtime versions, CI uses pinned versions

---

### Milestone 17: Node.js/TypeScript Configuration (7 artifacts)
**Success Criteria**: Complete TypeScript project setup with quality tooling

**Artifacts:**
- [ ] `package.json` - Enhancement/validation (scripts, engines, dependencies structure)
- [ ] `tsconfig.json` - Strict mode, module resolution, target based on Node version
- [ ] `.npmignore` - Files to exclude from npm package
- [ ] `.npmrc` - npm configuration (registry, save-exact, etc.)
- [ ] `jest.config.js` or `vitest.config.ts` - Test configuration with coverage
- [ ] `.eslintrc` or `eslint.config.js` - Linting rules (Airbnb, Standard, etc.)
- [ ] `.prettierrc` - Code formatting configuration

**Best Practices Research:**
- [ ] TypeScript strict mode benefits and migration
- [ ] ESLint flat config (eslint.config.js) vs legacy
- [ ] Prettier integration with ESLint
- [ ] Jest vs Vitest for modern TypeScript
- [ ] Package.json best practices (engines, type: module)

**Validation**: TypeScript compiles, tests run, linting passes, formatting consistent

---

### Milestone 18: Python Configuration (6 artifacts)
**Success Criteria**: Modern Python project setup with tooling

**Artifacts:**
- [ ] `pyproject.toml` - PEP 518/621 project metadata, tool configurations (Black, mypy, ruff)
- [ ] `requirements.txt` - Production dependencies
- [ ] `requirements-dev.txt` - Development dependencies
- [ ] `Pipfile` - Alternative dependency management (Pipenv)
- [ ] `pytest.ini` - pytest configuration
- [ ] `.pylintrc` - Pylint linting rules

**Best Practices Research:**
- [ ] pyproject.toml vs setup.py migration
- [ ] Poetry vs pip-tools vs Pipenv
- [ ] Black, Ruff, mypy configuration
- [ ] pytest best practices and plugins
- [ ] Type hints and mypy strict mode

**Validation**: Python project installs cleanly, tests run, type checking passes, linting passes

---

### Milestone 19: Go Configuration (4 artifacts)
**Success Criteria**: Go project with standard layout and tooling

**Artifacts:**
- [ ] `go.mod` - Enhancement/validation (Go version, dependencies)
- [ ] `go.sum` - Enhancement/validation (dependency checksums)
- [ ] `Makefile` - Build automation (build, test, lint, install)
- [ ] `.golangci.yml` - golangci-lint configuration with recommended linters

**Best Practices Research:**
- [ ] Go project layout standard
- [ ] go.mod minimum Go version selection
- [ ] Makefile patterns for Go projects
- [ ] golangci-lint recommended linters
- [ ] Go module best practices

**Validation**: Go project builds, tests pass, linting passes, make targets functional

---

### Milestone 20: Rust Configuration (2 artifacts)
**Success Criteria**: Rust project with Cargo configuration

**Artifacts:**
- [ ] `Cargo.toml` - Package manifest with metadata, dependencies
- [ ] `Cargo.lock` - Dependency lock file

**Best Practices Research:**
- [ ] Cargo.toml best practices
- [ ] Workspace configuration for monorepos
- [ ] Rust edition selection
- [ ] Clippy linting configuration

**Validation**: Cargo build succeeds, tests pass, clippy linting passes

---

### Milestone 21: Code Quality & Git Hooks (3 artifacts)
**Success Criteria**: Automated pre-commit validation

**Artifacts:**
- [ ] `.husky/` - Git hooks setup (pre-commit, commit-msg, pre-push)
- [ ] `.pre-commit-config.yaml` - Pre-commit framework configuration
- [ ] `.coveragerc` - Code coverage configuration and thresholds

**Best Practices Research:**
- [ ] Husky vs pre-commit framework
- [ ] Pre-commit hook best practices (speed, skip options)
- [ ] Conventional commits validation
- [ ] Code coverage thresholds (80%? 90%?)

**Validation**: Git hooks install automatically, pre-commit runs linting/tests, coverage tracked

---

### Milestone 22: Kubernetes Manifests (5 artifacts)
**Success Criteria**: Production-ready Kubernetes deployment configuration

**Artifacts:**
- [ ] `k8s/deployment.yaml` - Deployment with resource limits, health checks, security context
- [ ] `k8s/service.yaml` - Service (ClusterIP, LoadBalancer, or NodePort)
- [ ] `k8s/ingress.yaml` - Ingress with TLS configuration
- [ ] `k8s/configmap.yaml` - ConfigMap template for application configuration
- [ ] `kustomization.yaml` - Kustomize overlay structure (base, overlays for dev/staging/prod)

**Best Practices Research:**
- [ ] Kubernetes production readiness checklist
- [ ] Resource requests and limits sizing
- [ ] Liveness, readiness, startup probes
- [ ] Pod security standards (restricted profile)
- [ ] Kustomize vs Helm decision matrix

**Validation**: Manifests pass kubectl validation, security context enforced, health checks configured

---

### Milestone 23: Helm Charts (3 artifacts)
**Success Criteria**: Helm chart for flexible Kubernetes deployments

**Artifacts:**
- [ ] `helm/Chart.yaml` - Chart metadata (version, appVersion, dependencies)
- [ ] `helm/values.yaml` - Default values with comprehensive comments
- [ ] `helm/templates/` - Template directory structure (deployment, service, ingress, etc.)

**Best Practices Research:**
- [ ] Helm chart best practices (official guide)
- [ ] values.yaml organization and documentation
- [ ] Chart versioning and semantic versioning
- [ ] Chart testing (helm lint, chart-testing)

**Validation**: Helm chart installs successfully, templates render correctly, values documented

---

### Milestone 24: GitOps - Argo CD (2 artifacts)
**Success Criteria**: Argo CD application configuration

**Artifacts:**
- [ ] `argocd/application.yaml` - Argo CD Application resource with sync policies
- [ ] `argocd/` - Directory structure for multi-environment applications (dev, staging, prod)

**Best Practices Research:**
- [ ] Argo CD application patterns (app of apps, applicationsets)
- [ ] Sync policies and automated sync
- [ ] Health checks and custom resource definitions
- [ ] Repository structure (monorepo vs repo-per-app)

**Validation**: Application syncs successfully, health status reported, automated sync functions

---

### Milestone 25: GitOps - Flux (2 artifacts)
**Success Criteria**: Flux kustomization configuration

**Artifacts:**
- [ ] `flux/kustomization.yaml` - Flux Kustomization resource with interval, prune, health checks
- [ ] `flux/` - Directory structure for Flux resources (GitRepository, Kustomization, HelmRelease)

**Best Practices Research:**
- [ ] Flux bootstrap patterns
- [ ] Kustomization vs HelmRelease
- [ ] Notification and alerting configuration
- [ ] Multi-cluster management

**Validation**: Flux reconciles successfully, resources deployed, notifications configured

---

### Milestone 26: Terraform Configuration (5 artifacts)
**Success Criteria**: Terraform module structure with best practices

**Artifacts:**
- [ ] `main.tf` - Main infrastructure definitions
- [ ] `variables.tf` - Input variables with descriptions and validation
- [ ] `outputs.tf` - Output values for integration
- [ ] `terraform.tfvars.example` - Example variable values (do not commit actual tfvars)
- [ ] `.terraform-docs.yml` - terraform-docs configuration for documentation generation

**Best Practices Research:**
- [ ] Terraform module structure standards
- [ ] Variable naming conventions
- [ ] State management (remote backend configuration)
- [ ] terraform-docs for automated documentation
- [ ] Terraform linting (tflint)

**Validation**: terraform validate passes, terraform plan succeeds, documentation generates

---

### Milestone 27: Crossplane Configuration (2 artifacts)
**Success Criteria**: Crossplane composition and XRD

**Artifacts:**
- [ ] `crossplane/composition.yaml` - Crossplane Composition for infrastructure provisioning
- [ ] `crossplane/xrd.yaml` - Composite Resource Definition (XRD) schema

**Best Practices Research:**
- [ ] Crossplane composition patterns
- [ ] XRD schema design and versioning
- [ ] Provider configuration references
- [ ] Patch and transform functions

**Validation**: XRD installs successfully, composition creates resources, patching functions correctly

---

### Milestone 28: Security & Compliance (4 artifacts)
**Success Criteria**: Security scanning and compliance tooling configured

**Artifacts:**
- [ ] `.snyk` - Snyk configuration for vulnerability scanning
- [ ] `trivy.yaml` - Trivy configuration for container/IaC scanning
- [ ] `.gitleaks.toml` - Gitleaks configuration for secrets detection
- [ ] `SBOM.json` or `SBOM.spdx` - Software Bill of Materials generation configuration

**Best Practices Research:**
- [ ] OWASP dependency scanning best practices
- [ ] Container image security scanning (Trivy, Grype)
- [ ] Secrets detection (Gitleaks, TruffleHog)
- [ ] SBOM formats (SPDX, CycloneDX)
- [ ] OpenSSF Scorecard integration

**Validation**: Security scans run successfully, no critical vulnerabilities, secrets detection functional

---

### Milestone 29: Documentation Directories (5 artifacts)
**Success Criteria**: Structured documentation directory hierarchy

**Artifacts:**
- [ ] `docs/` - Main documentation directory with README
- [ ] `docs/architecture/` - Architecture diagrams, ADRs, design documents
- [ ] `docs/api/` - API documentation (OpenAPI, GraphQL schemas)
- [ ] `docs/guides/` - User guides, tutorials, how-tos
- [ ] `docs/examples/` - Example code, usage patterns, sample configurations

**Best Practices Research:**
- [ ] Documentation structure patterns (Diátaxis framework)
- [ ] Architecture Decision Records (ADR) format
- [ ] API documentation generation tools
- [ ] Documentation site generators (MkDocs, Docusaurus, Hugo)

**Validation**: Directory structure created, README files explain organization, documentation navigable

---

### Milestone 30: Best Practices Documentation System
**Success Criteria**: Comprehensive best practices reference for each artifact category

**Deliverables:**
- [ ] `src/templates/best-practices/governance.md` - Governance file standards and sources
- [ ] `src/templates/best-practices/docker.md` - Container best practices
- [ ] `src/templates/best-practices/ci-cd.md` - CI/CD security and efficiency
- [ ] `src/templates/best-practices/kubernetes.md` - K8s manifest standards
- [ ] `src/templates/best-practices/code-quality.md` - Linting, testing, formatting
- [ ] `src/templates/best-practices/security.md` - Security scanning and compliance
- [ ] `src/templates/best-practices/gitops.md` - GitOps patterns and structure
- [ ] `src/templates/best-practices/iac.md` - Infrastructure as Code best practices
- [ ] Template versioning system with metadata and changelog

**Validation**: Each best practices document includes authoritative sources, rationale, examples, anti-patterns

---

### Milestone 31: Validation & Compliance Checking
**Success Criteria**: Automated validation against industry standards

**Deliverables:**
- [ ] CNCF Sandbox requirements validator
- [ ] OpenSSF Scorecard integration
- [ ] File format validation (YAML, JSON, TOML)
- [ ] Link checking for documentation
- [ ] License compatibility checker
- [ ] Security policy completeness check
- [ ] Compliance scoring and reporting

**Validation**: Validation reports accurate, recommendations actionable, compliance score calculated

---

### Milestone 32: Integration Testing & Documentation
**Success Criteria**: Comprehensive testing and user documentation

**Deliverables:**
- [ ] Integration tests for audit mode across project types
- [ ] Integration tests for new repository creation
- [ ] Template generation tests for all 90 artifacts
- [ ] Validation engine tests
- [ ] User documentation (how to use the tool)
- [ ] Template contribution guide
- [ ] Best practices update process

**Validation**: All tests pass, documentation clear and complete, contribution process documented

---

## Timeline

### Phase 1: Core Infrastructure (Weeks 1-2)
- Milestone 1: Core tool infrastructure
- Milestone 30: Best practices documentation system (foundation)

### Phase 2: Governance & Community (Weeks 3-4)
- Milestone 2: Legal & licensing
- Milestone 3: Core governance
- Milestone 4: Community & support
- Milestone 5: Documentation

**Use tool on this repository to generate governance for PRD #173**

### Phase 3: GitHub Infrastructure (Weeks 5-6)
- Milestone 6-8: Issue templates, PR template, community files
- Milestone 9-12: GitHub workflows (test, build, release, security)
- Milestone 13: GitHub automation

### Phase 4: Development Infrastructure (Weeks 7-8)
- Milestone 14-15: Container and version control config
- Milestone 16: Version management files
- Milestone 17-20: Language-specific configurations (TypeScript, Python, Go, Rust)
- Milestone 21: Code quality & git hooks

### Phase 5: Cloud Native & GitOps (Weeks 9-10)
- Milestone 22-23: Kubernetes and Helm
- Milestone 24-25: GitOps (Argo CD, Flux)
- Milestone 26-27: Infrastructure as Code (Terraform, Crossplane)

### Phase 6: Security & Validation (Weeks 11-12)
- Milestone 28: Security & compliance
- Milestone 29: Documentation directories
- Milestone 31: Validation & compliance checking
- Milestone 32: Integration testing & documentation

**Total Timeline**: 12 weeks (3 months) from start to full feature completion

**Note**: Milestones 2-5 (governance) can be prioritized and completed in 2 weeks to immediately support PRD #173 CNCF submission.

---

## Risks and Mitigations

### Risk: Template Maintenance Overhead
**Impact**: High - Outdated templates reduce tool value
**Likelihood**: High - Best practices evolve constantly
**Mitigation**:
- Establish quarterly review cycle for templates
- Monitor authoritative sources (CNCF, OpenSSF) for updates
- Community contributions for template improvements
- Automated checks for outdated dependencies in CI/CD templates
- Version templates to track evolution

### Risk: Template Customization vs Standardization Tension
**Impact**: Medium - Users may want heavy customization, reducing standardization benefits
**Likelihood**: Medium - Different projects have different needs
**Mitigation**:
- Provide sensible defaults that work for 80% of cases
- Allow template overrides for advanced users
- Support multiple template "flavors" (minimal, standard, comprehensive)
- Clear documentation on when to customize vs accept defaults

### Risk: Language/Framework Coverage Expansion
**Impact**: Medium - Pressure to support many languages increases complexity
**Likelihood**: High - Users will request additional language support
**Mitigation**:
- Start with top 4 languages (TypeScript, Python, Go, Rust)
- Modular template system allows easy addition
- Community-contributed templates for niche languages
- Focus on quality over breadth initially

### Risk: Auto-Detection Accuracy
**Impact**: Medium - Incorrect project type detection leads to wrong artifacts
**Likelihood**: Medium - Edge cases and monorepos are complex
**Mitigation**:
- Multi-signal detection (package files, directory structure, git history)
- Always allow user override of detected type
- Clear confidence scoring shown to user
- Fallback to interactive questions when detection uncertain

### Risk: Generated File Conflicts in Existing Repos
**Impact**: None - Risk eliminated by design
**Likelihood**: None - Tool only generates missing files
**Resolution**:
- Tool follows "gap-based generation" pattern
- Only creates files that don't exist
- Never attempts to update existing files
- Client scans and reports existing files in analysis stage
- MCP filters out existing files before generation

### Risk: Template Quality Variability
**Impact**: High - Poor quality templates reflect badly on tool
**Likelihood**: Low - Can control with review process
**Mitigation**:
- Rigorous template review process
- Templates based on authoritative sources with citations
- Integration tests validate template quality
- Community feedback loop for template improvements
- Regular audits of generated file quality

### Risk: Client-MCP Communication Overhead
**Impact**: Medium - Multiple round trips could slow workflow
**Likelihood**: Low - Session state minimizes overhead
**Mitigation**:
- Session management keeps context between stages
- Batch operations where possible (return all missing files at once)
- Clear stage transitions minimize user confusion
- Client can cache discovery results for same scope/project
- Discovery stage returns comprehensive file list in one call
- Analysis stage processes all gaps in single response

---

## Alternatives Considered

### Alternative 1: Manual Template Repository (cookiecutter-style)
**Pros**: Simple to implement, users understand git-based templates, easy to customize
**Cons**: No AI intelligence, no audit mode, static templates, no validation, manual process
**Decision**: Rejected - Doesn't leverage AI capabilities or provide audit functionality

### Alternative 2: GitHub Template Repositories
**Pros**: Native GitHub integration, one-click repository creation, easy to use
**Cons**: Static templates only, no customization, no audit mode, can't add to existing repos
**Decision**: Rejected - Too limited, doesn't solve existing repository problem

### Alternative 3: Yeoman-style Generator CLI
**Pros**: Established pattern, interactive CLI, template ecosystem
**Cons**: No AI intelligence, requires npm installation, no cloud native focus, no validation
**Decision**: Rejected - Doesn't differentiate from existing tools or leverage AI

### Alternative 4: Extend Existing MCP Tool (recommend)
**Pros**: Reuses existing infrastructure, single tool interface
**Cons**: Different domain (deployment vs project setup), conflates concerns, harder to maintain
**Decision**: Rejected - Better as separate focused tool, different workflow and use cases

### Alternative 5: External Service/SaaS
**Pros**: Can maintain templates centrally, easy updates, analytics on usage
**Cons**: Requires external dependency, privacy concerns, not self-hosted, latency
**Decision**: Rejected - Conflicts with self-hosted DevOps AI Toolkit philosophy

---

## Dependencies

### Upstream Dependencies
- **GitHub API**: For repository creation, PR generation (optional features)
- **Template Sources**: CNCF, OpenSSF, Contributor Covenant availability
- **Language Ecosystems**: npm, PyPI, crates.io for version information
- **Validation Tools**: kubectl, helm, terraform for validation

### Internal Dependencies
- **MCP Server Framework**: Tool registration and workflow engine
- **Claude AI Integration**: For intelligent question generation and template customization
- **File System Access**: Read/write repository files
- **Git Integration**: Create commits, branches, PRs (optional)

### Blocking Dependencies
- **Milestone 1 (Core Infrastructure)**: Blocks all other milestones
- **Best Practices Research**: Must complete before template creation for each category
- **Template System**: Must exist before artifact generation milestones

---

## Success Metrics

### Immediate Success (4 weeks)
- [ ] Tool operational for governance artifacts (Milestones 1-5)
- [ ] Successfully used on dot-ai repository for PRD #173 CNCF submission
- [ ] Governance setup time reduced from 40+ hours to <30 minutes
- [ ] CNCF Sandbox validation passes (all required files present and valid)

### Short-term Success (3 months)
- [ ] All 90 artifact types implemented and tested
- [ ] 10+ repositories (internal or external) use tool for setup/audit
- [ ] 90%+ user satisfaction with generated artifacts (survey)
- [ ] Zero critical bugs in artifact generation
- [ ] Documentation complete with examples for each artifact type

### Medium-term Success (6 months)
- [ ] 50+ repositories use tool
- [ ] 5+ community-contributed template improvements merged
- [ ] Template update process established with quarterly reviews
- [ ] Tool featured in DevOps AI Toolkit demos and documentation
- [ ] Average OpenSSF Scorecard improvement: +20% for audited repos

### Long-term Success (12 months)
- [ ] 200+ repositories use tool
- [ ] Tool referenced in CNCF blog post or presentation
- [ ] Template ecosystem expanded to 10+ languages
- [ ] Integration with GitHub Apps for automated repo auditing
- [ ] Documented case studies of CNCF submissions using tool

---

## Open Questions

1. **Template Licensing**: What license should templates carry? (MIT to match project?)

2. **Customization Depth**: How much customization should tool support vs enforcing standards?

3. **Validation Strictness**: Should validation be blocking (prevent file generation) or warning-only?

4. ~~**Git Integration**: Should tool automatically commit changes or leave to user?~~ **RESOLVED**: Leave to client/user - MCP cannot access git. Client handles commits and PRs using its own tools.

5. ~~**GitHub API**: Should tool create repositories via GitHub API or assume git init locally?~~ **RESOLVED**: Out of scope for MCP - client handles repository operations.

6. **Multi-repo Support**: Should tool support auditing multiple repositories in one organization?

7. **Template Distribution**: Should templates be embedded in tool or fetched from external source?

8. **Community Templates**: How to accept and validate community-contributed templates?

9. **Private Repository Support**: Any special handling for private vs public repositories? **NOTE**: MCP never accesses repositories directly, so no special handling needed.

10. **Language Priority**: Which language configs to implement first beyond TypeScript, Python, Go, Rust?

---

## Progress Log

### 2025-10-23: Milestone 1 Complete - Core Tool Infrastructure
**Duration**: ~3-4 hours (based on conversation timestamps)
**Commits**: Multiple implementation commits
**Primary Focus**: Core workflow implementation and integration testing

**Completed PRD Items (Milestone 1)**:
- ✅ MCP tool definition and handler registered in `src/interfaces/mcp.ts` (projectSetup tool)
- ✅ Workflow engine with stage-based routing (`src/tools/project-setup.ts`)
- ✅ Discovery handler loading config-based file/question lists (`src/tools/project-setup/discovery.ts`)
- ✅ ReportScan handler with two-phase workflow: report → file selection → questions (`src/tools/project-setup/report-scan.ts`)
- ✅ GenerateFile handler with iterative file-by-file generation and completion tracking (`src/tools/project-setup/generate-file.ts`)
- ✅ Session management using GenericSessionManager with files map tracking (`proj-*` prefix)
- ✅ Template loading system with Handlebars integration (extended `shared-prompt-loader.ts`)
- ✅ README.md template with conditional sections (e.g., `{{#if licenseName}}`)
- ✅ Integration tests: 7 tests covering discovery, reportScan, generateFile, error handling (all passing in 428ms with `--no-cluster` mode)
- ✅ Manual workflow validation (full end-to-end test successful in separate Claude Code session)

**Additional Work Done**:
- Extended `shared-prompt-loader.ts` to support custom directories (`baseDir`) and Handlebars templating
- Added `--no-cluster` flag to test runner script for lightweight tests (skips K8s cluster and Qdrant setup)
- Updated `CLAUDE.md` with lightweight testing workflow documentation
- Improved UX: numbered questions with IDs for user convenience, clear instructions for MCP responses
- Type definitions: Created comprehensive types in `src/tools/project-setup/types.ts`

**Technical Decisions**:
- Used files map with status field (`excluded`, `pending`, `in-progress`, `done`) instead of multiple arrays for cleaner state tracking
- Two-phase reportScan: first call shows report for user selection, second call initializes workflow with questions
- Three-mode generateFile: (1) generate with answers, (2) mark complete and move to next, (3) detect completion
- Handlebars for professional templating with conditionals instead of custom template logic
- Lightweight test runner mode for tools that don't require Kubernetes infrastructure

**Current Limitations / Deferred Items**:
- File registry only supports README.md (discovery-config.json has limited scope)
- No audit vs new mode distinction yet (both work the same way currently)
- Basic validation framework not implemented (deferred to future milestone)
- Multiple scopes (governance, docker, ci-cd, etc.) not yet supported

**Next Session Priorities (Milestone 2)**:
- Expand discovery-config.json with LICENSE template
- Add CONTRIBUTING.md template
- Implement GitHub Actions workflow templates (.github/workflows/)
- Build template validation system
- Expand to full governance scope with multiple file types

### 2025-10-23 (PM) - Architectural Design Decisions
- **MCP Constraint Identified**: MCP servers cannot write files directly (remote/sandboxed operation)
- **Workflow Redesign**: Implemented three-stage workflow (Discovery → Analysis → Generation)
- **Gap-Based Generation**: Tool only generates missing files, never overwrites existing ones
- **Client-MCP Separation**: MCP provides logic and data, client handles I/O (scanning, writing)
- **API Updates**: Redesigned tool interface with `stage`, `existingFiles`, `projectInfo` parameters
- **Resolved Questions**: Git integration and GitHub API questions answered (client responsibility)
- **Risk Eliminated**: File conflict risk resolved through gap-based generation pattern
- **Integration Testing**: Added mandatory integration testing requirements to all milestones

**Key Technical Changes**:
- Discovery stage returns file checklist for client to scan
- Analysis stage receives client-provided file inventory and identifies gaps
- Generation stage returns file data structures (never writes)
- Session management enables workflow resumption across stages

### 2025-10-23 (AM) - Initial PRD Creation
- **PRD Creation**: Comprehensive PRD drafted with 90 artifacts across 32 milestones
- **Scope Definition**: Two operation modes (audit, new), best practices integration, validation framework
- **Immediate Use Case**: Tool will be used on dot-ai repository to generate governance for PRD #173
- **Timeline**: 12-week implementation plan with governance artifacts prioritized for weeks 3-4

---

## Additional Context

### Why This Tool Matters

**Solves Immediate Need (PRD #173)**: Generates all governance documents needed for CNCF Sandbox submission in <30 minutes instead of 40+ hours of manual work.

**Reusable Asset**: Every new project and existing project benefits, not just this repository. Demonstrates DevOps AI Toolkit value beyond Kubernetes deployment.

**Marketing Differentiator**: Shows AI-powered DevOps automation in action. Great demo for CNCF submission itself: "We built a tool that helps other projects prepare for CNCF too."

**Community Value**: Lowers barrier to proper governance, helping entire open source ecosystem create better-structured projects.

**Extensible Platform**: Foundation for future project lifecycle management features (PRD #4: Application Lifecycle Management).

### Strategic Value

**For DevOps AI Toolkit**: Demonstrates breadth of AI-powered DevOps automation, validates product vision beyond deployment, creates second "killer feature."

**For Users**: Eliminates setup overhead, ensures best practices, accelerates project launch, improves project health and sustainability.

**For Ecosystem**: Raises quality bar for open source projects, standardizes governance and structure, increases CNCF Sandbox-ready projects.

---

## References

- [CNCF Sandbox Application Process](https://github.com/cncf/sandbox)
- [OpenSSF Best Practices Badge](https://bestpractices.coreinfrastructure.org/)
- [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/)
- [OpenSSF Security Policy Template](https://github.com/ossf/security-policy-template)
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Issue Templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Kubernetes Production Best Practices](https://learnk8s.io/production-best-practices)
- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
- [Architecture Decision Records](https://adr.github.io/)
- [Diátaxis Documentation Framework](https://diataxis.fr/)

---

**Next Steps**: Begin Milestone 1 (Core Tool Infrastructure) to establish foundation for all artifact generation.
