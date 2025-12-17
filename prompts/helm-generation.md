# Helm Values Generation

## Solution Configuration
{{{solution}}}

## Chart Values Structure
The following is the chart's default values.yaml that defines available configuration options:
{{{chart_values}}}

## Previous Attempt (if retry)
{{{previous_attempt}}}

## Validation Error Details (if retry)
{{{error_details}}}

## Instructions

Generate a values.yaml file for Helm chart installation based on the user's configuration answers. The solution contains the chart information, user intent, and all answered questions.

### Core Strategy:

1. **Identify CLI Arguments vs Values**:
   - `name` answer → Helm release name (CLI argument, NOT a value)
   - `namespace` answer → --namespace flag (CLI argument, NOT a value)
   - All other answers → values.yaml content

2. **Map Answers to Values Structure**:
   - Use the chart's values.yaml structure above as your guide
   - Match answer semantics to the appropriate value paths
   - Common mappings:
     * "replicas" → `replicaCount`
     * "enable ingress" → `ingress.enabled`
     * "ingress class" → `ingress.className` or `ingress.ingressClassName`
     * "service type" → `service.type`
     * "storage size" → `persistence.size`
   - Use the actual field names from the chart's values.yaml, not generic assumptions

3. **Handle Value Types Correctly**:
   - Booleans: `true` or `false` (not strings "true"/"false")
   - Numbers: numeric values without quotes
   - Strings: use quotes only when necessary (values with special chars)
   - Arrays/Lists: proper YAML list format
   - Nested objects: proper YAML indentation

4. **Include Only Values That Differ From Defaults**:
   - Compare each user answer to the chart's default values above
   - Only include values that DIFFER from the chart's defaults
   - If user's answer matches the default value, do NOT include it in values.yaml
   - Do NOT include `name` or `namespace` in the values (they're CLI args)
   - This keeps the values file minimal and intentional - only showing what's changed

5. **Process Open Requirements**:
   - If the user provided open-ended requirements, translate them to appropriate values
   - Reference the chart's values.yaml to find relevant configuration options

### For Retry Attempts:
If this is a retry (previous attempt and error details provided above):
- Analyze the previous values.yaml to understand what was generated
- Study the Helm error to identify the specific problem
- Common issues:
  * Invalid value type (string vs boolean vs number)
  * Non-existent value path in the chart
  * Invalid YAML syntax
  * Template rendering errors from invalid combinations
- Make targeted corrections to fix the identified issues

### Response Requirements:

1. **Valid YAML**: Generate syntactically correct YAML
2. **Correct Structure**: Match the chart's expected values.yaml structure exactly
3. **Proper Types**: Use correct data types for each value
4. **Exclude CLI Args**: Do NOT include `name` or `namespace` - they are handled separately

## Response Format

**CRITICAL**: Return ONLY valid YAML content. NO explanations, NO markdown code blocks, NO additional text.

If no values need to be overridden (user accepted all defaults for non-CLI options), return:
```
# Default values - no overrides needed
```

Otherwise, return only the YAML values content.

**RETURN ONLY THE YAML VALUES**
