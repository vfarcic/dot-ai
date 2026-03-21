---
name: dot-ai-tag-release
description: Create a release tag based on accumulated changelog fragments. Run when ready to cut a release.
user-invocable: true
---

# Create Release Tag

Create a semantic version tag based on accumulated changelog fragments.

## When to Use

Run this skill when:
- Multiple PRs have been merged with changelog fragments
- You're ready to cut a release
- After the /prd-done workflow completes (not during it)

## Workflow

### Step 1: Analyze

Run the analysis script bundled with this skill:
```bash
bash .claude/skills/dot-ai-tag-release/analyze.sh
```

If the output contains `NO_FRAGMENTS=true`, inform the user there's nothing to release and stop.

### Step 2: Propose Version

Present the script output to the user:
1. Current version (`CURRENT_VERSION`)
2. Fragments found (the `FRAGMENTS` list with their types)
3. Proposed next version (`PROPOSED_VERSION`) based on bump type (`BUMP_TYPE`)
4. Ask for confirmation or allow override

### Step 3: Handle [skip ci]

If `SKIP_CI=true`, inform the user that tagging HEAD would prevent the release workflow from running. Create a preparation commit:
```bash
git commit --allow-empty -m "chore: prepare release [version]"
git push origin HEAD
```

### Step 4: Create and Push Tag

After confirmation:
```bash
git tag -a [version] -m "[Brief description summarizing the fragments]"
git push origin [version]
```

### Step 5: Confirm Success

Show the user:
1. The tag created
2. The tag URL on GitHub (if applicable)
3. Note that CI/CD will generate release notes from the fragments

## Guidelines

- **Don't run during PR workflow**: This is a separate release activity
- **Review fragments first**: Make sure all fragments are accurate before tagging
- **Use semantic versioning**: Follow semver strictly based on fragment types
- **Brief tag message**: Summarize the release in 1-2 sentences
- **Never tag [skip ci] commits**: Always create a preparation commit first

