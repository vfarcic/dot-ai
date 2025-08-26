# Kyverno Policy Generation from Policy Intent

## Policy Intent Description
{policy_description}

## Policy Intent Details
- **Rationale**: {policy_rationale}
- **Triggers**: {policy_triggers}
- **Intent ID**: {policy_id}

## Available Resource Schemas
{resource_schemas}

## Namespace Scope Configuration
{namespace_scope}

## Previous Attempt Analysis
{previous_attempt}

## Error Details from Previous Attempt
{error_details}

## Instructions

You are a Kubernetes governance expert specializing in Kyverno policy generation. Generate a comprehensive Kyverno ClusterPolicy YAML from the provided policy intent that enforces the described governance requirement against only the relevant resources from the available schemas.

**RETRY CONTEXT**: If this is a retry attempt (indicated by previous attempt details above), analyze the validation errors carefully and fix the specific issues identified. Common validation failures include:
- Invalid YAML syntax
- Invalid CEL expressions using `request.object` instead of `object`
- References to non-existent fields in resource schemas
- Incorrect resource kind/apiVersion combinations
- Using invalid Kyverno match fields like `apiGroups`, `versions`, or `apiVersions` (use Group/Version/Kind format in kinds array)
- kubectl dry-run server-side validation failures
- CEL compilation errors at runtime due to undefined fields

## 🛡️ KYVERNO POLICY GENERATION PRINCIPLES

**Core Requirements:**
- **Single ClusterPolicy** - Generate one ClusterPolicy with multiple rules if needed to handle different resource schemas
- **CEL Expressions Only** - Use CEL (Common Expression Language) for all validation logic, never JMESPath patterns
- **Intelligent Resource Selection** - Only target resource types where the policy intent logically applies
- **Schema-Accurate Targeting** - Only reference fields that actually exist in the targeted resource schemas
- **Multiple Rules for Different Schemas** - Use separate rules when different resource types have different field structures
- **New Resource Targeting** - Set `background: false` to apply only to new/updated resources
- **Descriptive Naming** - Generate clear, descriptive policy names with policy ID for uniqueness
- **Enforcement Mode** - Use `validationFailureAction: Enforce` to actively prevent policy violations

**Policy Structure Guidelines:**

1. **Metadata Requirements**:
   - **Name**: Generate descriptive slug from policy description (max 63 chars, e.g., `require-container-resource-limits`)
   - **Labels**: Include `policy-intent/id: {policy_id}` for machine lookup
   - **Annotations**: 
     - `policy-intent/description: "{policy_description}"`
     - `policy-intent/rationale: "{policy_rationale}"`

2. **Name Generation Rules**:
   - Convert policy description to lowercase slug format
   - Use hyphens to separate words  
   - Keep it concise but descriptive (e.g., "All containers must have resource limits" → "require-container-resource-limits")
   - Ensure DNS compliance (lowercase alphanumeric + hyphens only)
   - Must be 63 characters or less (Kubernetes naming limit)

3. **Specification Requirements**:
   - Set `background: false` to avoid processing existing resources
   - Use `validationFailureAction: Enforce` to actively block non-compliant resources
   - Include clear failure messages that reference the organizational policy
   - Target only resources where the policy intent makes logical sense

4. **Rule Design for Different Schemas**:
   - **Separate rules** for resources with different field structures
   - **Schema-specific validation** tailored to each resource type's field paths
   - **Consistent governance intent** across all rules in the policy
   - **Clear rule names** that indicate which resource types they target

5. **Namespace Targeting Rules**:
   - If namespace scope is 'Apply to all namespaces': No namespace restrictions needed
   - If namespace scope starts with 'Apply ONLY to these namespaces': Add `match.any` with `resources.namespaces` list
   - If namespace scope starts with 'Apply to all namespaces EXCEPT': Add `exclude.any` with `resources.namespaces` list
   - Always use the exact namespace names provided in the scope configuration
   - Never add namespace restrictions if scope indicates "all namespaces"

## 🎯 MANDATORY PRE-GENERATION SCHEMA ANALYSIS

**CRITICAL**: You MUST perform this systematic analysis BEFORE generating any Kyverno rules. This is NOT optional.

**STEP 1: Policy Requirements Analysis**
First, extract the exact validation requirements from the policy intent:
- What specific field types, values, or patterns must be validated?
- What conditions trigger a policy violation? 
- What constitutes compliance vs non-compliance?

**STEP 2: MANDATORY SCHEMA-BY-SCHEMA ANALYSIS**
**REQUIREMENT**: You MUST analyze EVERY SINGLE provided schema individually. For each schema, you must:

1. **Resource Identification**: Note the resource name, kind, and API version
2. **Field Scanning**: Scan ALL fields in the schema for policy-relevant properties
3. **Relevance Determination**: Does this resource have fields that match the policy requirements?
4. **Field Path Mapping**: For relevant fields, identify the exact field paths
5. **Rule Requirement**: If relevant fields exist, this resource REQUIRES a validation rule

