# DevOps AI Toolkit MCP Recommendation Guide

**Complete guide for using Kubernetes deployment recommendations through MCP (Model Context Protocol).**

## Prerequisites

Before using this guide, complete the [MCP Setup](mcp-setup.md) to configure your MCP server with:
- DevOps AI Toolkit MCP server running
- `ANTHROPIC_API_KEY` configured
- `KUBECONFIG` pointing to your Kubernetes cluster (optional but recommended)

## Overview

The DevOps AI Toolkit recommendation feature provides:
- **Intelligent cluster discovery** - Analyzes your Kubernetes cluster capabilities
- **AI-powered recommendations** - Suggests optimal deployment approaches based on available resources
- **Guided configuration** - Step-by-step configuration collection for your deployments
- **Manifest generation** - Creates ready-to-deploy Kubernetes YAML files
- **Automated deployment** - Deploys and monitors your applications

## Available MCP Tools

### Core Workflow Tools

#### `mcp__dot-ai__recommend`
Get AI-powered deployment recommendations based on your cluster capabilities.

**Usage:**
```
Use the recommend tool to get deployment suggestions for my web application
```

**Parameters:**
- `intent` (required): Description of what you want to deploy

**Returns:**
- List of recommended solutions with scoring
- Available configuration questions

**Example:**
```
User: I want to deploy a Node.js web application with Redis cache

Agent: I'll help you deploy a Node.js application with Redis cache. Let me analyze your cluster and get recommendations.

[Uses mcp__dot-ai__recommend with intent "deploy Node.js web application with Redis cache"]

Response: Found 3 recommended solutions:
1. Kubernetes Deployment + StatefulSet Redis (Score: 92)
2. Helm Chart with Redis subchart (Score: 87) 
3. Operator-based Redis + Deployment (Score: 83)
```

#### `mcp__dot-ai__chooseSolution`
Select a specific solution and get its configuration questions.

**Usage:**
```
Use chooseSolution with solution ID sol_2024-12-01T123456_abc123
```

**Parameters:**
- `solutionId` (required): ID from recommend tool response

**Returns:**
- Configuration questions grouped by stage (required, basic, advanced, open)

**Example:**
```
Agent: Let's go with the Kubernetes Deployment + StatefulSet Redis approach.

[Uses mcp__dot-ai__chooseSolution with selected solution ID]

Response: Great choice! I need configuration details:

Required Questions:
- Application name
- Node.js container image  
- Application port
- Redis password

Basic Questions:
- Number of replicas
- Resource limits
- Storage size for Redis

Advanced Questions:
- Redis configuration overrides
- Network policies
- Backup strategy
```

#### `mcp__dot-ai__answerQuestion`
Provide answers to configuration questions for your chosen solution.

**Usage:**
```
Use answerQuestion to configure the required settings
```

**Parameters:**
- `solutionId` (required): Solution ID
- `stage` (required): Question stage (required/basic/advanced/open)
- `answers` (required): Your configuration answers

**Returns:**
- Next set of questions or completion status

**Example:**
```
Agent: Let me configure the required settings first.

[Uses mcp__dot-ai__answerQuestion with stage "required" and answers]

Response: Required configuration complete! Moving to basic questions:
- How many replicas do you want? (default: 3)
- What are the resource limits for your app?
- How much storage for Redis? (default: 10Gi)
```

#### `mcp__dot-ai__generateManifests`
Generate final Kubernetes manifests from your configured solution.

**Usage:**
```
Use generateManifests to create the deployment files
```

**Parameters:**
- `solutionId` (required): Fully configured solution ID

**Returns:**
- Generated Kubernetes YAML manifests
- Deployment instructions

**Example:**
```
Agent: Configuration complete! Generating your Kubernetes manifests...

[Uses mcp__dot-ai__generateManifests]

Response: Generated 5 manifest files:
- my-app-deployment.yaml
- my-app-service.yaml  
- redis-statefulset.yaml
- redis-service.yaml
- redis-configmap.yaml
```

#### `mcp__dot-ai__deployManifests`
Deploy the generated manifests to your Kubernetes cluster.

**Usage:**
```
Use deployManifests to apply the configuration to the cluster
```

**Parameters:**
- `solutionId` (required): Solution ID with generated manifests
- `timeout` (optional): Deployment timeout in seconds (default: 30)

**Returns:**
- Deployment status and results
- Any deployment errors or warnings

**Example:**
```
Agent: Deploying your application stack to the cluster...

[Uses mcp__dot-ai__deployManifests]

Response: Deployment successful!
- my-app: 3/3 pods running
- redis: 1/1 pods running
- Services created and accessible
- External IP: 203.0.113.10
```

### Utility Tools

#### `mcp__dot-ai__version`
Get version information for the DevOps AI Toolkit.

**Usage:**
```
Use version to check the toolkit version
```

**Parameters:** None

**Returns:** Version information and capabilities

## Complete Workflow Examples

### Example 1: Simple Web Application

