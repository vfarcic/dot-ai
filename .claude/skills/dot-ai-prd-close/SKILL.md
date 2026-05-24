---
name: dot-ai-prd-close
description: Close a PRD that is already implemented or no longer needed
user-invocable: true
---

# Close PRD

Close a PRD that is already implemented (in previous work or external projects) or is no longer needed. This workflow updates the PRD status, archives it, updates the GitHub issue, and commits directly to main without triggering CI.

## When to Use This Command

**Use `/prd-close` when:**
- ✅ PRD functionality is already implemented in a separate project or previous work
- ✅ PRD is no longer relevant (superseded, requirements changed, out of scope)
- ✅ PRD requirements are satisfied by existing functionality
- ✅ No new code implementation is needed in this repository

**DO NOT use `/prd-close` when:**
- ❌ You just finished implementing the PRD (use `/prd-done` instead)
- ❌ PRD has active implementation work in progress
- ❌ There are uncommitted code changes that need to be part of a PR

## Usage

```bash
# Interactive mode - will prompt for PRD number and closure reason
/prd-close

# With PRD number
/prd-close 20

# With PRD number and reason
/prd-close 20 "Already implemented by dot-ai-controller"
```

**Note**: If any `gh` command fails with "command not found", inform the user that GitHub CLI is required and provide the installation link: https://cli.github.com/

## Workflow Steps

### Step 1: Identify PRD and Reason

**If PRD number not provided:**
- Check conversation context for recent PRD discussion
- Check git branch for PRD indicators (e.g., `feature/prd-X`)
- If unclear, prompt user for PRD number

**Closure Reason Categories:**
- **Already Implemented**: Functionality exists in external project or previous work
- **No Longer Needed**: Requirements changed, out of scope, or superseded
- **Duplicate**: Another PRD covers the same functionality
- **Deferred**: Moved to future version or different project

**Required Information:**
- PRD number
- Closure reason (brief description)
- Implementation reference (if already implemented): link to repo, PR, or documentation

### Step 2: Read and Validate PRD

Read the current PRD file from `prds/[number]-*.md`:

**Validation checks:**
- [ ] PRD file exists and is readable
- [ ] Confirm with user that this PRD should be closed
- [ ] Verify closure reason makes sense given PRD content
- [ ] Ask user for implementation evidence (if "already implemented")

**Present PRD summary to user:**
```markdown
## PRD #X: [Title]
**Status**: [Current Status]
**Created**: [Date]

**Summary**: [Brief description of what PRD requested]

**Proposed Action**: Close as [reason]
**Implementation Reference**: [If applicable]

Proceed with closure? (yes/no)
```

### Step 3: Update PRD File

Update the PRD metadata:

**Metadata Updates:**
```markdown
**Status**: Complete [or] No Longer Needed [or] Duplicate
**Last Updated**: [Current Date]
**Completed**: [Current Date] [or] **Closed**: [Current Date]
```

### Step 4: Move PRD to Archive

Move the PRD file to the done directory and update roadmap:

```bash
git mv prds/[number]-[name].md prds/done/
```

**Note**: If the move fails because `prds/done/` doesn't exist, create it with `mkdir -p prds/done` and retry.

**Update ROADMAP.md (if it exists):**
- [ ] Check if `docs/ROADMAP.md` exists
- [ ] Remove the closed PRD from the roadmap (search for "PRD #[number]")
- [ ] Remove the entire line that references this PRD
- [ ] Closed PRDs should not appear in future roadmap as they're no longer being worked on

### Step 5: Update GitHub Issue

**Reopen issue temporarily to update:**
```bash
gh issue reopen [number]
```

**Update issue description with new PRD path and status:**
```bash
gh issue edit [number] --body "$(cat <<'EOF'
## PRD: [Title]

**Problem**: [Original problem statement]

**Solution**: [Original solution statement]

**Detailed PRD**: See [prds/done/[number]-[name].md](./prds/done/[number]-[name].md)

**Priority**: [Original Priority]

**Status**: ✅ **[COMPLETE/CLOSED]** - [Brief reason]
EOF
)"
```

### Step 6: Close GitHub Issue

Close the issue with comprehensive closure comment:

