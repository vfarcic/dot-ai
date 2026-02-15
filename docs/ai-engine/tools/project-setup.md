---
sidebar_position: 8
---

# GitHub Repository Setup & Governance Guide

**Complete guide for AI-powered repository setup and governance with the DevOps AI Toolkit.**

![Project Setup & Governance Infographic](../img/github.jpeg)

## Prerequisites

Before using this guide, complete the [Deployment Guide](../setup/deployment.md) to set up:
- DevOps AI Toolkit deployed
- No additional dependencies required (tool does not need Kubernetes or AI model access)

**Note**: This tool does NOT require:
- Kubernetes cluster access
- Qdrant vector database
- AI model API keys

The tool generates files based on templates and your answers - no AI inference or cluster access needed.

## Overview

The DevOps AI Toolkit project setup feature provides:
- **Repository audit** - Scans repositories to identify missing governance, legal, and automation files
- **Gap analysis** - Shows which standardized files are missing from your repository
- **Template-based generation** - Creates 25+ files across 9 scopes using industry best practices
- **Interactive workflow** - Asks relevant questions and generates customized files
- **Standards compliance** - All templates based on authoritative sources (Contributor Covenant, OpenSSF, GitHub)

### What It Generates

The tool can generate files across these scopes:
- **readme**: README.md with project information
- **legal**: LICENSE files (MIT, Apache-2.0, GPL-3.0, BSD-3-Clause) with NOTICE/COPYRIGHT as needed
- **governance**: CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md
- **community**: SUPPORT.md, GOVERNANCE.md, CODEOWNERS
- **github-issues**: Bug report, feature request, and question templates (.github/ISSUE_TEMPLATE/)
- **pr-template**: Pull request template (.github/PULL_REQUEST_TEMPLATE.md) - automatically detected and used by the [`prd-done` workflow](prompts.md#available-prompts) for intelligent PR creation
- **github-community**: FUNDING.yml, AUTHORS, CONTRIBUTORS, CHANGELOG, release.yml
- **github-security**: OpenSSF Scorecard workflow (.github/workflows/scorecard.yml)
- **github-automation**: Renovate, GitHub Labeler, Stale Bot configurations

### When to Use This Tool

Use project setup when you want to:
- Bootstrap a new repository with proper governance
- Audit existing repository for missing files
- Standardize team workflows across multiple repositories
- Implement security and contribution guidelines
- Add GitHub automation (dependency updates, PR labeling, stale issue management)

### Video: Transform Your GitHub Repository

[![Transform Your GitHub Repository: Templates, Automation, and Governance](https://img.youtube.com/vi/gYl3moYa4iI/maxresdefault.jpg)](https://youtu.be/gYl3moYa4iI)

## Complete Workflow Example

### Step 1: Request Repository Audit

```
User: Audit my repository for missing governance files
```

```
Agent: I'll scan your repository to identify missing files.

[Scans repository for 21 files]

Repository Analysis:

✓ readme: 1/1 files exist
✓ legal: 1/1 files exist
○ governance: 0/6 files exist
  Missing: CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md, docs/MAINTAINERS.md, docs/GOVERNANCE.md, docs/ROADMAP.md
○ community: 0/2 files exist
  Missing: SUPPORT.md, ADOPTERS.md
○ github-issues: 0/3 files exist
  Missing: .github/ISSUE_TEMPLATE/bug_report.yml, .github/ISSUE_TEMPLATE/feature_request.yml, .github/ISSUE_TEMPLATE/config.yml
○ pr-template: 0/1 files exist
  Missing: .github/PULL_REQUEST_TEMPLATE.md
○ github-community: 0/2 files exist
  Missing: .github/CODEOWNERS, .github/release.yml
○ github-security: 0/1 files exist
  Missing: .github/workflows/scorecard.yml
○ github-automation: 0/4 files exist
  Missing: renovate.json, .github/labeler.yml, .github/workflows/labeler.yml, .github/workflows/stale.yml

Which scopes would you like to set up? (You can choose multiple)
```

### Step 2: Select Scopes and Answer Questions

```
User: Set up governance and github-issues
```

```
Agent: I'll set up governance first (6 files to generate).

Let me analyze your repository to suggest answers:

1. Project name: my-awesome-app
2. Repository URL: https://github.com/username/my-awesome-app
3. Enforcement email: conduct@example.com
4. Security email: security@example.com
5. Maintainer email: maintainers@example.com
6. Lead maintainer name: John Doe
7. Lead maintainer GitHub: johndoe
8. Setup command: npm install
9. Test command: npm test
10. Lint command: npm run lint
... (27 questions total)

Do these look correct, or would you like to modify any?
```

```
User: Looks good
```

### Step 3: Files Generated and Written

```
Agent: Generated 6 files for governance scope:
- CODE_OF_CONDUCT.md
- CONTRIBUTING.md
- SECURITY.md
- docs/MAINTAINERS.md
- docs/GOVERNANCE.md
- docs/ROADMAP.md

[Writes these 6 files to repository]

✓ Governance files created successfully!

Now let's set up github-issues (3 files to generate).

Questions for github-issues:
1. Project name: my-awesome-app
2. Repository URL: https://github.com/username/my-awesome-app
3. Bug report form title: Bug Report
4. Feature request form title: Feature Request
... (8 questions total)

Do these look correct?
```

```
User: Yes
```

```
Agent: Generated 3 files for github-issues scope:
- .github/ISSUE_TEMPLATE/bug_report.yml
- .github/ISSUE_TEMPLATE/feature_request.yml
- .github/ISSUE_TEMPLATE/config.yml

[Writes these 3 files to repository]

✓ GitHub issue templates created successfully!

All requested scopes are now complete. Your repository now has:
- 6 governance files
- 3 GitHub issue templates
```

## Scope Reference

| Scope | Files | Description |
|-------|-------|-------------|
| **readme** | README.md | Basic project README with name, description, license |
| **legal** | LICENSE, NOTICE*, COPYRIGHT* | License files (MIT, Apache-2.0, GPL-3.0, BSD-3-Clause) |
| **governance** | CODE_OF_CONDUCT.md, CONTRIBUTING.md, SECURITY.md, MAINTAINERS.md, GOVERNANCE.md, ROADMAP.md | Complete governance documentation |
| **community** | SUPPORT.md, ADOPTERS.md | Support channels and project adopters |
| **github-issues** | bug_report.yml, feature_request.yml, config.yml | GitHub issue templates |
| **pr-template** | PULL_REQUEST_TEMPLATE.md | Pull request template with checklist |
| **github-community** | FUNDING.yml*, AUTHORS*, CONTRIBUTORS*, CHANGELOG*, release.yml* | Community and funding files |
| **github-security** | workflows/scorecard.yml | OpenSSF Scorecard security workflow |
| **github-automation** | renovate.json, labeler.yml, workflows/labeler.yml, workflows/stale.yml | Automated dependency updates, PR labeling, stale issue management |

_* Conditional files - only generated based on your answers_

## Common Use Cases

### New Open Source Project
```
User: Set up a new open source project with all governance files
```
**Recommended scopes**: legal, governance, community, github-issues, pr-template, github-security, github-automation

### Existing Project Audit
```
User: Audit my existing project for missing files
```
The agent will show what's missing and let you choose which scopes to add.

### Add GitHub Automation Only
```
User: Add Renovate and issue automation to my project
```
**Recommended scopes**: github-automation

### Security and Compliance
```
User: Add security scanning and policies
```
**Recommended scopes**: governance (includes SECURITY.md), github-security

## Tips

### Workflow Tips

**Review before committing**: The agent generates files but YOU control what gets committed. Review the generated content before committing.

**Multiple sessions**: You can run the tool multiple times. It only generates missing files, never overwrites existing ones.

**Customize templates**: After generation, you can edit files to match your project's specific needs.

### Best Practices

**Start with governance**: If setting up a new project, start with `legal` and `governance` scopes first.

**Add automation last**: Set up `github-automation` after your basic repository structure is in place.

**Review email addresses**: Double-check all email addresses in governance files before committing.

**Test workflows**: After generating GitHub Actions workflows, verify they run successfully.

## See Also

- **[Deployment Guide](../setup/deployment.md)** - Server deployment and configuration
- **[Tools and Features Overview](overview.md)** - Browse all available tools and features

