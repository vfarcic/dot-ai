# Capability Inference Prompt

Analyze this Kubernetes resource and identify its capabilities for semantic resource matching.

## Resource Information
- **Resource**: {resourceName}
- **Analysis Context**: {analysisContext}

## Resource Schema
```yaml
{schema}
```

## Resource Metadata
```json
{metadata}
```

## Analysis Instructions

Please identify the following capabilities for this resource:

### 1. Primary Capabilities
What does this resource actually do? Consider all domains:
- **Database**: postgresql, mysql, redis, mongodb, database, managed database
- **Storage**: object storage, block storage, backup, storage
- **Application**: web service, api, microservice, application
- **Networking**: ingress, load balancer, service mesh, networking
- **Observability**: metrics, logging, tracing, monitoring
- **Security**: authentication, authorization, certificates, security
- **Compute**: containers, serverless, batch, compute
- **Other**: Any domain-specific capabilities

### 2. Cloud Providers Supported
Which cloud providers does this resource support?
- **Specific**: azure, aws, gcp, digitalocean, etc.
- **Multi-cloud**: if it works across multiple providers
- **On-premises**: if it supports on-prem deployments

### 3. Abstraction Level
What abstractions does this resource provide?
- **managed service**: Fully managed, minimal configuration
- **high availability**: Built-in HA and redundancy
- **auto scaling**: Automatic scaling capabilities
- **backup**: Built-in backup and restore
- **monitoring**: Built-in observability
- **security**: Built-in security features

### 4. User Complexity Assessment
How complex is this resource for end users?
- **low**: Simple, high-level, minimal configuration needed
- **medium**: Moderate complexity, some configuration required
- **high**: Complex, requires detailed knowledge and extensive configuration

## Response Format

Respond **only** with valid JSON in this exact format:

```json
{
  "capabilities": ["capability1", "capability2", "capability3"],
  "providers": ["provider1", "provider2"],
  "abstractions": ["abstraction1", "abstraction2"],
  "complexity": "low|medium|high",
  "description": "Brief description of what this resource does (1-2 sentences)",
  "useCase": "Primary use case for this resource (1 sentence)",
  "confidence": 0.8
}
```

## Examples

### Database Resource Example
```json
{
  "capabilities": ["postgresql", "mysql", "database", "managed database"],
  "providers": ["azure", "gcp", "aws"],
  "abstractions": ["managed service", "high availability", "backup"],
  "complexity": "low",
  "description": "High-level managed database solution supporting multiple engines and cloud providers",
  "useCase": "Simple database deployment without infrastructure complexity",
  "confidence": 0.9
}
```

### Storage Resource Example
```json
{
  "capabilities": ["object storage", "backup", "storage"],
  "providers": ["aws"],
  "abstractions": ["managed service", "auto scaling"],
  "complexity": "medium",
  "description": "AWS S3-compatible object storage with backup capabilities",
  "useCase": "Object storage and backup for applications",
  "confidence": 0.85
}
```

### Application Resource Example  
```json
{
  "capabilities": ["web service", "api", "application"],
  "providers": ["multi cloud"],
  "abstractions": ["auto scaling", "monitoring"],
  "complexity": "medium",
  "description": "Web application deployment with auto scaling and monitoring",
  "useCase": "Scalable web application hosting",
  "confidence": 0.8
}
```

## Important Notes

- **Be specific**: Use precise capability terms that users would search for
- **Be comprehensive**: Include all relevant capabilities, not just the primary one
- **Be accurate**: Only include capabilities that are clearly supported
- **Focus on user intent**: Think about what users would search for to find this resource
- **Consider abstraction**: Higher abstraction = lower complexity for users
- **Confidence score**: 0.1-1.0 based on how certain you are about the analysis

Analyze the provided resource and respond with the JSON format above.