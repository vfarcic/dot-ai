# PRD Next - Work On the Next Task

## Instructions

You are helping analyze an existing Product Requirements Document (PRD) to suggest what should be worked on next. This command intelligently prioritizes remaining work based on dependencies, completion status, and strategic value.

## Process Overview

1. **Identify Target PRD** - Determine which PRD to analyze
2. **Analyze Current State** - Review completion status and progress
3. **Identify Blockers** - Find items that are preventing other work
4. **Assess Dependencies** - Understand what depends on what
5. **Evaluate Strategic Value** - Consider impact and business value
6. **Generate Prioritized Recommendations** - Suggest specific next steps
7. **Provide Rationale** - Explain why these are the right next steps

## Step 1: PRD Analysis

Ask the user which PRD to analyze, then:
- Read the PRD file from `prds/[issue-id]-[feature-name].md`
- Analyze completion status across all sections
- Identify patterns in completed vs remaining work

## Step 2: Completion Assessment

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

## Step 3: Dependency Analysis

### Identify Critical Path Items
Look for items that:
- **Block other work** - Must be completed before others can start
- **Enable major capabilities** - Unlock significant value when completed
- **Resolve current blockers** - Remove impediments to progress

### Dependency Patterns
- **Sequential dependencies** - A must be done before B
- **Parallel opportunities** - Multiple items that can be worked simultaneously  
- **Foundation requirements** - Core capabilities needed by multiple features
- **Integration points** - Items that connect different parts of the system

## Step 4: Strategic Value Assessment

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

## Step 5: Recommendation Format

Present findings in this structured format:

```markdown
# PRD Next Steps Analysis: [Feature Name]

## Current Status Summary
**Overall Completion**: [X]% complete
**Active Phase**: [Phase name and status]
**Total Pending Items**: [N] items across [N] categories

### Completion Breakdown
- **Functional Requirements**: [X/Y] complete ([Z]%)
- **Non-Functional Requirements**: [X/Y] complete ([Z]%)
- **Implementation Phases**: [X/Y] complete ([Z]%)
- **Risk Mitigation**: [X/Y] complete ([Z]%)

## 🚨 Critical Blockers (Address Immediately)
Items currently blocking other work or causing delays:

1. **[Blocker Item]**
   - **Why Critical**: [Explanation of impact]
   - **Blocks**: [List of dependent items]
   - **Effort**: [Estimated time/complexity]
   - **Owner**: [Who should handle this]

## 🎯 High-Priority Next Steps (Start This Week)
Most valuable items to work on next:

1. **[High-Priority Item]**
   - **Value**: [Why this is high value]
   - **Dependencies Met**: [Required items already complete]
   - **Enables**: [What this unlocks]
   - **Effort**: [Estimated time/complexity]
   - **Success Criteria**: [How to know it's done]

2. **[Another High-Priority Item]**
   - **Value**: [Impact and benefits]
   - **Risk Reduction**: [Uncertainties this addresses]
   - **Effort**: [Time investment required]

## ⚡ Quick Wins (Can Complete Soon)
Low-effort, high-value items that can be knocked out quickly:

1. **[Quick Win Item]** - [Brief description of value and minimal effort required]
2. **[Another Quick Win]** - [Impact and ease of completion]

## 🔄 Parallel Work Opportunities
Items that can be worked on simultaneously without conflicts:

**Track A**: [Item group that can be worked together]
- [Item 1]
- [Item 2]

**Track B**: [Another independent group]
- [Item 3]
- [Item 4]

## ⏳ Not Ready Yet (Future Consideration)
Items that have unmet dependencies or are premature:

1. **[Future Item]** - **Depends on**: [Required completions] | **Target**: [When to revisit]
2. **[Another Future Item]** - **Reason**: [Why not ready] | **Trigger**: [What needs to happen first]

## 📊 Phase Transition Analysis
**Current Phase**: [Phase name] ([X]% complete)
**Ready for Next Phase?**: [Yes/No with rationale]
**Remaining for Phase Completion**: [List of items needed to finish current phase]

## 🎯 Recommended Focus for Next Sprint/Week

### Primary Goal: [Main objective]
[2-3 sentence description of what should be the main focus]

### Sprint Backlog (Prioritized):
1. **[Top Priority Item]** - [Brief rationale]
2. **[Second Priority Item]** - [Brief rationale]  
3. **[Third Priority Item]** - [Brief rationale]

### Success Metrics:
- [ ] [Specific measurable outcome 1]
- [ ] [Specific measurable outcome 2]
- [ ] [Specific measurable outcome 3]

## 💡 Strategic Recommendations

### Consider Scope Adjustments:
- **Defer**: [Items that could be moved to later] - [Rationale]
- **Prioritize**: [Items that should be moved up] - [Rationale]

### Resource Allocation:
- **Skill Requirements**: [What expertise is needed for next steps]
- **Time Investment**: [Realistic effort estimates]
- **External Dependencies**: [What you're waiting on from others]

### Risk Mitigation:
- **Biggest Risk**: [Current highest risk item]
- **Mitigation Strategy**: [Recommended approach]
- **Contingency Plan**: [What to do if things go wrong]
```

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
- ✅ Accurately identify the most valuable next steps based on current PRD state
- ✅ Provide clear rationale for prioritization decisions
- ✅ Identify and highlight critical blockers that need immediate attention
- ✅ Suggest realistic scope and timeline for next work iteration
- ✅ Consider both technical dependencies and business value in recommendations
- ✅ Help teams maintain momentum and avoid getting stuck or working on wrong priorities