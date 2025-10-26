---
name: prd-done
description: Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue
category: project-management
---

# Complete PRD Implementation

Complete the PRD implementation workflow including branch management, pull request creation, and issue closure.

## Workflow Steps

### 0. Implementation Type Detection
**FIRST: Determine the type of PRD completion to choose the appropriate workflow**

**Documentation-Only Completion** (Skip PR workflow):
- ✅ Changes are only to PRD files or project management documents
- ✅ No source code changes
- ✅ No configuration changes
- ✅ Feature was already implemented in previous work
- → **Use Simplified Workflow** (Steps 1, 2-simplified, 5 only)

**Code Implementation Completion** (Full PR workflow):
- ✅ Contains source code changes
- ✅ Contains configuration changes
- ✅ Contains new functionality or modifications
- ✅ Requires testing and integration
- → **Use Full Workflow** (Steps 1-6)

### 1. Pre-Completion Validation
- [ ] **All PRD checkboxes completed**: Verify every requirement is implemented and tested
- [ ] **Documentation updated**: All user-facing docs reflect implemented functionality
- [ ] **No outstanding blockers**: All dependencies resolved and technical debt addressed
- [ ] **Update PRD status**: Mark PRD as "Complete" with completion date
- [ ] **Archive PRD file**: Move completed PRD to `./prds/done/` directory to maintain project organization
- [ ] **Update ROADMAP.md (if it exists)**: Remove the completed feature from `docs/ROADMAP.md` roadmap if the file exists

**Note**: Tests will run automatically in the CI/CD pipeline when the PR is created. Do not run tests locally during the completion workflow.

### 2. Branch and Commit Management

**For Documentation-Only Completions:**
- [ ] **Commit directly to main**: `git add [prd-files]` and commit with skip CI flag
- [ ] **Use skip CI commit message**: Include CI skip pattern in commit message to avoid unnecessary CI runs
  - Common patterns: `[skip ci]`, `[ci skip]`, `***NO_CI***`, `[skip actions]`
  - Check project's CI configuration for the correct pattern
- [ ] **Push to remote**: `git push origin main` to sync changes

**For Code Implementation Completions:**
- [ ] **Create feature branch**: `git checkout -b feature/prd-[issue-id]-[feature-name]`
- [ ] **Commit all changes**: Ensure all implementation work is committed
- [ ] **Clean commit history**: Squash or organize commits for clear history
- [ ] **Push to remote**: `git push -u origin feature/prd-[issue-id]-[feature-name]`

### 3. Pull Request Creation

**IMPORTANT: Always check for and use PR template if available**

#### 3.1. PR Template Detection
- [ ] **Check for PR template** in common locations:
  - `.github/PULL_REQUEST_TEMPLATE.md`
  - `.github/pull_request_template.md`
  - `.github/PULL_REQUEST_TEMPLATE/` (directory with multiple templates)
  - `docs/pull_request_template.md`
- [ ] **Read and parse template**: If found, analyze the template structure to understand required sections, checklists, and format requirements

#### 3.2. Analyze Changes for PR Content
- [ ] **Review git diff**: Analyze `git diff main...HEAD` to understand scope of changes
- [ ] **Review commit history**: Use `git log main..HEAD` to understand implementation progression
- [ ] **Identify change types**: Determine if changes include:
  - New features, bug fixes, refactoring, documentation, tests, configuration, dependencies
  - Breaking changes or backward-compatible changes
  - Performance improvements or security fixes
- [ ] **Check modified files**: Identify which areas of codebase were affected
  - Source code files
  - Test files
  - Documentation files
  - Configuration files

#### 3.3. Auto-Fill PR Information
Automatically populate what can be deduced from analysis:

- [ ] **PR Title**:
  - Follow template title format if specified (e.g., Conventional Commits: `feat(scope): description`)
  - Extract from PRD title/description and commit messages
  - Include issue reference if required by template

- [ ] **Description sections**:
  - **What/Why**: Extract from PRD objectives and implementation details
  - **Related issues**: Automatically link using `Closes #[issue-id]` or `Fixes #[issue-id]`
  - **Type of change**: Check appropriate boxes based on file analysis

