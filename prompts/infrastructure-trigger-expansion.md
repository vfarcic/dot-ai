Expand these infrastructure type triggers: {initialTriggers}

Context: {description}

Generate additional infrastructure type keywords that are:
1. **Alternative names** for the same infrastructure types (e.g., "storage" → "volumes", "persistent storage")
2. **Related infrastructure categories** that would need the same governance approach  
3. **Infrastructure synonyms** (e.g., "load balancers" → "ingresses", "networking" → "services")

Rules:
- Return only ADDITIONAL triggers (not the original ones)
- Focus on infrastructure/resource types, not technical field names or implementation details
- Return as comma-separated list
- If no relevant additions exist, return empty response

Examples:
Input: "database"
Output: "databases, data store, SQL database, NoSQL, persistent storage"

Input: "networking" 
Output: "network policies, services, ingresses, load balancers, DNS"

Input: "storage"
Output: "persistent volumes, volumes, backup systems, storage classes"

Return only the comma-separated list of additional triggers: