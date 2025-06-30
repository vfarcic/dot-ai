# Kubernetes Application Management - Dual Mode Agent

## Overview

A Kubernetes application deployment agent that can operate in two modes:
1. **Direct Agent Mode**: Standalone CLI tool that interacts directly with users
2. **MCP Mode**: Model Context Protocol server with embedded agent intelligence

Both modes share the same core intelligence powered by Claude Code SDK, implementing an evolved version of the discovery-driven workflow originally inspired by the `manage-app.md` prompt (see `ORIGINAL_INSPIRATION.md` for the full starting point).

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   App Agent Core                           │
│              (Powered by Claude Code SDK)                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Agent Intelligence                     │   │
│  │  • Dynamic cluster discovery (CRDs + core K8s)    │   │
│  │  • Strategy selection (ANY discovered resources)   │   │
│  │  • Manifest generation from schemas                │   │
│  │  • Memory-enhanced learning                        │   │
│  │  • Workflow orchestration                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Dual Output Modes:                                        │
│  ┌─────────────────────┐    ┌─────────────────────────┐   │
│  │   Direct CLI Mode   │    │      MCP Mode           │   │
│  │                     │    │                         │   │
│  │ • Direct user Q&A   │    │ • Structured guidance   │   │
│  │ • Terminal output   │    │ • JSON responses        │   │
│  │ • Session mgmt      │    │ • Agent orchestration  │   │
│  └─────────────────────┘    └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Core Principles

1. **Discovery-Driven**: Works in any cluster by discovering CRDs and core K8s resources
2. **Resource-Agnostic**: Can deploy using ANY available Kubernetes resources (examples: AppClaim, CloudRun, Knative, ArgoCD, standard K8s, etc.)
3. **Memory-Enhanced**: Learns from successful deployments and failures  
4. **Dual Interface**: Same intelligence, two interaction patterns
5. **Zero Hard-coding**: No assumptions about cluster platforms or specific CRDs
6. **Workflow Guidance**: Always tells users/agents what to do next

## Universal Extensibility

🔄 **The system adapts to ANY cluster configuration:**

- **Platform Clusters**: GKE with CloudRun, EKS with Lambda, AKS with ContainerApps
- **GitOps Clusters**: ArgoCD Applications, Flux HelmReleases, custom CI/CD CRDs  
- **Serverless Clusters**: Knative Services, OpenFaaS Functions, Fission environments
- **Application Platforms**: DevOpsToolkit AppClaims, Crossplane Compositions, Helm Operator
- **Service Mesh**: Istio VirtualServices, Linkerd ServiceProfiles, custom mesh CRDs
- **Vanilla Kubernetes**: Standard Deployments, Services, Ingress - works everywhere
- **Custom Platforms**: Your organization's custom CRDs and abstractions

> The agent learns the schema of ANY discovered CRD through `kubectl explain` and generates appropriate manifests. No updates needed for new platforms!

## Governance & Guardrails

🗣️ **Plain English governance - no YAML required:**

The agent understands organizational policies written in natural language and applies them throughout the deployment process.

### Policy Template Examples

**Security & Compliance:**
```
# governance/security-policy.txt
Never allow privileged containers in production.
Always require security contexts with non-root users.
All images must come from gcr.io/my-company or registry.my-company.com.
Production deployments must have the labels: security.policy=restricted and compliance=sox.
```

**Resource & Cost Controls:**
```
# governance/resource-policy.txt
Development environments: maximum 3 replicas and 500m CPU per app.
Staging environments: maximum 10 replicas and 2 CPU cores per app.
Production environments: require approval for more than 20 replicas.
Never allow deployments that would cost more than $100/month without approval.
```

**Platform Preferences:**
```
# governance/platform-policy.txt
Prefer AppClaim over standard Kubernetes when available.
Never use AWS Lambda CRDs in our GCP environment.
Always use Knative for serverless workloads when available.
Require ingress capability for all web applications.
```

**Environment Rules:**
```
# governance/environment-policy.txt
Developers can only deploy to namespaces starting with "dev-" or "feature-".
Contractors can only deploy to the "sandbox" namespace.
Production deployments require approval from the platform team.
All applications must have monitoring enabled.
```

### How It Works

**1. Policy Loading:**
```bash
# Agent reads plain English policies
app-agent config set governance.policy-files "./governance/*.txt"
app-agent governance validate  # Checks if policies are understood
```

**2. Runtime Application:**
The agent interprets policies contextually during each workflow step:

- **Discovery**: "Never use AWS Lambda CRDs" → filters out Lambda CRDs
- **Strategy**: "Prefer AppClaim over standard Kubernetes" → ranks AppClaim higher
- **Configuration**: "Maximum 3 replicas in development" → validates user input
- **Generation**: "Always require security contexts" → injects required fields
- **Deployment**: "Require approval for >$100/month" → triggers approval workflow

