# Solution Enhancement

## Current Solution
{current_solution}

## Detailed Resource Schemas
{detailed_schemas}

## Analysis Result
{analysis_result}

## User Response
{open_response}

## Instructions

You MUST analyze the user's response and enhance the current solution by completing missing question answers and/or generating new questions for additional resource capabilities. This is a two-part enhancement process.

**CRITICAL: Do NOT modify description, analysis, or reasons unless absolutely necessary. Enhancement means completing configuration and adding capabilities, not re-evaluating the solution.**

### PART 1: Complete Missing Question Answers (PRIMARY TASK)
Examine the current solution's questions for any that are missing answers:
- Look through "required", "basic", and "advanced" question arrays
- Find questions where "answer" field is missing, null, or empty
- Each existing question has a "resourceMapping" showing where the answer goes in the resource spec
- If the user's response relates to these missing answers, provide appropriate values
- Use EXACT "id" values from those questions as questionId in your response

### PART 2: Generate New Questions for Additional Capabilities (SECONDARY TASK)
If the Analysis Result indicates new resources are needed (approach: "add_resources"):
- **CRITICAL**: Use ONLY the schemas provided in "Detailed Resource Schemas" section
- **VALIDATE**: Only generate questions for fields that actually exist in the detailed schemas
- **DO NOT INVENT**: Never create resourceMapping paths that don't exist in the provided schemas
- Generate new questions with proper resourceMapping for the identified capabilities
- Immediately provide answers based on the user's intent
- Ensure new questions follow the same structure as existing questions
- Categories: "required" (essential), "basic" (common), "advanced" (optional)

**Schema Validation Process:**
1. Find the resource in "Detailed Resource Schemas" section
2. Check the schema.properties structure for actual field paths
3. Only use fields that exist in the schema.properties
4. If desired capability doesn't exist in the schemas, DO NOT generate invalid questions

### STEP-BY-STEP Enhancement Process:

1. **Analyze User Request**: What is the user asking for?
2. **Check Existing Questions**: Can any missing answers fulfill this request?
3. **Check Resource Capabilities**: Does the resource support additional capabilities for this request?
4. **Generate Response**: Provide missingAnswers and/or newQuestions

### Understanding Resource Capabilities
- **CRITICALLY IMPORTANT**: Review EXACT field structure in Available Resources schemas
- Only use resourceMapping paths that exist in the actual schema definition
- Do NOT add new resources if existing ones already handle the requirement
- Example: AppClaim already has scaling.enabled/min/max - don't add HorizontalPodAutoscaler
- Focus on completing configuration within existing resource schemas
- **NEVER INVENT field paths** - if a field doesn't exist in the schema, the capability isn't supported

## Response Format Templates (MANDATORY)

### For Successful Enhancement:
```json
{
  "missingAnswers": [
    {
      "questionId": "[EXACT_ID_FROM_CURRENT_SOLUTION]",
      "suggestedValue": "[VALUE_MATCHING_USER_REQUEST]",
      "reason": "[EXPLANATION_OF_VALUE_CHOICE]"
    }
  ],
  "newQuestions": [
    {
      "id": "[NEW_UNIQUE_ID]",
      "question": "[QUESTION_TEXT]",
      "type": "[text|select|boolean|number]",
      "category": "[required|basic|advanced]",
      "placeholder": "[PLACEHOLDER_TEXT]",
      "validation": {
        "required": true,
        "min": 1
      },
      "resourceMapping": {
        "resourceKind": "[RESOURCE_KIND_FROM_DETAILED_SCHEMAS]",
        "apiVersion": "[API_VERSION_FROM_DETAILED_SCHEMAS]",
        "fieldPath": "[FIELD_PATH_FROM_SCHEMA_PROPERTIES]"
      },
      "answer": "[IMMEDIATE_ANSWER_BASED_ON_USER_REQUEST]"
    }
  ],
  "additionalResources": [
    {
      "kind": "[RESOURCE_KIND_FROM_ANALYSIS_RESULT]",
      "apiVersion": "[API_VERSION_FROM_DETAILED_SCHEMAS]",
      "group": "[GROUP_FROM_DETAILED_SCHEMAS]",
      "description": "[RESOURCE_DESCRIPTION]"
    }
  ]
}
```

### For Capability Gap:
```json
{
  "error": "CAPABILITY_GAP",
  "message": "[EXPLANATION_OF_WHY_CURRENT_SOLUTION_CANNOT_HANDLE_REQUEST]",
  "missingCapability": "[WHAT_USER_REQUESTED_THAT_CANNOT_BE_DONE]",
  "currentSolution": "[BRIEF_DESCRIPTION_OF_CURRENT_RESOURCES]",
  "suggestedAction": "[ADVICE_TO_START_OVER_WITH_DIFFERENT_INTENT]"
}
```

## Enhancement Examples:

### Example 1: Completing Missing Answers
**User**: "I need it to handle 10x traffic"
**Current**: AppClaim with enable-scaling: true, but min-replicas and max-replicas empty
**Response**: Complete min-replicas: 2, max-replicas: 20

### Example 2: Adding New Questions (VALID)
**User**: "I need persistent storage for user uploads"
**Current**: AppClaim with basic questions, no storage questions
**Available Resources Schema**: AppClaim supports spec.storage.enabled, spec.storage.size
**Response**: Generate storage questions for existing fields and answer them immediately

### Example 2b: Schema Validation (INVALID - DON'T DO THIS)
**User**: "I need CPU-based scaling"
**Current**: AppClaim with basic scaling questions
**Available Resources Schema**: AppClaim has spec.scaling.enabled/min/max but NO spec.scaling.cpuTarget
**Response**: Complete existing scaling questions only - do NOT generate cpuTarget question with invalid field path

### Example 3: Capability Gap
**User**: "I need a database"
**Current**: Simple Deployment solution
**Problem**: Deployment doesn't include database capabilities
**Response**: Return capability gap error, suggest new recommendation

## Critical Requirements:
1. **RESPOND ONLY WITH JSON** - No explanations, no text, only the JSON object
2. **ALWAYS check for missing answers first** - this is the primary enhancement mechanism
3. **Use exact questionId values** from existing questions
4. **VALIDATE ALL NEW QUESTIONS** - Only generate questions for fields that exist in Available Resources schemas
5. **NEVER INVENT resourceMapping paths** - If field doesn't exist in schema, don't create the question
6. **Generate new questions only when existing ones can't fulfill the request**
7. **Immediately answer all new questions** - never leave new questions blank
8. **Base values on user's specific requirements** (e.g., "10x traffic" → max replicas ~20)
9. **Preserve original solution content** (description, analysis, reasons)

**YOU MUST RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT**