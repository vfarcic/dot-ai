# PRD Creation Slash Command

## Instructions

You are helping create a Product Requirements Document (PRD) for a new feature. This process involves two components:

1. **GitHub Issue**: Short, immutable concept description that links to the detailed PRD
2. **PRD File**: Detailed requirements document stored in `prds/` directory with comprehensive checkbox tracking

## Process

### Step 1: Understand the Feature Concept
Ask the user to describe the feature idea. Then create a short GitHub issue that captures the core concept.

### Step 2: Create Detailed PRD Through Discussion
Work through each section of the PRD template below with the user. **Discuss each section** to ensure clarity and completeness before moving to the next.

## GitHub Issue Template (Keep Short & Stable)

```markdown
## PRD: [Feature Name]

**Problem**: [1-2 sentence problem description]

**Solution**: [1-2 sentence solution overview]

**Detailed PRD**: See [prds/[issue-id]-[feature-name].md](./prds/[issue-id]-[feature-name].md)

**Priority**: [High/Medium/Low]
```

## Detailed PRD File Template (prds/[issue-id]-[feature-name].md)

```markdown
# PRD: [Feature Name]

**Created**: [Date]
**Status**: [Draft/Review/Approved/In Progress/Complete]
**Owner**: [Person/Team]
**Last Updated**: [Date]

## Executive Summary
[2-3 sentence overview of the feature and its value]

## Problem Statement
[Detailed problem description including:]
- Current state and pain points
- User impact and business consequences
- Why this problem needs solving now

## Proposed Solution
[Comprehensive solution description including:]
- Core functionality and capabilities
- Key user workflows and interactions
- High-level approach and strategy

## User Stories & Use Cases
[Detailed user scenarios:]
- As a [user type], I want [capability] so that [benefit]
- As a [user type], I want [capability] so that [benefit]
- [Include edge cases and complex scenarios]

## Requirements Tracking

### Functional Requirements
- [ ] [Specific requirement with clear acceptance criteria]
- [ ] [Specific requirement with clear acceptance criteria]
- [ ] [Specific requirement with clear acceptance criteria]
- [ ] [Specific requirement with clear acceptance criteria]

### Non-Functional Requirements
- [ ] **Performance**: [Specific metrics and targets]
- [ ] **Security**: [Security requirements and constraints]
- [ ] **Usability**: [User experience standards]
- [ ] **Scalability**: [Growth and load requirements]
- [ ] **Reliability**: [Uptime and error rate targets]

### Success Criteria
- [ ] [Quantifiable success metric]
- [ ] [User satisfaction or adoption metric]
- [ ] [Business impact metric]
- [ ] [Technical performance metric]

## Implementation Progress

### Phase 1: [Phase Name] [Status: 🔄 IN PROGRESS / ✅ COMPLETED / ⏸️ PAUSED]
**Target**: [Timeline/Milestone]
- [ ] [Key deliverable with acceptance criteria]
- [ ] [Key deliverable with acceptance criteria]
- [ ] [Key deliverable with acceptance criteria]
- [x] [Completed deliverable]
- [~] [Deferred deliverable - moved to Phase X]

### Phase 2: [Phase Name] [Status: ⏳ PENDING / 🔄 IN PROGRESS]
**Target**: [Timeline/Milestone]
- [ ] [Key deliverable with acceptance criteria]
- [ ] [Key deliverable with acceptance criteria]
- [ ] [Key deliverable with acceptance criteria]

### Phase 3: [Phase Name] [Status: ⏳ PENDING]
**Target**: [Timeline/Milestone]
- [ ] [Key deliverable with acceptance criteria]
- [ ] [Key deliverable with acceptance criteria]

## Technical Implementation Checklist

### Architecture & Design
- [ ] [Technical design decision or component]
- [ ] [Integration requirement]
- [ ] [Data model or schema definition]

### Development Tasks
- [ ] [Specific development task]
- [ ] [Testing implementation]
- [ ] [Documentation creation]

### Quality Assurance
- [ ] [Testing strategy implementation]
- [ ] [Performance validation]
- [ ] [Security review completion]

## Dependencies & Blockers

### External Dependencies
- [ ] [Dependency description and status]
- [ ] [Dependency description and status]

### Internal Dependencies
- [ ] [Internal team/system dependency]
- [ ] [Internal team/system dependency]

### Current Blockers
- [ ] [Blocker description and resolution plan]
- [ ] [Blocker description and resolution plan]

## Risk Management

### Identified Risks
- [ ] **Risk**: [Description] | **Mitigation**: [Approach] | **Owner**: [Person]
- [ ] **Risk**: [Description] | **Mitigation**: [Approach] | **Owner**: [Person]

### Mitigation Actions
- [ ] [Specific mitigation action]
- [ ] [Specific mitigation action]

## Decision Log

### Open Questions
- [ ] [Question that needs answering - include deadline]
- [ ] [Decision that needs making - include owner]
- [ ] [Research that needs completing]

### Resolved Decisions
- [x] [Decision made] - **Decided**: [Date] **Rationale**: [Reasoning]
- [x] [Decision made] - **Decided**: [Date] **Rationale**: [Reasoning]

## Scope Management

### In Scope (Current Version)
- [x] [Confirmed in-scope item]
- [x] [Confirmed in-scope item]
- [ ] [Pending scope confirmation]

### Out of Scope (Future Versions)
- [~] [Feature deferred to future version]
- [~] [Enhancement for later consideration]

### Deferred Items
- [~] [Item deferred] - **Reason**: [Why deferred] **Target**: [Future phase]
- [~] [Item deferred] - **Reason**: [Why deferred] **Target**: [Future phase]

## Testing & Validation

### Test Coverage Requirements
- [ ] [Unit test coverage target]
- [ ] [Integration test scenarios]
- [ ] [End-to-end test cases]
- [ ] [Performance test benchmarks]

### User Acceptance Testing
- [ ] [UAT scenario 1]
- [ ] [UAT scenario 2]
- [ ] [Stakeholder sign-off]

## Documentation & Communication

### Documentation Tasks
- [ ] [API documentation]
- [ ] [User guide creation]
- [ ] [Technical documentation]
- [ ] [Migration guide if applicable]

### Communication & Training
- [ ] [Stakeholder communication plan]
- [ ] [User training materials]
- [ ] [Launch communication]

## Launch Checklist

### Pre-Launch
- [ ] [Pre-launch requirement]
- [ ] [Security review completed]
- [ ] [Performance benchmarks met]

### Launch
- [ ] [Production deployment]
- [ ] [Monitoring setup]
- [ ] [User communication]

### Post-Launch
- [ ] [Success metrics monitoring]
- [ ] [User feedback collection]
- [ ] [Performance monitoring]

## Appendix
[Supporting materials:]
- Related PRDs and documents
- Research findings and data
- Competitive analysis
- User feedback and interviews
```