```bash
gh issue close [number] --comment "$(cat <<'EOF'
## ✅ PRD #[number] Closed - [Reason Category]

[Detailed explanation of why PRD is being closed]

### [If "Already Implemented"]
**Implementation Details**

This PRD requested [functionality]. **All core requirements are satisfied** by [implementation reference].

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| [Requirement 1] | [Where implemented] | ✅ Complete |
| [Requirement 2] | [Where implemented] | ✅ Complete |

**Implementation Reference**: [Link to project/repo/PR]

[If there are gaps]
**Not Implemented** (deferred or out of scope):
- [Feature X] - [Why not needed or deferred]

### [If "No Longer Needed"]
**Reason for Closure**

[Explain why requirements changed, what superseded this, or why it's out of scope]

**Alternative Approach**: [If applicable]
[What replaced this PRD or how needs are met differently]

### Files

**PRD Location**: `prds/done/[number]-[name].md`
**Status**: [Complete/Closed]
**Closed**: [Date]
EOF
)"
```

### Step 7: Commit and Push

**Commit changes directly to main with skip CI:**

> ⚠️ **CI skip safety rule**: The `[skip ci]` flag below is safe **only because this commit goes directly to the default branch (`main`)**. GitHub Actions honors `[skip ci]` on the tip commit of any push and suppresses workflows for the entire push — including PRs. **Never** include `[skip ci]` on a commit that will land on a branch with an open or planned PR; it will silently disable CI for the whole PR. If `/prd-close` is being run from a feature branch instead of `main`, stop and switch to `main` before proceeding (or omit the flag).

```bash
# Stage all changes
git add .

# Verify what will be committed
git status

# Commit with [skip ci] — safe here because the commit goes directly to main
git commit -m "docs(prd-[number]): close PRD #[number] - [brief reason] [skip ci]

- Moved PRD to prds/done/ directory
- Updated PRD status to [Complete/Closed]
- Updated GitHub issue description with new path
- [Implementation details or reason]

Closes #[number]"

# Pull latest and push to remote
git pull --rebase origin main && git push origin main
```

**Important**:
- Use `[skip ci]` **only when committing directly to the default branch (`main`)** — see safety rule above. Never on feature-branch commits.
- Include issue reference (`Closes #[number]`) to link commit to issue

## Example Scenarios

### Example 1: Already Implemented in External Project

```bash
/prd-close 20 "Implemented by dot-ai-controller"
```

**Closure Comment:**
```markdown
## ✅ PRD #20 Closed - Already Implemented

This PRD requested proactive Kubernetes cluster monitoring with AI-powered remediation.
**Core functionality (60-80%) is already implemented** by the separate
[dot-ai-controller](https://github.com/vfarcic/dot-ai-controller) project.

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Continuous health checks | Event-based monitoring via K8s events | ✅ Complete |
| Intelligent alerting | Slack notifications with AI analysis | ✅ Complete |
| Automated remediation | Automatic/manual modes with confidence thresholds | ✅ Complete |
| Anomaly detection | AI-powered event analysis | ✅ Complete |

**Not Implemented** (advanced features, may be future PRD):
- Continuous metrics monitoring (Prometheus-style)
- Predictive analytics with baseline learning
- Multi-channel alerting (email, PagerDuty)
```

### Example 2: Duplicate PRD

```bash
/prd-close 45 "Duplicate of PRD #44"
```

**Closure Comment:**
```markdown
## 🔄 PRD #45 Closed - Duplicate

This PRD covers the same functionality as PRD #44. Consolidating all work
under PRD #44 to avoid fragmentation.

**Action**: Continue work on PRD #44 instead.
```

### Example 3: No Longer Needed

```bash
/prd-close 12 "Requirements changed, out of scope"
```

**Closure Comment:**
```markdown
## ⏸️ PRD #12 Closed - No Longer Needed

After discussion, this approach no longer aligns with project direction.
Requirements have evolved and this PRD is out of scope.

**Alternative Approach**: Using [different solution/approach] instead.
```

## Success Criteria

✅ **PRD file updated** with completion/closure metadata
✅ **PRD archived** to `prds/done/` directory
✅ **GitHub issue updated** with new PRD path
✅ **GitHub issue closed** with comprehensive closure comment
✅ **Changes committed to main** with skip CI flag
✅ **Changes pushed to remote** repository

## Notes

- **No PR required**: This workflow commits directly to main for documentation-only changes
- **Skip CI**: Include `[skip ci]` **only because this workflow commits directly to `main`**. Never apply this pattern to feature-branch commits — `[skip ci]` on a push's tip commit suppresses CI for the entire PR.
- **Comprehensive documentation**: Ensure issue comment clearly explains closure reason
- **Implementation references**: Link to external projects, repos, or PRs where functionality exists
- **Gap acknowledgment**: Be honest about what's implemented vs. what's missing

