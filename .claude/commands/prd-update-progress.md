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

## Step 1: PRD Identification

Ask the user which PRD to update, then:
- Locate the PRD file in `prds/[issue-id]-[feature-name].md`
- Read current PRD content to understand planned work
- Extract last update date from PRD metadata or work log

## Step 2: Enhanced Code Analysis

Analyze changes since last update using both git data and conversation context:

```bash
# Get commits since last PRD update
git log --since="[last-update-date]" --oneline --name-only

# Get detailed diff statistics
git diff [last-commit-hash]..HEAD --stat

# Get list of changed files with change types
git diff [last-commit-hash]..HEAD --name-status
```

**Enhanced Analysis with Context:**
- **Code changes** (what was modified) + **Conversation context** (why and what it implements)
- **File additions** + **Discussion of new features** → Confirm feature completion
- **Large modifications** + **Architecture discussions** → Understand design decisions
- **Test files** + **Testing conversations** → Validate quality requirements
- **Bug fix commits** + **Problem discussions** → Map to specific PRD issues
- **Refactoring work** + **Technical debt conversations** → Assess non-functional requirements

## Step 3: Intelligent Mapping

### Generic Change Analysis
Analyze changes using universal patterns that work across any project:

#### File Change Patterns
- **New files created** → Potential new features or capabilities implemented
- **Existing files heavily modified** → Feature enhancements or major changes
- **Multiple files in same directory** → Coordinated work on related functionality
- **Configuration/build files** → Infrastructure or deployment work
- **Documentation files** → Documentation requirements completion

#### Change Volume Analysis
- **Large additions (+100 lines)** → Significant feature work likely completed
- **Small modifications (<50 lines)** → Bug fixes, minor enhancements, or refinements
- **Deletions** → Cleanup, refactoring, or feature removal
- **Renames/moves** → Code organization or architecture changes

#### Universal Commit Message Patterns
Look for common patterns across projects (regardless of specific convention):
- Keywords: `implement`, `add`, `create` → New feature work
- Keywords: `fix`, `resolve`, `correct` → Bug fixes and quality improvements
- Keywords: `update`, `improve`, `enhance` → Feature improvements
- Keywords: `test`, `spec`, `coverage` → Testing work
- Keywords: `doc`, `readme`, `guide` → Documentation work
- Keywords: `refactor`, `clean`, `organize` → Code quality improvements

#### Directory Structure Analysis
Dynamically identify project patterns by analyzing the actual directory structure:
- **Test directories** (any directory containing test files) → Testing work
- **Documentation directories** (docs/, documentation/, etc.) → Documentation work
- **Configuration directories** (config/, .github/, etc.) → Infrastructure work
- **Main source directories** → Core feature development

## Step 4: Proposed Updates Format

Present findings in structured format:

```markdown
## PRD Update Analysis for [PRD Name]
**Analysis Period**: [last-update-date] to [current-date]
**Commits Analyzed**: [N commits]
**Files Changed**: [N files]

### ✅ Suggested Completions
Based on code changes and conversation context, I recommend marking these items complete:

- [x] **[Requirement text]** 
  - Code Evidence: `[file changes that support completion]`
  - Context Evidence: `[conversation discussion that confirms intent/completion]`
  - Confidence: High/Medium/Low

- [x] **[Another requirement]**
  - Code Evidence: `[supporting changes]`
  - Context Evidence: `[discussion that validates completion]`
  - Confidence: High/Medium/Low

### 📝 Proposed Requirement Changes
I detected work that suggests new or modified requirements:

- **New Requirement**: "[Inferred requirement]"
  - Evidence: `[files/features that suggest this]`
  - Proposed Section: [Functional/Non-Functional/etc.]

- **Modified Requirement**: "[Original]" → "[Suggested change]"
  - Evidence: `[what changed in implementation]`
  - Rationale: [Why the change makes sense]

### ⚠️ Unexpected Work Detected
Work done that wasn't planned in the PRD:

- **Unplanned Work**: [Description of work]
  - Files: `[changed files]`
  - Should we: Add to PRD / Document as tech debt / Mark as one-off

### 🔍 Potential Gaps
PRD items that might be complete but I couldn't verify:

- **[Requirement text]** - No clear code evidence, may need manual verification
- **[Another requirement]** - Complex requirement, needs human assessment

### 📊 Work Summary
- **Estimated Effort**: [Hours based on commit timestamps and file changes]
- **Primary Focus Areas**: [Most changed file types/directories]
- **Quality Indicators**: [Test coverage, documentation, etc.]
```

## Step 5: User Confirmation

Ask targeted questions:

1. **"Are my completion suggestions accurate?"**
2. **"Did I miss any completed work that doesn't show in code changes?"** (research, meetings, design decisions)
3. **"Should the unexpected work be added to the PRD or documented separately?"**
4. **"Are there any requirement changes I missed or misinterpreted?"**
5. **"Any blockers or challenges encountered that should be documented?"**

## Step 6: PRD Updates

### Update Checkboxes
```markdown
# Before
- [ ] Implement JSON result format

# After  
- [x] Implement JSON result format
```

### Add New Requirements (if needed)
```markdown
### Functional Requirements
- [ ] [New requirement based on actual implementation]
```

### Update Phase Status
```markdown
### Phase 2: Core Features ✅ **COMPLETED** (Updated: 2025-07-19)
**Completed**: 2025-07-19
- [x] All phase 2 tasks completed
```

### Add Work Log Entry
```markdown
## Work Log

### [Date]: [Work Session Title] 
**Duration**: [Estimated hours based on git timestamps]
**Commits**: [Number of commits]
**Primary Focus**: [Main area of work]

**Completed PRD Items**:
- [x] [Requirement 1] - [Brief description of implementation]
- [x] [Requirement 2] - [Brief description of implementation]

**Additional Work Done**:
- [Unplanned work item 1] - [Why it was needed]
- [Unplanned work item 2] - [Context and rationale]

**Technical Decisions Made**:
- **Decision**: [Key technical decision]
- **Rationale**: [Why this approach was chosen]
- **Impact**: [Effect on future work or requirements]

**Challenges Encountered**:
- [Challenge 1] - [How it was resolved]
- [Challenge 2] - [Current status]

**Quality Metrics**:
- **Tests Added**: [Number/type of tests]
- **Code Coverage**: [If measurable]
- **Performance Impact**: [If applicable]

**Lessons Learned**:
- [Key insight about the work]
- [Process improvement identified]

**Next Session Priorities**:
- [What should be tackled next]
- [Dependencies to resolve]

**Files Modified**: 
`[List of key files changed for reference]`
```

## Step 7: Divergence Detection

### Planning vs Reality Analysis
Compare planned work (PRD checkboxes) with actual work (git changes):

```markdown
### 🚨 Divergence Analysis

**Scope Expansion Detected**:
- Planned: Simple result format
- Actual: Complex two-phase validation system  
- Impact: Significant scope increase, likely affects timeline
- Recommendation: Update requirements to reflect actual scope

**Unplanned Quality Work**:
- Extensive bug fixes and edge case handling
- Suggests initial estimates were optimistic
- Recommendation: Add quality assurance buffer to future estimates

**Technology Decisions**:
- Adopted new approach: [Description]
- Not documented in original PRD
- Recommendation: Update technical constraints section
```

## Intelligence Guidelines

### High Confidence Indicators (Code + Context)
- **Large file additions** (>100 lines) + **Discussion of implementing specific feature** → Feature completion confirmed
- **New test files created** + **Testing strategy conversations** → Testing requirements validated  
- **Documentation file updates** + **Documentation requirements discussion** → Documentation completion confirmed
- **Multiple related files modified** + **Architecture discussion** → Coordinated feature implementation with design context

### Medium Confidence Indicators (Code + Context)
- **Moderate code additions** (50-100 lines) + **Enhancement discussions** → Feature improvement confirmed
- **Configuration changes** + **Deployment conversations** → Infrastructure work validated
- **Refactoring commits** + **Code quality discussions** → Technical debt reduction confirmed
- **Bug fix patterns** + **Problem-solving conversations** → Issue resolution validated

### Enhanced Confidence with Context
- **Conversation clarifies intent**: Code changes + discussion explains which PRD item is addressed
- **Architecture decisions revealed**: Technical discussions explain WHY code was structured this way
- **Completion criteria discussed**: Conversations validate whether work truly meets requirements
- **Edge cases covered**: Discussion of testing and validation approaches

### Require Human Input
- Research and design decisions
- Stakeholder meetings and approvals
- External dependency resolution
- Performance testing results
- User feedback incorporation

## Example Analysis Output

```markdown
## PRD Update Analysis for [Feature Name]
**Analysis Period**: [last-update-date] to [current-date]
**Commits Analyzed**: [N] commits  
**Files Changed**: [N] files

### ✅ Suggested Completions
- [x] **[Requirement Description]**
  - Evidence: `[File changes: 3 new files added totaling 250+ lines, indicating substantial feature implementation]`
  - Confidence: High

- [x] **[Another Requirement]**  
  - Evidence: `[Multiple test files created, suggesting testing requirements completion]`
  - Confidence: High

### 📝 Proposed Requirement Changes
- **New Requirement**: "[Inferred from implementation]"
  - Evidence: `[Large code additions and new functionality not originally planned]`
  - Proposed Section: Functional Requirements

### ⚠️ Unexpected Work Detected  
- **Unplanned Work**: [Description of work done that wasn't in PRD]
  - Files: `[List of files with significant changes]`
  - Should we: Add to PRD / Document as technical debt / Mark as one-off

Do these suggestions look accurate? Any completed work I missed?
```

## Success Criteria

The command should:
- ✅ Accurately map 80%+ of code changes to PRD items
- ✅ Propose realistic checkbox completions with evidence
- ✅ Detect when actual work diverges from planned work
- ✅ Create comprehensive work log entries
- ✅ Flag potential requirement changes based on implementation
- ✅ Minimize user effort while maximizing accuracy
- ✅ Maintain clear audit trail of work completed vs planned