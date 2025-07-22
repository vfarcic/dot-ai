# PRD: MCP Prompts Tool - Static Prompt Library

**Created**: 2025-01-22
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-01-22

## Executive Summary
Add standard MCP Prompts support to the dot-ai MCP server to expose a curated library of standalone, static prompts that automatically become native slash commands in Claude Code (and other MCP clients), enabling seamless prompt sharing across projects and teams without file management complexity.

## Problem Statement

**Current Pain Points:**
- Useful prompts get scattered across different projects and personal collections
- Team members can't easily discover or reuse existing prompts without manual file sharing
- No systematic way to make prompts discoverable and accessible across projects/teams
- Manual `.claude/commands/` file management creates friction and version drift
- Prompts get lost or forgotten without central discoverability
- Each project requires separate prompt setup and maintenance

**Impact:**
- Developers waste time recreating prompts that already exist
- Teams lack consistency in prompt quality and approach
- Valuable prompt knowledge stays siloed in individual projects
- No scalable way to build and share a prompt library across the organization

## Proposed Solution

**MCP Prompts Integration:**
Implement standard MCP Prompts support (`prompts/list` and `prompts/get`) in the dot-ai MCP server to expose a curated library of standalone prompts that automatically become native slash commands.

**Key Capabilities:**
- **Native Slash Commands**: Prompts appear as `/mcp__dot-ai__prompt-name` in Claude Code
- **Automatic Discovery**: Type `/` to see all available prompts in the native command menu
- **Zero File Management**: No copying files or managing `.claude/commands/` directories
- **Cross-Project Sharing**: One MCP server serves all projects and team members
- **Programmatic Access**: Standard MCP protocol for agent integration
- **Instant Updates**: Add prompts to server, immediately available to all users

**User Experience:**
1. Connect to dot-ai MCP server
2. Type `/` in Claude Code
3. See `/mcp__dot-ai__*` prompts in native command menu
4. Execute like any other slash command
5. Prompts work identically to `.claude/commands/` but with centralized management

## User Stories & Use Cases

**Primary User Stories:**
- **As a developer**, I want to type `/mcp__dot-ai__code-review` and execute a proven code review prompt without having to find or copy files
- **As a team member**, I want to discover available shared prompts by typing `/` and seeing them in the familiar command menu alongside my local commands
- **As a project lead**, I want to add a useful prompt to the MCP server and have it instantly available to all team members across all projects
- **As a prompt curator**, I want to collect valuable prompts from different projects and make them accessible without requiring each project to manually copy files

**Use Case Scenarios:**

**Scenario 1: Code Review Workflow**
- Developer types `/mcp__dot-ai__code-review-security`
- Executes comprehensive security-focused code review prompt
- Same prompt available across all projects without setup

**Scenario 2: Documentation Analysis**
- Team member uses `/mcp__dot-ai__doc-analysis` 
- Standardized documentation review across projects
- Consistent quality and approach organization-wide

**Scenario 3: Architecture Planning**
- Developer executes `/mcp__dot-ai__architecture-review`
- Proven architecture analysis prompt without recreating
- Knowledge sharing from previous successful projects

**Scenario 4: Cross-Project Consistency**
- New team member connects to MCP server
- Immediately has access to all organizational prompts
- No onboarding friction or missing prompt libraries

## Requirements Tracking

### Functional Requirements
- [ ] Implement MCP Prompts specification (`prompts/list` endpoint)
- [ ] Implement MCP Prompts specification (`prompts/get` endpoint)
- [ ] Create prompt storage/management system for static prompts
- [ ] Support prompt metadata (name, description, categories)
- [ ] Ensure prompts appear as `/mcp__dot-ai__*` slash commands in Claude Code
- [ ] Enable prompt discovery through standard MCP protocol
- [ ] Support multiple prompt categories/organization
- [ ] Provide easy prompt addition/management interface
- [ ] Validate prompt format and structure
- [ ] Handle prompt not found errors gracefully
- [ ] Research and validate MCP prompts behavior in Cursor, VS Code, and other MCP-enabled coding agents
- [ ] Document compatibility differences between various MCP clients

