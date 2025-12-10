---
sidebar_position: 2
---

# Recommendation Guide

**Complete guide for using Kubernetes deployment recommendations through MCP (Model Context Protocol).**

## Prerequisites

Before using this guide, complete the [MCP Setup](../setup/mcp-setup.md) to configure your MCP server with:
- DevOps AI Toolkit MCP server running
- AI model API key configured (see [AI Model Configuration](../setup/mcp-setup.md#ai-model-configuration) for supported models and setup)
- `KUBECONFIG` pointing to your Kubernetes cluster (optional but recommended)

**Required - Capability Management:**
- Vector DB service (Qdrant) for capability storage
- Cluster capabilities discovered via [Capability Management Guide](mcp-capability-management-guide.md)
- **Note**: Recommendations will fail without capabilities - the system requires semantic understanding of your cluster resources

**Optional - Enhanced with Organizational Patterns:**
- Organizational patterns created via [Pattern Management Guide](pattern-management-guide.md)
- When configured, recommendations automatically include organizational best practices

## Overview

**What it does**: Provides AI-powered Kubernetes deployment recommendations using cluster capabilities, and installs third-party applications via Helm charts when no matching capability exists. Features semantic capability matching, organizational pattern integration, and guided workflow from intent clarification through deployment.

**Use when**: You need intelligent deployment recommendations that leverage your cluster's actual capabilities, or want to install third-party tools (Prometheus, Argo CD, Crossplane, etc.) via Helm charts with AI-guided configuration.

📖 **Full Guide**: This document covers the complete recommendation workflow with detailed examples and behind-the-scenes explanations.

### Key Features

The DevOps AI Toolkit recommendation feature provides:
- **Smart intent clarification** - Adaptive questioning to gather missing context for better recommendations
- **Semantic capability understanding** - Uses discovered resource capabilities for intelligent semantic matching
- **AI-powered recommendations** - Suggests optimal deployment approaches based on capability-filtered resources with rich context
- **Enhanced resource discovery** - Finds resources like `sqls.devopstoolkit.live` for "PostgreSQL database" requests through semantic search
- **Organizational pattern integration** - Automatically enhances recommendations with your team's best practices and standards
- **Guided configuration** - Step-by-step configuration collection for your deployments
- **Manifest generation** - Creates ready-to-deploy Kubernetes YAML files
- **Helm chart installation** - Discovers and installs third-party applications via ArtifactHub when no cluster capability matches
- **Automated deployment** - Deploys and monitors your applications

### How Capability-Enhanced Recommendations Work

**Traditional Problem**: AI sees `sqls.devopstoolkit.live` as a meaningless name among many cluster resources.

**Capability Solution**: AI understands that `sqls.devopstoolkit.live` provides PostgreSQL database capabilities with multi-cloud support.

**Recommendation Flow**:
1. **User Intent**: "I need a PostgreSQL database"
2. **Capability Search**: Semantic search finds relevant resources with capability context
3. **Pre-filtered Results**: AI gets semantically relevant resources instead of all generic resource names
4. **Enhanced Recommendations**: Optimal matches like `sqls.devopstoolkit.live` appear as top suggestions

**Helm Fallback**: When no cluster capability matches (e.g., "Install Prometheus" but no Prometheus operator installed), the system automatically searches ArtifactHub for Helm charts and presents installation options.

## Complete Workflow Examples

### Example 1: Stateless Golang Web Application

```md
User: I want to deploy a stateless Golang web application
```

```md
Agent: I'll help you deploy a stateless Golang web application. To provide the best recommendations, I have a few clarification questions:

[Uses mcp__dot-ai__recommend with intent "deploy a stateless Golang web application"]

**Application Details:**
1. What is the expected traffic pattern and scaling requirements for your application?

**Environment & Infrastructure:**
2. Is this for development, staging, or production use?

**Security & Networking:**
3. Does your application need external access or will it only serve internal traffic?

**Performance & Resources:**
4. Do you have specific CPU, memory, or storage requirements?

**Integration:**
5. Are there any other services this application needs to connect to?

**Additional Context:**
6. Are there any other specific requirements or constraints we should consider?

You can answer the questions that are relevant to your needs, or let me know if you'd like to proceed with the information provided.
```

```md
User: It's for production, needs external access, expects moderate traffic with occasional spikes, and needs to connect to a PostgreSQL database.
```

```md
Agent: Perfect! Based on your clarified requirements, let me get production-focused deployment recommendations.

[Uses mcp__dot-ai__recommend with refined intent "deploy a production stateless Golang web application with external access, auto-scaling for traffic spikes, and PostgreSQL database connectivity" and final: true]

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

```md
User: I'll go with option 1
```

```md
Agent: Excellent choice! Let me get the configuration requirements.

[Uses mcp__dot-ai__recommend with stage: 'chooseSolution', solutionId: 'sol_2025-08-01T151532_d0e8f0c19e0e']

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
- recommend tool with stage 'chooseSolution' loaded the selected solution and returned only the required stage questions
- Questions generated from resource schema analysis: Deployment needs name/image/port, Service needs port configuration
- Policy search found relevant policy intents: "Resource Limits Policy" (score: 0.89)
- Policy requirements promoted to REQUIRED questions with compliance indicators and constraints
- System categorizes questions as required (must answer) to proceed

```md
User: App name is "my-app", deploy to "a-team" namespace, image is "ghcr.io/vfarcic/silly-demo:v1.5.151", port 8080. CPU limit 500m, memory limit 512Mi.
```

```md
Agent: Perfect! Let me configure the required settings.

[Uses mcp__dot-ai__recommend with stage: 'answerQuestion:required', solutionId, answers]

Great! Your configuration meets all policy requirements:
✅ **Resource Limits Policy**: CPU (500m) and memory (512Mi) within acceptable ranges

Now for some basic configuration options:

**Basic Configuration (optional):**
- How many replicas of the application should run? (default: 3)
- What type of Service should be created? (ClusterIP, NodePort, LoadBalancer)
- Enable horizontal pod autoscaling? (true/false)
```

**What happened behind the scenes:**
- recommend tool with stage 'answerQuestion:required' processed required stage answers and updated solution file
- Validated all required fields were provided (name, namespace, image, port)
- Determined next stage is 'basic' and returned basic configuration questions
- Questions are optional at this stage - user can answer or skip to advanced stage

```md
User: 3 replicas, ClusterIP service, and yes to autoscaling.
```

```md
Agent: Excellent! Let me configure those settings.

[Uses mcp__dot-ai__recommend with stage: 'answerQuestion:basic', solutionId, answers]

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
- recommend tool with stage 'answerQuestion:basic' processed basic stage answers (replicas: 3, serviceType: ClusterIP, autoscaling: true)
- Updated solution file and determined next stage is 'advanced'
- Returned advanced configuration questions focused on resource limits and autoscaling tuning

```md
User: Skip advanced configuration
```

```md
Agent: No problem! Moving to the final configuration stage.

[Uses mcp__dot-ai__recommend with stage: 'answerQuestion:advanced', solutionId, answers: {}]

Any additional requirements or constraints?

**Open Configuration:**
- Are there any additional requirements or constraints for your Go application deployment that we should consider? (e.g., specific security requirements, networking constraints, performance needs...)
```

**What happened behind the scenes:**
- recommend tool with stage 'answerQuestion:advanced' processed empty advanced stage answers (skipped all advanced questions)
- Marked advanced questions as explicitly skipped (answer: null)
- Determined next stage is 'open' and returned the open-ended question

```md
User: N/A
```

```md
Agent: Perfect! Configuration complete.

[Uses mcp__dot-ai__recommend with stage: 'answerQuestion:open', solutionId, answers: {open: "N/A"}]

Configuration complete. Ready to generate deployment manifests.
```

**What happened behind the scenes:**
- recommend tool with stage 'answerQuestion:open' processed open stage with "N/A" (no additional requirements)
- All configuration stages now complete (required ✓, basic ✓, advanced skipped, open ✓)
- Returned status: 'ready_for_manifest_generation', nextAction: 'generateManifests'

```md
User: Generate the manifests
```

```md
Agent: Generating your Kubernetes manifests...

[Uses mcp__dot-ai__recommend with stage: 'generateManifests', solutionId]

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
- recommend tool with stage 'generateManifests' loaded the fully configured solution file
- AI generated YAML manifests using all collected configuration answers
- Policy requirements enforced: Resource limits (CPU: 500m, memory: 512Mi) applied to containers
- System performed up to 10 validation loops with `kubectl apply --dry-run=server --validate=true`
- Each resource includes dot-ai.io/ labels for tracking and proper resource linking via labels/selectors
- Organizational patterns influenced the final YAML (NetworkPolicy added for security, HPA configured for scaling)
- Returned status: 'manifests_generated' with complete YAML content

```md
User: Yes, deploy it!
```

```md
Agent: Deploying your Golang application...

[Uses mcp__dot-ai__recommend with stage: 'deployManifests', solutionId]

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
- recommend tool with stage 'deployManifests' applied all manifests using `kubectl apply --wait`
- Monitored deployment progress and pod startup
- Verified HorizontalPodAutoscaler attached to deployment and NetworkPolicy applied to pods
- Provided access information based on Service configuration (ClusterIP = internal access only)

### Example 2: Third-Party Application Installation (Helm)

This example demonstrates installing third-party tools via Helm charts when no matching cluster capability exists.

```md
User: Install Prometheus
```

```md
Agent: [Uses mcp__dot-ai__recommend with intent "install Prometheus monitoring" and final: true]

Found a Prometheus Helm chart solution:

**prometheus-community/prometheus (v27.49.0)**
- App Version: v3.8.0
- Official chart maintained by prometheus-community
- Verified Publisher with 523 stars
- Repository: https://prometheus-community.github.io/helm-charts

This is the standard, recommended chart for installing Prometheus monitoring on Kubernetes.

Would you like me to proceed with this chart? I'll guide you through the configuration options.
```

**What happened behind the scenes:**
- System detected "Install Prometheus" as a third-party installation intent
- No Prometheus-related CRDs found in cluster capabilities, triggering Helm chart discovery
- ArtifactHub API searched for "prometheus" charts
- AI analyzed and scored charts based on official status, verified publisher, and popularity

```md
User: Yes, continue
```

```md
Agent: [Uses mcp__dot-ai__recommend with stage: 'chooseSolution', solutionId]

I need some details to configure your Prometheus installation:

**Required Configuration:**
- What name should be used for this Prometheus deployment?
- Which namespace should Prometheus be deployed to?
- Should Prometheus use persistent storage for metrics data?
```

**What happened behind the scenes:**
- System fetched chart values.yaml and README via Helm CLI
- AI analyzed configuration options and categorized into required/basic/advanced questions
- Cluster context gathered: available namespaces, StorageClasses
- Questions include suggested answers based on chart defaults and cluster state

```md
User: prometheus, monitoring namespace, no persistence
```

```md
Agent: [Uses mcp__dot-ai__recommend with stage: 'answerQuestion:required', solutionId, answers]

Here are some basic configuration options. Would you like to customize these or use defaults?

**Key settings (defaults shown):**
- Data retention: 15 days
- Scrape interval: 1 minute
- AlertManager: enabled
- kube-state-metrics: enabled (cluster object metrics)
- node-exporter: enabled (node hardware metrics)
- PushGateway: disabled
- Ingress: disabled
```

```md
User: Enable AlertManager
```

```md
Agent: [Uses mcp__dot-ai__recommend with stage: 'answerQuestion:basic', solutionId, answers]

Basic configuration set. Now for advanced options.

[Uses mcp__dot-ai__recommend with stage: 'answerQuestion:advanced', solutionId, answers: {}]

Skipping advanced options. Ready to generate the installation.

[Uses mcp__dot-ai__recommend with stage: 'generateManifests', solutionId]

Helm installation ready. Here's the configuration:

**Helm Command:**
helm upgrade --install prometheus prometheus-community/prometheus \
  --namespace monitoring --create-namespace \
  --version 27.49.0 -f values.yaml

**Values (values.yaml):**
server:
  global:
    scrape_interval: 1m
    scrape_timeout: 10s
    evaluation_interval: 1m
  retention: 15d
  persistentVolume:
    enabled: false

alertmanager:
  enabled: true

kube-state-metrics:
  enabled: true

prometheus-node-exporter:
  enabled: true

prometheus-pushgateway:
  enabled: false

Ready to install?
```

**What happened behind the scenes:**
- AI generated values.yaml containing only non-default values
- System ran `helm upgrade --install --dry-run` to validate the installation
- Returned helm command and values for user review

```md
User: Yes, deploy
```

```md
Agent: [Uses mcp__dot-ai__recommend with stage: 'deployManifests', solutionId]

Prometheus deployed successfully to the monitoring namespace.

**Deployed Components:**
- Prometheus Server
- AlertManager
- kube-state-metrics
- node-exporter

**Access Prometheus UI:**
kubectl --namespace monitoring port-forward svc/prometheus-server 9090:80
Then open http://localhost:9090

**Access AlertManager:**
kubectl --namespace monitoring port-forward svc/prometheus-alertmanager 9093:9093
Then open http://localhost:9093

**Internal DNS names:**
- Prometheus: prometheus-server.monitoring.svc.cluster.local:80
- AlertManager: prometheus-alertmanager.monitoring.svc.cluster.local:9093
```

**What happened behind the scenes:**
- Helm repository added and `helm upgrade --install --wait` executed
- Helm waited for all pods to become ready before reporting success
- Access instructions provided based on installed components

## See Also

- **[MCP Setup Guide](../setup/mcp-setup.md)** - Initial MCP server configuration
- **[Tools and Features Overview](mcp-tools-overview.md)** - Browse all available tools and features