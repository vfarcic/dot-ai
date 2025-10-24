# PRD #177: Project Setup & Governance Tool (MCP)

**GitHub Issue**: [#178](https://github.com/vfarcic/dot-ai/issues/178)
**Status**: In Progress - Milestone 8 Complete
**Priority**: High
**Created**: 2025-10-23
**Last Updated**: 2025-10-24 (Milestone 8: GitHub Community Files + Scope-Based Refactoring)

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

### Decision 4: Skip Documentation Artifacts Milestone (2025-10-23)
**Rationale**: Documentation artifacts (README.md enhancement, ARCHITECTURE.md, DEVELOPMENT.md, RELEASE.md, TROUBLESHOOTING.md) require project-specific content that cannot be meaningfully templated. Unlike governance and legal files that follow industry standards, technical documentation is unique to each project.

**Impact**:
- Milestone 5 removed from project scope
- Total artifact count: 85+ (reduced from 90+)
- Focus maintained on standardized, process-based files where templating adds real value
- Timeline reduced by 1-1.5 weeks

**Reasoning**: Our tool's value comes from generating standardized governance, legal, and infrastructure files. Project-specific documentation (architecture details, troubleshooting guides) requires domain knowledge that generic templates cannot provide. Generic templates like "Describe your architecture here" provide zero value to users.

---

### Decision 5: Scope-Based Generation (2025-10-24)
**Rationale**: The original file-by-file workflow (`generateFile`) required multiple round-trips for files in the same scope, asking the same questions repeatedly. Scope-based generation (`generateScope`) collects ALL questions for a scope upfront, then generates ALL files in that scope in a single API call.

**Impact**:
- Better UX: User answers questions once per scope instead of per file
- More efficient: Single API call generates multiple related files
- Simpler state management: No need to track file-by-file completion
- Bug fix: Conditional-only files (NOTICE, FUNDING.yml) now properly included in generation pipeline

**Implementation**:
- `generateScope` replaces `generateFile` handler
- `report-scan.ts` returns ALL questions for selected scope at once
- Conditional files logic enhanced to handle files that exist only in `conditionalFiles` (not in base `files` array)
- Integration tests rewritten to validate scope-based workflow (14 tests, all passing)

**Benefits**:
- Reduces user interaction steps by 60-80% for multi-file scopes
- Eliminates redundant questions across related files
- More intuitive workflow matches user mental model
- Cleaner code architecture with simpler state management

---

## Problem Statement

Every software project needs proper governance documentation, development infrastructure, and best practices configuration, but creating these artifacts from scratch is time-consuming, error-prone, and requires deep knowledge of current best practices across multiple domains.

### Current State
- **New Projects**: Developers start with minimal structure (README, LICENSE), missing critical governance and community files
- **Existing Projects**: Many lack proper governance documentation, blocking CNCF submissions and enterprise adoption
- **Best Practices Gap**: Keeping up with evolving best practices across governance, security, CI/CD, containers, and cloud native is challenging
- **Manual Process**: Creating 85+ configuration files manually is tedious and inconsistent across projects
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

**85+ Artifact Coverage:**
- Legal & licensing (LICENSE, NOTICE)
- Governance (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, MAINTAINERS, GOVERNANCE, ROADMAP)
- Community (SUPPORT, ADOPTERS)
- GitHub infrastructure (issue templates, workflows, automation)
- Container configuration (Dockerfile, docker-compose)
- Code quality (linting, formatting, testing configs)
- Language-specific configs (Node.js, Python, Go, Rust)
- Kubernetes manifests and Helm charts
- GitOps (Argo CD, Flux)
- Infrastructure as Code (Terraform, Crossplane)
- Security & compliance (scanning configs, SBOM)
- Documentation directories (structured docs/ hierarchy)

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
- [ ] Generates all 85+ artifact types with best practices applied (documentation artifacts excluded - project-specific content)
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

**Handlebars Helpers (CRITICAL - Always Use These):**

Templates use Handlebars with custom helpers registered in `src/core/shared-prompt-loader.ts`:

1. **`{{#isTrue variableName}}...{{/isTrue}}`** - Use this for ALL boolean conditionals
   - Handles user inputs that can be "yes", "no", "true", "false", or boolean true/false
   - **NEVER use** `{{#if variableName}}` for user-provided boolean values
   - Example:
     ```handlebars
     {{#isTrue useTeams}}
     * @{{githubOrg}}/{{defaultTeam}}
     {{else}}
     * {{maintainerUsername}}
     {{/isTrue}}
     ```

2. **`{{#eq a b}}...{{/eq}}`** - Use for equality comparisons
   - Compares two values for equality
   - Example:
     ```handlebars
     {{#eq licenseType "Apache-2.0"}}
     NOTICE file content here
     {{/eq}}
     ```

3. **`{{#each array}}...{{/each}}`** - Built-in Handlebars iterator
   - Use `{{this}}` to reference current item
   - Example:
     ```handlebars
     {{#each maintainerUsernames}}@{{this}} {{/each}}
     ```

**Why `isTrue` Instead of `if`:**
User answers from questions can be strings ("yes"/"no") or booleans (true/false) depending on the client. The `isTrue` helper normalizes all truthy values ("yes", "true", true) for consistent behavior. Using standard Handlebars `{{#if}}` will fail for string values like "no" (which is truthy in JavaScript).

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

### Milestone 2: Legal & Licensing Artifacts ✅
**Success Criteria**: All legal/licensing files generated with appropriate templates

**Artifacts:**
- [x] `LICENSE` or `LICENSE.md` - Auto-detect existing or prompt for license type (MIT, Apache-2.0, GPL-3.0, BSD-3-Clause)
- [x] `NOTICE` - Attribution file for Apache license or third-party code inclusion
- [x] `COPYRIGHT` - **REMOVED** - User decision: Copyright statement redundant since included in LICENSE

**Best Practices Research:**
- [x] Document license compatibility matrix
- [x] CNCF acceptable licenses
- [x] Attribution requirements for common licenses
- [x] When NOTICE vs COPYRIGHT is needed

**Validation**: ✅ Complete - Apache 2.0 generates LICENSE + NOTICE, other licenses generate LICENSE only. Template supports 4 CNCF-acceptable licenses with Handlebars conditionals.

---

### Milestone 3: Core Governance Artifacts (6 artifacts) ✅
**Success Criteria**: Complete governance documentation meeting CNCF Sandbox requirements

**Artifacts:**
- [x] `CONTRIBUTING.md` - Development workflow, PR process, coding standards, testing requirements
- [x] `CODE_OF_CONDUCT.md` - Contributor Covenant v2.1 with customized enforcement contacts
- [x] `SECURITY.md` - Vulnerability reporting process following OpenSSF template
- [x] `MAINTAINERS.md` - Maintainer list with roles, responsibilities, and succession process
- [x] `GOVERNANCE.md` - Decision-making process, voting, conflict resolution
- [x] `ROADMAP.md` - 6-12 month vision with short/medium/long-term goals

**Best Practices Research:**
- [x] CNCF governance best practices from graduated projects
- [x] Contributor Covenant adoption and customization guide
- [x] OpenSSF vulnerability disclosure best practices
- [x] Roadmap formats and update cadences

**Validation**: ✅ Complete - All files exist, CNCF Sandbox checklist passes, templates include 25+ configurable variables

---

### Milestone 4: Community & Support Artifacts (2 artifacts) ✅
**Success Criteria**: Community engagement infrastructure operational

**Artifacts:**
- [x] `SUPPORT.md` - How to get help, where to ask questions, response time expectations
- [x] `ADOPTERS.md` - Template for organizations/users to list themselves, contribution instructions
- ~~`CHANGELOG.md`~~ - **REMOVED** - Deferred to Milestone 11 (GitHub Releases serve as primary changelog per modern CNCF standard)

**Best Practices Research:**
- [x] Community support channel options (Discussions, Slack, Discord)
- [x] Adopters list formats from successful CNCF projects
- ~~Semantic versioning and changelog automation~~ - Moved to Milestone 11

**Validation**: ✅ Complete - Files provide clear community engagement paths, adopters list includes contribution instructions, integration tests passing (9/9)

**Scope Change Note**: CHANGELOG.md removed from this milestone after user consultation. Modern CNCF projects (Kubernetes, Argo CD, Prometheus, Helm) use GitHub Releases as primary changelog. Maintaining both would create duplication and sync issues. Changelog automation deferred to Milestone 11 (Release workflow enhancement).

---

### Milestone 5: Documentation Artifacts ~~(5 artifacts)~~ **REMOVED**
**Decision**: Milestone removed from project scope (2025-10-23) - See Decision 4 in Resolved Design Decisions

**Rationale**: Documentation artifacts require project-specific content that cannot be meaningfully templated. Unlike governance and legal files that follow industry standards (Contributor Covenant, OpenSSF templates, CNCF requirements), technical documentation is unique to each project's architecture, development workflow, and operational needs.

**Artifacts Removed from Scope:**
- ~~README.md enhancement/validation~~ - Enhancement contradicts "generate missing files only" architecture; basic README.md template already exists from Milestone 1
- ~~ARCHITECTURE.md~~ - Completely project-specific, generic template provides no value ("Describe your architecture here")
- ~~DEVELOPMENT.md~~ - Local setup steps, debugging procedures highly variable per project
- ~~RELEASE.md~~ - Workflow-specific (semantic-release vs manual vs custom), cannot meaningfully standardize
- ~~TROUBLESHOOTING.md~~ - Requires knowing actual project issues and solutions, impossible to template

**Impact on Project**:
- Total artifact count reduced from 90+ to 85+
- Timeline reduced by 1-1.5 weeks
- Focus maintained on tool's core strength: standardized, process-based files
- Projects should create documentation files based on their specific needs

**Alternative Approach**: Projects create documentation files manually or use project-specific tools. Our tool focuses on artifacts where standardization and templating provide real value.

---

### Milestone 6: GitHub Issue Templates (3 artifacts) ✅
**Success Criteria**: Structured issue reporting with proper templates

**Artifacts:**
- [x] `.github/ISSUE_TEMPLATE/bug_report.yml` - Bug description, reproduction steps, environment, logs (GitHub Forms format with conditional sections)
- [x] `.github/ISSUE_TEMPLATE/feature_request.yml` - Problem statement, proposed solution, alternatives (with priority and contribution dropdowns)
- [x] `.github/ISSUE_TEMPLATE/config.yml` - Template chooser configuration, external links (conditional contact links)

**Best Practices Research:**
- [x] GitHub issue template YAML schema - Implemented GitHub Forms (.yml) instead of markdown
- [x] Required vs optional fields - Proper validation rules on all templates
- [x] Template emoji and visual design - Emoji in config.yml contact links
- [x] Linking to external resources (discussions, docs) - Conditional linking based on project configuration

**Validation**:
- [x] Integration test validates 3-file generation workflow (tests/integration/tools/project-setup.test.ts:901-1076)
- Actual GitHub UI rendering will be validated when tool is used on this repository for CNCF submission (PRD #173)

**Implementation Notes:**
- Used GitHub Forms (.yml) instead of markdown templates for better UX and validation
- Added `isTrue` Handlebars helper to support "yes", "true", and boolean true values
- Templates include conditional sections based on project type (Node.js, Python, Go, Kubernetes)

---

### Milestone 7: GitHub Pull Request Template (1 artifact) ✅
**Success Criteria**: PR checklist ensures quality and completeness

**Artifacts:**
- [x] `.github/PULL_REQUEST_TEMPLATE.md` - Description, related issues, change type, testing checklist, docs updated, breaking changes

**Best Practices Research:**
- [x] PR template patterns from high-velocity projects
- [x] Checklist items for quality assurance
- [x] Semantic PR titles and conventional commits

**Validation**: ✅ Complete - Template created with conditional sections (DCO, Conventional Commits, Security, Screenshots), integration tests passing (12/12)

---

### Milestone 8: GitHub Community Files (3 artifacts) ✅
**Success Criteria**: GitHub community features configured

**Artifacts:**
- [x] `.github/CODEOWNERS` - Auto-assign reviewers by file path patterns
- [x] `.github/FUNDING.yml` - GitHub Sponsors, Open Collective, Patreon links (conditional generation)
- [x] `.github/release.yml` - Release notes configuration and automation

**Best Practices Research:**
- [x] CODEOWNERS syntax and team assignment
- [x] Funding platform options and best practices
- [x] Automated release notes generation

**Validation**: ✅ Integration tests validate all templates generate correctly with proper conditional logic

---

### Milestone 9: GitHub Workflows - Testing (1 artifact) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: GitHub Actions workflows are highly project-specific and harder to template effectively. Most projects already have CI/CD or need custom configurations. Focusing on governance files provides more immediate value.

**Artifacts:**
- [ ] ~~`.github/workflows/test.yml` - Run tests on PR, multiple Node.js/Python/Go versions, code coverage reporting~~

**Best Practices Research:**
- [ ] ~~GitHub Actions security hardening (pinned versions, minimal permissions)~~
- [ ] ~~Matrix testing across language versions~~
- [ ] ~~Code coverage integration (Codecov, Coveralls)~~
- [ ] ~~Caching strategies for faster CI~~

---

### Milestone 10: GitHub Workflows - Build (1 artifact) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: GitHub Actions workflows are highly project-specific and harder to template effectively. Most projects already have CI/CD or need custom configurations. Focusing on governance files provides more immediate value.

**Artifacts:**
- [ ] ~~`.github/workflows/build.yml` - Build project, create artifacts, validate compilation~~

**Best Practices Research:**
- [ ] ~~Build artifact storage and retention~~
- [ ] ~~Multi-platform builds (Linux, macOS, Windows)~~
- [ ] ~~Docker image building in CI~~

---

### Milestone 11: GitHub Workflows - Release (1 artifact) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: GitHub Actions workflows are highly project-specific and harder to template effectively. Most projects already have CI/CD or need custom configurations. Focusing on governance files provides more immediate value.

**Artifacts:**
- [ ] ~~`.github/workflows/release.yml` - Semantic release, GitHub Releases with categorized changelog, artifact publishing, Docker image push~~

**Best Practices Research:**
- [ ] ~~Semantic versioning automation (semantic-release)~~
- [ ] ~~GitHub Releases generation with categorized release notes~~
- [ ] ~~Multi-platform artifact publishing~~
- [ ] ~~Container image signing (Cosign)~~

**Note**: This milestone originally included changelog functionality that replaced Milestone 4's CHANGELOG.md. With this milestone marked out of scope, projects should implement their own release automation or use GitHub Releases manually.

---

### Milestone 12: GitHub Workflows - Security (1 artifact) ✅
**Success Criteria**: OpenSSF Scorecard for security posture

**Artifacts:**
- [x] `.github/workflows/scorecard.yml` - OpenSSF Scorecard analysis, security best practices validation

**Best Practices Research:**
- [x] OpenSSF Scorecard checks and scoring
- [x] Security best practices for GitHub repositories
- [x] SLSA provenance generation

**Validation**: ✅ Complete - Template created with conditional permissions for private repos, badge instructions via additionalInstructions, integration tests passing (15/15)

---

### Milestone 13: GitHub Automation (4 artifacts) ✅
**Success Criteria**: Automated dependency updates and issue management

**Artifacts:**
- [x] `renovate.json` - Renovate configuration for automated dependency updates (auto-detects all package managers)
- [x] `.github/labeler.yml` - Auto-label PR configuration based on file paths
- [x] `.github/workflows/labeler.yml` - Labeler workflow to apply labels automatically
- [x] `.github/workflows/stale.yml` - Auto-close stale issues/PRs with label-based exemptions

**Best Practices Research:**
- [x] Renovate vs Dependabot comparison - Chose Renovate for auto-detection and flexibility
- [x] Label taxonomy and automation - Comprehensive patterns for docs, source, tests, infra, dependencies
- [x] Stale bot policies and community impact - Label-aware stale bot (only closes when user action needed)

**Validation**: ✅ Complete - 4 templates created, comprehensive language/infrastructure support, integration tests passing (16/16)

---

### Milestone 14: Container Configuration (3 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Container configuration is highly project-specific and varies significantly by language, framework, and dependencies. Dockerfiles, docker-compose.yml, and build processes require deep understanding of project architecture. Projects should create custom container configs based on their specific needs.

**Artifacts:**
- [ ] ~~`Dockerfile` - Multi-stage build, non-root user, minimal base image (distroless/alpine), security scanning~~
- [ ] ~~`.dockerignore` - Exclude build artifacts, dependencies, secrets from Docker context~~
- [ ] ~~`docker-compose.yml` - Local development environment with dependencies (databases, caches, etc.)~~

**Best Practices Research:**
- [ ] ~~Multi-stage Docker builds for size optimization~~
- [ ] ~~Distroless vs Alpine vs Ubuntu base images~~
- [ ] ~~Non-root user execution for security~~
- [ ] ~~Layer caching strategies~~
- [ ] ~~Docker security scanning (Trivy, Snyk)~~

**Note**: Container configuration requires understanding of the specific language runtime, dependencies, build process, and deployment target. Unlike standardized governance files, there's no one-size-fits-all approach for containers.

---

### Milestone 15: Version Control Configuration (2 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: .gitignore and .editorconfig require knowing the project's tech stack, languages, frameworks, and team preferences. .gitignore patterns vary significantly by language (node_modules for Node.js, __pycache__ for Python, target/ for Rust/Java), and .editorconfig needs language-specific indentation preferences. These files cannot be standardized without deep project knowledge.

**Artifacts:**
- [ ] ~~`.gitignore` - Language-specific ignores (node_modules, __pycache__, build artifacts), OS ignores, IDE ignores, secrets patterns~~
- [ ] ~~`.editorconfig` - Indentation, line endings, charset consistency across editors~~

**Best Practices Research:**
- [ ] ~~GitHub official .gitignore templates~~
- [ ] ~~Secrets detection patterns~~
- [ ] ~~EditorConfig specification~~
- [ ] ~~Multi-language project ignore patterns~~

---

### Milestone 16: Version Management Files (4 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Version files require knowing which language runtime the project uses and which specific version. This is project-specific and cannot be generically templated without deep project context.

**Artifacts:**
- [ ] ~~`.nvmrc` or `.node-version` - Node.js version specification for nvm/volta/fnm~~
- [ ] ~~`.python-version` - Python version for pyenv~~
- [ ] ~~`.ruby-version` - Ruby version for rbenv/rvm~~
- [ ] ~~`.go-version` - Go version for gvm/goenv~~

**Best Practices Research:**
- [ ] ~~Version pinning vs range specifications~~
- [ ] ~~LTS vs latest versions~~
- [ ] ~~Version manager compatibility~~

---

### Milestone 17: Node.js/TypeScript Configuration (7 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Node.js/TypeScript configuration is highly project-specific, requiring knowledge of target Node version, module system (ESM/CommonJS), testing framework preferences, linting rules, and build tooling. Each project has unique requirements.

**Artifacts:**
- [ ] ~~`package.json` - Enhancement/validation (scripts, engines, dependencies structure)~~
- [ ] ~~`tsconfig.json` - Strict mode, module resolution, target based on Node version~~
- [ ] ~~`.npmignore` - Files to exclude from npm package~~
- [ ] ~~`.npmrc` - npm configuration (registry, save-exact, etc.)~~
- [ ] ~~`jest.config.js` or `vitest.config.ts` - Test configuration with coverage~~
- [ ] ~~`.eslintrc` or `eslint.config.js` - Linting rules (Airbnb, Standard, etc.)~~
- [ ] ~~`.prettierrc` - Code formatting configuration~~

**Best Practices Research:**
- [ ] ~~TypeScript strict mode benefits and migration~~
- [ ] ~~ESLint flat config (eslint.config.js) vs legacy~~
- [ ] ~~Prettier integration with ESLint~~
- [ ] ~~Jest vs Vitest for modern TypeScript~~
- [ ] ~~Package.json best practices (engines, type: module)~~

---

### Milestone 18: Python Configuration (6 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Python configuration is project-specific, requiring knowledge of Python version, dependency management tool (pip/poetry/pipenv), testing framework, linting preferences, and project structure. Cannot be generically templated.

**Artifacts:**
- [ ] ~~`pyproject.toml` - PEP 518/621 project metadata, tool configurations (Black, mypy, ruff)~~
- [ ] ~~`requirements.txt` - Production dependencies~~
- [ ] ~~`requirements-dev.txt` - Development dependencies~~
- [ ] ~~`Pipfile` - Alternative dependency management (Pipenv)~~
- [ ] ~~`pytest.ini` - pytest configuration~~
- [ ] ~~`.pylintrc` - Pylint linting rules~~

**Best Practices Research:**
- [ ] ~~pyproject.toml vs setup.py migration~~
- [ ] ~~Poetry vs pip-tools vs Pipenv~~
- [ ] ~~Black, Ruff, mypy configuration~~
- [ ] ~~pytest best practices and plugins~~
- [ ] ~~Type hints and mypy strict mode~~

---

### Milestone 19: Go Configuration (4 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Go configuration requires knowledge of Go version, module dependencies, build process, and linting preferences. Project-specific and cannot be templated generically.

**Artifacts:**
- [ ] ~~`go.mod` - Enhancement/validation (Go version, dependencies)~~
- [ ] ~~`go.sum` - Enhancement/validation (dependency checksums)~~
- [ ] ~~`Makefile` - Build automation (build, test, lint, install)~~
- [ ] ~~`.golangci.yml` - golangci-lint configuration with recommended linters~~

**Best Practices Research:**
- [ ] ~~Go project layout standard~~
- [ ] ~~go.mod minimum Go version selection~~
- [ ] ~~Makefile patterns for Go projects~~
- [ ] ~~golangci-lint recommended linters~~
- [ ] ~~Go module best practices~~

---

### Milestone 20: Rust Configuration (2 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Rust configuration requires knowledge of Rust edition, dependencies, workspace structure, and project metadata. Project-specific and cannot be templated generically.

**Artifacts:**
- [ ] ~~`Cargo.toml` - Package manifest with metadata, dependencies~~
- [ ] ~~`Cargo.lock` - Dependency lock file~~

**Best Practices Research:**
- [ ] ~~Cargo.toml best practices~~
- [ ] ~~Workspace configuration for monorepos~~
- [ ] ~~Rust edition selection~~
- [ ] ~~Clippy linting configuration~~

---

### Milestone 21: Code Quality & Git Hooks (3 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Git hooks and pre-commit configurations are project-specific, requiring knowledge of which linters, formatters, and test runners to use. Each project has unique quality requirements and tooling choices.

**Artifacts:**
- [ ] ~~`.husky/` - Git hooks setup (pre-commit, commit-msg, pre-push)~~
- [ ] ~~`.pre-commit-config.yaml` - Pre-commit framework configuration~~
- [ ] ~~`.coveragerc` - Code coverage configuration and thresholds~~

**Best Practices Research:**
- [ ] ~~Husky vs pre-commit framework~~
- [ ] ~~Pre-commit hook best practices (speed, skip options)~~
- [ ] ~~Conventional commits validation~~
- [ ] ~~Code coverage thresholds (80%? 90%?)~~

---

### Milestone 22: Kubernetes Manifests (5 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Kubernetes manifests are highly application-specific, requiring deep knowledge of resource requirements, health check endpoints, configuration needs, networking, and deployment strategy. Cannot be templated without application context.

**Artifacts:**
- [ ] ~~`k8s/deployment.yaml` - Deployment with resource limits, health checks, security context~~
- [ ] ~~`k8s/service.yaml` - Service (ClusterIP, LoadBalancer, or NodePort)~~
- [ ] ~~`k8s/ingress.yaml` - Ingress with TLS configuration~~
- [ ] ~~`k8s/configmap.yaml` - ConfigMap template for application configuration~~
- [ ] ~~`kustomization.yaml` - Kustomize overlay structure (base, overlays for dev/staging/prod)~~

**Best Practices Research:**
- [ ] ~~Kubernetes production readiness checklist~~
- [ ] ~~Resource requests and limits sizing~~
- [ ] ~~Liveness, readiness, startup probes~~
- [ ] ~~Pod security standards (restricted profile)~~
- [ ] ~~Kustomize vs Helm decision matrix~~

---

### Milestone 23: Helm Charts (3 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Helm charts are application-specific and require knowledge of deployment architecture, configuration values, dependencies, and templating needs. Cannot be generically templated.

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

### Milestone 24: GitOps - Argo CD (2 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: ArgoCD application configuration is deployment-specific and requires knowledge of repository structure, sync policies, health checks, and application dependencies. Cannot be generically templated.

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

### Milestone 25: GitOps - Flux (2 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Flux configuration is deployment-specific and requires knowledge of repository structure, reconciliation intervals, kustomizations, and cluster management strategy. Cannot be generically templated.

**Artifacts:**
- [ ] ~~`flux/kustomization.yaml` - Flux Kustomization resource with interval, prune, health checks~~
- [ ] ~~`flux/` - Directory structure for Flux resources (GitRepository, Kustomization, HelmRelease)~~

**Best Practices Research:**
- [ ] ~~Flux bootstrap patterns~~
- [ ] ~~Kustomization vs HelmRelease~~
- [ ] ~~Notification and alerting configuration~~
- [ ] ~~Multi-cluster management~~

---

### Milestone 26: Terraform Configuration (5 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Terraform configuration is infrastructure-specific and requires deep knowledge of cloud provider resources, variable structures, state management, and organizational patterns. Cannot be generically templated.

**Artifacts:**
- [ ] ~~`main.tf` - Main infrastructure definitions~~
- [ ] ~~`variables.tf` - Input variables with descriptions and validation~~
- [ ] ~~`outputs.tf` - Output values for integration~~
- [ ] ~~`terraform.tfvars.example` - Example variable values (do not commit actual tfvars)~~
- [ ] ~~`.terraform-docs.yml` - terraform-docs configuration for documentation generation~~

**Best Practices Research:**
- [ ] ~~Terraform module structure standards~~
- [ ] ~~Variable naming conventions~~
- [ ] ~~State management (remote backend configuration)~~
- [ ] ~~terraform-docs for automated documentation~~
- [ ] ~~Terraform linting (tflint)~~

---

### Milestone 27: Crossplane Configuration (2 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Crossplane configuration is infrastructure-specific and requires knowledge of provider resources, composition patterns, XRD schemas, and patching strategies. Cannot be generically templated.

**Artifacts:**
- [ ] ~~`crossplane/composition.yaml` - Crossplane Composition for infrastructure provisioning~~
- [ ] ~~`crossplane/xrd.yaml` - Composite Resource Definition (XRD) schema~~

**Best Practices Research:**
- [ ] ~~Crossplane composition patterns~~
- [ ] ~~XRD schema design and versioning~~
- [ ] ~~Provider configuration references~~
- [ ] ~~Patch and transform functions~~

---

### Milestone 28: Security & Compliance (4 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Security tool configurations are project-specific and require knowledge of which scanners to use, scan targets, exclusion patterns, and compliance requirements. Each tool has unique configuration needs.

**Artifacts:**
- [ ] ~~`.snyk` - Snyk configuration for vulnerability scanning~~
- [ ] ~~`trivy.yaml` - Trivy configuration for container/IaC scanning~~
- [ ] ~~`.gitleaks.toml` - Gitleaks configuration for secrets detection~~
- [ ] ~~`SBOM.json` or `SBOM.spdx` - Software Bill of Materials generation configuration~~

**Best Practices Research:**
- [ ] ~~OWASP dependency scanning best practices~~
- [ ] ~~Container image security scanning (Trivy, Grype)~~
- [ ] ~~Secrets detection (Gitleaks, TruffleHog)~~
- [ ] ~~SBOM formats (SPDX, CycloneDX)~~
- [ ] OpenSSF Scorecard integration

**Validation**: Security scans run successfully, no critical vulnerabilities, secrets detection functional

---

### Milestone 29: Documentation Directories (5 artifacts) ❌ OUT OF SCOPE
**Status**: Marked out of scope on 2025-10-24
**Rationale**: Creating empty directory structures provides minimal value - users can easily create directories as needed. The tool should focus on generating file content, not empty folders.

**Artifacts:**
- [ ] ~~`docs/` - Main documentation directory with README~~
- [ ] ~~`docs/architecture/` - Architecture diagrams, ADRs, design documents~~
- [ ] ~~`docs/api/` - API documentation (OpenAPI, GraphQL schemas)~~
- [ ] ~~`docs/guides/` - User guides, tutorials, how-tos~~
- [ ] ~~`docs/examples/` - Example code, usage patterns, sample configurations~~

**Best Practices Research:**
- [ ] ~~Documentation structure patterns (Diátaxis framework)~~
- [ ] ~~Architecture Decision Records (ADR) format~~
- [ ] ~~API documentation generation tools~~
- [ ] ~~Documentation site generators (MkDocs, Docusaurus, Hugo)~~

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
- Milestone 2: Legal & licensing ✅
- Milestone 3: Core governance ✅
- Milestone 4: Community & support ✅
- ~~Milestone 5: Documentation~~ **REMOVED** - Documentation artifacts do not fit tool's standardization model (see Decision 4)

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

**Total Timeline**: 11-11.5 weeks (~3 months) from start to full feature completion (reduced from 12 weeks due to Milestone 5 removal)

**Note**: Milestones 2-4 (legal and governance) completed in 1 day, immediately supporting PRD #173 CNCF submission needs.

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

### 2025-10-23 (Evening) - Milestone 2 Complete: Legal & Licensing Artifacts
**Duration**: ~4 hours (implementation + testing + optimization)
**Commits**: Multiple commits for templates, bug fixes, optimizations, and test updates
**Primary Focus**: Multi-license template system with conditional file generation

**Completed PRD Items (Milestone 2)**:
- ✅ LICENSE.hbs template created (933 lines) supporting 4 license types: MIT, Apache-2.0, GPL-3.0, BSD-3-Clause
- ✅ NOTICE.hbs template for Apache 2.0 attribution (conditionally generated when `licenseType === 'Apache-2.0'`)
- ✅ COPYRIGHT removed per user decision (redundant - copyright statement included in LICENSE)
- ✅ License compatibility matrix implemented via Handlebars conditionals
- ✅ CNCF acceptable licenses validated (all 4 licenses are CNCF-acceptable)
- ✅ Attribution requirements researched and implemented (NOTICE only for Apache-2.0)
- ✅ Template variables: `{{year}}`, `{{copyrightHolder}}`, `{{projectName}}`, `{{projectDescription}}`, `{{projectUrl}}`

**Implementation Enhancements (Beyond Milestone 2)**:
- Fixed Handlebars `eq` helper: Changed from simple helper to block helper for conditional rendering
- Renamed README.md → README.md.hbs for template consistency
- Implemented scope-based workflow: `readme` and `legal` scopes replace flat file list
- UX optimization: Reduced MCP round trips via `nextFile` preview and `nextFileAnswers` parameter
- Session caching: `existingFiles` stored in session, not required on second reportScan call
- API cleanup: Removed redundant `existingFiles` and `missingFiles` from ReportScanResponse
- Fixed conditional files bug: NOTICE now properly added to filesMap during scope initialization

**Integration Tests**:
- ✅ Updated comprehensive workflow test: README → LICENSE (Apache-2.0) → NOTICE (3 files)
- ✅ Validates round-trip optimization at each step (nextFile preview working)
- ✅ Validates conditional file generation (NOTICE only appears for Apache-2.0)
- ✅ Validates session persistence across all 3 files with correct scope tracking
- ✅ All 7 tests passing in 593ms with `--no-cluster` mode
- ✅ Manual validation successful: Full workflow tested end-to-end with Apache-2.0 license

**Technical Decisions**:
- Used Handlebars block helper `{{#eq}}...{{/eq}}` for license type conditionals
- Downloaded official license texts from authoritative sources (Apache.org, gnu.org)
- Used sed to replace placeholders with Handlebars variables for consistency
- Scope-based workflow: Client scans ALL files, MCP reports scope completion status, user selects scopes
- Conditional files tracked in `discovery-config.json` with evaluation logic in generate-file.ts

**Files Created/Modified**:
- `src/tools/project-setup/templates/LICENSE.hbs` (created, 933 lines)
- `src/tools/project-setup/templates/NOTICE.hbs` (created)
- `src/tools/project-setup/templates/README.md` → `README.md.hbs` (renamed)
- `src/tools/project-setup/discovery-config.json` (updated with legal scope)
- `src/tools/project-setup/discovery.ts` (scope-based refactoring)
- `src/tools/project-setup/report-scan.ts` (scope detection, session caching)
- `src/tools/project-setup/generate-file.ts` (conditional file generation, round-trip optimization)
- `src/tools/project-setup/types.ts` (added scope support, nextFile preview)
- `src/tools/project-setup.ts` (updated parameter handling)
- `src/core/shared-prompt-loader.ts` (fixed Handlebars eq helper)
- `tests/integration/tools/project-setup.test.ts` (comprehensive multi-file test)
- `CLAUDE.md` (documented `npm run test:integration -- --no-cluster` pattern)

**Current Capabilities**:
- Supports 2 scopes: `readme` (README.md) and `legal` (LICENSE, conditional NOTICE)
- Generates 4 license types with proper copyright substitution
- Conditional NOTICE generation based on license selection
- Round-trip optimized workflow (2 MCP calls instead of 4 for multi-file generation)
- Comprehensive integration test coverage

**Next Session Priorities (Milestone 3)**:
- Implement `CONTRIBUTING.md` template (development workflow, PR process, coding standards)
- Implement `CODE_OF_CONDUCT.md` template (Contributor Covenant v2.1)
- Implement `SECURITY.md` template (OpenSSF vulnerability reporting)
- Add `governance` scope to discovery-config.json
- Expand integration tests for governance artifacts

### 2025-10-23 (Late Evening): Milestone 3 Complete - Core Governance Artifacts
**Duration**: ~4 hours (implementation + testing + validation)
**Commits**: Pending commit
**Primary Focus**: Governance template system with CNCF compliance

**Completed PRD Items (Milestone 3)**:
- ✅ 6 governance template files created (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, MAINTAINERS, GOVERNANCE, ROADMAP)
- ✅ All templates use Handlebars with conditional sections
- ✅ Extended discovery-config.json with governance scope and 25+ template variables
- ✅ Integration test validates complete 6-file governance workflow
- ✅ All templates based on authoritative sources (Contributor Covenant v2.1, OpenSSF Security Policy)

**Implementation Achievements**:
- Comprehensive governance scope with flexible questions (DCO, voting, consensus, roadmap goals)
- Templates support conditional sections (DCO sign-off, voting mechanisms, steering committees)
- Professional formatting following CNCF best practices
- Integration tests passing (8/8 tests, including new comprehensive governance workflow test)

**Template Details**:
- `CODE_OF_CONDUCT.md.hbs` - Contributor Covenant v2.1 with {{enforcementEmail}} customization
- `CONTRIBUTING.md.hbs` - Conditional DCO, setup/test/lint commands, communication channels
- `SECURITY.md.hbs` - OpenSSF template pattern with {{securityEmail}} and response timeline
- `docs/MAINTAINERS.md.hbs` - Maintainer list with roles, succession process
- `docs/GOVERNANCE.md.hbs` - Flexible governance (consensus/voting), optional steering committee
- `docs/ROADMAP.md.hbs` - Short/medium/long-term goals with GitHub Project Board integration

**Files Created/Modified**:
- `src/tools/project-setup/templates/CODE_OF_CONDUCT.md.hbs` (created, 133 lines)
- `src/tools/project-setup/templates/CONTRIBUTING.md.hbs` (created, 160 lines)
- `src/tools/project-setup/templates/SECURITY.md.hbs` (created, 45 lines)
- `src/tools/project-setup/templates/docs/MAINTAINERS.md.hbs` (created)
- `src/tools/project-setup/templates/docs/GOVERNANCE.md.hbs` (created)
- `src/tools/project-setup/templates/docs/ROADMAP.md.hbs` (created)
- `src/tools/project-setup/discovery-config.json` (updated with governance scope, 25+ questions)
- `tests/integration/tools/project-setup.test.ts` (added comprehensive 6-file governance workflow test)

**Next Session Priorities (Milestone 4)**:
- Implement `SUPPORT.md` template (community support channels)
- Implement `ADOPTERS.md` template (user/organization listing)
- ~~Implement `CHANGELOG.md` template (Keep a Changelog format)~~ - Removed after scope review
- Add `community` scope to discovery-config.json
- Integration tests for community artifacts

### 2025-10-23 (Evening) - Milestone 4 Complete: Community & Support Artifacts
**Duration**: ~4 hours (implementation + testing + validation)
**Commits**: Pending commit
**Primary Focus**: Community engagement infrastructure with SUPPORT.md and ADOPTERS.md templates

**Completed PRD Items (Milestone 4)**:
- [x] SUPPORT.md.hbs template (142 lines) with conditional support channel sections
- [x] ADOPTERS.md.hbs template (116 lines) with flexible list/table format
- [x] Community scope in discovery-config.json with 28 questions
- [x] Integration test for 2-file community workflow (9/9 tests passing)
- [x] Best practices research from CNCF projects (Kubernetes, Argo CD, Helm)

**Scope Decision**:
- **CHANGELOG.md removed from Milestone 4** - Deferred to Milestone 11
- Rationale: Modern CNCF projects use GitHub Releases as primary changelog (Kubernetes, Argo CD, Prometheus, Helm)
- Milestone 11 will implement semantic-release for automated GitHub Releases with categorized release notes

**Implementation Details**:
- Templates use Handlebars with conditional sections for flexible support channel configuration
- Fixed template compilation issues (removed complex nested conditionals, simplified helper usage)
- Round-trip optimization working (nextFileAnswers parameter reduces MCP calls)
- Session persistence validated across multi-file generation

**Files Created/Modified**:
- `src/tools/project-setup/templates/SUPPORT.md.hbs` (created, 142 lines)
- `src/tools/project-setup/templates/ADOPTERS.md.hbs` (created, 116 lines)
- `src/tools/project-setup/discovery-config.json` (updated with community scope, 28 questions)
- `tests/integration/tools/project-setup.test.ts` (added comprehensive 2-file community workflow test)

**Next Session Priorities (Milestone 5)**:
- ~~Implement documentation artifacts~~ **SKIPPED** - Decision 4: Documentation artifacts don't fit tool's standardization model
- Move directly to Milestone 6 (GitHub Issue Templates)

### 2025-10-24 - Milestone 6 Complete: GitHub Issue Templates ✅
**Duration**: ~3 hours (implementation + testing + validation)
**Commits**: Pending commit
**Primary Focus**: GitHub issue template infrastructure with bug reports, feature requests, and template chooser configuration

**Completed PRD Items (Milestone 6)**:
- [x] bug_report.yml template with conditional environment sections (Node.js, Python, Go, Kubernetes)
- [x] feature_request.yml template with use case focus, priority levels, and contribution options
- [x] config.yml template with conditional contact links (Discussions, docs, support channels)
- [x] GitHub Forms (.yml) research and implementation
- [x] Integration test for 3-file github-issues workflow (10/10 tests passing)

**Technical Enhancements**:
- Added `isTrue` Handlebars helper to `shared-prompt-loader.ts` for flexible boolean handling
- Helper supports "yes", "true", and boolean `true` values interchangeably
- Templates use modern GitHub Forms (.yml) instead of markdown for better UX and validation

**Implementation Details**:
- 16 questions in github-issues scope (project type detection, optional contact links, file path references)
- Conditional sections based on project type (isNodeProject, isPythonProject, isGoProject, isKubernetesProject)
- Flexible path references (supportFilePath, securityFilePath, roadmapPath) for linking to existing governance files
- Test validates all three truthy value formats ("yes", "true", boolean true) work correctly

**Files Created/Modified**:
- `src/tools/project-setup/templates/.github/ISSUE_TEMPLATE/bug_report.yml.hbs` (created, 176 lines)
- `src/tools/project-setup/templates/.github/ISSUE_TEMPLATE/feature_request.yml.hbs` (created, 135 lines)
- `src/tools/project-setup/templates/.github/ISSUE_TEMPLATE/config.yml.hbs` (created, 28 lines)
- `src/core/shared-prompt-loader.ts` (added `isTrue` helper for flexible boolean handling)
- `src/tools/project-setup/discovery-config.json` (added github-issues scope with 16 questions)
- `tests/integration/tools/project-setup.test.ts` (added comprehensive github-issues workflow test with mixed truthy values)

**Next Session Priorities (Milestone 7)**:
- Implement Pull Request template (.github/PULL_REQUEST_TEMPLATE.md)
- Add pr-template scope to discovery-config.json
- Integration tests for PR template generation

### 2025-10-24 - Milestone 7 Complete: GitHub Pull Request Template
**Duration**: ~1.5 hours
**Commits**: Pending commit
**Primary Focus**: PR template with conditional sections for project customization

**Completed PRD Items (Milestone 7)**:
- [x] `.github/PULL_REQUEST_TEMPLATE.md.hbs` template (175 lines)
- [x] pr-template scope in discovery-config.json (6 questions)
- [x] Integration tests for PR template generation (2 comprehensive tests)
- [x] Template uses isTrue helper for proper yes/no/true/false handling

**Implementation Details**:
- Core sections always present: Description, Related Issues, Type of Change, Testing, Documentation, Breaking Changes, Checklist, Additional Context
- Conditional sections based on user answers: Conventional Commits guidance (with examples), Security Checklist, Screenshots (Before/After), DCO certification with git commands
- Clarified local vs automated CI testing expectations in test commands section
- Removed deployment notes and semantic versioning sections (deferred to Milestone 11 per PRD decisions)

**Template Refinements During Implementation**:
- Simplified testing checklist (removed unit/integration test distinction, just "tests")
- Added clarifying comments for test commands section (local vs CI)
- Removed changelog/release notes checklist item (automated release notes via Milestone 11)
- Used isTrue helper consistently for all boolean conditionals to properly handle "yes"/"no"/true/false values

**Integration Test Coverage**:
- Full workflow test with all conditional sections enabled (DCO, Conventional Commits, Security, Screenshots)
- Minimal workflow test with all conditional sections disabled (validates clean template)
- Validates mixed truthy value handling ("yes", true, "no", false all work correctly)
- All 12 project-setup integration tests passing

**Files Created/Modified**:
- `src/tools/project-setup/templates/.github/PULL_REQUEST_TEMPLATE.md.hbs` (created, 175 lines)
- `src/tools/project-setup/discovery-config.json` (updated with pr-template scope, 6 questions)
- `tests/integration/tools/project-setup.test.ts` (added 2 comprehensive PR template workflow tests)

**Next Session Priorities (Milestone 8)**:
- `.github/CODEOWNERS` - Auto-assign reviewers by file path patterns
- `.github/FUNDING.yml` - GitHub Sponsors, Open Collective configuration
- `.github/release.yml` - Release notes configuration

### 2025-10-24 - Milestone 8 Complete: GitHub Community Files + Scope-Based Refactoring
**Duration**: ~4 hours
**Commits**: Pending commit
**Primary Focus**: GitHub community files + architectural refactoring to scope-based generation

**Completed PRD Items (Milestone 8)**:
- [x] `.github/CODEOWNERS` template (team-based or individual maintainer assignment)
- [x] `.github/FUNDING.yml` template (conditional generation when funding enabled)
- [x] `.github/release.yml` template (CNCF-standard release note categories)
- [x] All 3 best practices research items (CODEOWNERS patterns, funding platforms, release automation)
- [x] Integration tests fully rewritten for scope-based workflow (14/14 tests passing)

**Architectural Decision #5: Scope-Based Generation**:
The original file-by-file workflow (`generateFile`) required multiple round-trips for files in the same scope, asking the same questions repeatedly. This session implemented scope-based generation (`generateScope`) which collects ALL questions for a scope upfront, then generates ALL files in that scope in a single API call.

**Implementation Details**:
- Replaced `generateFile` handler with `generateScope` handler
- Updated `report-scan.ts` to return ALL questions for selected scope at once (instead of one file at a time)
- Enhanced conditional files logic to handle files that exist ONLY in `conditionalFiles` (not in base `files` array)
- Fixed critical bug: NOTICE (legal scope) and FUNDING.yml (github-community scope) are conditional-only files and were never being processed
- Rewrote all 14 integration tests to validate scope-based workflow instead of file-by-file workflow
- Reduces user interaction steps by 60-80% for multi-file scopes

**Files Created/Modified**:
- `src/tools/project-setup/templates/.github/CODEOWNERS.hbs` (created, supports team/individual assignment)
- `src/tools/project-setup/templates/.github/FUNDING.yml.hbs` (created, conditional on enableFunding)
- `src/tools/project-setup/templates/.github/release.yml.hbs` (created, CNCF-standard categories)
- `src/tools/project-setup/generate-scope.ts` (created, replaces generate-file.ts)
- `src/tools/project-setup/generate-file.ts` (deleted, replaced by generate-scope.ts)
- `src/tools/project-setup/types.ts` (updated workflow types from generateFile to generateScope)
- `src/tools/project-setup/report-scan.ts` (updated to return all scope questions at once)
- `src/tools/project-setup/project-setup.ts` (updated router to use generateScope handler)
- `src/tools/project-setup/discovery-config.json` (added github-community scope with 11 questions)
- `tests/integration/tools/project-setup.test.ts` (completely rewritten for scope-based workflow, 14 tests passing)

**Bug Fix**:
Original code in `generate-scope.ts` only processed files from `scopeConfig.files` array, never checking for conditional-only files. This caused NOTICE and FUNDING.yml to never be generated. Fixed by adding logic to detect files that exist ONLY in `conditionalFiles` (lines 87-98).

**Next Session Priorities (Milestone 9)**:
- GitHub Actions workflows (.github/workflows/)
- CI/CD templates for different project types
- Test, build, and release automation

### 2025-10-24 - Milestone 12 Complete: GitHub Workflows - Security (OpenSSF Scorecard)
**Duration**: ~2-3 hours
**Commits**: Pending commit
**Primary Focus**: OpenSSF Scorecard workflow template with security best practices

**Completed PRD Items (Milestone 12)**:
- [x] `.github/workflows/scorecard.yml` template (62 lines) with official OpenSSF best practices
- [x] Best practices research: OpenSSF Scorecard checks, security hardening, SLSA provenance
- [x] `github-security` scope in discovery-config.json with 7 questions
- [x] Integration test for scorecard workflow generation (15/15 tests passing)

**Implementation Details**:
- Template based on official ossf/scorecard workflow with security hardening
- Conditional permissions for private repos (actions:read, issues:read, pull-requests:read, checks:read)
- Pinned action versions using commit hashes for security
- Supports weekly/daily/monthly schedules via cron expressions
- publish_results enables Scorecard badge and REST API access
- workflow_dispatch trigger for manual security analysis

**Architectural Enhancement - additionalInstructions Feature**:
- Added `additionalInstructions` field to ScopeConfig type
- Template variable replacement in generate-scope.ts (replaceTemplateVariables function)
- Enables scope-specific post-generation instructions (e.g., badge markdown, next steps)
- github-security scope provides OpenSSF Scorecard badge markdown with user's org/repo values

**Files Created/Modified**:
- `src/tools/project-setup/templates/.github/workflows/scorecard.yml.hbs` (created)
- `src/tools/project-setup/discovery-config.json` (added github-security scope with 7 questions)
- `src/tools/project-setup/types.ts` (added additionalInstructions to ScopeConfig and GenerateScopeResponse)
- `src/tools/project-setup/generate-scope.ts` (added replaceTemplateVariables function, integrated additionalInstructions)
- `tests/integration/tools/project-setup.test.ts` (added comprehensive github-security workflow test)
- `prds/177-project-setup-governance-tool.md` (marked Milestones 9-11 out of scope, updated Milestone 12 complete)

**Next Session Priorities (Milestone 13)**:
- `.github/dependabot.yml` - Automated dependency updates
- `.github/labeler.yml` - Auto-label PRs based on file changes
- `.github/stale.yml` - Auto-close stale issues/PRs
- GitHub automation scope in discovery-config.json

### 2025-10-24 - Milestone 13 Complete: GitHub Automation (Renovate + Labeler + Stale Bot)
**Duration**: ~3-4 hours
**Commits**: Pending commit
**Primary Focus**: Automated dependency management, PR labeling, and stale issue management

**Completed PRD Items (Milestone 13)**:
- [x] `renovate.json` - Renovate configuration with auto-detection of all package managers
- [x] `.github/labeler.yml` - PR labeling rules for 10+ ecosystems and infrastructure tools
- [x] `.github/workflows/labeler.yml` - Labeler GitHub Action workflow
- [x] `.github/workflows/stale.yml` - Stale bot with label-based exemptions (2024 best practices)
- [x] `github-automation` scope in discovery-config.json with 20 questions
- [x] Integration test validating all 4 files (16/16 tests passing)

**Implementation Details**:
- **Renovate over Dependabot**: Chose Renovate for auto-detection (no need to specify languages), superior grouping, vulnerability alerts (OSV), and dependency dashboard
- **Comprehensive Labeler**: Supports JavaScript, Python, Go, Rust, Java, Ruby, PHP, .NET, Swift, Elixir dependencies + Terraform, Kubernetes, Helm, Ansible, CloudFormation, Crossplane infrastructure
- **Label-aware Stale Bot**: Follows 2024 community best practices - only auto-closes when responsibility is on contributor (uses exempt labels for maintainer-action-needed items)

**Key Features**:
- Renovate: PR limits, hourly limits, grouping, automerge options, vulnerability scanning
- Labeler: Documentation, source, tests, infrastructure, dependencies, config auto-detection
- Stale Bot: Separate timeouts for issues vs PRs, exemptions by label/milestone/assignee

**Files Created/Modified**:
- `src/tools/project-setup/templates/renovate.json.hbs` (created)
- `src/tools/project-setup/templates/.github/labeler.yml.hbs` (created)
- `src/tools/project-setup/templates/.github/workflows/labeler.yml.hbs` (created)
- `src/tools/project-setup/templates/.github/workflows/stale.yml.hbs` (created)
- `src/tools/project-setup/discovery-config.json` (added github-automation scope with 20 questions, 4 files)
- `tests/integration/tools/project-setup.test.ts` (added comprehensive github-automation test)
- `prds/177-project-setup-governance-tool.md` (marked Milestone 13 complete, updated to Renovate)

**Next Session Priorities (Milestone 14)**:
- `Dockerfile` - Multi-stage build with distroless/alpine base
- `.dockerignore` - Exclude build artifacts and secrets
- `docker-compose.yml` - Local development environment
- Container configuration scope in discovery-config.json

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
