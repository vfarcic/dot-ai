# PRD: Towncrier-based Release Notes System

**GitHub Issue**: [#331](https://github.com/vfarcic/dot-ai/issues/331)
**Status**: Draft
**Priority**: High
**Created**: 2026-01-15
**Owner**: TBD

---

## Overview

### Problem Statement

Current release notes are empty or minimal:
- Just list artifact versions (npm, Docker, Helm)
- Auto-generated changelog links with no descriptions
- PR titles provide no user value (e.g., "consolidate duplicated constants")
- Detailed PRDs with rich feature descriptions are never leveraged
- Users have no idea what a release contains or why they should upgrade

**Example of current release notes (v0.192.0):**
```
## Coordinated Release Artifacts
- npm package: @vfarcic/dot-ai@0.192.0
- Docker image: ghcr.io/vfarcic/dot-ai:0.192.0
- Helm chart: oci://ghcr.io/vfarcic/dot-ai/charts/dot-ai:0.192.0

Full Changelog: https://github.com/vfarcic/dot-ai/compare/v0.191.0...v0.192.0
```

No description of what changed, why it matters, or what users gain.

### Solution Overview

Implement [towncrier](https://github.com/twisted/towncrier) for fragment-based release notes:

1. **Fragment files**: Contributors create small `.md` files in `changelog.d/` describing changes
2. **Accumulation**: Fragments accumulate as PRs merge (no release on every merge)
3. **On-demand release**: When ready to release, towncrier combines fragments into rich release notes
4. **Cleanup**: Fragment files are deleted after release (PRDs retain full details)

**Key benefits:**
- Rich, descriptive release notes from PRD context
- On-demand releases (not on every merge)
- Language-agnostic (works across all dot-ai projects)
- Battle-tested (used by pytest, pip, Twisted, attrs)
- Contributors just create markdown files - no tooling required locally

### Success Criteria

- [ ] Releases have descriptive notes explaining what changed and why
- [ ] Release timing is controlled (not automatic on every merge)
- [ ] `/prd-done` workflow automatically creates changelog fragments
- [ ] Multiple features can be batched into a single release
- [ ] Works across all dot-ai projects (language-agnostic)

---

## User Impact

### Target Users

**Primary**: Project maintainers
- Control when releases happen
- Get rich release notes automatically from PRD context
- Batch related features into single releases

**Secondary**: Contributors
- Simple process: just create a markdown file when completing work
- No new tooling required locally
- Clear guidance from `/prd-done` workflow

**Tertiary**: End users
- Understand what each release contains
- Know why they should upgrade
- Can assess impact of changes

### User Journeys

#### Journey 1: Completing a Feature (Contributor)

**Current state:**
1. Finish feature implementation
2. Run `/prd-done` to create PR and merge
3. Release happens automatically with empty notes
4. Users have no idea what changed

**With towncrier:**
1. Finish feature implementation
2. Run `/prd-done` which:
   - Creates PR and merges
   - Auto-generates `changelog.d/prd-328.feature.md` with release notes from PRD
3. Fragment accumulates (no release yet)
4. When maintainer releases, rich notes appear automatically

#### Journey 2: Creating a Release (Maintainer)

**Current state:**
1. Every merge triggers a release
2. No control over timing
3. Empty release notes
4. Multiple releases per day with no descriptions

**With towncrier:**
1. Multiple features merge to main (fragments accumulate)
2. Maintainer decides when to release
3. Runs release workflow (manual trigger)
4. Towncrier combines all fragments into rich release notes
5. Single release with comprehensive description of all changes

---

## Technical Scope

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRAGMENT CREATION                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  /prd-done workflow                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Check if changelog.d/ exists                        │ │
│  │ 2. If yes, extract release notes from PRD:             │ │
│  │    - Problem statement (1-2 sentences)                 │ │
│  │    - Solution summary (2-3 sentences)                  │ │
│  │    - User impact highlights                            │ │
│  │ 3. Create changelog.d/prd-[id].[type].md              │ │
│  │ 4. Commit with PR                                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRAGMENT STORAGE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  changelog.d/                                                │
│  ├── prd-328.feature.md    # Dashboard HTTP API             │
│  ├── prd-330.feature.md    # Semantic search                │
│  ├── fix-timeout.bugfix.md # Bug fix (non-PRD)              │
│  └── .gitkeep                                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    RELEASE WORKFLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Manual trigger (workflow_dispatch)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Calculate next version                              │ │
│  │ 2. Run: towncrier build --version X.Y.Z                │ │
│  │    - Combines all fragments into CHANGELOG.md          │ │
│  │    - Deletes fragment files                            │ │
│  │ 3. Publish artifacts (npm, Docker, Helm)               │ │
│  │ 4. Create GitHub release with CHANGELOG content        │ │
│  │ 5. Commit version bumps and CHANGELOG                  │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Towncrier Configuration

**File: `pyproject.toml`** (towncrier config section)
```toml
[tool.towncrier]
directory = "changelog.d"
filename = "CHANGELOG.md"
title_format = "## [{version}] - {project_date}"
issue_format = "[#{issue}](https://github.com/vfarcic/dot-ai/issues/{issue})"

[[tool.towncrier.type]]
directory = "feature"
name = "Features"
showcontent = true

[[tool.towncrier.type]]
directory = "bugfix"
name = "Bug Fixes"
showcontent = true

[[tool.towncrier.type]]
directory = "breaking"
name = "Breaking Changes"
showcontent = true

[[tool.towncrier.type]]
directory = "doc"
name = "Documentation"
showcontent = true

[[tool.towncrier.type]]
directory = "misc"
name = "Other Changes"
showcontent = true
```

### Fragment Naming Convention

```
changelog.d/
  [identifier].[type].md

Examples:
  prd-328.feature.md     # Feature from PRD #328
  prd-201.feature.md     # Feature from PRD #201
  fix-timeout.bugfix.md  # Bug fix (no PRD)
  456.bugfix.md          # Bug fix for issue #456
  update-deps.misc.md    # Miscellaneous change
```

**Types:**
- `feature` - New features
- `bugfix` - Bug fixes
- `breaking` - Breaking changes
- `doc` - Documentation improvements
- `misc` - Other changes

### CI Workflow Changes

**Current `ci.yml` behavior:**
- Push to main → auto-release

**New behavior:**
- Push to main → run tests only (no release)
- Manual trigger → run release with towncrier

**New `release.yml` workflow:**
```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version_bump:
        description: 'Version bump type'
        required: true
        default: 'minor'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Python (for towncrier)
        uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - name: Install towncrier
        run: pip install towncrier

      - name: Calculate version
        id: version
        run: |
          # Calculate next version based on input

      - name: Build changelog
        run: towncrier build --version ${{ steps.version.outputs.new_version }} --yes

      - name: Extract release notes
        id: notes
        run: |
          # Extract latest version section from CHANGELOG.md

      # ... rest of release steps (npm, Docker, Helm, GitHub release)
```

### /prd-done Integration

**Addition to `shared-prompts/prd-done.md`:**

```markdown
### 2.5. Create Changelog Fragment (if applicable)

**IMPORTANT: Only if `changelog.d/` directory exists**

- [ ] **Check for changelog.d/ directory**: If directory doesn't exist, skip this section
- [ ] **Extract release notes from PRD**:
  - Read the PRD file being completed
  - Extract key information:
    - Problem statement (1-2 sentences)
    - Solution summary (2-3 sentences)
    - Key user benefits
  - Compose concise release notes (4-8 sentences max)
- [ ] **Determine fragment type**:
  - `feature` - New functionality
  - `bugfix` - Bug fix
  - `breaking` - Breaking change
  - `doc` - Documentation only
  - `misc` - Other
- [ ] **Create fragment file**: `changelog.d/prd-[issue-id].[type].md`
- [ ] **Include in commit**: Add fragment file to the PR commit
```

---

## Implementation Milestones

### Milestone 1: Towncrier Setup [Status: Pending]

**Target**: Basic towncrier configuration working locally

**Completion Criteria:**
- [ ] Create `changelog.d/` directory with `.gitkeep`
- [ ] Add towncrier configuration to `pyproject.toml`
- [ ] Create sample fragment file for testing
- [ ] Verify `towncrier build` works locally
- [ ] Document fragment creation process in README or CONTRIBUTING

**Estimated Effort**: 1-2 hours

---

### Milestone 2: CI Workflow Changes [Status: Pending]

**Target**: Split release from regular CI, add manual release trigger

**Completion Criteria:**
- [ ] Modify `ci.yml` to remove auto-release on push to main
- [ ] Create new `release.yml` with manual trigger (workflow_dispatch)
- [ ] Add towncrier build step to release workflow
- [ ] Extract release notes from CHANGELOG for GitHub release
- [ ] Maintain existing artifact publishing (npm, Docker, Helm)
- [ ] Test full release workflow

**Estimated Effort**: 2-3 hours

---

### Milestone 3: /prd-done Integration [Status: Pending]

**Target**: Automatic fragment creation when completing PRDs

**Completion Criteria:**
- [ ] Update `shared-prompts/prd-done.md` with changelog fragment step
- [ ] Add conditional check for `changelog.d/` directory existence
- [ ] Implement PRD-to-release-notes extraction logic
- [ ] Test with a real PRD completion
- [ ] Verify fragments are included in PR commits

**Estimated Effort**: 1-2 hours

---

### Milestone 4: Documentation & Cross-Project Guide [Status: Pending]

**Target**: Enable adoption across all dot-ai projects

**Completion Criteria:**
- [ ] Document towncrier setup for other projects
- [ ] Create template configuration that can be copied
- [ ] Document fragment creation for non-PRD changes (bug fixes, etc.)
- [ ] Add CONTRIBUTING.md section about changelog fragments

**Estimated Effort**: 1-2 hours

---

## Dependencies

### Internal Dependencies
- `/prd-done` workflow (for automatic fragment creation)
- CI/CD pipeline (`ci.yml`)
- Existing release process (npm, Docker, Helm publishing)

### External Dependencies
- [towncrier](https://github.com/twisted/towncrier) - Python package, runs in CI only
- GitHub Actions workflow_dispatch trigger

---

## Design Decisions

### Decision 1: Towncrier over Custom Solution
**Date**: 2026-01-15
**Decision**: Use towncrier instead of building custom fragment collection script

**Rationale**:
- Battle-tested by major projects (pytest, pip, Twisted)
- Handles edge cases (duplicate fragments, ordering, formatting)
- Language-agnostic despite being Python tool
- Python only needed in CI, not by contributors
- Reduces maintenance burden

**Alternatives Considered**:
- Custom bash script: Simpler but more maintenance, edge cases
- Changesets: JS-focused, heavier dependency
- Release Please: Commit-message focused, less control over content

---

### Decision 2: Fragment Files over Conventional Commits
**Date**: 2026-01-15
**Decision**: Use fragment files for release notes, not conventional commit messages

**Rationale**:
- Allows rich, multi-sentence descriptions
- Can extract context from detailed PRDs
- Not limited to single-line commit message format
- Contributors can write proper release notes
- Decouples release notes from git history

---

### Decision 3: On-Demand Releases
**Date**: 2026-01-15
**Decision**: Change from auto-release on every merge to manual release trigger

**Rationale**:
- Control release timing (don't release on Fridays, etc.)
- Batch related features into single release
- Ensure release notes are meaningful (not empty)
- Reduce release noise for users
- Allow QA/validation before release

---

### Decision 4: Conditional Fragment Creation in /prd-done
**Date**: 2026-01-15
**Decision**: Only create fragments if `changelog.d/` directory exists

**Rationale**:
- Makes `/prd-done` workflow portable across all projects
- Projects can adopt towncrier incrementally
- No errors for projects not using this system
- Same workflow works everywhere

---

## Risk Management

### Identified Risks

**Risk: Python dependency in CI**
- **Likelihood**: Low
- **Impact**: Low
- **Mitigation**: Python is pre-installed on GitHub Actions runners, trivial to add if missing
- **Status**: Acceptable

**Risk: Contributors forget to create fragments**
- **Likelihood**: Medium
- **Impact**: Low (release notes just missing that item)
- **Mitigation**:
  - `/prd-done` auto-creates fragments
  - CI check via `towncrier check` (optional)
  - Easy to add fragments retroactively
- **Status**: Acceptable with mitigations

**Risk: Release workflow complexity**
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**: Clear documentation, tested workflow, rollback possible
- **Status**: Acceptable

---

## Success Metrics

### Quantitative Metrics
- [ ] 100% of releases have descriptive release notes
- [ ] Average release note length > 100 words (vs current ~20 words)
- [ ] Release frequency controlled (target: weekly or as-needed vs current: every merge)

### Qualitative Metrics
- [ ] Users can understand what changed from release notes alone
- [ ] Contributors find fragment creation easy
- [ ] Maintainers have control over release timing

---

## Work Log

### 2026-01-15: PRD Creation
**Duration**: ~1 hour
**Primary Focus**: Design towncrier-based release notes system

**Completed Work**:
- Analyzed current release notes problem (empty/minimal)
- Researched changelog generation tools (Changesets, Release Please, git-cliff, towncrier)
- Chose towncrier for fragment-based, language-agnostic approach
- Designed integration with existing `/prd-done` workflow
- Created comprehensive PRD with 4 milestones

**Key Decisions**:
- Use towncrier (battle-tested, language-agnostic)
- Fragment files over conventional commits (richer content)
- On-demand releases (control timing, batch features)
- Conditional fragment creation (portable across projects)

**Next Steps**: Begin Milestone 1 (towncrier setup)

---

## Appendix

### Example Fragment File

**File: `changelog.d/prd-328.feature.md`**
```markdown
Added HTTP API endpoints for the dashboard, enabling web UIs to interact
with dot-ai without MCP protocol support. Includes semantic search for
capabilities and patterns, session state persistence for page refresh
handling, and all existing MCP tool functionality exposed via REST.
```

### Example Generated Release Notes

```markdown
## [0.195.0] - 2026-01-20

### Features

- Added HTTP API endpoints for the dashboard, enabling web UIs to interact
  with dot-ai without MCP protocol support. Includes semantic search for
  capabilities and patterns, session state persistence for page refresh
  handling, and all existing MCP tool functionality exposed via REST.
  ([#328](https://github.com/vfarcic/dot-ai/issues/328))

- Implemented semantic search endpoint with configurable score thresholds
  for more precise capability and pattern matching.
  ([#330](https://github.com/vfarcic/dot-ai/issues/330))

### Bug Fixes

- Fixed query timeout issue when searching large capability collections.
  ([#325](https://github.com/vfarcic/dot-ai/issues/325))
```

### References
- [Towncrier Documentation](https://towncrier.readthedocs.io/)
- [Towncrier GitHub](https://github.com/twisted/towncrier)
- [Keep a Changelog](https://keepachangelog.com/)