- [ ] **Testing checklist**:
  - Mark "Tests added/updated" if test files were modified
  - Note: Tests run in CI/CD automatically

- [ ] **Documentation checklist**:
  - Mark items based on which docs were updated (README, API docs, code comments)
  - Check if CONTRIBUTING.md guidelines followed

- [ ] **Security checklist**:
  - Scan commits for potential secrets or credentials
  - Flag if authentication/authorization code changed
  - Note any dependency updates

#### 3.4. Prompt User for Information That Cannot Be Deduced
**IMPORTANT: Don't just ask - analyze and propose answers, then let user confirm or correct**

For each item, use available context to propose an answer, then present it to the user for confirmation:

- [ ] **Manual testing results**:
  - **Analyze PRD testing strategy section** to understand what testing was planned
  - **Check git commits** for testing-related messages
  - **Propose testing approach** based on change type (e.g., "Documentation reviewed for accuracy and clarity, cross-references validated")
  - Present proposal and ask: "Is this accurate, or would you like to modify?"

- [ ] **Breaking changes**:
  - **Scan commits and PRD** for breaking change indicators
  - If detected, **propose migration guidance** based on PRD content
  - If not detected, **confirm**: "No breaking changes detected. Correct?"

- [ ] **Performance implications**:
  - **Analyze change type**: Documentation/config changes typically have no performance impact
  - **Propose answer** based on analysis (e.g., "No performance impact - documentation only")
  - Ask: "Correct, or are there performance considerations?"

- [ ] **Security considerations**:
  - **Check if security-sensitive files** were modified (auth, credentials, API keys)
  - **Scan commits** for security-related keywords
  - **Propose security status** (e.g., "No security implications - documentation changes only")
  - Ask: "Accurate, or are there security considerations to document?"

- [ ] **Reviewer focus areas**:
  - **Analyze PRD objectives** and **git changes** to identify key areas
  - **Propose specific focus areas** (e.g., "Verify documentation accuracy, check cross-reference links, confirm workflow examples match implementation")
  - Present list and ask: "Are these the right focus areas, or should I adjust?"

- [ ] **Follow-up work**:
  - **Check PRD for "Future Enhancements" or "Out of Scope" sections**
  - **Analyze other PRDs** in `prds/` directory for related work
  - **Propose follow-up items** if any (e.g., "Future enhancements listed in PRD: template validation, AI-powered descriptions")
  - Ask: "Should I list these, or is there other follow-up work?"

- [ ] **Additional context**:
  - **Review PRD for special considerations**
  - **Check if this is a dogfooding/testing PR**
  - **Propose any relevant context** (e.g., "This PR itself tests the enhanced workflow it documents")
  - Ask: "Anything else reviewers should know?"

**Presentation Format:**
Present all proposed answers together in a summary format:
```
📋 **Proposed PR Information** (based on analysis)

**Manual Testing:** [proposed answer]
**Breaking Changes:** [proposed answer]
**Performance Impact:** [proposed answer]
**Security Considerations:** [proposed answer]
**Reviewer Focus:** [proposed list]
**Follow-up Work:** [proposed items or "None"]
**Additional Context:** [proposed context or "None"]

Please review and respond:
- Type "yes" or "confirm" to accept all
- Specify corrections for any items that need changes
```

#### 3.5. Create Pull Request
- [ ] **Construct PR body**: Combine auto-filled and user-provided information following template structure
- [ ] **Create PR**: Use `gh pr create --title "[title]" --body "[constructed-body]"` or `gh pr create --title "[title]" --body-file [temp-file]`
- [ ] **Verify PR created**: Confirm PR was created successfully and template was populated correctly
- [ ] **Request reviews**: Assign appropriate team members for code review if specified

#### 3.6. Fallback for Projects Without Templates
If no PR template is found, create a sensible default structure:

```markdown
## Description
[What this PR does and why]

## Related Issues
Closes #[issue-id]

## Changes Made
- [List key changes]

## Testing
- [Testing approach and results]

## Documentation
- [Documentation updates made]
```

