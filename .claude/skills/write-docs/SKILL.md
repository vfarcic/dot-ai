---
name: write-docs
description: Write documentation with real, validated examples. Executes commands through the user to capture actual output. Use for any new documentation or major doc updates.
---

# Write Documentation

Write accurate, user-focused documentation with real examples by executing operations through the user.

## Principles

1. **Execute-then-document**: Never write examples without real output
2. **Chunk-by-chunk**: Write one section at a time, get confirmation before proceeding
3. **User-focused**: Write for users, not developers
4. **Validate prerequisites**: Run setup steps from existing docs to verify they work
5. **Claude runs infrastructure, user runs MCP**: Claude executes all bash/infrastructure commands. Only ask user for MCP client interactions (the actual user-facing examples).
6. **Fix docs when broken**: If existing docs don't work during setup, STOP and discuss updating those docs before proceeding.

## Workflow

### Step 1: Identify the Documentation Target

Ask the user what documentation to write. Options:
- New feature guide (e.g., "knowledge base guide")
- Update existing guide
- API reference
- Setup/configuration guide

### Step 2: Fresh Environment Setup

**ALWAYS start with a clean test cluster to ensure reproducible documentation.**

**Follow the actual docs (`docs/setup/mcp-setup.md`) - this validates they work.**

**Claude executes all infrastructure steps directly using Bash tool:**

1. **Tear down existing test cluster if present**
   ```bash
   kind delete cluster --name dot-test 2>/dev/null || true
   rm -f ./kubeconfig.yaml
   ```

2. **Create fresh Kind cluster with local kubeconfig**
   ```bash
   kind create cluster --name dot-test --kubeconfig ./kubeconfig.yaml
   export KUBECONFIG=./kubeconfig.yaml
   ```

3. **Install prerequisites (ingress controller)**
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
   # Wait for ingress to be ready
   kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=300s
   ```

4. **Follow docs/setup/mcp-setup.md** (skip controller if not needed for the feature)
   - Step 1: Set environment variables (use existing API keys from env)
   - Step 2: Install controller via Helm (skip if feature doesn't need it)
   - Step 3: Install MCP server via Helm
   - Step 4: Tell user to configure MCP client
   - Step 5: Tell user to verify with "Show dot-ai status"

5. **For unreleased features: Build and use local images**

   If documenting a feature not yet in published charts:
   ```bash
   # Build MCP server image
   npm run build
   docker build -t dot-ai:test .
   kind load docker-image dot-ai:test --name dot-test

   # Build agentic-tools plugin image
   docker build -t dot-ai-agentic-tools:test ./packages/agentic-tools
   kind load docker-image dot-ai-agentic-tools:test --name dot-test
   ```

   Add these flags to helm install:
   ```
   --set image.repository=dot-ai \
   --set image.tag=test \
   --set image.pullPolicy=Never \
   --set plugins.agentic-tools.image.repository=dot-ai-agentic-tools \
   --set plugins.agentic-tools.image.tag=test \
   --set plugins.agentic-tools.image.pullPolicy=Never
   ```

**IMPORTANT**: Always use `KUBECONFIG=./kubeconfig.yaml` for all kubectl/helm commands.

**If any step fails or doesn't match existing docs**: STOP and discuss whether to update those docs before proceeding.

**Why fresh cluster?** Ensures documentation examples work from a known clean state and validates setup docs.

### Step 3: Outline the Documentation

Present an outline of sections to write. Example:
```
1. Overview (what it does, when to use it)
2. Prerequisites
3. Basic Usage (with real examples)
4. Advanced Features
5. API Reference
6. Troubleshooting
7. Next Steps
```

Get user confirmation on the outline before proceeding.

### Step 4: Write Chunk-by-Chunk

For each section:

1. **Propose the section content** - Brief description of what this section covers
2. **Execute or request execution**:
   - **Bash commands**: Claude runs these directly using Bash tool
   - **MCP interactions**: Ask user to send intent and share output (these are the user-facing examples we're documenting)
3. **Wait for output** - For MCP interactions, user shares the actual output
4. **Write the chunk** - Create the documentation section using real output
5. **Apply the edit** - Use Edit tool to add to the doc file
6. **Proceed to next** - Move to the next section

**Key distinction**: Infrastructure/setup = Claude runs it. User-facing MCP examples = User runs it and shares output.

### Step 5: Cross-Reference Check

After all sections are written:
- Verify internal links work
- Check links to other docs exist
- Update `mcp-tools-overview.md` if adding a new tool guide
- Update any index pages

### Step 6: Final Review

Tell the user: "Documentation complete. Please review the full file and let me know if any adjustments are needed."

## Example Execution Request Formats

**For MCP tool operations:**
```
Please send this intent to your MCP client:
"Ingest this document into the knowledge base: [content] with URI: [url]"

Share the response you receive.
```

**For status checks:**
```
Please ask: "Show dot-ai status"

Share what you see for the Vector DB collections.
```

**For bash commands:**
```
Please run:
kubectl get pods -n dot-ai

Share the output.
```

## Important Rules

- **Never invent output** - Always use real responses from the user
- **Never skip validation** - Every example must be executed first
- **Keep sections small** - One concept per chunk for easy review
- **Use user language** - Avoid internal/developer terminology
- **Include error cases** - Document what happens when things go wrong

## File Locations

- Feature guides: `docs/guides/mcp-*-guide.md`
- Setup guides: `docs/setup/*.md`
- Tool overview: `docs/guides/mcp-tools-overview.md`
- Images: `docs/img/`