**3. Interactive Enforcement:**
```
$ app-agent deploy "web app with 10 replicas"

🛡️ Policy Check: Development limit is 3 replicas maximum.
   Would you like to:
   1. Use 3 replicas instead (recommended)
   2. Request approval for 10 replicas  
   3. Deploy to staging environment instead

Your choice [1]: 
```

### Template System

**Starter Templates:**
```bash
# Initialize with common templates
app-agent governance init --template=startup
app-agent governance init --template=enterprise  
app-agent governance init --template=regulated-industry
```

**Custom Templates:**
```
# governance/startup-template.txt
Keep costs low - maximum 2 replicas and 200m CPU in development.
All images must be scanned for vulnerabilities.
Prefer managed services over self-hosted when available.

# governance/enterprise-template.txt  
All deployments must have cost-center and team labels.
Production requires approval from security and platform teams.
Enforce pod security standards and network policies.
Audit all deployments with compliance labels.

# governance/regulated-template.txt
All containers must run as non-root with read-only file systems.
Require approval for any external network access.
All deployments must be logged and auditable.
Encrypt all data at rest and in transit.
```

### Benefits

✅ **User-Friendly**: No YAML or complex syntax to learn  
✅ **Expressive**: Natural language is more flexible than rigid schemas  
✅ **Maintainable**: Easy to read, understand, and modify policies  
✅ **AI-Native**: Leverages the agent's natural language understanding  
✅ **Context-Aware**: Agent applies policies intelligently based on situation  
✅ **Progressive**: Start simple, add complexity as needed  

> **Key Insight**: Since the agent is AI-powered, governance should be too. Let users express their intent in natural language, and let the AI figure out how to enforce it.

## Mode Comparison

| Aspect | Direct Agent Mode | MCP Mode |
|--------|------------------|----------|
| **User Interaction** | Direct Q&A with user | Structured guidance to calling agent |
| **Session Management** | Built-in via Claude Code SDK | Stateless function calls |
| **Output Format** | Human-readable text | JSON with workflow guidance |
| **Use Case** | Standalone deployment tool | Integration with other AI agents |
| **Complexity** | Simple CLI usage | Requires MCP-aware agent |

## Workflow (Both Modes)

### 1. Cluster Discovery
```bash
# Discover Custom Resource Definitions
kubectl get crd | grep -E "(app|application|deploy|service|function|job|aws|gcp|azure|cloudrun|lambda|container|crossplane)"

# Discover core Kubernetes resources and capabilities
kubectl api-resources --verbs=create --output=name | grep -E "(deployments|services|ingresses|jobs|cronjobs|configmaps|secrets)"

# Check for specific resource availability and versions
kubectl explain deployment
kubectl explain service  
kubectl explain ingress
kubectl explain horizontalpodautoscaler

# Discover API versions
kubectl api-versions | grep -E "(apps|networking|autoscaling|batch)"

# Check cluster capabilities
kubectl get nodes -o wide
kubectl get ingressclass
kubectl get storageclass
```

### 2. Strategy Selection
Based on discovered resources (CRDs + core K8s) - **system adapts to ANY available resources**:

**High-Level Platform CRDs** (examples of what might be discovered):
- **AppClaim CRD**: Use DevOpsToolkit composite resources
- **CloudRunService CRD**: Use GCP serverless deployment  
- **KnativeService CRD**: Use Knative serverless
- **Lambda Function CRD**: Use AWS Lambda functions
- **ContainerApp CRD**: Use Azure Container Apps
- **Application CRD**: Use ArgoCD Applications
- **ClusterApp CRD**: Use custom platform abstractions
- **_Any other CRDs_**: System discovers and uses their schemas

**Core Kubernetes Resources** (standard fallback):
- **apps/v1 Deployment + v1 Service**: Basic workload deployment
- **networking.k8s.io/v1 Ingress**: External access (check IngressClass)
- **autoscaling/v2 HorizontalPodAutoscaler**: Auto-scaling capability
- **batch/v1 Job**: For job-type workloads
- **batch/v1 CronJob**: For scheduled workloads

**Dynamic Capability Matrix** (discovered per cluster):
- **Auto-scaling**: HPA available + metrics-server running
- **External Access**: Ingress + IngressClass configured
- **Storage**: StorageClass available for persistent volumes
- **Secrets Management**: Core secrets vs external secret operators
- **Custom Capabilities**: Any additional features from discovered CRDs

> **Note**: The system is completely extensible - it will work with ANY Kubernetes resources (CRDs or core) available in your cluster. The examples above are just common patterns.

### 3. Configuration Gathering
**Dynamic questions based on discovered resource schemas + user requirements:**

