# DevOps AI Toolkit MCP Recommendation Guide

**Complete guide for using Kubernetes deployment recommendations through MCP (Model Context Protocol).**

## Prerequisites

Before using this guide, complete the [MCP Setup](mcp-setup.md) to configure your MCP server with:
- DevOps AI Toolkit MCP server running
- `ANTHROPIC_API_KEY` configured
- `KUBECONFIG` pointing to your Kubernetes cluster (optional but recommended)

**Required - Capability Management:**
- Vector DB service (Qdrant) for capability storage
- Cluster capabilities discovered via [Capability Management Guide](mcp-capability-management-guide.md)
- **Note**: Recommendations will fail without capabilities - the system requires semantic understanding of your cluster resources

**Optional - Enhanced with Organizational Patterns:**
- Organizational patterns created via [Pattern Management Guide](pattern-management-guide.md)
- When configured, recommendations automatically include organizational best practices

## Overview

The DevOps AI Toolkit recommendation feature provides:
- **Semantic capability understanding** - Uses discovered resource capabilities for intelligent semantic matching
- **AI-powered recommendations** - Suggests optimal deployment approaches based on capability-filtered resources with rich context
- **Enhanced resource discovery** - Finds resources like `sqls.devopstoolkit.live` for "PostgreSQL database" requests through semantic search
- **Organizational pattern integration** - Automatically enhances recommendations with your team's best practices and standards
- **Guided configuration** - Step-by-step configuration collection for your deployments
- **Manifest generation** - Creates ready-to-deploy Kubernetes YAML files
- **Automated deployment** - Deploys and monitors your applications

### How Capability-Enhanced Recommendations Work

**Traditional Problem**: AI sees `sqls.devopstoolkit.live` as a meaningless name among many cluster resources.

**Capability Solution**: AI understands that `sqls.devopstoolkit.live` provides PostgreSQL database capabilities with multi-cloud support.

**Recommendation Flow**:
1. **User Intent**: "I need a PostgreSQL database"
2. **Capability Search**: Semantic search finds relevant resources with capability context
3. **Pre-filtered Results**: AI gets semantically relevant resources instead of all generic resource names
4. **Enhanced Recommendations**: Optimal matches like `sqls.devopstoolkit.live` appear as top suggestions

## Complete Workflow Examples

### Example 1: Stateless Golang Web Application

```
User: I want to deploy a stateless Golang web application
```

```
Agent: I'll help you deploy a stateless Golang web application. Let me analyze your cluster and get recommendations.

[Uses mcp__dot-ai__recommend with intent "deploy a stateless Golang web application"]

Based on your cluster capabilities, I found 3 deployment options:

1. **Complete Stateless Application Stack (Score: 85)** - RECOMMENDED
   - Resources: Deployment, Service, HorizontalPodAutoscaler, NetworkPolicy
   - Features: Pod lifecycle management, stable networking, automatic scaling, network security
   - Uses organizational patterns: ✅ Stateless Apps Pattern, Network Security Pattern
   - Best for: Production deployments requiring security and scaling
   
2. **Simple Application Deployment (Score: 72)**
   - Resources: Deployment, Service
   - Features: Basic pod management and networking
   - Uses organizational patterns: ❌
   - Best for: Development/testing or simple use cases
   
3. **Minimal Pod Deployment (Score: 58)**
   - Resources: Deployment only
   - Features: Basic container orchestration
   - Uses organizational patterns: ❌
   - Best for: Internal services that don't need external access

Which approach interests you most?
```

**What happened behind the scenes:**
- Capability search found relevant resources: Deployment (score: 0.85), Service (score: 0.78), HorizontalPodAutoscaler (score: 0.65)
- Vector DB search found matching organizational patterns: Stateless Apps Pattern (score: 0.621), Network Security Pattern (score: 0.333) 
- AI received pre-filtered capability-rich resources with semantic context instead of raw resource names
- Generated 3 solution alternatives with different complexity/capability tradeoffs, scoring based on capability relevance and pattern influence

**Note:** Requires capability scanning via [Capability Management Guide](mcp-capability-management-guide.md) and optionally organizational patterns via [Pattern Management](pattern-management-guide.md). Policy requirements shown require active policy intents created via [Policy Management Guide](policy-management-guide.md).

```
User: I'll go with option 1
```

