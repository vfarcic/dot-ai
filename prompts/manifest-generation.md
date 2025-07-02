# Kubernetes Manifest Generation

## Solution Configuration
{solution}

## Resource Schemas
The following schemas are available for the resources selected in the solution:
{schemas}

## Previous Attempt (if retry)
{previous_attempt}

## Validation Error Details (if retry)
{error_details}

## Instructions

Generate production-ready Kubernetes YAML manifests from the complete solution configuration. The solution contains all necessary context including discovered resource schemas, user answers, cluster capabilities, and selected resource types.

### Core Strategy:

1. **Analyze Solution Data**:
   - Use the selected resource types from the solution
   - Review discovered resource schemas and cluster capabilities
   - Understand the complete context of what's available

2. **Apply User Configuration**:
   - Map all question answers to appropriate manifest fields
   - **CRITICAL**: Use ONLY the fields defined in the provided resource schemas
   - Do not invent or guess field names - refer to the schema section above
   - Apply configuration values appropriately for the specific resource type

3. **Cross-Resource Field Mapping**:
   - Many user answers apply to multiple resources in the solution
   - Use the same values consistently across related resources where appropriate
   - Ensure proper relationships between resources through consistent naming and labeling
   - Apply configuration values to all relevant fields across different resource types

4. **Process Open Requirements**:
   - If user provided open requirements, analyze their specific needs
   - Use available cluster resources to fulfill those requirements intelligently
   - Make enhancement decisions based on actual cluster capabilities
   - **CRITICAL**: Add any additional resources needed to fulfill open requirements:
     * **Hostname/Domain access** → Add Ingress resource with appropriate rules
     * **External configuration** → Add ConfigMap resources
     * **Secrets/credentials** → Add Secret resources
     * **SSL/TLS requirements** → Add TLS configuration to Ingress
     * **Persistent storage needs** → Add PersistentVolumeClaim resources
     * **Network policies** → Add NetworkPolicy resources
     * **Resource limits** → Add ResourceQuota or LimitRange resources

5. **Generate Appropriate Manifests**:
   - Create manifests for the selected resource types
   - **IMPORTANT**: Include any additional supporting resources needed to fulfill open requirements
   - Use correct API versions and schemas from the solution data
   - Ensure all resources work together to meet user's complete requirements

### For Retry Attempts:
If this is a retry (previous attempt and error details provided above):
- Analyze the previous manifests to understand what was generated
- Study the validation error to identify the specific problem
- Make targeted corrections to fix the identified issues
- Preserve parts of the manifests that didn't cause validation errors

### Response Requirements:

1. **Use Solution Context**: Base all decisions on the provided solution data, not assumptions
2. **Valid Manifests**: Generate syntactically correct YAML that passes Kubernetes validation
3. **Complete Configuration**: Include all resources needed for deployment
4. **Production Ready**: Follow Kubernetes best practices for the specific resource types
5. **Error-Free**: If this is a retry, specifically address the validation errors

## Response Format

**CRITICAL**: Return ONLY valid YAML manifests. NO explanations, NO markdown blocks, NO additional text.

Separate multiple resources with `---`.

**RETURN ONLY THE YAML MANIFESTS**