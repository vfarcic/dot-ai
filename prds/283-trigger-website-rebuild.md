# PRD #283: Trigger dot-ai-website Rebuild on Release

## Overview

| Field | Value |
|-------|-------|
| **PRD ID** | 283 |
| **Feature Name** | Trigger Website Rebuild on Release |
| **Status** | Draft |
| **Priority** | High |
| **Created** | 2025-12-17 |
| **Last Updated** | 2025-12-17 |

## Problem Statement

When dot-ai releases a new version, the dot-ai-website does not automatically rebuild to pull the latest documentation. This means documentation updates in this repository are not reflected on the website until someone manually triggers a website rebuild or makes a change to the website repository itself.

### Current State
- dot-ai-website fetches documentation from this repository during its build process via `scripts/fetch-docs.sh`
- dot-ai-website's release workflow currently triggers on `repository_dispatch` events with type `upstream-release`
- There is no automated connection between this repo's releases and the website rebuild

### Impact
- Documentation updates are delayed reaching end users
- Manual intervention required to update website after releases
- Documentation can become stale/out of sync with released versions

## Proposed Solution

Add a repository dispatch step at the end of the release job that sends an `upstream-release` event to the dot-ai-website repository. This will trigger the website to rebuild and pull the latest documentation.

### Technical Approach
1. Add a `repository_dispatch` step using `peter-evans/repository-dispatch@v3` action
2. Send event type `upstream-release` to `vfarcic/dot-ai-website`
3. Include source repository and version in the payload for traceability
4. Requires a Personal Access Token (PAT) with appropriate permissions stored as `WEBSITE_DISPATCH_TOKEN` secret

### Implementation Details

Add this step at the end of the `release` job in `.github/workflows/ci.yml` (after the GitHub Release creation step):

```yaml
- name: Trigger Website Rebuild
  uses: peter-evans/repository-dispatch@v3
  with:
    token: ${{ secrets.WEBSITE_DISPATCH_TOKEN }}
    repository: vfarcic/dot-ai-website
    event-type: upstream-release
    client-payload: '{"source": "dot-ai", "version": "${{ needs.version.outputs.new-version }}"}'
```

### Prerequisites
- Personal Access Token with `repo` scope (or fine-grained token with `contents: write` on dot-ai-website)
- Secret `WEBSITE_DISPATCH_TOKEN` added to this repository
- dot-ai-website repository updated to listen for `repository_dispatch` events (already done)

## Success Criteria

1. When this repo releases a new version, dot-ai-website automatically starts a rebuild
2. The website successfully pulls and displays the latest documentation
3. No manual intervention required for documentation updates to appear on website

## Milestones

- [ ] Create PAT with appropriate permissions
- [ ] Add `WEBSITE_DISPATCH_TOKEN` secret to repository
- [ ] Add repository dispatch step to release workflow
- [ ] Test end-to-end: release triggers website rebuild
- [ ] Verify documentation updates appear on website

## Dependencies

- dot-ai-website must be configured to accept `repository_dispatch` events with type `upstream-release` (completed)
- dot-ai-controller also implementing same trigger (PRD #30 in that repo)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| PAT expires | Use a long-lived token or fine-grained token; document renewal process |
| Website build fails | Website has its own CI checks; dispatch is fire-and-forget |
| Rate limiting | Releases are infrequent; not a concern |

## Progress Log

| Date | Update |
|------|--------|
| 2025-12-17 | PRD created |

## References

- GitHub Issue: https://github.com/vfarcic/dot-ai/issues/283
- Related: dot-ai-website release workflow update
- Related: dot-ai-controller PRD #30 (same feature)
- GitHub Actions: [repository-dispatch action](https://github.com/peter-evans/repository-dispatch)