```
Agent: Excellent choice! Let me get the configuration requirements.

[Uses mcp__dot-ai__chooseSolution with solution ID sol_2025-08-01T151532_d0e8f0c19e0e]

I need some required details to configure your deployment:

**Required Configuration:**
- What name should be used for the application resources? (e.g., "my-go-app")
- Which namespace should the application be deployed to? (options: a-team, b-team, default, kube-public)
- What is the container image for your Go application? (e.g., "registry.example.com/go-app:v1.0.0")
- What port does your Go application listen on? (1-65535)

🛡️ **Policy Requirements:**
- **CPU resource limit** ⚠️ required by Resource Limits Policy (minimum: 100m, maximum: 2000m)
- **Memory resource limit** ⚠️ required by Resource Limits Policy (minimum: 128Mi, maximum: 4Gi)
```

**What happened behind the scenes:**
- chooseSolution loaded the selected solution and returned only the required stage questions
- Questions generated from resource schema analysis: Deployment needs name/image/port, Service needs port configuration
- Policy search found relevant policy intents: "Resource Limits Policy" (score: 0.89)
- Policy requirements promoted to REQUIRED questions with compliance indicators and constraints
- System categorizes questions as required (must answer) to proceed

```
User: App name is "my-app", deploy to "a-team" namespace, image is "ghcr.io/vfarcic/silly-demo:v1.5.151", port 8080. CPU limit 500m, memory limit 512Mi.
```

```
Agent: Perfect! Let me configure the required settings.

[Uses mcp__dot-ai__answerQuestion with stage="required" and answers]

Great! Your configuration meets all policy requirements:
✅ **Resource Limits Policy**: CPU (500m) and memory (512Mi) within acceptable ranges

Now for some basic configuration options:

**Basic Configuration (optional):**
- How many replicas of the application should run? (default: 3)
- What type of Service should be created? (ClusterIP, NodePort, LoadBalancer)
- Enable horizontal pod autoscaling? (true/false)
```

**What happened behind the scenes:**
- answerQuestion processed required stage answers and updated solution file
- Validated all required fields were provided (name, namespace, image, port)
- Determined next stage is 'basic' and returned basic configuration questions
- Questions are optional at this stage - user can answer or skip to advanced stage

```
User: 3 replicas, ClusterIP service, and yes to autoscaling.
```

```
Agent: Excellent! Let me configure those settings.

[Uses mcp__dot-ai__answerQuestion with stage="basic" and answers]

Would you like to configure advanced features?

**Advanced Configuration (optional):**
- Specify container resource limits (CPU and memory)? (true/false)
- Maximum CPU cores per pod? (e.g., "500m")
- Maximum memory per pod? (e.g., "512Mi")
- Minimum number of replicas for autoscaling? (default: 2)
- Maximum number of replicas for autoscaling? (default: 10)
- Target CPU utilization percentage for autoscaling? (default: 80)
```

**What happened behind the scenes:**
- answerQuestion processed basic stage answers (replicas: 3, serviceType: ClusterIP, autoscaling: true)
- Updated solution file and determined next stage is 'advanced'
- Returned advanced configuration questions focused on resource limits and autoscaling tuning

```
User: Skip advanced configuration
```

```
Agent: No problem! Moving to the final configuration stage.

[Uses mcp__dot-ai__answerQuestion with stage="advanced" and empty answers]

Any additional requirements or constraints?

**Open Configuration:**
- Are there any additional requirements or constraints for your Go application deployment that we should consider? (e.g., specific security requirements, networking constraints, performance needs...)
```

**What happened behind the scenes:**
- answerQuestion processed empty advanced stage answers (skipped all advanced questions)
- Marked advanced questions as explicitly skipped (answer: null)
- Determined next stage is 'open' and returned the open-ended question

```
User: N/A
```

```
Agent: Perfect! Configuration complete.

[Uses mcp__dot-ai__answerQuestion with stage="open" and answer="N/A"]

Configuration complete. Ready to generate deployment manifests.
```

**What happened behind the scenes:**
- answerQuestion processed open stage with "N/A" (no additional requirements)
- All configuration stages now complete (required ✓, basic ✓, advanced skipped, open ✓)
- Returned status: 'ready_for_manifest_generation', nextAction: 'generateManifests'

```
User: Generate the manifests
```

```
Agent: Generating your Kubernetes manifests...

[Uses mcp__dot-ai__generateManifests]

Generated your complete deployment stack:

apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: a-team
  labels:
    dot-ai.io/managed: "true"
    dot-ai.io/app-name: "my-app"
    dot-ai.io/intent: "deploy-a-stateless-golang-web-application"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    spec:
      containers:
      - name: my-app
        image: ghcr.io/vfarcic/silly-demo:v1.5.151
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: a-team
spec:
  type: ClusterIP
  ports:
  - port: 8080
    targetPort: 8080
  selector:
    app: my-app
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
  namespace: a-team
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 80
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: my-app
  namespace: a-team
spec:
  podSelector:
    matchLabels:
      app: my-app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - ports:
    - port: 8080
      protocol: TCP
  egress:
  - {}

Ready to deploy to your cluster?
```

**What happened behind the scenes:**
- generateManifests loaded the fully configured solution file
- AI generated YAML manifests using all collected configuration answers
- Policy requirements enforced: Resource limits (CPU: 500m, memory: 512Mi) applied to containers
- System performed up to 10 validation loops with `kubectl apply --dry-run=server --validate=true`
- Each resource includes dot-ai.io/ labels for tracking and proper resource linking via labels/selectors
- Organizational patterns influenced the final YAML (NetworkPolicy added for security, HPA configured for scaling)
- Returned status: 'manifests_generated' with complete YAML content

```
User: Yes, deploy it!
```

```
Agent: Deploying your Golang application...

[Uses mcp__dot-ai__deployManifests]

🎉 **Deployment successful!**

**Status:**
- Deployment: my-app (3/3 pods running)
- Service: my-app (ClusterIP created)
- HorizontalPodAutoscaler: my-app (active, scaling 3-10 replicas)
- NetworkPolicy: my-app (network security applied)
- Internal access: my-app.a-team.svc.cluster.local:8080

Your Golang web application is now live with autoscaling and network security!
```

**What happened behind the scenes:**
- deployManifests applied all manifests using `kubectl apply --wait`
- Monitored deployment progress and pod startup
- Verified HorizontalPodAutoscaler attached to deployment and NetworkPolicy applied to pods
- Provided access information based on Service configuration (ClusterIP = internal access only)

### Example 2: Microservice API with Auto-scaling

```
User: I want to deploy a REST API microservice that needs to handle variable traffic loads
```

```
Agent: I'll help you deploy a REST API microservice optimized for variable traffic. Let me analyze your cluster capabilities.

[Uses mcp__dot-ai__recommend with intent "deploy REST API microservice with variable traffic loads"]

Based on your requirements, I found 3 scalable deployment options:

1. **Enterprise API Stack (Score: 88)**
   - Resources: Deployment, Service, HorizontalPodAutoscaler, Ingress, ServiceMonitor
   - Features: Advanced scaling, external access, traffic routing, monitoring integration
   - Uses organizational patterns: ✅ API Service Pattern, Monitoring Pattern
   - Best for: Production APIs with external access and observability
   
2. **Internal API Service (Score: 79)**
   - Resources: Deployment, Service, HorizontalPodAutoscaler
   - Features: Automatic scaling, internal networking
   - Uses organizational patterns: ✅ Stateless Apps Pattern
   - Best for: Internal microservices within the cluster
   
3. **Simple API Deployment (Score: 65)**
   - Resources: Deployment, Service
   - Features: Basic API hosting with fixed scaling
   - Uses organizational patterns: ❌
   - Best for: Development or low-traffic APIs

Which approach fits your API requirements?
```

**What happened behind the scenes:**
- AI extracted key concepts: "REST API service", "microservice architecture", "variable traffic handling"
- Pattern matching found: API Service Pattern (high relevance), Stateless Apps Pattern (medium relevance)
- The "variable traffic" requirement strongly influenced resource selection toward HorizontalPodAutoscaler
- Generated 3 solutions with different external vs internal capabilities, scoring based on traffic handling requirements

**Note:** Pattern integration requires [Pattern Management](pattern-management-guide.md) setup with Vector DB and organizational patterns. Policy requirements shown require active policy intents created via [Policy Management Guide](policy-management-guide.md).

```
User: Option 2 please
```

```
Agent: Great choice! Internal APIs with autoscaling are ideal for microservice architectures. Let me get the configuration details.

[Uses mcp__dot-ai__chooseSolution with selected solution ID]

I need some required details to configure your API deployment:

**Required Configuration:**
- API service name? (e.g., "user-api", "order-service")
- Target namespace for deployment?
- Container image for your API? (e.g., "myregistry/api:v2.1.0")
- API port your service listens on?

🛡️ **Policy Requirements:**
- **CPU resource limit** ⚠️ required by Resource Limits Policy (minimum: 100m, maximum: 2000m)
- **Memory resource limit** ⚠️ required by Resource Limits Policy (minimum: 128Mi, maximum: 4Gi)
```

**What happened behind the scenes:**
- chooseSolution loaded the Internal API Service solution and returned only required stage questions
- Questions focused on API-specific needs: service naming, microservice namespace, container image, port
- Policy search found relevant policy intents: "Resource Limits Policy" (score: 0.91) 
- Policy requirements promoted to REQUIRED questions with compliance constraints
- System recognizes this is for "variable traffic" and will emphasize scaling in later stages

```
User: Service name "payment-api", namespace "microservices", image "internal/payment-api:v3.2.1", port 8080. CPU limit 500m, memory limit 1Gi.
```

```
Agent: Perfect! Let me configure the required settings.

[Uses mcp__dot-ai__answerQuestion with stage="required" and answers]

Great! Your configuration meets all policy requirements:
✅ **Resource Limits Policy**: CPU (500m) and memory (1Gi) within acceptable ranges

Now for scaling configuration:

**Basic Configuration (optional):**
- Initial number of replicas? (default: 2)
- Enable horizontal pod autoscaling? (recommended: true)
- Target CPU utilization for scaling? (default: 70%)
- Maximum replicas during high traffic? (default: 10)
```

**What happened behind the scenes:**
- answerQuestion processed required API configuration (service name, namespace, image, port)
- Validated all required fields and updated solution file
- Moved to basic stage focused on scaling configuration (core requirement from "variable traffic loads")
- Questions are optional but recommended for traffic handling

```
User: 2 replicas initially, enable autoscaling at 70% CPU, max 15 replicas.
```

```
Agent: Excellent scaling configuration! Let me set this up.

[Uses mcp__dot-ai__answerQuestion with stage="basic" and answers]

Any additional requirements or constraints?

**Open Configuration:**
- Are there any additional requirements or constraints for your API deployment that we should consider? (e.g., specific security requirements, networking constraints, performance needs...)
```

**What happened behind the scenes:**
- answerQuestion processed scaling configuration (replicas: 2, autoscaling: true, CPU target: 70%, max replicas: 15)
- Updated solution file with scaling-focused answers
- Skipped advanced stage (no advanced configuration questions for this solution)
- Moved directly to open stage for additional requirements

```
User: N/A
```

```
Agent: Perfect! Configuration complete.

[Uses mcp__dot-ai__answerQuestion with stage="open" and answer="N/A"]

Configuration complete. Ready to generate deployment manifests.
```

**What happened behind the scenes:**
- answerQuestion processed open stage with "N/A" (no additional requirements)
- All configuration stages now complete (required ✓, basic ✓, advanced skipped, open ✓)
- Returned status: 'ready_for_manifest_generation', nextAction: 'generateManifests'

```
User: Generate the manifests
```

```
Agent: Generating your API manifests...

[Uses mcp__dot-ai__generateManifests]

Generated your scalable API deployment:

apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-api
  namespace: microservices
  labels:
    dot-ai.io/managed: "true"
    dot-ai.io/app-name: "payment-api"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payment-api
  template:
    spec:
      containers:
      - name: payment-api
        image: internal/payment-api:v3.2.1
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 1Gi
---
apiVersion: v1
kind: Service
metadata:
  name: payment-api
  namespace: microservices
spec:
  type: ClusterIP
  ports:
  - port: 8080
    targetPort: 8080
  selector:
    app: payment-api
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payment-api
  namespace: microservices
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payment-api
  minReplicas: 2
  maxReplicas: 15
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70

Ready to deploy your payment API?
```

**What happened behind the scenes:**
- generateManifests loaded the fully configured solution file
- AI generated YAML using scaling-focused configuration
- Policy requirements enforced: Resource limits (CPU: 500m, memory: 1Gi) applied to containers
- Stateless Apps Pattern influenced resource requests/limits for predictable scaling
- Service.spec.type: ClusterIP set appropriately for internal microservices
- HPA configured with your specific parameters (2-15 replicas, 70% CPU target)
- System validated manifests with kubectl apply --dry-run=server --validate=true
- Returned status: 'manifests_generated' with complete YAML content

```
User: Yes, deploy it!
```

```
Agent: Deploying your payment API microservice...

[Uses mcp__dot-ai__deployManifests]

🎉 **API deployment successful!**

**Status:**
- Deployment: payment-api (2/2 pods running)
- Service: payment-api (ClusterIP created)
- HorizontalPodAutoscaler: payment-api (active, scaling 2-15 replicas at 70% CPU)
- Internal access: payment-api.microservices.svc.cluster.local:8080
- Ready to handle variable traffic loads

Your payment API microservice is now live with intelligent autoscaling!
```

**What happened behind the scenes:**
- deployManifests applied manifests using kubectl apply --wait and monitored deployment progress
- HorizontalPodAutoscaler attached to deployment and began monitoring CPU metrics
- Service created internal DNS entry: payment-api.microservices.svc.cluster.local:8080
- Ready to automatically scale from 2-15 replicas based on CPU utilization, handling variable traffic as requested

## See Also

- **[MCP Setup Guide](mcp-setup.md)** - Initial MCP server configuration
- **[Tools and Features Overview](mcp-tools-overview.md)** - Browse all available tools and features