# Intent Refinement Guidance

The provided intent lacks sufficient detail to proceed.

## Your Task

Figure out what the user wants to do. It could be anything - deploying applications, provisioning cloud resources (AWS, Azure, GCP), setting up infrastructure, configuring services, or something else entirely. Use your available context to gather details, then call the recommend tool again with a refined intent and `final: true`.

## Suggested Approach

### Step 1: Analyze Available Context

Check what context you have access to:

- **Project directory**: Are there files to analyze? Is the directory empty?
- **Conversation history**: Has the user mentioned relevant details earlier?
- **User preferences**: Do you know anything about their typical patterns or preferences?

### Step 2: If Project Has Files, Perform Deep Analysis

**Thoroughness over speed.** The more time you spend analyzing the project, the better your refined intent will be. Shallow analysis leads to vague intents. Investigate thoroughly before proceeding.

**Discover What Exists**

Explore the full directory structure. Read files to understand what they do, not just note their existence. The project could be anything - application source code, infrastructure definitions, Helm charts, Terraform configs, policy definitions, documentation, or something else entirely. Don't assume it's an application.

**Identify What the User Might Want**

A project may relate to multiple things - components, resources, services, infrastructure. Scan thoroughly to identify what exists and how things relate to each other.

**Gather Relevant Details**

For each thing you identify, dig into the specifics that would be relevant. What details matter depends entirely on what it is. Find evidence in the codebase rather than guessing. Note anything unclear as a question for the user.

### Step 3: Discuss With User

This is a conversation, not a one-shot analysis.

**Present your findings** - explain what you discovered and what you think the user might want to do. **Ask questions** - clarify what to include, confirm the details you found are correct, and ask about anything you couldn't determine from analysis.

Iterate as needed. You may need to go back and analyze further based on user responses.

If there are no files to scan or the purpose is unclear, ask the user to describe what they want to do.

### Step 4: Call Recommend Again

Once you and the user have agreed on what they want to do and the relevant details, call the recommend tool with:
- A comprehensive intent describing what they want and relevant specifics
- `final: true` to proceed

## What Makes a Good Intent

A detailed intent describes what the user wants to do with relevant specifics. What details matter depends entirely on what they're trying to accomplish. The more relevant detail you provide, the better.

## What NOT to Include

**Do NOT specify Kubernetes resource types** (e.g., "need a Deployment", "use Ingress", "create a Service"). The recommendation engine's job is to analyze your intent and find the BEST Kubernetes resources for your needs. Pre-specifying resources prevents it from recommending better alternatives like:

- Operators and CRDs (Knative Service, Crossplane resources, etc.)
- Platform-specific solutions (OpenShift Routes vs Ingress, etc.)
- Better-fit resource types (StatefulSet vs Deployment for stateful apps)
- Organization-specific patterns

**Good intent**: "Deploy a Python Flask API that connects to PostgreSQL. Container listens on port 5000, needs 512Mi memory, requires DATABASE_URL environment variable. Expose publicly at api.example.com"

**Bad intent**: "Deploy Flask API. Need Kubernetes Deployment, Service, and Ingress to expose..."

Focus on: WHAT you're deploying, the technical context (ports, runtime, requirements), and the desired outcome. Let the recommendation engine determine HOW.