```
User: I want to deploy a Node.js web application to my cluster

Agent: I'll help you deploy a Node.js web application. Let me get recommendations for your cluster.

[Uses mcp__dot-ai__recommend with intent "deploy Node.js web application"]

Agent: Based on your cluster capabilities, I found 3 deployment options:

1. **Standard Kubernetes Deployment + Service (Score: 85)**
   - Uses your existing ingress controller
   - Horizontal Pod Autoscaler available
   - Persistent volumes supported
   
2. **Cloud Run Service (Score: 78)**  
   - Serverless scaling
   - Pay-per-request pricing
   - Limited to HTTP services
   
3. **Knative Service (Score: 72)**
   - Auto-scaling to zero
   - Traffic splitting capabilities
   - Requires Knative operator

Which approach interests you most?

User: Let's go with the standard Kubernetes approach.

Agent: Excellent choice! Let me get the configuration requirements.

[Uses mcp__dot-ai__chooseSolution with the selected solution ID]

Agent: I need some details to configure your deployment:

**Required Configuration:**
- What's your application name? (e.g., "my-web-app")
- What's your container image? (e.g., "node:18-alpine")  
- What port does your app listen on? (e.g., 3000)

**Basic Configuration (optional):**
- How many replicas do you want? (default: 3)
- Do you need persistent storage?
- What resource limits should I set?

User: App name is "customer-portal", image is "myregistry/customer-portal:v1.2.0", port 8080, and I want 2 replicas.

Agent: Perfect! Let me configure this for you.

[Uses mcp__dot-ai__answerQuestion with the provided answers]

Agent: Great! Your configuration is complete. Let me generate the Kubernetes manifests.

[Uses mcp__dot-ai__generateManifests]

Agent: I've generated your deployment files:

# customer-portal-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: customer-portal
spec:
  replicas: 2
  selector:
    matchLabels:
      app: customer-portal
  template:
    metadata:
      labels:
        app: customer-portal
    spec:
      containers:
      - name: customer-portal
        image: myregistry/customer-portal:v1.2.0
        ports:
        - containerPort: 8080
---
# customer-portal-service.yaml  
apiVersion: v1
kind: Service
metadata:
  name: customer-portal
spec:
  selector:
    app: customer-portal
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer

Ready to deploy to your cluster?

User: Yes, deploy it!

Agent: Deploying your customer portal...

[Uses mcp__dot-ai__deployManifests]

Agent: 🎉 **Deployment successful!**

**Status:**
- Deployment: customer-portal (2/2 pods running)
- Service: customer-portal (LoadBalancer created)
- External IP: 203.0.113.15
- URL: http://203.0.113.15

Your customer portal is now live and accessible!
```

### Example 2: Database + Application Stack

```
User: I need to deploy a web app with a PostgreSQL database

Agent: I'll help you set up both the application and database as a complete stack.

[Uses mcp__dot-ai__recommend with intent "deploy web application with PostgreSQL database"]

Agent: Perfect! I found several stack options for you:

1. **Application + StatefulSet PostgreSQL (Score: 89)**
   - Persistent database with automatic backups
   - Dedicated storage volumes
   - Database configuration management
   
2. **Helm Chart Stack (Score: 85)**
   - PostgreSQL subchart included  
   - Configurable with values.yaml
   - Easy upgrades and rollbacks
   
3. **Operator-based Stack (Score: 82)**
   - PostgreSQL Operator manages database
   - Advanced features like streaming replication
   - Automatic failover capabilities

I recommend the StatefulSet approach for reliability. Sound good?

User: Yes, let's go with StatefulSet PostgreSQL.

Agent: Excellent! This will create a robust stack. Let me get the configuration requirements.

[Uses mcp__dot-ai__chooseSolution with selected solution]

Agent: I need configuration for both your application and database:

**Application Configuration:**
- Application name?
- Container image and version?  
- Application port?

**Database Configuration:**
- Database name and user?
- Storage size for PostgreSQL? (default: 10Gi)
- Database password (I'll generate secure one if not provided)?

**Infrastructure:**
- How many app replicas?
- Resource limits needed?

User: App name "task-manager", image "mycompany/task-manager:2.1", port 9000. Database name "tasks" with user "taskuser". Use 20Gi storage and 3 app replicas.

Agent: Perfect configuration! Let me set this up.

[Uses mcp__dot-ai__answerQuestion for all configuration stages]

Agent: Stack configuration complete! Generating manifests for your task manager with PostgreSQL...

[Uses mcp__dot-ai__generateManifests]

Agent: Generated complete stack manifests:

**Application Components:**
- task-manager-deployment.yaml (3 replicas)
- task-manager-service.yaml
- task-manager-configmap.yaml (database connection config)

**Database Components:**  
- postgres-statefulset.yaml (persistent storage)
- postgres-service.yaml (internal connectivity)
- postgres-secret.yaml (credentials)
- postgres-pvc.yaml (20Gi storage claim)

Ready to deploy your complete stack?

User: Deploy it!

Agent: Deploying task manager with PostgreSQL database...

[Uses mcp__dot-ai__deployManifests with longer timeout for database startup]

Agent: 🎉 **Full stack deployment successful!**

**Application Status:**
- task-manager: 3/3 pods running
- PostgreSQL: 1/1 pods running  
- Database initialized with 'tasks' database
- Internal connectivity established

**Access Information:**
- External service IP: 203.0.113.25
- Application URL: http://203.0.113.25:9000
- Database accessible internally at: postgres:5432

Your task manager application is now live with a persistent PostgreSQL database!
```

## See Also

- **[MCP Setup Guide](mcp-setup.md)** - Initial MCP server configuration
- **[MCP Documentation Testing Guide](mcp-documentation-testing-guide.md)** - Automated documentation validation