**STEP 3: COMPREHENSIVE COVERAGE VERIFICATION**
Create a mental checklist for EVERY schema provided:
- [ ] Schema analyzed: YES/NO
- [ ] Policy-relevant fields found: YES/NO  
- [ ] If YES: Field paths identified: [list paths]
- [ ] If YES: Validation rule required: YES
- [ ] If NO: Resource can be skipped: YES

**STEP 4: FORCED RULE GENERATION**
**ABSOLUTE REQUIREMENT**: Generate validation rules for EVERY resource that has policy-relevant fields.
- NO EXCEPTIONS: If a resource has relevant fields, it gets a rule
- NO ASSUMPTIONS: Don't assume certain resources are "not important"
- NO SHORTCUTS: Don't skip resources because they're custom or unfamiliar
- FIELD-BASED DECISIONS ONLY: Base inclusion solely on presence of relevant fields

**VALIDATION CHECK**: Before finalizing the policy, verify that you have generated rules for ALL resources with policy-relevant fields. If any resource with relevant fields lacks a rule, the policy is INCOMPLETE and INVALID.

## 🔍 EXPLICIT RESOURCE ANALYSIS REQUIREMENT

**MANDATORY SCHEMA ACCOUNTING**: Before generating the policy, you MUST explicitly account for EVERY schema provided. Include this analysis as YAML comments at the top of the generated policy.

**For EVERY schema in the "Available Resource Schemas" section above:**
Include a concise comment line in format: `ResourceName: HAS field.path → MUST generate rule` or `ResourceName: NO relevant fields → Can skip`

**CRITICAL EXAMPLES** (adapt to your actual policy):
- If analyzing a resource with `spec.image` field → MUST generate rule
- If analyzing a resource with `spec.containers[].image` field → MUST generate rule  
- If analyzing a resource with `spec.template.spec.containers[].image` field → MUST generate rule
- If analyzing a resource with only networking fields → Can skip (for non-networking policies)

**FAILURE TO ANALYZE = INVALID POLICY**: If you generate a policy without systematically considering every schema, the policy is incomplete and violates the requirements.

**OUTPUT FORMAT**: Include your systematic schema analysis as YAML comments at the beginning of the policy file, followed by the clean YAML manifest.

## 📋 SCHEMA-DRIVEN CEL EXPRESSIONS

**Resource Schema Analysis:**
- Examine each resource schema to understand field structure differences
- Use exact field paths as documented in each schema
- Handle nested objects and arrays correctly for each resource type
- Account for optional vs required fields per schema

**CEL Expression Patterns:**
- **Field Existence**: `has(object.spec.fieldName)`
- **Array Validation**: `object.spec.containers.all(c, condition)`
- **String Patterns**: `object.metadata.name.matches('^[a-z][a-z0-9-]*$')`
- **Resource Type Checking**: `request.kind.kind == 'Deployment'` (if needed in combined rules)
- **Complex Logic**: Combine conditions with `&&`, `||`, `!`
- **Previous Object (Updates)**: `oldObject.spec.fieldName` for comparing old vs new values

**CRITICAL CEL SYNTAX RULES:**
- ✅ **CORRECT**: `object.spec.containers` - Use `object` to reference the resource being validated
- ❌ **WRONG**: `request.object.spec.containers` - Do NOT use `request.object` prefix  
- ✅ **CORRECT**: `has(object.metadata.labels['app'])`
- ❌ **WRONG**: `has(request.object.metadata.labels['app'])`

**KYVERNO MATCH SCHEMA RULES:**
```yaml
# ✅ CORRECT Kyverno match syntax:
match:
  any:
  - resources:
      kinds:
      - Pod                        # Standard Kubernetes resource
      - apps/v1/Deployment        # Group/Version/Kind format for apps group
      operations:
      - CREATE
      - UPDATE
      
# ✅ For custom resources use Group/Version/Kind format:
match:
  any:
  - resources:
      kinds:
      - example.com/v1/CustomResource
      - example.com/v1beta1/CustomResource
      operations:
      - CREATE
      - UPDATE

# ❌ WRONG - Do NOT use 'apiGroups' or 'versions' fields:
# apiGroups: [example.com]    # This field does not exist!
# versions: [v1, v1beta1]     # This field does not exist!
# apiVersions: [example.com/v1]  # This field does not exist!
```

## ✅ RESOURCE COVERAGE VALIDATION

**Before finalizing the policy, verify complete coverage:**

