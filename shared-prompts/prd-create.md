---
name: prd-create
description: Create documentation-first PRDs that guide development through user-facing content
category: project-management
---

# PRD Creation Slash Command

## Instructions

You are helping create a Product Requirements Document (PRD) for a new feature. This process involves two main components:

1. **GitHub Issue**: Short, immutable concept description that links to the detailed PRD
2. **PRD File**: Project management document with milestone tracking and implementation plan

## Process

### Step 1: Understand the Feature Concept
Ask the user to describe the feature idea to understand the core concept and scope.

### Step 2: Create GitHub Issue FIRST
Create the GitHub issue immediately to get the issue ID. This ID is required for proper PRD file naming.

**IMPORTANT: Add the "PRD" label to the issue for discoverability.**

### Step 3: Create PRD File with Correct Naming
Create the PRD file using the actual GitHub issue ID: `prds/[issue-id]-[feature-name].md`

### Step 4: Update GitHub Issue with PRD Link
Add the PRD file link to the GitHub issue description now that the filename is known.

### Step 5: Create PRD as a Project Management Document
Work through the PRD template focusing on project management, milestone tracking, and implementation planning. Documentation updates should be included as part of the implementation milestones.

**Key Principle**: Focus on 5-10 major milestones rather than exhaustive task lists. Each milestone should represent meaningful progress that can be clearly validated.

**Consider Including** (when applicable to the project/feature):
- **Tests** - If the project has tests, include a milestone for test coverage of new functionality
- **Documentation** - If the feature is user-facing, include a milestone for docs following existing project patterns

**Good Milestones Examples:**
- [ ] Core functionality implemented and working
- [ ] Tests passing for new functionality (if project has test suite)
- [ ] Documentation complete following existing patterns (if user-facing feature)
- [ ] Integration with existing systems working
- [ ] Feature ready for user testing

**Avoid Micro-Tasks:**
- ❌ Update README.md file
- ❌ Write test for function X
- ❌ Fix typo in documentation
- ❌ Individual file modifications

**Milestone Characteristics:**
- **Meaningful**: Represents significant progress toward completion
- **Testable**: Clear success criteria that can be validated
- **User-focused**: Relates to user value or feature capability
- **Manageable**: Can be completed in reasonable timeframe

## GitHub Issue Template (Keep Short & Stable)

**Initial Issue Creation (without PRD link):**
```markdown
## PRD: [Feature Name]

**Problem**: [1-2 sentence problem description]

**Solution**: [1-2 sentence solution overview]

**Detailed PRD**: Will be added after PRD file creation

**Priority**: [High/Medium/Low]
```

**Don't forget to add the "PRD" label to the issue after creation.**

**Issue Update (after PRD file created):**
```markdown
## PRD: [Feature Name]

**Problem**: [1-2 sentence problem description]

**Solution**: [1-2 sentence solution overview]

**Detailed PRD**: See [prds/[actual-issue-id]-[feature-name].md](https://github.com/vfarcic/dot-ai/blob/main/prds/[actual-issue-id]-[feature-name].md)

**Priority**: [High/Medium/Low]
```

## PRD File Template

Use this structure when creating the PRD file. Include all sections marked **Required**. Include sections marked **Recommended** when applicable — they significantly improve review quality and decision traceability.

````markdown
# PRD: [Feature Name]

