# Generic Kubernetes Resource Capability Analysis

Analyze this Kubernetes resource and identify its capabilities for semantic matching and AI recommendations.

## Resource Information
- **Resource**: {{resourceName}}

## Resource Definition
```yaml
{{resourceDefinition}}
```

## Analysis Instructions

Analyze the provided resource definition to understand what this resource does and extract its capabilities. Use only information present in the definition - do not guess or assume.

### 1. Functional Capabilities
From the resource definition, identify what this resource enables users to do:
- Look at schema properties, descriptions, and field names
- Identify the core functionality (e.g., "database", "storage", "networking")
- Be specific about technologies (e.g., "postgresql" vs generic "database")
- Extract capabilities from field names, descriptions, and structure

### 2. Provider/Platform Support  
Identify what platforms or providers this resource works with:
- Look for provider-specific configuration sections or fields
- Check for multi-provider abstractions vs single-provider resources
- Identify on-premises vs cloud-only resources
- Only list providers explicitly mentioned or configured in the definition

### 3. Abstraction Level
Determine what abstractions this resource provides:
- High-level managed services with minimal configuration
- Infrastructure abstractions (auto-scaling, high availability, etc.)
- Integration capabilities (backup, monitoring, security features)
- Look at required vs optional fields to gauge abstraction level

### 4. User Experience Complexity
Assess complexity considering both configuration and assembly requirements:

**Configuration Complexity:**
- Number and difficulty of required fields
- Technical knowledge needed for the resource itself
- Clarity of purpose and abstractions provided

**Assembly Complexity:**
- **Standalone**: Resource works independently, creates/manages all dependencies
- **Coordinated**: Requires 2-3 other resources to be functional
- **Orchestrated**: Needs many resources and complex relationships to work

**Final Complexity Rating:**
- **Low**: Simple configuration AND works standalone or with minimal dependencies
- **Medium**: Moderate configuration OR needs some coordination with other resources  
- **High**: Complex configuration OR requires orchestrating many resources OR both

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