# Policy Management Guide

<!-- PRD-74 -->

**Complete guide for creating and managing organizational policy intents with the DevOps AI Toolkit.**

## Overview

Policy Management enables platform engineers and security teams to create governance policies that proactively guide users toward compliant configurations. Unlike traditional policy enforcement that blocks manifests after they're created, this system integrates policies into AI recommendations, ensuring compliance from the start.

### What is Policy Management?

Policy Management allows you to:
- **Create policy intents** that capture your organization's security and governance requirements  
- **Store policies semantically** using Vector DB technology for intelligent matching
- **Guide AI recommendations** with policy requirements as part of the configuration process
- **Generate Kyverno policies** optionally from policy intents for cluster-level enforcement
- **Share governance knowledge** across teams through standardized policy approaches

### Understanding Organizational Data Types

Policy Management works alongside Capability Management and Pattern Management to provide comprehensive organizational intelligence for AI recommendations.

**Quick Overview**:
- **Capabilities**: What resources can do (required foundation)
- **Patterns**: What resources to deploy together (organizational preferences)  
- **Policies**: How resources should be configured (governance requirements)

For a complete understanding of how these three types work together, see the **[Organizational Data Concepts Guide](organizational-data-concepts.md)**.

### How It Works

1. **Policy Creation** → Security teams define policy intents describing governance requirements
2. **Semantic Storage** → Policies are stored with AI-generated embeddings for intelligent matching  
3. **AI Integration** → When users configure resources, relevant policies enhance questions with compliance requirements
4. **Proactive Guidance** → Users get compliant configurations with policy-driven defaults and validation
5. **Optional Enforcement** → Policy intents can generate Kyverno policies for cluster-level blocking

## Prerequisites

Before using Policy Management, ensure you have:

### Required Setup
- **DevOps AI Toolkit MCP server** configured (see [MCP Setup Guide](./mcp-setup.md))
- **Vector DB service** (Qdrant) for policy storage
- **API keys** (ANTHROPIC_API_KEY, QDRANT_API_KEY, OPENAI_API_KEY) can be set as environment variables or in `.mcp.json`