**Status**: Draft
**Priority**: [High/Medium/Low]
**GitHub Issue**: [#ID](https://github.com/vfarcic/dot-ai/issues/ID)
**Created**: [YYYY-MM-DD]
**Last Updated**: [YYYY-MM-DD]
**Depends on**: [Link to dependency PRDs, if any]

---

## Table of Contents
<!-- Required for PRDs over ~100 lines. Link to all H2 sections. -->

---

## Problem Statement
<!-- Required. What is broken or missing? Include specific code/config references. -->

## Proposed Solution
<!-- Required. How does this solve the problem? Include architecture diagrams (ASCII) when the feature involves multiple components or data flows. -->

## Milestone Summary
<!-- Required. One-line-per-milestone overview table for quick scanning. -->

| Milestone | Scope | Key Deliverable |
|-----------|-------|-----------------|
| **M1** | [Short name] | [One sentence] |
| **M2** | [Short name] | [One sentence] |
| ...    | ...           | ...             |

## Milestones
<!-- Required. 5-10 major milestones with task lists and success criteria. -->

### M1: [Name]
[Objective sentence]

- [ ] Task 1
- [ ] Task 2

**Success Criteria:** [How do we know M1 is done?]

## Success Criteria
<!-- Required. Must Have / Nice to Have / Success Metrics -->

## Technical Scope
<!-- Required. Modified modules table: Location | File | What Changes -->

## Dependencies
<!-- Required. External and internal dependencies, dependent PRDs. -->

## Security Considerations
<!-- Recommended. Include for any feature touching auth, secrets, network, RBAC, or external systems. Cover: credential management, backward compatibility, defense-in-depth layers, fail-fast invariants. -->

## Alternatives Considered
<!-- Recommended. Table format: Alternative | Why Not. Shows design rigor and helps reviewers understand trade-offs. -->

| Alternative | Why Not |
|-------------|---------|
| [Option A] | [Rationale] |

## References
<!-- Recommended. Link to specs, RFCs, SDK docs, K8s docs. Prefer finalized standards over draft RFCs — cite drafts as informational alignment only. -->

## Decision Log
<!-- Recommended. Tracks why decisions were made — invaluable during review and future maintenance. -->

| Date | Decision | Rationale |
|------|----------|-----------|
| [YYYY-MM-DD] | [What was decided] | [Why] |
````

### Template Usage Notes

- **Table of Contents**: Always include for PRDs over ~100 lines. Omit for short PRDs.
- **Milestone Summary Table**: Place immediately before detailed milestones. Lets reviewers scan scope in 10 seconds before diving into details.
- **Security Considerations**: Even non-auth features often touch trust boundaries in Kubernetes (ServiceAccount permissions, Secret access, network policies). Include this section proactively.
- **Alternatives Considered**: Forces design rigor during authoring and prevents "why didn't you just..." questions during review. Even 2-3 rows add significant value.
- **Decision Log**: Start with decisions made during PRD creation. Update as implementation progresses via `/prd-update-decisions`. Critical for onboarding new contributors.
- **Security Invariants**: For security-sensitive milestones, state invariants inline (e.g., "Empty credentials MUST be a hard failure, not silent degradation"). This prevents implementation drift from the PRD's intent.
- **References**: When referencing standards, prefer finalized RFCs over draft specifications. If a draft is relevant, cite it as "informational alignment" and list the finalized RFCs that back individual behaviors.

## Discussion Guidelines

### PRD Planning Questions
1. **Problem Understanding**: "What specific problem does this feature solve for users?"
2. **User Impact**: "Walk me through the complete user journey — what will change for them?"
3. **Technical Scope**: "What are the core technical changes required?"
4. **Documentation Impact**: "Which existing docs need updates? What new docs are needed?"
5. **Integration Points**: "How does this feature integrate with existing systems?"
6. **Success Criteria**: "How will we know this feature is working well?"
7. **Implementation Phases**: "How can we deliver value incrementally?"
8. **Risk Assessment**: "What are the main risks and how do we mitigate them?"
9. **Dependencies**: "What other systems or features does this depend on?"
10. **Validation Strategy**: "How will we test and validate the implementation?"
11. **Alternatives**: "What other approaches did you consider? Why not those?"
12. **Security Boundaries**: "Does this feature touch auth, secrets, network, or RBAC? What could go wrong?"

### Discussion Tips:
- **Clarify ambiguity**: If something isn't clear, ask follow-up questions until you understand
- **Challenge assumptions**: Help the user think through edge cases, alternatives, and unintended consequences
- **Prioritize ruthlessly**: Help distinguish between must-have and nice-to-have based on user impact
- **Think about users**: Always bring the conversation back to user value, experience, and outcomes
- **Consider feasibility**: While not diving into implementation details, ensure scope is realistic
- **Focus on major milestones**: Create 5-10 meaningful milestones rather than exhaustive micro-tasks
- **Think cross-functionally**: Consider impact on different teams, systems, and stakeholders

**Note**: If any `gh` command fails with "command not found", inform the user that GitHub CLI is required and provide the installation link: https://cli.github.com/

**Note**: If creating the GitHub issue fails because the "PRD" label does not exist, create the label first (`gh label create "PRD" --description "Product Requirements Document" --color 0052CC`) and then retry creating the issue.

## Workflow

1. **Concept Discussion**: Get the basic idea and validate the need
2. **Create GitHub Issue FIRST**: Short, stable concept description to get issue ID
3. **Create PRD File**: Detailed document using actual issue ID: `prds/[issue-id]-[feature-name].md`
4. **Update GitHub Issue**: Add link to PRD file now that filename is known
5. **Section-by-Section Discussion**: Work through each template section systematically
6. **Milestone Definition**: Define 5-10 major milestones that represent meaningful progress
7. **Review & Validation**: Ensure completeness and clarity

**CRITICAL**: Steps 2-4 must happen in this exact order to avoid the chicken-and-egg problem of needing the issue ID for the filename.

## Update ROADMAP.md (If It Exists)

After creating the PRD, check if `docs/ROADMAP.md` exists. If it does, add the new feature to the appropriate timeframe section based on PRD priority:
- **High Priority** → Short-term section
- **Medium Priority** → Medium-term section
- **Low Priority** → Long-term section

Format: `- [Brief feature description] (PRD #[issue-id])`

The ROADMAP.md update will be included in the commit at the end of the workflow (Option 2).

## Next Steps After PRD Creation

After completing the PRD, present the user with numbered options:

```
✅ PRD Created Successfully!

**PRD File**: prds/[issue-id]-[feature-name].md
**GitHub Issue**: #[issue-id]

What would you like to do next?

**1. Start working on this PRD now**
   Begin implementation immediately (recommended if you're ready to start)

**2. Commit and push PRD for later**
   Save the PRD and work on it later (will use [skip ci] flag)

Please enter 1 or 2:
```

### Option 1: Start Working Now

If user chooses option 1, first commit and push the PRD (same as Option 2), then instruct them:

---

**PRD committed and pushed.**

To start working on this PRD, run `/prd-start [issue-id]`

---

### Option 2: Commit and Push for Later

If user chooses option 2:

```bash
# Stage the PRD file (and ROADMAP.md if it was updated)
git add prds/[issue-id]-[feature-name].md
# If docs/ROADMAP.md exists and was updated, include it:
# git add docs/ROADMAP.md

# Commit with skip CI flag to avoid unnecessary CI runs
git commit -m "docs(prd-[issue-id]): create PRD #[issue-id] - [feature-name] [skip ci]

- Created PRD for [brief feature description]
- Defined [X] major milestones
- Documented problem, solution, and success criteria
- Added to ROADMAP.md ([timeframe] section)
- Ready for implementation"

# Pull latest and push to main
git pull --rebase origin main && git push origin main
```

**Confirmation Message:**
```
✅ PRD committed and pushed to main

The PRD is now available in the repository. To start working on it later, execute:
prd-start [issue-id]
```

## Important Notes

- **Option 1**: Best when you have time to begin implementation immediately
- **Option 2**: Best when creating multiple PRDs or planning future work
- **Skip CI flag**: Always use `[skip ci]` when committing PRD-only changes
- **Issue reference**: Include issue number in commit message for traceability