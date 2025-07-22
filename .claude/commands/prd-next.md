# PRD Next - Work On the Next Task

## Instructions

You are helping analyze an existing Product Requirements Document (PRD) to suggest the single highest-priority task to work on next, then discuss its design if the user confirms they want to work on it.

## Process Overview

1. **Identify Target PRD** - Determine which PRD to analyze
2. **Analyze Current Implementation** - Understand what's implemented vs what's missing
3. **Identify the Single Best Next Task** - Find the one task that should be worked on next
4. **Present Recommendation** - Give clear rationale and wait for confirmation
5. **Design Discussion** - If confirmed, dive into implementation design details

## Step 1: PRD Analysis

Ask the user which PRD to analyze, then:
- Read the PRD file from `prds/[issue-id]-[feature-name].md`
- Analyze completion status across all sections
- Identify patterns in completed vs remaining work

## Step 2: Codebase Analysis

Before assessing task priorities, analyze the current implementation state:

### Code Discovery
- **Search for related files**: Use Grep/Glob to find files related to the feature
- **Identify key modules**: Locate main implementation files mentioned in PRD
- **Find test files**: Discover existing test coverage for the feature
- **Check dependencies**: Review imports and module relationships

### Implementation Assessment
- **Compare PRD vs Code**: What's described vs actually implemented
- **Partial implementations**: Identify half-finished features or TODO comments
- **Architecture alignment**: Does current code match PRD architecture decisions
- **Quality assessment**: Code style, error handling, test coverage gaps

### Technical Feasibility Analysis
- **Dependency conflicts**: Are PRD requirements compatible with existing code
- **Breaking changes**: Will remaining tasks require refactoring existing code
- **Integration points**: How new work connects with current implementation
- **Technical debt**: Issues that might block or slow future work

## Step 3: Completion Assessment

### Analyze Checkbox States
Count and categorize all checkboxes:
- **Completed**: `[x]` items
- **Pending**: `[ ]` items  
- **Deferred**: `[~]` items
- **Blocked**: `[!]` items

### Phase Analysis
For each implementation phase:
- Calculate completion percentage
- Identify bottlenecks or stalled work
- Assess readiness to move to next phase

### Requirement Coverage
Review requirement categories:
- **Functional Requirements**: Core feature completion
- **Non-Functional Requirements**: Quality and performance aspects
- **Success Criteria**: Measurable outcomes
- **Dependencies**: External requirements
- **Risk Mitigation**: Risk management progress

## Step 4: Dependency Analysis

### Identify Critical Path Items
Look for items that:
- **Block other work** - Must be completed before others can start
- **Enable major capabilities** - Unlock significant value when completed
- **Resolve current blockers** - Remove impediments to progress

### Dependency Patterns

#### PRD-Level Dependencies
- **Sequential dependencies** - A must be done before B
- **Parallel opportunities** - Multiple items that can be worked simultaneously  
- **Foundation requirements** - Core capabilities needed by multiple features
- **Integration points** - Items that connect different parts of the system

#### Code-Level Dependencies  
- **Import dependencies** - Modules that depend on others being implemented first
- **Interface contracts** - APIs/types that must be defined before consumers
- **Database schema** - Data model changes needed before business logic
- **Test dependencies** - Tests that require certain infrastructure or mocks
- **Build/deployment** - Configuration changes that affect multiple components

## Step 5: Strategic Value Assessment

### High-Value Next Steps
Prioritize items that:
- **Unblock multiple other items** - High leverage impact
- **Deliver user-visible value** - Direct user benefit
- **Reduce technical risk** - Address major uncertainties
- **Enable validation** - Allow testing of key assumptions
- **Provide learning** - Generate insights for future work

### Low-Priority Items
Identify items that:
- **Have many dependencies** - Can't be started yet
- **Are nice-to-have** - Don't impact core value proposition
- **Are optimization-focused** - Improve existing working features
- **Require external dependencies** - Waiting on others

## Step 6: Single Task Recommendation

Present findings in this focused format:

```markdown
# Next Task Recommendation: [Feature Name]

## Recommended Task: [Specific Task Name]

**Why this task**: [2-3 sentences explaining why this is the highest priority right now]

**What it unlocks**: [What becomes possible after completing this]

**Dependencies**: [What's already complete that makes this ready to work on]

**Effort estimate**: [Realistic time estimate]

**Success criteria**: [How you'll know it's done]

---

**Do you want to work on this task?** 

If yes, I'll help you design the implementation approach. If no, let me know what you'd prefer to work on instead.
```