### Non-Functional Requirements
- [ ] **Performance**: Prompt listing and retrieval under 100ms for responsive slash command experience
- [ ] **Security**: No sensitive information in prompts, secure prompt storage
- [ ] **Usability**: Intuitive prompt naming, clear descriptions, familiar slash command UX
- [ ] **Scalability**: Support 100+ prompts without performance degradation
- [ ] **Reliability**: 99.9% uptime for prompt availability, graceful error handling

### Success Criteria
- [ ] Prompts appear as native `/mcp__dot-ai__*` commands in Claude Code slash menu
- [ ] **Prompts work consistently across Cursor, VS Code, and other major MCP-enabled editors**
- [ ] Users can execute shared prompts identically to local `.claude/commands/`
- [ ] Zero setup required for new team members to access shared prompt library
- [ ] Prompt library grows to 20+ useful prompts within first month
- [ ] 100% of team members actively use at least 3 shared prompts regularly
- [ ] Elimination of manual prompt file copying/sharing within team
- [ ] Standard MCP clients can discover and use prompts programmatically
- [ ] **Compatibility documentation covers behavior differences between MCP clients**

## Implementation Progress

### Phase 1: Core MCP Prompts Infrastructure [Status: ⏳ PENDING]
**Target**: Basic MCP Prompts support working across multiple MCP clients
- [ ] Add MCP Prompts handlers to existing MCP server (src/mcp/server.ts)
- [ ] Implement `prompts/list` endpoint returning available prompts
- [ ] Implement `prompts/get` endpoint returning specific prompt content
- [ ] Create prompt storage system (file-based or embedded)
- [ ] **Research MCP prompts behavior in Cursor, VS Code, and other coding agents**
- [ ] Test prompts appear as `/mcp__dot-ai__*` commands in Claude Code
- [ ] Test prompt integration in other MCP clients (if available)
- [ ] Validate end-to-end slash command execution across clients
- [ ] Document any client-specific behavior differences
- [ ] Add error handling for missing/invalid prompts

### Phase 2: Prompt Library & Management [Status: ⏳ PENDING]
**Target**: Production-ready prompt library with 10+ useful prompts
- [ ] Design prompt metadata structure (name, description, category)
- [ ] Create initial prompt collection (code-review, documentation, architecture)
- [ ] Implement prompt organization/categorization
- [ ] Add prompt validation and testing
- [ ] Create documentation for adding new prompts
- [ ] Establish prompt naming conventions

### Phase 3: Enhanced Features [Status: ⏳ PENDING]
**Target**: Advanced prompt management and team adoption
- [ ] Add prompt search/filtering capabilities
- [ ] Implement prompt usage analytics
- [ ] Create team onboarding documentation
- [ ] Add prompt versioning support
- [ ] Build prompt contribution workflow

## Technical Implementation Checklist

### Architecture & Design
- [ ] Extend existing MCP server to support prompts capability
- [ ] Design prompt storage format (JSON/YAML files or embedded)
- [ ] Define prompt metadata schema (id, name, description, content, category)
- [ ] Plan prompt organization structure and naming conventions
- [ ] Design error handling for prompt not found scenarios
- [ ] Document MCP Prompts integration architecture

### Development Tasks
- [ ] Add `prompts` capability to MCP server capabilities list
- [ ] Implement `ListPromptsRequestSchema` and handler
- [ ] Implement `GetPromptRequestSchema` and handler
- [ ] Create prompt storage/retrieval system
- [ ] Add prompt validation logic
- [ ] Create initial prompt collection (5-10 starter prompts)
- [ ] Add comprehensive error handling
- [ ] Update TypeScript types for prompt structures

