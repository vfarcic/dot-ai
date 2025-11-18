# PRD: Code Analysis Engine for Automated Recommendation Input

**Created**: 2025-07-28
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-11-18

## Executive Summary
Create an MCP prompt that instructs Claude Code to analyze local project directories and generate deployment intent descriptions for the recommendation tool. This prompt focuses solely on understanding what the application is, what it needs, and how it should be deployed - providing structured analysis that helps users articulate their deployment requirements.

**Note**: This PRD is complementary to but independent from:
- **PRD #225 (Dockerfile Generation)**: Containerization of applications
- **PRD #226 (GitHub Actions CI/CD)**: Build and publish automation
- All three can be used together for complete code-to-Kubernetes automation, or independently as needed.

## Documentation Changes

### Files Created/Updated
- **`shared-prompts/analyze-project.md`** - New File - MCP prompt template for project analysis instructions
- **`docs/mcp-guide.md`** - MCP Documentation - Document the analyze-project prompt
- **`README.md`** - Project Overview - Add automated project analysis to core capabilities

### Content Location Map
- **Feature Overview**: See `docs/mcp-guide.md` (Section: "Automated Project Analysis")
- **Prompt Template**: See `shared-prompts/analyze-project.md`
- **Usage Examples**: See `docs/mcp-guide.md` (Section: "Project Analysis Examples")

### User Journey Validation
- [ ] **Primary workflow** documented end-to-end: User in project directory → Invoke analysis prompt → Client agent analyzes → Generates deployment intent description
- [ ] **Prompt effectiveness** validated: Prompt produces accurate deployment intent descriptions across different project types
- [ ] **Integration** with recommend tool: Generated intent descriptions work seamlessly when passed to recommend tool

## Problem Statement

Developers know what their application code does, but struggle to articulate deployment requirements for Kubernetes:

### Current Pain Points
- **Deployment knowledge gap**: Developers understand their code but not Kubernetes deployment requirements
- **Manual intent writing**: Writing deployment intent descriptions for the recommend tool is time-consuming
- **Inconsistent descriptions**: Different developers describe similar applications differently
- **Missing context**: Easy to forget important details (dependencies, resource needs, scaling requirements)

### Impact
- Slower adoption of recommend tool (manual intent writing is a barrier)
- Suboptimal deployment recommendations due to incomplete intent descriptions
- Inconsistent deployment approaches across teams

## Solution Overview

Create `shared-prompts/analyze-project.md` that instructs Claude Code to:

1. **Analyze project structure** - Detect language, framework, application type, dependencies
2. **Identify deployment requirements** - Understand resource needs, scaling requirements, persistence needs
3. **Generate deployment intent** - Create clear, comprehensive deployment intent description
4. **Provide to user** - User can review and optionally pass to recommend tool

This prompt focuses on **understanding and articulating** what needs to be deployed, not the deployment itself.

## Success Criteria

### Functional Requirements
- ✅ Accurately identifies application type (web app, API, worker, database, etc.)
- ✅ Detects language and framework correctly
- ✅ Identifies dependencies (databases, caches, message queues)
- ✅ Estimates resource requirements (CPU, memory, storage)
- ✅ Generates clear, comprehensive deployment intent descriptions

### Quality Requirements
- ✅ Works consistently across different project types and languages
- ✅ Generated intent descriptions are human-readable and clear
- ✅ Descriptions provide sufficient detail for recommend tool

### Integration Requirements
- ✅ Generated intent descriptions work seamlessly with recommend tool
- ✅ Can be used independently or as part of larger workflow
- ✅ Works in Claude Code environment

## User Workflows

### Primary Workflow: Generate Deployment Intent from Code

**Steps**:
1. User is in project directory with source code
2. User invokes project analysis prompt
3. Claude Code analyzes project:
   - Identifies language/framework from manifest files
   - Determines application type from project structure
   - Detects dependencies (databases, caches, etc.)
   - Estimates resource requirements
4. Claude Code generates deployment intent description
5. User reviews the generated intent
6. (Optional) User passes intent to recommend tool for K8s manifests

**Success Criteria**:
- ✅ Generated intent accurately describes the application
- ✅ Intent includes all necessary deployment context
- ✅ Intent description is clear and comprehensive
- ✅ User can use intent with recommend tool

## Implementation Milestones

### Milestone 1: Core Prompt Template Created
- [ ] `shared-prompts/analyze-project.md` created with analysis guidance
- [ ] Project detection patterns documented (language, framework, app type)
- [ ] Dependency identification guidance included
- [ ] Resource requirement estimation patterns defined
- [ ] Output format specified (deployment intent description)

### Milestone 2: Tested with Diverse Projects
- [ ] Tested with Node.js/TypeScript project
- [ ] Tested with Go project
- [ ] Tested with Python project (optional, if available)
- [ ] Generated intents are accurate and comprehensive
- [ ] Generated intents work well with recommend tool

### Milestone 3: Documentation Complete
- [ ] `docs/mcp-guide.md` updated with project analysis guide
- [ ] Usage examples documented
- [ ] Integration with recommend tool documented
- [ ] README.md updated with analysis capabilities

## Design Decisions

### Decision Log

#### 2025-11-16: Pivot to Prompt-Based Approach
**Decision**: Use MCP prompt template instead of building custom analysis engine in MCP server

