# Contributing to DevOps AI Toolkit

Thank you for your interest in contributing to DevOps AI Toolkit! We welcome contributions from the community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Sign-off](#commit-sign-off)
- [Communication](#communication)

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Ways to Contribute

There are many ways to contribute:

- **Report bugs** - File detailed bug reports with reproduction steps
- **Suggest features** - Propose new features or improvements
- **Write code** - Submit bug fixes or new features
- **Improve documentation** - Fix typos, clarify content, add examples
- **Review pull requests** - Provide feedback on proposed changes
- **Answer questions** - Help other users in issues or discussions
- **Write tests** - Improve test coverage

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/dot-ai.git
   cd dot-ai
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/vfarcic/dot-ai
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```

## Development Workflow

1. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** - Write code, add tests, update docs

3. **Test your changes** - Run `npm test`

4. **Commit your changes**:
   ```bash
   git commit -m "Description of your changes"
   ```
   Use `git commit -s` to sign off your commits (required)

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub

## Changelog Fragments

This project uses [towncrier](https://github.com/twisted/towncrier) for release notes. When making changes, create a changelog fragment file to describe your contribution.

### Creating a Fragment

Create a file in `changelog.d/` with this naming pattern:

```text
changelog.d/<issue-number>.<type>.md
```

**Examples**:
- `331.feature.md`
- `328.feature.md`
- `456.bugfix.md`

The filename carries no description. towncrier treats everything before the type
as the issue reference and renders it as a link, so `331-towncrier-release-notes.feature.md`
publishes a link to `/issues/331-towncrier-release-notes`, which does not exist.
Describe the change in the fragment body instead.

For a change with no issue behind it, prefix the name with `+`:

```text
changelog.d/+<short-description>.<type>.md
```

towncrier treats these as orphan fragments and renders them with no issue link —
use them rather than inventing an issue-number-like stem.

**Types**:
- `feature` - New features
- `bugfix` - Bug fixes
- `breaking` - Breaking changes
- `doc` - Documentation improvements
- `misc` - Other changes

### Fragment Content

Describe what the feature or fix IS (not "added X" diary-style). Use a title and description format. Length should match the complexity of the change.

When applicable, link to relevant documentation at https://devopstoolkit.ai.

**Example** (`changelog.d/331.feature.md`):
```markdown
**Towncrier-based release notes system**

Contributors create changelog fragments that get combined into rich
release notes at release time, replacing the previous empty release notes.
```

### When to Create Fragments

- **PRD completions**: The `/prd-done` workflow creates fragments automatically
- **Bug fixes**: Create manually when fixing bugs
- **Other changes**: Create for any user-visible change

Fragments are combined into `CHANGELOG.md` when a release is created.

## Pull Request Process

### Before Submitting

- Ensure your code follows the project's coding standards
- Add or update tests for your changes
- Verify all tests pass: `npm test`
- Run linters: `npm run lint`
- Update documentation as needed
- Keep pull requests focused on a single concern

### PR Description

Include in your pull request description:

- **What** - Summary of changes
- **Why** - Motivation and context
- **How** - Implementation approach
- **Testing** - How you tested the changes
- **Related Issues** - Link any related issues (e.g., "Fixes #123")

### Review Process

1. Automated checks will run on your PR
2. Maintainers will review your changes
3. Address any feedback or requested changes
4. Once approved, a maintainer will merge your PR

## Coding Standards

Follow the project's coding style enforced by `npm run lint`.

## Commit Sign-off

All commits must be signed off to certify that you have the right to submit the code under the project's license.

Add the `-s` flag when committing:

```bash
git commit -s -m "Your commit message"
```

This adds a "Signed-off-by" line:

```
Signed-off-by: Your Name <your.email@example.com>
```

Learn more at [https://developercertificate.org/](https://developercertificate.org/)

## Communication

- **Issues** - Report bugs and request features via [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)
- **Discussions** - Ask questions in [GitHub Discussions](https://github.com/vfarcic/dot-ai/discussions)

---

Thank you for contributing to DevOps AI Toolkit!