### Quality Assurance
- [ ] Unit tests for prompt list/get handlers
- [ ] Integration tests with Claude Code MCP client
- [ ] Test prompt discovery and execution workflow
- [ ] Validate slash command naming format (`/mcp__dot-ai__*`)
- [ ] Test error scenarios (missing prompts, malformed requests)
- [ ] Performance testing with large prompt libraries
- [ ] User acceptance testing with real prompts

## Dependencies & Blockers

### External Dependencies
- [ ] MCP SDK prompt handling capabilities (already available)
- [ ] Claude Code MCP client prompt integration (already supported)
- [ ] Standard MCP Prompts specification compliance

### Internal Dependencies
- [ ] Existing MCP server infrastructure (src/mcp/server.ts) - ✅ Available
- [ ] MCP server registration and capability system - ✅ Available
- [ ] TypeScript build and development environment - ✅ Available

### Current Blockers
- [ ] None currently identified - all dependencies are satisfied

## Risk Management

### Identified Risks
- [ ] **Risk**: Prompt naming conflicts with existing commands | **Mitigation**: Use consistent `mcp__dot-ai__` prefix, test naming | **Owner**: Developer
- [ ] **Risk**: Large prompt content impacting performance | **Mitigation**: Set reasonable prompt size limits, implement caching | **Owner**: Developer  
- [ ] **Risk**: Team adoption resistance due to unfamiliarity | **Mitigation**: Clear documentation, gradual rollout, training | **Owner**: Team Lead
- [ ] **Risk**: Prompt quality inconsistency | **Mitigation**: Establish review process, prompt templates, guidelines | **Owner**: Curator

### Mitigation Actions
- [ ] Create prompt contribution guidelines and review process
- [ ] Implement prompt size and format validation
- [ ] Develop comprehensive documentation and examples
- [ ] Plan gradual team introduction with high-value prompts first

## Decision Log

### Open Questions
- [ ] What prompt categories should we implement initially? (code-review, documentation, architecture, debugging)
- [ ] Should we support prompt parameters/arguments in v1 or keep strictly static?
- [ ] What's the ideal prompt storage format - separate files vs embedded data?
- [ ] How should we handle prompt versioning and updates?
- [ ] Do MCP prompts work similarly in Cursor, VS Code, and other coding agents as they do in Claude Code?
- [ ] Are there client-specific differences in prompt naming, discovery, or execution that we need to accommodate?

### Resolved Decisions
- [x] Use standard MCP Prompts specification - **Decided**: 2025-01-22 **Rationale**: Standardized approach, native Claude Code integration
- [x] Target native slash command experience - **Decided**: 2025-01-22 **Rationale**: Research confirmed MCP prompts become `/mcp__servername__prompt` commands
- [x] Static prompts only for v1 - **Decided**: 2025-01-22 **Rationale**: Simpler implementation, clear scope, meets core need
- [x] Build on existing dot-ai MCP server - **Decided**: 2025-01-22 **Rationale**: Leverage existing infrastructure, single server deployment

## Scope Management

### In Scope (Current Version)
- [x] Static prompts only (no dynamic arguments)
- [x] New standalone prompts (separate from existing workflow prompts)
- [x] Standard MCP Prompts implementation (`prompts/list`, `prompts/get`)
- [x] Native slash command integration (`/mcp__dot-ai__*`)
- [x] Basic prompt organization and metadata
- [x] File-based prompt storage
- [x] Integration with existing dot-ai MCP server

### Out of Scope (Future Versions)
- [~] Dynamic prompt arguments/parameters
- [~] Integration with existing workflow prompts (recommend, generate, etc.)
- [~] Web-based prompt management UI
- [~] Prompt analytics and usage tracking
- [~] User-submitted prompt contributions
- [~] Prompt versioning and history

