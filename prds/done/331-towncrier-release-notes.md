# PRD: Towncrier-based Release Notes System

**GitHub Issue**: [#331](https://github.com/vfarcic/dot-ai/issues/331)
**Status**: Complete (2026-01-15)
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

- [x] Releases have descriptive notes explaining what changed and why
- [x] Release timing is controlled (not automatic on every merge)
- [x] `/prd-done` workflow automatically creates changelog fragments (via `/changelog-fragment` skill)
- [x] Multiple features can be batched into a single release
- [x] Works across all dot-ai projects (language-agnostic)
- [ ] Existing releases cleaned up with meaningful notes for significant versions (Milestone 0 - future work)
- [x] Release workflow supports both tag-triggered and manual modes

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
   - Auto-generates `changelog.d/328-dashboard-http-api.feature.md` with release notes from PRD
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
│  │ 3. Create changelog.d/[id]-[description].[type].md    │ │
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
│  ├── 328-dashboard-http-api.feature.md  # Dashboard HTTP API│
│  ├── 330-semantic-search.feature.md     # Semantic search   │
│  ├── 456-fix-timeout.bugfix.md          # Bug fix           │
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
│  │    - Combines all fragments into docs/CHANGELOG.md     │ │
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
filename = "docs/CHANGELOG.md"
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
  <issue-number>-<short-description>.<type>.md

Examples:
  328-dashboard-http-api.feature.md    # Feature from PRD #328
  330-semantic-search.feature.md       # Feature from PRD #330
  456-fix-query-timeout.bugfix.md      # Bug fix for issue #456
  update-deps.misc.md                  # Miscellaneous change (no issue)
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
- Tag push (`v*`) → full release with artifacts and notes
- Manual trigger → release with optional `notes_only` mode

**New `release.yml` workflow (dual-trigger):**
```yaml
name: Release

on:
  # Trigger 1: Manual (for retroactive cleanup or special cases)
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g., 0.193.0)'
        required: true
      notes_only:
        description: 'Only create/update release notes (skip artifact publishing)'
        type: boolean
        default: false

  # Trigger 2: Tag push (normal release flow)
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Determine version and mode
        id: config
        run: |
          if [[ "${{ github.event_name }}" == "push" ]]; then
            # Tag trigger: extract version from tag, full release
            VERSION="${GITHUB_REF#refs/tags/v}"
            NOTES_ONLY="false"
          else
            # Manual trigger: use inputs
            VERSION="${{ inputs.version }}"
            NOTES_ONLY="${{ inputs.notes_only }}"
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "notes_only=$NOTES_ONLY" >> $GITHUB_OUTPUT

      - name: Setup Python (for towncrier)
        uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - name: Install towncrier
        run: pip install towncrier

      - name: Build changelog
        run: towncrier build --version ${{ steps.config.outputs.version }} --yes

      - name: Extract release notes
        id: notes
        run: |
          # Extract latest version section from CHANGELOG.md

      - name: Publish artifacts
        if: steps.config.outputs.notes_only != 'true'
        run: |
          # npm publish, docker push, helm push

      # ... rest of release steps (GitHub release creation)
```

**Trigger behavior:**

| Trigger | Version source | `notes_only` | Use case |
|---------|---------------|--------------|----------|
| Tag push (`v0.193.0`) | From tag | Always `false` | Normal releases |
| Manual | `inputs.version` (required) | `inputs.notes_only` | Retroactive cleanup, re-runs |

Note: `workflow_dispatch.inputs` only apply to manual triggers. Tag pushes ignore inputs entirely and extract version from `GITHUB_REF`.

### /prd-done Integration

**Addition to `shared-prompts/prd-done.md`:**

```markdown
### 2.5. Create Changelog Fragment (if applicable)

**IMPORTANT: Only if `changelog.d/` directory exists**

- [ ] **Check for changelog.d/ directory**: If directory doesn't exist, skip this section
- [ ] **Extract release notes from PRD**:
  - Read the PRD file being completed
  - Create title/description format (not diary-style "Added X"):
    - **Title**: Feature name in bold
    - **Description**: What it IS, not what was done
  - Link to docs at https://devopstoolkit.ai when applicable
- [ ] **Determine fragment type**:
  - `feature` - New functionality
  - `bugfix` - Bug fix
  - `breaking` - Breaking change
  - `doc` - Documentation only
  - `misc` - Other
- [ ] **Create fragment file**: `changelog.d/[issue-id]-[short-description].[type].md`
- [ ] **Include in commit**: Add fragment file to the PR commit
```

---

## Implementation Milestones

### Milestone 0: Retroactive Release Cleanup [Status: Pending]

**Target**: Clean up existing ~192 releases, consolidating into meaningful versions with proper release notes

**Background**: The project has accumulated many releases with empty/minimal notes. This milestone consolidates them into fewer, meaningful releases with proper descriptions.

**Process:**
1. Review releases from oldest to newest
2. Identify meaningful versions (significant features, breaking changes)
3. Delete tags and GitHub releases for versions between meaningful ones
4. Create changelog fragments for meaningful versions
5. Run release workflow with `notes_only: true` to generate proper notes

**Completion Criteria:**
- [ ] All existing releases reviewed and categorized
- [ ] Non-meaningful tags and GitHub releases deleted (images remain published)
- [ ] Changelog fragments created for each meaningful version
- [ ] Release notes regenerated for kept versions using `notes_only` mode
- [ ] Release history is clean and informative

**Cleanup approach:**
```
v0.1.0 → v0.2.0 → ... → v0.50.0 (meaningful) → v0.51.0 → ... → v0.75.0 (meaningful)
         └─────────────────┘                    └─────────────────┘
              DELETE these                           DELETE these
              Keep v0.50.0                           Keep v0.75.0
              Update its notes                       Update its notes
```

---

### Milestone 1: Towncrier Setup [Status: Complete]

**Target**: Basic towncrier configuration working locally

**Completion Criteria:**
- [x] Create `changelog.d/` directory with `.gitkeep`
- [x] Add towncrier configuration to `pyproject.toml`
- [x] Create sample fragment file for testing
- [x] Verify `towncrier build` works locally
- [x] Document fragment creation process in README or CONTRIBUTING

**Estimated Effort**: 1-2 hours

---

### Milestone 2: CI Workflow Changes [Status: Complete]

**Target**: Split release from regular CI, add dual-trigger release workflow

**Completion Criteria:**
- [x] Modify `ci.yml` to remove auto-release on push to main
- [x] Create new `release.yml` with dual triggers:
  - [x] Tag push trigger (`v*`) for normal releases
  - [x] Manual trigger (`workflow_dispatch`) with `version` and `notes_only` inputs
- [x] Implement version/mode detection logic based on trigger type
- [x] Add towncrier build step to release workflow
- [x] Add conditional artifact publishing (skip when `notes_only: true`)
- [x] Extract release notes from CHANGELOG for GitHub release
- [x] Maintain existing artifact publishing (npm, Docker, Helm) for full releases
- [ ] Test both trigger modes:
  - [ ] Tag push triggers full release
  - [ ] Manual with `notes_only: false` triggers full release
  - [ ] Manual with `notes_only: true` only updates release notes

---

### Milestone 3: /prd-done Integration [Status: Complete]

**Target**: Automatic fragment creation when completing PRDs

**Completion Criteria:**
- [x] Create `/changelog-fragment` skill for fragment generation
- [x] Add conditional check for `changelog.d/` directory existence
- [x] Implement PRD-to-release-notes extraction logic
- [x] Test with a real PRD completion (PRD-331 itself)
- [x] Verify fragments are included in PR commits

**Implementation Note**: Rather than embedding the logic in `prd-done.md`, a dedicated `/changelog-fragment` skill was created. This skill is invoked during the `/prd-done` workflow and provides guided fragment creation based on PRD content.

---

### Milestone 4: Documentation & Cross-Project Guide [Status: In Progress]

**Target**: Enable adoption across all dot-ai projects

**Completion Criteria:**
- [ ] Document towncrier setup for other projects
- [ ] Create template configuration that can be copied
- [ ] Document fragment creation for non-PRD changes (bug fixes, etc.)
- [x] Add CONTRIBUTING.md section about changelog fragments

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

### Decision 5: Dual-Trigger Release Workflow
**Date**: 2026-01-15
**Decision**: Support both tag push and manual workflow_dispatch triggers for releases

**Rationale**:
- Tag push (`v*`) provides natural release flow: create tag → release happens
- Manual trigger enables retroactive cleanup and special cases
- `workflow_dispatch.inputs` only apply to manual triggers (tag pushes ignore them)
- Cleaner than "release on every push to main" approach
- Maintainer explicitly controls when releases happen

**Trigger behavior:**
| Trigger | Version source | `notes_only` | Use case |
|---------|---------------|--------------|----------|
| Tag push | From `GITHUB_REF` | Always `false` | Normal releases |
| Manual | `inputs.version` | `inputs.notes_only` | Cleanup, re-runs |

---

### Decision 6: Notes-Only Mode for Retroactive Cleanup
**Date**: 2026-01-15
**Decision**: Add `notes_only` parameter to skip artifact publishing

**Rationale**:
- Enables retroactive release notes without republishing artifacts
- Artifacts (npm, Docker, Helm) already published and potentially in use
- Only updates GitHub Release with proper notes
- Essential for cleaning up ~192 existing releases
- Can also be used to fix/update release notes after the fact

---

### Decision 7: Delete Both Tags and Releases for Cleanup
**Date**: 2026-01-15
**Decision**: Aggressively delete both git tags and GitHub Release objects for non-meaningful versions

**Rationale**:
- Reduces noise in release history
- Makes meaningful releases easier to find
- Published artifacts (Docker images, npm packages) remain available
- Tags for non-meaningful versions serve no purpose
- Clean history is more valuable than preserving empty releases

**Alternatives Considered**:
- Delete only GitHub Releases (keep tags): Less clean, tags still clutter history
- Keep everything, just update notes: Doesn't solve the "too many releases" problem

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

## Appendix

### Example Fragment File

**File: `changelog.d/328-dashboard-http-api.feature.md`**
```markdown
**Dashboard HTTP API**

HTTP API endpoints enabling web UIs to interact with dot-ai without MCP
protocol support. Includes semantic search for capabilities and patterns,
session state persistence for page refresh handling, and all existing MCP
tool functionality exposed via REST.
```

### Example Generated Release Notes

```markdown
## [0.195.0] - 2026-01-20

### Features

- **Dashboard HTTP API**

  HTTP API endpoints enabling web UIs to interact with dot-ai without MCP
  protocol support. Includes semantic search for capabilities and patterns,
  session state persistence for page refresh handling, and all existing MCP
  tool functionality exposed via REST.
  ([#328](https://github.com/vfarcic/dot-ai/issues/328))

- **Semantic Search Endpoint**

  Configurable score thresholds for more precise capability and pattern matching.
  ([#330](https://github.com/vfarcic/dot-ai/issues/330))

### Bug Fixes

- **Query Timeout Fix**

  Resolved timeout issue when searching large capability collections.
  ([#325](https://github.com/vfarcic/dot-ai/issues/325))
```

### References
- [Towncrier Documentation](https://towncrier.readthedocs.io/)
- [Towncrier GitHub](https://github.com/twisted/towncrier)
- [Keep a Changelog](https://keepachangelog.com/)
