---
name: changelog-fragment
description: Create changelog fragment for release notes. Invoke during /prd-done workflow during the first push to the PR.
---

# Create Changelog Fragment

Create a towncrier changelog fragment for release notes when completing PRD work. This should be included in the PR so the fragment is reviewed along with the code changes.

## Workflow

### Step 1: Identify the PRD

If not already known from context, ask: "Which PRD should I create release notes for?"

Look for:
- PRD mentioned in recent conversation
- PRD referenced in current branch name (e.g., `feature/prd-320-*`)
- PRD file path provided by user

### Step 2: Read the PRD Thoroughly

Read the entire PRD file to extract:
- **Problem Statement**: What user pain point was solved, why it mattered
- **Solution Overview**: What the feature does, how it works
- **User Impact**: Specific benefits, what users can now do
- **Key Capabilities**: Individual features, options, or modes added
- **Technical Details**: Configuration options, environment variables, commands
- **Documentation Updates**: Which docs were added or updated (check Milestones section)

### Step 3: Determine Fragment Type

Read `pyproject.toml` to see the available fragment types. Each `[[tool.towncrier.type]]` section has:
- A comment above it describing when to use that type
- A `directory` field (the type identifier used in the filename, e.g., `feature` for `.feature.md`)

Choose the type that best matches the PRD based on those descriptions.

### Step 4: Write the Fragment

Create file: `changelog.d/[issue-id].[type].md`

**IMPORTANT: Use flat structure, NOT subdirectories!**
- ✅ Correct: `changelog.d/329.feature.md`
- ❌ Wrong: `changelog.d/feature/329.md`

**Naming convention:**
- `issue-id`: GitHub issue number from PRD (e.g., `320`)
- `type`: Type identifier from step 3 (e.g., `feature`, `bugfix`, `misc`)

**Content format:**
```markdown
## [Feature Title]

[Opening sentence: What this feature is and the problem it solves]

[Key capabilities paragraph: Specific things users can now do, with concrete examples]

[Configuration/usage paragraph if applicable: How to enable or use the feature]

[Documentation link if docs were updated]
```

**Documentation links:**
If the PRD includes documentation updates, link to the relevant page on devopstoolkit.ai. The URL pattern is:
- `https://devopstoolkit.ai/docs/{project}/{path}`
- Where `{project}` is: `mcp` (dot-ai), `controller` (dot-ai-controller), `ui` (dot-ai-ui), or `stack` (dot-ai-stack)
- And `{path}` maps from the docs folder (e.g., `docs/guides/mcp-recommendation-guide.md` → `guides/mcp-recommendation-guide`)

**Example: `changelog.d/142.feature.md`**
```markdown
## Multi-Cluster Management

Manage multiple Kubernetes clusters from a single dot-ai instance. Previously, each cluster required its own dot-ai deployment, making it difficult to compare configurations or apply consistent patterns across environments.

The `query` tool now accepts a `--cluster` flag to target specific clusters, and results indicate which cluster each resource belongs to. The `recommend` tool can generate manifests targeting different clusters with environment-specific customizations. Cross-cluster searches let you find resources across all connected clusters simultaneously—useful for tracking down where a particular workload is deployed. Cluster health aggregation shows a unified view of all clusters in the `version` output.

Configure additional clusters by adding kubeconfig contexts to `ADDITIONAL_KUBECONFIGS` (comma-separated paths). Each context becomes available as a cluster target. The default cluster remains the current kubeconfig context when no `--cluster` flag is specified.

See the [Multi-Cluster Setup Guide](https://devopstoolkit.ai/docs/mcp/setup/multi-cluster-setup) for configuration details and examples.
```

### Step 5: Confirm Creation

Show the user:
1. The fragment file path created
2. The content written
3. Reminder to commit and push with the PR

## Guidelines

- **User-focused**: Describe what users gain, not implementation details
- **Specific**: Include concrete examples of what each capability does
- **Complete**: Cover all major features added, not just the headline
- **Present tense**: "Tools now return..." not "Added support for..."
- **No diary style**: "Multi-Cluster Management" not "Added multi-cluster support"
- **Include configuration**: Mention environment variables, commands, or setup steps
- **Link to docs**: If PRD updated documentation, link to the specific page on devopstoolkit.ai