## Step 7: Design Discussion (If Confirmed)

If the user confirms they want to work on the recommended task, then dive into:

### Implementation Planning
- **Architecture approach**: How this fits into existing codebase
- **Key components**: What needs to be built/modified
- **Integration points**: How it connects with existing code
- **Testing strategy**: How to validate the implementation

### Design Decisions
- **Technical choices**: Framework/library decisions to make
- **Interface design**: APIs, data structures, user interfaces
- **Error handling**: How to handle failure cases
- **Performance considerations**: Scalability and optimization needs

### Implementation Steps
- **Step-by-step breakdown**: Logical sequence of implementation
- **Quick wins**: Parts that can be completed first for validation
- **Risk mitigation**: Addressing the biggest uncertainties first
- **Testing checkpoints**: When and how to validate progress

### Questions to Resolve
- **Open decisions**: Design choices that need to be made
- **Clarifications needed**: Requirements that need more detail
- **Assumptions to validate**: Things we're assuming that should be confirmed

## Intelligent Analysis Guidelines

### Critical Path Identification
Look for patterns that indicate critical dependencies:
- **Foundation items** - Basic capabilities others build on
- **Integration points** - Where different components connect
- **External dependencies** - Items waiting on outside resources
- **Bottleneck items** - Single items blocking multiple others

### Value Assessment Criteria
Evaluate items based on:
- **User impact** - Direct benefit to end users
- **Risk reduction** - Addresses major uncertainties or risks
- **Enablement factor** - Unlocks other valuable work
- **Learning potential** - Provides insights for future decisions
- **Completion ratio** - Items that are mostly done and can be finished quickly

### Effort Estimation Patterns
Consider complexity indicators:
- **New vs extension** - Building new vs extending existing
- **Research required** - Unknown vs well-understood work
- **Integration complexity** - Standalone vs requires coordination
- **Testing requirements** - Simple vs complex validation needs

### Phase Transition Signals
Indicators that a phase should be completed before moving on:
- **Core functionality** - Essential features working end-to-end
- **Quality gates** - Testing and validation complete
- **Stakeholder validation** - User/business approval obtained
- **Risk resolution** - Major uncertainties addressed

## Common Recommendation Patterns

### "Foundation First" Pattern
When basic infrastructure is incomplete:
- Prioritize core architecture and basic functionality
- Defer advanced features until foundation is solid
- Focus on getting end-to-end workflow working

### "Risk Reduction" Pattern  
When major uncertainties exist:
- Prioritize items that address biggest risks
- Build prototypes or proof-of-concepts for validation
- Focus on learning and decision-making over completion

### "User Value" Pattern
When foundation is solid but features are incomplete:
- Prioritize user-facing functionality
- Focus on completing end-to-end user workflows
- Defer internal optimizations and nice-to-haves

### "Integration" Pattern
When multiple components need to work together:
- Prioritize integration points and interfaces
- Focus on end-to-end testing and validation
- Address compatibility and communication issues

## Usage Tips

### Questions to Ask Yourself
Before making recommendations, consider:
1. **What's really blocking progress?** (Not just what's next on the list)
2. **What would deliver the most user value soonest?**
3. **What reduces the biggest risks or unknowns?**
4. **What can be done in parallel vs sequentially?**
5. **What's the minimum to get real user feedback?**

### Red Flags to Watch For
Signs that priorities might need adjustment:
- **Too many blocked items** - May indicate wrong dependency order
- **Long list of "not ready yet"** - Might suggest scope or sequencing issues
- **Uneven progress across phases** - Could indicate resource or priority problems
- **Deferred items keep growing** - May suggest scope creep or unrealistic planning

### Validation Questions for Recommendations
Before finalizing recommendations:
1. **Do the priorities make logical sense?** 
2. **Are the effort estimates realistic?**
3. **Will completing these items actually move the project forward significantly?**
4. **Are there any hidden dependencies I missed?**
5. **Does this align with overall project goals and timeline?**

## Success Criteria

This command should:
- ✅ Identify the single highest-value task to work on next based on current PRD state
- ✅ Provide clear, compelling rationale for why this specific task should be prioritized
- ✅ Wait for user confirmation before proceeding
- ✅ If confirmed, provide detailed implementation design guidance
- ✅ Keep teams focused on the most important work rather than overwhelming them with options
- ✅ Enable immediate action by transitioning from recommendation to design discussion