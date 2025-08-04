# PRD: Plain English Policy Parser for Enterprise Governance

**Created**: 2025-07-28
**Status**: Draft
**Owner**: Viktor Farcic
**Last Updated**: 2025-01-28

## Executive Summary
Create a three-tool system for intelligent policy management: (1) AI-assisted Kyverno policy creation from plain English, (2) Policy analyzer that converts Kyverno policies to searchable embeddings, and (3) Policy-aware resource assembly that consults these embeddings to create compliant resources on the first attempt.

## Architecture Overview

### Three Distinct Tools:

1. **Kyverno Policy Creator** (Optional)
   - Converts plain English requirements to Kyverno YAML
   - Users can skip and write Kyverno directly

2. **Policy Analyzer/Indexer** (Core)
   - Analyzes Kyverno policies
   - Extracts semantic intent
   - Stores in vector database with embeddings

3. **Policy-Aware Resource Assembler** (Core)
   - Queries vector DB before creating resources
   - Builds compliant resources first time
   - Explains decisions with policy references

### Data Flow:
```
Plain English → [Tool 1] → Kyverno YAML → [Tool 2] → Vector DB → [Tool 3] → Compliant Resources
     OR
Kyverno YAML → [Tool 2] → Vector DB → [Tool 3] → Compliant Resources
```

## Documentation Changes

### Files Created/Updated
- **`docs/policy-creator-guide.md`** - New File - Guide for AI-assisted policy creation (Tool 1)
- **`docs/policy-analyzer-guide.md`** - New File - Policy analysis and indexing documentation (Tool 2)
- **`docs/policy-aware-assembly.md`** - New File - Policy-aware resource creation (Tool 3)
- **`docs/mcp-guide.md`** - MCP Documentation - Add all three policy tools
- **`README.md`** - Project Overview - Add intelligent policy management to capabilities

### Content Location Map
- **Tool 1 Usage**: See `docs/policy-creator-guide.md` (Section: "Creating Policies from Plain English")
- **Tool 2 Setup**: See `docs/policy-analyzer-guide.md` (Section: "Indexing Kyverno Policies")
- **Tool 3 Integration**: See `docs/policy-aware-assembly.md` (Section: "Policy-Aware Resource Creation")
- **Vector DB Schema**: See `docs/policy-analyzer-guide.md` (Section: "Embedding Storage")
- **MCP Commands**: See `docs/mcp-guide.md` (Section: "Policy Management Tools")

## Tool 1: Kyverno Policy Creator

### Purpose
Enable non-technical users to create Kyverno policies by explaining requirements in plain English.

### Implementation Requirements
- [ ] Natural language understanding of policy requirements
- [ ] Kyverno YAML generation with proper structure
- [ ] Support for common policy patterns (deny, require, validate)
- [ ] Interactive clarification for ambiguous requirements

### Example Usage:
```
User: "Don't allow databases to be exposed to the internet"

AI: "I'll create a Kyverno policy that prevents database Services from using LoadBalancer or NodePort types. 
    Should this apply to:
    1. All Services labeled with app=database
    2. Services in specific namespaces
    3. Services with specific naming patterns?"

User: "Option 1"

Output: deny-database-exposure.yaml (valid Kyverno policy)
```

### Success Criteria
- [ ] Generate valid Kyverno policies for 90% of common requirements
- [ ] Clear clarification prompts for ambiguous requests
- [ ] Policies pass Kyverno validation

## Tool 2: Policy Analyzer/Indexer

### Purpose
Convert Kyverno policies into searchable knowledge by extracting intent and storing as embeddings.

### Implementation Requirements
- [ ] Parse Kyverno policy structure (rules, matches, validations)
- [ ] Extract semantic intent from each rule
- [ ] Generate multiple natural language interpretations
- [ ] Create embeddings using OpenAI/local models
- [ ] Store in vector database with metadata

### Processing Example:
```yaml
# Input: Kyverno Policy
- name: deny-loadbalancer-for-db
  match:
    resources:
      kinds: ["Service"]
      selector:
        matchLabels:
          app: database
  validate:
    message: "Database services must use ClusterIP only"
    deny:
      conditions:
        - key: "{{ request.object.spec.type }}"
          operator: In
          value: ["LoadBalancer", "NodePort"]

# Output: Vector DB Entries
1. Text: "Database Services must not use LoadBalancer or NodePort types"
   Metadata: {
     source: "policies/deny-loadbalancer-for-db.yaml",
     rule: "deny-loadbalancer-for-db",
     resourceType: "Service",
     labels: ["app=database"],
     denies: ["LoadBalancer", "NodePort"]
   }

2. Text: "Services with label app=database must use ClusterIP only"
   Metadata: {...}

3. Text: "External database exposure is prohibited"
   Metadata: {...}

4. Text: "LoadBalancer Services are denied for database workloads"
   Metadata: {...}
```

### Success Criteria
- [ ] Extract intent from 95% of standard Kyverno patterns
- [ ] Generate 3-5 semantic variations per rule
- [ ] Index updates within 30 seconds of policy changes
- [ ] Maintain source traceability for all embeddings

