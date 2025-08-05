---
name: prd-done
description: Complete PRD implementation workflow - create branch, push changes, create PR, merge, and close issue
category: project-management
---

# Complete PRD Implementation

Complete the PRD implementation workflow including branch management, pull request creation, and issue closure.

## Workflow Steps

### 1. Pre-Completion Validation
- [ ] **All PRD checkboxes completed**: Verify every requirement is implemented and tested
- [ ] **All tests passing**: Run `npm test` to ensure quality standards
- [ ] **Documentation updated**: All user-facing docs reflect implemented functionality
- [ ] **No outstanding blockers**: All dependencies resolved and technical debt addressed
- [ ] **Update PRD status**: Mark PRD as "Complete" with completion date (must be done before commit)

### 2. Branch and Commit Management
- [ ] **Create feature branch**: `git checkout -b feature/prd-[issue-id]-[feature-name]`
- [ ] **Commit all changes**: Ensure all implementation work is committed
- [ ] **Clean commit history**: Squash or organize commits for clear history
- [ ] **Push to remote**: `git push -u origin feature/prd-[issue-id]-[feature-name]`

### 3. Pull Request Creation
- [ ] **Create PR**: Use `gh pr create` with comprehensive description
- [ ] **Link to PRD**: Reference the original issue and PRD file
- [ ] **Review checklist**: Include testing, documentation, and quality confirmations
- [ ] **Request reviews**: Assign appropriate team members for code review

### 4. Review and Merge Process
- [ ] **Check ongoing processes**: Use `gh pr checks [pr-number]` to check for any ongoing CI/CD, security analysis, or automated reviews (CodeRabbit, CodeQL, etc.)
- [ ] **Check PR details**: Use `gh pr view [pr-number]` to check for human review comments and PR metadata
- [ ] **Wait for completion**: Do NOT merge if checks show pending processes or PR comments indicate reviews still in progress
- [ ] **Address review feedback**: Make any required changes from code review (both automated and human)
- [ ] **Verify all checks pass**: Ensure all CI/CD, tests, security analysis, and automated processes are complete and passing
- [ ] **Merge to main**: Complete the pull request merge only after all feedback addressed and processes complete
- [ ] **Verify deployment**: Ensure feature works in production environment
- [ ] **Monitor for issues**: Watch for any post-deployment problems

### 5. Issue Closure
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