---
name: prd-update-progress
description: Update PRD progress based on git commits and code changes, enhanced by conversation context
category: project-management
---

# PRD Update Progress Slash Command

## Instructions

You are helping update an existing Product Requirements Document (PRD) based on implementation work completed. This command analyzes git commits and code changes, enhanced by conversation context, to track PRD completion progress and propose evidence-based updates.

## Process Overview

1. **Identify Target PRD** - Determine which PRD to update
2. **Analyze Git Changes** - Review commits and file changes since last update
3. **Map Changes to PRD Items** - Intelligently connect code changes to requirements
4. **Propose Updates** - Suggest checkbox completions and requirement changes
5. **User Confirmation** - Verify proposals and handle edge cases
6. **Update PRD** - Apply changes and add work log entry
7. **Flag Divergences** - Alert when actual work differs from planned work

## Step 1: Smart PRD Identification

**Automatically detect target PRD using conversation context:**

1. **Current Work Context**: Look for recent conversation about specific PRD work, features, or issues
2. **Git Branch Analysis**: Check current git branch for PRD indicators (feature/prd-*, issue numbers)
3. **Recent File Activity**: Identify recently modified PRD files in `prds/` directory
4. **Todo List Context**: Check if TodoWrite tool shows PRD-specific tasks in progress

**Detection Priority Order:**
- If conversation explicitly mentions "PRD #X" or specific PRD file → Use that PRD
- If git branch contains PRD reference (e.g., "feature/prd-12-*") → Use PRD #12  
- If TodoWrite shows PRD-specific tasks → Use that PRD context
- If only one PRD file recently modified → Use that PRD
- If multiple PRDs possible → Ask user to clarify

## Step 2: Git Change Analysis

Use git tools to understand what work was completed:

### Commit Analysis
```bash
# Get recent commits (last 10-20 commits)
git log --oneline -n 20

# Get detailed changes since last PRD update
git log --since="1 week ago" --pretty=format:"%h %an %ad %s" --date=short
```

### File Change Analysis
```bash
# See what files were modified recently
git diff --name-status HEAD~10..HEAD

# Get specific changes in key directories
git diff --stat HEAD~10..HEAD
```

### Change Categorization
Identify different types of changes:
- **New files**: Indicates new functionality or components
- **Modified files**: Shows updates to existing functionality
- **Test files**: Evidence of testing implementation
- **Documentation files**: Shows documentation updates
- **Configuration files**: Indicates setup or deployment changes

## Step 3: Map Changes to PRD Requirements

### Intelligent Mapping Process
For each significant change, determine:
- **Which PRD requirement does this satisfy?**
- **What checkbox items can be marked complete?**
- **Are there any new requirements that emerged during implementation?**
- **Does the actual implementation differ from the planned approach?**

### Evidence-Based Completion
Only suggest marking items complete when there's clear evidence:
- **Code files**: Show functionality is implemented
- **Test files**: Demonstrate testing is complete
- **Documentation**: Indicates user-facing features are documented
- **Configuration**: Shows deployment/setup requirements are satisfied

### Gap Analysis
Identify potential gaps:
- **Requirements without corresponding code changes**
- **Code changes that don't map to existing requirements**
- **Missing test coverage for implemented features**
- **Implemented features without documentation updates**

## Step 4: Propose PRD Updates

### Checkbox Updates
Suggest specific checkbox completions with evidence:
```markdown
✅ Suggest completing:
- [x] Implement core authentication system (evidence: auth.ts, auth.test.ts added)
- [x] Add user session management (evidence: session-manager.ts modified)
- [x] Update API documentation (evidence: docs/api.md updated)

❓ Question these items:
- [ ] Deploy to staging environment (no deployment evidence found)
- [ ] Performance testing complete (no performance tests found)
```

### Work Log Updates
Propose adding a work log entry summarizing completed work:
```markdown
### [Date]: Implementation Progress Update
**Duration**: [X hours estimated based on commit timestamps]
**Commits**: [X commits] 
**Primary Focus**: [Main area of work based on file changes]

**Completed PRD Items**:
- [x] [Requirement] - Evidence: [specific files/changes]
- [x] [Second requirement] - Evidence: [specific files/changes]

**Additional Work Done**:
- [Unexpected work that emerged during implementation]
- [Refactoring or improvements not originally planned]

**Next Session Priorities**:
- [Items that should be worked on next based on current state]
```

## Step 5: Implementation vs Plan Analysis

### Divergence Detection
Flag when actual implementation differs from planned approach:
- **Architecture changes**: Different technical approach than originally planned
- **Scope changes**: Features added or removed during implementation
- **Requirement evolution**: User needs that became clearer during development
- **Technical discoveries**: Constraints or opportunities discovered during coding

### Update Recommendations
Suggest PRD updates when divergences are found:
- **Decision log updates**: Record why implementation approach changed
- **Requirement modifications**: Update requirements to match actual functionality
- **Architecture updates**: Revise technical approach documentation
- **Scope adjustments**: Move items between phases or update feature definitions

## Step 6: User Confirmation Process

Present proposed changes clearly:
1. **Evidence summary**: Show what work was detected
2. **Proposed completions**: List checkbox items to mark done
3. **Divergence alerts**: Highlight any plan vs reality differences
4. **Impact assessment**: Explain how updates affect overall PRD progress

Wait for user confirmation before making changes, and handle:
- **Partial acceptance**: User agrees with some but not all suggestions
- **Additional context**: User provides information not visible in git history
- **Scope clarification**: User explains work that appears to be out of scope
- **Future planning**: User wants to adjust upcoming work based on current progress