## Tool 3: Policy-Aware Resource Assembler

### Purpose
MCP tool that queries policy embeddings before creating resources, ensuring compliance on first attempt.

### Implementation Requirements
- [ ] Query vector DB based on resource context
- [ ] Interpret relevant policies for resource type
- [ ] Apply policies during resource generation
- [ ] Explain policy decisions in resource comments
- [ ] Fall back to safe defaults when uncertain

### Usage Flow:
```
1. User: "Create a PostgreSQL Service for the payment system"

2. Tool queries vector DB:
   - "policies for database Services"
   - "PostgreSQL Service requirements"
   - "payment system constraints"

3. Vector DB returns:
   - ClusterIP only for databases (similarity: 0.89)
   - Require encryption labels (similarity: 0.76)
   - Payment services need high availability (similarity: 0.71)

4. Tool creates Service:
   ```yaml
   apiVersion: v1
   kind: Service
   metadata:
     name: payment-postgresql
     labels:
       app: database        # Required by policy
       encryption: enabled  # Required by policy
     annotations:
       policy/compliant: "deny-loadbalancer-for-db,require-encryption"
   spec:
     type: ClusterIP       # Policy: deny-loadbalancer-for-db
     selector:
       app: payment-postgresql
   ```

5. Explanation: "Created ClusterIP Service (required by database exposure policy)"
```

### Success Criteria
- [ ] 90% reduction in policy violations at apply time
- [ ] Query relevant policies in <50ms
- [ ] Clear policy attribution in generated resources
- [ ] Graceful handling when no policies found

## Integration Architecture

### Vector Database Schema
```json
{
  "collections": {
    "policies": {
      "vectors": {
        "size": 1536,
        "distance": "cosine"
      },
      "payload": {
        "source": "string",         // Original policy file
        "rule": "string",           // Rule name
        "resourceType": "string",   // Kubernetes resource type
        "action": "string",         // deny|require|validate
        "conditions": "object",     // Parsed conditions
        "originalYaml": "string"    // For reference
      }
    }
  }
}
```

### Synchronization
- Watch Kyverno policy ConfigMaps/CRDs
- Regenerate embeddings on changes
- Invalidate cache for affected resource types
- Log sync status and errors

## Implementation Progress

### Phase 1: Policy Analyzer/Indexer (Tool 2) [Status: ⏳ PENDING]
**Target**: Core functionality to convert Kyverno → Vector DB

**Documentation**:
- [ ] Create `docs/policy-analyzer-guide.md`
- [ ] Document vector DB schema

**Implementation**:
- [ ] Kyverno YAML parser
- [ ] Intent extraction engine
- [ ] Embedding generation pipeline
- [ ] Vector DB integration
- [ ] Change detection/sync

### Phase 2: Policy-Aware Resource Assembler (Tool 3) [Status: ⏳ PENDING]
**Target**: MCP tool using vector DB for compliant resource creation

**Documentation**:
- [ ] Create `docs/policy-aware-assembly.md`
- [ ] Add to `docs/mcp-guide.md`

**Implementation**:
- [ ] Vector DB query interface
- [ ] Policy interpretation logic
- [ ] Resource generation with policy application
- [ ] Policy explanation in outputs

### Phase 3: Kyverno Policy Creator (Tool 1) [Status: ⏳ PENDING]
**Target**: Natural language to Kyverno YAML conversion

**Documentation**:
- [ ] Create `docs/policy-creator-guide.md`
- [ ] Add examples for common patterns

**Implementation**:
- [ ] Natural language parser
- [ ] Kyverno template system
- [ ] Interactive clarification flow
- [ ] Validation against Kyverno schema

### Phase 4: Production Hardening [Status: ⏳ PENDING]
**Target**: Scale, monitoring, and feedback loops

**Implementation**:
- [ ] Performance optimization for large policy sets
- [ ] Monitoring and alerting
- [ ] Feedback loop for missed violations
- [ ] Policy coverage analytics

## Work Log

### 2025-01-28: Complete PRD Rewrite - Three Tool Architecture
**Duration**: ~45 minutes
**Primary Focus**: Restructured PRD around three distinct tools based on user feedback

**Completed Work**: 
- Defined clear separation between policy creation, analysis, and usage
- Specified Tool 2 as the critical bridge between Kyverno and AI
- Emphasized Tool 3's proactive policy checking
- Added concrete examples for each tool
- Defined vector DB schema and integration points

**Key Decisions**:
- Tool 1 is optional - teams can write Kyverno directly
- Tool 2 generates multiple interpretations per policy rule
- Tool 3 always consults policies before creating resources
- Kyverno remains the enforcement layer

**Next Steps**: Start with Tool 2 implementation as it's the foundation

---

## Appendix

### Common Kyverno Patterns to Support

**Deny Patterns**:
- Resource type restrictions
- Service exposure limits
- Namespace boundaries
- Label/annotation requirements

**Validation Patterns**:
- Resource limits/requests
- Security contexts
- Image registries
- Configuration constraints

**Mutation Patterns** (future):
- Default labels/annotations
- Resource defaults
- Security hardening