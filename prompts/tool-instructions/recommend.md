# Recommend Tool - User Interaction Requirements

## 🛑 MANDATORY USER INTERACTION REQUIRED 🛑

Deploy, create, run, or setup applications on Kubernetes with AI-powered recommendations.

### ⚠️ CRITICAL: You MUST ask the user to describe their application BEFORE using this tool. DO NOT proceed without user input.

### ✅ REQUIRED WORKFLOW:
1. Ask: "What type of application do you want to deploy?"
2. Wait for user response describing their specific application
3. Use their exact description as the "intent" parameter

### Examples of Required User Interaction:

**❌ DO NOT use generic intents like:**
- "deploy an application"
- "create something"
- "setup infrastructure"

**✅ DO use specific intents like:**
- "deploy a Node.js REST API with PostgreSQL database"
- "setup a React frontend with Redis caching"
- "create a Python Flask microservice with MongoDB"
- "run a WordPress site with MySQL"
- "deploy a monitoring stack with Prometheus and Grafana"

### Supported Application Types:
- Web applications (React, Vue, Angular, static sites)
- APIs and microservices (Node.js, Python, Go, Java, .NET)
- Databases (PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch)
- Message queues (RabbitMQ, Apache Kafka, NATS)
- Monitoring and logging (Prometheus, Grafana, ELK stack)
- CI/CD pipelines (Jenkins, GitLab CI, Argo CD)
- Batch jobs and cron tasks
- Any containerized applications

### Why This Matters:
- Ensures accurate, relevant deployment recommendations
- Prevents generic solutions that don't meet user needs
- Enables AI to suggest the most appropriate Kubernetes resources
- Improves user experience with tailored solutions