## Discussion Guidelines

### For Each Section, Ask:
1. **Problem Statement**: "What specific problems are users/stakeholders facing? Can you give me concrete examples of the current pain points?"
2. **Solution**: "How do you envision this solution working? Walk me through the key workflows and interactions."
3. **User Stories**: "Who are the different types of users? What are their specific needs, contexts, and goals?"
4. **Requirements**: "What are the must-have capabilities vs nice-to-have? Let's prioritize ruthlessly based on user value."
5. **Success Criteria**: "How will we measure success? What specific, measurable outcomes will indicate this is working?"
6. **Implementation**: "How should we break this into phases? What's the minimum viable version that delivers real value?"
7. **Dependencies**: "What external systems, teams, or resources do we depend on? What could block progress?"
8. **Risks**: "What could go wrong? What are the biggest risks to success and how can we mitigate them?"
9. **Scope**: "What should we explicitly NOT include in version 1? What's out of scope to prevent scope creep?"

### Discussion Tips:
- **Clarify ambiguity**: If something isn't clear, ask follow-up questions until you understand
- **Challenge assumptions**: Help the user think through edge cases, alternatives, and unintended consequences
- **Prioritize ruthlessly**: Help distinguish between must-have and nice-to-have based on user impact
- **Think about users**: Always bring the conversation back to user value, experience, and outcomes
- **Consider feasibility**: While not diving into implementation details, ensure scope is realistic
- **Plan for tracking**: Ensure requirements are specific and measurable enough to checkbox when complete
- **Think cross-functionally**: Consider impact on different teams, systems, and stakeholders

## Checkbox Legend
- `[ ]` - Not started / Pending
- `[x]` - Completed 
- `[~]` - Deferred to future phase/version
- `[!]` - Blocked (needs resolution)

## Status Indicators
- 🔄 **IN PROGRESS** - Active work happening
- ✅ **COMPLETED** - Phase/section finished
- ⏳ **PENDING** - Not yet started
- ⏸️ **PAUSED** - Temporarily stopped
- ❌ **CANCELLED** - No longer planned

## Workflow

1. **Concept Discussion**: Get the basic idea and validate the need
2. **Create GitHub Issue**: Short, stable concept description  
3. **Create PRD File**: Detailed document in `.prds/[feature-name].md`
4. **Section-by-Section Discussion**: Work through each template section systematically
5. **Checkbox Population**: Ensure all trackable items have checkboxes
6. **Link Integration**: GitHub issue references PRD file
7. **Review & Validation**: Ensure completeness and clarity

## File Management

```bash
# Create prds directory if it doesn't exist
mkdir -p prds

# Create the PRD file
touch prds/[issue-id]-[feature-name].md

# Link from GitHub issue to PRD file
[prds/[issue-id]-[feature-name].md](./prds/[issue-id]-[feature-name].md)
```

## Example Output

**GitHub Issue** (concise, stable):
```markdown
## PRD: Documentation Testing System

**Problem**: Documentation often contains outdated commands and broken examples that mislead users.

**Solution**: AI-powered system that validates documentation by executing commands and testing examples.

**Detailed PRD**: See [prds/12-documentation-testing.md](./prds/12-documentation-testing.md)

**Priority**: High
```

**PRD File** (detailed, with comprehensive checkbox tracking):
- All requirements as checkboxes for completion tracking
- Implementation phases with deliverable checkboxes
- Progress indicators and status tracking
- Decision log with resolution checkboxes
- Risk mitigation action items as checkboxes
- Testing and validation checklists
- Launch readiness checklist