### Deferred Items
- [~] Advanced prompt search and filtering - **Reason**: Complex for v1, basic list sufficient initially **Target**: Phase 3
- [~] Prompt contribution workflow - **Reason**: Need to establish core library first **Target**: Future version
- [~] Usage analytics - **Reason**: Focus on core functionality first **Target**: Phase 3
- [~] Prompt templates with parameters - **Reason**: Static prompts meet immediate need **Target**: v2.0

## Testing & Validation

### Test Coverage Requirements
- [ ] Unit tests for prompt list handler (>90% coverage)
- [ ] Unit tests for prompt get handler (>90% coverage) 
- [ ] Integration tests with MCP client
- [ ] End-to-end testing with Claude Code slash commands
- [ ] **Cross-client compatibility testing (Cursor, VS Code, other MCP clients)**
- [ ] Error scenario testing (missing prompts, invalid requests)
- [ ] Performance testing with 50+ prompts

### User Acceptance Testing
- [ ] Verify prompts appear in Claude Code `/` menu as `/mcp__dot-ai__*`
- [ ] **Test prompt discovery and execution in Cursor, VS Code, and other available MCP clients**
- [ ] Confirm slash command execution works identically to local commands
- [ ] Test prompt discovery and usage workflow across different editors
- [ ] Validate error messages are user-friendly in all supported clients
- [ ] Ensure prompt content renders correctly across different MCP clients
- [ ] **Document any client-specific differences or limitations**
- [ ] Team member testing with real-world prompts across different tools

## Documentation & Communication

### Documentation Tasks
- [ ] Update MCP server README with prompts capability
- [ ] Create prompt contribution guidelines document
- [ ] Document prompt naming conventions and best practices
- [ ] Add MCP Prompts usage examples to project documentation
- [ ] Create troubleshooting guide for common prompt issues
- [ ] Document prompt metadata schema and structure

### Communication & Training
- [ ] Team announcement of new MCP Prompts capability
- [ ] Create demo video showing slash command usage
- [ ] Prepare onboarding materials for new team members
- [ ] Establish prompt review and approval process
- [ ] Create feedback collection mechanism for prompt effectiveness

## Launch Checklist

### Pre-Launch
- [ ] All Phase 1 implementation tasks completed
- [ ] End-to-end testing with Claude Code completed
- [ ] Initial prompt library created (10+ useful prompts)
- [ ] Documentation and guidelines published
- [ ] Team training materials prepared
- [ ] Production MCP server deployment ready

### Launch
- [ ] Deploy MCP server with prompts capability
- [ ] Announce feature availability to team
- [ ] Provide team onboarding and training
- [ ] Monitor initial usage and feedback
- [ ] Resolve any immediate issues or bugs

### Post-Launch
- [ ] Collect user feedback on prompt usefulness
- [ ] Monitor prompt usage analytics
- [ ] Iterate on prompt library based on feedback
- [ ] Plan Phase 2 enhancements based on adoption
- [ ] Document lessons learned and best practices

## Appendix

### Supporting Materials
- [MCP Prompts Specification](https://modelcontextprotocol.io/docs/concepts/prompts)
- [Claude Code MCP Integration Documentation](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [Existing dot-ai MCP Server Implementation](./src/mcp/server.ts)

### Research Findings
- MCP prompts automatically become native slash commands in Claude Code
- Format: `/mcp__servername__promptname` 
- Users can discover prompts by typing `/` in Claude Code
- Prompts work identically to `.claude/commands/` but with centralized management
- No client-side setup required - prompts available immediately upon MCP server connection

### Example Prompt Structure
```json
{
  "id": "code-review-security",
  "name": "Security-Focused Code Review",
  "description": "Comprehensive security analysis prompt for code review",
  "category": "code-review",
  "content": "Please review this code with focus on security vulnerabilities..."
}
```

### Implementation References
- GitHub: [minipuft/claude-prompts-mcp](https://github.com/minipuft/claude-prompts-mcp) - Example MCP prompts server
- Community: [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) - Claude Code resources and examples