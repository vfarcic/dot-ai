# Pattern Management Guide

**Complete guide for creating and managing organizational deployment patterns with the DevOps AI Toolkit.**

## Overview

Pattern Management enables platform engineers and architects to capture organizational deployment knowledge as reusable patterns. These patterns automatically enhance AI deployment recommendations, ensuring consistency with your team's best practices and organizational standards.

### What is Pattern Management?

Pattern Management allows you to:
- **Create deployment patterns** that capture your organization's preferred resource combinations
- **Store patterns semantically** using Vector DB technology for intelligent matching
- **Enhance AI recommendations** with organizational context and best practices
- **Share institutional knowledge** across teams through standardized deployment approaches

### How It Works

1. **Pattern Creation** → Platform engineers define deployment patterns with triggers and resource recommendations
2. **Semantic Storage** → Patterns are stored with AI-generated embeddings for intelligent matching
3. **AI Integration** → When users request deployments, relevant patterns automatically enhance recommendations
4. **Continuous Learning** → Patterns improve recommendation quality over time through usage

## Prerequisites

Before using Pattern Management, ensure you have:

### Required Setup
- **DevOps AI Toolkit MCP server** configured (see [MCP Setup Guide](./mcp-setup.md))
- **Vector DB service** (Qdrant) for pattern storage
- **API keys** can be set as environment variables or in `.mcp.json`

For complete setup instructions, see the [MCP Setup Guide](./mcp-setup.md).

## Configuration

### Vector Database Setup

Pattern Management requires a Vector DB service for semantic pattern storage and retrieval.

#### Qdrant Cloud (Recommended)

