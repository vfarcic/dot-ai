# PRD: Code Analysis Engine for Automated Recommendation Input

**Created**: 2025-07-28
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-12-03

## Executive Summary
Create a deep project analysis capability that automatically generates comprehensive deployment intent descriptions for the recommendation tool. When users provide vague intents like "deploy my app", the system instructs the client agent (Claude Code) to analyze the entire codebase and discover ALL deployment requirements - not just the main application, but databases, caches, message queues, and any other infrastructure dependencies.

**Key Innovation**: Integrates into the existing recommend tool's clarification workflow. Instead of asking users questions, the MCP returns analysis instructions that the client agent executes automatically, producing a detailed deployment intent without manual user input.

**Note**: This PRD is complementary to but independent from:
- **PRD #225 (Dockerfile Generation)**: Containerization of applications
- **PRD #226 (GitHub Actions CI/CD)**: Build and publish automation
- All three can be used together for complete code-to-Kubernetes automation, or independently as needed.

## Documentation Changes

### Files Created/Updated
- **`.claude/commands/analyze-project.md`** - Temporary - Claude Code slash command for development/testing (deleted after validation)
- **`prompts/analyze-project.md`** - New File - MCP internal prompt returned in recommend workflow
- **`src/tools/recommend.ts`** - Modified - Return analysis instructions in clarification response
- **`docs/mcp-guide.md`** - MCP Documentation - Document the automated analysis workflow
- **`README.md`** - Project Overview - Add automated project analysis to core capabilities

### Content Location Map
- **Production Prompt**: See `prompts/analyze-project.md` (returned by recommend tool)
- **Feature Overview**: See `docs/mcp-guide.md` (Section: "Automated Project Analysis")
- **Usage Examples**: See `docs/mcp-guide.md` (Section: "Project Analysis Examples")

**Note**: The slash command is temporary for development iteration only. Final deployment has no standalone command - analysis is only available as part of the recommend workflow.

### User Journey Validation
- [ ] **Development validation**: `/analyze-project` slash command produces accurate, comprehensive analysis (temporary)
- [ ] **Production workflow**: User calls recommend with vague intent → MCP returns analysis instructions → Client agent analyzes → Calls recommend with detailed intent
- [ ] **Deep analysis**: Analysis discovers ALL deployment components (app + databases + caches + queues + etc.)
- [ ] **Prompt effectiveness**: Produces accurate, comprehensive deployment intent descriptions across different project types

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

### Two-Phase Development Approach

**Phase 1: Slash Command Development** (`.claude/commands/analyze-project.md`) - TEMPORARY
- Develop and iterate on the analysis prompt as a Claude Code slash command
- Fast iteration cycle: edit markdown → run `/analyze-project` → observe results → refine
- No build step required, pure prompt engineering
- **Delete slash command after validation complete**

**Phase 2: MCP Integration** (`prompts/analyze-project.md` + `src/tools/recommend.ts`) - PRODUCTION
- Move validated prompt to `prompts/` directory
- Modify recommend tool to return analysis instructions in `agentInstructions` field
- Client agent automatically analyzes codebase and calls recommend with detailed intent
- **No standalone command in production** - analysis only available via recommend workflow

### Deep Analysis Requirements

The analysis must discover the **complete deployment landscape**, not just the main application:

1. **Main Application** - Language, framework, application type, entry point
2. **Infrastructure Dependencies** - Databases (PostgreSQL, MySQL, MongoDB), caches (Redis, Memcached), message queues (RabbitMQ, Kafka), pub/sub systems
3. **Service Configuration** - Ports, protocols, health endpoints, environment variables
4. **Deployment Characteristics** - Stateless vs stateful, scaling requirements, persistence needs
5. **Access Requirements** - Internal only vs public-facing, ingress needs, TLS requirements
6. **Resource Estimates** - CPU, memory, storage based on application patterns

### Workflow Integration

**Current recommend workflow:**
```
User: "deploy my app" → MCP: Returns clarification questions → User: Answers manually → MCP: Generates recommendations
```

**New workflow:**
```
User: "deploy my app" → MCP: Returns analysis instructions → Client Agent: Analyzes codebase automatically → Client Agent: Calls recommend with detailed intent → MCP: Generates recommendations
```

The workflow remains two-step (initial intent → final intent), but the refinement happens automatically through code analysis instead of manual user input.

## Success Criteria

### Functional Requirements
- ✅ Accurately identifies application type (web app, API, worker, database, etc.)
- ✅ Detects language and framework correctly
- ✅ **Deep dependency discovery**: Identifies ALL infrastructure dependencies (databases, caches, message queues, pub/sub)
- ✅ Estimates resource requirements (CPU, memory, storage)
- ✅ Detects port exposure and protocol requirements
- ✅ Identifies public vs internal access requirements
- ✅ Determines stateless vs stateful characteristics
- ✅ Generates clear, comprehensive deployment intent descriptions covering ALL components

### Quality Requirements
- ✅ Works consistently across different project types and languages
- ✅ **Thoroughness over speed**: Deep analysis that discovers everything, not quick superficial scans
- ✅ Generated intent descriptions are human-readable and clear
- ✅ Descriptions provide sufficient detail for recommend tool to generate complete infrastructure

### Integration Requirements
- ✅ Integrates into recommend tool's clarification workflow via `agentInstructions`
- ✅ Generated intent descriptions work seamlessly with recommend tool
- ✅ Works in Claude Code environment (and other MCP clients that can execute file analysis)

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

### Milestone 1: Slash Command Development (Temporary)
- [ ] `.claude/commands/analyze-project.md` created with deep analysis guidance
- [ ] Project detection patterns (language, framework, app type)
- [ ] Deep dependency discovery (databases, caches, queues, pub/sub)
- [ ] Service configuration detection (ports, protocols, env vars)
- [ ] Deployment characteristics (stateless/stateful, scaling, persistence)
- [ ] Output format produces structured deployment intent

### Milestone 2: Validation with Diverse Projects
- [ ] Tested with Node.js/TypeScript project (with database dependencies)
- [ ] Tested with Go project (with cache/queue dependencies)
- [ ] Tested with Python project (optional, if available)
- [ ] Deep analysis discovers ALL deployment components
- [ ] Generated intents work well with recommend tool

### Milestone 3: MCP Integration
- [ ] Move validated prompt to `prompts/analyze-project.md`
- [ ] Modify `src/tools/recommend.ts` to return analysis instructions in `agentInstructions`
- [ ] Delete `.claude/commands/analyze-project.md` slash command
- [ ] End-to-end workflow test: vague intent → auto-analysis → detailed intent → recommendations

### Milestone 4: Documentation Complete
- [ ] `docs/mcp-guide.md` updated with automated analysis workflow
- [ ] Usage examples documented
- [ ] README.md updated with analysis capabilities

## Design Decisions

### Decision Log

#### 2025-12-03: Integration into Recommend Workflow
**Decision**: Analysis prompt integrates into the existing recommend tool's clarification flow rather than being a standalone feature

**Rationale**:
- Recommend tool already has a two-step workflow (initial intent → clarification → final intent)
- Instead of asking users questions, return instructions for client agent to analyze codebase
- Zero user effort - analysis happens automatically
- Same workflow structure, different refinement mechanism

**Impact**:
- **Workflow change**: `agentInstructions` field returns analysis prompt instead of user questions
- **No new MCP tools**: Reuses existing recommend tool infrastructure
- **Client agent responsibility**: Client (Claude Code) performs the analysis, not MCP server

#### 2025-12-03: Temporary Slash Command for Development
**Decision**: Develop prompt as `.claude/commands/analyze-project.md` slash command, delete after validation

**Rationale**:
- Fast iteration: edit markdown → run command → see results → refine
- No build cycle or MCP server restarts needed
- Pure prompt engineering without code changes
- Once validated, move to `prompts/` and integrate into recommend tool

**Impact**:
- Development uses `/analyze-project` slash command
- Production has no standalone command - analysis only via recommend workflow
- Slash command deleted after prompt is finalized

#### 2025-12-03: Deep Dependency Analysis Requirement
**Decision**: Analysis must discover the complete deployment landscape, not just the main application

**Rationale**:
- Applications rarely run in isolation - they need databases, caches, queues, etc.
- Shallow analysis leads to incomplete recommendations
- User shouldn't have to manually specify infrastructure dependencies the code reveals
- Following principle from Dockerfile prompt: "Thoroughness over speed"

**Impact**:
- Prompt must instruct deep code analysis for database connections, cache usage, queue consumers, etc.
- Output includes ALL deployment components, not just the app
- Longer analysis time acceptable for comprehensive results

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

**Input**: Node.js Express API project with database and cache dependencies

**Generated Deployment Intent**:
```
Deploy a complete application stack with the following components:

## Primary Application
- Type: REST API server
- Language: Node.js 20
- Framework: Express.js
- Image: node:20-alpine (or custom if Dockerfile exists)
- Port: 3000 (HTTP)
- Protocol: HTTP/REST
- Access: Public (requires ingress)
- Scaling: Horizontal (stateless)
- Replicas: 2+ recommended
- Resources: 256Mi-512Mi memory, 100m-500m CPU

## Database: PostgreSQL
- Purpose: Primary data store (detected from pg/prisma/sequelize usage)
- Version: 15 (from connection string or package version)
- Storage: Persistent (10Gi+ recommended)
- Access: Internal only
- Scaling: Single instance or HA cluster

## Cache: Redis
- Purpose: Session storage and caching (detected from ioredis/redis usage)
- Version: 7
- Storage: Ephemeral or persistent depending on usage patterns
- Access: Internal only

## Environment Variables Required
- DATABASE_URL: PostgreSQL connection string
- REDIS_URL: Redis connection string
- NODE_ENV: Runtime environment
- PORT: Application port (default 3000)

## Health & Readiness
- Health endpoint: GET /health
- Readiness endpoint: GET /ready (if different)
```

**Usage**: This comprehensive intent is passed to the recommend tool with `final: true` to generate Kubernetes manifests for ALL components.

## Related PRDs

### Complete Code-to-Kubernetes Workflow
When used together, these PRDs enable complete automation:

1. **PRD #22 (This PRD)**: Analyze project → Generate deployment intent
2. **PRD #225**: Generate Dockerfile → Containerize application
3. **PRD #226**: Generate GitHub Actions → Build and publish images
4. **Existing recommend tool**: Generate Kubernetes manifests → Deploy application

Each PRD is independent and valuable on its own, but they work seamlessly together.