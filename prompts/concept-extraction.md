# Concept Extraction for Pattern Matching

You are a Kubernetes deployment expert. Extract multiple deployment concepts from user intent to enable comprehensive pattern matching.

## User Intent
{intent}

## Instructions

Analyze the user intent and extract all relevant deployment concepts. Consider these categories:

### **Application Architecture**
- Application types: web application, API service, microservice, monolith, frontend, backend
- Architectural patterns: stateless, stateful, serverless, event-driven, batch processing
- Service types: REST API, GraphQL API, gRPC service, websocket service, message consumer

### **Infrastructure & Integration**  
- Data storage: database, cache, persistent storage, file storage, object storage
- Database services: PostgreSQL, MongoDB, MySQL, Redis, Elasticsearch clusters
- Connectivity: external database, message queue, third-party API, service mesh
- Networking: public access, internal service, load balancing, ingress, networking policies
- Infrastructure operators: monitoring, logging, backup, security operators

### **Operational Requirements**
- Scaling: auto-scaling, high availability, load balancing, horizontal scaling
- Data management: schema management, database migrations, backup, monitoring
- Security: authentication, authorization, network policies, secrets management
- Deployment: CI/CD, blue-green deployment, canary deployment, rolling updates

### **Technology Stack**
- Programming languages: golang, java, python, nodejs, react, angular
- Frameworks: spring boot, express, flask, django, rails
- Databases: postgresql, mysql, mongodb, redis, elasticsearch
- Infrastructure tools: prometheus, grafana, ingress-nginx, istio, knative
- Operators: database operators, monitoring operators, backup operators

## Response Format

Extract 3-8 specific concepts that organizational patterns might address. Focus on concepts that would have dedicated deployment patterns.

```json
{
  "concepts": [
    {
      "category": "application_architecture|infrastructure|operational|technology",
      "concept": "specific concept name",
      "importance": "high|medium|low",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}
```

## Examples

**Input**: "deploy a stateless golang API that connects to PostgreSQL with auto-scaling"
**Output**:
```json
{
  "concepts": [
    {
      "category": "application_architecture", 
      "concept": "stateless application",
      "importance": "high",
      "keywords": ["stateless", "stateless app", "stateless service", "stateless workload"]
    },
    {
      "category": "application_architecture",
      "concept": "REST API service", 
      "importance": "high",
      "keywords": ["api", "rest api", "api service", "web service", "http service"]
    },
    {
      "category": "technology",
      "concept": "golang application",
      "importance": "medium", 
      "keywords": ["golang", "go", "golang app", "go application", "go service"]
    },
    {
      "category": "infrastructure",
      "concept": "database connection",
      "importance": "high",
      "keywords": ["database", "postgresql", "db connection", "external database"]
    },
    {
      "category": "operational", 
      "concept": "auto-scaling",
      "importance": "medium",
      "keywords": ["auto-scaling", "horizontal scaling", "scaling", "hpa"]
    }
  ]
}
```

**IMPORTANT**: Return ONLY the JSON object, nothing else.