**Rationale**:
- Client agents (Claude Code) already have excellent file system access and code understanding capabilities
- No need to build custom parsers, scanners, or analysis logic in the MCP server
- Simpler implementation: writing a good prompt vs. building an engine
- More maintainable: prompt updates vs. code changes
- Aligned with project's AI-first philosophy
- Follows existing pattern: similar to `/prd-done` and other MCP prompts

**Impact**:
- **Scope reduction**: From multi-phase engine development to single prompt template creation
- **Architecture simplification**: No new MCP tools, no analysis engine modules
- **Implementation speed**: Prompt can be written and tested much faster
- **Maintenance burden**: Significantly reduced complexity
- **Local-first**: Analysis happens where client agent is connected (cwd), no remote repo handling

**Code Impact**:
- Removed: `src/core/analysis/` engine modules (never built)
- Added: `shared-prompts/analyze-project.md` prompt template
- Modified: Phase structure from 3-phase engine build to 3-phase prompt development

#### 2025-11-16: Local Project Focus
**Decision**: Analyze local project directory (cwd) instead of remote repositories

**Rationale**:
- Users invoke MCP client while already in their project directory
- Eliminates git operations, authentication, and cloning complexity
- Faster analysis with direct file system access
- Natural workflow: developers work locally, deploy from local

**Impact**:
- No git/repository handling code needed
- No authentication or remote access logic
- Simpler prompt instructions focused on local filesystem

## Risks & Mitigation

### Risk: Inaccurate Analysis Results
**Impact**: Medium - Poor deployment intent leads to suboptimal recommendations
**Probability**: Low (with good prompt design)
**Mitigation**:
- Test with diverse project types
- Iterate based on real-world usage
- Allow users to review and refine generated intent

### Risk: Language/Framework Coverage Gaps
**Impact**: Medium - Some projects may not be analyzed correctly
**Probability**: Medium (edge cases exist)
**Mitigation**:
- Focus on mainstream languages/frameworks initially
- Design prompt to gracefully handle unknowns
- Allow users to provide additional context

## Dependencies

### Prerequisites
- User is in project directory with source code
- Project contains recognizable manifest files (package.json, go.mod, etc.)

### Integration Dependencies
- Recommend tool consumes generated deployment intent (existing integration)
- PRD #225 (Dockerfile) and PRD #226 (CI/CD) are complementary but independent

## Work Log

### 2025-11-18: Scope Clarification and PRD Relationships
**Completed Work**:
- Clarified that PRD #22 focuses solely on project analysis and intent generation
- Documented relationship with PRD #225 (Dockerfile) and PRD #226 (CI/CD)
- Emphasized independence: PRDs can be used together or separately
- Added Problem Statement and Solution Overview sections
- Simplified milestones to 3 focused phases
- Removed implication that analysis directly calls recommend tool
- Updated success criteria to focus on analysis quality

**Rationale**: Keep each PRD focused on a single responsibility while enabling them to work together for complete workflows

### 2025-11-16: Strategic Pivot to Prompt-Based Implementation
**Completed Work**:
- Refactored PRD #22 from custom analysis engine to MCP prompt template approach
- Updated executive summary, requirements, and implementation phases
- Added design decision log documenting rationale for prompt-based approach
- Simplified scope from multi-phase engine development to prompt engineering
- Changed focus from remote repositories to local project analysis

**Rationale**: Leverage client agent's existing capabilities rather than building duplicate functionality in MCP server

### 2025-07-28: PRD Refactoring to Documentation-First Format
**Completed Work**: Refactored PRD #22 to follow new documentation-first guidelines with comprehensive code analysis engine features.

---

## Appendix

### Supported Analysis Types (Planned)
- **Application Type Detection**: Web apps, APIs, databases, workers, microservices
- **Framework Recognition**: Node.js, Python, Java, Go, .NET frameworks
- **Dependency Analysis**: Package files, database requirements, external services
- **Configuration Parsing**: Dockerfile, docker-compose, existing Kubernetes manifests
- **Resource Requirements**: Memory, CPU, storage estimation from code patterns

### Example Analysis Output

**Input**: Node.js Express API project

**Generated Deployment Intent**:
```
Deploy a Node.js Express REST API application with the following characteristics:
- Application Type: Web API server
- Language: Node.js (version 20)
- Framework: Express.js
- Dependencies: PostgreSQL database, Redis cache
- Port: Exposes HTTP on port 3000
- Resource Needs: Moderate CPU/memory (typical API workload)
- Scaling: Horizontal scaling supported (stateless)
- Persistence: Requires persistent database connection
- Health Check: GET /health endpoint available
```

**Usage**: This intent description can be passed to the recommend tool to generate Kubernetes manifests.

## Related PRDs

### Complete Code-to-Kubernetes Workflow
When used together, these PRDs enable complete automation:

1. **PRD #22 (This PRD)**: Analyze project → Generate deployment intent
2. **PRD #225**: Generate Dockerfile → Containerize application
3. **PRD #226**: Generate GitHub Actions → Build and publish images
4. **Existing recommend tool**: Generate Kubernetes manifests → Deploy application

Each PRD is independent and valuable on its own, but they work seamlessly together.