1. **Sign up** at [Qdrant Cloud](https://cloud.qdrant.io/)
2. **Create a cluster** (free tier works fine for pattern storage)
3. **Get connection details**:
   - URL from cluster dashboard
   - API key from cluster settings
4. **Add to `.mcp.json`** environment variables

#### Local Qdrant

```bash
# Run local Qdrant with Docker
docker run -p 6333:6333 -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant
```

**Configuration**:
```json
"env": {
  "QDRANT_URL": "http://localhost:6333"
}
```

### Embedding Service Setup

For semantic pattern matching, configure an embedding service:

#### OpenAI Embeddings (Recommended)

1. **Get API key** from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **Add to environment**: `"OPENAI_API_KEY": "sk-proj-..."`
3. **Automatic model**: Uses `text-embedding-3-small` (1536 dimensions)

#### Alternative: Keyword-Only Matching

If no embedding service is configured, the system automatically falls back to keyword-based pattern matching, which still provides good results for exact term matches.

## Pattern Management Operations

All pattern management is done through natural conversation with your AI assistant. The system provides a guided workflow for creating comprehensive patterns.

### Creating Organizational Patterns

**Start Pattern Creation**:
```
I want to create a new organizational deployment pattern
```

The AI assistant will guide you through a step-by-step workflow:

#### Step 1: Pattern Description
The assistant will ask for a clear description of your pattern:

**Example**:
```
Assistant: I'll help you create an organizational deployment pattern. 

What type of deployment pattern would you like to create? Please provide a clear description of the pattern's purpose.

You: I want to create a pattern for stateless web applications
```

#### Step 2: Trigger Keywords
Define keywords that should activate this pattern:

**Example**:
```
Assistant: Great! Now I need trigger keywords that should activate this pattern. When users mention these terms, the pattern will be suggested.

Please provide trigger keywords or phrases (one per line):

You: stateless application
web app  
api service
microservice
rest api
frontend application
```

#### Step 3: Suggested Resources
Specify Kubernetes resources this pattern should recommend:

**Example**:
```
Assistant: Perfect! Now, what Kubernetes resources should this pattern suggest? 

You: Deployment
Service  
Ingress
HorizontalPodAutoscaler
```

#### Step 4: Rationale
Explain why these resources work well together:

**Example**:
```
Assistant: Finally, please provide a rationale explaining why these resources work well together for this use case:

You: This combination provides a complete stateless application deployment: Deployment manages replicated pods without persistent state, Service provides stable network access, Ingress handles external routing and SSL termination, and HorizontalPodAutoscaler automatically scales based on demand. Together they create resilient, scalable applications that can handle traffic fluctuations and failures gracefully.
```

The system will then create and store your pattern with semantic embeddings for intelligent matching.

### Listing Patterns

**View All Patterns**:
```
Show me all organizational patterns
```

**Example Response**:
```
Found 3 organizational deployment patterns:

1. **Stateless Applications** (Created: 2025-01-15)
   - Triggers: 8 keywords including "web app", "api service", "microservice"
   - Resources: Deployment, Service, Ingress, HorizontalPodAutoscaler
   - Created by: platform-team

2. **Database Workloads** (Created: 2025-01-14)  
   - Triggers: 6 keywords including "database", "persistent storage", "stateful"
   - Resources: StatefulSet, PersistentVolumeClaim, Secret
   - Created by: data-team

3. **Network Security** (Created: 2025-01-13)
   - Triggers: 5 keywords including "network policy", "security", "isolation"
   - Resources: NetworkPolicy
   - Created by: security-team

Search mode: semantic+keyword hybrid search enabled
```

### Viewing Pattern Details

**Get Specific Pattern**:
```
Show me details for the stateless applications pattern
```

**Example Response**:
```
Pattern: Stateless Applications

**Description**: Stateless web applications
**Created**: 2025-01-15 by platform-team

**Triggers** (8):
- stateless application
- web app
- api service  
- microservice
- rest api
- frontend application
- http service
- web service

**Suggested Resources** (4):
- Deployment
- Service
- Ingress
- HorizontalPodAutoscaler

**Rationale**: 
This combination provides a complete stateless application deployment: Deployment manages replicated pods without persistent state, Service provides stable network access, Ingress handles external routing and SSL termination, and HorizontalPodAutoscaler automatically scales based on demand. Together they create resilient, scalable applications that can handle traffic fluctuations and failures gracefully.
```

### Deleting Patterns

**Remove Pattern**:
```
Delete the network security pattern
```

The assistant will confirm the deletion and remove the pattern from storage.

## AI Integration

### How Patterns Enhance Recommendations

When you request a deployment recommendation, the system automatically:

1. **Analyzes your request** for semantic similarity to stored patterns
2. **Finds relevant patterns** using hybrid semantic + keyword search
3. **Enhances the AI prompt** with organizational context
4. **Provides recommendations** that align with your patterns while maintaining AI autonomy

### Example Integration Workflow

**User Request**:
```
I need to deploy a REST API for user authentication
```

**Behind the Scenes**:
1. System finds "Stateless Applications" pattern (matches "REST API")
2. AI receives both the user request AND the relevant pattern context
3. AI generates recommendations influenced by organizational best practices

**Enhanced Recommendation**:
```
Based on your request and organizational patterns, I recommend:

**Core Resources** (from Stateless Applications pattern):
- Deployment: For running your auth API pods
- Service: To provide stable internal access  
- Ingress: For external API access with TLS
- HorizontalPodAutoscaler: Auto-scaling based on demand

**Additional Considerations**:
- Secret: For API keys and JWT signing keys
- ConfigMap: For non-sensitive configuration
- NetworkPolicy: To restrict database access (security pattern)

This follows your organization's stateless application pattern while adding auth-specific requirements.
```

### Pattern Suggestions vs. Requirements

**Important**: Patterns serve as **suggestions** to enhance AI decision-making, not rigid requirements. The AI maintains autonomy to:
- Adapt recommendations based on specific user needs  
- Suggest additional resources not in patterns
- Explain when it deviates from patterns and why
- Balance organizational consistency with deployment-specific requirements

## Pattern Examples

### Example 1: Stateless Application Pattern

**Use Case**: Standard web applications, APIs, and microservices

```yaml
Description: Stateless web applications
Triggers:
  - stateless application
  - web app
  - api service
  - microservice
  - rest api
  - frontend application
Resources:
  - Deployment
  - Service  
  - Ingress
  - HorizontalPodAutoscaler
Rationale: Provides complete stateless deployment with scaling, networking, and external access
```

**When It Activates**: User requests for "web app", "API deployment", "microservice setup", etc.

### Example 2: Database Workload Pattern

**Use Case**: Persistent databases and stateful services

```yaml
Description: Database and persistent storage workloads
Triggers:
  - database
  - persistent storage
  - stateful service
  - data store
  - mysql
  - postgresql
Resources:
  - StatefulSet
  - PersistentVolumeClaim
  - Secret
  - Service
Rationale: Ensures data persistence, ordered deployment, and secure credential management
```

**When It Activates**: User requests for "database deployment", "persistent storage", "MySQL setup", etc.

### Example 3: Network Security Pattern

**Use Case**: Security-focused deployments with network isolation

```yaml
Description: Network security and isolation policies
Triggers:
  - network security
  - network isolation
  - security policy
  - network policy
  - microsegmentation
Resources:
  - NetworkPolicy
  - PodSecurityPolicy
  - ServiceAccount
Rationale: Implements defense-in-depth with network segmentation and pod security controls
```

**When It Activates**: User mentions "security", "network isolation", "compliance requirements", etc.

### Example 4: Monitoring Pattern

**Use Case**: Applications requiring observability and monitoring

```yaml
Description: Monitoring and observability setup
Triggers:
  - monitoring
  - observability
  - metrics
  - logging
  - tracing
  - prometheus
Resources:
  - ServiceMonitor
  - PodMonitor
  - PrometheusRule
  - Grafana Dashboard
Rationale: Provides comprehensive observability with metrics collection, alerting, and visualization
```

**When It Activates**: User requests including "monitoring", "observability", "metrics collection", etc.

## Best Practices

### Pattern Creation Guidelines

#### 1. Focus and Composability
- **Create focused patterns** for specific use cases rather than trying to cover everything
- **Make patterns composable** so multiple patterns can enhance a single recommendation
- **Avoid overlapping triggers** that might cause confusion between patterns

**Good Example**:
```yaml
# Focused pattern
Description: "Load balancer setup"
Triggers: ["load balancer", "external access", "ingress"]
Resources: ["Service", "Ingress"]
```

**Avoid**:
```yaml  
# Too broad
Description: "Complete application setup"  
Triggers: ["application", "app", "deploy", "service", "database", "monitoring"]
Resources: ["Deployment", "Service", "Ingress", "StatefulSet", "PVC", "Secret", "ServiceMonitor"]
```

#### 2. Clear Trigger Keywords
- **Use specific triggers** that clearly indicate when the pattern applies
- **Include common variations** and synonyms users might employ
- **Add technical terms** your team commonly uses

**Effective Triggers**:
```yaml
Triggers:
  - "stateless application"    # Specific architecture term
  - "web app"                  # Common colloquial term  
  - "api service"              # Technical specification
  - "microservice"             # Architecture pattern
  - "rest api"                 # Implementation detail
```

#### 3. Meaningful Rationales  
- **Explain the why** behind resource combinations
- **Describe interactions** between suggested resources
- **Include failure scenarios** the pattern addresses

**Strong Rationale Example**:
```
"This combination provides complete stateless deployment: Deployment manages replicated pods without persistent state, Service provides stable network access, Ingress handles external routing and SSL termination, and HorizontalPodAutoscaler automatically scales based on demand. Together they create resilient applications that can handle traffic fluctuations and pod failures gracefully."
```

### Organizational Adoption

#### 1. Start Simple
- **Begin with 3-5 core patterns** covering your most common deployment types
- **Validate with actual deployments** before expanding the pattern library
- **Gather feedback** from development teams on pattern usefulness

#### 2. Team Collaboration
- **Involve multiple teams** in pattern creation (platform, security, development)
- **Document pattern ownership** for future updates and maintenance
- **Create patterns for team-specific needs** (data team patterns, frontend patterns, etc.)

#### 3. Iterative Improvement
- **Monitor pattern usage** through recommendation feedback
- **Update patterns** based on changing organizational needs
- **Archive outdated patterns** that no longer reflect best practices

### Pattern Quality Guidelines

#### 1. Resource Selection
- **Include complementary resources** that work well together
- **Avoid conflicting resources** (e.g., both Deployment and StatefulSet)
- **Focus on the core resources** needed for the pattern's use case

#### 2. Trigger Optimization  
- **Test triggers** with real user language from past deployment requests
- **Include both formal and informal terms** teams actually use
- **Avoid overly generic triggers** that match unrelated requests

#### 3. Maintenance
- **Review patterns quarterly** to ensure they remain current
- **Update resources** when new Kubernetes features become available
- **Validate rationales** against current architectural decisions

## Troubleshooting

### Common Issues

#### Pattern Creation Fails

**Symptom**: Error when creating patterns through AI assistant

**Possible Causes**:
- Vector DB connection issues
- Missing required environment variables
- Qdrant collection initialization problems

**Solutions**:
1. **Check system status**:
   ```
   What's the status of the pattern management system?
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
       "QDRANT_URL": "required_for_pattern_storage", 
       "QDRANT_API_KEY": "required_for_qdrant_access"
     }
   }
   ```

#### Patterns Not Found During Search

**Symptom**: Relevant patterns don't appear in recommendations

**Possible Causes**:
- Trigger keywords don't match user language
- Embedding service not configured properly
- Pattern storage issues

**Solutions**:
1. **Review pattern triggers**:
   - Check if triggers match the language users actually employ
   - Add more trigger variations and synonyms
   - Test trigger effectiveness with common user requests

2. **Check search capabilities**:
   ```
   Show me search capabilities for patterns
   ```

3. **Verify embedding service**:
   - Confirm `OPENAI_API_KEY` is set for semantic search
   - Test that embedding service is responding
   - Check if patterns have embeddings stored

#### Semantic Search Not Working

**Symptom**: Only exact keyword matches work, semantic similarities missed

**Possible Causes**:
- OpenAI API key missing or invalid
- Patterns created without embeddings
- Embedding service connectivity issues

**Solutions**:
1. **Verify OpenAI configuration**:
   - Confirm valid `OPENAI_API_KEY` in environment
   - Test OpenAI API accessibility
   - Check API key permissions and usage limits

2. **Check embedding status**:
   ```
   What's the status of the embedding service?
   ```

3. **Recreate patterns if needed**:
   - Patterns created without embedding service may need recreation
   - New patterns will automatically include embeddings if service is available

### System Diagnostics

#### Check Overall System Health

**Command**:
```
What's the current system status?
```

**Expected Response**:
```json
{
  "status": "healthy",
  "vectorDB": {
    "connected": true,
    "patternsCount": 5
  },
  "embedding": {
    "available": true,
    "provider": "openai"
  },
  "search": "semantic+keyword"
}
```

#### Verify Pattern Storage

**Command**:
```
List all organizational patterns
```

**Check For**:
- Patterns are being returned successfully
- Pattern count matches expectations
- Search capabilities indicate semantic or keyword mode

#### Test Pattern Matching

**Test Method**:
1. Create a test pattern with specific triggers
2. Make a deployment request using those triggers
3. Verify the pattern influences the recommendation
4. Check that AI mentions organizational context

## FAQ

### General Questions

**Q: Do I need Qdrant's paid embedding service?**  
A: No! The system uses OpenAI to generate embeddings and stores them in Qdrant. The free Qdrant tier works perfectly for pattern storage and search.

**Q: Can I use pattern management without semantic search?**  
A: Yes! Without an embedding service, the system uses keyword-based matching, which still provides good results for exact term matches.

**Q: How many patterns should I create?**  
A: Start with 3-5 core patterns covering your most common deployment types. Expand based on team feedback and usage patterns.

**Q: Can multiple patterns match a single request?**  
A: Yes! The AI can use multiple relevant patterns to create comprehensive recommendations that combine organizational best practices.

### Technical Questions

**Q: What happens if Vector DB is unavailable?**  
A: Pattern operations will fail gracefully. Deployment recommendations continue working but without organizational pattern enhancement.

**Q: Can I backup my patterns?**  
A: Currently, patterns are stored in your Qdrant instance. Back up your Qdrant data to preserve patterns. Export functionality is planned for future versions.

**Q: How do I update an existing pattern?**  
A: Currently, delete the old pattern and create a new one. In-place editing is planned for future versions.

**Q: Can I see which patterns influenced a recommendation?**  
A: The AI will mention when recommendations are enhanced by organizational patterns, though detailed pattern attribution is not yet available.

### Performance Questions

**Q: How fast is pattern search?**  
A: Pattern retrieval typically takes under 100ms for semantic search with reasonable pattern volumes (under 100 patterns).

**Q: Does pattern management slow down recommendations?**  
A: No significant impact. Pattern search runs in parallel with other recommendation analysis and adds minimal latency.

**Q: How many patterns can the system handle?**  
A: The system is tested with 100+ patterns. Qdrant can scale to much larger volumes if needed.

## Support

### Getting Help

**For setup issues**:
- Review the [MCP Setup Guide](./mcp-setup.md) for foundational configuration
- Check environment variable configuration in `.mcp.json`
- Verify Vector DB connectivity and credentials

**For pattern creation problems**:
- Use system diagnostics to check service health
- Review best practices for trigger keyword selection
- Test with simple patterns first before creating complex ones

**For AI integration questions**:
- Verify that patterns are being stored successfully
- Test pattern matching with known trigger keywords
- Check that AI mentions organizational context in recommendations

### Community

**Documentation**: Complete guides available in `docs/` directory  
**Issues**: Report bugs and feature requests at [GitHub Issues](https://github.com/vfarcic/dot-ai/issues)

---

*This guide covers Pattern Management v1.0. Features like pattern analytics, approval workflows, and advanced pattern organization are planned for future versions.*