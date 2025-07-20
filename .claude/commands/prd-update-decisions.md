# PRD Update Decisions Slash Command

## Instructions

You are updating a PRD based on design decisions, strategic changes, and architectural choices made during conversations. This command captures conceptual changes that may not yet be reflected in code but affect requirements, approach, or scope.

## Process Overview

1. **Identify Target PRD** - Determine which PRD to update
2. **Analyze Conversation Context** - Review discussions for design decisions and strategic changes
3. **Identify Decision Points** - Find architecture, workflow, requirement, or scope changes
4. **Map to PRD Sections** - Determine which parts of the PRD need updates
5. **Propose Updates** - Suggest changes to requirements, approaches, and constraints
6. **Update Decision Log** - Record new decisions with rationale and impact

## Step 1: PRD Analysis

Ask the user which PRD to update, then:
- Read the PRD file from `prds/[issue-id]-[feature-name].md`
- Understand current requirements, approach, and constraints
- Identify areas most likely to be affected by design decisions

## Step 2: Conversation Analysis

Review the conversation context for decision-making patterns:

### Design Decision Indicators
Look for conversation elements that suggest strategic changes:
- **Workflow changes**: "Let's simplify this to..." "What if we instead..."
- **Architecture decisions**: "I think we should use..." "The better approach would be..."
- **Requirement modifications**: "Actually, we don't need..." "We should also include..."
- **Scope adjustments**: "Let's defer this..." "This is more complex than we thought..."
- **User experience pivots**: "Users would prefer..." "This workflow makes more sense..."

### Specific Decision Types
- **Technical Architecture**: Framework choices, design patterns, data structures
- **User Experience**: Workflow changes, interface decisions, interaction models
- **Requirements**: New requirements, modified requirements, removed requirements
- **Scope Management**: Features added, deferred, or eliminated
- **Implementation Strategy**: Phasing changes, priority adjustments, approach modifications

## Step 3: Decision Impact Assessment

For each identified decision, assess:

### Impact Categories
- **Requirements Impact**: What requirements need to be added, modified, or removed?
- **Scope Impact**: Does this expand or contract the project scope?
- **Timeline Impact**: Does this affect project phases or delivery dates?
- **Architecture Impact**: Does this change technical constraints or approaches?
- **User Impact**: Does this change user experience or workflows?

### Decision Quality Indicators
- **Explicit Decisions**: Clear statements like "Let's do X instead of Y"
- **Implicit Decisions**: Conversations that imply a direction change
- **Consensus Indicators**: Agreement reached on approach or direction
- **Rationale Provided**: Reasoning given for why decision was made

## Step 4: PRD Update Proposals

Present findings in this structured format:

```markdown
## PRD Update Decisions Analysis for [PRD Name]
**Analysis Period**: [Conversation timeframe]
**Decision Points Identified**: [N decisions]

### 📋 Requirements Changes
Based on conversation decisions, I recommend these requirement updates:

#### New Requirements
- **[New Requirement Title]**
  - Description: "[What should be added]"
  - Rationale: "[Why this was decided based on conversation]"
  - Section: Functional/Non-Functional/Success Criteria
  - Priority: High/Medium/Low

#### Modified Requirements  
- **[Original Requirement]** → **[Modified Requirement]**
  - Change: "[What changed and why]"
  - Context: "[Conversation context that led to this change]"
  - Impact: "[How this affects other requirements]"

#### Removed Requirements
- **[Requirement to Remove]**
  - Reason: "[Why this is no longer needed]"
  - Context: "[Conversation that led to removal]"

### 🏗️ Architecture & Approach Changes
Strategic decisions that affect implementation:

- **[Architecture Decision]**
  - Decision: "[What was decided]"
  - Previous Approach: "[What was planned before]"  
  - New Approach: "[What will be done instead]"
  - Rationale: "[Why this change makes sense]"
  - PRD Impact: "[Which sections need updating]"

### 📊 Scope & Priority Changes
Project scope adjustments based on decisions:

- **Scope Expansion**: "[What was added and why]"
- **Scope Reduction**: "[What was deferred/removed and why]"
- **Priority Changes**: "[What moved up/down in priority and rationale]"

### 🎯 User Experience Decisions
UX and workflow changes that affect requirements:

- **[UX Decision]**
  - User Impact: "[How this affects user experience]"
  - Workflow Change: "[How user workflows change]"
  - Requirements Impact: "[What requirements this affects]"

### ⚙️ Implementation Strategy Changes
Changes to how the project will be executed:

- **Phase Changes**: "[How project phases were modified]"
- **Approach Changes**: "[Changes to implementation strategy]"
- **Constraint Changes**: "[New constraints or removed constraints]"

### 📝 Decision Log Updates
New decisions to add to PRD decision log:

- **Decision**: "[Clear statement of what was decided]"
- **Date**: [Decision date]
- **Rationale**: "[Why this decision was made]"
- **Alternatives Considered**: "[Other options that were discussed]"
- **Impact**: "[How this affects the project]"
- **Owner**: "[Who made or is responsible for this decision]"
```

