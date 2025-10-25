<!--
Thank you for contributing to DevOps AI Toolkit! Please fill out this template to help us review your changes.
-->

## Description
<!-- Provide a clear and concise description of your changes -->

**What does this PR do?**

**Why is this change needed?**

## Related Issues
<!-- Link to related issues using keywords for automatic closure -->
<!-- Examples: "Closes #123", "Fixes #456", "Resolves #789" -->

- Related to: #

## Type of Change
<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📚 Documentation update
- [ ] ♻️ Refactoring (no functional changes)
- [ ] ✅ Test updates (adding or updating tests)
- [ ] 🔧 Configuration changes
- [ ] 🚀 Performance improvements
- [ ] 🎨 Style changes (formatting, naming, etc.)
- [ ] 📦 Dependency updates
- [ ] 🔨 CI/CD changes

## Conventional Commit Format
<!-- This project uses Conventional Commits for automated changelog generation -->

**Your PR title should follow this format:**
```
<type>(<scope>): <description>

Examples:
  feat(auth): add OAuth2 authentication support
  fix(api): resolve null pointer exception in user service
  docs(readme): update installation instructions
  chore(deps): bump typescript from 5.0.0 to 5.1.0
```

**Common types:**
- `feat:` - New feature (minor version bump)
- `fix:` - Bug fix (patch version bump)
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no functional changes)
- `test:` - Adding/updating tests
- `chore:` - Maintenance tasks (dependencies, build, CI/CD)
- `perf:` - Performance improvements

**Breaking changes:**
```
feat(api)!: remove deprecated v1 endpoints

BREAKING CHANGE: v1 API endpoints have been removed.
See MIGRATION.md for upgrade guide.
```

## Testing Checklist
<!-- Ensure all relevant tests have been completed -->

- [ ] Tests added or updated
- [ ] All existing tests pass locally
- [ ] Manual testing performed
- [ ] Test coverage maintained or improved

**Test commands run:**
```bash
# Commands you ran locally to verify your changes
# (Automated CI tests will run automatically on PR submission)
```

**Test results:**
<!-- Describe test results, including any relevant output or screenshots -->

## Documentation Checklist
<!-- Ensure documentation is updated to reflect your changes -->

- [ ] README.md updated (if user-facing changes)
- [ ] Documentation updated (if applicable)
- [ ] Code comments added for complex logic
- [ ] API documentation updated (if API changes)
- [ ] [CONTRIBUTING.md](CONTRIBUTING.md) guidelines followed

## Security Checklist
<!-- Complete if your changes affect security -->

- [ ] No secrets or credentials committed
- [ ] Input validation implemented where needed
- [ ] Security implications considered and documented
- [ ] Dependencies scanned for vulnerabilities
- [ ] Authentication/authorization logic reviewed
- [ ] Error messages don't leak sensitive information

## Breaking Changes
<!-- If this is a breaking change, describe the impact and provide migration guidance -->

**Does this PR introduce breaking changes?**
- [ ] Yes
- [ ] No

**If yes, describe the breaking changes and migration path:**

## Developer Certificate of Origin
<!-- This project requires DCO sign-off for all commits -->

By submitting this pull request, I certify that:

- The contribution was created in whole or in part by me and I have the right to submit it under the project's open source license.
- I understand and agree that this project and my contribution are public and that a record of the contribution (including all personal information I submit with it) is maintained indefinitely.

**DCO Sign-off:**
All commits must include a `Signed-off-by` line:
```bash
git commit -s -m "Your commit message"
```

If you forgot to sign off your commits, you can amend them:
```bash
git commit --amend --signoff
git push --force-with-lease
```

## Checklist
<!-- Final pre-submission checklist -->

- [ ] My code follows the project's code style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or my feature works
- [ ] New and existing tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] All commits are signed off (DCO)
- [ ] PR title follows Conventional Commits format

## Additional Context
<!-- Add any other context, considerations, or notes for reviewers -->

**Reviewer Notes:**
<!-- Anything specific you want reviewers to focus on? -->

**Follow-up Work:**
<!-- Any planned follow-up PRs or related work? -->
