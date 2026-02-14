# Organizational Data Management Concepts

<!-- PRD-74 -->

**Understanding the relationship between Capabilities, Patterns, and Policies in the DevOps AI Toolkit.**

## Overview

The DevOps AI Toolkit manages three types of organizational knowledge that work together to provide intelligent, compliant, and standardized Kubernetes deployments:

- **Capabilities** - What resources can do (semantic understanding)
- **Patterns** - What resources to deploy (organizational preferences)  
- **Policies** - How resources should be configured (governance requirements)

## The Three Pillars of Organizational Knowledge

### Capabilities: Resource Understanding
**Purpose**: Discover and understand what Kubernetes resources actually do

- **Function**: Semantic understanding of cluster resources and their capabilities
- **Required for**: All intelligent recommendations and resource discovery
- **Example**: Teaches AI that `sqls.devopstoolkit.live` provides PostgreSQL database capabilities
- **When to use**: First step - scan your cluster to teach AI about available resources
- **Goal**: Make AI smarter about your cluster's existing resources and operators

**Key Characteristics**:
- **Automatic discovery** through cluster scanning and AI analysis
- **Resource-specific** understanding of what each CRD and operator provides
- **Foundation layer** that enables all other intelligent features
- **Continuously updated** as new resources are deployed to cluster

### Patterns: Deployment Guidance  
**Purpose**: Define organizational preferences for resource combinations

- **Function**: Organizational best practices for what resources work well together
- **Required for**: Enhanced recommendations that follow team standards
- **Example**: Defines that web applications should include Deployment + Service + Ingress + HPA
- **When to use**: After capabilities - create patterns for your common deployment scenarios
- **Goal**: Make AI follow your team's deployment standards and architecture decisions

**Key Characteristics**:
- **Platform team authored** based on organizational experience and standards
- **Resource combination focused** on what to deploy together
- **Suggestion-based** enhancement of AI recommendations (not enforcement)
- **Use case specific** patterns for different types of applications and workloads

### Policies: Configuration Governance
**Purpose**: Ensure resources are configured according to governance requirements

- **Function**: Proactive compliance that guides users toward correct configurations
- **Required for**: Governance compliance and security enforcement
- **Example**: Ensures all containers have resource limits, images from trusted registries  
- **When to use**: Throughout deployment - policies guide configuration decisions
- **Goal**: Make AI recommend compliant configurations from the start, preventing violations

**Key Characteristics**:
- **Security/platform team authored** based on compliance and governance needs
- **Configuration focused** on how resources should be set up
- **Proactive guidance** that prevents violations rather than blocking after creation
- **Optionally enforceable** through generated Kyverno policies for cluster-level blocking

## How They Work Together

### The AI Recommendation Pipeline

```
User Intent → Capability Discovery → Pattern Enhancement → Policy Compliance → Final Configuration
```

1. **User Intent**: "Deploy a web application with a database"

2. **Capability Discovery**: 
   - AI searches cluster capabilities
   - Finds: `apps/v1/Deployment`, `sqls.devopstoolkit.live/SQL`, `networking.k8s.io/Ingress`
   - Understanding: Deployment for apps, SQL CRD for databases, Ingress for traffic

3. **Pattern Enhancement**:
   - AI searches organizational patterns  
   - Finds: "Web Application Pattern" (Deployment + Service + Ingress + HPA)
   - Enhancement: Adds HPA and Service to the recommendation

4. **Policy Compliance**:
   - AI searches policy intents
   - Finds: "Resource Limits Policy", "Image Registry Policy"  
   - Integration: Questions include required resource limits and trusted image defaults

5. **Final Configuration**:
   - User gets questions with policy-driven requirements and pattern-enhanced suggestions
   - Generated manifests are compliant and follow organizational standards from the start

### Practical Example

**Scenario**: Developer requests "Deploy a Node.js API"

**Without organizational data**:
```
Questions: 
- Application name?
- Container image?  
- Port?
Basic Deployment + Service created
```

**With full organizational data**:
```
Capabilities found: Deployment, Service, Ingress, HPA available
Pattern matched: "Web Application Pattern" 
Policies found: "Resource Limits Policy", "Image Registry Policy"

Enhanced questions:
- Application name?
- Container image? (⚠️ must be from registry.company.com - policy requirement)
- Port?
- CPU limit? (⚠️ required by Resource Limits Policy) [default: 500m]
- Memory limit? (⚠️ required by Resource Limits Policy) [default: 512Mi]
- Enable autoscaling? (suggested by Web Application Pattern) [default: yes]

Generated resources: Deployment + Service + Ingress + HPA
All with policy-compliant configurations and organizational best practices
```

