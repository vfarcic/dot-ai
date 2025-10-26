<!-- PRD-182 -->
# PRD: Enhance prd-done with PR Template Integration

**Status**: Open
**Created**: 2025-01-27
**Priority**: Medium
**GitHub Issue**: [#182](https://github.com/vfarcic/dot-ai/issues/182)

---

## Problem Statement

The current `prd-done` workflow creates pull requests with vague guidance to use "comprehensive descriptions" but lacks:

- **Template detection**: No awareness of project PR templates
- **Intelligent auto-fill**: Manual entry of information that could be extracted from git
- **Consistency**: Different users create PRs with varying formats and completeness
- **Efficiency**: Users must manually determine what information to include
- **Project integration**: No connection between project-setup tool's PR template generation and prd-done usage

This results in inconsistent PRs, missing information, and wasted time manually constructing PR descriptions.

## Solution Overview

Enhance the `prd-done` shared prompt to:

1. **Detect PR templates** in common locations (`.github/PULL_REQUEST_TEMPLATE.md`, etc.)
2. **Analyze git changes** to automatically extract PR information (type, files affected, scope)
3. **Auto-fill template sections** with information deduced from commits and PRD context
4. **Prompt for missing info** that requires human judgment (testing results, breaking changes, etc.)
5. **Fallback gracefully** when no template exists
6. **Document the integration** between project-setup tool and prd-done workflow

## User Stories

### Story 1: Developer Completing PRD with PR Template
**As a** developer completing a PRD
**I want** the PR to automatically use my project's template and fill in known information
**So that** I can create consistent, complete PRs without manual template copying

### Story 2: Developer in Project Without Template
**As a** developer in a project without PR templates
**I want** a sensible default PR structure
**So that** my PRs are still well-organized even without templates

### Story 3: Team Lead Standardizing Workflows
**As a** team lead who generated PR templates via project-setup
**I want** prd-done to automatically use those templates
**So that** all PRs follow our established standards without additional configuration

## Success Criteria

✅ PR template detection works across common locations
✅ Git analysis correctly identifies change types and affected areas
✅ Auto-fill populates all information that can be deduced
✅ User prompts collect information requiring human judgment
✅ Generated PRs pass CI validation and review standards
✅ Documentation clearly explains the project-setup → prd-done connection
✅ This PRD's own PR demonstrates the new workflow working correctly

## Technical Requirements

### Functional Requirements

1. **Template Detection**
   - Check `.github/PULL_REQUEST_TEMPLATE.md`
   - Check `.github/pull_request_template.md`
   - Check `.github/PULL_REQUEST_TEMPLATE/` directory
   - Check `docs/pull_request_template.md`
   - Parse template to understand structure

2. **Git Analysis**
   - Run `git diff main...HEAD` to understand changes
   - Run `git log main..HEAD` for commit history
   - Identify file types modified (source, tests, docs, config)
   - Detect change patterns (new features, bug fixes, refactoring)

3. **Auto-Fill Capabilities**
   - PR title from PRD + Conventional Commits format
   - Issue linking with `Closes #[issue-id]`
   - Type of change checkboxes
   - Testing checklist (mark if test files modified)
   - Documentation checklist (mark if docs updated)
   - Security scan (check for secrets in commits)

4. **User Prompts**
   - Manual testing results
   - Breaking change details and migration guidance
   - Performance implications
   - Security considerations for sensitive changes
   - Reviewer focus areas
   - Follow-up work planned

5. **Fallback Behavior**
   - Provide default structure when no template found
   - Include essential sections: Description, Issues, Changes, Testing, Documentation

### Non-Functional Requirements

- **Usability**: Clear, guided workflow with helpful prompts
- **Reliability**: Graceful handling of missing templates or git errors
- **Performance**: Template parsing and git analysis completes in <5 seconds
- **Maintainability**: Template parsing logic is extensible for different formats

## Implementation Plan

### Milestone 1: Core Template Detection and Parsing
- [ ] Implement template detection across common locations
- [ ] Parse template structure to identify sections and checklists
- [ ] Handle multiple template formats (Markdown, YAML frontmatter)
- [ ] Test with various template structures (this project, other projects)

**Validation**: Successfully detect and parse `.github/PULL_REQUEST_TEMPLATE.md` from this project

### Milestone 2: Git Change Analysis
- [ ] Implement git diff analysis for file changes
- [ ] Implement git log parsing for commit history
- [ ] Detect change types from file patterns and commit messages
- [ ] Identify affected areas (source, tests, docs, config)
- [ ] Scan for potential security issues (secrets, credentials)

**Validation**: Correctly analyze changes in test branches with various change types

### Milestone 3: Intelligent Auto-Fill Implementation
- [ ] Auto-generate PR title using Conventional Commits format
- [ ] Auto-link to PRD issue with proper closing keywords
- [ ] Auto-check type of change boxes based on analysis
- [ ] Auto-fill testing checklist based on test file changes
- [ ] Auto-fill documentation checklist based on doc updates
- [ ] Auto-detect breaking changes from commits

**Validation**: Auto-filled PR matches actual changes made in test scenario

### Milestone 4: User Prompt System
- [ ] Implement prompt collection for manual testing results
- [ ] Prompt for breaking change migration guidance when detected
- [ ] Prompt for performance implications
- [ ] Prompt for security considerations
- [ ] Prompt for reviewer focus areas
- [ ] Prompt for follow-up work
- [ ] Combine auto-filled and prompted content following template structure

**Validation**: User prompts appear at appropriate times and collected info populates PR correctly

### Milestone 5: Documentation and Integration
- [ ] Update `shared-prompts/prd-done.md` with new workflow (COMPLETED)
- [ ] Update `docs/mcp-prompts-guide.md` to document PR template integration
- [ ] Update `docs/mcp-project-setup-guide.md` to explain connection to prd-done
- [ ] Add workflow examples showing template detection and auto-fill
- [ ] Document fallback behavior when no template exists

**Validation**: Documentation clearly explains the workflow and connection between tools

### Milestone 6: Testing and Validation
- [ ] Create this PRD's PR using the enhanced workflow (dogfooding)
- [ ] Verify all template sections are correctly populated
- [ ] Verify auto-fill correctly identifies changes
- [ ] Verify user prompts collect appropriate information
- [ ] Verify generated PR passes CI and review standards
- [ ] Address any issues discovered during dogfooding

**Validation**: This PRD's PR demonstrates all new capabilities working correctly

## Dependencies

- Git must be available and repository initialized
- GitHub CLI (`gh`) for PR creation
- Project may or may not have PR template (graceful handling required)

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Template formats vary widely between projects | Medium | High | Parse common formats, fallback to default structure |
| Git analysis misidentifies change types | Medium | Medium | Use multiple signals (file patterns, commits, diffs) |
| Users skip prompted questions | Low | Medium | Mark required vs optional prompts, provide sensible defaults |
| Template has custom sections we can't parse | Low | Low | Handle unknown sections gracefully, include in final PR |

## Testing Strategy

1. **Unit Testing**: Template parsing, git analysis functions
2. **Integration Testing**: End-to-end workflow with various template formats
3. **Dogfooding**: Use enhanced workflow to create this PRD's PR
4. **Cross-Project Testing**: Test with repositories that have different templates
5. **Fallback Testing**: Test in repository without any template

## Documentation Impact

### Files to Update

1. **`shared-prompts/prd-done.md`** ✅ COMPLETED
   - Added comprehensive PR template detection workflow
   - Documented git analysis and auto-fill capabilities
   - Specified user prompt requirements
   - Included fallback behavior

2. **`docs/mcp-prompts-guide.md`**
   - Update `prd-done` description to mention PR template integration
   - Add example showing template detection and auto-fill
   - Document the connection to project-setup tool

3. **`docs/mcp-project-setup-guide.md`**
   - Add note in PR template section about prd-done integration
   - Explain that generated templates are automatically used by prd-done
   - Link to mcp-prompts-guide for workflow details

### New Documentation

None required - updates to existing documentation are sufficient.

## Future Enhancements (Out of Scope)

- PR template customization interface
- Template validation and linting
- Support for GitHub PR templates with multiple choices
- Integration with other PR creation tools beyond prd-done
- AI-powered PR description generation from code analysis

## Work Log

### 2025-01-27
- Created PRD structure
- Defined problem statement and solution
- Identified documentation update requirements
- Updated `shared-prompts/prd-done.md` with comprehensive PR template workflow
- Defined 6 major implementation milestones
- Established success criteria and testing strategy
