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

### 4. Merge and Deployment
- [ ] **Address review feedback**: Make any required changes from code review
- [ ] **Merge to main**: Complete the pull request merge
- [ ] **Verify deployment**: Ensure feature works in production environment
- [ ] **Monitor for issues**: Watch for any post-deployment problems

### 5. Issue Closure
- [ ] **Update PRD status**: Mark PRD as "Complete" with completion date
- [ ] **Close GitHub issue**: Add final completion comment and close
- [ ] **Archive artifacts**: Save any temporary files or testing data if needed
- [ ] **Team notification**: Announce feature completion to relevant stakeholders

## Success Criteria
✅ **Feature is live and functional**  
✅ **All tests passing in production**  
✅ **Documentation is accurate and complete**  
✅ **PRD issue is closed with completion summary**  
✅ **Team is notified of feature availability**

The PRD implementation is only considered done when users can successfully use the feature as documented.