## When to Use Each Type

### Capabilities (Start Here - Required)
**Always required** for intelligent recommendations.

**Preferred: Use the controller** for automatic, event-driven scanning. See [Capability Management Guide](mcp-capability-management-guide.md#method-1-controller-based-scanning-recommended).

**Alternative: Manual scanning** when controller cannot reach MCP:
```
"Scan my cluster capabilities"
```

**Manual scanning use cases**:
- MCP running locally (not accessible from cluster)
- One-time scanning without controller setup

### Patterns (Optional but Recommended)
**Enhance recommendations** with organizational standards:

```  
"I want to create a deployment pattern for web applications"
```

**Use when**:
- Your team has established deployment standards
- You want consistent resource combinations across projects
- Developers frequently ask "what resources do I need for X?"
- You have architectural best practices to encode

### Policies (As Needed for Governance)
**Enforce compliance** requirements proactively:

```
"I want to create a policy for container resource limits"
```

**Use when**:
- You have security or compliance requirements to enforce
- Manual policy enforcement is error-prone or slow
- You want to guide users toward compliance rather than block them
- Governance teams need to ensure consistent configuration standards

## Setup and Workflow Order

### Recommended Implementation Order

1. **Start with Capabilities** (Required foundation):
   ```
   "Scan cluster capabilities"
   ```
   - Enables all intelligent features
   - Takes 5-10 minutes for initial scan
   - Should be done before patterns or policies

2. **Add Patterns** (Organizational enhancement):
   ```
   "Create organizational patterns for our common use cases"
   ```  
   - Start with 3-5 most common deployment types
   - Gather feedback from development teams
   - Iterate based on usage and effectiveness

3. **Implement Policies** (Governance requirements):
   ```
   "Create policy intents for our compliance requirements"
   ```
   - Focus on your most critical governance needs first
   - Test policy integration with real deployment scenarios
   - Consider Kyverno enforcement for critical policies

### Prerequisites for Each Type

**All types require**:
- DevOps AI Toolkit MCP server configured
- Vector DB service (Qdrant) for semantic storage
- API keys for AI models and embedding providers (see [AI Model Configuration](../setup/mcp-setup.md#ai-model-configuration))

**Additionally for Policies**:
- Kyverno installed (optional - only needed for cluster enforcement)
- kubectl access (optional - only needed for policy deployment)

## Best Practices

### Integration Strategy
- **Start simple**: Begin with capabilities, add patterns for your top 3 use cases, implement 1-2 critical policies
- **Iterate based on feedback**: Gather input from development teams on what's helpful vs. burdensome
- **Maintain consistency**: Ensure patterns and policies complement rather than conflict with each other

### Team Collaboration  
- **Capabilities**: Platform team manages (automated scanning)
- **Patterns**: Platform + development teams collaborate (based on real usage)
- **Policies**: Security + platform teams own (based on compliance requirements)

### Quality and Maintenance
- **Review quarterly**: Ensure organizational data reflects current standards and needs
- **Update incrementally**: Add new patterns/policies as needs emerge rather than trying to cover everything upfront  
- **Measure effectiveness**: Track whether recommendations become more useful and compliant over time

## FAQ

**Q: Do I need all three types?**
A: Capabilities are required for intelligent recommendations. Patterns and policies are optional enhancements that add organizational consistency and compliance.

**Q: Can they conflict with each other?**  
A: They're designed to be complementary. Patterns suggest what to deploy, policies ensure it's configured correctly. The AI balances both when making recommendations.

**Q: What happens if I only have capabilities?**
A: You get intelligent resource discovery and semantic matching, but without organizational context or governance guidance.

**Q: How do I know if my organizational data is working?**
A: Test with real deployment requests. The AI should mention organizational context and policy requirements in its recommendations.

**Q: Can I use this without Vector DB?**
A: No, all three types require Vector DB for semantic storage and retrieval. This enables intelligent matching based on user intent.

## See Also

- **[Capability Management Guide](mcp-capability-management-guide.md)** - Cluster resource discovery and understanding
- **[Pattern Management Guide](pattern-management-guide.md)** - Creating organizational deployment standards  
- **[Policy Management Guide](policy-management-guide.md)** - Implementing governance and compliance requirements
- **[MCP Setup Guide](../setup/mcp-setup.md)** - Initial configuration for all organizational data features

---

*This conceptual guide covers the relationship between organizational data types in the DevOps AI Toolkit v1.0.*
