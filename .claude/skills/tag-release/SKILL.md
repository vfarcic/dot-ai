---
name: tag-release
description: Create a release tag based on accumulated changelog fragments. Run when ready to cut a release.
---

# Create Release Tag

Create a semantic version tag based on accumulated changelog fragments. This aggregates all pending fragments to determine the appropriate version bump and creates an annotated tag.

## When to Use

Run this skill when:
- Multiple PRs have been merged with changelog fragments
- You're ready to cut a release
- After the /prd-done workflow completes (not during it)

## Workflow

### Step 1: Check for Pending Fragments

List all files in `changelog.d/` directory:
```bash
ls -la changelog.d/
```

If no fragments exist (only `.gitkeep` or empty), inform the user there's nothing to release.

### Step 2: Get Current Version

Find the latest tag:
```bash
git tag --sort=-v:refname | head -1
```

If no tags exist, start from `v0.0.0`.

### Step 3: Analyze Fragments for Version Bump

Examine all fragment files to determine the highest-impact change type:

**Priority order**: `breaking` > `feature` > `bugfix` > `doc` = `misc`

The highest-priority fragment type determines the version bump:
- Any `.breaking.md` exists → bump **major** (e.g., v1.2.3 → v2.0.0)
- Any `.feature.md` exists → bump **minor** (e.g., v1.2.3 → v1.3.0)
- Only `.bugfix.md`, `.doc.md`, or `.misc.md` → bump **patch** (e.g., v1.2.3 → v1.2.4)

### Step 4: Propose Version

Show the user:
1. Current version
2. Fragments found (list them with their types)
3. Proposed next version based on the analysis
4. Ask for confirmation or allow override

### Step 5: Check for [skip ci] in HEAD

**IMPORTANT**: Tags pointing to commits with `[skip ci]` in the message will NOT trigger the release workflow.

Check the HEAD commit message:
```bash
git log -1 --format="%s" HEAD
```

If the message contains `[skip ci]`, `[ci skip]`, or `[no ci]`:
1. Inform the user that tagging this commit would prevent the release workflow from running
2. Create a release preparation commit:
```bash
git commit --allow-empty -m "chore: prepare release [version]"
git push origin HEAD
```

This empty commit gives us a clean commit to tag that will trigger CI.

### Step 6: Create and Push Tag

If confirmed (and after Step 5 if needed):
```bash
git tag -a [version] -m "[Brief description summarizing the fragments]"
git push origin [version]
```

### Step 7: Confirm Success

Show the user:
1. The tag created
2. The tag URL on GitHub (if applicable)
3. Note that CI/CD will generate release notes from the fragments

## Guidelines

- **Don't run during PR workflow**: This is a separate release activity
- **Review fragments first**: Make sure all fragments are accurate before tagging
- **Use semantic versioning**: Follow semver strictly based on fragment types
- **Brief tag message**: Summarize the release in 1-2 sentences
- **Never tag [skip ci] commits**: Tags on commits with `[skip ci]` won't trigger CI - always create a preparation commit first
