---
name: prd-start
description: Start working on a PRD implementation
category: project-management
---

# PRD Start - Begin Implementation Work

## Instructions

You are helping initiate active implementation work on a specific Product Requirements Document (PRD). This command bridges the gap between PRD planning and actual development work by setting up the implementation context and providing clear next steps.

## Process Overview

1. **Auto-Detect Target PRD** - Intelligently determine which PRD to start implementing
2. **Validate PRD Readiness** - Ensure the PRD is ready for implementation
3. **Set Up Implementation Context** - Prepare the development environment
4. **Identify Starting Point** - Determine the best first implementation task
5. **Begin Implementation** - Launch into actual development work

## Step 1: Smart PRD Detection

**Auto-detect the target PRD using these context clues (in priority order):**

1. **Git Branch Analysis** - Check current branch name for PRD patterns:
   - `feature/prd-12-*` → PRD 12
   - `prd-13-*` → PRD 13
   - `feature/prd-*` → Extract PRD number

2. **Recent Git Commits** - Look at recent commit messages for PRD references:
   - "feat: PRD 12 setup" → PRD 12
   - "docs: update prd-13 requirements" → PRD 13

3. **Git Status Analysis** - Check modified/staged files for PRD clues:
   - Modified `prds/12-*.md` → PRD 12
   - Changes in PRD-specific directories

4. **Available PRDs Discovery** - List all PRDs in `prds/` directory and identify those ready for implementation

5. **Fallback to User Choice** - Only if context detection fails, ask user to specify

**PRD Detection Implementation:**
```bash
# Use these tools to gather context:
# 1. Check git branch: gitStatus shows current branch
# 2. Check git status: Look for modified PRD files  
# 3. List PRDs: Use LS or Glob to find prds/*.md files
# 4. Recent commits: Use Bash 'git log --oneline -n 5' for recent context
```

**Detection Output:**
```markdown
🚀 **Starting work on PRD [X]** ([Feature Name])
- Branch: `feature/prd-[X]-[feature-name]` ✅
- PRD file: `prds/[X]-[feature-name].md` ✅
- Current status: Ready for implementation ✅
```

## Step 2: PRD Readiness Validation

Before starting implementation, validate that the PRD is ready:

### Requirements Validation
- **Functional Requirements**: Are core requirements clearly defined and complete?
- **Success Criteria**: Are measurable success criteria established?
- **Dependencies**: Are all external dependencies identified and available?
- **Risk Assessment**: Have major risks been identified and mitigation plans created?

### Documentation Analysis
For documentation-first PRDs:
- **Specification completeness**: Is the feature fully documented with user workflows?
- **Integration points**: Are connections with existing features documented?
- **API/Interface definitions**: Are all interfaces and data structures specified?
- **Examples and usage**: Are concrete usage examples provided?

### Implementation Readiness Checklist
```markdown
## PRD Readiness Check
- [ ] All functional requirements defined ✅
- [ ] Success criteria measurable ✅  
- [ ] Dependencies available ✅
- [ ] Documentation complete ✅
- [ ] Integration points clear ✅
- [ ] Implementation approach decided ✅
```

## Step 3: Implementation Context Setup

### Git Branch Management
**If not already on a feature branch:**
```bash
# Create feature branch for PRD implementation
git checkout -b feature/prd-[issue-id]-[feature-name]
git push -u origin feature/prd-[issue-id]-[feature-name]
```

### Development Environment Setup
- **Dependencies**: Install any new dependencies required by the PRD
- **Configuration**: Set up any configuration needed for development
- **Test data**: Prepare test data or mock services
- **Documentation tools**: Ensure documentation generation tools are available

### Implementation Tracking Setup
- **Mark PRD as "In Progress"**: Update PRD status section
- **Create implementation log**: Add initial work log entry with start date
- **Set up progress tracking**: Identify key milestones for progress updates

## Step 4: Identify Implementation Starting Point

### Critical Path Analysis
Identify the highest-priority first task by analyzing:
- **Foundation requirements**: Core capabilities that other features depend on
- **Blocking dependencies**: Items that prevent other work from starting
- **Quick wins**: Early deliverables that provide validation or value
- **Risk mitigation**: High-uncertainty items that should be tackled early

### Implementation Phases
For complex PRDs, identify logical implementation phases:
1. **Phase 1 - Foundation**: Core data structures, interfaces, basic functionality
2. **Phase 2 - Integration**: Connect with existing systems, implement workflows
3. **Phase 3 - Enhancement**: Advanced features, optimization, polish
4. **Phase 4 - Validation**: Testing, documentation updates, deployment

### First Task Recommendation
Select the single best first task based on:
- **Dependency analysis**: No blocking dependencies
- **Value delivery**: Provides meaningful progress toward PRD goals
- **Learning opportunity**: Generates insights for subsequent work
- **Validation potential**: Allows early testing of key assumptions

## Step 5: Begin Implementation

### Implementation Kickoff
Present the implementation plan:

```markdown
# 🚀 Starting Implementation: [PRD Name]

## Selected First Task: [Task Name]

**Why this task first**: [Clear rationale for why this is the optimal starting point]

**What you'll build**: [Concrete description of what will be implemented]

**Success criteria**: [How you'll know this task is complete]

**Estimated effort**: [Time estimate]

**Next steps after this**: [What becomes possible once this is done]

## Implementation Approach
[Brief technical approach and key decisions]

## Ready to Start?
Type 'yes' to begin implementation, or let me know if you'd prefer to start with a different task.
```

### Implementation Launch
If confirmed, provide:
- **Detailed task breakdown**: Step-by-step implementation guide
- **Code structure recommendations**: Files to create/modify
- **Testing approach**: How to validate the implementation
- **Progress checkpoints**: When to update the PRD with progress

### Progress Tracking Setup
- **Update PRD status**: Mark relevant items as "in progress"
- **Commit initial setup**: Make initial commit with branch and any setup changes
- **Documentation updates**: Add PRD traceability comments to any docs being implemented

## Success Criteria

This command should:
- ✅ Successfully identify the target PRD for implementation
- ✅ Validate that the PRD is ready for development work
- ✅ Set up proper implementation context (branch, environment, tracking)
- ✅ Identify the optimal first implementation task
- ✅ Provide clear, actionable next steps for beginning development
- ✅ Bridge the gap between planning and actual coding work
- ✅ Ensure proper progress tracking is established from the start

## Notes

- This command is designed for PRDs that are ready to move from planning to implementation
- Use `prd-next` for ongoing implementation guidance on what to work on next
- Use `prd-update-progress` to track implementation progress against PRD requirements
- Use `prd-done` when PRD implementation is complete and ready for deployment/closure