## Step 5: User Confirmation

Ask targeted questions to validate analysis:

1. **"Did I correctly identify all the key decisions made in our discussion?"**
2. **"Are there any decisions I missed or misinterpreted?"**
3. **"Do the requirement changes accurately reflect what we decided?"**
4. **"Should any of these decisions be documented as constraints or assumptions rather than requirements?"**
5. **"Are there any dependencies or risks created by these decisions that should be noted?"**

## Step 6: PRD Updates

### Update Requirements Sections
```markdown
### Functional Requirements
- [ ] [New requirement based on conversation decision]
- [x] ~~[Removed requirement]~~ **Removed**: [Date] - [Reason from conversation]
```

### Update Decision Log
```markdown
### Resolved Decisions
- [x] **[Decision Title]** - **Decided**: [Date] **Rationale**: [Reason from conversation discussion]
```

### Update Scope Management
```markdown
### In Scope (Updated based on [Date] decisions)
- [New scope items based on decisions]

### Deferred Items  
- [~] **[Deferred Item]** - **Reason**: [Based on conversation] **Target**: [When to revisit]
```

### Add Work Log Entry (if significant changes)
```markdown
### [Date]: Strategic Decision Session
**Duration**: [Conversation length]
**Primary Focus**: [Main topics discussed]

**Key Decisions Made**:
- **Decision 1**: [What was decided and why]
- **Decision 2**: [What was decided and why]

**Requirements Impact**:
- [New requirements added]
- [Modified requirements]
- [Removed requirements]

**Scope Changes**:
- [What changed in project scope]

**Next Steps**:
- [What needs to be implemented based on decisions]
- [Any follow-up decisions needed]
```

## Decision Quality Guidelines

### High-Quality Decision Updates
- **Clear decision statements** with explicit rationale
- **Specific requirement changes** rather than vague modifications
- **Traceable reasoning** connecting conversation to PRD changes
- **Impact assessment** of how decisions affect other requirements

### Require Clarification
- **Ambiguous statements** that could be interpreted multiple ways
- **Implied decisions** without explicit confirmation
- **Technical details** that need engineering validation
- **External dependencies** that require stakeholder confirmation

## Example Analysis

```markdown
## PRD Update Decisions Analysis for Documentation Testing
**Analysis Period**: Current conversation session
**Decision Points Identified**: 3 major decisions

### 📋 Requirements Changes

#### New Requirements
- **User Workflow Selection at Session Creation**
  - Description: "Users can choose Test Only, Analyze Only, or Test & Analyze workflows"
  - Rationale: "Conversation identified need for user choice rather than forcing all users through complete workflow"
  - Section: Functional Requirements
  - Priority: High

#### Modified Requirements
- **Document Coherence Analysis** → **Document-Level Coherence Assessment**  
  - Change: "Simplified from complex cross-section coordination to document flow and meaningfulness assessment"
  - Context: "Discussion revealed original approach was over-engineered; users need simpler document-level review"
  - Impact: "Reduces complexity of ANALYZE phase implementation"

### 🏗️ Architecture & Approach Changes
- **Simplified 4-Phase Workflow**
  - Decision: "SCAN → TEST → ANALYZE → FIX with user choice of which phases to execute"
  - Previous Approach: "Complex coordination system with cascade prevention"
  - New Approach: "Simple workflow with user-driven phase selection"
  - Rationale: "Conversation revealed cascade problems are rare; simpler approach provides better UX"
  - PRD Impact: "Phase 5 requirements need complete restructuring"

Do these decision updates accurately reflect our conversation?
```

## Success Criteria

This command should:
- ✅ Accurately identify strategic decisions made in conversation
- ✅ Propose specific, actionable PRD updates based on decisions
- ✅ Connect conversation context to specific requirement changes
- ✅ Update decision logs with clear rationale and impact
- ✅ Distinguish between decisions ready for implementation vs. needing further discussion
- ✅ Maintain PRD quality while reflecting new strategic direction
- ✅ Create clear audit trail of decision-making process