1. **Schema Analysis Completeness**: Every provided resource schema has been analyzed for policy-relevant fields
2. **Rule Generation Coverage**: Every resource with policy-relevant fields has corresponding validation rules  
3. **Field Path Accuracy**: All CEL expressions reference fields that actually exist in the target resource schemas
4. **Validation Logic Correctness**: CEL expressions properly implement the governance rule for each resource's field structure
5. **Message Clarity**: Error messages clearly explain the policy violation and reference the organizational requirement

## 🧠 CUSTOM RESOURCE FIELD ANALYSIS

**CRITICAL**: Custom resources often have different field structures than standard Kubernetes resources. Pay special attention to:

**Image-Related Field Patterns:**
- **Standard Pattern**: `spec.containers[].image` (includes tag like `nginx:1.21`)
- **Separated Fields**: `spec.image` + `spec.tag` (image and tag in separate fields)
- **Template Pattern**: `spec.template.spec.containers[].image` (for controller resources)

**Field Analysis Rules:**
1. **Look for both `image` and `tag` fields separately** - Some custom resources separate these
2. **Check field descriptions** - Understand what each field represents
3. **Generate appropriate validation** - For separate tag fields, check the tag field directly
4. **Handle both patterns** - Some resources may have both patterns

**Example Custom Resource Pattern:**
```yaml
# If custom resource has:
spec:
  image: nginx
  tag: latest

# Then validate:
expression: >-
  has(object.spec.tag) && object.spec.tag != '' ?
  object.spec.tag != 'latest'
  : true
```

## 🚀 OUTPUT REQUIREMENTS

Generate a complete, valid Kyverno ClusterPolicy YAML that:

1. **Uses Clean YAML Format** - Raw YAML with analysis as YAML comments, no markdown formatting
2. **Uses Descriptive Naming** - Generate clear policy name from description + policy_id
3. **Includes Machine-Readable Metadata** - Add policy-intent/id label for lookup
4. **Enforces the Policy Intent** - Addresses the specific governance requirement described
4. **Uses Multiple Rules Appropriately** - Creates separate rules for different resource schemas when needed
5. **Targets Relevant Resources Only** - Includes only resource types where the policy logically applies
6. **Uses Only CEL Expressions** - All validation logic must use CEL syntax exclusively
7. **References Existing Fields** - Only uses fields that exist in the targeted resource schemas
8. **Uses Enforcement Mode** - Set `validationFailureAction: Enforce` to actively block violations
9. **New Resources Only** - Set `background: false` to target only new/updated resources
10. **Provides Clear Feedback** - Descriptive error messages explaining the policy violation

**CRITICAL ANALYSIS REQUIRED**:
- **Generate appropriate policy name** - Create concise, descriptive slug from policy description
- **Read the policy intent carefully** - Understand what governance rule needs enforcement
- **Analyze available schemas** - Identify field structure differences across resource types
- **Design appropriate rules** - Create separate rules when schemas require different validation approaches
- **Validate field paths** - Ensure all referenced fields exist in the target resource schemas

## 📋 NAMESPACE TARGETING EXAMPLES

**For "Apply ONLY to these namespaces: production, staging":**
```yaml
spec:
  rules:
  - name: rule-name
    match:
      any:
      - resources:
          kinds: [Deployment]
          namespaces:
          - production
          - staging
```

**For "Apply to all namespaces EXCEPT: kube-system, kube-public":**
```yaml
spec:
  rules:
  - name: rule-name
    match:
      any:
      - resources:
          kinds: [Deployment]
    exclude:
      any:
      - resources:
          namespaces:
          - kube-system
          - kube-public
```

**For "Apply to all namespaces (no restrictions)":**
```yaml
spec:
  rules:
  - name: rule-name
    match:
      any:
      - resources:
          kinds: [Deployment]
    # No namespace restrictions - applies cluster-wide
```

**IMPORTANT**: Return only the YAML content with your mandatory schema analysis as concise YAML comments at the top, followed by the clean Kyverno policy manifest. The final policy YAML should be production-ready for `kubectl apply --dry-run=server` validation.

**CRITICAL OUTPUT FORMAT REQUIREMENTS**:

- **NO MARKDOWN FORMATTING**: Do not wrap the YAML in markdown code blocks (no ```yaml or ```)
- **NO PROSE EXPLANATION**: Do not include any explanatory text before or after the YAML
- **RAW YAML ONLY**: Return only the YAML content with analysis comments inside as YAML comments
- **KUBECTL READY**: The output must be directly usable with kubectl apply

**OUTPUT FORMAT EXAMPLE**:
# MANDATORY SCHEMA-BY-SCHEMA ANALYSIS
#
# StatefulSet: HAS spec.template.spec.containers[].image → MUST generate rule  
# Pod: HAS spec.containers[].image → MUST generate rule
# ConfigMap: NO relevant fields → Can skip
#
# RESOURCES REQUIRING VALIDATION RULES: StatefulSet, Pod
#
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: policy-name
# ... rest of policy