### 4. Review and Merge Process
- [ ] **Check ongoing processes**: Use `gh pr checks [pr-number]` to check for any ongoing CI/CD, security analysis, or automated reviews (CodeRabbit, CodeQL, etc.)
- [ ] **Check PR details**: Use `gh pr view [pr-number]` to check for human review comments and PR metadata
- [ ] **Review all automated feedback**: Check PR comments section for automated code review feedback (bots, linters, analyzers)
  - **Use multiple methods to capture all feedback**:
    - **MCP servers** (preferred when available): Use any available MCP servers for comprehensive review data
      - Code review MCPs (e.g., CodeRabbit, custom review servers) for detailed AI code reviews
      - Check available MCP tools/functions related to code reviews, pull requests, or automated feedback
    - CLI commands: `gh pr view [pr-number]`, `gh pr checks [pr-number]`, `gh api repos/owner/repo/pulls/[pr-number]/comments`
    - **Web interface inspection**: Fetch the PR URL directly to capture all comments, including inline code suggestions that CLI tools may miss
    - Look for comments from automated tools (usernames ending in 'ai', 'bot', or known review tools)
- [ ] **Present code review findings**: ALWAYS summarize automated review feedback for the user (unless there are no findings)
  - **Categorize findings**: Critical, Important, Optional based on impact
  - **Provide specific examples**: Quote actual suggestions and their locations
  - **Explain assessment**: Why each category was assigned and which items should be addressed
  - **User decision**: Let user decide which optional improvements to implement before merge
- [ ] **Assess feedback priority**: Categorize review feedback
  - **Critical**: Security issues, breaking changes, test failures - MUST address before merge
  - **Important**: Code quality, maintainability, performance - SHOULD address for production readiness
  - **Optional**: Style preferences, minor optimizations - MAY address based on project standards
- [ ] **Wait for ALL reviews to complete**: Do NOT merge if any reviews are pending or in progress, including:
  - **Automated code reviews** (CodeRabbit, CodeQL, etc.) - Must wait until complete even if CI passes
  - **Security analysis** - Must complete and pass
  - **CI/CD processes** - All builds and tests must pass
  - **Human reviews** - If requested reviewers haven't approved
  - **CRITICAL**: Never skip automated code reviews - they provide valuable feedback even when CI passes
- [ ] **Address review feedback**: Make required changes from code review (both automated and human)
  - Create additional commits on the feature branch to address feedback
  - Update tests if needed to cover suggested improvements
  - Document any feedback that was intentionally not addressed and why
- [ ] **Verify all checks pass**: Ensure all CI/CD, tests, security analysis, and automated processes are complete and passing
- [ ] **Final review**: Confirm the PR addresses the original PRD requirements and maintains code quality
- [ ] **Merge to main**: Complete the pull request merge only after all feedback addressed and processes complete
- [ ] **Verify deployment**: Ensure feature works in production environment
- [ ] **Monitor for issues**: Watch for any post-deployment problems

### 5. Issue Closure
- [ ] **Update issue PRD link**: Update the GitHub issue description to reference the new PRD path in `./prds/done/` directory
- [ ] **Close GitHub issue**: Add final completion comment and close
- [ ] **Archive artifacts**: Save any temporary files or testing data if needed
- [ ] **Team notification**: Announce feature completion to relevant stakeholders

### 6. Branch Cleanup
- [ ] **Switch to main branch**: `git checkout main`
- [ ] **Pull latest changes**: `git pull origin main` to ensure local main is up to date
- [ ] **Delete local feature branch**: `git branch -d feature/prd-[issue-id]-[feature-name]`
- [ ] **Delete remote feature branch**: `git push origin --delete feature/prd-[issue-id]-[feature-name]`

## Success Criteria
✅ **Feature is live and functional**  
✅ **All tests passing in production**  
✅ **Documentation is accurate and complete**  
✅ **PRD issue is closed with completion summary**  
✅ **Team is notified of feature availability**

The PRD implementation is only considered done when users can successfully use the feature as documented.