### Optional (for Kyverno enforcement)
- **[Kyverno](https://kyverno.io/)** installed in your cluster for optional policy enforcement
- **kubectl access** to your cluster for policy deployment

For complete setup instructions, see the [MCP Setup Guide](./mcp-setup.md).

## Section 1: Policy Management Basics

### Creating Policy Intents

**Start Policy Creation**:
```
I want to create a new policy intent
```

The AI assistant will guide you through a step-by-step workflow:

#### Step 1: Policy Description
The assistant asks for the policy requirement:

**Example**:
```
Assistant: Please describe the policy intent you want to create. What should this policy enforce or ensure in your Kubernetes deployments?

Examples:
- "All containers must have resource limits defined"  
- "Images must be from trusted registries only"
- "Pods must not run as root user"
- "All services must have network policies"

What policy requirement do you want to enforce?

You: All containers must have CPU and memory resource limits defined to prevent resource starvation and ensure fair resource allocation
```

#### Step 2: Infrastructure Types  
Define what types of infrastructure this applies to:

**Example**:
```
Assistant: What types of infrastructure should this apply to? Think about the categories of resources and systems this covers, not technical implementation details.

Examples by domain:
- **Applications**: web applications, microservices, APIs, frontends, backends
- **Databases**: databases, SQL databases, NoSQL, data stores, persistent storage  
- **Networking**: load balancers, ingresses, services, network policies, DNS
- **Storage**: persistent volumes, storage classes, backup systems
- **Security**: secrets, certificates, authentication, authorization, RBAC
- **Infrastructure**: clusters, nodes, compute resources, cloud resources

Please provide infrastructure type keywords separated by commas.

You: applications, microservices, web applications, containerized applications, workloads, pods
```

#### Step 3: Trigger Expansion
The system suggests additional related terms:

**Example**:  
```
Assistant: I found these additional terms that might also trigger your policy:
- containers
- deployments
- services  
- jobs
- cronjobs
- daemonsets
- statefulsets
- replicasets

Which should also trigger this policy? You can select specific ones, include all, or skip.

You: applications, microservices, web applications, containerized applications, workloads, pods, containers, deployments
```

#### Step 4: Policy Rationale
Explain why this policy is important:

**Example**:
```
Assistant: Why is this policy important for your organization? Please explain the rationale behind this policy requirement - what risks does it mitigate or what benefits does it provide?

You: Resource limits prevent any single container from consuming excessive CPU or memory, which could starve other applications and degrade cluster performance. This ensures fair resource allocation and prevents noisy neighbor problems in multi-tenant environments.
```

#### Step 5: Policy Ownership
Specify who created the policy:

**Example**:
```
Assistant: Who should be credited as the creator of this policy intent? (This can be your name, team name, or organization.)

You: platform-team
```

#### Step 6: Kyverno Policy Generation
The system generates a Kyverno policy and presents options:

**Example**:
```
Assistant: Please review your policy intent:

**Description**: All containers must have CPU and memory resource limits defined to prevent resource starvation and ensure fair resource allocation
**Triggers**: applications, microservices, web applications, containerized applications, workloads, pods, containers, deployments  
**Rationale**: Resource limits prevent any single container from consuming excessive CPU or memory, which could starve other applications and degrade cluster performance. This ensures fair resource allocation and prevents noisy neighbor problems in multi-tenant environments.
**Created By**: platform-team

I've also generated a Kyverno ClusterPolicy that enforces this requirement:

**Generated Kyverno Policy**:
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-container-resource-limits-d53b3447
  labels:
    policy-intent/id: d53b3447-0eed-42a0-8a8b-651d18374325
spec:
  validationFailureAction: Enforce
  background: false
  rules:
  - name: require-pod-container-resource-limits
    match:
      any:
      - resources:
          kinds:
          - Pod
          operations:
          - CREATE
          - UPDATE
    validate:
      cel:
        expressions:
        - expression: >-
            object.spec.containers.all(container,
              has(container.resources) && has(container.resources.limits) &&
              has(container.resources.limits.cpu) && has(container.resources.limits.memory) &&
              container.resources.limits.cpu != '' && container.resources.limits.memory != ''
            )
          message: "All containers must have CPU and memory resource limits defined..."
  # ... (additional rules for Deployment, StatefulSet, ReplicaSet, DaemonSet, ReplicationController)

**Choose what to do:**

1. **Apply Kyverno policy to cluster** - Store policy intent AND deploy enforcement to cluster
2. **Store policy intent only** - Save for AI guidance without cluster enforcement  
3. **Cancel** - Do nothing

⚠️ **Warning**: Option 1 will deploy active policy enforcement to your cluster.

You: 1
```

#### Step 7: Kyverno Policy Deployment
The system validates and deploys the policy to your cluster:

**Example**:
```
Assistant: **Deploying policy to cluster...**

✅ Kyverno policy validation successful  
✅ Policy applied to cluster: require-container-resource-limits-d53b3447
✅ Policy intent stored in database

**Policy Intent and Enforcement Created Successfully!**

**Policy ID**: d53b3447-0eed-42a0-8a8b-651d18374325
**Status**: Active - both AI guidance and cluster enforcement enabled
**Kyverno Policy**: require-container-resource-limits-d53b3447

The policy intent will now guide AI recommendations during deployments, and the Kyverno policy enforces compliance at the cluster level.
```

The policy intent is now available to guide AI recommendations during resource configuration.

### Listing Policy Intents

**View All Policies**:
```
Show me all policy intents
```

**Example Response**:
```
Found 1 policy intents (showing 1)

1. **Resource Limits Policy** (Created: 2025-08-25)
   - Description: All containers must have CPU and memory resource limits defined to prevent resource starvation and ensure fair resource allocation
   - Triggers: 8 keywords including "applications", "microservices", "containers", "deployments"
   - Created by: platform-team
   - Status: Intent only (no Kyverno policies deployed)

Search mode: semantic+keyword hybrid search enabled
```

### Viewing Policy Details

**Get Specific Policy** (using policy ID):
```
Show me policy intent d53b3447-0eed-42a0-8a8b-651d18374325
```

**Example Response**:
```
Policy intent retrieved successfully:

**Policy ID**: d53b3447-0eed-42a0-8a8b-651d18374325
**Description**: All containers must have CPU and memory resource limits defined to prevent resource starvation and ensure fair resource allocation
**Created**: 2025-08-25 by platform-team
**Status**: Intent only (no Kyverno policies deployed)

**Triggers** (8):
- applications
- microservices  
- web applications
- containerized applications
- workloads
- pods
- containers
- deployments

**Rationale**:
Resource limits prevent any single container from consuming excessive CPU or memory, which could starve other applications and degrade cluster performance. This ensures fair resource allocation and prevents noisy neighbor problems in multi-tenant environments.
```

### Searching Policy Intents

**Search Policies** (using semantic search):
```
Find policies about "resource limits"
```

**Example Response**:
```
Found 1 policy intents matching "resource limits"

1. **Resource Limits Policy** (Score: 0.40)
   - Description: All containers must have CPU and memory resource limits defined...
   - Triggers: 8 keywords including "applications", "containers", "deployments"  
   - Created: 2025-08-25 by platform-team
   - Status: Intent only

Semantic search found relevant policies based on description and trigger matching.
```

**Search Features**:
- **Semantic matching**: Finds policies based on meaning, not just exact keywords
- **Score ranking**: Results ordered by relevance score 
- **Comprehensive search**: Searches policy descriptions, triggers, and rationales

### Deleting Policy Intents

#### Delete Single Policy

**Remove Specific Policy** (requires policy ID):
```
Delete policy intent d53b3447-0eed-42a0-8a8b-651d18374325
```

**Note**: You need the specific policy ID for deletion. Use `list` or `search` operations first to find the policy ID you want to delete.

For policies with no deployed Kyverno policies:

**Example Response**:
```
Policy intent deleted successfully (no Kyverno policies to cleanup)

**Deleted Policy**:
- ID: d53b3447-0eed-42a0-8a8b-651d18374325
- Description: All containers must have CPU and memory resource limits defined...
- Created: 2025-08-25 by platform-team
```

For policies with deployed Kyverno policies, the system will ask for confirmation:

**Example Confirmation**:
```
Policy intent has deployed Kyverno policies that need cleanup decision:

Policy intent "All containers must have resource limits..." has 1 deployed Kyverno policies in your cluster: require-container-resource-limits-d53b3447

**Choose what to do:**

1. **Delete everything** - Remove policy intent AND delete Kyverno policies from cluster
2. **Keep Kyverno policies** - Remove policy intent only, preserve cluster policies

⚠️ **Warning**: Option 1 will remove active policy enforcement from your cluster.

**What would you like to do?**
```

#### Delete All Policies

**Remove All Policies**:
```
Delete all policy intents
```

If no policies exist:

**Example Response**:
```
No policy intents found to delete
```

If policies exist with deployed Kyverno policies, you'll get a batch confirmation similar to single delete, allowing you to choose whether to preserve or remove all cluster policies.

**Note**: The conversation examples above are simplified for readability. The actual workflow uses structured prompts and includes additional validation steps, but the core information flow remains the same.

## AI Integration

Policy intents automatically enhance deployment recommendations when users request deployments. For complete examples of how policies influence recommendations, see the [MCP Recommendation Guide](mcp-recommendation-guide.md).

The recommendation system automatically:
- Searches for relevant policy intents using semantic matching
- Includes policy requirements as REQUIRED questions with compliance indicators
- Provides policy-compliant defaults and validation guidance
- Balances governance requirements with specific user needs

**Important**: Policy intents guide users toward compliant configurations proactively, rather than blocking manifests reactively.

## Troubleshooting

### Common Issues

#### Policy Creation Fails

**Symptom**: Error when creating policy intents through AI assistant

**Possible Causes**:
- Vector DB connection issues
- Missing required environment variables
- Qdrant collection initialization problems
- Embedding service unavailable

**Solutions**:
1. **Check system status**:
   ```
   Show dot-ai status
   ```

2. **Verify Vector DB connection**:
   - Confirm `QDRANT_URL` and `QDRANT_API_KEY` in `.mcp.json`
   - Test Qdrant accessibility from your network
   - Check Qdrant cluster status in dashboard

3. **Validate environment variables**:
   ```json
   {
     "env": {
       "ANTHROPIC_API_KEY": "required_for_ai_features",
       "QDRANT_URL": "required_for_policy_storage", 
       "QDRANT_API_KEY": "required_for_qdrant_access",
       "OPENAI_API_KEY": "required_for_semantic_search"
     }
   }
   ```

#### Kyverno Policy Generation Fails

**Symptom**: Policy intent created successfully but Kyverno generation fails

**Possible Causes**:
- Kyverno not installed in cluster  
- Invalid policy description that can't be converted to Kyverno rules
- Cluster connectivity issues
- Missing kubectl access

**Solutions**:
1. **Check Kyverno installation**:
   ```bash
   kubectl get pods -n kyverno
   ```

2. **Verify cluster access**:
   ```bash
   kubectl cluster-info
   ```

3. **Simplify policy description**:
   - Use clear, specific requirements
   - Avoid complex conditional logic
   - Focus on single validation rules

4. **Manual policy application** (if generation fails):
   The system saves generated policies to files even on deployment failures. Check the error message for the file path and apply manually:
   ```bash
   kubectl apply -f /path/to/kyverno-policy.yaml
   ```

#### Policy Search Not Working

**Symptom**: Relevant policies don't appear in AI recommendations

**Possible Causes**:
- Trigger keywords don't match user language
- Embedding service not configured properly
- Policy storage issues
- Vector DB connectivity problems

**Solutions**:
1. **Review policy triggers**:
   - Check if triggers match the language users actually employ
   - Add more trigger variations and synonyms
   - Test with different request phrasings

2. **Check embedding service**:
   ```json
   {
     "env": {
       "OPENAI_API_KEY": "sk-proj-your-key-here"
     }
   }
   ```

3. **Verify policy storage**:
   ```
   List all policy intents
   ```

4. **Test policy matching**:
   - Create a simple test policy with obvious triggers
   - Make a deployment request using those exact triggers
   - Check if AI mentions the policy in recommendations

#### Kyverno Policy Deployment Fails

**Symptom**: Policy intent and YAML generated successfully but deployment fails

**Possible Causes**:
- Insufficient cluster permissions
- Network connectivity issues
- Cluster API unavailable
- Kyverno admission controller not ready

**Solutions**:
1. **Check cluster permissions**:
   ```bash
   kubectl auth can-i create clusterpolicies
   kubectl auth can-i get clusterpolicies
   ```

2. **Verify Kyverno status**:
   ```bash
   kubectl get pods -n kyverno
   kubectl logs -n kyverno -l app.kubernetes.io/name=kyverno
   ```

3. **Manual deployment**:
   Use the generated policy file (path provided in error message):
   ```bash
   kubectl apply -f /path/to/generated-policy.yaml
   ```

#### Semantic Search Not Working

**Symptom**: Only exact keyword matches work, semantic similarities missed

**Possible Causes**:
- OpenAI API key missing or invalid
- Policies created without embeddings
- Embedding service connectivity issues

**Solutions**:
1. **Verify OpenAI configuration**:
   - Confirm valid `OPENAI_API_KEY` in environment
   - Test API key with simple request
   - Check API usage limits and billing status

2. **Check embedding status in system status**:
   ```
   Show dot-ai status
   ```
   Look for embedding service availability

3. **Recreate policies if needed**:
   - Policies created without embedding service may need recreation
   - New policies automatically include embeddings if service is available

### System Diagnostics

#### Check Overall System Health

**Command**:
```
What's the current system status?
```

**Expected Response** (healthy system):
```json
{
  "status": "success",
  "system": {
    "vectorDB": {
      "connected": true,
      "url": "http://localhost:6333",
      "collectionName": "policies",
      "policiesCount": 3
    },
    "embedding": {
      "available": true,
      "provider": "openai",
      "model": "text-embedding-3-small"
    },
    "kyverno": {
      "installed": true,
      "policyGenerationReady": true,
      "version": "1.10.0"
    },
    "anthropic": {
      "connected": true,
      "keyConfigured": true
    }
  }
}
```

#### Verify Policy Storage

**Command**:
```
List all policy intents
```

**Check For**:
- Policies are being returned successfully
- Policy count matches expectations
- Search capabilities indicate semantic mode

#### Test Policy Integration

**Test Method**:
1. Create a test policy with specific, unique triggers
2. Make a deployment request using those exact triggers
3. Verify the policy appears in AI questions with compliance indicators
4. Check that generated manifests follow policy requirements

## FAQ

### General Questions

**Q: Do policies affect all deployment recommendations?**  
A: Yes, relevant policies automatically enhance AI recommendations when users deploy resources that match the policy triggers and rationale.

**Q: Can I use policy management without Kyverno?**  
A: Yes! Policy intents provide AI guidance without requiring Kyverno. The cluster enforcement is optional.

**Q: How many policies should I create?**  
A: Start with 3-5 core governance policies covering your most critical requirements (security, resources, compliance). Expand based on organizational needs.

**Q: Can multiple policies apply to a single request?**  
A: Yes! The AI can apply multiple relevant policies to create comprehensive compliance guidance.

### Technical Questions

**Q: What happens if Vector DB is unavailable?**  
A: Policy operations will fail. Deployment recommendations continue working but without policy guidance until Vector DB is restored.

**Q: Can I backup my policies?**  
A: Currently, policies are stored in your Qdrant instance. Back up your Qdrant data to preserve policies. Export functionality is planned for future versions.

**Q: How do I update an existing policy?**  
A: Currently, delete the old policy and create a new one. In-place editing is planned for future versions.

**Q: What happens to Kyverno policies when I delete a policy intent?**  
A: The system asks whether you want to delete the cluster policies too, or preserve them while removing only the AI guidance.

### Security Questions

**Q: Are policy intents stored securely?**  
A: Policy intents are stored in your Vector DB with standard Qdrant security. Use appropriate access controls and network security for your Vector DB instance.

**Q: Can policies access sensitive cluster data?**  
A: No, policies only define validation rules. They don't have access to secret data or cluster state beyond what Kyverno normally validates.

**Q: Do generated Kyverno policies follow security best practices?**  
A: Yes, generated policies use modern Kyverno CEL expressions and follow least-privilege principles. However, always review generated policies before deployment.

## See Also

- **[MCP Setup Guide](mcp-setup.md)** - Initial MCP server configuration
- **[Tools and Features Overview](mcp-tools-overview.md)** - Browse all available tools and features

---