The agent analyzes the chosen resource's schema (`kubectl explain <resource>`) and the user's description to generate contextual questions.

**Examples of dynamic questioning:**

**If AppClaim CRD is chosen:**
```bash
kubectl explain appclaim.spec
# Discovers: image, port, host, replicas, resources fields
```
- "What's your container image?" (required by schema)
- "What port does your app listen on?" (required by schema)  
- "Do you want a custom domain or auto-generated?" (based on host field options)
- "How many replicas initially?" (optional field, asks only if user mentioned scaling)

**If CloudRunService CRD is chosen:**
```bash
kubectl explain cloudrunservice.spec.template.spec
# Discovers: serverless-specific fields, traffic allocation, etc.
```
- "What's your container image?" (required)
- "What's your service port?" (required)
- "Do you want traffic splitting?" (only asks if schema supports it)
- "CPU/Memory limits?" (asks based on schema constraints)

**If standard Kubernetes is chosen:**
```bash
kubectl explain deployment.spec.template.spec.containers
kubectl explain service.spec
kubectl explain ingress.spec
```
- "Container image?" (Deployment requirement)
- "Service type: ClusterIP, LoadBalancer, or NodePort?" (based on available ServiceTypes)
- "Need external access?" (only if Ingress CRD exists)
- "Enable auto-scaling?" (only if HPA CRD exists)

**If custom CRD `MyPlatformApp` is discovered:**
```bash
kubectl explain myplatformapp.spec
# System learns: whatever fields exist in this custom resource
```
- Questions generated dynamically from the schema
- User description influences which optional fields to ask about

**User Intent Influences Questions:**

If user says: `"web app with auto-scaling"` → Asks about HPA settings (if available)
If user says: `"batch job that runs nightly"` → Focuses on CronJob fields, doesn't ask about services
If user says: `"microservice with database"` → Asks about ConfigMaps, Secrets, storage
If user says: `"simple web app"` → Asks minimal questions, uses smart defaults

> **Key**: Questions are never static - they're generated by analyzing resource schemas and matching them to user intent.

### 4. Manifest Generation
- Generate manifests using discovered CRD schemas
- Apply memory lessons (ELB→IP resolution, resource patterns, etc.)
- Validate against cluster capabilities

### 5. Deployment & Monitoring
- Deploy resources
- Monitor until healthy/failed
- Store lessons learned for future use

## Direct Agent Mode

The Direct Agent Mode provides a standalone CLI tool called `app-agent` that users can install and run directly.

### Installation & Usage
```bash
# Install the CLI tool globally
npm install -g app-agent

# Deploy an application (starts interactive workflow)
app-agent deploy

# Deploy with initial context to guide discovery
app-agent deploy "web app with auto-scaling"

# Continue a previous session
app-agent --continue

# Check status of a deployment
app-agent status my-app
```

> **Note**: `app-agent` is the proposed CLI command name. Alternative names could be `kubectl-app-deploy`, `kube-app`, `k8s-app-agent`, etc.

### Example Interaction
```
$ app-agent deploy "web app with auto-scaling"

🔍 Discovering cluster capabilities...
✅ Found: AppClaim (DevOpsToolkit), CloudRunService (GCP), Standard K8s
   (Note: This varies per cluster - could be Knative, ArgoCD, or any other CRDs)

🤔 I can deploy your web app using:
   1. AppClaim (recommended) - Managed by DevOpsToolkit
   2. CloudRunService - Serverless on GCP  
   3. Standard Kubernetes - Manual configuration

Which would you prefer? [1]: 1

📝 Using AppClaim for managed deployment.
   (Questions generated from `kubectl explain appclaim.spec`)
What's your container image? nginx:latest
What port does your app listen on? [80]: 80
Do you want auto-scaling? [Y/n]: Y
   Note: Different CRDs = different questions based on their schemas

🚀 Generating AppClaim manifest...
✅ Generated manifest with lessons applied:
   - Host: my-app.12.34.56.78.nip.io (resolved ELB to IP)
   - Resources: CPU 100m-500m, Memory 128Mi-512Mi (AKS baseline)

Deploy now? [Y/n]: Y

🎯 Deploying...
⏳ Waiting for AppClaim to create App composite...
⏳ Waiting for pods to be ready...
✅ Deployment successful!

🌐 Your app is running at: https://my-app.12.34.56.78.nip.io

💾 Stored lessons learned for future deployments.
```

## MCP Mode

### MCP Functions

#### `create_application`
Entry point - discovers cluster and returns initial guidance
```typescript
// Input: {}
// Output: 
{
  cluster_discovery: {
    available_crds: [...],
    deployment_strategies: [...]
  },
  agent_question: {
    question: "I found AppClaim and CloudRun. Which platform?",
    options: ["appclaim", "cloudrun", "kubernetes"],
    reasoning: "AppClaim provides managed deployment, CloudRun is serverless",
    note: "Available options vary per cluster based on discovered CRDs"
  },
  workflow_guidance: {
    next_action: "await_user_choice",
    expected_input: "platform_choice"
  }
}
```

#### `continue_workflow`
Continue based on user input - questions generated from resource schema
```typescript
// Input: { user_choice: "appclaim", context: {...} }
// Agent runs: kubectl explain appclaim.spec
// Output:
{
  progress: "platform_selected",
  agent_question: {
    question: "What's your container image?",
    validation: "Must be valid container image format",
    schema_context: "Required field in appclaim.spec.image",
    why_asking: "AppClaim schema requires container image specification"
  },
  workflow_guidance: {
    next_action: "await_user_input",
    expected_input: "container_image"
  }
}

// Different resource = different questions
// Input: { user_choice: "knativeservice", context: {...} }
// Agent runs: kubectl explain knativeservice.spec.template.spec.containers
// Output:
{
  progress: "platform_selected", 
  agent_question: {
    question: "What's your container image and what environment variables do you need?",
    validation: "Image format: registry/image:tag, EnvVars: KEY=value pairs",
    schema_context: "KnativeService requires image, envVars are common",
    why_asking: "Knative schema analysis shows these are typical requirements"
  },
  workflow_guidance: {
    next_action: "await_user_input",
    expected_input: "container_config"
  }
}
```

#### `deploy_application`
Execute deployment when ready
```typescript
// Input: { config: {...} }
// Output:
{
  deployment_status: "in_progress",
  deployment_id: "abc123",
  monitoring_guidance: {
    next_action: "poll_status",
    poll_interval: "10s",
    timeout: "300s"
  }
}
```

#### `get_deployment_status`
Monitor deployment progress
```typescript
// Input: { deployment_id: "abc123" }
// Output:
{
  status: "healthy" | "deploying" | "failed",
  resources: [...],
  access_url: "https://my-app.12.34.56.78.nip.io",
  lessons_learned: [...]
}
```

### MCP Usage Example
```typescript
// External agent using the MCP
const mcp = new AppManagementMCP();

// Start workflow
const initial = await mcp.create_application();
// Returns: "I found AppClaim and CloudRun. Which platform?"

// Agent asks user, gets "appclaim"
const step2 = await mcp.continue_workflow({
  user_choice: "appclaim", 
  context: initial.context
});
// Returns: "What's your container image?"

// Continue until ready to deploy
const final = await mcp.deploy_application({
  config: gatheredConfig
});
// Returns: deployment status and monitoring guidance
```

## Implementation Technology

### Claude Code SDK
- **Primary Engine**: All agent intelligence powered by Claude Code SDK
- **Session Management**: Built-in conversation state handling
- **JSON Output**: Perfect for MCP structured responses
- **Multi-turn**: Handles complex deployment workflows
- **Tool Integration**: Can call kubectl, validate manifests, etc.

### Architecture Components
- **Agent Core**: Claude Code SDK with Kubernetes system prompt
- **Mode Switch**: Runtime configuration for output format
- **CRD Discovery**: Dynamic cluster capability detection
- **Memory System**: JSON-based lesson storage and retrieval
- **Workflow Engine**: State machine for deployment process

## File Structure
```
app-agent/
├── docs/                   # Documentation
│   ├── design.md           # Architecture and workflow
│   ├── CONTEXT.md          # Quick reference for new sessions
│   └── ORIGINAL_INSPIRATION.md  # Starting prompt (reference only)
├── src/
│   ├── agent/              # Core agent logic
│   │   ├── core.ts         # Claude Code SDK wrapper
│   │   ├── discovery.ts    # CRD discovery and analysis
│   │   ├── memory.ts       # Lesson storage/retrieval
│   │   └── workflow.ts     # Deployment state machine
│   ├── modes/              # Output mode handlers
│   │   ├── direct.ts       # CLI direct interaction
│   │   └── mcp.ts          # MCP server functions
│   ├── utils/              # Utilities
│   │   ├── kubectl.ts      # Kubernetes API wrapper
│   │   ├── manifest.ts     # Manifest generation
│   │   └── validation.ts   # Schema validation
│   └── types/              # TypeScript definitions
├── templates/              # Manifest templates (fallbacks)
├── memory/                 # Lesson storage
├── config/                 # Configuration files
└── bin/                    # CLI entry points
    ├── app-agent           # Direct mode CLI executable
    └── app-agent-mcp       # MCP server executable
```

## Next Steps

1. **Define detailed API specifications** for all MCP functions
2. **Create implementation guide** with Claude Code SDK integration
3. **Design memory system** for lesson storage and retrieval
4. **Plan testing strategy** for both modes
5. **Document deployment and configuration** requirements 